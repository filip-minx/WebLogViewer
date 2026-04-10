# Electron Wrapper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the existing React/Vite WebLogAnalyzer SPA in Electron so users can open admin/system-protected folders on Windows, while keeping the browser deployment fully functional.

**Architecture:** The existing Vite build pipeline is unchanged for browser/GitHub Pages deployment. A separate `vite.config.electron.ts` (with `base: './'`) builds the renderer for Electron. A new `electron/` directory contains the main process and preload script, compiled to CJS via `tsconfig.electron.json`. `electron-builder` packages everything as a portable `.exe`. The renderer detects Electron via `window.electronAPI` (injected by preload), isolating all Electron logic in `FilePickerService`.

**Tech Stack:** Electron 41, electron-builder 26, React 18, TypeScript, Vite 5

---

## File Map

**New files:**
- `scripts/setup-electron-dist.mjs` — creates `dist-electron/package.json` to override `"type":"module"` for CJS
- `electron/main.ts` — main process: BrowserWindow + all IPC handlers
- `electron/preload.ts` — contextBridge exposing `window.electronAPI`
- `tsconfig.electron.json` — TypeScript config compiling `electron/` → `dist-electron/` as CJS
- `vite.config.electron.ts` — Vite config with `base: './'` for file:// protocol
- `electron-builder.json` — portable .exe packaging config
- `src/types/electron.d.ts` — `window.electronAPI` TypeScript declarations

**Modified files:**
- `src/models/types.ts` — add `nativePath?` to `WorkspaceSource` variants + `WorkspaceMetadata`
- `src/services/filePickerService.ts` — Electron branches for all picker/reader methods
- `src/hooks/useWorkspaceManager.ts` — stale reload + metadata persistence for native paths
- `src/App.tsx` — update two directory call sites + one-time `isAdmin` check
- `src/components/StatusBar/StatusBar.tsx` — add `isAdmin` prop + "Relaunch as Admin" button
- `src/styles/main.css` — add `.status-admin-button` style
- `package.json` — add `"main"` field + four new scripts

---

## Task 1: Type foundations

**Files:**
- Create: `src/types/electron.d.ts`
- Modify: `src/models/types.ts`

- [ ] **Step 1: Create `src/types/electron.d.ts`**

```typescript
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
```

- [ ] **Step 2: Update `WorkspaceSource` and `WorkspaceMetadata` in `src/models/types.ts`**

Replace the existing `WorkspaceSource` type (lines 67–70) and `WorkspaceMetadata` interface (lines 88–95):

```typescript
export type WorkspaceSource =
  | { type: 'zip';       file: File | null; fileHandle?: FileSystemFileHandle;  nativePath?: string }
  | { type: 'directory'; dirHandle: FileSystemDirectoryHandle | null;            nativePath?: string }
  | { type: 'file';      file: File | null; fileHandle?: FileSystemFileHandle;  nativePath?: string };

export interface WorkspaceMetadata {
  id: string;
  name: string;
  sourceType: 'zip' | 'directory' | 'file';
  lastAccessed: number;
  selectedFilePaths: string[];
  filterState: FilterState;
  nativePath?: string;   // persists the native path for Electron stale-reload
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/types/electron.d.ts src/models/types.ts
git commit -m "feat: add Electron type declarations and nativePath to WorkspaceSource"
```

---

## Task 2: Build configuration

**Files:**
- Create: `scripts/setup-electron-dist.mjs`
- Create: `tsconfig.electron.json`
- Create: `vite.config.electron.ts`
- Create: `electron-builder.json`
- Modify: `package.json`

- [ ] **Step 1: Create `scripts/setup-electron-dist.mjs`**

This script writes `dist-electron/package.json` so Node.js treats the compiled `.js` files as CommonJS (overriding the root `"type": "module"`).

```javascript
import { mkdirSync, writeFileSync } from 'fs'

mkdirSync('dist-electron', { recursive: true })
writeFileSync('dist-electron/package.json', JSON.stringify({ type: 'commonjs' }))
console.log('dist-electron/package.json written')
```

- [ ] **Step 2: Create `tsconfig.electron.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "node",
    "skipLibCheck": true,
    "strict": true,
    "esModuleInterop": true,
    "outDir": "./dist-electron",
    "rootDir": "./electron",
    "noEmit": false
  },
  "include": ["electron/**/*"]
}
```

- [ ] **Step 3: Create `vite.config.electron.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Electron renderer build — base must be './' so assets load over file:// protocol.
// Browser / GitHub Pages build uses vite.config.ts with base: '/WebLogViewer/'.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: {
    format: 'es'
  }
})
```

- [ ] **Step 4: Create `electron-builder.json`**

```json
{
  "appId": "com.webloganalyzer.app",
  "productName": "WebLogAnalyzer",
  "directories": {
    "output": "release"
  },
  "files": [
    "dist/**/*",
    "dist-electron/**/*"
  ],
  "win": {
    "target": [
      { "target": "portable", "arch": ["x64"] }
    ]
  },
  "portable": {
    "artifactName": "WebLogAnalyzer-portable.exe"
  }
}
```

- [ ] **Step 5: Update `package.json`**

Add `"main": "dist-electron/main.js"` at the top level (after `"version"`), and add four scripts. The final `package.json` should look like:

```json
{
  "name": "webloganalyzer",
  "version": "0.1.0",
  "main": "dist-electron/main.js",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "type-check": "tsc --noEmit",
    "deploy": "npm run build && gh-pages -d dist",
    "build:electron-main": "node scripts/setup-electron-dist.mjs && tsc -p tsconfig.electron.json",
    "build:electron": "npm run build:electron-main && vite build --config vite.config.electron.ts",
    "electron:dev": "npm run build:electron && electron .",
    "electron:dist": "npm run build:electron && electron-builder --win portable"
  },
  "dependencies": {
    "@tanstack/react-table": "^8.11.0",
    "@tanstack/react-virtual": "^3.0.0",
    "fflate": "^0.8.1",
    "nanoid": "^5.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "electron": "^41.2.0",
    "electron-builder": "^26.8.1",
    "gh-pages": "^6.3.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  }
}
```

> **Note:** If `electron` and `electron-builder` are not already in `devDependencies` in `package.json`, add them. They are already installed in `node_modules`.

- [ ] **Step 6: Commit**

```bash
git add scripts/setup-electron-dist.mjs tsconfig.electron.json vite.config.electron.ts electron-builder.json package.json
git commit -m "feat: add Electron build configuration"
```

---

## Task 3: Electron main process

**Files:**
- Create: `electron/main.ts`

- [ ] **Step 1: Create `electron/main.ts`**

```typescript
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
```

- [ ] **Step 2: Compile and check for errors**

Run: `npm run build:electron-main`
Expected: no TypeScript errors, `dist-electron/main.js` and `dist-electron/package.json` are created

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "feat: add Electron main process with IPC handlers"
```

---

## Task 4: Electron preload

**Files:**
- Create: `electron/preload.ts`

- [ ] **Step 1: Create `electron/preload.ts`**

```typescript
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
```

- [ ] **Step 2: Compile**

Run: `npm run build:electron-main`
Expected: `dist-electron/preload.js` is created alongside `main.js`

- [ ] **Step 3: Commit**

```bash
git add electron/preload.ts
git commit -m "feat: add Electron preload context bridge"
```

---

## Task 5: FilePickerService Electron branches

**Files:**
- Modify: `src/services/filePickerService.ts`

- [ ] **Step 1: Replace `src/services/filePickerService.ts` entirely**

```typescript
// File picker service — browser File System Access API with Electron IPC fallback.
// All methods check window.electronAPI first; browser paths are unchanged.

import type { WorkspaceSource, ZipEntryMetadata } from '../models/types';

export class FilePickerService {
  static isSupported(): boolean {
    return 'showOpenFilePicker' in window;
  }

  static isDirectoryPickerSupported(): boolean {
    return 'showDirectoryPicker' in window;
  }

  /**
   * Open a file picker and return a WorkspaceSource (zip or file).
   */
  static async pickFile(): Promise<WorkspaceSource | null> {
    if (window.electronAPI) {
      const result = await window.electronAPI.openFile();
      if (!result) return null;
      const file = new File([result.buffer], result.name);
      return result.name.toLowerCase().endsWith('.zip')
        ? { type: 'zip', file, nativePath: result.path }
        : { type: 'file', file, nativePath: result.path };
    }

    if (this.isSupported()) {
      try {
        const [fileHandle] = await window.showOpenFilePicker({
          types: [
            {
              description: 'Log files and archives',
              accept: {
                'application/zip': ['.zip'],
                'text/plain': ['.log', '.txt', '.json', '.jsonl', '.ndjson'],
              },
            },
          ],
          multiple: false,
        });
        const file = await fileHandle.getFile();
        return file.name.toLowerCase().endsWith('.zip')
          ? { type: 'zip', file, fileHandle }
          : { type: 'file', file, fileHandle };
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return null;
        throw error;
      }
    } else {
      return new Promise<WorkspaceSource | null>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.zip,.log,.txt,.json,.jsonl,.ndjson';
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) { resolve(null); return; }
          resolve(file.name.toLowerCase().endsWith('.zip')
            ? { type: 'zip', file }
            : { type: 'file', file });
        };
        input.oncancel = () => resolve(null);
        input.click();
      });
    }
  }

  /**
   * Open a directory picker and return a WorkspaceSource (directory).
   */
  static async pickDirectory(): Promise<WorkspaceSource | null> {
    if (window.electronAPI) {
      const result = await window.electronAPI.openDirectory();
      if (!result) return null;
      return { type: 'directory', dirHandle: null, nativePath: result.path };
    }

    if (!this.isDirectoryPickerSupported()) {
      throw new Error('Directory picking is not supported in this browser. Please use Chrome or Edge.');
    }
    try {
      const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' }) as FileSystemDirectoryHandle;
      return { type: 'directory', dirHandle };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return null;
      throw error;
    }
  }

  /**
   * Detect workspace source type from a drag-and-drop DataTransferItem.
   */
  static async detectDropSource(item: DataTransferItem): Promise<WorkspaceSource | null> {
    if ('getAsFileSystemHandle' in item) {
      try {
        const handle = await (item as any).getAsFileSystemHandle();
        if (handle.kind === 'directory') {
          return { type: 'directory', dirHandle: handle as FileSystemDirectoryHandle };
        }
        const file = await (handle as FileSystemFileHandle).getFile();
        const nativePath = (file as any).path as string | undefined;
        return file.name.toLowerCase().endsWith('.zip')
          ? { type: 'zip', file, fileHandle: handle as FileSystemFileHandle, nativePath }
          : { type: 'file', file, fileHandle: handle as FileSystemFileHandle, nativePath };
      } catch (err) {
        if (err instanceof Error && err.name === 'NotAllowedError') throw err;
      }
    }
    const file = item.getAsFile();
    if (!file) return null;
    const nativePath = (file as any).path as string | undefined;
    return file.name.toLowerCase().endsWith('.zip')
      ? { type: 'zip', file, nativePath }
      : { type: 'file', file, nativePath };
  }

  /**
   * Recursively list all files in a directory.
   * Accepts either a browser FileSystemDirectoryHandle or an Electron native path.
   */
  static async listDirectoryEntries(
    dirHandle?: FileSystemDirectoryHandle,
    nativePath?: string,
    basePath: string = ''
  ): Promise<ZipEntryMetadata[]> {
    if (nativePath && window.electronAPI) {
      const entries = await window.electronAPI.listDirectory(nativePath);
      return entries
        .filter(e => !e.isDirectory)
        .map(e => {
          const name = e.path.split('/').pop() ?? e.path;
          const ext = name.includes('.') ? name.split('.').pop() ?? '' : '';
          return {
            path: e.path,
            uncompressedSize: e.size,
            compressedSize: e.size,
            isDirectory: false,
            extension: ext,
          };
        });
    }
    if (!dirHandle) throw new Error('No directory handle or native path provided');

    const entries: ZipEntryMetadata[] = [];
    for await (const [name, handle] of (dirHandle as any).entries()) {
      const path = basePath ? `${basePath}/${name}` : name;
      if (handle.kind === 'file') {
        const file = await (handle as FileSystemFileHandle).getFile();
        const ext = name.includes('.') ? name.split('.').pop() || '' : '';
        entries.push({
          path,
          uncompressedSize: file.size,
          compressedSize: file.size,
          isDirectory: false,
          extension: ext,
        });
      } else {
        const subEntries = await this.listDirectoryEntries(
          handle as FileSystemDirectoryHandle,
          undefined,
          path
        );
        entries.push(...subEntries);
      }
    }
    return entries;
  }

  /**
   * Read a file by relative path from a directory.
   * Accepts either a browser FileSystemDirectoryHandle + relative path,
   * or an Electron native directory path + relative path.
   */
  static async readFileFromDirectory(
    dirHandle: FileSystemDirectoryHandle | undefined,
    nativePath: string | undefined,
    filePath: string
  ): Promise<string> {
    if (nativePath && window.electronAPI) {
      // Join native dir path with relative file path, normalising separators
      const sep = nativePath.includes('\\') ? '\\' : '/';
      const fullPath = nativePath + sep + filePath.replace(/\//g, sep);
      return window.electronAPI.readFile(fullPath);
    }
    if (!dirHandle) throw new Error('No directory handle or native path provided');

    const parts = filePath.split('/');
    if (parts.some(p => p === '..' || p === '')) {
      throw new Error(`Invalid file path: "${filePath}"`);
    }
    let currentDir: FileSystemDirectoryHandle = dirHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      currentDir = await currentDir.getDirectoryHandle(parts[i]);
    }
    const fileHandle = await currentDir.getFileHandle(parts[parts.length - 1]);
    const file = await fileHandle.getFile();
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File "${parts[parts.length - 1]}" is too large (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
    }
    return file.text();
  }

  /**
   * Get a File from a stored FileSystemFileHandle (requests permission if needed).
   */
  static async getFileFromHandle(handle: FileSystemFileHandle): Promise<File | null> {
    try {
      const permission = await handle.queryPermission({ mode: 'read' });
      if (permission === 'granted') return handle.getFile();
      if (permission === 'prompt') {
        const newPermission = await handle.requestPermission({ mode: 'read' });
        if (newPermission === 'granted') return handle.getFile();
      }
      return null;
    } catch (error) {
      console.error('[FilePickerService] Failed to get file from handle:', error);
      return null;
    }
  }

  /**
   * Request read permission for a directory handle.
   * Returns true if permission is granted (or not needed in Electron).
   */
  static async requestDirectoryPermission(
    dirHandle?: FileSystemDirectoryHandle
  ): Promise<boolean> {
    if (!dirHandle) return true; // Electron native paths need no permission
    try {
      const permission = await (dirHandle as any).queryPermission({ mode: 'read' });
      if (permission === 'granted') return true;
      if (permission === 'prompt') {
        const newPermission = await (dirHandle as any).requestPermission({ mode: 'read' });
        return newPermission === 'granted';
      }
      return false;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/services/filePickerService.ts
git commit -m "feat: add Electron IPC branches to FilePickerService"
```

---

## Task 6: WorkspaceManager — persist and restore native paths

**Files:**
- Modify: `src/hooks/useWorkspaceManager.ts`

- [ ] **Step 1: Update the stale workspace loading block (lines 68–105)**

Replace the block that creates `source` from `meta` and `handle` with this version that also restores `nativePath`:

```typescript
const staleWorkspaces: Workspace[] = await Promise.all(
  savedMetadata.map(async (meta) => {
    const handle = await WorkspaceStorage.loadHandle(meta.id);
    let source: WorkspaceSource;
    if (meta.sourceType === 'directory') {
      source = {
        type: 'directory',
        dirHandle: handle ? (handle as FileSystemDirectoryHandle) : null,
        nativePath: meta.nativePath,
      };
    } else if (meta.sourceType === 'zip') {
      source = {
        type: 'zip',
        file: null,
        fileHandle: handle ? (handle as FileSystemFileHandle) : undefined,
        nativePath: meta.nativePath,
      };
    } else {
      source = {
        type: 'file',
        file: null,
        fileHandle: handle ? (handle as FileSystemFileHandle) : undefined,
        nativePath: meta.nativePath,
      };
    }
    return {
      id: meta.id,
      name: meta.name,
      source,
      fileEntries: [],
      selectedFilePaths: meta.selectedFilePaths,
      parsedEntries: [],
      columns: [],
      filterState: meta.filterState,
      parseState: null,
      status: 'stale' as const,
      memorySize: 0,
      lastAccessed: meta.lastAccessed,
    };
  })
);
```

- [ ] **Step 2: Update the auto-save metadata mapping (lines 118–126)**

Add `nativePath` to the mapped metadata object:

```typescript
const metadata: WorkspaceMetadata[] = workspaces.map(ws => ({
  id: ws.id,
  name: ws.name,
  sourceType: ws.source.type,
  lastAccessed: ws.lastAccessed,
  selectedFilePaths: ws.selectedFilePaths,
  filterState: ws.filterState,
  nativePath: ws.source.nativePath,
}));
```

- [ ] **Step 3: Update `reloadStaleWorkspace` (lines 228–263)**

Replace the full function body with this version that handles native paths:

```typescript
const reloadStaleWorkspace = useCallback(
  async (id: string): Promise<boolean> => {
    const ws = workspaces.find(w => w.id === id);
    if (!ws || ws.status !== 'stale') return false;

    if (ws.source.type === 'directory') {
      // Electron native path — no permission dialog needed
      if (ws.source.nativePath) {
        updateWorkspace(id, { status: 'parsing', lastAccessed: Date.now() });
        setActiveWorkspaceId(id);
        return true;
      }
      const dirHandle = ws.source.dirHandle;
      if (!dirHandle) return false;
      const granted = await FilePickerService.requestDirectoryPermission(dirHandle);
      if (!granted) return false;
      updateWorkspace(id, {
        source: { type: 'directory', dirHandle },
        status: 'parsing',
        lastAccessed: Date.now(),
      });
      setActiveWorkspaceId(id);
      return true;
    } else {
      // Electron native path for file/zip — read bytes directly
      if (ws.source.nativePath && window.electronAPI) {
        const nativePath = ws.source.nativePath;
        const name = nativePath.split(/[\\/]/).pop() ?? 'file';
        const buffer = await window.electronAPI.readFileBinary(nativePath);
        if (!buffer) return false;
        const file = new File([buffer], name);
        updateWorkspace(id, {
          source: ws.source.type === 'zip'
            ? { type: 'zip', file, nativePath }
            : { type: 'file', file, nativePath },
          status: 'parsing',
          lastAccessed: Date.now(),
        });
        setActiveWorkspaceId(id);
        return true;
      }
      const fileHandle = ws.source.fileHandle;
      if (!fileHandle) return false;
      const file = await FilePickerService.getFileFromHandle(fileHandle);
      if (!file) return false;
      updateWorkspace(id, {
        source: ws.source.type === 'zip'
          ? { type: 'zip', file, fileHandle }
          : { type: 'file', file, fileHandle },
        status: 'parsing',
        lastAccessed: Date.now(),
      });
      setActiveWorkspaceId(id);
      WorkspaceStorage.saveHandle(id, fileHandle);
      return true;
    }
  },
  [workspaces, updateWorkspace]
);
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useWorkspaceManager.ts
git commit -m "feat: persist and restore nativePath in workspace manager"
```

---

## Task 7: App.tsx, StatusBar, and CSS

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/StatusBar/StatusBar.tsx`
- Modify: `src/styles/main.css`

- [ ] **Step 1: Update the two directory call sites in `src/App.tsx`**

In `openWorkspaceContent` (around line 105), change:
```typescript
} else if (source.type === 'directory' && source.dirHandle) {
  const entries = await FilePickerService.listDirectoryEntries(source.dirHandle);
```
to:
```typescript
} else if (source.type === 'directory' && (source.dirHandle || source.nativePath)) {
  const entries = await FilePickerService.listDirectoryEntries(source.dirHandle ?? undefined, source.nativePath);
```

In `handleTreeFileSelect` (around line 178), change:
```typescript
if (source.type === 'directory' && !source.dirHandle) return;
```
to:
```typescript
if (source.type === 'directory' && !source.dirHandle && !source.nativePath) return;
```

In `handleTreeFileSelect` (around line 199), change:
```typescript
if (source.type === 'directory' && source.dirHandle) {
  content = await FilePickerService.readFileFromDirectory(source.dirHandle, path);
```
to:
```typescript
if (source.type === 'directory' && (source.dirHandle || source.nativePath)) {
  content = await FilePickerService.readFileFromDirectory(source.dirHandle ?? undefined, source.nativePath, path);
```

- [ ] **Step 2: Add `isAdmin` state and effect to `src/App.tsx`**

After the existing state declarations at the top of the `App` function, add:

```typescript
// Electron admin state — null in browser, true/false in Electron
const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
useEffect(() => {
  window.electronAPI?.isAdmin().then(setIsAdmin);
}, []);
```

Find the `<StatusBar ... />` JSX and add the `isAdmin` prop:

```tsx
<StatusBar
  parseState={activeWorkspace?.parseState || null}
  totalEntries={activeWorkspace?.parsedEntries.length || 0}
  filteredEntries={filteredEntries.length}
  isAdmin={isAdmin}
/>
```

- [ ] **Step 3: Update `src/components/StatusBar/StatusBar.tsx`**

```typescript
import React from 'react';
import type { FileParseState } from '../../models/types';

interface StatusBarProps {
  parseState: FileParseState | null;
  totalEntries: number;
  filteredEntries: number;
  isAdmin: boolean | null;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  parseState,
  totalEntries,
  filteredEntries,
  isAdmin,
}) => {
  return (
    <div className="status-bar">
      {parseState && (
        <div className="status-section">
          <span className="status-label">File:</span>
          <span className="status-value">{parseState.fileName}</span>
        </div>
      )}

      {parseState && parseState.parserName && (
        <div className="status-section">
          <span className="status-label">Parser:</span>
          <span className="status-value">{parseState.parserName}</span>
        </div>
      )}

      {parseState && parseState.status === 'parsing' && (
        <div className="status-section">
          <span className="status-label">Progress:</span>
          <span className="status-value">{parseState.progress}%</span>
        </div>
      )}

      {parseState && parseState.status === 'complete' && (
        <>
          <div className="status-section">
            <span className="status-label">Total Entries:</span>
            <span className="status-value">{totalEntries.toLocaleString()}</span>
          </div>

          {filteredEntries < totalEntries && (
            <div className="status-section">
              <span className="status-label">Filtered:</span>
              <span className="status-value">{filteredEntries.toLocaleString()}</span>
            </div>
          )}
        </>
      )}

      {parseState && parseState.status === 'error' && (
        <div className="status-section error">
          <span className="status-label">Error:</span>
          <span className="status-value">{parseState.error}</span>
        </div>
      )}

      {window.electronAPI && isAdmin === false && (
        <div className="status-section status-section--admin">
          <button
            className="status-admin-button"
            onClick={() => window.electronAPI?.relaunchAsAdmin()}
            title="This app is not running as Administrator. Click to relaunch with elevated privileges."
          >
            ⚠ Relaunch as Admin
          </button>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Add admin button styles to `src/styles/main.css`**

Append after the last `.status-section.error` block (around line 883):

```css
.status-section--admin {
  margin-left: auto;
}

.status-admin-button {
  background: rgba(251, 146, 60, 0.12);
  border: 1px solid rgba(251, 146, 60, 0.35);
  color: var(--warning);
  font-size: 11px;
  font-family: var(--font-mono);
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
  letter-spacing: 0.03em;
  transition: background 0.15s;
}

.status-admin-button:hover {
  background: rgba(251, 146, 60, 0.22);
}
```

- [ ] **Step 5: Verify full renderer build compiles**

Run: `npm run build:electron`
Expected: no TypeScript errors, `dist/` and `dist-electron/` both populated

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/StatusBar/StatusBar.tsx src/styles/main.css
git commit -m "feat: wire isAdmin to StatusBar and update directory call sites for Electron"
```

---

## Task 8: Smoke test

- [ ] **Step 1: Verify browser build is still healthy**

Run: `npm run build`
Expected: `dist/` builds successfully with `base: '/WebLogViewer/'` — open `dist/index.html` in a browser and confirm the app loads

- [ ] **Step 2: Run the Electron dev app**

Run: `npm run electron:dev`
Expected: an Electron window opens showing WebLogAnalyzer

- [ ] **Step 3: Test file picker in Electron**

In the running app:
1. Click "Open File" — a native Windows file dialog should appear
2. Open a `.log` or `.zip` file from any location
3. Confirm the file parses and appears in the table

- [ ] **Step 4: Test directory picker in Electron**

1. Click "Open Directory" — a native folder dialog should appear
2. Navigate to a system folder (e.g. `C:\Windows\System32`) — confirm you can navigate there (elevated access test works when running as admin)
3. Open a regular log directory and confirm files appear in the tree

- [ ] **Step 5: Test admin button**

Run the app **without** elevation (normal `npm run electron:dev`):
- The "⚠ Relaunch as Admin" button should appear in the status bar
- Click it — UAC prompt should appear
- Confirm the app relaunches (if you accept UAC) — button should disappear

Run the app **with** elevation (right-click terminal → "Run as Administrator", then `npm run electron:dev`):
- The admin button should not be visible

- [ ] **Step 6: Test stale workspace reload in Electron**

1. Open a directory workspace in the Electron app
2. Close the app, reopen it
3. The workspace should appear as stale but reload without a permission dialog

- [ ] **Step 7: Build the portable executable**

Run: `npm run electron:dist`
Expected: `release/WebLogAnalyzer-portable.exe` is created

- [ ] **Step 8: Run the portable executable**

Double-click `release/WebLogAnalyzer-portable.exe` — app should open and function identically to dev mode

- [ ] **Step 9: Commit any fixes, then final commit**

```bash
git add -A
git commit -m "feat: complete Electron wrapper with admin support"
```
