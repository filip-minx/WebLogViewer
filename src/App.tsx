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

function App() {
  // ZIP file state
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipEntries, setZipEntries] = useState<ZipEntryMetadata[]>([]);

  // Selected file state
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

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
    defaultSize: 250,
    minSize: 150,
    maxSize: 500,
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
      setSelectedFilePath(null);
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
  const handleTreeFileSelect = async (path: string) => {
    if (!zipFile) return;

    setSelectedFilePath(path);
    setParsedEntries([]);
    setColumns([]);
    setFilterState({ globalSearch: '', columnFilters: {} });

    setParseState({
      fileName: path,
      status: 'detecting',
      progress: 0,
    });

    try {
      // Extract file content
      const content = await zipService.extractFile(zipFile, path);

      // Parse file
      const result = await parseService.parseFile(content, path, progress => {
        if (progress.parserId && progress.parserName && progress.columns) {
          setParseState({
            fileName: path,
            status: 'parsing',
            progress: progress.progress,
            parserId: progress.parserId,
            parserName: progress.parserName,
          });
          setColumns(progress.columns);
        }

        setParsedEntries(progress.entries);
      });

      setParseState({
        fileName: path,
        status: 'complete',
        progress: 100,
        parserId: result.parserId,
        parserName: result.parserName,
        totalEntries: result.totalEntries,
      });
    } catch (error) {
      console.error('Failed to parse file:', error);
      setParseState({
        fileName: path,
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
        <header className="app-header">
          <h1>WebLogAnalyzer</h1>
          <input
            type="file"
            accept=".zip"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
            className="file-input"
          />
          {parsedEntries.length > 0 && !isRawDisplay && (
            <div className="header-search">
              <GlobalSearch
                value={filterState.globalSearch}
                onChange={handleGlobalSearchChange}
              />
            </div>
          )}
          <div className="privacy-notice">
            🔒 Privacy: All processing happens locally in your browser
          </div>
        </header>

        <main className="app-main">
          {/* Sidebar */}
          <aside className="sidebar" style={{ width: `${sidebarResize.size}px` }}>
            <FileTree
              entries={zipEntries}
              selectedPath={selectedFilePath}
              onFileSelect={handleTreeFileSelect}
            />
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
