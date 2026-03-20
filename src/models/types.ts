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
