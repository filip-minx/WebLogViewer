// Package storage - Persist package metadata across sessions

import type { PackageMetadata } from '../models/types';

const STORAGE_KEY = 'weblog-packages';
const ACTIVE_PACKAGE_KEY = 'weblog-active-package';
const DB_NAME = 'weblog-analyzer-db';
const DB_VERSION = 1;
const HANDLE_STORE = 'file-handles';

export class PackageStorage {
  private static db: IDBDatabase | null = null;

  /**
   * Initialize IndexedDB for file handle storage
   */
  private static async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store for file handles
        if (!db.objectStoreNames.contains(HANDLE_STORE)) {
          db.createObjectStore(HANDLE_STORE);
        }
      };
    });
  }

  static savePackages(packages: PackageMetadata[]): void {
    try {
      const t0 = performance.now();
      console.log(`[PackageStorage][${t0.toFixed(2)}ms] Saving to localStorage:`, packages.length, 'packages');
      localStorage.setItem(STORAGE_KEY, JSON.stringify(packages));
      const t1 = performance.now();
      console.log(`[PackageStorage][${t1.toFixed(2)}ms] Saved successfully (took ${(t1 - t0).toFixed(2)}ms)`);
    } catch (error) {
      console.error('[PackageStorage] Failed to save packages:', error);
    }
  }

  static loadPackages(): PackageMetadata[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      console.log('[PackageStorage] Loading from localStorage. Raw data:', stored?.substring(0, 100) || 'none');
      if (!stored) return [];
      const packages = JSON.parse(stored);
      console.log('[PackageStorage] Loaded', packages.length, 'packages');
      return packages;
    } catch (error) {
      console.error('[PackageStorage] Failed to load packages:', error);
      return [];
    }
  }

  static saveActivePackage(packageId: string | null): void {
    try {
      if (packageId) {
        localStorage.setItem(ACTIVE_PACKAGE_KEY, packageId);
      } else {
        localStorage.removeItem(ACTIVE_PACKAGE_KEY);
      }
    } catch (error) {
      console.error('Failed to save active package:', error);
    }
  }

  static loadActivePackage(): string | null {
    try {
      return localStorage.getItem(ACTIVE_PACKAGE_KEY);
    } catch (error) {
      console.error('Failed to load active package:', error);
      return null;
    }
  }

  /**
   * Save a file handle to IndexedDB
   */
  static async saveFileHandle(packageId: string, handle: FileSystemFileHandle): Promise<void> {
    try {
      console.log('[PackageStorage] Saving file handle for package:', packageId, 'handle:', handle.name);
      const db = await this.initDB();
      const transaction = db.transaction([HANDLE_STORE], 'readwrite');
      const store = transaction.objectStore(HANDLE_STORE);

      await new Promise<void>((resolve, reject) => {
        const request = store.put(handle, packageId);
        request.onsuccess = () => {
          console.log('[PackageStorage] Successfully saved file handle for:', packageId);
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('[PackageStorage] Failed to save file handle:', error);
    }
  }

  /**
   * Load a file handle from IndexedDB
   */
  static async loadFileHandle(packageId: string): Promise<FileSystemFileHandle | null> {
    try {
      console.log('[PackageStorage] Loading file handle for package:', packageId);
      const db = await this.initDB();
      const transaction = db.transaction([HANDLE_STORE], 'readonly');
      const store = transaction.objectStore(HANDLE_STORE);

      return new Promise<FileSystemFileHandle | null>((resolve, reject) => {
        const request = store.get(packageId);
        request.onsuccess = () => {
          const handle = request.result || null;
          console.log('[PackageStorage] Loaded file handle for:', packageId, 'handle:', handle?.name || 'none');
          resolve(handle);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('[PackageStorage] Failed to load file handle:', error);
      return null;
    }
  }

  /**
   * Delete a file handle from IndexedDB
   */
  static async deleteFileHandle(packageId: string): Promise<void> {
    try {
      console.log('[PackageStorage] Deleting file handle for package:', packageId);
      const db = await this.initDB();
      const transaction = db.transaction([HANDLE_STORE], 'readwrite');
      const store = transaction.objectStore(HANDLE_STORE);

      await new Promise<void>((resolve, reject) => {
        const request = store.delete(packageId);
        request.onsuccess = () => {
          console.log('[PackageStorage] File handle deleted successfully for:', packageId);
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('[PackageStorage] Failed to delete file handle:', error);
    }
  }

  static clearAll(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(ACTIVE_PACKAGE_KEY);

      // Clear IndexedDB
      if (this.db) {
        this.db.close();
        this.db = null;
      }
      indexedDB.deleteDatabase(DB_NAME);
    } catch (error) {
      console.error('Failed to clear storage:', error);
    }
  }
}
