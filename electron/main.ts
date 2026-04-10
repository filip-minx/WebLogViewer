import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { readFile, readdir, stat } from 'fs/promises'
import { join, basename, relative } from 'path'
import { execSync } from 'child_process'
import { spawn } from 'child_process'

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
}

async function walkDirectory(
  dir: string,
  base: string
): Promise<Array<{ path: string; size: number; isDirectory: boolean }>> {
  const entries = await readdir(dir, { withFileTypes: true })
  const results: Array<{ path: string; size: number; isDirectory: boolean }> = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    const relPath = relative(base, fullPath).replace(/\\/g, '/')
    if (entry.isDirectory()) {
      results.push({ path: relPath, size: 0, isDirectory: true })
      const children = await walkDirectory(fullPath, base)
      results.push(...children)
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

  ipcMain.handle('app:isAdmin', () => {
    if (process.platform !== 'win32') return false
    try {
      execSync('net session', { stdio: 'pipe', timeout: 2000 })
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('app:relaunchAsAdmin', () => {
    const script = app.isPackaged
      ? `Start-Process -FilePath '${process.execPath}' -Verb RunAs`
      : `Start-Process -FilePath '${process.execPath}' -ArgumentList '"${process.argv[1]}"' -Verb RunAs`
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
