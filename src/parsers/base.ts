// Base parser interface and utilities

import type { ParsedLogEntry, ColumnDef } from '../models/types';

export interface LogParser {
  id: string;
  name: string;

  /**
   * Detect if this parser can handle the given log format
   * @param sampleLines First N lines of the file
   * @param fileName Name of the file being parsed
   * @returns Detection score (0-100, higher = better match)
   */
  detect(sampleLines: string[], fileName: string): number;

  /**
   * Parse log entries from input lines
   * @param input Async iterable of log lines
   * @returns Async iterable of parsed entries
   */
  parseEntries(input: AsyncIterable<string>): AsyncIterable<ParsedLogEntry>;

  /**
   * Get column definitions for this parser
   */
  columns(): ColumnDef[];
}

export abstract class BaseParser implements LogParser {
  abstract id: string;
  abstract name: string;
  abstract detect(sampleLines: string[], fileName: string): number;
  abstract parseEntries(input: AsyncIterable<string>): AsyncIterable<ParsedLogEntry>;
  abstract columns(): ColumnDef[];

  /**
   * Generate unique row ID
   */
  protected generateRowId(lineNumber: number, timestamp?: string): string {
    return `${lineNumber}-${timestamp || Date.now()}`;
  }

  /**
   * Split content into lines (async generator)
   */
  protected async *splitLines(content: string): AsyncIterable<string> {
    const lines = content.split('\n');
    for (const line of lines) {
      yield line;
    }
  }
}
