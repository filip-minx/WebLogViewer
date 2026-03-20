// Pipe-separated Windows log parser
// Format: 2026-03-20_13-11-24.795|ERROR|Source|Message

import { BaseParser } from './base';
import type { ParsedLogEntry, ColumnDef } from '../models/types';

export class PipeWindowsParser extends BaseParser {
  id = 'pipe-windows';
  name = 'Pipe-separated Windows Logs';

  // Pattern: YYYY-MM-DD_HH-MM-SS.mmm|LEVEL|Source|Message
  private readonly entryPattern = /^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.\d{3})\|([A-Z]+)\|([^|]+)\|(.*)$/;

  detect(sampleLines: string[], fileName: string): number {
    if (sampleLines.length === 0) return 0;

    let matchCount = 0;
    let nonEmptyCount = 0;
    const maxSamples = Math.min(sampleLines.length, 50);

    for (let i = 0; i < maxSamples; i++) {
      const line = sampleLines[i].trim();
      if (line) {
        nonEmptyCount++;
        if (this.entryPattern.test(line)) {
          matchCount++;
        }
      }
    }

    // If we found at least a few matches, this is likely the right parser
    // (many lines will be continuation lines in multiline entries)
    if (matchCount >= 5) return 95; // Need more matches than triple-pipe
    if (matchCount >= 3) return 80;
    if (matchCount >= 2) return 60;

    return 0;
  }

  async *parseEntries(input: AsyncIterable<string>): AsyncIterable<ParsedLogEntry> {
    let currentEntry: ParsedLogEntry | null = null;
    let lineNumber = 0;

    for await (const line of input) {
      lineNumber++;
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        // Empty line - if we have a current entry, append it
        if (currentEntry) {
          currentEntry.raw += '\n';
          currentEntry.message = (currentEntry.message || '') + '\n';
        }
        continue;
      }

      const match = this.entryPattern.exec(trimmedLine);

      if (match) {
        // This is a new entry - yield the previous one if exists
        if (currentEntry) {
          yield currentEntry;
        }

        // Start new entry
        const [, timestamp, level, source, message] = match;
        currentEntry = {
          rowId: this.generateRowId(lineNumber, timestamp),
          lineNumber,
          raw: line,
          timestamp,
          level,
          source,
          message,
          fields: {
            timestamp,
            level,
            source,
            message,
          },
        };
      } else {
        // Continuation line - append to current entry (preserve original whitespace)
        if (currentEntry) {
          currentEntry.raw += '\n' + line;
          currentEntry.message = (currentEntry.message || '') + '\n' + line;
          currentEntry.fields.message = currentEntry.message;
        } else {
          // No current entry - treat as standalone raw entry
          currentEntry = {
            rowId: this.generateRowId(lineNumber),
            lineNumber,
            raw: line,
            fields: {},
          };
        }
      }
    }

    // Yield final entry
    if (currentEntry) {
      yield currentEntry;
    }
  }

  columns(): ColumnDef[] {
    return [
      { id: 'timestamp', header: 'Timestamp', type: 'timestamp', filterMode: 'range' },
      {
        id: 'level',
        header: 'Level',
        type: 'enum',
        filterMode: 'multiselect',
        enumValues: ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'],
      },
      { id: 'source', header: 'Source', type: 'text', filterMode: 'contains' },
      { id: 'message', header: 'Message', type: 'text', filterMode: 'contains' },
    ];
  }
}
