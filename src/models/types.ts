// Core data structures for WebLogAnalyzer

export interface ParsedLogEntry {
  rowId: string;
  lineNumber: number;
  raw: string;
  timestamp?: string;
  level?: string;
  source?: string;
  message?: string;
  fields: Record<string, string | number | boolean | null>;
}

export interface ZipEntryMetadata {
  path: string;
  uncompressedSize: number;
  compressedSize: number;
  isDirectory: boolean;
  extension: string;
}

export type ColumnType = 'text' | 'timestamp' | 'enum' | 'number' | 'boolean';

export type FilterMode = 'contains' | 'equals' | 'range' | 'multiselect';

export interface ColumnDef {
  id: string;
  header: string;
  type: ColumnType;
  filterMode?: FilterMode;
  enumValues?: string[];
}

export type FilterValue =
  | string
  | number
  | boolean
  | { min?: number; max?: number }
  | { start?: string; end?: string }
  | string[];

export interface FilterState {
  globalSearch: string;
  columnFilters: Record<string, FilterValue>;
}

export interface FileParseState {
  fileName: string;
  status: 'detecting' | 'parsing' | 'complete' | 'error';
  progress: number; // 0-100
  totalEntries?: number;
  parserId?: string;
  parserName?: string;
  error?: string;
}

export interface ParsedFileResult {
  parserId: string;
  parserName: string;
  columns: ColumnDef[];
  totalEntries: number;
}

// Package management types
export type PackageStatus = 'parsing' | 'ready' | 'error' | 'stale';

export interface LogPackage {
  id: string;
  name: string; // ZIP filename
  file: File | null; // null if stale/persisted
  zipEntries: ZipEntryMetadata[];
  selectedFilePaths: string[];
  parsedEntries: ParsedLogEntry[];
  columns: ColumnDef[];
  filterState: FilterState;
  parseState: FileParseState | null;
  status: PackageStatus;
  memorySize: number; // Estimated size in bytes
  lastAccessed: number; // timestamp
  error?: string;
}

export interface PackageMetadata {
  id: string;
  name: string;
  lastAccessed: number;
  selectedFilePaths: string[];
  filterState: FilterState;
}
