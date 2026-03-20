import React from 'react';

interface EnumFilterProps {
  columnId: string;
  label: string;
  enumValues: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
}

export const EnumFilter: React.FC<EnumFilterProps> = ({
  columnId,
  label,
  enumValues,
  selectedValues,
  onChange,
}) => {
  const handleToggle = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter(v => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  const handleSelectAll = () => {
    onChange(enumValues);
  };

  const handleClearAll = () => {
    onChange([]);
  };

  return (
    <div className="filter-control enum-filter">
      <label>{label}</label>
      <div className="enum-actions">
        <button onClick={handleSelectAll} className="action-btn">
          All
        </button>
        <button onClick={handleClearAll} className="action-btn">
          None
        </button>
      </div>
      <div className="enum-options">
        {enumValues.map(value => (
          <label key={value} className="enum-option">
            <input
              type="checkbox"
              checked={selectedValues.includes(value)}
              onChange={() => handleToggle(value)}
            />
            <span>{value}</span>
          </label>
        ))}
      </div>
    </div>
  );
};
