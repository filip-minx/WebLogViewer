# Log Package Analyzer — Implementation Plan

## Goal

Build a browser-based log package analyzer for Windows application logs where the user selects a ZIP archive locally, and all decompression, parsing, indexing, searching, and filtering happen on the end-user device. The server only serves the web application assets.

## Core Requirements

* No backend upload of log packages
* All processing performed in the browser
* Display nested folder and file structure from the ZIP package
* Let the user open and inspect selected log files
* Support search and column-based filtering of parsed log entries
* Support multiple log entry formats across different files

## Recommended Architecture

### Delivery model

Use a static single-page application hosted behind any simple web server or CDN. The backend has no responsibility beyond serving the application bundle.

### Frontend stack

* React
* TypeScript
* Vite
* TanStack Table
* TanStack Virtual
* fflate for ZIP processing
* IndexedDB for local caching
* Web Workers for heavy processing

## High-Level Design

### Main application layers

1. **UI layer**

   * ZIP file picker
   * Folder/file tree view
   * Log viewer table
   * Filter/search panel
   * Row details panel
   * Progress and status indicators

2. **Processing layer**

   * ZIP entry discovery
   * File sampling
   * Parser detection
   * Incremental parsing
   * Query/filter execution

3. **Storage layer**

   * Parsed file metadata cache
   * Parsed row batches
   * Search/filter state
   * Optional session persistence

### Threading model

Keep the UI thread focused on rendering and interactions. Offload expensive work to Web Workers:

* ZIP enumeration and extraction
* File parsing
* Multiline log grouping
* Large dataset filtering
* Index preparation

## ZIP Package Handling

### Strategy

Do not extract the full archive eagerly. Instead:

1. Read the ZIP entries first
2. Build the folder tree from entry paths
3. Show the package structure immediately
4. Extract and parse only the selected file on demand

### Per-entry metadata

For each ZIP entry, track:

* Full path
* File name
* Folder path
* Compressed size
* Uncompressed size
* Extension
* Last modified time if available
* Candidate parser type if detected

## Log Parsing Model

Because different files can use different formats, the parser system must be plugin-based.

### Parser goals

* Detect the most likely parser for a file from a sample of lines
* Parse entries into structured rows
* Expose dynamic columns for the current file
* Support multiline log entries such as stack traces
* Fall back to raw text mode when parsing is uncertain

### Normalized row model

Use a normalized structure that supports both common fields and file-specific fields.

```ts
export type ParsedLogEntry = {
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

### Parser contract

```ts
export type ColumnType = "text" | "timestamp" | "enum" | "number" | "boolean";

export type ColumnDef = {
  id: string;
  header: string;
  type: ColumnType;
  filterMode?: "contains" | "equals" | "range" | "multi-select";
};

export interface LogParser {
  id: string;
  name: string;
  detect(sampleLines: string[], fileName: string): number;
  parseEntries(input: AsyncIterable<string>): AsyncIterable<ParsedLogEntry>;
  columns(): ColumnDef[];
}
```

## Initial Parser Set

### 1. Pipe-separated Windows log parser

Supports lines like:

```text
2026-03-20_13-11-24.795|ERROR|DeadGatewayDetectionActor|System.Exception: DNS resolution failed System.Exception: DNS resolution failed
```

Suggested regex:

```regex
^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.\d{3})\|([A-Z]+)\|([^|]+)\|(.*)$
```

Mapped columns:

* timestamp
* level
* source
* message

### 2. JSON lines parser

For files where each line is a JSON object.

### 3. Generic delimiter parser

For CSV, TSV, or pipe-separated formats not matching the known Windows log schema.

### 4. Plain text fallback parser

For unsupported files. Supports raw line viewing and global text search.

## Multiline Entry Support

This is essential for exception traces.

### Rule

A parser should be able to determine whether a line starts a new entry. If not, it should be appended to the previous entry.

For the pipe-separated parser, a new entry starts when the line matches the timestamp prefix pattern:

```regex
^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.\d{3}\|
```

Continuation lines should be appended to the previous entry’s raw and message fields.

## UI Design

### Layout

Use a 3-pane layout:

#### Left pane — package explorer

* Folder tree
* File list
* File size indicators
* File type icons
* File search by name/path

#### Center pane — log viewer

* Virtualized table for parsed entries
* Dynamic columns based on selected parser
* Sticky table header
* Sorting
* Resizable columns
* Line number column

#### Right or top pane — filters and details

* Global search
* Per-column filter controls
* Active filter summary
* Row details / raw entry view

## Filtering and Search

### Search modes

1. **Global full-text search**

   * Search across raw content and common fields

2. **Column-based filters**

   * Text contains / equals
   * Enum multi-select
   * Numeric range
   * Timestamp range

3. **Future advanced mode**

   * Structured query syntax for power users

### Filter generation

Filter controls should be generated from parser-provided column metadata rather than hardcoded.

Examples:

* `timestamp` -> range picker
* `level` -> multi-select
* `source` -> text filter
* `message` -> text / regex filter

## Performance Strategy

### Rendering

Use row virtualization so the UI only renders visible rows.

### Parsing

Parse incrementally in worker threads and emit batches of rows.

### Memory

Avoid loading both the entire raw file and the full parsed table into memory unless the file is small.

### Caching

Use IndexedDB to persist:

* ZIP file session metadata
* Parsed row batches
* Parser detection results
* Optional saved filters

### Query execution

* Small datasets: in-memory filtering
* Large datasets: worker-based filtering over cached row batches

## Error Handling and Resilience

### Required safeguards

* Unknown file formats fall back to raw mode
* Malformed lines do not crash the parser
* ZIP parsing errors are surfaced clearly to the user
* Support cancellation when parsing large files
* Show progress indicators during extraction and parsing

### Archive safety

Defend against problematic archives by enforcing:

* Max entry count
* Max per-file extracted size
* Max total extracted size per session
* Max line length or safe truncation rules

## Security and Privacy

* Process logs locally by default
* Do not send file contents to the server
* Use safe rendering for log content to avoid XSS
* Use a strict Content Security Policy
* Avoid analytics in the initial version
* Make privacy guarantees explicit in the UI

## Suggested Project Structure

```text
/src
  /app
  /components
    FileTree
    FilterPanel
    LogTable
    RowDetails
  /workers
    zipWorker.ts
    parseWorker.ts
    queryWorker.ts
  /parsers
    base.ts
    pipeWindowsParser.ts
    jsonLinesParser.ts
    genericDelimitedParser.ts
    rawTextParser.ts
  /storage
    indexedDb.ts
  /models
    parsedLogEntry.ts
    zipEntry.ts
    filterModel.ts
  /services
    zipService.ts
    parseService.ts
    queryService.ts
```

## Suggested Development Phases

## Phase 1 — MVP

* Local ZIP selection
* Folder and file tree display
* Open selected file
* Auto-detect parser
* Parse a single file in a worker
* Render structured rows in a virtualized table
* Global search
* Per-column filtering
* Raw text fallback mode

## Phase 2 — Scalability

* IndexedDB caching
* Persistent parsed file metadata
* Background query worker
* Better progress reporting
* Parse cancellation and restart
* More parser plugins
* File previews

## Phase 3 — Advanced Analysis

* Cross-file search
* Saved filters and bookmarks
* Export filtered results to CSV/JSON
* Timeline views and charts
* Correlation across multiple log files
* Structured query language

## Recommended MVP Scope

The strongest first version would do the following:

1. User opens a ZIP locally
2. App shows the folder tree
3. User selects a log file
4. App detects the best parser for that file
5. File is parsed incrementally in a worker
6. Parsed rows are displayed in a virtualized table
7. User filters by detected columns and searches globally
8. Results can be revisited from local cache during the session

## Key Design Principles

* Client-side only processing
* Parser plugin architecture
* Dynamic schema per file
* Multiline-aware parsing
* Worker-based processing
* Virtualized rendering
* Local caching for scale
* Safe fallback behavior for unknown formats

## Next Recommended Step

After this implementation plan, the next useful artifact would be a technical design package containing:

* parser registry design
* worker message contracts
* IndexedDB schema
* React component hierarchy
* MVP task breakdown
* starter TypeScript interfaces and skeleton code
