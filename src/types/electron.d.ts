// Type declarations for the Electron context bridge API.
// window.electronAPI is undefined in the browser; defined only in the desktop app.

interface ElectronFileEntry {
  path: string;       // relative to the opened directory root, forward slashes
  size: number;       // bytes
  isDirectory: boolean;
}

interface ElectronAPI {
  openFile: () => Promise<{ path: string; name: string; buffer: ArrayBuffer } | null>;
  openDirectory: () => Promise<{ path: string; name: string } | null>;
  readFile: (path: string) => Promise<string>;
  readFileBinary: (path: string) => Promise<ArrayBuffer | null>;
  listDirectory: (dirPath: string) => Promise<ElectronFileEntry[]>;
  isAdmin: () => Promise<boolean>;
  relaunchAsAdmin: () => Promise<void>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
