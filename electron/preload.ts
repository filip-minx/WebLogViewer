import { contextBridge, ipcRenderer } from 'electron'

// Register the open-file listener immediately (before contextBridge / before React mounts)
// so the message is never lost due to a race with the renderer's useEffect.
let pendingFilePath: string | null = null
let openFileCallback: ((filePath: string) => void) | null = null

ipcRenderer.on('open-file', (_event, filePath: string) => {
  if (openFileCallback) {
    openFileCallback(filePath)
  } else {
    pendingFilePath = filePath
  }
})

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () =>
    ipcRenderer.invoke('dialog:openFile'),
  openDirectory: () =>
    ipcRenderer.invoke('dialog:openDirectory'),
  readFile: (filePath: string) =>
    ipcRenderer.invoke('fs:readFile', filePath),
  readFileBinary: (filePath: string) =>
    ipcRenderer.invoke('fs:readFileBinary', filePath),
  listDirectory: (dirPath: string) =>
    ipcRenderer.invoke('fs:listDirectory', dirPath),
  isAdmin: () =>
    ipcRenderer.invoke('app:isAdmin'),
  relaunchAsAdmin: () =>
    ipcRenderer.invoke('app:relaunchAsAdmin'),
  onOpenFile: (callback: (filePath: string) => void) => {
    openFileCallback = callback
    // Flush any path that arrived before this callback was registered
    if (pendingFilePath !== null) {
      const path = pendingFilePath
      pendingFilePath = null
      setTimeout(() => callback(path), 0)
    }
    return () => { openFileCallback = null }
  },
})
