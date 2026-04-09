# Workspace Redesign

**Date:** 2026-04-09  
**Status:** Approved

## Overview

Replace the "package" concept with "workspaces". A workspace is one of three source types:
- **ZIP archive** — same as the current package behaviour
- **Directory** — an open folder on disk via File System Access API
- **Single file** — a single log file parsed immediately on open

Multiple workspaces can be open simultaneously. The active workspace is selected from a sidebar list.

---

## Data Model

`LogPackage` is replaced by `Workspace`. The source type is a discriminated union known at open time.

```ts
type WorkspaceSource =
  | { type: 'zip';       file: File | null; fileHandle?: FileSystemFileHandle }
  | { type: 'directory'; dirHandle: FileSystemDirectoryHandle }
  | { type: 'file';      file: File | null; fileHandle?: FileSystemFileHandle }

type Workspace = {
  id: string
  name: string                        // user-editable; defaults to filename/dirname
  source: WorkspaceSource
  zipEntries?: ZipEntryMetadata[]     // zip workspaces only
  selectedFilePaths: string[]
  parsedEntries: ParsedLogEntry[]
  columns: ColumnDef[]
  filterState: FilterState
  parseState: FileParseState | null
  status: 'parsing' | 'ready' | 'error' | 'stale'
  memorySize: number
  lastAccessed: number
  error?: string
}
```

All references to `LogPackage` throughout the codebase are renamed to `Workspace`. The `usePackageManager` hook becomes `useWorkspaceManager`.

---

## Opening a Workspace

### Button

The "LOAD" button is replaced by a "+" button in the workspace list header. Clicking it shows a two-item inline menu:

- **Open file…** → `showOpenFilePicker()` → detects ZIP (`.zip`) or single file by extension
- **Open folder…** → `showDirectoryPicker()` → always a directory workspace

Type is deduced from the result — no explicit type selection by the user.

### Drag and Drop

The entire app window is a drop target. While dragging, a full-window overlay shows a dashed border and "Drop to open" label.

On drop:
- Folder → `type: 'directory'` (via `DataTransferItem.getAsFileSystemHandle()`)
- `.zip` file → `type: 'zip'`
- Any other file → `type: 'file'`

Multiple items dropped at once open as multiple workspaces simultaneously.

---

## Sidebar Layout

The left sidebar has two zones divided by a horizontal rule.

### Workspace List (top zone)

```
┌─────────────────────────────────┐
│ WORKSPACES                    + │  ← "+" opens the two-item menu
├─────────────────────────────────┤
│ ▌ 📁 jamf-logs-apr9         ✕  │  ← active (accent bar + highlight)
│   🗜 crash-report.zip       ✕  │
│   📄 service.log            ✕  │
└─────────────────────────────────┘
```

- Type icon: 📁 directory, 🗜 ZIP, 📄 single file
- Active workspace has a left accent bar and a highlighted background
- Click a workspace row to switch active workspace
- **Double-click the name** to rename inline (`contenteditable`; Enter confirms, Escape cancels)
- "✕" closes the workspace (removes from list + clears from memory)

### File Tree (bottom zone)

Updates when active workspace changes.

| Source type | Tree behaviour |
|-------------|----------------|
| **ZIP** | Enumerates ZIP entries on open; shows path hierarchy; click to parse; Ctrl+click to merge multiple files |
| **Directory** | Backed by `FileSystemDirectoryHandle`; subdirectories expand on demand; click to parse; Ctrl+click to merge |
| **Single file** | No tree — shows filename as a static label; file is parsed immediately when workspace opens |

---

## Persistence

| Data | Storage | When saved |
|------|---------|------------|
| Workspace metadata (id, name, source type, selected paths, filter state) | `localStorage` | Auto-save every 10s |
| `FileSystemFileHandle` (ZIP, single file) | IndexedDB | Immediately on open |
| `FileSystemDirectoryHandle` (directory) | IndexedDB | Immediately on open |
| Parsed entries | Memory only | Cleared on stale |

**Staleness:** unchanged from today — 5 min inactivity marks status as `'stale'` and clears parsed data. On re-activation, the app attempts auto-reload via the stored handle; if permission is denied it falls back to the OS picker.

---

## Files Affected

| File | Change |
|------|--------|
| `src/models/types.ts` | Replace `LogPackage` with `Workspace` + `WorkspaceSource` |
| `src/hooks/usePackageManager.ts` | Rename to `useWorkspaceManager.ts`; update model references |
| `src/services/packageStorage.ts` | Rename to `workspaceStorage.ts`; update model; persist `FileSystemDirectoryHandle` |
| `src/services/filePickerService.ts` | Add `showDirectoryPicker()` path; add drag-and-drop type detection; add `readFileFromDirectory(dirHandle, path)` helper that calls `dirHandle.getFileHandle(path).getFile()` to produce a `File` for the existing parse pipeline |
| `src/services/zipService.ts` | No structural change |
| `src/models/workerMessages.ts` | Update any `LogPackage` references to `Workspace` |
| `src/App.tsx` | Replace `handleOpenFilePicker` with two-item menu; add drag-and-drop overlay handlers |
| `src/components/PackageDock/` | Replace with `WorkspaceList/` — vertical sidebar list with rename, icons, close |
| `src/components/FileTree/` | Add directory source support; no-tree state for single-file workspaces |
| `src/styles/main.css` | Drop overlay styles; workspace list styles; active/inactive row styles |
