// Generic delimited parser - CSV, TSV, or other delimited formats

import { BaseParser } from './base';
import type { ParsedLogEntry, ColumnDef } from '../models/types';

export class GenericDelimitedParser extends BaseParser {
  id = 'generic-delimited';
  name = 'Delimited (CSV/TSV)';

  private delimiter: string = ',';
  private headers: string[] = [];

  detect(sampleLines: string[], fileName: string): number {
    if (sampleLines.length === 0) return 0;

    // Try to detect delimiter
    const delimiters = [',', '\t', ';', '|'];
    let bestDelimiter = ',';
    let bestScore = 0;

    for (const delimiter of delimiters) {
      const counts = sampleLines
        .slice(0, 10)
        .map(line => (line.match(new RegExp(`\\${delimiter}`, 'g')) || []).length);

      if (counts.length === 0) continue;

      // Check consistency - all lines should have similar count
      const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length;
      const variance = counts.reduce((sum, count) => sum + Math.pow(count - avgCount, 2), 0) / counts.length;

      if (avgCount >= 2 && variance < 1) {
        const score = avgCount * 10 - variance;
        if (score > bestScore) {
          bestScore = score;
          bestDelimiter = delimiter;
        }
      }
    }

    this.delimiter = bestDelimiter;

    // Check if first line looks like headers
    if (bestScore > 0 && sampleLines.length > 0) {
      const firstLine = sampleLines[0];
      const parts = firstLine.split(this.delimiter);

      // Headers typically don't have numbers or are all caps
      const looksLikeHeader = parts.every(part => {
        const trimmed = part.trim();
        return trimmed.length > 0 && trimmed.length < 50 && !/^\d+$/.test(trimmed);
      });

      if (looksLikeHeader) {
        return 60; // Medium confidence
      }
    }

    return bestScore > 0 ? 40 : 0;
  }

  async *parseEntries(input: AsyncIterable<string>): AsyncIterable<ParsedLogEntry> {
    let lineNumber = 0;
    let isFirstLine = true;

    for await (const line of input) {
      lineNumber++;
      const trimmedLine = line.trim();

      if (!trimmedLine) continue;

      const parts = trimmedLine.split(this.delimiter).map(p => p.trim());

      // First line might be headers
      if (isFirstLine) {
        isFirstLine = false;

        // Detect if this looks like a header row
        const looksLikeHeader = parts.every(part =>
          part.length > 0 && part.length < 50 && !/^\d+$/.test(part)
        );

        if (looksLikeHeader) {
          this.headers = parts;
          continue;
        } else {
          // Generate default headers
          this.headers = parts.map((_, idx) => `column${idx + 1}`);
        }
      }

      // Parse entry
      const fields: Record<string, string | number | boolean | null> = {};
      parts.forEach((value, idx) => {
        const key = this.headers[idx] || `column${idx + 1}`;
        fields[key] = value;
      });

      yield {
        rowId: this.generateRowId(lineNumber),
        lineNumber,
        raw: trimmedLine,
        fields,
      };
    }
  }

  columns(): ColumnDef[] {
    if (this.headers.length === 0) {
      return [
        { id: 'lineNumber', header: 'Line', type: 'number' },
        { id: 'raw', header: 'Content', type: 'text', filterMode: 'contains' },
      ];
    }

    return [
      { id: 'lineNumber', header: 'Line', type: 'number' },
      ...this.headers.map(header => ({
        id: `fields.${header}`,
        header,
        type: 'text' as const,
        filterMode: 'contains' as const,
      })),
    ];
  }
}
