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
