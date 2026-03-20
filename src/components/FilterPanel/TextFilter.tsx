import React from 'react';

interface TextFilterProps {
  columnId: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export const TextFilter: React.FC<TextFilterProps> = ({
  columnId,
  label,
  value,
  onChange,
}) => {
  return (
    <div className="filter-control">
      <label htmlFor={`filter-${columnId}`}>{label}</label>
      <input
        id={`filter-${columnId}`}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={`Filter ${label.toLowerCase()}...`}
      />
      {value && (
        <button className="clear-btn" onClick={() => onChange('')}>
          ×
        </button>
      )}
    </div>
  );
};
