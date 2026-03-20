import React, { useRef, useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnResizeMode,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ParsedLogEntry, ColumnDef, FilterState } from '../../models/types';
import { createTableColumns } from './columnUtils';
import { ColumnFilterPopup } from '../ColumnFilterPopup/ColumnFilterPopup';

interface LogTableProps {
  entries: ParsedLogEntry[];
  columns: ColumnDef[];
  filterState: FilterState;
  onFilterChange: (filterState: FilterState) => void;
  onRowSelect: (entry: ParsedLogEntry) => void;
}

export const LogTable: React.FC<LogTableProps> = ({
  entries,
  columns,
  filterState,
  onFilterChange,
  onRowSelect,
}) => {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(-1);
  const [filterPopup, setFilterPopup] = useState<{
    column: ColumnDef;
    anchorElement: HTMLElement;
  } | null>(null);

  const tableColumns = useMemo(() => createTableColumns(columns), [columns]);
  const [columnResizeMode] = useState<ColumnResizeMode>('onChange');

  const table = useReactTable({
    data: entries,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode,
    enableColumnResizing: true,
  });

  const { rows } = table.getRowModel();

  // Virtualizer
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 27,
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  const paddingTop = virtualRows.length > 0 ? virtualRows[0]?.start || 0 : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? totalSize - (virtualRows[virtualRows.length - 1]?.end || 0)
      : 0;

  // Handle keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (rows.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const newIndex = Math.min(focusedRowIndex + 1, rows.length - 1);
        setFocusedRowIndex(newIndex);
        onRowSelect(rows[newIndex].original);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const newIndex = Math.max(focusedRowIndex - 1, 0);
        setFocusedRowIndex(newIndex);
        onRowSelect(rows[newIndex].original);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedRowIndex, rows, onRowSelect]);

  // Auto-select first row on entries change
  React.useEffect(() => {
    if (rows.length > 0 && focusedRowIndex === -1) {
      setFocusedRowIndex(0);
      onRowSelect(rows[0].original);
    }
  }, [rows, focusedRowIndex, onRowSelect]);

  const handleRowClick = (index: number, entry: ParsedLogEntry) => {
    setFocusedRowIndex(index);
    onRowSelect(entry);
  };

  const handleColumnHeaderClick = (e: React.MouseEvent, columnId: string) => {
    e.stopPropagation();
    const column = columns.find(c => c.id === columnId);
    if (column && column.filterMode) {
      setFilterPopup({
        column,
        anchorElement: e.currentTarget as HTMLElement,
      });
    }
  };

  const handleFilterChange = (columnId: string, value: any) => {
    const newColumnFilters = { ...filterState.columnFilters };

    // Check if filter should be removed
    const shouldRemove =
      !value ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === 'object' && !Array.isArray(value) && !value.start && !value.end);

    if (shouldRemove) {
      delete newColumnFilters[columnId];
    } else {
      newColumnFilters[columnId] = value;
    }

    onFilterChange({
      ...filterState,
      columnFilters: newColumnFilters,
    });
  };

  const hasNoEntries = entries.length === 0;

  return (
    <div ref={tableContainerRef} className="log-table-container">
      <table className="log-table">
        <thead>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => {
                const columnDef = columns.find(c => c.id === header.id);
                const hasFilter = columnDef?.filterMode && filterState.columnFilters[header.id];
                const isFilterable = columnDef?.filterMode;

                return (
                  <th
                    key={header.id}
                    style={{ width: header.getSize(), position: 'relative' }}
                    className={isFilterable ? 'filterable' : ''}
                    onClick={(e) => isFilterable && handleColumnHeaderClick(e, header.id)}
                  >
                    <div className="header-content">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {hasFilter && <span className="filter-indicator">●</span>}
                    </div>
                    {header.column.getCanResize() && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className={`column-resizer ${header.column.getIsResizing() ? 'resizing' : ''}`}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {hasNoEntries ? (
            <tr>
              <td colSpan={columns.length} className="no-results-message">
                No log entries match the current filters
              </td>
            </tr>
          ) : (
            <>
              {paddingTop > 0 && (
                <tr>
                  <td style={{ height: `${paddingTop}px` }} />
                </tr>
              )}
              {virtualRows.map(virtualRow => {
                const row = rows[virtualRow.index];
                const isFocused = virtualRow.index === focusedRowIndex;
                return (
                  <tr
                    key={row.id}
                    onClick={() => handleRowClick(virtualRow.index, row.original)}
                    className={`data-row ${isFocused ? 'focused' : ''}`}
                  >
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} style={{ width: cell.column.getSize() }}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {paddingBottom > 0 && (
                <tr>
                  <td style={{ height: `${paddingBottom}px` }} />
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>

      {/* Filter popup */}
      {filterPopup && (
        <ColumnFilterPopup
          column={filterPopup.column}
          filterValue={filterState.columnFilters[filterPopup.column.id]}
          onFilterChange={(value) => handleFilterChange(filterPopup.column.id, value)}
          onClose={() => setFilterPopup(null)}
          anchorElement={filterPopup.anchorElement}
        />
      )}
    </div>
  );
};
