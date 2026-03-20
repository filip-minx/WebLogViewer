// Raw JSON viewer - displays JSON files as-is without parsing
// Returns entire file content as a single entry for raw display

import { BaseParser } from './base';
import type { ParsedLogEntry, ColumnDef } from '../models/types';

export class JsonRawParser extends BaseParser {
  id = 'json-raw';
  name = 'JSON/NDJSON (Raw View)';

  detect(sampleLines: string[], fileName: string): number {
    // Check if file has .json or .ndjson extension
    const lowerFileName = fileName.toLowerCase();
    if (lowerFileName.endsWith('.json') || lowerFileName.endsWith('.ndjson')) {
      // High priority for JSON files
      return 100; // Highest priority
    }

    return 0;
  }

  async *parseEntries(input: AsyncIterable<string>): AsyncIterable<ParsedLogEntry> {
    // Collect all lines and return as single raw entry
    let allLines: string[] = [];

    for await (const line of input) {
      allLines.push(line);
    }

    const fullContent = allLines.join('\n');

    // Return single entry with full content marked for raw display
    yield {
      rowId: 'raw-content',
      lineNumber: 1,
      raw: fullContent,
      message: fullContent,
      fields: {
        _displayMode: 'raw', // Special flag for raw display
        content: fullContent,
      },
    };
  }

  columns(): ColumnDef[] {
    // These won't be used if raw display mode is detected
    return [
      { id: 'content', header: 'Content', type: 'text' },
    ];
  }
}
