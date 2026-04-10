import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { readFile, readdir, stat } from 'fs/promises'
import { writeFileSync, unlinkSync } from 'fs'
import type { Dirent } from 'fs'
import { join, basename, relative } from 'path'
import { execSync, spawn, exec } from 'child_process'

// Detect admin status before app.whenReady() so we can disable the Chromium sandbox,
// which is incompatible with elevated processes on Windows (causes immediate renderer crash).
let isAdminCached = false
if (process.platform === 'win32') {
  try {
    execSync('net session', { stdio: 'pipe', timeout: 2000 })
    isAdminCached = true
    app.commandLine.appendSwitch('no-sandbox')
  } catch {
    isAdminCached = false
  }
}

// Windows UIPI blocks drag-and-drop from lower-integrity processes (e.g. Explorer) to elevated
// windows. ChangeWindowMessageFilterEx allows the three relevant messages through.
function allowDragDropFromLowerIntegrity(win: BrowserWindow): void {
  let scriptPath: string | null = null
  try {
    const hwnd = win.getNativeWindowHandle()
    const hwndNum = hwnd.readBigUInt64LE(0).toString()
    const script = [
      "Add-Type -TypeDefinition @'",
      'using System;',
      'using System.Runtime.InteropServices;',
      'public class WinAPI {',
      '    [DllImport("user32.dll")]',
      '    public static extern bool ChangeWindowMessageFilterEx(IntPtr hwnd, uint msg, uint action, IntPtr changeInfo);',
      '}',
      "'@",
      `$h = [IntPtr]::new(${hwndNum})`,
      '[WinAPI]::ChangeWindowMessageFilterEx($h, 0x0233, 1, [IntPtr]::Zero) | Out-Null',  // WM_DROPFILES
      '[WinAPI]::ChangeWindowMessageFilterEx($h, 0x004A, 1, [IntPtr]::Zero) | Out-Null',  // WM_COPYDATA
      '[WinAPI]::ChangeWindowMessageFilterEx($h, 0x0049, 1, [IntPtr]::Zero) | Out-Null',  // WM_COPYGLOBALDATA
    ].join('\r\n')

    scriptPath = join(app.getPath('temp'), `wla-drop-${Date.now()}.ps1`)
    writeFileSync(scriptPath, script, 'utf8')
    const captured = scriptPath
    exec(
      `powershell.exe -NonInteractive -ExecutionPolicy Bypass -File "${captured}"`,
      { timeout: 10000 },
      (err) => {
        try { unlinkSync(captured) } catch {}
        if (err) console.error('[main] allowDragDropFromLowerIntegrity failed:', err)
      }
    )
  } catch (err) {
    if (scriptPath) try { unlinkSync(scriptPath) } catch {}
    console.error('[main] Failed to set up drag-drop filter:', err)
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.loadFile(join(__dirname, '..', 'dist', 'index.html'))

  if (isAdminCached && process.platform === 'win32') {
    allowDragDropFromLowerIntegrity(win)
  }
}

async function walkDirectory(
  dir: string,
  base: string
): Promise<Array<{ path: string; size: number; isDirectory: boolean }>> {
  let entries: Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []  // skip inaccessible directories silently
  }
  const results: Array<{ path: string; size: number; isDirectory: boolean }> = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    const relPath = relative(base, fullPath).replace(/\\/g, '/')
    if (entry.isDirectory()) {
      results.push({ path: relPath, size: 0, isDirectory: true })
      if (!entry.isSymbolicLink()) {
        const children = await walkDirectory(fullPath, base)
        results.push(...children)
      }
    } else {
      const info = await stat(fullPath)
      results.push({ path: relPath, size: info.size, isDirectory: false })
    }
  }
  return results
}

function registerIpcHandlers(): void {
  ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Log files and archives', extensions: ['zip', 'log', 'txt', 'json', 'jsonl', 'ndjson'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    if (canceled || filePaths.length === 0) return null
    const filePath = filePaths[0]
    const buf = await readFile(filePath)
    return {
      path: filePath,
      name: basename(filePath),
      buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    }
  })

  ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    })
    if (canceled || filePaths.length === 0) return null
    return { path: filePaths[0], name: basename(filePaths[0]) }
  })

  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    const MAX_SIZE = 50 * 1024 * 1024
    const info = await stat(filePath)
    if (info.size > MAX_SIZE) {
      throw new Error(`File "${basename(filePath)}" is too large (${(info.size / 1024 / 1024).toFixed(1)} MB)`)
    }
    return readFile(filePath, 'utf-8')
  })

  ipcMain.handle('fs:readFileBinary', async (_event, filePath: string) => {
    const MAX_SIZE = 50 * 1024 * 1024
    const info = await stat(filePath)
    if (info.size > MAX_SIZE) {
      throw new Error(`File "${basename(filePath)}" is too large (${(info.size / 1024 / 1024).toFixed(1)} MB)`)
    }
    const buf = await readFile(filePath)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  })

  ipcMain.handle('fs:listDirectory', async (_event, dirPath: string) => {
    return walkDirectory(dirPath, dirPath)
  })

  ipcMain.handle('app:isAdmin', () => isAdminCached)

  ipcMain.handle('app:relaunchAsAdmin', () => {
    const safeExecPath = process.execPath.replace(/'/g, "''")
    let script: string
    if (app.isPackaged) {
      script = `Start-Process -FilePath '${safeExecPath}' -Verb RunAs`
    } else {
      // Use absolute path to main.js — after UAC elevation the CWD may be C:\Windows\System32,
      // so process.argv[1] (which may be '.') would resolve to the wrong directory.
      const mainPath = join(__dirname, 'main.js').replace(/'/g, "''")
      script = `Start-Process -FilePath '${safeExecPath}' -ArgumentList '"${mainPath}"' -Verb RunAs`
    }
    spawn('powershell.exe', ['-Command', script], {
      detached: true,
      stdio: 'ignore',
    }).unref()
    app.quit()
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
