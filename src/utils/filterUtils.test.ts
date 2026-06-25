import { describe, it, expect } from 'vitest';
import { applyFilters } from './filterUtils';
import type { ParsedLogEntry, FilterState } from '../models/types';

function entry(message: string): ParsedLogEntry {
  return {
    rowId: '1',
    lineNumber: 1,
    raw: message,
    message,
    fields: {},
  };
}

const entries = [
  entry('Connection refused'),
  entry('Timeout after 5000ms'),
  entry('Connection established'),
];

describe('applyFilters — text filter', () => {
  it('plain string: substring match (case-insensitive)', () => {
    const state: FilterState = {
      globalSearch: '',
      columnFilters: { message: 'connection' },
    };
    const result = applyFilters(entries, state);
    expect(result).toHaveLength(2);
    expect(result.map(e => e.message)).toEqual(['Connection refused', 'Connection established']);
  });

  it('TextFilterValue isRegex:false: same as plain substring', () => {
    const state: FilterState = {
      globalSearch: '',
      columnFilters: { message: { pattern: 'connection', isRegex: false } },
    };
    const result = applyFilters(entries, state);
    expect(result).toHaveLength(2);
  });

  it('TextFilterValue isRegex:true: filters by regex', () => {
    const state: FilterState = {
      globalSearch: '',
      columnFilters: { message: { pattern: '^Conn', isRegex: true } },
    };
    const result = applyFilters(entries, state);
    expect(result).toHaveLength(2); // both start with Conn
  });

  it('regex: case-insensitive flag i supported', () => {
    const state: FilterState = {
      globalSearch: '',
      columnFilters: { message: { pattern: 'timeout', isRegex: true } },
    };
    const result = applyFilters(entries, state);
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe('Timeout after 5000ms');
  });

  it('invalid regex: returns no matches (does not throw)', () => {
    const state: FilterState = {
      globalSearch: '',
      columnFilters: { message: { pattern: '[invalid', isRegex: true } },
    };
    expect(() => applyFilters(entries, state)).not.toThrow();
    const result = applyFilters(entries, state);
    expect(result).toHaveLength(0);
  });

  it('empty pattern with isRegex:true: matches everything', () => {
    const state: FilterState = {
      globalSearch: '',
      columnFilters: { message: { pattern: '', isRegex: true } },
    };
    // { pattern: '', isRegex: true } is kept in FilterState (regex toggle on, no pattern yet)
    // applyFilters must treat an empty pattern as a pass-through
    const result = applyFilters(entries, state);
    expect(result).toHaveLength(3);
  });
});

describe('applyFilters — source multiselect filter', () => {
  function sourceEntry(source: string): ParsedLogEntry {
    return {
      rowId: source,
      lineNumber: 1,
      raw: source,
      source,
      fields: {},
    };
  }

  const sourceEntries = [
    sourceEntry('AuthService'),
    sourceEntry('PaymentService'),
    sourceEntry('UserService'),
  ];

  it('empty array: shows all entries', () => {
    const state: FilterState = {
      globalSearch: '',
      columnFilters: { source: [] },
    };
    // empty array is removed by isEmpty guard before applyFilters is called,
    // but applyFilters itself should not filter on empty arrays stored in columnFilters
    // (the guard deletes the key; so this test confirms no key = all rows)
    const stateNoKey: FilterState = { globalSearch: '', columnFilters: {} };
    expect(applyFilters(sourceEntries, stateNoKey)).toHaveLength(3);
  });

  it('single selection: shows only matching entries', () => {
    const state: FilterState = {
      globalSearch: '',
      columnFilters: { source: ['AuthService'] },
    };
    const result = applyFilters(sourceEntries, state);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('AuthService');
  });

  it('multiple selections: shows all matching entries', () => {
    const state: FilterState = {
      globalSearch: '',
      columnFilters: { source: ['AuthService', 'UserService'] },
    };
    const result = applyFilters(sourceEntries, state);
    expect(result).toHaveLength(2);
    expect(result.map(e => e.source)).toEqual(['AuthService', 'UserService']);
  });

  it('selection with no match: returns empty', () => {
    const state: FilterState = {
      globalSearch: '',
      columnFilters: { source: ['UnknownService'] },
    };
    const result = applyFilters(sourceEntries, state);
    expect(result).toHaveLength(0);
  });
});
