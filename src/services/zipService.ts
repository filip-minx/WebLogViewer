// ZIP Service - Promise-based wrapper for ZIP worker

import type { ZipWorkerRequest, ZipWorkerResponse } from '../models/workerMessages';
import type { ZipEntryMetadata } from '../models/types';

export class ZipService {
  private worker: Worker;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }>();

  constructor() {
    this.worker = new Worker(new URL('../workers/zipWorker.ts', import.meta.url), {
      type: 'module',
    });

    this.worker.onmessage = (e: MessageEvent<ZipWorkerResponse & { requestId?: number }>) => {
      const response = e.data;
      const requestId = response.requestId;

      if (requestId === undefined) {
        // Handle responses without request ID (legacy)
        this.handleResponse(response);
        return;
      }

      const pending = this.pendingRequests.get(requestId);
      if (!pending) return;

      this.pendingRequests.delete(requestId);

      if (response.type === 'error') {
        pending.reject(new Error(response.message));
      } else {
        pending.resolve(response);
      }
    };
  }

  private handleResponse(response: ZipWorkerResponse) {
    // For backward compatibility - resolve first pending request
    const firstPending = this.pendingRequests.values().next().value;
    if (!firstPending) return;

    const requestId = this.pendingRequests.keys().next().value as number;
    this.pendingRequests.delete(requestId);

    if (response.type === 'error') {
      firstPending.reject(new Error(response.message));
    } else {
      firstPending.resolve(response);
    }
  }

  async enumerateEntries(file: File): Promise<ZipEntryMetadata[]> {
    const requestId = this.requestId++;
    const request: ZipWorkerRequest = { type: 'enumerate', file };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        resolve: (response: ZipWorkerResponse) => {
          if (response.type === 'enumerate-success') {
            resolve(response.entries);
          } else {
            reject(new Error('Unexpected response type'));
          }
        },
        reject,
      });

      this.worker.postMessage({ ...request, requestId });
    });
  }

  async extractFile(file: File, entryPath: string): Promise<string> {
    const requestId = this.requestId++;
    const request: ZipWorkerRequest = { type: 'extract', file, entryPath };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        resolve: (response: ZipWorkerResponse) => {
          if (response.type === 'extract-success') {
            resolve(response.content);
          } else {
            reject(new Error('Unexpected response type'));
          }
        },
        reject,
      });

      this.worker.postMessage({ ...request, requestId });
    });
  }

  terminate() {
    this.worker.terminate();
  }
}
