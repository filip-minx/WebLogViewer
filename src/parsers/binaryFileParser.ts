// Binary file detector - shows friendly message for non-text files
// Detects files like .evtx, .exe, .dll, .bin, etc.

import { BaseParser } from './base';
import type { ParsedLogEntry, ColumnDef } from '../models/types';

const BINARY_EXTENSIONS = [
  '.evtx', '.exe', '.dll', '.bin', '.dat', '.db', '.sqlite',
  '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico',
  '.mp3', '.mp4', '.avi', '.mov', '.wav',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
];

export class BinaryFileParser extends BaseParser {
  id = 'binary-file';
  name = 'Binary File';

  detect(sampleLines: string[], fileName: string): number {
    const lowerFileName = fileName.toLowerCase();

    // Check file extension
    for (const ext of BINARY_EXTENSIONS) {
      if (lowerFileName.endsWith(ext)) {
        return 99; // Very high priority to catch binary files early
      }
    }

    // Check for binary content (non-printable characters)
    if (sampleLines.length > 0) {
      const firstLine = sampleLines[0];
      if (this.hasBinaryContent(firstLine)) {
        return 99;
      }
    }

    return 0;
  }

  private hasBinaryContent(text: string): boolean {
    // Check if string contains significant amount of non-printable characters
    let nonPrintableCount = 0;
    const checkLength = Math.min(text.length, 500);

    for (let i = 0; i < checkLength; i++) {
      const code = text.charCodeAt(i);
      // Allow: tab (9), newline (10), carriage return (13), printable ASCII (32-126)
      if (code !== 9 && code !== 10 && code !== 13 && (code < 32 || code > 126)) {
        nonPrintableCount++;
      }
    }

    // If more than 10% non-printable, consider it binary
    return nonPrintableCount / checkLength > 0.1;
  }

  async *parseEntries(input: AsyncIterable<string>): AsyncIterable<ParsedLogEntry> {
    // Just yield a single informational entry
    yield {
      rowId: this.generateRowId(1),
      lineNumber: 1,
      raw: '[Binary file - cannot display as text]',
      message: 'This appears to be a binary file and cannot be displayed as text.',
      fields: {
        info: 'Binary files like .evtx (Windows Event Logs) require specialized viewers.',
        suggestion: 'Try opening this file with its native application or a hex editor.',
      },
    };
  }

  columns(): ColumnDef[] {
    return [
      { id: 'message', header: 'Message', type: 'text' },
      { id: 'info', header: 'Information', type: 'text' },
    ];
  }
}
