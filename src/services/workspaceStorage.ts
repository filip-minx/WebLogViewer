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
