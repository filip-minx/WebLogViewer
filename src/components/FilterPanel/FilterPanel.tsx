import React from 'react';
import type { ColumnDef, FilterState } from '../../models/types';
import { GlobalSearch } from './GlobalSearch';
import { TextFilter } from './TextFilter';
import { EnumFilter } from './EnumFilter';
import { TimestampFilter } from './TimestampFilter';

interface FilterPanelProps {
  columns: ColumnDef[];
  filterState: FilterState;
  onFilterChange: (filterState: FilterState) => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  columns,
  filterState,
  onFilterChange,
}) => {
  const handleGlobalSearchChange = (value: string) => {
    onFilterChange({
      ...filterState,
      globalSearch: value,
    });
  };

  const handleColumnFilterChange = (columnId: string, value: any) => {
    const newColumnFilters = { ...filterState.columnFilters };

    if (!value || (Array.isArray(value) && value.length === 0)) {
      delete newColumnFilters[columnId];
    } else {
      newColumnFilters[columnId] = value;
    }

    onFilterChange({
      ...filterState,
      columnFilters: newColumnFilters,
    });
  };

  const handleClearAll = () => {
    onFilterChange({
      globalSearch: '',
      columnFilters: {},
    });
  };

  const hasActiveFilters =
    filterState.globalSearch || Object.keys(filterState.columnFilters).length > 0;

  return (
    <div className="filter-panel">
      <div className="filter-header">
        <h3>Filters</h3>
        {hasActiveFilters && (
          <button className="clear-all-btn" onClick={handleClearAll}>
            Clear All
          </button>
        )}
      </div>

      <GlobalSearch value={filterState.globalSearch} onChange={handleGlobalSearchChange} />

      <div className="column-filters">
        {columns
          .filter(col => col.filterMode && col.id !== 'lineNumber')
          .map(col => {
            const filterValue = filterState.columnFilters[col.id];

            if (col.type === 'enum' && col.filterMode === 'multiselect') {
              return (
                <EnumFilter
                  key={col.id}
                  columnId={col.id}
                  label={col.header}
                  enumValues={col.enumValues || []}
                  selectedValues={(filterValue as string[]) || []}
                  onChange={value => handleColumnFilterChange(col.id, value)}
                />
              );
            }

            if (col.type === 'timestamp' && col.filterMode === 'range') {
              const rangeValue = filterValue as { start?: string; end?: string } | undefined;
              return (
                <TimestampFilter
                  key={col.id}
                  columnId={col.id}
                  label={col.header}
                  start={rangeValue?.start || ''}
                  end={rangeValue?.end || ''}
                  onChange={(start, end) =>
                    handleColumnFilterChange(col.id, { start, end })
                  }
                />
              );
            }

            if (col.type === 'text' && col.filterMode === 'contains') {
              return (
                <TextFilter
                  key={col.id}
                  columnId={col.id}
                  label={col.header}
                  value={(filterValue as string) || ''}
                  onChange={value => handleColumnFilterChange(col.id, value)}
                />
              );
            }

            return null;
          })}
      </div>
    </div>
  );
};
