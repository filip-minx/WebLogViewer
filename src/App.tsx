import React, { useState, useRef, useEffect } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PackageDock } from './components/PackageDock/PackageDock';
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
import { usePackageManager } from './hooks/usePackageManager';
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
  // Package management
  const {
    packages,
    activePackageId,
    addPackage,
    updatePackage,
    removePackage,
    switchPackage,
    getActivePackage,
    reloadStalePackage,
  } = usePackageManager();

  const activePackage = getActivePackage();

  // Filter state for current view (not stored in package)
  const [filteredEntries, setFilteredEntries] = useState<ParsedLogEntry[]>([]);

  // UI state
  const [selectedEntry, setSelectedEntry] = useState<ParsedLogEntry | null>(null);
  const [showSearchModal, setShowSearchModal] = useState(false);

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
      // Check if package with same name already exists
      const existing = packages.find(p => p.name === file.name);
      if (existing) {
        if (existing.status === 'stale') {
          // Reload stale package
          reloadStalePackage(existing.id, file);
          const entries = await zipService.enumerateEntries(file);
          updatePackage(existing.id, {
            zipEntries: entries.filter(e => !e.isDirectory),
            status: 'ready',
          });
        } else {
          // Switch to existing package
          switchPackage(existing.id);
        }
        return;
      }

      // Add new package
      const packageId = addPackage(file);

      const entries = await zipService.enumerateEntries(file);
      updatePackage(packageId, {
        zipEntries: entries.filter(e => !e.isDirectory),
        status: 'ready',
      });
    } catch (error) {
      console.error('Failed to enumerate ZIP entries:', error);
      alert(`Failed to open ZIP file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handle file selection from tree
  const handleTreeFileSelect = async (paths: string[]) => {
    if (!activePackage || !activePackage.file || paths.length === 0) return;

    const fileLabel = paths.length === 1 ? paths[0] : `${paths.length} files`;

    updatePackage(activePackage.id, {
      selectedFilePaths: paths,
      parsedEntries: [],
      columns: [],
      filterState: { globalSearch: '', columnFilters: {} },
      parseState: {
        fileName: fileLabel,
        status: 'detecting',
        progress: 0,
      },
      status: 'parsing',
    });

    try {
      // Parse all selected files
      const allParsedFiles: Array<{ path: string; entries: ParsedLogEntry[]; columns: ColumnDef[] }> = [];

      for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        const content = await zipService.extractFile(activePackage.file, path);

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

        updatePackage(activePackage.id, {
          parseState: {
            fileName: fileLabel,
            status: 'parsing',
            progress: ((i + 1) / paths.length) * 100,
            parserId,
            parserName,
          },
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

      updatePackage(activePackage.id, {
        parsedEntries: mergedEntries,
        columns: columnsWithSource,
        parseState: {
          fileName: fileLabel,
          status: 'complete',
          progress: 100,
          parserId: allParsedFiles[0]?.columns ? 'merged' : 'unknown',
          parserName: paths.length === 1 ? 'Single File' : 'Merged Files',
          totalEntries: mergedEntries.length,
        },
        status: 'ready',
      });
    } catch (error) {
      console.error('Failed to parse files:', error);
      updatePackage(activePackage.id, {
        parseState: {
          fileName: fileLabel,
          status: 'error',
          progress: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  // Apply filters when active package or filter state changes
  useEffect(() => {
    if (!activePackage || activePackage.parsedEntries.length === 0) {
      setFilteredEntries([]);
      return;
    }

    const filtered = applyFilters(activePackage.parsedEntries, activePackage.filterState);
    setFilteredEntries(filtered);
  }, [activePackage]);

  // Handle global search change
  const handleGlobalSearchChange = (value: string) => {
    if (!activePackage) return;

    updatePackage(activePackage.id, {
      filterState: {
        ...activePackage.filterState,
        globalSearch: value,
      },
    });
  };

  // Handle filter state change
  const handleFilterStateChange = (newFilterState: FilterState) => {
    if (!activePackage) return;

    updatePackage(activePackage.id, {
      filterState: newFilterState,
    });
  };

  // Check if we're in raw display mode
  const isRawDisplay = activePackage?.parsedEntries.length === 1 &&
                       activePackage.parsedEntries[0].fields._displayMode === 'raw';

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+O to open file
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        document.getElementById('zip-file-input')?.click();
      }
      // Ctrl+F or Cmd+F to open search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' &&
          activePackage?.parsedEntries.length && !isRawDisplay) {
        e.preventDefault();
        setShowSearchModal(true);
      }
      // Escape to close search
      if (e.key === 'Escape' && showSearchModal) {
        setShowSearchModal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePackage?.parsedEntries.length, isRawDisplay, showSearchModal]);

  return (
    <ErrorBoundary>
      <div className="app">
        <main className="app-main">
          {/* Side Panel */}
          <aside className="side-panel" style={{ width: `${sidebarResize.size}px` }}>
            {/* Toolbar */}
            <div className="sidebar-toolbar">
              <label className="toolbar-action" htmlFor="zip-file-input" title="Open ZIP archive (Ctrl+O)">
                <span className="action-label">LOAD</span>
                <span className="action-shortcut">Ctrl+O</span>
              </label>
              <input
                type="file"
                accept=".zip"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleFileSelect(file);
                  }
                }}
                className="file-input-hidden"
                id="zip-file-input"
              />
              {activePackage && (
                <div className="toolbar-context">
                  <span className="context-label">ARCHIVE:</span>
                  <span className="context-value">{activePackage.name}</span>
                </div>
              )}
            </div>

            {/* Package Dock */}
            <PackageDock
              packages={packages}
              activePackageId={activePackageId}
              onPackageSelect={(id) => {
                const pkg = packages.find(p => p.id === id);
                if (pkg?.status === 'stale') {
                  // Prompt to reload stale package
                  if (confirm(`Package "${pkg.name}" needs to be reloaded. Select the ZIP file again?`)) {
                    document.getElementById('zip-file-input')?.click();
                  }
                } else {
                  switchPackage(id);
                }
              }}
              onPackageClose={removePackage}
            />

            {/* File Tree */}
            <div className="side-panel-content">
              <FileTree
                entries={activePackage?.zipEntries || []}
                selectedPaths={activePackage?.selectedFilePaths || []}
                onFileSelect={handleTreeFileSelect}
              />
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
            {/* Search Popup (Ctrl+F) */}
            {showSearchModal && activePackage && (
              <div className="search-popup">
                <div className="search-popup-header">
                  <span>Search</span>
                  <button
                    className="search-popup-close"
                    onClick={() => setShowSearchModal(false)}
                  >
                    ×
                  </button>
                </div>
                <div className="search-popup-content">
                  <GlobalSearch
                    value={activePackage.filterState.globalSearch}
                    onChange={handleGlobalSearchChange}
                  />
                </div>
              </div>
            )}

            <div className="table-area">
              {!activePackage || (activePackage.parsedEntries.length === 0 &&
               activePackage.parseState?.status !== 'parsing') ? (
                <div className="empty-state">
                  <p>
                    {!activePackage
                      ? 'Load a ZIP archive to begin'
                      : 'Select a log file from the tree to view its contents'}
                  </p>
                </div>
              ) : isRawDisplay ? (
                <div className="raw-content-viewer">
                  <pre className="raw-content">{activePackage.parsedEntries[0].raw}</pre>
                </div>
              ) : (
                <LogTable
                  entries={filteredEntries}
                  columns={activePackage.columns}
                  filterState={activePackage.filterState}
                  onFilterChange={handleFilterStateChange}
                  onRowSelect={setSelectedEntry}
                />
              )}
            </div>

            {/* Message panel with resize handle */}
            {!isRawDisplay && activePackage && activePackage.parsedEntries.length > 0 && (
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
            parseState={activePackage?.parseState || null}
            totalEntries={activePackage?.parsedEntries.length || 0}
            filteredEntries={filteredEntries.length}
          />
        </footer>

      </div>
    </ErrorBoundary>
  );
}

export default App;
