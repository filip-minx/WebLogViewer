// Raw text parser - fallback for unknown formats
// Each line becomes a raw entry

import { BaseParser } from './base';
import type { ParsedLogEntry, ColumnDef } from '../models/types';

export class RawTextParser extends BaseParser {
  id = 'raw-text';
  name = 'Raw Text';

  detect(sampleLines: string[], fileName: string): number {
    // Always returns lowest score - this is the fallback parser
    return 1;
  }

  async *parseEntries(input: AsyncIterable<string>): AsyncIterable<ParsedLogEntry> {
    let lineNumber = 0;

    for await (const line of input) {
      lineNumber++;

      // Include empty lines
      yield {
        rowId: this.generateRowId(lineNumber),
        lineNumber,
        raw: line,
        message: line,
        fields: {
          message: line,
        },
      };
    }
  }

  columns(): ColumnDef[] {
    return [
      { id: 'lineNumber', header: 'Line', type: 'number' },
      { id: 'raw', header: 'Content', type: 'text', filterMode: 'contains' },
    ];
  }
}
