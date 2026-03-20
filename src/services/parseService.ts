// Parse Service - Promise-based wrapper for parse worker

import type { ParseWorkerRequest, ParseWorkerResponse } from '../models/workerMessages';
import type { ParsedLogEntry, ColumnDef, ParsedFileResult } from '../models/types';

export interface ParseProgress {
  parserId?: string;
  parserName?: string;
  columns?: ColumnDef[];
  entries: ParsedLogEntry[];
  progress: number;
  totalEntries?: number;
}

export type ParseProgressCallback = (progress: ParseProgress) => void;

export class ParseService {
  private worker: Worker | null = null;

  async parseFile(
    content: string,
    fileName: string,
    onProgress: ParseProgressCallback
  ): Promise<ParsedFileResult> {
    // Create new worker for each parse operation
    this.worker = new Worker(new URL('../workers/parseWorker.ts', import.meta.url), {
      type: 'module',
    });

    return new Promise((resolve, reject) => {
      let parserId: string | undefined;
      let parserName: string | undefined;
      let columns: ColumnDef[] | undefined;
      let allEntries: ParsedLogEntry[] = [];

      this.worker!.onmessage = (e: MessageEvent<ParseWorkerResponse>) => {
        const response = e.data;

        switch (response.type) {
          case 'parser-detected':
            parserId = response.parserId;
            parserName = response.parserName;
            columns = response.columns;

            onProgress({
              parserId,
              parserName,
              columns,
              entries: [],
              progress: 0,
            });
            break;

          case 'batch':
            allEntries = allEntries.concat(response.entries);

            onProgress({
              parserId,
              parserName,
              columns,
              entries: allEntries,
              progress: response.progress,
            });
            break;

          case 'complete':
            if (!parserId || !parserName || !columns) {
              reject(new Error('Parser detection failed'));
              return;
            }

            resolve({
              parserId,
              parserName,
              columns,
              totalEntries: response.totalEntries,
            });

            // Terminate worker after completion
            this.worker?.terminate();
            this.worker = null;
            break;

          case 'error':
            reject(new Error(response.message));
            this.worker?.terminate();
            this.worker = null;
            break;
        }
      };

      this.worker!.onerror = (error) => {
        reject(new Error(`Worker error: ${error.message}`));
        this.worker?.terminate();
        this.worker = null;
      };

      const request: ParseWorkerRequest = {
        type: 'parse',
        content,
        fileName,
      };

      this.worker!.postMessage(request);
    });
  }

  cancel() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
