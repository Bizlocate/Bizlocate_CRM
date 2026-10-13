# Phase 2 — Created-by-team tracking, new-leads × area, list filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record which team created each customer (`customers.created_by_team_id`), show it in the customer list with a "Created by" filter, and make the dashboard's New-leads reports count customers by creating team and show an Area column — all working on today's schema (old assignee slots stay authoritative).

**Architecture:** One new nullable FK column on `customers` (back-filled to SK Team), written on customer creation from the creator's team. `teams` become readable by managers so team names resolve. Dashboard `leadsBySource` / `leadsBySourceByYear` gain an area dimension; the page feeds them customers scoped by creating team instead of by assignee team. The list gets a column + filter.

**Tech Stack:** Next.js 15 / React 18 / TypeScript, Supabase Postgres, `node --experimental-strip-types` self-check scripts (no test framework).

**Part of:** `docs/superpowers/specs/2026-10-13-leader-open-customers-team-slots-design.md`. Phase 1 (blast access) is already on `main`.

**Re-scope vs. roadmap:** the `customer_assignments` table, backfill and event-table `team_id` columns move to Phase 3 (they are unused until the cutover, and building them now would need dual-write to stay correct). Phase 2 only needs `created_by_team_id`.

## Global Constraints

- All existing customers back-fill to the team named exactly `SK Team`. The SQL must fail loudly (not silently skip) if that team is not found.
- `created_by_team_id` is set from the creating user's `teamId` at creation time and is never re-derived afterwards (moving a user to another team later does not change it).
- New-leads counting rule: MANAGER = customers whose `createdByTeamId` equals the manager's own team; ADMIN = all customers, optionally narrowed by the section's team filter; a MANAGER with no team sees none. Customers with `createdByTeamId` null are only counted for ADMIN.
- Dashboard area filter lists **all** areas for both ADMIN and MANAGER (areas are no longer tied to teams).
- ADMIN is unscoped everywhere; never remove an `ADMIN` branch.
- Schema changes are manual: written as a commented block at the end of `supabase/schema.sql` (and mirrored into the main schema for fresh installs); the user runs the SQL by hand **before** the app code is deployed — the app writes the new column on every customer insert and would break customer creation if the column did not exist.
- No test framework: self-checks are `lib/*.check.ts` run with `node --experimental-strip-types`; type-check with `npx tsc --noEmit`.
- Known limitation until Phase 3: a MANAGER's customer list still only contains customers assigned to their team (RLS unchanged), so "My team created" shows only those.

---

### Task 1: SQL — `created_by_team_id` column, back-fill, teams readable by managers

**Files:**
- Modify: `supabase/schema.sql` — (a) main `create table customers` (add column after `created_by`, line ~190), (b) main `teams_select` policy (line ~609), (c) append a commented migration block at the end of the file.

**Interfaces:**
- Produces (DB): `customers.created_by_team_id uuid references teams(id) on delete set null`; `teams_select` readable by admin, own team, and any MANAGER.

- [ ] **Step 1: Mirror the column into the main schema**

In the `create table customers (...)` statement, immediately after the line

```sql
  created_by uuid references profiles (id) on delete set null,
```

add:

```sql
  created_by_team_id uuid references teams (id) on delete set null,
```

- [ ] **Step 2: Mirror the teams policy into the main schema**

Replace the existing block (near line 608):

```sql
-- teams: admin full, member can see own team
create policy "teams_select" on teams for select using (
  is_admin() or id = my_team_id()
);
```

with:

```sql
-- teams: admin full, member can see own team, any manager can read every
-- team (names only matter: used to label which team created a customer)
create policy "teams_select" on teams for select using (
  is_admin() or id = my_team_id()
  or exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
);
```

- [ ] **Step 3: Append the migration block**

Append to the end of `supabase/schema.sql`:

```sql

-- ============================================================
-- Migration: Customer created-by-team — records which team created each
-- customer (drives the "Created by" list filter and the dashboard's
-- new-leads counts). Run once against an already-provisioned database,
-- BEFORE deploying the app version that writes this column.
--
-- STEP 0 (read-only, run first): confirm the SK team's exact name and the
-- current teams policy:
--   select id, name from teams order by name;
--   select policyname, qual from pg_policies where tablename = 'teams' and policyname = 'teams_select';
-- Expected: a team named exactly 'SK Team'; teams_select qual =
--   is_admin() OR id = my_team_id()
-- If the name differs, edit 'SK Team' below to match before running.
-- ============================================================
--
-- alter table customers add column if not exists created_by_team_id uuid references teams (id) on delete set null;
--
-- do $$
-- declare sk uuid;
-- begin
--   select id into sk from teams where name = 'SK Team';
--   if sk is null then
--     raise exception 'Team "SK Team" not found - check STEP 0 and fix the name in this script';
--   end if;
--   update customers set created_by_team_id = sk where created_by_team_id is null;
-- end $$;
--
-- create index if not exists customers_created_by_team_idx on customers (created_by_team_id);
--
-- drop policy if exists "teams_select" on teams;
-- create policy "teams_select" on teams for select using (
--   is_admin() or id = my_team_id()
--   or exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
-- );
```

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "Schema: customers.created_by_team_id + managers can read teams (manual migration)"
```

- [ ] **Step 5: STOP — ask the user to run the SQL**

Tell the user: run STEP 0 first and send the result (the `teams` list and policy), then run the uncommented block in the Supabase SQL editor. **Do not start Task 2's deployment (or push) until the user confirms the SQL ran**, because the app code in Task 2 writes the new column on every customer insert. Local commits for later tasks may continue meanwhile.

---

### Task 2: `createdByTeamId` in types, mapper, store write, and test fixtures

**Files:**
- Modify: `lib/types.ts` (`Customer`, after `createdBy: string | null;` at line ~246)
- Modify: `lib/mappers.ts` (`mapCustomer` row type ~line 54 and return object ~line 93)
- Modify: `lib/store.tsx` (`addCustomer` insert, the line `created_by: currentUserId,` ~line 1893)
- Modify (fixtures, add `createdByTeamId: null`): `lib/blasting.check.ts`, `lib/dashboardMetrics.check.ts`, `lib/inactiveListings.check.ts`, `lib/autoSecondAssign.check.ts`

**Interfaces:**
- Produces: `Customer.createdByTeamId: string | null`; DB column `customers.created_by_team_id` written on insert as `currentUser?.teamId ?? null`.

- [ ] **Step 1: Add the field to the type**

In `lib/types.ts`, in `interface Customer`, change

```ts
  createdBy: string | null;
  createdAt: string;
```

to

```ts
  createdBy: string | null;
  createdByTeamId: string | null;
  createdAt: string;
```

- [ ] **Step 2: Map it**

In `lib/mappers.ts` `mapCustomer`: in the row type, after `created_by: string | null;` add `created_by_team_id: string | null;`. In the returned object, after `createdBy: row.created_by,` add `createdByTeamId: row.created_by_team_id,`.

- [ ] **Step 3: Write it on create**

In `lib/store.tsx` `addCustomer`, after the line `created_by: currentUserId,` add:

```ts
        created_by_team_id: currentUser?.teamId ?? null,
```

(`currentUser` is the store's existing current-user value, already in scope for `addCustomer`. An ADMIN with no team creates customers with a null creating team — accepted.)

- [ ] **Step 4: Fix the fixtures**

In each of the four check files, find the `Customer` fixture builder and add `createdByTeamId: null,` next to the existing `createdBy` field (e.g. `createdBy: null,` → `createdBy: null, createdByTeamId: null,`; in `autoSecondAssign.check.ts` the line is `createdBy: "admin-1",` → add `createdByTeamId: null,` after it). Do not change any other fixture content.

- [ ] **Step 5: Verify**

Run:

```bash
npx tsc --noEmit
node --experimental-strip-types lib/blasting.check.ts
node --experimental-strip-types lib/dashboardMetrics.check.ts
node --experimental-strip-types lib/inactiveListings.check.ts
node --experimental-strip-types lib/autoSecondAssign.check.ts
```

Expected: tsc clean; each script ends with its "all assertions passed" line (a `MODULE_TYPELESS_PACKAGE_JSON` warning is normal).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/mappers.ts lib/store.tsx lib/blasting.check.ts lib/dashboardMetrics.check.ts lib/inactiveListings.check.ts lib/autoSecondAssign.check.ts
git commit -m "Customer: createdByTeamId type/mapper, write creator's team on create"
```

---

### Task 3: Dashboard metrics — new-leads rows split by area

**Files:**
- Modify: `lib/dashboardMetrics.ts` (import line 1; `leadsBySource` ~141-153; `SourceYearRow` ~155-160; `leadsBySourceByYear` ~168-185)
- Modify: `lib/dashboardMetrics.check.ts` (the `leadsBySource` block ~184-197 and `leadsBySourceByYear` block ~199-216; add `Area` import and an `areas` fixture)

**Interfaces:**
- Consumes: `Area` from `lib/types.ts` (`{ id, name, ... }`).
- Produces:
  - `interface SourceAreaCount { id: string | null; name: string; count: number; areaId: string | null; areaName: string }`
  - `leadsBySource(customers: Customer[], leadSources: LeadSource[], areas: Area[], yearMonth: string): SourceAreaCount[]` — one row per (source, area) pair, sorted by count desc.
  - `interface SourceAreaYearRow extends SourceYearRow { areaId: string | null; areaName: string }`
  - `leadsBySourceByYear(customers, leadSources, areas, year): SourceAreaYearRow[]` — one row per (source, area), sorted by total desc.
  - Area name rules: `areaId` null → `"No area"`; id not found → `"Unknown area"`. Source name rules unchanged (`"No source"` / `"Unknown source"`).
  - `NamedCount` and every other function stay unchanged.

- [ ] **Step 1: Update the checks first (failing)**

In `lib/dashboardMetrics.check.ts`: add `Area` to the `import type { ... } from "./types.ts"` list (alphabetical, before `AssignmentEvent`). Replace the whole `leadsBySource` section (from the comment `// --- leadsBySource: ...` through the line asserting `"no leads that month -> empty, not a crash"`) with:

```ts
// --- leadsBySource: one row per (source, area); null source -> "No source", null area -> "No area" ---
const sources = [leadSource({ id: "s1", name: "Facebook" }), leadSource({ id: "s2", name: "Referral" })];
const areaList: Area[] = [
  { id: "a1", name: "SETAPAK", teamIds: [], autoAssignEnabled: true, autoAssignResumedAt: "2026-01-01T00:00:00Z", lastAutoAssignedUserId: null },
  { id: "a2", name: "TTDI", teamIds: [], autoAssignEnabled: true, autoAssignResumedAt: "2026-01-01T00:00:00Z", lastAutoAssignedUserId: null },
];
const sourceCustomers = [
  customer({ id: "c1", sourceId: "s1", areaId: "a1", createdAt: "2026-08-05T00:00:00Z" }),
  customer({ id: "c2", sourceId: "s1", areaId: "a1", createdAt: "2026-08-06T00:00:00Z" }),
  customer({ id: "c2b", sourceId: "s1", areaId: "a2", createdAt: "2026-08-06T00:00:00Z" }),
  customer({ id: "c3", sourceId: "s2", areaId: null, createdAt: "2026-08-07T00:00:00Z" }),
  customer({ id: "c4", sourceId: null, areaId: "a2", createdAt: "2026-08-08T00:00:00Z" }),
  customer({ id: "c5", sourceId: "s1", areaId: "a1", createdAt: "2026-07-05T00:00:00Z" }), // outside month, excluded
];
const bySource = leadsBySource(sourceCustomers, sources, areaList, "2026-08");
assert.equal(bySource.length, 4, "Facebook/SETAPAK, Facebook/TTDI, Referral/No area, No source/TTDI");
assert.deepEqual([bySource[0].name, bySource[0].areaName, bySource[0].count], ["Facebook", "SETAPAK", 2], "sorted desc by count");
const fbTtdi = bySource.find((r) => r.name === "Facebook" && r.areaName === "TTDI")!;
assert.equal(fbTtdi.count, 1);
assert.equal(bySource.find((r) => r.name === "Referral")!.areaName, "No area");
assert.equal(bySource.find((r) => r.name === "No source")!.areaName, "TTDI");
assert.equal(leadsBySource(sourceCustomers, sources, areaList, "2026-05").length, 0, "no leads that month -> empty, not a crash");
```

Replace the whole `leadsBySourceByYear` section (from `// --- leadsBySourceByYear:` through the `"no leads that year"` assertion) with:

```ts
// --- leadsBySourceByYear: one row per (source, area), bucketed by month across a whole year ---
const yearCustomers = [
  customer({ id: "y1", sourceId: "s1", areaId: "a1", createdAt: "2026-01-05T00:00:00Z" }),
  customer({ id: "y2", sourceId: "s1", areaId: "a1", createdAt: "2026-03-06T00:00:00Z" }),
  customer({ id: "y3", sourceId: "s1", areaId: "a1", createdAt: "2026-03-07T00:00:00Z" }),
  customer({ id: "y3b", sourceId: "s1", areaId: "a2", createdAt: "2026-03-08T00:00:00Z" }),
  customer({ id: "y4", sourceId: "s2", areaId: null, createdAt: "2026-12-01T00:00:00Z" }),
  customer({ id: "y5", sourceId: null, areaId: "a1", createdAt: "2026-06-15T00:00:00Z" }),
  customer({ id: "y6", sourceId: "s1", areaId: "a1", createdAt: "2025-03-06T00:00:00Z" }), // wrong year, excluded
];
const byYear = leadsBySourceByYear(yearCustomers, sources, areaList, 2026);
assert.equal(byYear.length, 4, "Facebook/SETAPAK, Facebook/TTDI, Referral/No area, No source/SETAPAK");
assert.deepEqual([byYear[0].name, byYear[0].areaName], ["Facebook", "SETAPAK"], "sorted desc by total");
const fbSetapak = byYear.find((r) => r.name === "Facebook" && r.areaName === "SETAPAK")!;
assert.equal(fbSetapak.monthlyCounts.length, 12);
assert.equal(fbSetapak.monthlyCounts[0], 1, "January");
assert.equal(fbSetapak.monthlyCounts[2], 2, "March");
assert.equal(fbSetapak.total, 3);
assert.equal(byYear.find((r) => r.name === "Facebook" && r.areaName === "TTDI")!.monthlyCounts[2], 1, "other area is its own row");
assert.equal(byYear.find((r) => r.name === "Referral")!.monthlyCounts[11], 1, "December");
assert.equal(leadsBySourceByYear(yearCustomers, sources, areaList, 2020).length, 0, "no leads that year -> empty, not a crash");
```

(If the file declares `sources`/`leadSource` helpers elsewhere with different names, keep their existing definitions — only the `sources` const shown above is part of the replaced block; remove any duplicate `const sources` so there is exactly one.)

- [ ] **Step 2: Run the check and confirm it fails**

Run: `node --experimental-strip-types lib/dashboardMetrics.check.ts`
Expected: FAIL (assertion about row counts / `areaName` undefined).

- [ ] **Step 3: Implement**

In `lib/dashboardMetrics.ts`: add `Area` to the first import line (alphabetical, first). Replace the `leadsBySource` function (with its preceding comment) with:

```ts
export interface SourceAreaCount extends NamedCount {
  areaId: string | null;
  areaName: string;
}

function areaNameOf(areas: Area[], areaId: string | null): string {
  return areaId ? areas.find((a) => a.id === areaId)?.name ?? "Unknown area" : "No area";
}

// Customers created in yearMonth, grouped by lead source AND area (one row
// per pair). `customers` is caller-scoped (area/team already filtered in) —
// no source lands in a "No source" bucket and no area in "No area" rather
// than being dropped.
export function leadsBySource(customers: Customer[], leadSources: LeadSource[], areas: Area[], yearMonth: string): SourceAreaCount[] {
  const counts = new Map<string, { sourceId: string | null; areaId: string | null; count: number }>();
  for (const c of customers) {
    if (yearMonthOf(c.createdAt) !== yearMonth) continue;
    const key = `${c.sourceId ?? ""}|${c.areaId ?? ""}`;
    const row = counts.get(key) ?? { sourceId: c.sourceId, areaId: c.areaId, count: 0 };
    row.count += 1;
    counts.set(key, row);
  }
  const rows: SourceAreaCount[] = [...counts.values()].map((r) => ({
    id: r.sourceId,
    name: r.sourceId ? leadSources.find((s) => s.id === r.sourceId)?.name ?? "Unknown source" : "No source",
    count: r.count,
    areaId: r.areaId,
    areaName: areaNameOf(areas, r.areaId),
  }));
  return rows.sort((a, b) => b.count - a.count);
}
```

Replace the `leadsBySourceByYear` function (keep `SourceYearRow` as is, and update its preceding comment's first sentence to say rows are per source and area) with:

```ts
export interface SourceAreaYearRow extends SourceYearRow {
  areaId: string | null;
  areaName: string;
}

// Same (source, area) grouping as leadsBySource, bucketed by month-of-year
// across the whole `year` — the source-by-month comparison table on the
// dashboard reads this. Only pairs with at least one lead in the year are
// included.
export function leadsBySourceByYear(customers: Customer[], leadSources: LeadSource[], areas: Area[], year: number): SourceAreaYearRow[] {
  const counts = new Map<string, { sourceId: string | null; areaId: string | null; monthlyCounts: number[] }>();
  const yearPrefix = String(year);
  for (const c of customers) {
    if (c.createdAt.slice(0, 4) !== yearPrefix) continue;
    const monthIndex = Number(c.createdAt.slice(5, 7)) - 1;
    const key = `${c.sourceId ?? ""}|${c.areaId ?? ""}`;
    const row = counts.get(key) ?? { sourceId: c.sourceId, areaId: c.areaId, monthlyCounts: new Array(12).fill(0) };
    row.monthlyCounts[monthIndex] += 1;
    counts.set(key, row);
  }
  const rows: SourceAreaYearRow[] = [...counts.values()].map((r) => ({
    id: r.sourceId,
    name: r.sourceId ? leadSources.find((s) => s.id === r.sourceId)?.name ?? "Unknown source" : "No source",
    monthlyCounts: r.monthlyCounts,
    total: r.monthlyCounts.reduce((sum, n) => sum + n, 0),
    areaId: r.areaId,
    areaName: areaNameOf(areas, r.areaId),
  }));
  return rows.sort((a, b) => b.total - a.total);
}
```

- [ ] **Step 4: Run the check and confirm it passes**

Run: `node --experimental-strip-types lib/dashboardMetrics.check.ts`
Expected: ends with the file's "all assertions passed" line. (`tsc` will fail at the dashboard page until Task 4 — expected; do not run tsc in this task.)

- [ ] **Step 5: Commit**

```bash
git add lib/dashboardMetrics.ts lib/dashboardMetrics.check.ts
git commit -m "Dashboard metrics: split new-leads rows by area"
```

---

### Task 4: Dashboard page — count by creating team, add Area column, all areas in filters

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx` (`availableAreas` ~212-216; `sourceRows` ~302; `sourceYearScoped`/`sourceYearRows` ~303-304; monthly card ~546-558; yearly table ~641-667; the three `<AreaFilter ... areas={availableAreas} />` usages at ~539, ~626, ~680)

**Interfaces:**
- Consumes: `leadsBySource(customers, leadSources, areas, yearMonth)` and `leadsBySourceByYear(customers, leadSources, areas, year)` returning rows with `areaId` / `areaName` (Task 3); `Customer.createdByTeamId` (Task 2).

- [ ] **Step 1: All areas in every area filter**

Delete the `availableAreas` constant and its 4-line comment (the block beginning `// ADMIN picks from every area; MANAGER only from areas admin has assigned`). Replace each `areas={availableAreas}` with `areas={areas}` (three places). Leave `availableTeams` as is.

- [ ] **Step 2: Add the creating-team scoping helper**

Directly after the `scopeByTeam` function (before `// Reused by 团队表现 ...`) insert:

```ts
  // New leads belong to the team that created the customer
  // (Customer.createdByTeamId), not to whoever is assigned now. MANAGER: own
  // team's customers only (none if the manager has no team); ADMIN: every
  // customer, optionally narrowed by the section's team filter. Area narrows
  // either way, "" = all areas.
  function newLeadCustomers(areaId: string, teamId: string) {
    if (currentUser!.role === "MANAGER" && !currentUser!.teamId) return [];
    const creatingTeamId = currentUser!.role === "ADMIN" ? teamId : currentUser!.teamId;
    return visibleCustomers.filter(
      (c) => (!areaId || c.areaId === areaId) && (!creatingTeamId || c.createdByTeamId === creatingTeamId)
    );
  }
```

(`currentUser` is non-null here: the component returns early above when it is null; the non-null assertions are only for the nested function's type narrowing. If the file's existing style avoids `!`, capture `const viewer = currentUser;` right after the early return and use `viewer` instead.)

- [ ] **Step 3: Feed the metrics from it**

Replace

```ts
  const sourceRows = leadsBySource(ops.customers, leadSources, opsMonth);
  const sourceYearScoped = scopeByTeam(scopeByArea(sourceYearAreaId), sourceYearTeamId);
  const sourceYearRows = leadsBySourceByYear(sourceYearScoped.customers, leadSources, sourceYear);
```

with

```ts
  const sourceRows = leadsBySource(newLeadCustomers(opsAreaId, opsTeamId), leadSources, areas, opsMonth);
  const sourceYearRows = leadsBySourceByYear(newLeadCustomers(sourceYearAreaId, sourceYearTeamId), leadSources, areas, sourceYear);
```

(`ops` is still used by the other cards; do not remove it.)

- [ ] **Step 4: Monthly card shows the area**

In the "New leads by source" card, change the row key and label. Replace

```tsx
                <div key={r.id ?? "none"} style={{ marginBottom: 9 }} title={`${r.name}: ${r.count}`}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                    <span>{r.name}</span>
```

with

```tsx
                <div key={`${r.id ?? "none"}|${r.areaId ?? "none"}`} style={{ marginBottom: 9 }} title={`${r.name} · ${r.areaName}: ${r.count}`}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                    <span>{r.name} <span style={{ color: "#9aa0ab" }}>· {r.areaName}</span></span>
```

- [ ] **Step 5: Yearly table gets an Area column**

Change the header: after the `Source` `<th>` add

```tsx
                    <th style={{ textAlign: "left", padding: "6px 10px", color: "#9aa0ab", fontWeight: 600 }}>Area</th>
```

Change the body row: replace `<tr key={r.id ?? "none"} style={{ borderTop: "1px solid #eef0f2" }}>` with `<tr key={`${r.id ?? "none"}|${r.areaId ?? "none"}`} style={{ borderTop: "1px solid #eef0f2" }}>` and after `<td style={{ padding: "6px 10px", fontWeight: 500 }}>{r.name}</td>` add

```tsx
                      <td style={{ padding: "6px 10px", color: "#6b7280" }}>{r.areaName}</td>
```

In the totals row, after `<td style={{ padding: "6px 10px", fontWeight: 700 }}>Total</td>` add `<td />` so month columns stay aligned.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit` — Expected: clean. Run: `node --experimental-strip-types lib/dashboardMetrics.check.ts` — Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/dashboard/page.tsx"
git commit -m "Dashboard: new leads by creating team, area column, all areas in filters"
```

---

### Task 5: Customer list — "Created By" column and filter

**Files:**
- Modify: `components/CustomerListView.tsx` (store destructure ~66-86; filter state ~93-102; filter logic ~143-151 and its dependency lists ~170 and ~202-205; `LIST_COLS` comment+array ~349-350; clear button ~483-498; filter UI ~405-420; header ~539; row ~579)

**Interfaces:**
- Consumes: `teams` from `useStore()` (already exported, `Team = { id, name, ... }`); `Customer.createdByTeamId` (Task 2).
- Produces: nothing for later tasks.

- [ ] **Step 1: Pull `teams` from the store**

In the `useStore()` destructure (starts `const { currentUser, visibleCustomers, users, ...`) add `teams,` (e.g. after `users,`).

- [ ] **Step 2: Filter state**

After the `filterPurposeId` state line add:

```tsx
  const [filterCreatedByTeamId, setFilterCreatedByTeamId] = useRemembered(scope, "filterCreatedByTeamId", "");
```

- [ ] **Step 3: Apply the filter**

After the line `if (filterPurposeId && c.purposeId !== filterPurposeId) return false;` add:

```tsx
      if (filterCreatedByTeamId && c.createdByTeamId !== filterCreatedByTeamId) return false;
```

Add `filterCreatedByTeamId` to both dependency lists: the `useMemo` dependency array (the one ending `... filterPurposeId, isOwnScope, currentUser, poolTab,`) and the `viewKey` list (the one ending `filterRaceId, filterFirsttimeBranchId, filterPurposeId, poolTab, updatedSort, stageSort,`).

- [ ] **Step 4: Filter control (ADMIN: any team; MANAGER: own team)**

Directly after the Area filter's closing `</div>` (the block containing `value={filterAreaId}`), insert:

```tsx
        {scope === "all" && (
          <div style={{ flex: "1 1 160px" }}>
            <label className="field-label">Created By</label>
            <select className="field-input" value={filterCreatedByTeamId} onChange={(e) => setFilterCreatedByTeamId(e.target.value)}>
              <option value="">All teams</option>
              {teams
                .filter((t) => currentUser?.role === "ADMIN" || t.id === currentUser?.teamId)
                .map((t) => <option key={t.id} value={t.id}>{currentUser?.role === "ADMIN" ? t.name : `My team (${t.name})`}</option>)}
            </select>
          </div>
        )}
```

In the Clear button handler add `setFilterCreatedByTeamId("");` after `setFilterPurposeId("");`.

- [ ] **Step 5: Column**

Update the `LIST_COLS` comment and array. Replace

```tsx
  // Created Date, Business Type, Business Name, Tel No, Customer Name, Sub Area, Source, Stage, [Assigned Agent(s)], Purpose, Last Updated
  const LIST_COLS = [...(isOwnScope ? [] : [100]), 130, 150, 110, 150, 140, 100, 100, ...(showAssignedTo ? [170] : []), 100, 100];
```

with

```tsx
  // [Created Date, Created By], Business Type, Business Name, Tel No, Customer Name, Sub Area, Source, Stage, [Assigned Agent(s)], Purpose, Last Updated
  const LIST_COLS = [...(isOwnScope ? [] : [100, 120]), 130, 150, 110, 150, 140, 100, 100, ...(showAssignedTo ? [170] : []), 100, 100];
```

Header: after `{!isOwnScope && <div>Created Date</div>}` add `{!isOwnScope && <div>Created By</div>}`.
Row: after `{!isOwnScope && <div style={{ color: "#6b7280" }}>{formatDate(c.createdAt)}</div>}` add

```tsx
                  {!isOwnScope && <div style={{ color: "#6b7280" }}>{nameOf(teams, c.createdByTeamId) || "—"}</div>}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit` — Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add components/CustomerListView.tsx
git commit -m "Customer list: Created By column and team filter"
```

---

### Task 6: Verify (after the user has run the Task 1 SQL)

**Files:** none modified.

- [ ] **Step 1: Run all checks**

```bash
npx tsc --noEmit
node --experimental-strip-types lib/blasting.check.ts
node --experimental-strip-types lib/dashboardMetrics.check.ts
node --experimental-strip-types lib/inactiveListings.check.ts
node --experimental-strip-types lib/autoSecondAssign.check.ts
```

Expected: tsc clean, each script passes.

- [ ] **Step 2: Manual verification** (the user, or via the in-app browser; the local dev server talks to the live Supabase, so creating a customer writes real data — get the user's OK before creating one and delete/adjust it afterwards)

1. As MANAGER: `/customers` shows a "Created By" column and a "Created By" filter listing only "My team (…)"; picking it filters rows to customers created by their team.
2. As ADMIN: the filter lists every team; the column shows team names (SK Team for all existing customers).
3. Create a customer as a MANAGER → the new row shows that manager's team in "Created By".
4. Dashboard (MANAGER): "New leads by source" rows read "Source · Area"; the yearly table has an Area column; the area dropdowns list every area, not only team-linked ones; numbers only count customers created by the manager's team.
5. Dashboard (ADMIN): numbers include all teams; the team dropdown narrows by creating team.
6. SP accounts: no change to any page.

- [ ] **Step 3: Report results to the user**, including any step that failed, with the exact error.
