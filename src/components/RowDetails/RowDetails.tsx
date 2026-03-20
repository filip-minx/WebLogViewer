import React from 'react';
import type { ParsedLogEntry } from '../../models/types';

interface RowDetailsProps {
  entry: ParsedLogEntry | null;
  onClose: () => void;
}

export const RowDetails: React.FC<RowDetailsProps> = ({ entry, onClose }) => {
  if (!entry) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('Copied to clipboard!');
    });
  };

  return (
    <div className="row-details-overlay" onClick={onClose}>
      <div className="row-details-modal" onClick={e => e.stopPropagation()}>
        <div className="row-details-header">
          <h3>Row Details</h3>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="row-details-content">
          <div className="detail-section">
            <h4>Raw Content</h4>
            <pre className="detail-raw">{entry.raw}</pre>
            <button onClick={() => copyToClipboard(entry.raw)}>Copy Raw</button>
          </div>

          {entry.timestamp && (
            <div className="detail-section">
              <h4>Timestamp</h4>
              <p>{entry.timestamp}</p>
            </div>
          )}

          {entry.level && (
            <div className="detail-section">
              <h4>Level</h4>
              <p className={`level-badge level-${entry.level.toLowerCase()}`}>
                {entry.level}
              </p>
            </div>
          )}

          {entry.source && (
            <div className="detail-section">
              <h4>Source</h4>
              <p>{entry.source}</p>
            </div>
          )}

          {entry.message && (
            <div className="detail-section">
              <h4>Message</h4>
              <pre className="detail-message">{entry.message}</pre>
            </div>
          )}

          <div className="detail-section">
            <h4>All Fields</h4>
            <table className="fields-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(entry.fields).map(([key, value]) => (
                  <tr key={key}>
                    <td className="field-key">{key}</td>
                    <td className="field-value">{String(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
