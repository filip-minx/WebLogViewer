import React from 'react';

interface GlobalSearchProps {
  value: string;
  onChange: (value: string) => void;
  matchCount: number;
  matchIndex: number;
  onPrev: () => void;
  onNext: () => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({
  value,
  onChange,
  matchCount,
  matchIndex,
  onPrev,
  onNext,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) onPrev();
      else onNext();
    }
  };

  const counterText = !value
    ? ''
    : matchCount === 0
    ? '0 of 0'
    : `${matchIndex + 1} of ${matchCount}`;

  return (
    <div className="global-search">
      <input
        id="global-search-input"
        type="text"
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search across all fields..."
      />
      {value && (
        <>
          <span className="search-counter">{counterText}</span>
          <button
            className="search-nav-btn"
            onClick={onPrev}
            disabled={matchCount === 0}
            title="Previous match (Shift+Enter)"
          >
            ∧
          </button>
          <button
            className="search-nav-btn"
            onClick={onNext}
            disabled={matchCount === 0}
            title="Next match (Enter)"
          >
            ∨
          </button>
          <button className="clear-btn" onClick={() => onChange('')}>
            ×
          </button>
        </>
      )}
    </div>
  );
};
