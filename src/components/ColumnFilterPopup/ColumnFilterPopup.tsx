import React, { useEffect, useRef } from 'react';
import type { ColumnDef, TextFilterValue } from '../../models/types';
import { TextFilter } from '../FilterPanel/TextFilter';
import { EnumFilter } from '../FilterPanel/EnumFilter';
import { TimestampFilter } from '../FilterPanel/TimestampFilter';

interface ColumnFilterPopupProps {
  column: ColumnDef;
  filterValue: any;
  onFilterChange: (value: any) => void;
  onClose: () => void;
  anchorElement: HTMLElement;
}

export const ColumnFilterPopup: React.FC<ColumnFilterPopupProps> = ({
  column,
  filterValue,
  onFilterChange,
  onClose,
  anchorElement,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node) &&
        !anchorElement.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, anchorElement]);

  // Position popup below the column header
  useEffect(() => {
    if (popupRef.current && anchorElement) {
      const rect = anchorElement.getBoundingClientRect();
      const popup = popupRef.current;

      popup.style.top = `${rect.bottom + 4}px`;
      popup.style.left = `${rect.left}px`;
      popup.style.minWidth = `${Math.max(rect.width, 200)}px`;
    }
  }, [anchorElement]);

  const renderFilterControl = () => {
    if (column.type === 'enum' && column.filterMode === 'multiselect') {
      return (
        <EnumFilter
          columnId={column.id}
          label=""
          enumValues={column.enumValues || []}
          selectedValues={(filterValue as string[]) || []}
          onChange={onFilterChange}
        />
      );
    }

    if (column.type === 'timestamp' && column.filterMode === 'range') {
      const rangeValue = filterValue as { start?: string; end?: string } | undefined;
      return (
        <TimestampFilter
          columnId={column.id}
          label=""
          start={rangeValue?.start || ''}
          end={rangeValue?.end || ''}
          onChange={(start, end) => onFilterChange({ start, end })}
        />
      );
    }

    if (column.type === 'text' && column.filterMode === 'contains') {
      return (
        <TextFilter
          columnId={column.id}
          label=""
          value={(filterValue as string | TextFilterValue) ?? ''}
          onChange={onFilterChange}
        />
      );
    }

    return <div className="filter-popup-content">No filter available for this column</div>;
  };

  const handleClear = () => {
    onFilterChange(undefined);
  };

  const hasFilter = filterValue && (
    typeof filterValue === 'string' ? filterValue !== '' :
    Array.isArray(filterValue) ? filterValue.length > 0 :
    ('pattern' in filterValue) ? (filterValue as TextFilterValue).pattern !== '' :
    ((filterValue as any).start || (filterValue as any).end)
  );

  return (
    <div ref={popupRef} className="column-filter-popup">
      <div className="filter-popup-header">
        <span className="filter-popup-title">Filter: {column.header}</span>
        <button className="filter-popup-close" onClick={onClose}>×</button>
      </div>
      <div className="filter-popup-content">
        {renderFilterControl()}
      </div>
      {hasFilter && (
        <div className="filter-popup-footer">
          <button className="filter-popup-clear" onClick={handleClear}>
            Clear Filter
          </button>
        </div>
      )}
    </div>
  );
};
