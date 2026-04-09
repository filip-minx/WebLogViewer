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
      const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' }) as FileSystemDirectoryHandle;
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
