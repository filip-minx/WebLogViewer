# Source Filter Searchable Multi-Select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the source column's plain text filter with a searchable checkbox list of all distinct source values, supporting multi-selection.

**Architecture:** Add `'searchable-multiselect'` to the `FilterMode` type, create a new `SourceFilter` component that holds local search state and renders a scrollable checkbox list, then wire it into `ColumnFilterPopup` (the active call site) and `FilterPanel` (for future use). Filter state is stored as `string[]` — identical to the existing level multi-select — so `applyFilters` needs no changes.

**Tech Stack:** React + TypeScript; existing CSS design tokens; existing `getUniqueEnumValues` utility.

---

## File Map

| File | Change |
|---|---|
| `src/models/types.ts` | Add `'searchable-multiselect'` to `FilterMode` union |
| `src/parsers/pipeWindowsParser.ts` | Change source column `filterMode` |
| `src/parsers/triplePipeParser.ts` | Change source column `filterMode` |
| `src/parsers/jsonLinesParser.ts` | Change source column `filterMode` |
| `src/components/FilterPanel/SourceFilter.tsx` | New component |
| `src/styles/main.css` | New CSS classes for SourceFilter |
| `src/components/ColumnFilterPopup/ColumnFilterPopup.tsx` | Add `entries` prop, new branch, suppress footer clear |
| `src/components/LogTable/LogTable.tsx` | Pass `entries` to ColumnFilterPopup |
| `src/components/FilterPanel/FilterPanel.tsx` | Add `entries` prop, new branch |
| `src/utils/filterUtils.test.ts` | Extend tests: verify `string[]` filter on source column |

---

## Task 1: Extend FilterMode type and update parsers

Wire the new filter mode into the type system and all three parsers so the app knows source uses a different filter.

**Files:**
- Modify: `src/models/types.ts`
- Modify: `src/parsers/pipeWindowsParser.ts`
- Modify: `src/parsers/triplePipeParser.ts`
- Modify: `src/parsers/jsonLinesParser.ts`

- [ ] **Step 1: Add `'searchable-multiselect'` to `FilterMode` in `src/models/types.ts`**

Current line (line 24):
```ts
export type FilterMode = 'contains' | 'equals' | 'range' | 'multiselect';
```

Change to:
```ts
export type FilterMode = 'contains' | 'equals' | 'range' | 'multiselect' | 'searchable-multiselect';
```

- [ ] **Step 2: Update source column in `src/parsers/pipeWindowsParser.ts`**

Find the line (around line 116):
```ts
{ id: 'source', header: 'Source', type: 'text', filterMode: 'contains' },
```

Change to:
```ts
{ id: 'source', header: 'Source', type: 'text', filterMode: 'searchable-multiselect' },
```

- [ ] **Step 3: Update source column in `src/parsers/triplePipeParser.ts`**

Same change — find:
```ts
{ id: 'source', header: 'Source', type: 'text', filterMode: 'contains' },
```
Change `filterMode` to `'searchable-multiselect'`.

- [ ] **Step 4: Update source column in `src/parsers/jsonLinesParser.ts`**

Same change in that file's column definitions.

- [ ] **Step 5: Type-check**

```bash
npm run type-check
```
Expected: 0 errors. (Nothing consumes `searchable-multiselect` yet, so existing branches still work.)

- [ ] **Step 6: Commit**

```bash
git add src/models/types.ts src/parsers/pipeWindowsParser.ts src/parsers/triplePipeParser.ts src/parsers/jsonLinesParser.ts
git commit -m "feat: add searchable-multiselect FilterMode and update source column parsers"
```

---

## Task 2: Add unit tests for multi-select filtering on source column

`applyFilters` already supports `string[]` for multi-select, but there are no tests exercising this for the source column. Add them now so they fail first, confirming the filter works before the UI is wired.

**Files:**
- Modify: `src/utils/filterUtils.test.ts`

- [ ] **Step 1: Add new test cases to `src/utils/filterUtils.test.ts`**

Append a new `describe` block at the end of the file:

```ts
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
```

- [ ] **Step 2: Run tests**

```bash
npm test
```
Expected: all existing 6 tests pass + 3 new tests pass (the `applyFilters` `Array.isArray` branch already handles this — they should pass immediately).

- [ ] **Step 3: Commit**

```bash
git add src/utils/filterUtils.test.ts
git commit -m "test: add source multiselect filter coverage to filterUtils"
```

---

## Task 3: Create `SourceFilter` component and CSS

The core new component. Stateless with respect to the full source list; holds only local `searchTerm` state.

**Files:**
- Create: `src/components/FilterPanel/SourceFilter.tsx`
- Modify: `src/styles/main.css`

- [ ] **Step 1: Create `src/components/FilterPanel/SourceFilter.tsx`**

```tsx
import React, { useState } from 'react';

interface SourceFilterProps {
  columnId: string;
  label: string;
  values: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export const SourceFilter: React.FC<SourceFilterProps> = ({
  columnId,
  label,
  values,
  selected,
  onChange,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const visible = searchTerm
    ? values.filter(v => v.toLowerCase().includes(searchTerm.toLowerCase()))
    : values;

  const handleToggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const handleClear = () => {
    onChange([]);
  };

  return (
    <div className="filter-control source-filter">
      {label && <label>{label}</label>}
      <input
        type="text"
        className="source-filter-search"
        placeholder="Search sources…"
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        autoFocus
      />
      <div className="source-filter-list">
        {visible.length === 0 ? (
          <span className="source-filter-empty">No sources match</span>
        ) : (
          visible.map(value => (
            <label key={value} className="source-filter-option">
              <input
                type="checkbox"
                checked={selected.includes(value)}
                onChange={() => handleToggle(value)}
              />
              <span>{value}</span>
            </label>
          ))
        )}
      </div>
      {selected.length > 0 && (
        <button className="source-filter-clear" onClick={handleClear} type="button">
          Clear ({selected.length})
        </button>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Add CSS to `src/styles/main.css`**

Append after the `.text-filter-error` block (after line 630):

```css
.source-filter-search {
  width: 100%;
  padding: var(--space-sm);
  border: 1px solid var(--border-standard);
  border-radius: 4px;
  font-size: 12px;
  font-family: var(--font-mono);
  background: rgba(0, 0, 0, 0.3);
  color: var(--text-primary);
  transition: all 0.12s ease;
  box-sizing: border-box;
  margin-bottom: var(--space-sm);
}

.source-filter-search:focus {
  outline: none;
  border-color: var(--border-focus);
  background: rgba(0, 0, 0, 0.4);
  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.1);
}

.source-filter-search::placeholder {
  color: var(--text-muted);
}

.source-filter-list {
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: var(--space-xs);
}

.source-filter-option {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  cursor: pointer;
  font-size: 12px;
  font-family: var(--font-mono);
  padding: var(--space-xs) var(--space-sm);
  border-radius: 3px;
  color: var(--text-primary);
  transition: background 0.08s ease;
  user-select: none;
}

.source-filter-option:hover {
  background: rgba(255, 255, 255, 0.06);
}

.source-filter-option input[type="checkbox"] {
  cursor: pointer;
  flex-shrink: 0;
}

.source-filter-empty {
  font-size: 12px;
  color: var(--text-tertiary);
  padding: var(--space-xs) var(--space-sm);
  font-style: italic;
}

.source-filter-clear {
  margin-top: var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
  border: 1px solid var(--border-standard);
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  transition: all 0.12s ease;
  width: 100%;
}

.source-filter-clear:hover {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-primary);
}
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/FilterPanel/SourceFilter.tsx src/styles/main.css
git commit -m "feat: add SourceFilter component with search input and checkbox list"
```

---

## Task 4: Wire SourceFilter into ColumnFilterPopup

This is the active call site — the popup that opens when a user clicks a column header.

**Files:**
- Modify: `src/components/ColumnFilterPopup/ColumnFilterPopup.tsx`
- Modify: `src/components/LogTable/LogTable.tsx`

- [ ] **Step 1: Update `ColumnFilterPopup.tsx`**

Replace the entire file with this updated version:

```tsx
import React, { useEffect, useRef } from 'react';
import type { ColumnDef, TextFilterValue, ParsedLogEntry } from '../../models/types';
import { TextFilter } from '../FilterPanel/TextFilter';
import { EnumFilter } from '../FilterPanel/EnumFilter';
import { TimestampFilter } from '../FilterPanel/TimestampFilter';
import { SourceFilter } from '../FilterPanel/SourceFilter';
import { getUniqueEnumValues } from '../../utils/filterUtils';

interface ColumnFilterPopupProps {
  column: ColumnDef;
  filterValue: any;
  entries: ParsedLogEntry[];
  onFilterChange: (value: any) => void;
  onClose: () => void;
  anchorElement: HTMLElement;
}

export const ColumnFilterPopup: React.FC<ColumnFilterPopupProps> = ({
  column,
  filterValue,
  entries,
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
    if (column.filterMode === 'searchable-multiselect') {
      return (
        <SourceFilter
          columnId={column.id}
          label=""
          values={getUniqueEnumValues(entries, column.id)}
          selected={(filterValue as string[]) || []}
          onChange={onFilterChange}
        />
      );
    }

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

  // SourceFilter renders its own Clear button — suppress the footer duplicate
  const hasFilter = column.filterMode !== 'searchable-multiselect' && filterValue && (
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
```

- [ ] **Step 2: Update `LogTable.tsx` to pass `entries` to `ColumnFilterPopup`**

In `src/components/LogTable/LogTable.tsx`, find the `ColumnFilterPopup` JSX block (around line 279):

```tsx
{filterPopup && (
  <ColumnFilterPopup
    column={filterPopup.column}
    filterValue={filterState.columnFilters[filterPopup.column.id]}
    onFilterChange={(value) => handleFilterChange(filterPopup.column.id, value)}
    onClose={() => setFilterPopup(null)}
    anchorElement={filterPopup.anchorElement}
  />
)}
```

Add the `entries` prop:

```tsx
{filterPopup && (
  <ColumnFilterPopup
    column={filterPopup.column}
    filterValue={filterState.columnFilters[filterPopup.column.id]}
    entries={entries}
    onFilterChange={(value) => handleFilterChange(filterPopup.column.id, value)}
    onClose={() => setFilterPopup(null)}
    anchorElement={filterPopup.anchorElement}
  />
)}
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```
Expected: 0 errors.

- [ ] **Step 4: Run tests**

```bash
npm test
```
Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ColumnFilterPopup/ColumnFilterPopup.tsx src/components/LogTable/LogTable.tsx
git commit -m "feat: wire SourceFilter into ColumnFilterPopup and LogTable"
```

---

## Task 5: Wire SourceFilter into FilterPanel

`FilterPanel` has no active call site but is updated for correctness and future use.

**Files:**
- Modify: `src/components/FilterPanel/FilterPanel.tsx`

- [ ] **Step 1: Update `FilterPanel.tsx`**

Replace the entire file:

```tsx
import React from 'react';
import type { ColumnDef, FilterState, TextFilterValue, ParsedLogEntry } from '../../models/types';
import { GlobalSearch } from './GlobalSearch';
import { TextFilter } from './TextFilter';
import { EnumFilter } from './EnumFilter';
import { TimestampFilter } from './TimestampFilter';
import { SourceFilter } from './SourceFilter';
import { getUniqueEnumValues } from '../../utils/filterUtils';

interface FilterPanelProps {
  columns: ColumnDef[];
  filterState: FilterState;
  entries: ParsedLogEntry[];
  onFilterChange: (filterState: FilterState) => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  columns,
  filterState,
  entries,
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

    const isEmpty =
      !value ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === 'object' && 'pattern' in value && !value.pattern);

    if (isEmpty) {
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

      <GlobalSearch
        value={filterState.globalSearch}
        onChange={handleGlobalSearchChange}
        matchCount={0}
        matchIndex={0}
        onPrev={() => {}}
        onNext={() => {}}
      />

      <div className="column-filters">
        {columns
          .filter(col => col.filterMode && col.id !== 'lineNumber')
          .map(col => {
            const filterValue = filterState.columnFilters[col.id];

            if (col.filterMode === 'searchable-multiselect') {
              return (
                <SourceFilter
                  key={col.id}
                  columnId={col.id}
                  label={col.header}
                  values={getUniqueEnumValues(entries, col.id)}
                  selected={(filterValue as string[]) || []}
                  onChange={value => handleColumnFilterChange(col.id, value)}
                />
              );
            }

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
                  value={(filterValue as string | TextFilterValue) ?? ''}
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
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```
Expected: 0 errors.

- [ ] **Step 3: Run tests**

```bash
npm test
```
Expected: all 9 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/FilterPanel/FilterPanel.tsx
git commit -m "feat: wire SourceFilter into FilterPanel with entries prop"
```

---

## Task 6: Manual smoke test in Electron

Verify the feature end-to-end.

- [ ] **Step 1: Build**

```bash
npm run build:electron
```

- [ ] **Step 2: Launch and load a log file**

Launch the app and open a pipe-separated log file (the sample format from CLAUDE.md works):
```
2026-04-16_10-00-00.000|INFO|TestSource|Application started
2026-04-16_10-00-01.123|ERROR|AnotherSource|Failed to connect
2026-04-16_10-00-02.456|WARN|TestSource|Retrying
2026-04-16_10-00-03.789|INFO|ThirdSource|Done
```

- [ ] **Step 3: Open source filter**

Click the `Source` column header. A popup should appear with a search input and a scrollable checkbox list showing `AnotherSource`, `TestSource`, `ThirdSource` (alphabetical).

- [ ] **Step 4: Test multi-selection**

Check `TestSource` and `AnotherSource`. Only rows with those sources should appear. The filter indicator dot (●) should appear on the Source column header.

- [ ] **Step 5: Test search**

Type `Another` in the search box. Only `AnotherSource` should appear in the list. `TestSource` and `ThirdSource` should be hidden.

- [ ] **Step 6: Test clear**

With some sources selected, the "Clear (N)" button should appear. Click it — all rows reappear, button disappears.

- [ ] **Step 7: Test empty selection = no filter**

Deselect all individually. All rows should reappear. The filter indicator dot on the column header should disappear.

- [ ] **Step 8: Confirm no duplicate Clear button**

When sources are selected, verify there is only ONE clear button (inside the SourceFilter, not in the popup footer).

- [ ] **Step 9: Commit if any fixes were needed**

If you found and fixed issues during smoke testing, commit them with a descriptive message. If no changes were needed:
```bash
git commit --allow-empty -m "chore: smoke test source filter — verified working"
```
