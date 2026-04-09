import React, { useState, useRef, useEffect } from 'react';
import type { Workspace, WorkspaceSource } from '../../models/types';

interface WorkspaceListProps {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onWorkspaceSelect: (id: string) => void;
  onWorkspaceClose: (id: string) => void | Promise<void>;
  onWorkspaceRename: (id: string, newName: string) => void;
  onPickFile: () => void;
  onPickDirectory: () => void;
}

function getSourceIcon(source: WorkspaceSource): string {
  switch (source.type) {
    case 'directory': return '📁';
    case 'zip':       return '🗜';
    case 'file':      return '📄';
  }
}

function getStatusDot(status: string): string {
  switch (status) {
    case 'parsing': return '●';
    case 'ready':   return '✓';
    case 'error':   return '✕';
    case 'stale':   return '○';
    default:        return '○';
  }
}

export function WorkspaceList({
  workspaces,
  activeWorkspaceId,
  onWorkspaceSelect,
  onWorkspaceClose,
  onWorkspaceRename,
  onPickFile,
  onPickDirectory,
}: WorkspaceListProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  // Focus+select input when rename starts
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const startRename = (ws: Workspace, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(ws.id);
    setEditingName(ws.name);
  };

  const commitRename = (id: string) => {
    const trimmed = editingName.trim();
    if (trimmed) onWorkspaceRename(id, trimmed);
    setEditingId(null);
  };

  return (
    <div className="workspace-list">
      <div className="workspace-list-header">
        <span className="workspace-list-label">WORKSPACES</span>
        <div className="workspace-open-menu-wrapper" ref={menuRef}>
          <button
            className="workspace-add-btn"
            onClick={() => setShowMenu(v => !v)}
            title="Open workspace"
          >
            +
          </button>
          {showMenu && (
            <div className="workspace-open-menu">
              <button
                className="workspace-open-menu-item"
                onClick={() => { setShowMenu(false); onPickFile(); }}
              >
                Open file…
              </button>
              <button
                className="workspace-open-menu-item"
                onClick={() => { setShowMenu(false); onPickDirectory(); }}
              >
                Open folder…
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="workspace-list-items">
        {workspaces.map(ws => (
          <div
            key={ws.id}
            className={`workspace-item ${ws.id === activeWorkspaceId ? 'active' : ''} status-${ws.status}`}
            onClick={() => onWorkspaceSelect(ws.id)}
            title={`${ws.name}\nStatus: ${ws.status}`}
          >
            <span className="workspace-source-icon">{getSourceIcon(ws.source)}</span>

            {editingId === ws.id ? (
              <input
                ref={inputRef}
                className="workspace-name-input"
                value={editingName}
                onChange={e => setEditingName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { cancelledRef.current = false; commitRename(ws.id); }
                  if (e.key === 'Escape') { cancelledRef.current = true; setEditingId(null); }
                }}
                onBlur={() => { if (!cancelledRef.current) commitRename(ws.id); cancelledRef.current = false; }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span
                className="workspace-name"
                onDoubleClick={e => startRename(ws, e)}
              >
                {ws.name}
              </span>
            )}

            <span className={`workspace-status-dot status-${ws.status}`}>
              {getStatusDot(ws.status)}
            </span>

            <button
              className="workspace-close-btn"
              onClick={e => { e.stopPropagation(); onWorkspaceClose(ws.id); }}
              title="Close workspace"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
