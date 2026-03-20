// Convert ColumnDef to TanStack Table columns

import { createColumnHelper } from '@tanstack/react-table';
import type { ColumnDef as AppColumnDef } from '../../models/types';
import type { ParsedLogEntry } from '../../models/types';
import { truncateText } from '../../utils/textUtils';
import { formatTimestamp } from '../../utils/dateUtils';

const columnHelper = createColumnHelper<ParsedLogEntry>();

export function createTableColumns(columns: AppColumnDef[]) {
  return columns.map(col => {
    return columnHelper.accessor(
      row => {
        // Get value from row
        if (col.id in row) {
          return (row as any)[col.id];
        }
        if (col.id.startsWith('fields.')) {
          const fieldName = col.id.substring(7);
          return row.fields[fieldName];
        }
        return null;
      },
      {
        id: col.id,
        header: col.header,
        cell: info => {
          const value = info.getValue();

          if (value === null || value === undefined) {
            return <span className="null-value">—</span>;
          }

          // Format based on type
          if (col.type === 'timestamp') {
            return formatTimestamp(String(value));
          }

          if (col.type === 'number') {
            return Number(value).toLocaleString();
          }

          if (col.id === 'level') {
            return (
              <span className={`level-badge level-${String(value).toLowerCase()}`}>
                {String(value)}
              </span>
            );
          }

          const strValue = String(value);

          // Truncate long text
          if (col.type === 'text' && strValue.length > 100) {
            return <span title={strValue}>{truncateText(strValue, 100)}</span>;
          }

          return strValue;
        },
        size: col.id === 'message' ? 500 : 200,
      }
    );
  });
}
