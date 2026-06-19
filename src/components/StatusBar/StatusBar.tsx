import React from 'react';
import type { FileParseState } from '../../models/types';

interface StatusBarProps {
  parseState: FileParseState | null;
  totalEntries: number;
  filteredEntries: number;
  isAdmin: boolean | null;
  autoScroll: boolean;
  onAutoScrollToggle: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  parseState,
  totalEntries,
  filteredEntries,
  isAdmin,
  autoScroll,
  onAutoScrollToggle,
}) => {
  return (
    <div className="status-bar">
      {parseState && (
        <div className="status-section">
          <span className="status-label">File:</span>
          <span className="status-value">{parseState.fileName}</span>
        </div>
      )}

      {parseState && parseState.parserName && (
        <div className="status-section">
          <span className="status-label">Parser:</span>
          <span className="status-value">{parseState.parserName}</span>
        </div>
      )}

      {parseState && parseState.status === 'parsing' && (
        <div className="status-section">
          <span className="status-label">Progress:</span>
          <span className="status-value">{parseState.progress}%</span>
        </div>
      )}

      {parseState && parseState.status === 'complete' && (
        <>
          <div className="status-section">
            <span className="status-label">Total Entries:</span>
            <span className="status-value">{totalEntries.toLocaleString()}</span>
          </div>

          {filteredEntries < totalEntries && (
            <div className="status-section">
              <span className="status-label">Filtered:</span>
              <span className="status-value">{filteredEntries.toLocaleString()}</span>
            </div>
          )}
        </>
      )}

      {parseState && parseState.status === 'error' && (
        <div className="status-section error">
          <span className="status-label">Error:</span>
          <span className="status-value">{parseState.error}</span>
        </div>
      )}

      {window.electronAPI && isAdmin === false && (
        <div className="status-section status-section--warning">
          <span className="status-warning">⚠ Not running as administrator — some files may not be visible.</span>
        </div>
      )}

      <div className="status-section status-section--autoscroll">
        <button
          className={`autoscroll-btn${autoScroll ? ' autoscroll-btn--on' : ''}`}
          onClick={onAutoScrollToggle}
          title="Auto-scroll to newest log line on refresh"
        >
          {autoScroll ? '⏬ Auto-scroll ON' : '⏬ Auto-scroll OFF'}
        </button>
      </div>

    </div>
  );
};
