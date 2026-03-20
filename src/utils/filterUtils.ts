// Filter utility functions

import type { ParsedLogEntry, FilterState } from '../models/types';
import { parseTimestamp } from './dateUtils';

export function applyFilters(
  entries: ParsedLogEntry[],
  filterState: FilterState
): ParsedLogEntry[] {
  let filtered = entries;

  // Apply global search
  if (filterState.globalSearch) {
    const search = filterState.globalSearch.toLowerCase();
    filtered = filtered.filter(entry => {
      const searchableText = [
        entry.raw,
        entry.message,
        entry.source,
        entry.level,
        Object.values(entry.fields).join(' ')
      ].join(' ').toLowerCase();

      return searchableText.includes(search);
    });
  }

  // Apply column filters
  for (const [columnId, filterValue] of Object.entries(filterState.columnFilters)) {
    if (!filterValue) continue;

    filtered = filtered.filter(entry => {
      const value = getColumnValue(entry, columnId);

      if (typeof filterValue === 'string') {
        // Text contains filter
        return String(value || '').toLowerCase().includes(filterValue.toLowerCase());
      }

      if (Array.isArray(filterValue)) {
        // Multi-select enum filter
        return filterValue.includes(String(value));
      }

      if (typeof filterValue === 'object') {
        // Range filter
        if ('min' in filterValue || 'max' in filterValue) {
          // Number range
          const numValue = Number(value);
          if (isNaN(numValue)) return false;
          if (filterValue.min !== undefined && numValue < filterValue.min) return false;
          if (filterValue.max !== undefined && numValue > filterValue.max) return false;
          return true;
        }

        if ('start' in filterValue || 'end' in filterValue) {
          // Date range
          const entryDate = parseTimestamp(String(value || ''));
          if (!entryDate) return false;

          const startDate = filterValue.start ? parseTimestamp(filterValue.start) : null;
          const endDate = filterValue.end ? parseTimestamp(filterValue.end) : null;

          if (startDate && entryDate < startDate) return false;
          if (endDate && entryDate > endDate) return false;
          return true;
        }
      }

      return true;
    });
  }

  return filtered;
}

function getColumnValue(entry: ParsedLogEntry, columnId: string): any {
  // Direct properties
  if (columnId in entry) {
    return (entry as any)[columnId];
  }

  // Nested fields (e.g., fields.columnName)
  if (columnId.startsWith('fields.')) {
    const fieldName = columnId.substring(7);
    return entry.fields[fieldName];
  }

  return null;
}

export function getUniqueEnumValues(
  entries: ParsedLogEntry[],
  columnId: string
): string[] {
  const values = new Set<string>();

  for (const entry of entries) {
    const value = getColumnValue(entry, columnId);
    if (value !== null && value !== undefined) {
      values.add(String(value));
    }
  }

  return Array.from(values).sort();
}
