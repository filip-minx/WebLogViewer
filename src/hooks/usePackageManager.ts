// Package manager hook - Handles multi-package lifecycle
//
// Persistence strategy:
// - Package metadata (names, filter state, etc.): Auto-saved every 10 seconds to localStorage
// - File handles: Saved IMMEDIATELY on load/reload to IndexedDB (not on interval)
//   This ensures handles are persisted even if user closes app right after loading
// - Package removal: Both metadata and handles removed IMMEDIATELY (not on interval)

import { useState, useEffect, useCallback, useRef } from 'react';
import { nanoid } from 'nanoid';
import type { LogPackage, FilterState, PackageMetadata } from '../models/types';
import { PackageStorage } from '../services/packageStorage';
import { FilePickerService } from '../services/filePickerService';

const STALE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const AUTO_SAVE_INTERVAL = 10 * 1000; // 10 seconds (for metadata only)

function estimateMemorySize(pkg: LogPackage): number {
  let size = 0;

  // Parsed entries
  size += pkg.parsedEntries.length * 500; // ~500 bytes per entry estimate

  // Raw strings in entries
  pkg.parsedEntries.forEach(entry => {
    size += entry.raw?.length || 0;
    size += entry.message?.length || 0;
  });

  // Columns
  size += pkg.columns.length * 100;

  // ZIP entries metadata
  size += pkg.zipEntries.length * 200;

  return size;
}

function createEmptyPackage(id: string, file: File, fileHandle?: FileSystemFileHandle): LogPackage {
  return {
    id,
    name: file.name,
    file,
    fileHandle,
    zipEntries: [],
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

export function usePackageManager() {
  const [packages, setPackages] = useState<LogPackage[]>([]);
  const [activePackageId, setActivePackageId] = useState<string | null>(null);
  const staleTimers = useRef<Map<string, number>>(new Map());

  // Load persisted packages on mount
  useEffect(() => {
    const loadPackages = async () => {
      const savedMetadata = PackageStorage.loadPackages();
      const savedActiveId = PackageStorage.loadActivePackage();

      console.log('[usePackageManager] Loading packages from storage. Found:', savedMetadata.length);

      if (savedMetadata.length > 0) {
        // Convert metadata to stale packages and restore file handles
        const stalePackages: LogPackage[] = await Promise.all(
          savedMetadata.map(async (meta) => {
            console.log('[usePackageManager] Loading package:', meta.name, 'id:', meta.id);
            const fileHandle = await PackageStorage.loadFileHandle(meta.id);

            return {
              id: meta.id,
              name: meta.name,
              file: null,
              fileHandle: fileHandle || undefined,
              zipEntries: [],
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

        console.log('[usePackageManager] Restored packages:', stalePackages.map(p => ({ name: p.name, handle: p.fileHandle?.name || 'none' })));
        setPackages(stalePackages);

        // Set active if valid
        if (savedActiveId && stalePackages.some(p => p.id === savedActiveId)) {
          console.log('[usePackageManager] Setting active package:', savedActiveId);
          setActivePackageId(savedActiveId);
        }
      } else {
        console.log('[usePackageManager] No saved packages found');
      }
    };

    loadPackages();
  }, []);

  // Auto-save package metadata to localStorage (not handles - those are saved immediately on load/reload)
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('[usePackageManager] Auto-save metadata triggered. Packages:', packages.length);

      const metadata: PackageMetadata[] = packages.map(pkg => ({
        id: pkg.id,
        name: pkg.name,
        lastAccessed: pkg.lastAccessed,
        selectedFilePaths: pkg.selectedFilePaths,
        filterState: pkg.filterState,
      }));

      console.log('[usePackageManager] Saving package metadata:', metadata.map(m => m.name));
      PackageStorage.savePackages(metadata);

      if (activePackageId) {
        console.log('[usePackageManager] Saving active package:', activePackageId);
        PackageStorage.saveActivePackage(activePackageId);
      }
    }, AUTO_SAVE_INTERVAL);

    return () => clearInterval(interval);
  }, [packages, activePackageId]);

  // Set up stale timers for inactive packages
  useEffect(() => {
    // Clear existing timers
    staleTimers.current.forEach(timer => clearTimeout(timer));
    staleTimers.current.clear();

    packages.forEach(pkg => {
      if (pkg.id === activePackageId || pkg.status === 'stale') return;

      const timeSinceAccess = Date.now() - pkg.lastAccessed;
      const remainingTime = Math.max(0, STALE_TIMEOUT - timeSinceAccess);

      const timer = setTimeout(() => {
        console.log('[usePackageManager] Package going stale:', pkg.name, 'has handle:', pkg.fileHandle?.name || 'none');
        setPackages(prev => prev.map(p => {
          if (p.id === pkg.id && p.id !== activePackageId) {
            const stalePackage = {
              ...p,
              file: null,
              parsedEntries: [],
              zipEntries: [],
              status: 'stale' as const,
              memorySize: 0,
              // Explicitly preserve fileHandle
              fileHandle: p.fileHandle,
            };
            console.log('[usePackageManager] Package now stale, fileHandle preserved:', stalePackage.fileHandle?.name || 'none');
            return stalePackage;
          }
          return p;
        }));
      }, remainingTime);

      staleTimers.current.set(pkg.id, timer);
    });

    return () => {
      staleTimers.current.forEach(timer => clearTimeout(timer));
      staleTimers.current.clear();
    };
  }, [packages, activePackageId]);

  const addPackage = useCallback((file: File, fileHandle?: FileSystemFileHandle) => {
    const id = nanoid();
    console.log('[usePackageManager] Adding package:', file.name, 'with handle:', fileHandle?.name || 'none');
    const newPackage = createEmptyPackage(id, file, fileHandle);

    setPackages(prev => [...prev, newPackage]);
    setActivePackageId(id);

    // Immediately save file handle to IndexedDB (not waiting for auto-save interval)
    // This ensures handle is persisted even if user closes app immediately
    if (fileHandle) {
      console.log('[usePackageManager] Immediately saving file handle for:', id);
      PackageStorage.saveFileHandle(id, fileHandle);
    }

    return id;
  }, []);

  const updatePackage = useCallback((id: string, updates: Partial<LogPackage>) => {
    setPackages(prev => prev.map(pkg => {
      if (pkg.id === id) {
        const updated = { ...pkg, ...updates, lastAccessed: Date.now() };

        // Update memory estimate if content changed
        if (updates.parsedEntries || updates.columns || updates.zipEntries) {
          updated.memorySize = estimateMemorySize(updated);
        }

        return updated;
      }
      return pkg;
    }));
  }, []);

  const removePackage = useCallback(async (id: string) => {
    const t0 = performance.now();
    console.log(`[usePackageManager][${t0.toFixed(2)}ms] Removing package:`, id);

    // Remove file handle from IndexedDB (must await to ensure it completes before app closes)
    await PackageStorage.deleteFileHandle(id);
    const t1 = performance.now();
    console.log(`[usePackageManager][${t1.toFixed(2)}ms] File handle deleted (took ${(t1 - t0).toFixed(2)}ms)`);

    // Calculate new active package ID before state update
    const isRemovingActive = activePackageId === id;
    let newActiveId: string | null = activePackageId;

    const t2 = performance.now();
    console.log(`[usePackageManager][${t2.toFixed(2)}ms] Calling setPackages (${(t2 - t0).toFixed(2)}ms elapsed)`);

    // Update packages state
    setPackages(prev => {
      const t3 = performance.now();
      console.log(`[usePackageManager][${t3.toFixed(2)}ms] Inside setPackages updater (${(t3 - t0).toFixed(2)}ms elapsed)`);

      const remaining = prev.filter(pkg => pkg.id !== id);

      // Determine new active if we're removing the active package
      if (isRemovingActive) {
        newActiveId = remaining.length > 0 ? remaining[0].id : null;
      }

      const t4 = performance.now();
      console.log(`[usePackageManager][${t4.toFixed(2)}ms] About to save to localStorage (${(t4 - t0).toFixed(2)}ms elapsed)`);

      // Immediately save to localStorage (synchronous)
      const metadata: PackageMetadata[] = remaining.map(pkg => ({
        id: pkg.id,
        name: pkg.name,
        lastAccessed: pkg.lastAccessed,
        selectedFilePaths: pkg.selectedFilePaths,
        filterState: pkg.filterState,
      }));
      PackageStorage.savePackages(metadata);

      const t5 = performance.now();
      console.log(`[usePackageManager][${t5.toFixed(2)}ms] Package removed and persisted. Remaining: ${remaining.length} (save took ${(t5 - t4).toFixed(2)}ms)`);

      return remaining;
    });

    // Update active package ID if needed
    if (isRemovingActive) {
      setActivePackageId(newActiveId);
      PackageStorage.saveActivePackage(newActiveId);
      console.log('[usePackageManager] Removed active package. New active:', newActiveId);
    }
  }, [activePackageId]);

  const switchPackage = useCallback((id: string) => {
    setActivePackageId(id);
    updatePackage(id, { lastAccessed: Date.now() });
  }, [updatePackage]);

  const getActivePackage = useCallback((): LogPackage | null => {
    return packages.find(pkg => pkg.id === activePackageId) || null;
  }, [packages, activePackageId]);

  const reloadStalePackage = useCallback(
    async (id: string, file?: File, fileHandle?: FileSystemFileHandle): Promise<File | null> => {
      console.log('[usePackageManager] Reloading stale package:', id);
      let actualFile: File | null = file || null;
      let actualHandle = fileHandle;

      // If no file provided, try to get it from stored handle
      if (!actualFile) {
        const pkg = packages.find(p => p.id === id);
        console.log('[usePackageManager] Package fileHandle:', pkg?.fileHandle?.name || 'none');
        if (pkg?.fileHandle) {
          console.log('[usePackageManager] Attempting to get file from stored handle...');
          const fileFromHandle = await FilePickerService.getFileFromHandle(pkg.fileHandle);
          if (fileFromHandle) {
            console.log('[usePackageManager] Successfully got file from handle:', fileFromHandle.name);
            actualFile = fileFromHandle;
            actualHandle = pkg.fileHandle;
          } else {
            console.log('[usePackageManager] Failed to get file from handle (permission denied or error)');
          }
        } else {
          console.log('[usePackageManager] No file handle available in package');
        }
      }

      if (!actualFile) {
        console.error('[usePackageManager] Cannot reload package: no file or handle available');
        return null;
      }

      updatePackage(id, {
        file: actualFile,
        fileHandle: actualHandle,
        status: 'parsing',
        lastAccessed: Date.now(),
      });
      setActivePackageId(id);

      // Immediately save file handle to IndexedDB (not waiting for auto-save interval)
      // This ensures handle is persisted even if user closes app immediately
      if (actualHandle) {
        console.log('[usePackageManager] Immediately saving file handle after reload for:', id);
        PackageStorage.saveFileHandle(id, actualHandle);
      }

      return actualFile;
    },
    [packages, updatePackage]
  );

  return {
    packages,
    activePackageId,
    addPackage,
    updatePackage,
    removePackage,
    switchPackage,
    getActivePackage,
    reloadStalePackage,
  };
}
