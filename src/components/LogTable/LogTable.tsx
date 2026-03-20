import React, { useRef, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ParsedLogEntry, ColumnDef } from '../../models/types';
import { createTableColumns } from './columnUtils';

interface LogTableProps {
  entries: ParsedLogEntry[];
  columns: ColumnDef[];
  onRowSelect: (entry: ParsedLogEntry) => void;
}

export const LogTable: React.FC<LogTableProps> = ({ entries, columns, onRowSelect }) => {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const tableColumns = useMemo(() => createTableColumns(columns), [columns]);

  const table = useReactTable({
    data: entries,
    columns: tableColumns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const { rows } = table.getRowModel();

  // Virtualizer
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 35,
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  const paddingTop = virtualRows.length > 0 ? virtualRows[0]?.start || 0 : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? totalSize - (virtualRows[virtualRows.length - 1]?.end || 0)
      : 0;

  if (entries.length === 0) {
    return (
      <div className="log-table-empty">
        <p>No log entries to display</p>
      </div>
    );
  }

  return (
    <div ref={tableContainerRef} className="log-table-container">
      <table className="log-table">
        <thead>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th
                  key={header.id}
                  style={{ width: header.getSize() }}
                  className={header.column.getCanSort() ? 'sortable' : ''}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <div className="header-content">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() && (
                      <span className="sort-indicator">
                        {header.column.getIsSorted() === 'asc' ? ' ↑' : ' ↓'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr>
              <td style={{ height: `${paddingTop}px` }} />
            </tr>
          )}
          {virtualRows.map(virtualRow => {
            const row = rows[virtualRow.index];
            return (
              <tr
                key={row.id}
                onClick={() => onRowSelect(row.original)}
                className="data-row"
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
        </tbody>
      </table>
    </div>
  );
};
