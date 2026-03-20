# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

WebLogAnalyzer - Browser-based log package analyzer for Windows application logs. All processing happens client-side with no backend upload.

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **UI Components**: TanStack Table (virtualized table), TanStack Virtual (row virtualization)
- **ZIP Processing**: fflate (client-side ZIP decompression)
- **Storage**: IndexedDB (caching parsed data, filter state)
- **Workers**: Web Workers (ZIP extraction, parsing, filtering)

## Development Commands

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Type checking
npm run type-check
```

## Architecture Overview

### Three-Layer Design

1. **UI Layer**
   - ZIP file picker
   - Folder/file tree view (left pane)
   - Virtualized log table (center pane)
   - Filter/search panel (right/top pane)
   - Row details panel

2. **Processing Layer** (Web Workers)
   - ZIP entry discovery and extraction
   - Parser detection from file samples
   - Incremental parsing with multiline support
   - Query/filter execution

3. **Storage Layer** (IndexedDB)
   - Parsed file metadata cache
   - Row batches
   - Filter state persistence

### Project Structure

```
/src
  /app              - Main application setup
  /components       - React components (FileTree, LogTable, FilterPanel, RowDetails)
  /workers          - Web Workers (zipWorker, parseWorker, queryWorker)
  /parsers          - Parser plugins (base, pipeWindowsParser, jsonLinesParser, etc.)
  /storage          - IndexedDB integration
  /models           - TypeScript types (ParsedLogEntry, ZipEntry, FilterModel)
  /services         - Business logic (zipService, parseService, queryService)
```

## Key Data Models

### ParsedLogEntry
```ts
type ParsedLogEntry = {
  rowId: string;
  lineNumber: number;
  raw: string;
  timestamp?: string;
  level?: string;
  source?: string;
  message?: string;
  fields: Record<string, string | number | boolean | null>;
};
```

### LogParser Interface
```ts
interface LogParser {
  id: string;
  name: string;
  detect(sampleLines: string[], fileName: string): number;
  parseEntries(input: AsyncIterable<string>): AsyncIterable<ParsedLogEntry>;
  columns(): ColumnDef[];
}
```

## Parser Plugins

Parser system is plugin-based to support multiple log formats:

1. **Pipe-separated Windows parser** - Primary format: `2026-03-20_13-11-24.795|ERROR|Source|Message`
   - Regex: `^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.\d{3})\|([A-Z]+)\|([^|]+)\|(.*)$`
   - Multiline detection: Lines starting with timestamp pattern begin new entries

2. **JSON lines parser** - One JSON object per line
3. **Generic delimiter parser** - CSV/TSV/pipe-separated
4. **Plain text fallback** - Raw text view when no parser matches

### Multiline Support

Parsers must handle continuation lines (e.g., stack traces). Lines that don't match the entry start pattern are appended to the previous entry's `raw` and `message` fields.

## Processing Strategy

- **Lazy loading**: Don't extract full ZIP eagerly. Show structure immediately, extract/parse on demand.
- **Incremental parsing**: Parse in chunks, emit row batches to avoid blocking.
- **Worker-based**: Offload ZIP extraction, parsing, and filtering to Web Workers.
- **Virtualized rendering**: Only render visible rows in the table.
- **Local caching**: Use IndexedDB to persist parsed data across sessions.

## Security & Safety

- **Client-side only**: No log data sent to server
- **XSS protection**: Safe rendering of log content, strict CSP
- **Archive limits**: Max entry count, max per-file size, max total extracted size
- **Malformed data**: Parsers must not crash on bad input, fall back to raw mode

## Filter System

Filter controls are dynamically generated from parser-provided column metadata:

- **timestamp** → date range picker
- **level** → multi-select (ERROR, WARN, INFO, etc.)
- **source** → text contains/equals
- **message** → text/regex filter
- **Global search** → searches across all fields

## Development Phases

**Phase 1 (MVP)**:
- ZIP selection and tree display
- Single file parser detection and parsing
- Virtualized table rendering
- Column-based filtering + global search
- Raw text fallback

**Phase 2 (Scalability)**:
- IndexedDB caching
- Background query workers
- Parse cancellation
- More parser plugins

**Phase 3 (Advanced)**:
- Cross-file search
- Export results
- Timeline views
- Correlation across files

## Key Principles

- Client-side only processing (no backend uploads)
- Parser plugin architecture with dynamic schemas
- Multiline-aware parsing for stack traces
- Worker-based processing to keep UI responsive
- Safe fallback behavior for unknown formats
- Privacy-first design
