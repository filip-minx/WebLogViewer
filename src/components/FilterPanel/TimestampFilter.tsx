import React from 'react';

interface TimestampFilterProps {
  columnId: string;
  label: string;
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}

export const TimestampFilter: React.FC<TimestampFilterProps> = ({
  columnId,
  label,
  start,
  end,
  onChange,
}) => {
  return (
    <div className="filter-control timestamp-filter">
      <label>{label}</label>
      <div className="timestamp-inputs">
        <input
          type="text"
          value={start}
          onChange={e => onChange(e.target.value, end)}
          placeholder="Start (YYYY-MM-DD)"
        />
        <span className="range-separator">to</span>
        <input
          type="text"
          value={end}
          onChange={e => onChange(start, e.target.value)}
          placeholder="End (YYYY-MM-DD)"
        />
      </div>
      {(start || end) && (
        <button className="clear-btn" onClick={() => onChange('', '')}>
          Clear
        </button>
      )}
    </div>
  );
};
