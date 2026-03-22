// Package manager hook - Handles multi-package lifecycle

import { useState, useEffect, useCallback, useRef } from 'react';
import { nanoid } from 'nanoid';
import type { LogPackage, FilterState, PackageMetadata } from '../models/types';
import { PackageStorage } from '../services/packageStorage';

const STALE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const AUTO_SAVE_INTERVAL = 10 * 1000; // 10 seconds

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

function createEmptyPackage(id: string, file: File): LogPackage {
  return {
    id,
    name: file.name,
    file,
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
    const savedMetadata = PackageStorage.loadPackages();
    const savedActiveId = PackageStorage.loadActivePackage();

    if (savedMetadata.length > 0) {
      // Convert metadata to stale packages
      const stalePackages: LogPackage[] = savedMetadata.map(meta => ({
        id: meta.id,
        name: meta.name,
        file: null,
        zipEntries: [],
        selectedFilePaths: meta.selectedFilePaths,
        parsedEntries: [],
        columns: [],
        filterState: meta.filterState,
        parseState: null,
        status: 'stale' as const,
        memorySize: 0,
        lastAccessed: meta.lastAccessed,
      }));

      setPackages(stalePackages);

      // Set active if valid
      if (savedActiveId && stalePackages.some(p => p.id === savedActiveId)) {
        setActivePackageId(savedActiveId);
      }
    }
  }, []);

  // Auto-save packages to localStorage
  useEffect(() => {
    const interval = setInterval(() => {
      const metadata: PackageMetadata[] = packages.map(pkg => ({
        id: pkg.id,
        name: pkg.name,
        lastAccessed: pkg.lastAccessed,
        selectedFilePaths: pkg.selectedFilePaths,
        filterState: pkg.filterState,
      }));

      PackageStorage.savePackages(metadata);
      if (activePackageId) {
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
        setPackages(prev => prev.map(p => {
          if (p.id === pkg.id && p.id !== activePackageId) {
            return {
              ...p,
              file: null,
              parsedEntries: [],
              zipEntries: [],
              status: 'stale' as const,
              memorySize: 0,
            };
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

  const addPackage = useCallback((file: File) => {
    const id = nanoid();
    const newPackage = createEmptyPackage(id, file);

    setPackages(prev => [...prev, newPackage]);
    setActivePackageId(id);

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

  const removePackage = useCallback((id: string) => {
    setPackages(prev => prev.filter(pkg => pkg.id !== id));

    if (activePackageId === id) {
      setPackages(prev => {
        const remaining = prev.filter(pkg => pkg.id !== id);
        setActivePackageId(remaining.length > 0 ? remaining[0].id : null);
        return remaining;
      });
    }
  }, [activePackageId]);

  const switchPackage = useCallback((id: string) => {
    setActivePackageId(id);
    updatePackage(id, { lastAccessed: Date.now() });
  }, [updatePackage]);

  const getActivePackage = useCallback((): LogPackage | null => {
    return packages.find(pkg => pkg.id === activePackageId) || null;
  }, [packages, activePackageId]);

  const reloadStalePackage = useCallback((id: string, file: File) => {
    updatePackage(id, {
      file,
      status: 'parsing',
      lastAccessed: Date.now(),
    });
    setActivePackageId(id);
  }, [updatePackage]);

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
