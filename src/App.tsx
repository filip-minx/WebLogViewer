import React, { useState, useRef, useEffect } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { WorkspaceList } from './components/WorkspaceList/WorkspaceList';
import { FileTree } from './components/FileTree/FileTree';
import { LogTable } from './components/LogTable/LogTable';
import { GlobalSearch } from './components/FilterPanel/GlobalSearch';
import { MessagePanel } from './components/MessagePanel/MessagePanel';
import { ResizeHandle } from './components/ResizeHandle/ResizeHandle';
import { StatusBar } from './components/StatusBar/StatusBar';
import { ZipService } from './services/zipService';
import { ParseService } from './services/parseService';
import { FilePickerService } from './services/filePickerService';
import { applyFilters } from './utils/filterUtils';
import { useResizable } from './hooks/useResizable';
import { useWorkspaceManager } from './hooks/useWorkspaceManager';
import type {
  WorkspaceSource,
  ParsedLogEntry,
  ColumnDef,
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
  // Workspace management
  const {
    workspaces,
    activeWorkspaceId,
    addWorkspace,
    updateWorkspace,
    removeWorkspace,
    switchWorkspace,
    renameWorkspace,
    getActiveWorkspace,
    reloadStaleWorkspace,
  } = useWorkspaceManager();

  const activeWorkspace = getActiveWorkspace();

  // Filter state for current view (not stored in workspace)
  const [filteredEntries, setFilteredEntries] = useState<ParsedLogEntry[]>([]);

  // UI state
  const [selectedEntry, setSelectedEntry] = useState<ParsedLogEntry | null>(null);
  const [showSearchModal, setShowSearchModal] = useState(false);

  const dragCounter = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  // Electron admin state — null in browser, true/false in Electron
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.isAdmin().then(setIsAdmin);
    }
  }, []);

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

  // Enumerate files or auto-parse depending on source type.
  // Called after a workspace is added or a stale workspace is reloaded.
  const openWorkspaceContent = async (workspaceId: string, source: WorkspaceSource) => {
    if (source.type === 'zip' && source.file) {
      const entries = await zipService.enumerateEntries(source.file);
      updateWorkspace(workspaceId, {
        fileEntries: entries.filter(e => !e.isDirectory),
        status: 'ready',
      });
    } else if (source.type === 'directory' && (source.dirHandle || source.nativePath)) {
      const entries = await FilePickerService.listDirectoryEntries(source.dirHandle ?? undefined, source.nativePath);
      updateWorkspace(workspaceId, {
        fileEntries: entries,
        status: 'ready',
      });
    } else if (source.type === 'file' && source.file) {
      // Single file: auto-parse immediately
      const fileName = source.file.name;
      updateWorkspace(workspaceId, {
        selectedFilePaths: [fileName],
        parseState: { fileName, status: 'detecting', progress: 0 },
        status: 'parsing',
      });
      const content = await source.file.text();
      let fileEntries: ParsedLogEntry[] = [];
      let fileColumns: ColumnDef[] = [];
      await parseService.parseFile(content, fileName, progress => {
        if (progress.parserId && progress.parserName && progress.columns) {
          fileColumns = progress.columns;
        }
        fileEntries = progress.entries;
      });
      updateWorkspace(workspaceId, {
        parsedEntries: fileEntries,
        columns: fileColumns,
        parseState: {
          fileName,
          status: 'complete',
          progress: 100,
          totalEntries: fileEntries.length,
        },
        status: 'ready',
      });
    }
  };

  // Open or focus a workspace from a WorkspaceSource.
  // If same-named workspace exists and is stale, reloads it.
  // If same-named workspace exists and is active/ready, just switches to it.
  const handleWorkspaceOpen = async (source: WorkspaceSource) => {
    try {
      const name = source.type === 'directory'
        ? (source.dirHandle?.name ?? source.nativePath?.split(/[\\/]/).pop() ?? 'Unnamed')
        : (source.file?.name ?? 'Unnamed');

      const existing = workspaces.find(w => w.name === name);
      if (existing?.status === 'stale') {
        const reloaded = await reloadStaleWorkspace(existing.id);
        if (reloaded) {
          await openWorkspaceContent(existing.id, source);
          return;
        }
      }
      if (existing && existing.status !== 'stale') {
        switchWorkspace(existing.id);
        return;
      }

      const workspaceId = addWorkspace(source, name);
      await openWorkspaceContent(workspaceId, source);
    } catch (error) {
      console.error('[App] Failed to open workspace:', error);
      alert(`Failed to open: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleWorkspaceOpenRef = useRef(handleWorkspaceOpen);
  useEffect(() => { handleWorkspaceOpenRef.current = handleWorkspaceOpen; });

  // Handle file selection from tree
  const handleTreeFileSelect = async (paths: string[]) => {
    if (!activeWorkspace || paths.length === 0) return;
    const source = activeWorkspace.source;
    if (source.type === 'directory' && !source.dirHandle && !source.nativePath) return;
    if (source.type === 'zip' && !source.file) return;

    const fileLabel = paths.length === 1 ? paths[0] : `${paths.length} files`;

    updateWorkspace(activeWorkspace.id, {
      selectedFilePaths: paths,
      parsedEntries: [],
      columns: [],
      filterState: { globalSearch: '', columnFilters: {} },
      parseState: { fileName: fileLabel, status: 'detecting', progress: 0 },
      status: 'parsing',
    });

    try {
      const allParsedFiles: Array<{ path: string; entries: ParsedLogEntry[]; columns: ColumnDef[] }> = [];

      for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        let content: string;
        if (source.type === 'directory' && (source.dirHandle || source.nativePath)) {
          content = await FilePickerService.readFileFromDirectory(source.dirHandle ?? undefined, source.nativePath, path);
        } else if (source.type === 'zip' && source.file) {
          content = await zipService.extractFile(source.file, path);
        } else {
          continue;
        }

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

        const entriesWithSource = fileEntries.map(entry => ({
          ...entry,
          fields: { ...entry.fields, _sourceFile: path },
        }));

        allParsedFiles.push({ path, entries: entriesWithSource, columns: fileColumns });

        updateWorkspace(activeWorkspace.id, {
          parseState: {
            fileName: fileLabel,
            status: 'parsing',
            progress: ((i + 1) / paths.length) * 100,
            parserId,
            parserName,
          },
        });
      }

      const mergedEntries = mergeLogEntries(allParsedFiles);
      const baseColumns = allParsedFiles[0]?.columns || [];
      const columnsWithSource: ColumnDef[] = paths.length > 1
        ? [...baseColumns, { id: 'fields._sourceFile', header: 'Source File', type: 'text' as const, filterMode: 'contains' as const }]
        : baseColumns;

      updateWorkspace(activeWorkspace.id, {
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
      console.error('[App] Failed to parse files:', error);
      updateWorkspace(activeWorkspace.id, {
        parseState: { fileName: fileLabel, status: 'error', progress: 0, error: String(error) },
        status: 'error',
        error: String(error),
      });
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragLeave = () => {
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    const items = Array.from(e.dataTransfer.items).filter(item => item.kind === 'file');
    for (const item of items) {
      const source = await FilePickerService.detectDropSource(item);
      if (source) await handleWorkspaceOpen(source);
    }
  };

  // Apply filters when active workspace or filter state changes
  useEffect(() => {
    if (!activeWorkspace || activeWorkspace.parsedEntries.length === 0) {
      setFilteredEntries([]);
      return;
    }
    const filtered = applyFilters(activeWorkspace.parsedEntries, activeWorkspace.filterState);
    setFilteredEntries(filtered);
  }, [activeWorkspace]);

  // Handle global search change
  const handleGlobalSearchChange = (value: string) => {
    if (!activeWorkspace) return;
    updateWorkspace(activeWorkspace.id, {
      filterState: { ...activeWorkspace.filterState, globalSearch: value },
    });
  };

  // Handle filter state change
  const handleFilterStateChange = (newFilterState: FilterState) => {
    if (!activeWorkspace) return;
    updateWorkspace(activeWorkspace.id, { filterState: newFilterState });
  };

  // Check if we're in raw display mode
  const isRawDisplay = activeWorkspace?.parsedEntries.length === 1 &&
                       activeWorkspace.parsedEntries[0].fields._displayMode === 'raw';

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Ctrl+O to open file
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        const source = await FilePickerService.pickFile();
        if (source) await handleWorkspaceOpenRef.current(source);
      }
      // Ctrl+F or Cmd+F to open search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' &&
          activeWorkspace?.parsedEntries.length && !isRawDisplay) {
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
  }, [activeWorkspace?.parsedEntries.length, isRawDisplay, showSearchModal]);

  return (
    <ErrorBoundary>
      <div
        className="app"
        onDragEnter={isAdmin ? undefined : handleDragEnter}
        onDragOver={isAdmin ? undefined : handleDragOver}
        onDragLeave={isAdmin ? undefined : handleDragLeave}
        onDrop={isAdmin ? undefined : handleDrop}
      >
        {isDragging && (
          <div className="drop-overlay">
            <span className="drop-overlay-label">Drop to open</span>
          </div>
        )}
        <main className="app-main">
          {/* Side Panel */}
          <aside className="side-panel" style={{ width: `${sidebarResize.size}px` }}>
            <WorkspaceList
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
              onWorkspaceSelect={async (id) => {
                const ws = workspaces.find(w => w.id === id);
                if (!ws) return;
                if (ws.status === 'stale') {
                  const reloaded = await reloadStaleWorkspace(id);
                  if (reloaded) {
                    await openWorkspaceContent(id, ws.source);
                  } else {
                    const source = ws.source.type === 'directory'
                      ? await FilePickerService.pickDirectory()
                      : await FilePickerService.pickFile();
                    if (source) await handleWorkspaceOpen(source);
                  }
                } else {
                  switchWorkspace(id);
                }
              }}
              onWorkspaceClose={removeWorkspace}
              onWorkspaceRename={renameWorkspace}
              onPickFile={async () => {
                const source = await FilePickerService.pickFile();
                if (source) await handleWorkspaceOpen(source);
              }}
              onPickDirectory={async () => {
                const source = await FilePickerService.pickDirectory();
                if (source) await handleWorkspaceOpen(source);
              }}
            />
            <div className="side-panel-content">
              <FileTree
                entries={activeWorkspace?.fileEntries || []}
                selectedPaths={activeWorkspace?.selectedFilePaths || []}
                onFileSelect={handleTreeFileSelect}
                sourceType={activeWorkspace?.source.type}
                singleFileName={
                  activeWorkspace?.source.type === 'file' && activeWorkspace.source.file
                    ? activeWorkspace.source.file.name
                    : undefined
                }
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
            {showSearchModal && activeWorkspace && (
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
                    value={activeWorkspace.filterState.globalSearch}
                    onChange={handleGlobalSearchChange}
                  />
                </div>
              </div>
            )}

            <div className="table-area">
              {!activeWorkspace || (activeWorkspace.parsedEntries.length === 0 &&
               activeWorkspace.parseState?.status !== 'parsing') ? (
                <div className="empty-state">
                  <p>
                    {!activeWorkspace
                      ? 'Open a workspace to begin'
                      : 'Select a log file from the tree to view its contents'}
                  </p>
                  {isAdmin && !activeWorkspace && (
                    <p className="empty-state-note">
                      Drag and drop from File Explorer is unavailable when running as administrator (Windows UIPI restriction). Use the Open File or Open Directory buttons.
                    </p>
                  )}
                </div>
              ) : isRawDisplay ? (
                <div className="raw-content-viewer">
                  <pre className="raw-content">{activeWorkspace.parsedEntries[0].raw}</pre>
                </div>
              ) : (
                <LogTable
                  entries={filteredEntries}
                  columns={activeWorkspace.columns}
                  filterState={activeWorkspace.filterState}
                  onFilterChange={handleFilterStateChange}
                  onRowSelect={setSelectedEntry}
                />
              )}
            </div>

            {/* Message panel with resize handle */}
            {!isRawDisplay && activeWorkspace && activeWorkspace.parsedEntries.length > 0 && (
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
            parseState={activeWorkspace?.parseState || null}
            totalEntries={activeWorkspace?.parsedEntries.length || 0}
            filteredEntries={filteredEntries.length}
            isAdmin={isAdmin}
          />
        </footer>

      </div>
    </ErrorBoundary>
  );
}

export default App;
