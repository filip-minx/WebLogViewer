import React from 'react';
import type { TextFilterValue } from '../../models/types';

// Accepts either a legacy plain string or the new TextFilterValue
type TextFilterRawValue = string | TextFilterValue;

interface TextFilterProps {
  columnId: string;
  label: string;
  value: TextFilterRawValue;
  onChange: (value: TextFilterValue) => void;
}

function normalise(value: TextFilterRawValue): TextFilterValue {
  if (typeof value === 'string') return { pattern: value, isRegex: false };
  return value;
}

export const TextFilter: React.FC<TextFilterProps> = ({
  columnId,
  label,
  value,
  onChange,
}) => {
  const { pattern, isRegex } = normalise(value);

  const handlePatternChange = (newPattern: string) => {
    onChange({ pattern: newPattern, isRegex });
  };

  const handleRegexToggle = () => {
    onChange({ pattern, isRegex: !isRegex });
  };

  const handleClear = () => {
    onChange({ pattern: '', isRegex });
  };

  const isInvalidRegex = isRegex && pattern !== '' && (() => {
    try { new RegExp(pattern); return false; } catch { return true; }
  })();

  return (
    <div className="filter-control">
      <label htmlFor={`filter-${columnId}`}>{label}</label>
      <div className="text-filter-row">
        <input
          id={`filter-${columnId}`}
          type="text"
          autoFocus
          value={pattern}
          onChange={e => handlePatternChange(e.target.value)}
          placeholder={isRegex ? 'Regex pattern...' : `Filter ${label.toLowerCase()}...`}
          className={isInvalidRegex ? 'text-filter-input--error' : ''}
        />
        <button
          className={`regex-toggle-btn${isRegex ? ' regex-toggle-btn--active' : ''}`}
          onClick={handleRegexToggle}
          title={isRegex ? 'Switch to plain text filter' : 'Switch to regex filter'}
          type="button"
        >
          .*
        </button>
        {pattern && (
          <button className="clear-btn" onClick={handleClear} type="button">
            ×
          </button>
        )}
      </div>
      {isInvalidRegex && (
        <span className="text-filter-error">Invalid regex</span>
      )}
    </div>
  );
};
