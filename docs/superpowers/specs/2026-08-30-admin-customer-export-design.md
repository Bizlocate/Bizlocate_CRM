# Admin Customer Export (bulk select + CSV/Excel + column picker)

## Context

Part of a larger "admin customer list upgrade" request that also includes an
active/inactive customer pool system (per-pool limits, 60-day auto-removal
for inactive). That pool system is a separate, independent spec — this doc
covers only the export feature.

## Goal

ADMIN users can multi-select customers on the customers list and export them
to CSV or Excel, choosing which fields to include per export.

## Access

Gated on `currentUser?.role === "ADMIN"` in
[app/(dashboard)/customers/page.tsx](../../../app/(dashboard)/customers/page.tsx).
Non-admins see the list unchanged — no checkboxes, no export button.

## Selection UI

- New checkbox column, leftmost, in both the list header and each row.
- Header checkbox = select-all for the **currently filtered** rows shown
  (not every customer in the system — respects existing name/phone/stage/
  assigned-to/keyword filters).
- Row checkbox click must `stopPropagation` so it doesn't also trigger the
  existing row-click navigation to `/customers/[id]`.
- Selection state: `useState<Set<string>>` of customer ids, local to the
  page (not persisted).
- Selection is not required to be pruned when filters change — an id
  selected under one filter stays selected if the filter changes and the
  row drops out of view; it re-appears checked if the filter brings it back.
  (Simplest behavior; matches "select what you've ticked" semantics.)

## Export trigger

An "Export (n)" button appears next to the filter bar once `n > 0` rows are
selected. Clicking it opens a modal with:

1. **Format** — radio: CSV / Excel (xlsx). Default CSV.
2. **Fields** — checkbox list of exportable fields (see below), default all
   checked. Not persisted across sessions/opens — every open starts fully
   checked.
3. **Export** button — disabled if zero fields are checked. Generates and
   downloads the file, then closes the modal.

## Exportable fields

Resolved display names (not raw ids/uuids), one row per selected customer:

Name, Phone, Stage, Assigned To (all assignees joined, comma-separated),
Source, Area, Subarea, Property Type, Purpose, Business Industry, Business
Category, Business Type, Race, Language, Business Name, Firsttime/Branch,
Target Race, Target Type, Budget, Remark.

Lookup resolution reuses the same pattern already in
[app/(dashboard)/customers/page.tsx](../../../app/(dashboard)/customers/page.tsx)
(`stageName`, `assigneeNames`) plus equivalent lookups against the other
`useStore()` lists (leadSources, areas, subAreas, propertyTypes, purposes,
businessTagIndustries/Categories/Types, races, languages,
firsttimeBranchTypes, targetRaces, targetTypes, budgets) for the fields not
already resolved on the list page.

## Generation

Add the `xlsx` (SheetJS) package as a dependency — no existing lib in the
project handles spreadsheet export, and a hand-rolled CSV writer wouldn't
cover the Excel case (real `.xlsx` is a zip+XML format, not something worth
reimplementing).

One code path for both formats:

1. Build an array of plain objects, one per selected customer, keyed by the
   checked field labels, values resolved via the lookups above.
2. `XLSX.utils.json_to_sheet(rows)` → a worksheet.
3. CSV: `XLSX.utils.sheet_to_csv(sheet)` → `Blob` → object URL → temporary
   `<a download>` click, matching plain browser download conventions used
   elsewhere for client-side file generation.
4. Excel: `XLSX.utils.book_new()` + `XLSX.utils.book_append_sheet()` +
   `XLSX.writeFile(book, "customers.xlsx")` (SheetJS handles the download
   itself for this path).

All client-side — no new API route, since the data (`visibleCustomers` +
lookup lists) is already in the store on the page.

Filename: `customers-export-YYYY-MM-DD.csv` / `.xlsx` (today's date).

## Edge cases

- 0 rows selected → no Export button rendered.
- 0 fields checked in the modal → Export button disabled, no separate error
  copy needed (disabled state is the signal).
- Empty resolved lookup (e.g. `sourceId` is null) → export that cell as an
  empty string, same as the list/detail pages already do for unset optional
  fields.

## Testing

Manual verification only (no test framework precedent in this codebase for
UI-level features per the git history) — check as ADMIN:
select-all/individual selection, filter interaction with selection, CSV
download opens correctly with chosen columns only, Excel download opens
correctly with chosen columns only, non-ADMIN sees no checkboxes/button.
