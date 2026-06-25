# Source Filter: Searchable Multi-Select Design

## Goal

Replace the source column's plain-text "contains" filter with a searchable checkbox list that shows all distinct source values from the currently loaded log entries. Users can check multiple sources to show logs from any of them; an empty selection shows everything.

---

## Scope

This is a one-off feature for the source column only. The level column's existing `EnumFilter` is not changed. The `EnumFilter` component is not changed.

---

## Data Model

### FilterMode

Add `'searchable-multiselect'` to the `FilterMode` union in `src/models/types.ts`:

```ts
export type FilterMode = 'contains' | 'equals' | 'range' | 'multiselect' | 'searchable-multiselect';
```

### FilterValue for source

The stored value in `FilterState.columnFilters['source']` is a plain `string[]` — identical to the existing `multiselect` type used by the level column. `applyFilters` in `filterUtils.ts` already handles arrays with an inclusion check and requires no changes.

An empty array (`[]`) is treated as "no filter" by the existing `isEmpty` guard in `FilterPanel.handleColumnFilterChange` and `LogTable.handleFilterChange`, so it is deleted from `columnFilters` and all rows are shown.

### Source column definition in parsers

Change the `source` column definition in all three delimited parsers from `filterMode: 'contains'` to `filterMode: 'searchable-multiselect'`. Affected files:

- `src/parsers/pipeWindowsParser.ts`
- `src/parsers/triplePipeParser.ts`
- `src/parsers/jsonLinesParser.ts`

Before:
```ts
{ id: 'source', header: 'Source', type: 'text', filterMode: 'contains' }
```

After:
```ts
{ id: 'source', header: 'Source', type: 'text', filterMode: 'searchable-multiselect' }
```

---

## Component: `SourceFilter`

**File:** `src/components/FilterPanel/SourceFilter.tsx`

### Props

```ts
interface SourceFilterProps {
  columnId: string;
  label: string;
  values: string[];        // all distinct source values, pre-sorted alphabetically
  selected: string[];      // currently checked sources
  onChange: (selected: string[]) => void;
}
```

### Behaviour

- `values` is computed externally via `getUniqueEnumValues(entries, 'source')` — the component itself is stateless with respect to the full list.
- `searchTerm` is local component state (not persisted). It filters the visible checkbox list client-side. When `searchTerm` is empty, all values are shown.
- The search input matches case-insensitively using `includes`.
- Each checkbox: checking adds the value to `selected`; unchecking removes it. The comparison is exact string match.
- "Clear" button: visible only when `selected.length > 0`. Calls `onChange([])`.
- Empty selection means no filter is active — all rows pass through.

### Layout (top to bottom)

1. Label (`"Source"`, styled same as other filter labels — uppercase, small, tertiary colour)
2. Search input — placeholder `"Search sources…"`, local state only
3. Scrollable checkbox list — `max-height: 200px`, `overflow-y: auto`. Each row: checkbox + source name label. Only shows items where `value.toLowerCase().includes(searchTerm.toLowerCase())`.
4. Clear button — only rendered when `selected.length > 0`

### CSS

New classes added to `src/styles/main.css` using existing design tokens:

- `.source-filter-search` — search input, full width, same styling as `.filter-control input[type="text"]`
- `.source-filter-list` — scrollable container, `max-height: 200px`, `overflow-y: auto`
- `.source-filter-option` — flex row, `align-items: center`, `gap: var(--space-xs)`, hover background, `cursor: pointer`
- `.source-filter-clear` — clear button, same pattern as `.clear-btn`

---

## Wiring: FilterPanel

**File:** `src/components/FilterPanel/FilterPanel.tsx`

`FilterPanel` is not rendered in `App.tsx` — the app uses only `ColumnFilterPopup` (opened from column headers) for per-column filtering. `FilterPanel` exists as a component but has no active call site. The `searchable-multiselect` branch is added to it anyway for correctness and future use, but the primary wiring that matters is `ColumnFilterPopup`.

### Props change

Add `entries: ParsedLogEntry[]` to `FilterPanelProps`:

```ts
interface FilterPanelProps {
  columns: ColumnDef[];
  filterState: FilterState;
  entries: ParsedLogEntry[];   // NEW
  onFilterChange: (filterState: FilterState) => void;
}
```

### New branch in column filter rendering

```ts
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
```

Also add imports: `SourceFilter` from `./SourceFilter` and `getUniqueEnumValues` from `../../utils/filterUtils`.

---

## Wiring: ColumnFilterPopup

**File:** `src/components/ColumnFilterPopup/ColumnFilterPopup.tsx`

The popup opened from the column header also renders filter controls. It needs the same `SourceFilter` branch and access to `entries`.

### Props change

```ts
interface ColumnFilterPopupProps {
  column: ColumnDef;
  filterValue: any;
  entries: ParsedLogEntry[];   // NEW
  onFilterChange: (value: any) => void;
  onClose: () => void;
  anchorElement: HTMLElement;
}
```

### New branch in `renderFilterControl`

```ts
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
```

Also add imports: `SourceFilter` from `../FilterPanel/SourceFilter` and `getUniqueEnumValues` from `../../utils/filterUtils` and `ParsedLogEntry` from `../../models/types`.

### Suppress duplicate Clear button in popup footer

`ColumnFilterPopup` renders a "Clear Filter" button in its footer when `hasFilter` is truthy. `SourceFilter` already renders its own "Clear" button internally. To avoid two clear controls appearing simultaneously, suppress the popup footer button when the column uses `searchable-multiselect`:

```ts
const hasFilter = column.filterMode !== 'searchable-multiselect' && filterValue && (
  typeof filterValue === 'string' ? filterValue !== '' :
  Array.isArray(filterValue) ? filterValue.length > 0 :
  ('pattern' in filterValue) ? (filterValue as TextFilterValue).pattern !== '' :
  ((filterValue as any).start || (filterValue as any).end)
);
```

### LogTable.tsx

`ColumnFilterPopup` is rendered inside `LogTable`. Pass `entries` down:

```tsx
<ColumnFilterPopup
  column={filterPopup.column}
  filterValue={filterState.columnFilters[filterPopup.column.id]}
  entries={entries}   // NEW — already in LogTable props
  onFilterChange={(value) => handleFilterChange(filterPopup.column.id, value)}
  onClose={() => setFilterPopup(null)}
  anchorElement={filterPopup.anchorElement}
/>
```

Also update `LogTable.handleFilterChange` to recognise `string[]` as a non-removable value when it's non-empty. The existing `shouldRemove` check covers this: `!value` is false for a non-empty array, and `Array.isArray(value) && value.length === 0` correctly handles the empty-array case. No changes needed to `handleFilterChange`.

---

## What Is Not Changing

- `EnumFilter.tsx` — untouched
- `filterUtils.ts` — no changes; `applyFilters` already handles `string[]` via the `Array.isArray` branch; `getUniqueEnumValues` is already implemented
- `applyFilters` filter logic — no changes
- Level column filter — unaffected; still uses `EnumFilter` with static `enumValues`
- `TextFilter.tsx` — unaffected; source column moves to `searchable-multiselect`, leaving the text filter for other columns

---

## Out of Scope

- Persisting `searchTerm` across sessions (it is ephemeral local state)
- Adding searchable multi-select to any column other than source
- Virtualising the source list (not needed unless a log file has thousands of distinct sources, which is not the expected use case)
