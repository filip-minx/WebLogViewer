import React from 'react';

interface GlobalSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ value, onChange }) => {
  return (
    <div className="global-search">
      <label htmlFor="global-search-input">Global Search</label>
      <input
        id="global-search-input"
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search across all fields..."
      />
      {value && (
        <button className="clear-btn" onClick={() => onChange('')}>
          ×
        </button>
      )}
    </div>
  );
};
