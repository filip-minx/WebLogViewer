// ZIP Worker - Handles ZIP enumeration and extraction
// Uses fflate for client-side decompression

import { unzip, unzipSync, strFromU8 } from 'fflate';
import type { ZipWorkerRequest, ZipWorkerResponse } from '../models/workerMessages';
import type { ZipEntryMetadata } from '../models/types';

self.onmessage = async (e: MessageEvent<ZipWorkerRequest>) => {
  const request = e.data;

  try {
    switch (request.type) {
      case 'enumerate': {
        const entries = await enumerateZipEntries(request.file);
        const response: ZipWorkerResponse = {
          type: 'enumerate-success',
          entries,
        };
        self.postMessage(response);
        break;
      }

      case 'extract': {
        const content = await extractZipEntry(request.file, request.entryPath);
        const response: ZipWorkerResponse = {
          type: 'extract-success',
          content,
        };
        self.postMessage(response);
        break;
      }
    }
  } catch (error) {
    const response: ZipWorkerResponse = {
      type: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    self.postMessage(response);
  }
};

async function enumerateZipEntries(file: File): Promise<ZipEntryMetadata[]> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  return new Promise((resolve, reject) => {
    unzip(uint8Array, { filter: () => false }, (err, unzipped) => {
      if (err) {
        reject(err);
        return;
      }

      // Get metadata without extracting content
      const entries: ZipEntryMetadata[] = [];

      // Re-parse to get metadata
      try {
        const unzippedSync = unzipSync(uint8Array, { filter: () => false });

        // Parse ZIP central directory for metadata
        // For now, extract all entries to get metadata
        const fullUnzip = unzipSync(uint8Array);

        for (const [path, data] of Object.entries(fullUnzip)) {
          const isDirectory = path.endsWith('/');
          const extension = isDirectory ? '' : path.split('.').pop() || '';

          entries.push({
            path,
            uncompressedSize: data.length,
            compressedSize: data.length, // fflate doesn't expose compressed size easily
            isDirectory,
            extension,
          });
        }

        resolve(entries);
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function extractZipEntry(file: File, entryPath: string): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  const unzipped = unzipSync(uint8Array);

  if (!(entryPath in unzipped)) {
    throw new Error(`Entry not found: ${entryPath}`);
  }

  const data = unzipped[entryPath];

  // Convert to string
  return strFromU8(data);
}
