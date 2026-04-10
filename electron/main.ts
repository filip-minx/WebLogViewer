import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { readFile, readdir, stat } from 'fs/promises'
import type { Dirent } from 'fs'
import { join, basename, relative } from 'path'
import { execSync, spawn } from 'child_process'

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

// Extract a file path from argv, ignoring flags and the electron/script entries.
// packaged:  argv = [exe, filePath?]
// dev:       argv = [electron, mainScript, filePath?]
function getFileArgFromArgv(argv: string[]): string | null {
  const args = argv.slice(app.isPackaged ? 1 : 2)
  return args.find(a => !a.startsWith('-') && a.trim().length > 0) ?? null
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

  const initialFilePath = getFileArgFromArgv(process.argv)
  if (initialFilePath) {
    win.webContents.once('did-finish-load', () => {
      win.webContents.send('open-file', initialFilePath)
    })
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

// Single-instance lock: if a second instance is launched (e.g. double-click another file
// while the app is already open), forward the file path to the existing window and quit.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
    const filePath = getFileArgFromArgv(argv)
    if (filePath) win.webContents.send('open-file', filePath)
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
