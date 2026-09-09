# New Leads by Source — Yearly Comparison Table

## Context

The "运营报表" (Ops Report) section on the dashboard
([app/(dashboard)/dashboard/page.tsx](../../../app/(dashboard)/dashboard/page.tsx))
already has a "New leads by source" bar list, but it's scoped to a single
month via the existing `opsMonth` `<input type="month">` picker — there's no
way to compare across months or previous years. This adds a second widget,
a source × month table for one selected year, so an admin/manager can flip
the year and see the whole year's shape at a glance, and compare it against
prior years by changing the year.

## Data

New function in `lib/dashboardMetrics.ts`, alongside the existing
`leadsBySource`:

```ts
export interface SourceYearRow {
  id: string | null;
  name: string;
  monthlyCounts: number[]; // 12 entries, index 0 = January
  total: number;
}

export function leadsBySourceByYear(customers: Customer[], leadSources: LeadSource[], year: number): SourceYearRow[]
```

Same grouping rule as `leadsBySource` (no `sourceId` → "No source" bucket),
just bucketed by month-of-year across the whole `year` instead of one
`yearMonth`. Only sources with at least one lead somewhere in the year are
included, sorted by `total` descending — same convention `leadsBySource`
already uses.

## UI

New card in the Ops Report grid, below the existing single-month row,
**not** replacing the existing "New leads by source" bar list (that stays
as the at-a-glance current-month view).

- Header row: "New Leads by Source — Yearly" + a `<input type="number">`
  year picker (default: current year), styled like the existing
  `opsMonth` picker.
- Table: one row per source (`leadsBySourceByYear` result) + a synthetic
  **Total** row at the bottom summing each month column. Columns are Jan
  through Dec, plus a trailing **Total** column summing each source's row.
  Uses the same `ops.customers` array the existing bar list already reads
  (area/team scoping already applied there — no separate area filter
  needed).
- Wrapped in a horizontally-scrolling container (`overflow-x: auto`) so it
  doesn't force the page to scroll sideways on a narrow viewport.

## Out of scope

- No side-by-side multi-year comparison view — one year at a time, switched
  via the picker. Comparing is "change the year and look again," not two
  tables side by side.
- No CSV/export of this table (the existing admin customer export feature
  is separate and unrelated).
- No change to the existing single-month bar list widget.

## Testing

Extend `lib/dashboardMetrics.check.ts` with assertions for
`leadsBySourceByYear`: a source with leads spread across different months
lands in the right month buckets; a source with zero leads in the target
year is excluded; the "No source" bucket behaves the same as
`leadsBySource`'s.
