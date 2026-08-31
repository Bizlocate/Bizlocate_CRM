# Sales dashboard (role-scoped) + monthly $ targets

## Context

New "Dashboard" tab, placed left of "Customers" in the nav, visible to all
three roles. What each role sees is scoped, not a different page:

- **ADMIN** — whole company.
- **MANAGER** — own team only (reuses the same team-scoping already used
  for `visibleCustomers`).
- **SALESPERSON** — own numbers only, no peer comparison.

Includes a new "monthly $ target" concept (doesn't exist in the schema
today) so attainment % can be shown.

## Data model

### `sales_targets` (new table)

```sql
create table sales_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  year_month text not null,          -- 'YYYY-MM'
  amount numeric not null check (amount >= 0),
  set_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, year_month)
);
```

One row per user per calendar month. Any role can have a target
(ADMIN/MANAGER included, since a MANAGER can carry deals too) — the UI
only ever renders the editor next to people the current viewer manages.

**Who can set it:**
- ADMIN: anyone.
- MANAGER: own team members, and themself.
- SALESPERSON: read-only, own row only.

RLS (mirrors the `removal_requests` policy shape already in the schema —
`is_admin()` / `my_team_id()` helpers reused as-is):

```sql
alter table sales_targets enable row level security;

create policy "sales_targets_select" on sales_targets for select using (
  is_admin()
  or user_id = auth.uid()
  or user_id in (select id from profiles where team_id = my_team_id())
);

create policy "sales_targets_insert" on sales_targets for insert with check (
  set_by = auth.uid()
  and (
    is_admin()
    or user_id = auth.uid()
    or user_id in (select id from profiles where team_id = my_team_id())
  )
);

create policy "sales_targets_update" on sales_targets for update using (
  is_admin()
  or user_id = auth.uid()
  or user_id in (select id from profiles where team_id = my_team_id())
);
```

No delete policy — out of scope, editing overwrites (upsert on
`user_id, year_month`).

`lib/types.ts`: add `SalesTarget { id, userId, yearMonth, amount, setBy,
createdAt, updatedAt }`.

`lib/store.tsx`: load into a `salesTargets: SalesTarget[]` state (same
load-on-init pattern as `dealClosures`), add `upsertSalesTarget(userId,
yearMonth, amount)` — optimistic local update + supabase upsert, same
shape as the existing `updateStageRequiresAmount`-style setters.

## What the dashboard reads (no other new tables/APIs)

Everything else comes from data already in the store:

- **Won $ / won count** — `dealClosures` (`amount` only exists at the
  moment a `requiresAmount` stage is hit — there is no stored $ value for
  a deal still open, so "pipeline $ value" isn't derivable; the funnel
  below is counts only, not $).
- **Lost count** — customers whose `stage1Id/2Id/3Id` matches a stage
  whose `name` is `"Lost"` (same naming convention `STAGE_STYLES` in
  `lib/types.ts` already relies on — not a hard schema flag).
- **New leads** — `customers.createdAt`.
- **Activity volume** — `activities` (CALL/VISIT/NOTE), `followUp` dates
  for the "due soon" list.
- **Role scoping** — reuse the existing `visibleCustomers`-style
  team/self filtering already in `lib/store.tsx` (`assigneeSlots`, team
  lookup) rather than re-deriving it.

## Calculations (`lib/dashboardMetrics.ts`, pure functions)

Centralizing these avoids five copy-pasted reductions across the page and
gives the one file worth a self-check test (`dashboardMetrics.check.ts`,
matching the repo's existing `*.check.ts` convention, e.g.
`lib/parseAreaCsv.check.ts`).

- `stageFunnel(customers, stages)` → count per stage id, across all 3
  slots in scope.
- `wonAmountInMonth(dealClosures, userIds, yearMonth)` → sum.
- `leaderboard(users, dealClosures, targets, activities, yearMonth)` →
  per-user `{ won, target, attainmentPct, activityCount }`, sorted by
  `won` desc.
- `monthlyTrend(customers, dealClosures, monthsBack = 6)` → per-month
  `{ won, newLeads }` array for the trend charts.
- `dueSoon(customers, days = 7)` → customers with a `followUp` in the
  next N days whose stage isn't Won/Lost.
- Conversion rate = `wonCount / newLeadsCount` for the period — an
  approximation (not true cohort conversion), documented inline as such.

## Page: `app/(dashboard)/dashboard/page.tsx`

One route, content branches on `currentUser.role`. A month picker
(defaults to current month) drives every "this month" figure; the two
trend charts always show the trailing 6 months regardless of the picker.

1. **Pipeline & 业绩** (everyone) — stage funnel (counts), this month's
   won $ vs target + attainment %, lost count.
2. **团队表现** (ADMIN/MANAGER only) — leaderboard table: name, won $,
   target (inline-editable amount input, writes through
   `upsertSalesTarget`), attainment %, activity count. ADMIN sees
   everyone grouped by team; MANAGER sees own team.
3. **预测** — progress bar (won so far vs target, with a "days elapsed
   %" pace marker) + "due soon" list (follow-ups in the next 7 days,
   open stage).
4. **Sales 个人** (everyone, scoped to self even for ADMIN/MANAGER) — my
   target vs actual, my overdue/today follow-ups, my recent activity
   count.
5. **趋势** (everyone) — 6-month won $ trend, 6-month new-leads-vs-won
   comparison.

SALESPERSON gets sections 1, 3, 4, 5 with everything pre-scoped to self
(no leaderboard, since there's no one to rank against).

## Nav change

`components/MainNav.tsx` currently returns `null` entirely for
SALESPERSON. Changes to:
- Render for all three roles.
- Tab list becomes role-filtered: `Dashboard` + `Customers` for
  everyone; `Agent Log` + `Remove Approvals` stay ADMIN/MANAGER-only
  (SALESPERSON has no route for either — `/team/*` is gated to MANAGER
  in `team/layout.tsx`, so those must not render for a SALESPERSON).
- `Dashboard` tab ordered first (left of `Customers`), per the request.

## Out of scope

- Activity-count targets (calls/visits quota) — explicitly deferred,
  amount-only target for now.
- True weighted pipeline forecast ($ × stage win-rate) — no open-deal $
  value exists to weight, so "预测" is due-dates + pace-vs-target only.
- Target deletion, target history/audit trail.
- Company-wide cross-team comparison for a MANAGER (manager sees own
  team only, never other teams' numbers).

## Testing

Manual (repo convention, no test framework for pages):
- As ADMIN: `/dashboard` shows all teams' leaderboard, can set anyone's
  target, funnel/trend reflect all customers.
- As MANAGER: only own team appears in leaderboard/trend, can set own
  team's + own target, cannot see other teams' numbers.
- As SALESPERSON: nav now shows `Dashboard` + `Customers` only, no
  leaderboard section, all numbers match own assigned customers only.
- Set a target, confirm attainment % updates immediately and persists
  after reload.
- `lib/dashboardMetrics.check.ts` — asserts on `stageFunnel`,
  `wonAmountInMonth`, `leaderboard`, `monthlyTrend`, `dueSoon` against
  hand-built fixture data.
