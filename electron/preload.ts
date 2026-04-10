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
})
