// JSON Lines parser - one JSON object per line

import { BaseParser } from './base';
import type { ParsedLogEntry, ColumnDef } from '../models/types';

export class JsonLinesParser extends BaseParser {
  id = 'jsonlines';
  name = 'JSON Lines';

  private detectedColumns: Set<string> = new Set();

  detect(sampleLines: string[], fileName: string): number {
    if (sampleLines.length === 0) return 0;

    let jsonCount = 0;
    const maxSamples = Math.min(sampleLines.length, 50);

    for (let i = 0; i < maxSamples; i++) {
      const line = sampleLines[i].trim();
      if (!line) continue;

      try {
        const parsed = JSON.parse(line);
        if (typeof parsed === 'object' && parsed !== null) {
          jsonCount++;
        }
      } catch {
        // Not JSON
      }
    }

    const jsonRate = jsonCount / maxSamples;

    // High confidence if 80%+ lines are valid JSON objects
    if (jsonRate >= 0.8) return 90;
    if (jsonRate >= 0.5) return 70;

    return 0;
  }

  async *parseEntries(input: AsyncIterable<string>): AsyncIterable<ParsedLogEntry> {
    let lineNumber = 0;

    for await (const line of input) {
      lineNumber++;
      const trimmedLine = line.trim();

      if (!trimmedLine) continue;

      try {
        const parsed = JSON.parse(trimmedLine);

        if (typeof parsed !== 'object' || parsed === null) {
          // Not an object - treat as raw
          yield {
            rowId: this.generateRowId(lineNumber),
            lineNumber,
            raw: trimmedLine,
            fields: {},
          };
          continue;
        }

        // Collect all keys for column detection
        Object.keys(parsed).forEach(key => this.detectedColumns.add(key));

        // Extract common fields
        const timestamp = parsed.timestamp || parsed.time || parsed.ts || parsed['@timestamp'];
        const level = parsed.level || parsed.severity || parsed.loglevel;
        const message = parsed.message || parsed.msg || parsed.text;
        const source = parsed.source || parsed.logger || parsed.component;

        yield {
          rowId: this.generateRowId(lineNumber, timestamp),
          lineNumber,
          raw: trimmedLine,
          timestamp,
          level,
          source,
          message,
          fields: parsed,
        };
      } catch (error) {
        // Invalid JSON - treat as raw text
        yield {
          rowId: this.generateRowId(lineNumber),
          lineNumber,
          raw: trimmedLine,
          fields: {},
        };
      }
    }
  }

  columns(): ColumnDef[] {
    const baseColumns: ColumnDef[] = [
      { id: 'timestamp', header: 'Timestamp', type: 'timestamp', filterMode: 'range' },
      { id: 'level', header: 'Level', type: 'text', filterMode: 'contains' },
      { id: 'source', header: 'Source', type: 'text', filterMode: 'contains' },
      { id: 'message', header: 'Message', type: 'text', filterMode: 'contains' },
    ];

    // Add dynamic columns from detected fields
    const dynamicColumns: ColumnDef[] = Array.from(this.detectedColumns)
      .filter(key => !['timestamp', 'time', 'ts', '@timestamp', 'level', 'severity',
                       'loglevel', 'message', 'msg', 'text', 'source', 'logger', 'component'].includes(key))
      .map(key => ({
        id: `fields.${key}`,
        header: key,
        type: 'text' as const,
        filterMode: 'contains' as const,
      }));

    return [...baseColumns, ...dynamicColumns];
  }
}
