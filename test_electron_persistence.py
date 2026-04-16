"""
Test workspace persistence across Electron app restarts.

Uses --user-data-dir to isolate test state from the real app profile.
Launches Electron with the log file as a CLI argument (triggers open-file IPC).

Tests:
1. Launch with file arg → file opens, metadata saved to localStorage immediately
2. Relaunch without args (same user-data-dir) → workspace still listed
3. Click the stale workspace → rows reload
4. File missing + relaunch + click workspace → no unhandled crash
"""

import os, subprocess, time, socket, json, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT         = Path(__file__).parent
ELECTRON_EXE = ROOT / "node_modules/electron/dist/electron.exe"
MAIN_JS      = ROOT / "dist-electron/main.js"
LOG_FILE     = Path(tempfile.gettempdir()) / "test_weblog.log"
DEBUG_PORT   = 9333

PASS = "[PASS]"
FAIL = "[FAIL]"
SKIP = "[SKIP]"

def make_log_file():
    with open(LOG_FILE, "w") as f:
        f.write("2026-04-16_10-00-00.000|INFO|TestSource|Application started\n")
        f.write("2026-04-16_10-00-01.123|ERROR|TestSource|Failed to connect\n")
        f.write("2026-04-16_10-00-02.456|WARN|NetworkModule|Retrying connection\n")
        f.write("2026-04-16_10-00-03.789|INFO|TestSource|Connection established\n")

def wait_for_port(port, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1): return True
        except OSError: time.sleep(0.3)
    return False

def launch_electron(user_data_dir, extra_args=None):
    args = [
        str(ELECTRON_EXE),
        f"--remote-debugging-port={DEBUG_PORT}",
        "--remote-allow-origins=*",
        f"--user-data-dir={user_data_dir}",
        str(MAIN_JS),
    ]
    if extra_args:
        args += [str(a) for a in extra_args]
    proc = subprocess.Popen(args, cwd=str(ROOT),
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if not wait_for_port(DEBUG_PORT, 25):
        proc.terminate()
        raise RuntimeError("CDP port never opened")
    time.sleep(2)
    return proc

def connect(playwright):
    browser = playwright.chromium.connect_over_cdp(f"http://127.0.0.1:{DEBUG_PORT}")
    for ctx in browser.contexts:
        for pg in ctx.pages:
            if pg.url.startswith("file://"):
                pg.wait_for_load_state("domcontentloaded")
                pg.wait_for_timeout(1500)
                return browser, pg
    pg = browser.contexts[0].pages[0]
    pg.wait_for_load_state("domcontentloaded")
    pg.wait_for_timeout(1500)
    return browser, pg

def kill(proc):
    proc.terminate()
    try: proc.wait(timeout=5)
    except subprocess.TimeoutExpired: proc.kill()
    # Wait for the debug port to be fully released
    deadline = time.time() + 8
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", DEBUG_PORT), timeout=0.5):
                time.sleep(0.3)
        except OSError:
            break

def ls_workspaces(page):
    raw = page.evaluate("() => localStorage.getItem('weblog-workspaces')")
    return json.loads(raw) if raw else None

def count_rows(page):
    page.wait_for_timeout(2000)
    rows = page.locator("[role='row']").all()
    if len(rows) <= 1:
        rows = page.locator("tr").all()
    return max(0, len(rows) - 1)

def workspace_item(page, name_fragment):
    loc = page.locator(".workspace-item").filter(has_text=name_fragment).first
    if loc.count() > 0:
        return loc
    return None

# ── Build ─────────────────────────────────────────────────────────────────────
print("\n=== Phase 0: Build ===")
r = subprocess.run("npm run build:electron", cwd=str(ROOT),
                   capture_output=True, text=True, shell=True)
if r.returncode != 0:
    print(f"{FAIL} Build failed:\n{r.stderr[-2000:]}")
    exit(1)
print(f"{PASS} Build succeeded")

make_log_file()
print(f"[setup] Log file: {LOG_FILE}")

# Kill any leftover Electron processes from previous test runs
subprocess.run("taskkill /F /IM electron.exe /T", shell=True,
               capture_output=True)  # ignore errors if none running
time.sleep(1)

# Isolated user-data-dir so test doesn't pollute (or read) the real app profile
user_data = tempfile.mkdtemp(prefix="weblog_test_")
print(f"[setup] User data dir: {user_data}")

results = []

with sync_playwright() as p:

    # ── Phase 1: Launch with file arg ─────────────────────────────────────────
    print("\n=== Phase 1: Launch with file arg, verify open + immediate persistence ===")

    proc1 = launch_electron(user_data, extra_args=[LOG_FILE])
    try:
        browser1, page1 = connect(p)
        page_errors = []
        page1.on("pageerror", lambda e: page_errors.append(str(e)))

        page1.wait_for_timeout(3000)
        page1.screenshot(path=str(Path(tempfile.gettempdir()) / "e01_after_open.png"))

        # Check workspace opened and rows rendered
        rows = count_rows(page1)
        ok = rows >= 4
        print(f"{PASS if ok else FAIL} Rows after CLI open: {rows} (expected >=4)")
        results.append(("Log rows rendered on CLI open", ok))

        # Check localStorage saved immediately
        storage = ls_workspaces(page1)
        print(f"[check] localStorage: {json.dumps(storage, indent=2) if storage else 'empty'}")
        saved = isinstance(storage, list) and any(
            "test_weblog" in str(w.get("name","")) or "test_weblog" in str(w.get("nativePath",""))
            for w in storage
        )
        print(f"{PASS if saved else FAIL} Workspace saved to localStorage immediately")
        results.append(("Immediate localStorage save", saved))

        if page_errors:
            print(f"  [!] Page errors: {page_errors}")

        browser1.close()
    finally:
        kill(proc1)

    # ── Phase 2: Relaunch without args ────────────────────────────────────────
    print("\n=== Phase 2: Relaunch (no file arg), verify workspace persisted ===")

    proc2 = launch_electron(user_data)   # same user_data dir, no file arg
    try:
        browser2, page2 = connect(p)
        page2.wait_for_timeout(1000)
        page2.screenshot(path=str(Path(tempfile.gettempdir()) / "e02_after_restart.png"))

        storage2 = ls_workspaces(page2)
        print(f"[check] localStorage: {json.dumps(storage2, indent=2) if storage2 else 'empty'}")

        survived = isinstance(storage2, list) and any(
            "test_weblog" in str(w.get("name","")) or "test_weblog" in str(w.get("nativePath",""))
            for w in storage2
        )
        print(f"{PASS if survived else FAIL} Workspace survived restart")
        results.append(("Workspace survives restart", survived))

        ws = workspace_item(page2, "test_weblog")
        print(f"{PASS if ws else FAIL} Workspace visible in sidebar")
        results.append(("Workspace visible in UI after restart", bool(ws)))

        # ── Phase 3: Click stale workspace ────────────────────────────────────
        print("\n=== Phase 3: Click stale workspace, expect rows ===")

        if ws:
            ws.click()
            page2.wait_for_timeout(3000)
            page2.screenshot(path=str(Path(tempfile.gettempdir()) / "e03_stale_clicked.png"))

            rows2 = count_rows(page2)
            ok = rows2 >= 4
            print(f"{PASS if ok else FAIL} Stale reload: {rows2} rows (expected >=4)")
            results.append(("Stale workspace reloads", ok))
        else:
            print(f"{SKIP} Workspace item not found - skip stale reload test")
            results.append(("Stale workspace reloads", None))

        browser2.close()
    finally:
        kill(proc2)

    # ── Phase 4: File missing → no crash ─────────────────────────────────────
    print("\n=== Phase 4: Delete file, relaunch, click workspace → no crash ===")

    bak = Path(str(LOG_FILE) + ".bak")
    os.rename(LOG_FILE, bak)
    proc3 = launch_electron(user_data)
    try:
        browser3, page3 = connect(p)
        crash_errors = []
        page3.on("pageerror", lambda e: crash_errors.append(str(e)))
        page3.wait_for_timeout(1000)

        ws3 = workspace_item(page3, "test_weblog")
        if ws3:
            ws3.click()
            page3.wait_for_timeout(3000)
            page3.screenshot(path=str(Path(tempfile.gettempdir()) / "e04_missing_file.png"))

            crashed = any("NotFoundError" in e for e in crash_errors)
            print(f"{PASS if not crashed else FAIL} No unhandled NotFoundError (errors={crash_errors})")
            results.append(("No crash on missing file", not crashed))
        else:
            print(f"{SKIP} Workspace item not visible — skip")
            results.append(("No crash on missing file", None))

        browser3.close()
    finally:
        kill(proc3)
        os.rename(bak, LOG_FILE)

# ── Cleanup ───────────────────────────────────────────────────────────────────
shutil.rmtree(user_data, ignore_errors=True)

# ── Summary ───────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("TEST SUMMARY")
print("=" * 60)
for name, ok in results:
    sym = PASS if ok is True else (FAIL if ok is False else SKIP)
    print(f"  {sym}  {name}")
passed = sum(1 for _, ok in results if ok is True)
failed = sum(1 for _, ok in results if ok is False)
print(f"\n{passed}/{len(results)} passed, {failed} failed")
print(f"Screenshots: {tempfile.gettempdir()}/e01..e04_*.png")
