import React, { useState, useRef, useEffect } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FileTree } from './components/FileTree/FileTree';
import { LogTable } from './components/LogTable/LogTable';
import { GlobalSearch } from './components/FilterPanel/GlobalSearch';
import { MessagePanel } from './components/MessagePanel/MessagePanel';
import { ResizeHandle } from './components/ResizeHandle/ResizeHandle';
import { StatusBar } from './components/StatusBar/StatusBar';
import { ZipService } from './services/zipService';
import { ParseService } from './services/parseService';
import { applyFilters } from './utils/filterUtils';
import { useResizable } from './hooks/useResizable';
import type {
  ZipEntryMetadata,
  ParsedLogEntry,
  ColumnDef,
  FileParseState,
  FilterState,
} from './models/types';
import './styles/main.css';

// Merge log entries from multiple files, sorted by timestamp
function mergeLogEntries(
  files: Array<{ path: string; entries: ParsedLogEntry[]; columns: ColumnDef[] }>
): ParsedLogEntry[] {
  const allEntries: ParsedLogEntry[] = [];

  for (const file of files) {
    allEntries.push(...file.entries);
  }

  // Sort by timestamp if available
  allEntries.sort((a, b) => {
    if (!a.timestamp || !b.timestamp) {
      // If no timestamp, maintain original order
      return 0;
    }
    return a.timestamp.localeCompare(b.timestamp);
  });

  // Reassign rowIds to maintain unique identifiers
  return allEntries.map((entry, index) => ({
    ...entry,
    rowId: `merged-${index}`,
    lineNumber: index + 1,
  }));
}

function App() {
  // ZIP file state
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipEntries, setZipEntries] = useState<ZipEntryMetadata[]>([]);

  // Selected file state
  const [selectedFilePaths, setSelectedFilePaths] = useState<string[]>([]);

  // Parsing state
  const [parseState, setParseState] = useState<FileParseState | null>(null);
  const [parsedEntries, setParsedEntries] = useState<ParsedLogEntry[]>([]);
  const [columns, setColumns] = useState<ColumnDef[]>([]);

  // Filter state
  const [filterState, setFilterState] = useState<FilterState>({
    globalSearch: '',
    columnFilters: {},
  });
  const [filteredEntries, setFilteredEntries] = useState<ParsedLogEntry[]>([]);

  // UI state
  const [selectedEntry, setSelectedEntry] = useState<ParsedLogEntry | null>(null);

  // Services
  const zipService = useRef(new ZipService()).current;
  const parseService = useRef(new ParseService()).current;

  // Resizable panels
  const sidebarResize = useResizable({
    storageKey: 'weblog-sidebar-width',
    defaultSize: 320,
    minSize: 280,
    maxSize: 600,
  });

  const messageResize = useResizable({
    storageKey: 'weblog-message-height',
    defaultSize: 200,
    minSize: 100,
    maxSize: 600,
  });

  // Handle ZIP file selection
  const handleFileSelect = async (file: File) => {
    try {
      setZipFile(file);
      setZipEntries([]);
      setSelectedFilePaths([]);
      setParsedEntries([]);
      setColumns([]);
      setParseState(null);

      const entries = await zipService.enumerateEntries(file);
      setZipEntries(entries.filter(e => !e.isDirectory));
    } catch (error) {
      console.error('Failed to enumerate ZIP entries:', error);
      alert(`Failed to open ZIP file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handle file selection from tree
  const handleTreeFileSelect = async (paths: string[]) => {
    if (!zipFile || paths.length === 0) return;

    setSelectedFilePaths(paths);
    setParsedEntries([]);
    setColumns([]);
    setFilterState({ globalSearch: '', columnFilters: {} });

    const fileLabel = paths.length === 1 ? paths[0] : `${paths.length} files`;
    setParseState({
      fileName: fileLabel,
      status: 'detecting',
      progress: 0,
    });

    try {
      // Parse all selected files
      const allParsedFiles: Array<{ path: string; entries: ParsedLogEntry[]; columns: ColumnDef[] }> = [];

      for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        const content = await zipService.extractFile(zipFile, path);

        let fileEntries: ParsedLogEntry[] = [];
        let fileColumns: ColumnDef[] = [];
        let parserId = '';
        let parserName = '';

        await parseService.parseFile(content, path, progress => {
          if (progress.parserId && progress.parserName && progress.columns) {
            parserId = progress.parserId;
            parserName = progress.parserName;
            fileColumns = progress.columns;
          }
          fileEntries = progress.entries;
        });

        // Add source file to each entry
        const entriesWithSource = fileEntries.map(entry => ({
          ...entry,
          fields: {
            ...entry.fields,
            _sourceFile: path,
          },
        }));

        allParsedFiles.push({
          path,
          entries: entriesWithSource,
          columns: fileColumns,
        });

        setParseState({
          fileName: fileLabel,
          status: 'parsing',
          progress: ((i + 1) / paths.length) * 100,
          parserId,
          parserName,
        });
      }

      // Merge entries from all files
      const mergedEntries = mergeLogEntries(allParsedFiles);

      // Use columns from first file and add source column
      const baseColumns = allParsedFiles[0]?.columns || [];
      const columnsWithSource: ColumnDef[] = [
        ...baseColumns,
        {
          id: 'fields._sourceFile',
          header: 'Source File',
          type: 'text',
          filterMode: 'contains',
        },
      ];

      setParsedEntries(mergedEntries);
      setColumns(columnsWithSource);

      setParseState({
        fileName: fileLabel,
        status: 'complete',
        progress: 100,
        parserId: allParsedFiles[0]?.columns ? 'merged' : 'unknown',
        parserName: paths.length === 1 ? 'Single File' : 'Merged Files',
        totalEntries: mergedEntries.length,
      });
    } catch (error) {
      console.error('Failed to parse files:', error);
      setParseState({
        fileName: fileLabel,
        status: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  // Apply filters when entries or filter state changes
  useEffect(() => {
    if (parsedEntries.length === 0) {
      setFilteredEntries([]);
      return;
    }

    const filtered = applyFilters(parsedEntries, filterState);
    setFilteredEntries(filtered);
  }, [parsedEntries, filterState]);

  // Handle global search change
  const handleGlobalSearchChange = (value: string) => {
    setFilterState({
      ...filterState,
      globalSearch: value,
    });
  };

  // Check if we're in raw display mode
  const isRawDisplay = parsedEntries.length === 1 && parsedEntries[0].fields._displayMode === 'raw';

  return (
    <ErrorBoundary>
      <div className="app">
        <main className="app-main">
          {/* Side Panel */}
          <aside className="side-panel" style={{ width: `${sidebarResize.size}px` }}>
            <div className="side-panel-header">
              <h1>WebLogAnalyzer</h1>
            </div>

            <div className="side-panel-content">
              <div className="file-selector">
                <label className="file-selector-label">Open ZIP Archive</label>
                <input
                  type="file"
                  accept=".zip"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                  className="file-input"
                  id="zip-file-input"
                />
              </div>

              {parsedEntries.length > 0 && !isRawDisplay && (
                <div className="side-panel-search">
                  <GlobalSearch
                    value={filterState.globalSearch}
                    onChange={handleGlobalSearchChange}
                  />
                </div>
              )}

              <FileTree
                entries={zipEntries}
                selectedPaths={selectedFilePaths}
                onFileSelect={handleTreeFileSelect}
              />
            </div>

            <div className="side-panel-footer">
              <div className="privacy-notice">
                🔒 All processing happens locally in your browser
              </div>
            </div>
          </aside>

          {/* Sidebar resize handle */}
          <ResizeHandle
            direction="horizontal"
            onMouseDown={(e) => sidebarResize.startResize(e, 'horizontal')}
            isResizing={sidebarResize.isResizing}
          />

          {/* Content area */}
          <section className="content-area">
            <div className="table-area">
              {parsedEntries.length === 0 && parseState?.status !== 'parsing' ? (
                <div className="empty-state">
                  <p>Select a log file from the tree to view its contents</p>
                </div>
              ) : isRawDisplay ? (
                <div className="raw-content-viewer">
                  <pre className="raw-content">{parsedEntries[0].raw}</pre>
                </div>
              ) : (
                <LogTable
                  entries={filteredEntries}
                  columns={columns}
                  filterState={filterState}
                  onFilterChange={setFilterState}
                  onRowSelect={setSelectedEntry}
                />
              )}
            </div>

            {/* Message panel with resize handle */}
            {!isRawDisplay && parsedEntries.length > 0 && (
              <>
                <ResizeHandle
                  direction="vertical"
                  onMouseDown={(e) => messageResize.startResize(e, 'vertical', true)}
                  isResizing={messageResize.isResizing}
                />
                <div className="message-area" style={{ height: `${messageResize.size}px` }}>
                  <MessagePanel entry={selectedEntry} />
                </div>
              </>
            )}
          </section>
        </main>

        <footer className="app-footer">
          <StatusBar
            parseState={parseState}
            totalEntries={parsedEntries.length}
            filteredEntries={filteredEntries.length}
          />
        </footer>

      </div>
    </ErrorBoundary>
  );
}

export default App;
