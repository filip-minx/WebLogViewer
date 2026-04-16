# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

WebLogAnalyzer - Browser-based log package analyzer for Windows application logs. All processing happens client-side with no backend upload.

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **UI Components**: TanStack Table (virtualized table), TanStack Virtual (row virtualization)
- **ZIP Processing**: fflate (client-side ZIP decompression)
- **Storage**: IndexedDB (caching parsed data, filter state)
- **Workers**: Web Workers (ZIP extraction, parsing, filtering)

## Development Commands

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Type checking
npm run type-check
```

## Architecture Overview

### Three-Layer Design

1. **UI Layer**
   - ZIP file picker
   - Folder/file tree view (left pane)
   - Virtualized log table (center pane)
   - Filter/search panel (right/top pane)
   - Row details panel

2. **Processing Layer** (Web Workers)
   - ZIP entry discovery and extraction
   - Parser detection from file samples
   - Incremental parsing with multiline support
   - Query/filter execution

3. **Storage Layer** (IndexedDB)
   - Parsed file metadata cache
   - Row batches
   - Filter state persistence

### Project Structure

```
/src
  /app              - Main application setup
  /components       - React components (FileTree, LogTable, FilterPanel, RowDetails)
  /workers          - Web Workers (zipWorker, parseWorker, queryWorker)
  /parsers          - Parser plugins (base, pipeWindowsParser, jsonLinesParser, etc.)
  /storage          - IndexedDB integration
  /models           - TypeScript types (ParsedLogEntry, ZipEntry, FilterModel)
  /services         - Business logic (zipService, parseService, queryService)
```

## Key Data Models

### ParsedLogEntry
```ts
type ParsedLogEntry = {
  rowId: string;
  lineNumber: number;
  raw: string;
  timestamp?: string;
  level?: string;
  source?: string;
  message?: string;
  fields: Record<string, string | number | boolean | null>;
};
```

### LogParser Interface
```ts
interface LogParser {
  id: string;
  name: string;
  detect(sampleLines: string[], fileName: string): number;
  parseEntries(input: AsyncIterable<string>): AsyncIterable<ParsedLogEntry>;
  columns(): ColumnDef[];
}
```

## Parser Plugins

Parser system is plugin-based to support multiple log formats:

1. **Pipe-separated Windows parser** - Primary format: `2026-03-20_13-11-24.795|ERROR|Source|Message`
   - Regex: `^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.\d{3})\|([A-Z]+)\|([^|]+)\|(.*)$`
   - Multiline detection: Lines starting with timestamp pattern begin new entries

2. **JSON lines parser** - One JSON object per line
3. **Generic delimiter parser** - CSV/TSV/pipe-separated
4. **Plain text fallback** - Raw text view when no parser matches

### Multiline Support

Parsers must handle continuation lines (e.g., stack traces). Lines that don't match the entry start pattern are appended to the previous entry's `raw` and `message` fields.

## Processing Strategy

- **Lazy loading**: Don't extract full ZIP eagerly. Show structure immediately, extract/parse on demand.
- **Incremental parsing**: Parse in chunks, emit row batches to avoid blocking.
- **Worker-based**: Offload ZIP extraction, parsing, and filtering to Web Workers.
- **Virtualized rendering**: Only render visible rows in the table.
- **Local caching**: Use IndexedDB to persist parsed data across sessions.

## Security & Safety

- **Client-side only**: No log data sent to server
- **XSS protection**: Safe rendering of log content, strict CSP
- **Archive limits**: Max entry count, max per-file size, max total extracted size
- **Malformed data**: Parsers must not crash on bad input, fall back to raw mode

## Filter System

Filter controls are dynamically generated from parser-provided column metadata:

- **timestamp** → date range picker
- **level** → multi-select (ERROR, WARN, INFO, etc.)
- **source** → text contains/equals
- **message** → text/regex filter
- **Global search** → searches across all fields

## Development Phases

**Phase 1 (MVP)**:
- ZIP selection and tree display
- Single file parser detection and parsing
- Virtualized table rendering
- Column-based filtering + global search
- Raw text fallback

**Phase 2 (Scalability)**:
- IndexedDB caching
- Background query workers
- Parse cancellation
- More parser plugins

**Phase 3 (Advanced)**:
- Cross-file search
- Export results
- Timeline views
- Correlation across files

## Testing

Always test the **Electron build**, not the Vite dev server. Use Playwright with CDP.

```bash
# Install Playwright (once)
python -m pip install playwright
playwright install chromium

# Build before every test run
npm run build:electron
```

### Launch pattern

```python
import subprocess, time, socket, tempfile, os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT         = Path(__file__).parent  # repo root
ELECTRON_EXE = ROOT / "node_modules/electron/dist/electron.exe"
MAIN_JS      = ROOT / "dist-electron/main.js"
DEBUG_PORT   = 9333

# Kill any lingering Electron first
subprocess.run("taskkill /F /IM electron.exe /T", shell=True, capture_output=True)
time.sleep(1)

user_data = tempfile.mkdtemp()  # isolated profile — required
proc = subprocess.Popen([
    str(ELECTRON_EXE),
    f"--remote-debugging-port={DEBUG_PORT}",
    "--remote-allow-origins=*",
    f"--user-data-dir={user_data}",
    str(MAIN_JS),
    # optional: "/path/to/file.log"  ← auto-opens via open-file IPC
], cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# Wait for CDP port
deadline = time.time() + 20
while time.time() < deadline:
    try:
        with socket.create_connection(("127.0.0.1", DEBUG_PORT), timeout=1): break
    except OSError: time.sleep(0.3)
time.sleep(2)

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(f"http://127.0.0.1:{DEBUG_PORT}")
    page = next(pg for ctx in browser.contexts for pg in ctx.pages if pg.url.startswith("file://"))
    page.wait_for_load_state("domcontentloaded")
    # ... test logic ...
    browser.close()

proc.terminate()
```

### Gotchas

- **Kill lingering processes before launch** — stale Electron holds the debug port; new launch connects to the old process instead
- **Wait for port release after kill** — poll until port is closed before launching next instance
- **`--user-data-dir` is required** — without it tests share the real app profile and pollute each other
- **`PYTHONIOENCODING=utf-8`** — set when running via PowerShell to avoid cp1252 errors on emoji in workspace text
- **`playwright.electron` doesn't exist in Python** — use CDP approach above
- **Python command is `python`** (not `python3`); pip is `python -m pip`

### Selectors

- Workspace items: `.workspace-item` (filter with `has_text=`)
- Log table rows: `[role='row']` (subtract 1 for header), fallback `tr`
- Add workspace button: `.workspace-add-btn`

### Sample log file (pipe-separated, matches pipeWindowsParser)

```
2026-04-16_10-00-00.000|INFO|TestSource|Application started
2026-04-16_10-00-01.123|ERROR|TestSource|Failed to connect
2026-04-16_10-00-02.456|WARN|NetworkModule|Retrying connection
2026-04-16_10-00-03.789|INFO|TestSource|Connection established
```

Full test suite: `test_electron_persistence.py`

## Key Principles

- Client-side only processing (no backend uploads)
- Parser plugin architecture with dynamic schemas
- Multiline-aware parsing for stack traces
- Worker-based processing to keep UI responsive
- Safe fallback behavior for unknown formats
- Privacy-first design
