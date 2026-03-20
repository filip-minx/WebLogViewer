// Parser registration and detection

import type { LogParser } from './base';
import { PipeWindowsParser } from './pipeWindowsParser';
import { JsonLinesParser } from './jsonLinesParser';
import { GenericDelimitedParser } from './genericDelimitedParser';
import { RawTextParser } from './rawTextParser';

// Parser registry - IMPORTANT: RawTextParser must be last (lowest priority)
export const PARSERS: LogParser[] = [
  new PipeWindowsParser(),
  new JsonLinesParser(),
  new GenericDelimitedParser(),
  new RawTextParser(), // Fallback - always last
];

/**
 * Detect the best parser for the given content
 * @param sampleLines First N lines of the file
 * @param fileName Name of the file being parsed
 * @returns Best matching parser
 */
export function detectParser(sampleLines: string[], fileName: string): LogParser {
  let bestParser = PARSERS[PARSERS.length - 1]; // Default to raw text
  let bestScore = 0;

  for (const parser of PARSERS) {
    const score = parser.detect(sampleLines, fileName);
    if (score > bestScore) {
      bestScore = score;
      bestParser = parser;
    }
  }

  return bestParser;
}

/**
 * Get parser by ID
 */
export function getParserById(id: string): LogParser | undefined {
  return PARSERS.find(p => p.id === id);
}

/**
 * Get all available parsers
 */
export function getAllParsers(): LogParser[] {
  return PARSERS;
}
