import React from 'react';
import type { ParsedLogEntry } from '../../models/types';

interface MessagePanelProps {
  entry: ParsedLogEntry | null;
}

export const MessagePanel: React.FC<MessagePanelProps> = ({ entry }) => {
  if (!entry) {
    return (
      <div className="message-panel">
        <div className="message-panel-empty">
          Select a log entry to view its message
        </div>
      </div>
    );
  }

  return (
    <div className="message-panel">
      <div className="message-panel-header">
        <div className="message-panel-info">
          {entry.timestamp && (
            <span className="message-info-item">
              <strong>Timestamp:</strong> {entry.timestamp}
            </span>
          )}
          {entry.level && (
            <span className={`level-badge level-${entry.level.toLowerCase()}`}>
              {entry.level}
            </span>
          )}
          {entry.source && (
            <span className="message-info-item">
              <strong>Source:</strong> {entry.source}
            </span>
          )}
          <span className="message-info-item">
            <strong>Line:</strong> {entry.lineNumber}
          </span>
        </div>
      </div>
      <div className="message-panel-content">
        <pre className="message-text">{entry.message || entry.raw}</pre>
      </div>
    </div>
  );
};
