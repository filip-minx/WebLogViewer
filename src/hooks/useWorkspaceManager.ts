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
  const activeWorkspaceIdRef = useRef<string | null>(null);
  const workspacesRef = useRef<Workspace[]>([]);

  useEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspaceId;
  }, [activeWorkspaceId]);

  useEffect(() => {
    workspacesRef.current = workspaces;
  }, [workspaces]);

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
          if (w.id !== ws.id || w.id === activeWorkspaceIdRef.current) return w;
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
    const remaining = workspacesRef.current.filter(ws => ws.id !== id);
    const nextActiveId = activeWorkspaceIdRef.current === id
      ? (remaining[0]?.id ?? null)
      : activeWorkspaceIdRef.current;
    const metadata: WorkspaceMetadata[] = remaining.map(ws => ({
      id: ws.id,
      name: ws.name,
      sourceType: ws.source.type,
      lastAccessed: ws.lastAccessed,
      selectedFilePaths: ws.selectedFilePaths,
      filterState: ws.filterState,
    }));
    WorkspaceStorage.saveWorkspaces(metadata);
    WorkspaceStorage.saveActiveWorkspace(nextActiveId);
    setWorkspaces(remaining);
    setActiveWorkspaceId(nextActiveId);
  }, []);

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
      if (!ws || ws.status !== 'stale') return false;

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
