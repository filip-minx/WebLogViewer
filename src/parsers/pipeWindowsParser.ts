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
    const maxSamples = Math.min(sampleLines.length, 50);

    for (let i = 0; i < maxSamples; i++) {
      const line = sampleLines[i].trim();
      if (line && this.entryPattern.test(line)) {
        matchCount++;
      }
    }

    const matchRate = matchCount / maxSamples;

    // High confidence if 70%+ lines match
    if (matchRate >= 0.7) return 95;
    // Medium confidence if 50%+ lines match (could be multiline entries)
    if (matchRate >= 0.5) return 80;
    // Low confidence if 30%+ lines match
    if (matchRate >= 0.3) return 60;

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
          raw: trimmedLine,
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
        // Continuation line - append to current entry
        if (currentEntry) {
          currentEntry.raw += '\n' + trimmedLine;
          currentEntry.message = (currentEntry.message || '') + '\n' + trimmedLine;
          currentEntry.fields.message = currentEntry.message;
        } else {
          // No current entry - treat as standalone raw entry
          currentEntry = {
            rowId: this.generateRowId(lineNumber),
            lineNumber,
            raw: trimmedLine,
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
      { id: 'lineNumber', header: 'Line', type: 'number' },
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
