# Electron Wrapper Design

**Date:** 2026-04-10  
**Branch:** feature/electron-wrapper-2

## Goal

Wrap the existing React/Vite WebLogAnalyzer SPA in an Electron shell so users can open admin/system-protected folders on Windows. The browser deployment (GitHub Pages) must remain fully functional and unchanged.

## Requirements

- Users can open any folder, including system-protected paths (e.g. `C:\ProgramData`, `C:\Windows`), when the desktop app is running as admin.
- All existing functionality (ZIP workspaces, directory workspaces, single-file workspaces, drag-and-drop, filtering, parsing) is preserved in both browser and desktop.
- A "Relaunch as Admin" button appears in the status bar when running in Electron without elevation. It is hidden in the browser and hidden in Electron when already elevated.
- The desktop app is distributed as a portable `.exe` (no installer).

## Architecture

```
Existing build pipeline (unchanged):
  npm run build  →  dist/  →  GitHub Pages

New Electron build pipeline:
  npm run build:electron
    1. tsc -p tsconfig.electron.json  →  dist-electron/main.js, preload.js
    2. vite build --config vite.config.electron.ts  →  dist/  (base: './')
  npm run electron:dist
    electron-builder --win portable  →  release/WebLogAnalyzer-portable.exe
```

The renderer detects Electron by checking `window.electronAPI !== undefined`. All Electron-specific logic is isolated to `FilePickerService`. No other React component knows about Electron.

## New Files

### `electron/main.ts`

Main process entry point. Responsibilities:
- Create `BrowserWindow` with `contextIsolation: true`, `nodeIntegration: false`, `preload: dist-electron/preload.js`.
- In production: load `dist/index.html` via `loadFile`.
- In dev (`npm run electron:dev`): load `dist/index.html` from the built output (no live dev server; run `build:electron` first).
- Register IPC handlers (see IPC API below).

### `electron/preload.ts`

Exposes `window.electronAPI` via `contextBridge.exposeInMainWorld`. All calls go through `ipcRenderer.invoke`.

### `vite.config.electron.ts`

Identical to `vite.config.ts` except `base: './'`. Required so `index.html` asset paths work over `file://` protocol.

### `tsconfig.electron.json`

Compiles `electron/**/*.ts` → `dist-electron/`. Extends `tsconfig.node.json`.

### `electron-builder.json`

```json
{
  "appId": "com.webloganalyzer.app",
  "productName": "WebLogAnalyzer",
  "directories": { "output": "release" },
  "files": ["dist/**/*", "dist-electron/**/*"],
  "win": {
    "target": [{ "target": "portable", "arch": ["x64"] }]
  },
  "portable": { "artifactName": "WebLogAnalyzer-portable.exe" }
}
```

`"main": "dist-electron/main.js"` lives in `package.json` (electron-builder reads it from there). No icon is required for the initial build; one can be added later by placing `electron/resources/icon.ico` and adding `"icon": "electron/resources/icon.ico"` to the `win` block.

## IPC API

| `window.electronAPI` method | IPC channel | Main process action |
|---|---|---|
| `openFile()` | `dialog:openFile` | `dialog.showOpenDialog` → `fs.readFile` → `{path, name, buffer: ArrayBuffer}` |
| `openDirectory()` | `dialog:openDirectory` | `dialog.showOpenDialog({properties:['openDirectory']})` → `{path, name}` |
| `readFile(path)` | `fs:readFile` | `fs.readFile(path, 'utf-8')` → string |
| `listDirectory(path)` | `fs:listDirectory` | Recursive `fs.readdir` → `{path, size, isDirectory}[]` |
| `isAdmin()` | `app:isAdmin` | `execSync('net session')` → boolean |
| `relaunchAsAdmin()` | `app:relaunchAsAdmin` | PowerShell `Start-Process -Verb RunAs` → `app.quit()` |

### TypeScript types (added to `src/types/electron.d.ts`)

```ts
interface ElectronFileEntry {
  path: string;
  size: number;
  isDirectory: boolean;
}

interface ElectronAPI {
  openFile: () => Promise<{ path: string; name: string; buffer: ArrayBuffer } | null>;
  openDirectory: () => Promise<{ path: string; name: string } | null>;
  readFile: (path: string) => Promise<string>;
  listDirectory: (dirPath: string) => Promise<ElectronFileEntry[]>;
  isAdmin: () => Promise<boolean>;
  relaunchAsAdmin: () => Promise<void>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
```

## Modified Files

### `src/models/types.ts`

Add optional `nativePath?: string` to all three `WorkspaceSource` variants:

```ts
type WorkspaceSource =
  | { type: 'zip';       file: File; fileHandle?: FileSystemFileHandle;       nativePath?: string }
  | { type: 'file';      file: File; fileHandle?: FileSystemFileHandle;       nativePath?: string }
  | { type: 'directory'; dirHandle?: FileSystemDirectoryHandle;               nativePath?: string }
```

### `src/services/filePickerService.ts`

Each method gets an Electron branch (checked first) and keeps the existing browser branch:

- `pickFile()`: if `window.electronAPI`, call `openFile()`, wrap buffer in `new File([buffer], name)`, return source with `nativePath`.
- `pickDirectory()`: if `window.electronAPI`, call `openDirectory()`, return `{ type: 'directory', nativePath }`.
- `listDirectoryEntries(dirHandle?, nativePath?)`: if `nativePath`, call `listDirectory(nativePath)`, map to `ZipEntryMetadata[]`.
- `readFileFromDirectory(dirHandle?, nativePath?, filePath)`: if `nativePath`, call `readFile(nativePath + '/' + filePath)`.
- `requestDirectoryPermission(dirHandle?)`: if no `dirHandle` (Electron path), return `true`.

### `src/App.tsx`

Update the two directory-handling call sites to pass `source.nativePath` alongside `source.dirHandle`:

```ts
// openWorkspaceContent
if (source.type === 'directory' && (source.dirHandle || source.nativePath)) {
  const entries = await FilePickerService.listDirectoryEntries(source.dirHandle, source.nativePath);
  ...
}

// handleTreeFileSelect
if (source.type === 'directory' && (source.dirHandle || source.nativePath)) {
  content = await FilePickerService.readFileFromDirectory(source.dirHandle, source.nativePath, path);
}
```

Add one-time `isAdmin` check on mount:

```ts
const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
useEffect(() => {
  window.electronAPI?.isAdmin().then(setIsAdmin);
}, []);
```

Pass `isAdmin` to `StatusBar`.

### `src/components/StatusBar/StatusBar.tsx`

Accept an `isAdmin: boolean | null` prop. When `window.electronAPI` is defined and `isAdmin === false`, render a "Relaunch as Admin" button on the right side of the status bar. Clicking it calls `window.electronAPI.relaunchAsAdmin()`.

### `package.json`

Add `"main": "dist-electron/main.js"` at the top level. Add scripts:

```json
"build:electron-main": "tsc -p tsconfig.electron.json",
"build:electron": "npm run build:electron-main && vite build --config vite.config.electron.ts",
"electron:dev": "npm run build:electron && electron .",
"electron:dist": "npm run build:electron && electron-builder --win portable"
```

The existing `build` and `deploy` scripts are unchanged.

## File Max Size

The existing 50 MB per-file limit in `readFileFromDirectory` applies to both browser and Electron paths.

## Drag-and-Drop in Electron

Drag-and-drop uses the browser's `DataTransferItem` API, which Electron's renderer supports. Dropped files arrive as `File` objects with a `path` property in Electron (populated by Chromium). The existing `detectDropSource` code continues to work without changes. Elevated access applies because the main process is already admin; the renderer reading the file content via the File object inherits that access.

## Security

- `contextIsolation: true`, `nodeIntegration: false` — standard secure Electron setup.
- The preload script exposes only the six named methods; no raw `fs` or `child_process` access is exposed to the renderer.
- Path traversal: `readFile` and `listDirectory` in the main process accept only absolute paths returned from dialogs or assembled from dialog-returned roots. No user-supplied relative paths flow directly into `fs` calls.

## Build Scripts Summary

| Command | Output | Purpose |
|---|---|---|
| `npm run build` | `dist/` | Browser / GitHub Pages |
| `npm run deploy` | GitHub Pages | Publish browser build |
| `npm run build:electron` | `dist/` + `dist-electron/` | Electron renderer + main |
| `npm run electron:dev` | — | Run desktop app locally |
| `npm run electron:dist` | `release/*.exe` | Produce portable executable |
