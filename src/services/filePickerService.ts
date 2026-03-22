// File picker service with File System Access API support and fallback

export interface FileWithHandle {
  file: File;
  handle?: FileSystemFileHandle;
}

export class FilePickerService {
  /**
   * Check if File System Access API is supported
   */
  static isSupported(): boolean {
    return 'showOpenFilePicker' in window;
  }

  /**
   * Pick a file using the modern API (with handle) or fallback to traditional input
   */
  static async pickFile(accept: string = '.zip'): Promise<FileWithHandle | null> {
    if (this.isSupported()) {
      console.log('[FilePickerService] Using File System Access API');
      try {
        const [fileHandle] = await window.showOpenFilePicker({
          types: [
            {
              description: 'ZIP Archives',
              accept: {
                'application/zip': ['.zip'],
              },
            },
          ],
          multiple: false,
        });

        const file = await fileHandle.getFile();
        console.log('[FilePickerService] Got file with handle:', file.name);
        return { file, handle: fileHandle };
      } catch (error) {
        // User cancelled or permission denied
        if (error instanceof Error && error.name === 'AbortError') {
          console.log('[FilePickerService] User cancelled file picker');
          return null;
        }
        console.error('[FilePickerService] File picker error:', error);
        throw error;
      }
    } else {
      console.log('[FilePickerService] Falling back to traditional file input');
      // Fallback: use traditional file input
      return new Promise<FileWithHandle | null>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;

        input.onchange = () => {
          const file = input.files?.[0];
          resolve(file ? { file } : null);
        };

        input.oncancel = () => resolve(null);

        input.click();
      });
    }
  }

  /**
   * Get file from stored handle (requires user permission)
   */
  static async getFileFromHandle(handle: FileSystemFileHandle): Promise<File | null> {
    try {
      console.log('[FilePickerService] Getting file from handle:', handle.name);
      // Check if we still have permission
      const permission = await handle.queryPermission({ mode: 'read' });
      console.log('[FilePickerService] Current permission:', permission);

      if (permission === 'granted') {
        const file = await handle.getFile();
        console.log('[FilePickerService] Got file without prompting:', file.name);
        return file;
      } else if (permission === 'prompt') {
        // Request permission
        console.log('[FilePickerService] Requesting permission...');
        const newPermission = await handle.requestPermission({ mode: 'read' });
        console.log('[FilePickerService] New permission:', newPermission);
        if (newPermission === 'granted') {
          const file = await handle.getFile();
          console.log('[FilePickerService] Got file after prompt:', file.name);
          return file;
        } else {
          console.log('[FilePickerService] Permission denied by user');
        }
      } else {
        console.log('[FilePickerService] Permission denied (not prompt or granted)');
      }

      return null;
    } catch (error) {
      console.error('[FilePickerService] Failed to get file from handle:', error);
      return null;
    }
  }

  /**
   * Verify a handle is still valid and accessible
   */
  static async verifyHandle(handle: FileSystemFileHandle): Promise<boolean> {
    try {
      const permission = await handle.queryPermission({ mode: 'read' });
      return permission === 'granted' || permission === 'prompt';
    } catch (error) {
      return false;
    }
  }
}
