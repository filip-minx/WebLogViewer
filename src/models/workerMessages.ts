// Worker communication contracts

import type { ZipEntryMetadata, ParsedLogEntry, ColumnDef } from './types';

// ============ ZIP WORKER ============

export type ZipWorkerRequest =
  | { type: 'enumerate'; file: File }
  | { type: 'extract'; file: File; entryPath: string };

export type ZipWorkerResponse =
  | { type: 'enumerate-success'; entries: ZipEntryMetadata[] }
  | { type: 'extract-success'; content: string }
  | { type: 'error'; message: string };

// ============ PARSE WORKER ============

export type ParseWorkerRequest = {
  type: 'parse';
  content: string;
  fileName: string;
};

export type ParseWorkerResponse =
  | { type: 'parser-detected'; parserId: string; parserName: string; columns: ColumnDef[] }
  | { type: 'batch'; entries: ParsedLogEntry[]; progress: number }
  | { type: 'complete'; totalEntries: number }
  | { type: 'error'; message: string };

// ============ QUERY WORKER ============

export type QueryWorkerRequest = {
  type: 'filter';
  entries: ParsedLogEntry[];
  globalSearch: string;
  columnFilters: Record<string, any>;
};

export type QueryWorkerResponse =
  | { type: 'filter-success'; filteredEntries: ParsedLogEntry[] }
  | { type: 'error'; message: string };
