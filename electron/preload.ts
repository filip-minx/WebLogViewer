import { contextBridge, ipcRenderer } from 'electron'

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
    const handler = (_event: Electron.IpcRendererEvent, filePath: string) => callback(filePath)
    ipcRenderer.on('open-file', handler)
    return () => ipcRenderer.removeListener('open-file', handler)
  },
})
