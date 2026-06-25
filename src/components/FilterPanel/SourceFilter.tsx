import React, { useState } from 'react';

interface SourceFilterProps {
  columnId: string;
  label: string;
  values: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export const SourceFilter: React.FC<SourceFilterProps> = ({
  columnId,
  label,
  values,
  selected,
  onChange,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const visible = searchTerm
    ? values.filter(v => v.toLowerCase().includes(searchTerm.toLowerCase()))
    : values;

  const handleToggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const handleClear = () => {
    onChange([]);
  };

  return (
    <div className="filter-control source-filter">
      {label && <label htmlFor={`${columnId}-search`}>{label}</label>}
      <input
        id={`${columnId}-search`}
        type="text"
        className="source-filter-search"
        placeholder="Search sources…"
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
      />
      <div className="source-filter-list">
        {visible.length === 0 ? (
          <span className="source-filter-empty">No sources match</span>
        ) : (
          visible.map(value => (
            <label key={value} className="source-filter-option">
              <input
                type="checkbox"
                checked={selected.includes(value)}
                onChange={() => handleToggle(value)}
              />
              <span>{value}</span>
            </label>
          ))
        )}
      </div>
      {selected.length > 0 && (
        <button className="source-filter-clear" onClick={handleClear} type="button">
          Clear ({selected.length})
        </button>
      )}
    </div>
  );
};
