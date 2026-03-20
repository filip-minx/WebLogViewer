// Parse Worker - Handles parser detection and incremental parsing

import { detectParser } from '../parsers/registry';
import type { ParseWorkerRequest, ParseWorkerResponse } from '../models/workerMessages';
import type { ParsedLogEntry } from '../models/types';

const BATCH_SIZE = 1000; // Emit entries in batches of 1000
const SAMPLE_SIZE = 50; // First 50 lines for detection

self.onmessage = async (e: MessageEvent<ParseWorkerRequest>) => {
  const request = e.data;

  try {
    if (request.type === 'parse') {
      await parseFile(request.content, request.fileName);
    }
  } catch (error) {
    const response: ParseWorkerResponse = {
      type: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    self.postMessage(response);
  }
};

async function parseFile(content: string, fileName: string) {
  // Split into lines for sampling
  const allLines = content.split('\n');

  // Take sample for detection
  const sampleLines = allLines.slice(0, SAMPLE_SIZE);

  // Detect parser
  const parser = detectParser(sampleLines, fileName);

  // Send parser detection result
  const detectionResponse: ParseWorkerResponse = {
    type: 'parser-detected',
    parserId: parser.id,
    parserName: parser.name,
    columns: parser.columns(),
  };
  self.postMessage(detectionResponse);

  // Parse entries
  let totalEntries = 0;
  let batch: ParsedLogEntry[] = [];
  const estimatedTotal = allLines.length;

  // Create async iterable from lines
  async function* lineGenerator() {
    for (const line of allLines) {
      yield line;
    }
  }

  // Parse and emit in batches
  for await (const entry of parser.parseEntries(lineGenerator())) {
    batch.push(entry);
    totalEntries++;

    if (batch.length >= BATCH_SIZE) {
      // Emit batch
      const progress = Math.min(100, Math.round((totalEntries / estimatedTotal) * 100));
      const batchResponse: ParseWorkerResponse = {
        type: 'batch',
        entries: batch,
        progress,
      };
      self.postMessage(batchResponse);

      // Reset batch
      batch = [];
    }
  }

  // Emit final batch if any
  if (batch.length > 0) {
    const batchResponse: ParseWorkerResponse = {
      type: 'batch',
      entries: batch,
      progress: 100,
    };
    self.postMessage(batchResponse);
  }

  // Send completion
  const completeResponse: ParseWorkerResponse = {
    type: 'complete',
    totalEntries,
  };
  self.postMessage(completeResponse);
}
