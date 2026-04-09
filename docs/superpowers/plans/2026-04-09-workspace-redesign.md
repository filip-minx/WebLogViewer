# Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "package" concept with "workspaces" that can be a ZIP archive, a disk directory, or a single file — with a new sidebar list UI, drag-and-drop support, and inline rename.

**Architecture:** `LogPackage` is replaced by `Workspace` with a `WorkspaceSource` discriminated union (`zip | directory | file`). A new `WorkspaceList` sidebar component replaces `PackageDock`. `FileTree` gains directory-handle-backed browsing and a no-tree mode for single files. Opening is via a single "+" button with a two-item menu plus full drag-and-drop on the window.

**Tech Stack:** React 18, TypeScript, File System Access API (`showOpenFilePicker`, `showDirectoryPicker`), IndexedDB (handle persistence), fflate (ZIP), Web Workers

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/models/types.ts` | Replace `LogPackage`/`PackageMetadata` with `Workspace`/`WorkspaceSource`/`WorkspaceMetadata` |
| Create | `src/services/workspaceStorage.ts` | Persist workspace metadata + FS handles (replaces `packageStorage.ts`) |
| Modify | `src/services/filePickerService.ts` | Add `pickDirectory`, `listDirectoryEntries`, `readFileFromDirectory`, `detectDropSource` |
| Create | `src/hooks/useWorkspaceManager.ts` | Multi-workspace lifecycle (replaces `usePackageManager.ts`) |
| Create | `src/components/WorkspaceList/WorkspaceList.tsx` | Vertical sidebar list with rename, type icons, close (replaces `PackageDock`) |
| Modify | `src/components/FileTree/FileTree.tsx` | Add `sourceType` + `singleFileName` props; no-tree state for single-file workspaces |
| Modify | `src/App.tsx` | Wire new hook/components; add drag-and-drop; handle all three source types |
| Modify | `src/styles/main.css` | WorkspaceList styles, drag overlay, remove old package-dock styles |
| Delete | `src/hooks/usePackageManager.ts` | Replaced by `useWorkspaceManager.ts` |
| Delete | `src/services/packageStorage.ts` | Replaced by `workspaceStorage.ts` |
| Delete | `src/components/PackageDock/` | Replaced by `WorkspaceList/` |

---

## Task 1: Replace LogPackage with Workspace in types.ts

**Files:**
- Modify: `src/models/types.ts`

- [ ] **Step 1: Replace the package management types at the bottom of `src/models/types.ts`**

Find the comment `// Package management types` and delete everything from there to end of file, replacing with:

```ts
// Workspace management types
export type WorkspaceStatus = 'parsing' | 'ready' | 'error' | 'stale';

export type WorkspaceSource =
  | { type: 'zip';       file: File | null; fileHandle?: FileSystemFileHandle }
  | { type: 'directory'; dirHandle: FileSystemDirectoryHandle | null }
  | { type: 'file';      file: File | null; fileHandle?: FileSystemFileHandle };

export interface Workspace {
  id: string;
  name: string;                        // user-editable; defaults to filename/dirname
  source: WorkspaceSource;
  fileEntries: ZipEntryMetadata[];     // files for tree (ZIP + directory); empty for single-file
  selectedFilePaths: string[];
  parsedEntries: ParsedLogEntry[];
  columns: ColumnDef[];
  filterState: FilterState;
  parseState: FileParseState | null;
  status: WorkspaceStatus;
  memorySize: number;
  lastAccessed: number;
  error?: string;
}

export interface WorkspaceMetadata {
  id: string;
  name: string;
  sourceType: 'zip' | 'directory' | 'file';
  lastAccessed: number;
  selectedFilePaths: string[];
  filterState: FilterState;
}
```

- [ ] **Step 2: Verify TypeScript reports errors (expected — not yet fixed)**

```bash
npm run type-check
```

Expected: errors in files that still import `LogPackage` / `PackageMetadata`. These are fixed in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add src/models/types.ts
git commit -m "refactor: replace LogPackage with Workspace type"
```

---

## Task 2: Create workspaceStorage.ts

**Files:**
- Create: `src/services/workspaceStorage.ts`

- [ ] **Step 1: Create `src/services/workspaceStorage.ts`**

```ts
// Workspace storage - Persist workspace metadata across sessions

import type { WorkspaceMetadata } from '../models/types';

const STORAGE_KEY = 'weblog-workspaces';
const ACTIVE_WORKSPACE_KEY = 'weblog-active-workspace';
const DB_NAME = 'weblog-analyzer-db';
const DB_VERSION = 1;
const HANDLE_STORE = 'file-handles';

export class WorkspaceStorage {
  private static db: IDBDatabase | null = null;

  private static async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { this.db = request.result; resolve(request.result); };
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(HANDLE_STORE)) {
          db.createObjectStore(HANDLE_STORE);
        }
      };
    });
  }

  static saveWorkspaces(workspaces: WorkspaceMetadata[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
    } catch (error) {
      console.error('[WorkspaceStorage] Failed to save workspaces:', error);
    }
  }

  static loadWorkspaces(): WorkspaceMetadata[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      return JSON.parse(stored);
    } catch (error) {
      console.error('[WorkspaceStorage] Failed to load workspaces:', error);
      return [];
    }
  }

  static saveActiveWorkspace(workspaceId: string | null): void {
    try {
      if (workspaceId) {
        localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);
      } else {
        localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
      }
    } catch (error) {
      console.error('[WorkspaceStorage] Failed to save active workspace:', error);
    }
  }

  static loadActiveWorkspace(): string | null {
    try {
      return localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    } catch {
      return null;
    }
  }

  /** Save a FileSystemHandle (file or directory) to IndexedDB */
  static async saveHandle(workspaceId: string, handle: FileSystemHandle): Promise<void> {
    try {
      const db = await this.initDB();
      const tx = db.transaction([HANDLE_STORE], 'readwrite');
      const store = tx.objectStore(HANDLE_STORE);
      await new Promise<void>((resolve, reject) => {
        const req = store.put(handle, workspaceId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (error) {
      console.error('[WorkspaceStorage] Failed to save handle:', error);
    }
  }

  /** Load a FileSystemHandle from IndexedDB */
  static async loadHandle(workspaceId: string): Promise<FileSystemHandle | null> {
    try {
      const db = await this.initDB();
      const tx = db.transaction([HANDLE_STORE], 'readonly');
      const store = tx.objectStore(HANDLE_STORE);
      return new Promise<FileSystemHandle | null>((resolve, reject) => {
        const req = store.get(workspaceId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (error) {
      console.error('[WorkspaceStorage] Failed to load handle:', error);
      return null;
    }
  }

  /** Delete a FileSystemHandle from IndexedDB */
  static async deleteHandle(workspaceId: string): Promise<void> {
    try {
      const db = await this.initDB();
      const tx = db.transaction([HANDLE_STORE], 'readwrite');
      const store = tx.objectStore(HANDLE_STORE);
      await new Promise<void>((resolve, reject) => {
        const req = store.delete(workspaceId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (error) {
      console.error('[WorkspaceStorage] Failed to delete handle:', error);
    }
  }

  static clearAll(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
      if (this.db) { this.db.close(); this.db = null; }
      indexedDB.deleteDatabase(DB_NAME);
    } catch (error) {
      console.error('[WorkspaceStorage] Failed to clear storage:', error);
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/workspaceStorage.ts
git commit -m "feat: add WorkspaceStorage service"
```

---

## Task 3: Update filePickerService.ts

**Files:**
- Modify: `src/services/filePickerService.ts`

- [ ] **Step 1: Replace the full contents of `src/services/filePickerService.ts`**

```ts
// File picker service with File System Access API support and fallback

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
   * Detects ZIP by .zip extension; everything else is type 'file'.
   */
  static async pickFile(): Promise<WorkspaceSource | null> {
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
   * Only works in Chrome/Edge (File System Access API).
   */
  static async pickDirectory(): Promise<WorkspaceSource | null> {
    if (!this.isDirectoryPickerSupported()) {
      alert('Directory picking is not supported in this browser. Please use Chrome or Edge.');
      return null;
    }
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      return { type: 'directory', dirHandle };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return null;
      throw error;
    }
  }

  /**
   * Detect workspace source type from a drag-and-drop DataTransferItem.
   * Uses getAsFileSystemHandle() when available (Chrome/Edge), falls back
   * to getAsFile() for other browsers (no directory support in fallback).
   */
  static async detectDropSource(item: DataTransferItem): Promise<WorkspaceSource | null> {
    if ('getAsFileSystemHandle' in item) {
      try {
        const handle = await (item as any).getAsFileSystemHandle();
        if (handle.kind === 'directory') {
          return { type: 'directory', dirHandle: handle as FileSystemDirectoryHandle };
        }
        const file = await (handle as FileSystemFileHandle).getFile();
        return file.name.toLowerCase().endsWith('.zip')
          ? { type: 'zip', file, fileHandle: handle as FileSystemFileHandle }
          : { type: 'file', file, fileHandle: handle as FileSystemFileHandle };
      } catch {
        // Fall through to legacy
      }
    }
    const file = item.getAsFile();
    if (!file) return null;
    return file.name.toLowerCase().endsWith('.zip')
      ? { type: 'zip', file }
      : { type: 'file', file };
  }

  /**
   * Recursively list all files in a directory handle as ZipEntryMetadata.
   */
  static async listDirectoryEntries(
    dirHandle: FileSystemDirectoryHandle,
    basePath: string = ''
  ): Promise<ZipEntryMetadata[]> {
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
          path
        );
        entries.push(...subEntries);
      }
    }
    return entries;
  }

  /**
   * Read a file from a directory handle by its relative path.
   * e.g. "logs/service.log" traverses to logs/ then reads service.log.
   */
  static async readFileFromDirectory(
    dirHandle: FileSystemDirectoryHandle,
    filePath: string
  ): Promise<string> {
    const parts = filePath.split('/');
    let currentDir: FileSystemDirectoryHandle = dirHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      currentDir = await currentDir.getDirectoryHandle(parts[i]);
    }
    const fileHandle = await currentDir.getFileHandle(parts[parts.length - 1]);
    const file = await fileHandle.getFile();
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
   * Returns true if permission is granted.
   */
  static async requestDirectoryPermission(
    dirHandle: FileSystemDirectoryHandle
  ): Promise<boolean> {
    try {
      const permission = await dirHandle.queryPermission({ mode: 'read' });
      if (permission === 'granted') return true;
      if (permission === 'prompt') {
        const newPermission = await dirHandle.requestPermission({ mode: 'read' });
        return newPermission === 'granted';
      }
      return false;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/filePickerService.ts
git commit -m "feat: update FilePickerService with directory picking and drop detection"
```

---

## Task 4: Create useWorkspaceManager.ts

**Files:**
- Create: `src/hooks/useWorkspaceManager.ts`

- [ ] **Step 1: Create `src/hooks/useWorkspaceManager.ts`**

```ts
// Workspace manager hook - Handles multi-workspace lifecycle
//
// Persistence strategy:
// - Workspace metadata: Auto-saved every 10 seconds to localStorage
// - FileSystem handles: Saved IMMEDIATELY on open/reload to IndexedDB
// - Workspace removal: Both metadata and handle removed IMMEDIATELY

import { useState, useEffect, useCallback, useRef } from 'react';
import { nanoid } from 'nanoid';
import type { Workspace, WorkspaceSource, WorkspaceMetadata } from '../models/types';
import { WorkspaceStorage } from '../services/workspaceStorage';
import { FilePickerService } from '../services/filePickerService';

const STALE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const AUTO_SAVE_INTERVAL = 10 * 1000; // 10 seconds

function estimateMemorySize(ws: Workspace): number {
  let size = ws.parsedEntries.length * 500;
  ws.parsedEntries.forEach(entry => {
    size += entry.raw?.length || 0;
    size += entry.message?.length || 0;
  });
  size += ws.columns.length * 100;
  size += ws.fileEntries.length * 200;
  return size;
}

function createEmptyWorkspace(id: string, name: string, source: WorkspaceSource): Workspace {
  return {
    id,
    name,
    source,
    fileEntries: [],
    selectedFilePaths: [],
    parsedEntries: [],
    columns: [],
    filterState: { globalSearch: '', columnFilters: {} },
    parseState: null,
    status: 'parsing',
    memorySize: 0,
    lastAccessed: Date.now(),
  };
}

export function useWorkspaceManager() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const staleTimers = useRef<Map<string, number>>(new Map());

  // Load persisted workspaces on mount
  useEffect(() => {
    const loadWorkspaces = async () => {
      const savedMetadata = WorkspaceStorage.loadWorkspaces();
      const savedActiveId = WorkspaceStorage.loadActiveWorkspace();

      if (savedMetadata.length === 0) return;

      const staleWorkspaces: Workspace[] = await Promise.all(
        savedMetadata.map(async (meta) => {
          const handle = await WorkspaceStorage.loadHandle(meta.id);
          let source: WorkspaceSource;
          if (meta.sourceType === 'directory') {
            source = {
              type: 'directory',
              dirHandle: handle ? (handle as FileSystemDirectoryHandle) : null,
            };
          } else if (meta.sourceType === 'zip') {
            source = {
              type: 'zip',
              file: null,
              fileHandle: handle ? (handle as FileSystemFileHandle) : undefined,
            };
          } else {
            source = {
              type: 'file',
              file: null,
              fileHandle: handle ? (handle as FileSystemFileHandle) : undefined,
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

      setWorkspaces(staleWorkspaces);
      if (savedActiveId && staleWorkspaces.some(w => w.id === savedActiveId)) {
        setActiveWorkspaceId(savedActiveId);
      }
    };
    loadWorkspaces();
  }, []);

  // Auto-save workspace metadata to localStorage
  useEffect(() => {
    const interval = setInterval(() => {
      const metadata: WorkspaceMetadata[] = workspaces.map(ws => ({
        id: ws.id,
        name: ws.name,
        sourceType: ws.source.type,
        lastAccessed: ws.lastAccessed,
        selectedFilePaths: ws.selectedFilePaths,
        filterState: ws.filterState,
      }));
      WorkspaceStorage.saveWorkspaces(metadata);
      if (activeWorkspaceId) WorkspaceStorage.saveActiveWorkspace(activeWorkspaceId);
    }, AUTO_SAVE_INTERVAL);
    return () => clearInterval(interval);
  }, [workspaces, activeWorkspaceId]);

  // Stale timers for inactive workspaces
  useEffect(() => {
    staleTimers.current.forEach(timer => clearTimeout(timer));
    staleTimers.current.clear();

    workspaces.forEach(ws => {
      if (ws.id === activeWorkspaceId || ws.status === 'stale') return;
      const remaining = Math.max(0, STALE_TIMEOUT - (Date.now() - ws.lastAccessed));
      const timer = setTimeout(() => {
        setWorkspaces(prev => prev.map(w => {
          if (w.id !== ws.id || w.id === activeWorkspaceId) return w;
          return {
            ...w,
            // For directory workspaces, keep the dirHandle; for others, clear the File
            source: w.source.type === 'directory'
              ? w.source
              : { ...w.source, file: null },
            parsedEntries: [],
            fileEntries: [],
            status: 'stale' as const,
            memorySize: 0,
          };
        }));
      }, remaining);
      staleTimers.current.set(ws.id, timer);
    });

    return () => {
      staleTimers.current.forEach(timer => clearTimeout(timer));
      staleTimers.current.clear();
    };
  }, [workspaces, activeWorkspaceId]);

  const addWorkspace = useCallback((source: WorkspaceSource, name: string) => {
    const id = nanoid();
    const newWorkspace = createEmptyWorkspace(id, name, source);
    setWorkspaces(prev => [...prev, newWorkspace]);
    setActiveWorkspaceId(id);
    // Immediately persist handle to IndexedDB
    if (source.type === 'directory' && source.dirHandle) {
      WorkspaceStorage.saveHandle(id, source.dirHandle);
    } else if (source.type !== 'directory' && source.fileHandle) {
      WorkspaceStorage.saveHandle(id, source.fileHandle);
    }
    return id;
  }, []);

  const updateWorkspace = useCallback((id: string, updates: Partial<Workspace>) => {
    setWorkspaces(prev => prev.map(ws => {
      if (ws.id !== id) return ws;
      const updated = { ...ws, ...updates, lastAccessed: Date.now() };
      if (updates.parsedEntries || updates.columns || updates.fileEntries) {
        updated.memorySize = estimateMemorySize(updated);
      }
      return updated;
    }));
  }, []);

  const removeWorkspace = useCallback(async (id: string) => {
    await WorkspaceStorage.deleteHandle(id);
    const isRemovingActive = activeWorkspaceId === id;
    let newActiveId: string | null = activeWorkspaceId;

    setWorkspaces(prev => {
      const remaining = prev.filter(ws => ws.id !== id);
      if (isRemovingActive) {
        newActiveId = remaining.length > 0 ? remaining[0].id : null;
      }
      const metadata: WorkspaceMetadata[] = remaining.map(ws => ({
        id: ws.id,
        name: ws.name,
        sourceType: ws.source.type,
        lastAccessed: ws.lastAccessed,
        selectedFilePaths: ws.selectedFilePaths,
        filterState: ws.filterState,
      }));
      WorkspaceStorage.saveWorkspaces(metadata);
      return remaining;
    });

    if (isRemovingActive) {
      setActiveWorkspaceId(newActiveId);
      WorkspaceStorage.saveActiveWorkspace(newActiveId);
    }
  }, [activeWorkspaceId]);

  const switchWorkspace = useCallback((id: string) => {
    setActiveWorkspaceId(id);
    updateWorkspace(id, { lastAccessed: Date.now() });
  }, [updateWorkspace]);

  const renameWorkspace = useCallback((id: string, newName: string) => {
    updateWorkspace(id, { name: newName });
  }, [updateWorkspace]);

  const getActiveWorkspace = useCallback((): Workspace | null => {
    return workspaces.find(ws => ws.id === activeWorkspaceId) || null;
  }, [workspaces, activeWorkspaceId]);

  /**
   * Attempt to reload a stale workspace from its stored handle.
   * Returns true if successful (workspace status set to 'parsing'),
   * false if permission denied or no handle — caller must prompt re-pick.
   */
  const reloadStaleWorkspace = useCallback(
    async (id: string): Promise<boolean> => {
      const ws = workspaces.find(w => w.id === id);
      if (!ws) return false;

      if (ws.source.type === 'directory') {
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

  return {
    workspaces,
    activeWorkspaceId,
    addWorkspace,
    updateWorkspace,
    removeWorkspace,
    switchWorkspace,
    renameWorkspace,
    getActiveWorkspace,
    reloadStaleWorkspace,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useWorkspaceManager.ts
git commit -m "feat: add useWorkspaceManager hook"
```

---

## Task 5: Create WorkspaceList component

**Files:**
- Create: `src/components/WorkspaceList/WorkspaceList.tsx`

- [ ] **Step 1: Create `src/components/WorkspaceList/WorkspaceList.tsx`**

```tsx
import React, { useState, useRef, useEffect } from 'react';
import type { Workspace, WorkspaceSource } from '../../models/types';

interface WorkspaceListProps {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onWorkspaceSelect: (id: string) => void;
  onWorkspaceClose: (id: string) => void | Promise<void>;
  onWorkspaceRename: (id: string, newName: string) => void;
  onPickFile: () => void;
  onPickDirectory: () => void;
}

function getSourceIcon(source: WorkspaceSource): string {
  switch (source.type) {
    case 'directory': return '📁';
    case 'zip':       return '🗜';
    case 'file':      return '📄';
  }
}

function getStatusDot(status: string): string {
  switch (status) {
    case 'parsing': return '●';
    case 'ready':   return '✓';
    case 'error':   return '✕';
    case 'stale':   return '○';
    default:        return '○';
  }
}

export function WorkspaceList({
  workspaces,
  activeWorkspaceId,
  onWorkspaceSelect,
  onWorkspaceClose,
  onWorkspaceRename,
  onPickFile,
  onPickDirectory,
}: WorkspaceListProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  // Focus+select input when rename starts
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const startRename = (ws: Workspace, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(ws.id);
    setEditingName(ws.name);
  };

  const commitRename = (id: string) => {
    const trimmed = editingName.trim();
    if (trimmed) onWorkspaceRename(id, trimmed);
    setEditingId(null);
  };

  return (
    <div className="workspace-list">
      <div className="workspace-list-header">
        <span className="workspace-list-label">WORKSPACES</span>
        <div className="workspace-open-menu-wrapper" ref={menuRef}>
          <button
            className="workspace-add-btn"
            onClick={() => setShowMenu(v => !v)}
            title="Open workspace"
          >
            +
          </button>
          {showMenu && (
            <div className="workspace-open-menu">
              <button
                className="workspace-open-menu-item"
                onClick={() => { setShowMenu(false); onPickFile(); }}
              >
                Open file…
              </button>
              <button
                className="workspace-open-menu-item"
                onClick={() => { setShowMenu(false); onPickDirectory(); }}
              >
                Open folder…
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="workspace-list-items">
        {workspaces.map(ws => (
          <div
            key={ws.id}
            className={`workspace-item ${ws.id === activeWorkspaceId ? 'active' : ''} status-${ws.status}`}
            onClick={() => onWorkspaceSelect(ws.id)}
            title={`${ws.name}\nStatus: ${ws.status}`}
          >
            <span className="workspace-source-icon">{getSourceIcon(ws.source)}</span>

            {editingId === ws.id ? (
              <input
                ref={inputRef}
                className="workspace-name-input"
                value={editingName}
                onChange={e => setEditingName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename(ws.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                onBlur={() => commitRename(ws.id)}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span
                className="workspace-name"
                onDoubleClick={e => startRename(ws, e)}
              >
                {ws.name}
              </span>
            )}

            <span className={`workspace-status-dot status-${ws.status}`}>
              {getStatusDot(ws.status)}
            </span>

            <button
              className="workspace-close-btn"
              onClick={e => { e.stopPropagation(); onWorkspaceClose(ws.id); }}
              title="Close workspace"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/WorkspaceList/WorkspaceList.tsx
git commit -m "feat: add WorkspaceList component"
```

---

## Task 6: Update FileTree for directory and single-file workspaces

**Files:**
- Modify: `src/components/FileTree/FileTree.tsx`

- [ ] **Step 1: Add `sourceType` and `singleFileName` props to FileTree**

In `src/components/FileTree/FileTree.tsx`, update the `FileTreeProps` interface:

```ts
interface FileTreeProps {
  entries: ZipEntryMetadata[];
  selectedPaths: string[];
  onFileSelect: (paths: string[]) => void;
  sourceType?: 'zip' | 'directory' | 'file';
  singleFileName?: string;
}
```

Update the component signature to destructure the new props:

```tsx
export const FileTree: React.FC<FileTreeProps> = ({
  entries,
  selectedPaths,
  onFileSelect,
  sourceType,
  singleFileName,
}) => {
```

- [ ] **Step 2: Replace the empty-state/early-return with source-aware rendering**

Replace the existing `if (entries.length === 0)` early return with:

```tsx
  // Single-file workspace: no tree, show static filename label
  if (sourceType === 'file') {
    return (
      <div className="file-tree">
        <div className="file-tree-single-file">
          <span className="file-tree-single-icon">📄</span>
          <span className="file-tree-single-name">{singleFileName || 'File'}</span>
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="file-tree-empty">
        <p>
          {sourceType === 'directory'
            ? 'No files found in directory'
            : 'No workspace loaded or workspace is stale'}
        </p>
      </div>
    );
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/components/FileTree/FileTree.tsx
git commit -m "feat: update FileTree for single-file and directory workspaces"
```

---

## Task 7: Update App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace the import block at the top of `src/App.tsx`**

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { WorkspaceList } from './components/WorkspaceList/WorkspaceList';
import { FileTree } from './components/FileTree/FileTree';
import { LogTable } from './components/LogTable/LogTable';
import { GlobalSearch } from './components/FilterPanel/GlobalSearch';
import { MessagePanel } from './components/MessagePanel/MessagePanel';
import { ResizeHandle } from './components/ResizeHandle/ResizeHandle';
import { StatusBar } from './components/StatusBar/StatusBar';
import { ZipService } from './services/zipService';
import { ParseService } from './services/parseService';
import { FilePickerService } from './services/filePickerService';
import { applyFilters } from './utils/filterUtils';
import { useResizable } from './hooks/useResizable';
import { useWorkspaceManager } from './hooks/useWorkspaceManager';
import type {
  WorkspaceSource,
  ParsedLogEntry,
  ColumnDef,
  FilterState,
} from './models/types';
import './styles/main.css';
```

- [ ] **Step 2: Update the hook destructuring inside the `App` function**

Replace the `usePackageManager()` call and `activePackage` line:

```tsx
const {
  workspaces,
  activeWorkspaceId,
  addWorkspace,
  updateWorkspace,
  removeWorkspace,
  switchWorkspace,
  renameWorkspace,
  getActiveWorkspace,
  reloadStaleWorkspace,
} = useWorkspaceManager();

const activeWorkspace = getActiveWorkspace();
```

Add drag counter state after the existing UI state:

```tsx
const dragCounter = useRef(0);
const [isDragging, setIsDragging] = useState(false);
```

- [ ] **Step 3: Replace `handleFileSelect` and `handleOpenFilePicker` with `openWorkspaceContent` and `handleWorkspaceOpen`**

Define `openWorkspaceContent` **before** `handleWorkspaceOpen` (it must be defined first since `handleWorkspaceOpen` calls it):

```tsx
// Enumerate files or auto-parse depending on source type.
// Called after a workspace is added or a stale workspace is reloaded.
const openWorkspaceContent = async (workspaceId: string, source: WorkspaceSource) => {
  if (source.type === 'zip' && source.file) {
    const entries = await zipService.enumerateEntries(source.file);
    updateWorkspace(workspaceId, {
      fileEntries: entries.filter(e => !e.isDirectory),
      status: 'ready',
    });
  } else if (source.type === 'directory' && source.dirHandle) {
    const entries = await FilePickerService.listDirectoryEntries(source.dirHandle);
    updateWorkspace(workspaceId, {
      fileEntries: entries,
      status: 'ready',
    });
  } else if (source.type === 'file' && source.file) {
    // Single file: auto-parse immediately
    const fileName = source.file.name;
    updateWorkspace(workspaceId, {
      selectedFilePaths: [fileName],
      parseState: { fileName, status: 'detecting', progress: 0 },
      status: 'parsing',
    });
    const content = await source.file.text();
    let fileEntries: ParsedLogEntry[] = [];
    let fileColumns: ColumnDef[] = [];
    await parseService.parseFile(content, fileName, progress => {
      if (progress.parserId && progress.parserName && progress.columns) {
        fileColumns = progress.columns;
      }
      fileEntries = progress.entries;
    });
    updateWorkspace(workspaceId, {
      parsedEntries: fileEntries,
      columns: fileColumns,
      parseState: {
        fileName,
        status: 'complete',
        progress: 100,
        totalEntries: fileEntries.length,
      },
      status: 'ready',
    });
  }
};

// Open or focus a workspace from a WorkspaceSource.
// If same-named workspace exists and is stale, reloads it.
// If same-named workspace exists and is active/ready, just switches to it.
const handleWorkspaceOpen = async (source: WorkspaceSource) => {
  try {
    const name = source.type === 'directory'
      ? source.dirHandle!.name
      : source.file!.name;

    const existing = workspaces.find(w => w.name === name);
    if (existing?.status === 'stale') {
      const reloaded = await reloadStaleWorkspace(existing.id);
      if (reloaded) {
        await openWorkspaceContent(existing.id, source);
        return;
      }
    }
    if (existing && existing.status !== 'stale') {
      switchWorkspace(existing.id);
      return;
    }

    const workspaceId = addWorkspace(source, name);
    await openWorkspaceContent(workspaceId, source);
  } catch (error) {
    console.error('[App] Failed to open workspace:', error);
    alert(`Failed to open: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
```

- [ ] **Step 4: Replace `handleTreeFileSelect` with a version that handles directory workspaces**

```tsx
const handleTreeFileSelect = async (paths: string[]) => {
  if (!activeWorkspace || paths.length === 0) return;
  const source = activeWorkspace.source;
  if (source.type === 'directory' && !source.dirHandle) return;
  if (source.type === 'zip' && !source.file) return;

  const fileLabel = paths.length === 1 ? paths[0] : `${paths.length} files`;

  updateWorkspace(activeWorkspace.id, {
    selectedFilePaths: paths,
    parsedEntries: [],
    columns: [],
    filterState: { globalSearch: '', columnFilters: {} },
    parseState: { fileName: fileLabel, status: 'detecting', progress: 0 },
    status: 'parsing',
  });

  try {
    const allParsedFiles: Array<{ path: string; entries: ParsedLogEntry[]; columns: ColumnDef[] }> = [];

    for (const path of paths) {
      let content: string;
      if (source.type === 'directory' && source.dirHandle) {
        content = await FilePickerService.readFileFromDirectory(source.dirHandle, path);
      } else if (source.type === 'zip' && source.file) {
        content = await zipService.extractFile(source.file, path);
      } else {
        continue;
      }

      let fileEntries: ParsedLogEntry[] = [];
      let fileColumns: ColumnDef[] = [];
      await parseService.parseFile(content, path, progress => {
        if (progress.parserId && progress.parserName && progress.columns) {
          fileColumns = progress.columns;
        }
        fileEntries = progress.entries;
      });
      allParsedFiles.push({ path, entries: fileEntries, columns: fileColumns });
    }

    const mergedEntries = mergeLogEntries(allParsedFiles);
    const columns = allParsedFiles[0]?.columns || [];
    updateWorkspace(activeWorkspace.id, {
      parsedEntries: mergedEntries,
      columns,
      parseState: {
        fileName: fileLabel,
        status: 'complete',
        progress: 100,
        totalEntries: mergedEntries.length,
      },
      status: 'ready',
    });
  } catch (error) {
    console.error('[App] Failed to parse files:', error);
    updateWorkspace(activeWorkspace.id, {
      parseState: { fileName: fileLabel, status: 'error', progress: 0, error: String(error) },
      status: 'error',
    });
  }
};
```

- [ ] **Step 5: Add drag-and-drop handlers inside the `App` function**

```tsx
const handleDragEnter = (e: React.DragEvent) => {
  e.preventDefault();
  dragCounter.current++;
  setIsDragging(true);
};

const handleDragOver = (e: React.DragEvent) => {
  e.preventDefault();
};

const handleDragLeave = () => {
  dragCounter.current--;
  if (dragCounter.current === 0) setIsDragging(false);
};

const handleDrop = async (e: React.DragEvent) => {
  e.preventDefault();
  dragCounter.current = 0;
  setIsDragging(false);
  const items = Array.from(e.dataTransfer.items).filter(item => item.kind === 'file');
  for (const item of items) {
    const source = await FilePickerService.detectDropSource(item);
    if (source) await handleWorkspaceOpen(source);
  }
};
```

- [ ] **Step 6: Update the keyboard shortcut handler (Ctrl+O)**

Find the `Ctrl+O` handler and replace its body:

```tsx
if (e.key === 'o' && (e.ctrlKey || e.metaKey)) {
  e.preventDefault();
  const source = await FilePickerService.pickFile();
  if (source) await handleWorkspaceOpen(source);
}
```

- [ ] **Step 7: Update the root `<div>` to include drag-and-drop and the overlay**

Replace `<div className="app">` with:

```tsx
<div
  className="app"
  onDragEnter={handleDragEnter}
  onDragOver={handleDragOver}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
>
  {isDragging && (
    <div className="drop-overlay">
      <span className="drop-overlay-label">Drop to open</span>
    </div>
  )}
```

- [ ] **Step 8: Replace the sidebar content (PackageDock + LOAD toolbar → WorkspaceList)**

Replace the entire `<aside className="side-panel">` block with:

```tsx
<aside className="side-panel" style={{ width: `${sidebarResize.size}px` }}>
  <WorkspaceList
    workspaces={workspaces}
    activeWorkspaceId={activeWorkspaceId}
    onWorkspaceSelect={async (id) => {
      const ws = workspaces.find(w => w.id === id);
      if (!ws) return;
      if (ws.status === 'stale') {
        const reloaded = await reloadStaleWorkspace(id);
        if (reloaded) {
          await openWorkspaceContent(id, ws.source);
        } else {
          // Auto-reload failed — prompt for re-pick
          const source = ws.source.type === 'directory'
            ? await FilePickerService.pickDirectory()
            : await FilePickerService.pickFile();
          if (source) await handleWorkspaceOpen(source);
        }
      } else {
        switchWorkspace(id);
      }
    }}
    onWorkspaceClose={removeWorkspace}
    onWorkspaceRename={renameWorkspace}
    onPickFile={async () => {
      const source = await FilePickerService.pickFile();
      if (source) await handleWorkspaceOpen(source);
    }}
    onPickDirectory={async () => {
      const source = await FilePickerService.pickDirectory();
      if (source) await handleWorkspaceOpen(source);
    }}
  />
  <div className="side-panel-content">
    <FileTree
      entries={activeWorkspace?.fileEntries || []}
      selectedPaths={activeWorkspace?.selectedFilePaths || []}
      onFileSelect={handleTreeFileSelect}
      sourceType={activeWorkspace?.source.type}
      singleFileName={
        activeWorkspace?.source.type === 'file' && activeWorkspace.source.file
          ? activeWorkspace.source.file.name
          : undefined
      }
    />
  </div>
</aside>
```

- [ ] **Step 9: Rename all `activePackage` references to `activeWorkspace` in the JSX**

In the content area and footer, replace every `activePackage` with `activeWorkspace`:
- `activePackage?.parsedEntries` → `activeWorkspace?.parsedEntries`
- `activePackage?.columns` → `activeWorkspace?.columns`
- `activePackage?.filterState` → `activeWorkspace?.filterState`
- `activePackage?.parseState` → `activeWorkspace?.parseState`
- `activePackage?.id` → `activeWorkspace?.id`

Also update the filter handlers (`handleGlobalSearchChange`, `handleFilterStateChange`) to reference `activeWorkspace` instead of `activePackage`.

- [ ] **Step 10: Type-check and smoke-test**

```bash
npm run type-check
npm run dev
```

Expected: no TypeScript errors. At http://localhost:5173/WebLogViewer/:
- "+" button appears in the workspace list header
- Clicking "+" shows "Open file…" / "Open folder…" dropdown
- Opening a ZIP file shows its tree and parses on click
- Opening a single log file auto-parses immediately
- Opening a folder enumerates and shows the file tree
- Dragging a file over the window shows the drop overlay
- Dropping opens the workspace

- [ ] **Step 11: Commit**

```bash
git add src/App.tsx
git commit -m "feat: update App for workspace UX (open menu, drag-drop, WorkspaceList)"
```

---

## Task 8: Update CSS

**Files:**
- Modify: `src/styles/main.css`

- [ ] **Step 1: Remove old package-dock and toolbar styles**

Find and delete the CSS blocks for these selectors (search for each):
- `.package-dock`, `.package-dock-header`, `.package-dock-list`
- `.package-chip`, `.package-status-icon`, `.package-name`, `.package-state`, `.package-memory`, `.package-close`
- `.dock-label`, `.dock-count`
- `.sidebar-toolbar`, `.toolbar-action`, `.toolbar-context`, `.context-label`, `.context-value`, `.file-input-hidden`
- `.action-label`, `.action-shortcut`

- [ ] **Step 2: Add WorkspaceList, drag overlay, and single-file tree styles**

Append to `src/styles/main.css`:

```css
/* ===== WorkspaceList ===== */
.workspace-list {
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.workspace-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  border-bottom: 1px solid var(--border);
}

.workspace-list-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
}

.workspace-add-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}

.workspace-add-btn:hover {
  color: var(--text-primary);
}

.workspace-open-menu-wrapper {
  position: relative;
}

.workspace-open-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  z-index: 100;
  min-width: 140px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.workspace-open-menu-item {
  display: block;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}

.workspace-open-menu-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.workspace-list-items {
  overflow-y: auto;
  max-height: 180px;
}

.workspace-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  cursor: pointer;
  border-left: 2px solid transparent;
  font-size: 12px;
  color: var(--text-secondary);
  user-select: none;
}

.workspace-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.workspace-item.active {
  background: var(--bg-secondary);
  border-left-color: var(--accent);
  color: var(--text-primary);
}

.workspace-source-icon {
  flex-shrink: 0;
  font-size: 13px;
}

.workspace-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.workspace-name-input {
  flex: 1;
  background: var(--bg-primary);
  border: 1px solid var(--accent);
  border-radius: 2px;
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  padding: 1px 4px;
  outline: none;
  min-width: 0;
}

.workspace-status-dot {
  font-size: 10px;
  flex-shrink: 0;
}

.workspace-status-dot.status-parsing { color: var(--accent); }
.workspace-status-dot.status-ready   { color: var(--text-muted); }
.workspace-status-dot.status-error   { color: #f85149; }
.workspace-status-dot.status-stale   { color: var(--text-muted); }

.workspace-close-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  font-size: 14px;
  line-height: 1;
  flex-shrink: 0;
  opacity: 0;
}

.workspace-item:hover .workspace-close-btn,
.workspace-item.active .workspace-close-btn {
  opacity: 1;
}

.workspace-close-btn:hover {
  color: var(--text-primary);
}

/* ===== Drag-and-drop overlay ===== */
.drop-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  border: 2px dashed var(--accent);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.drop-overlay-label {
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 500;
  letter-spacing: 1px;
}

/* ===== Single-file tree label ===== */
.file-tree-single-file {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  color: var(--accent);
  font-size: 12px;
}

.file-tree-single-icon {
  flex-shrink: 0;
}

.file-tree-single-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 3: Check that CSS variables used above exist in main.css**

Verify `--border`, `--accent`, `--text-muted`, `--text-primary`, `--text-secondary`, `--bg-secondary`, `--bg-hover`, `--bg-primary` are defined (they are if the existing theme uses them — confirm by searching for `:root {` in main.css).

- [ ] **Step 4: Run dev server and visually verify**

```bash
npm run dev
```

Check at http://localhost:5173/WebLogViewer/:
- "WORKSPACES" label with "+" button in sidebar
- "+" reveals "Open file…" / "Open folder…" dropdown
- Workspace rows show type icon, name, status dot, and a close button that appears on hover
- Active workspace has a left accent bar
- Double-clicking a name switches to an input field; Enter commits, Escape cancels
- Dragging a file over the window dims the app and shows a dashed border with "Drop to open"

- [ ] **Step 5: Commit**

```bash
git add src/styles/main.css
git commit -m "style: update CSS for workspace list and drag overlay"
```

---

## Task 9: Remove old files

**Files:**
- Delete: `src/hooks/usePackageManager.ts`
- Delete: `src/services/packageStorage.ts`
- Delete: `src/components/PackageDock/PackageDock.tsx` (and directory)

- [ ] **Step 1: Delete the old files**

```bash
rm src/hooks/usePackageManager.ts
rm src/services/packageStorage.ts
rm -rf src/components/PackageDock
```

- [ ] **Step 2: Final type-check and build**

```bash
npm run type-check
npm run build
```

Expected: no TypeScript errors, build succeeds with output in `dist/`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove old package files (replaced by workspace)"
```
