# Auto second-assignment: exclude legacy customers, stop area-reopen backlog dumps

## Context

Investigation ([lib/store.tsx:1073](../../../lib/store.tsx) `sweepAutoSecondAssign`,
see [`2026-09-01-auto-second-assign-refinements-design.md`](2026-09-01-auto-second-assign-refinements-design.md)
for the existing 7-day / 14-day-idle mechanism) found two related bugs after
a mass-assignment incident on 2026-09-21:

- 130 of 159 customers in `customers` have `created_by = null` — legacy/
  imported rows never added through the app's Add Customer form (only
  ADMIN/MANAGER can create customers, via `addCustomer`, which always sets
  `created_by`). The sweep has never excluded these. When an admin session
  finally loaded the app after a long gap, every overdue legacy customer
  became eligible at once and got round-robined onto whichever two
  salespeople happened to have `auto_assign_enabled = true` at that moment —
  30 and 26 customers dumped on two people in under a second.
- Turning an area's `auto_assign_enabled` off and back on has no memory of
  the gap. The 7-day/14-day clock is anchored to the customer's own
  `createdAt`/`lastTouched`, never to the area's toggle state, so a customer
  that became "due" while the area was off is immediately swept the moment
  the area reopens — even if that's three months later.

## Decisions (confirmed with requester)

1. Auto second-assign only ever considers customers added by an admin/
   manager through the app (`created_by` set). Legacy/imported customers
   (`created_by IS NULL`) are permanently excluded — no cutoff date, no
   backfill, they simply never qualify.
2. An area's re-enable moment draws a line. A customer whose due date
   (7-day or 14-day-idle, whichever path applies) fell **before** that line
   is considered to have permanently missed its window — it is never
   auto-assigned and must be assigned manually. A customer whose due date
   falls at or after the line is evaluated normally.
3. This line applies uniformly to both timing paths (plain 7-day, and the
   Appointment/Nego 14-day-idle path from the prior refinements spec) — no
   special-casing by stage.
4. Out of scope: slot 1 assignment, slot 3, `activePoolLimit`/pool logic,
   round-robin pointer mechanics, `assignment_events` logging — all
   unchanged.

## Data model

One new column, admin-invisible (no UI control — set automatically):

```sql
alter table areas add column if not exists auto_assign_resumed_at timestamptz not null default now();
```

Manual migration — run once in Supabase SQL editor, not auto-applied. Note
the side effect: on the day this runs, every area's line is drawn at
migration time, so any customer currently overdue (already past its 7/14-day
mark but not yet swept) becomes permanently manual-only the next time the
sweep runs, rather than being caught up automatically. This is the intended
fix, not a bug — flagged here so it isn't a surprise on rollout day.

A newly created area (or one re-imported via the Area CSV import) draws its
own resume line at creation/import time by this same `default now()`
mechanism — so a customer later moved into that area whose natural due date
predates the area's own creation will also be treated as having missed its
window, consistent with the feature's intent (worth stating explicitly since
it wasn't called out until this note).

`lib/types.ts`: `Area` gains `autoAssignResumedAt: string`.

## Logic changes

**`updateAreaAutoAssign(id, enabled)`** ([lib/store.tsx:1550](../../../lib/store.tsx)):
when flipping `enabled` from `false` to `true`, also set
`auto_assign_resumed_at` to `now()` in the same update. Flipping to `false`,
or saving with no actual change, does not touch the timestamp.

**`sweepAutoSecondAssign`** ([lib/store.tsx:1073](../../../lib/store.tsx)):

1. New guard, evaluated first alongside the existing slot/area checks:
   `if (!c.createdBy) continue;` — legacy customers never enter the
   candidate pipeline at all.
2. The existing timing gate (Path A: `createdAt + 7 days`; Path B:
   `lastTouched + 14 days` for Appointment/Nego-flagged stages) now also
   computes the due timestamp explicitly (not just a boolean "is it due
   yet"), so it can be compared against the area's line:
   - `dueAt < area.autoAssignResumedAt` → permanently skip (missed the
     window while the area was off or before this feature shipped).
   - `dueAt <= now` (and not skipped above) → eligible, proceeds to
     round-robin/pool-limit selection as today.
   - otherwise → not due yet, re-checked on a future sweep as today.

No other part of the function changes — round-robin pointer, `excluded`
slot-3/slot-1 list, `activePoolLimit` filtering, `logAssignmentEvent` all
stay exactly as they are.

**`mapCustomer`** ([lib/store.tsx:130](../../../lib/store.tsx)): add
`createdBy: row.created_by` to the mapped `Customer` object (the column is
already selected via `select("*")` in `loadCustomers`, just never mapped).
`Customer` interface in `lib/types.ts` gains `createdBy: string | null`.

**`mapArea`** ([lib/store.tsx:62](../../../lib/store.tsx)): add
`autoAssignResumedAt: row.auto_assign_resumed_at` to the mapped `Area`
object.

## Out of scope

- No UI to view or manually edit `auto_assign_resumed_at` — it's an
  internal bookkeeping field, not an admin-facing setting.
- No retroactive backfill or reprocessing of customers that miss their
  window — "must be assigned manually" means exactly that; no queue or
  notification is added to surface them (not requested).
- No change to `pipeline_stages.exclude_from_auto_assign` gating itself,
  only to how its resulting due-date interacts with the area line.

## Testing

Manual verification only (existing repo convention, no test framework):

- Customer with `created_by = null`, slot 1 set >7 days ago, area
  auto-assign on → confirm it is never 2nd-assigned.
- Customer with `created_by` set, slot 1 set >7 days ago, area auto-assign
  on, area's `auto_assign_resumed_at` in the past → confirm normal
  round-robin 2nd-assign fires.
- Turn an area's auto-assign off, wait (or backdate) past a customer's due
  date, turn the area back on → confirm that customer is **not**
  auto-assigned; confirm a customer created *after* the toggle-on moment
  still gets picked up normally once it reaches its own due date.
- Same off/on scenario for a customer on an Appointment/Nego-flagged stage
  (14-day-idle path) → confirm the same permanent-skip behavior applies.
- Confirm `updateAreaAutoAssign` only bumps `auto_assign_resumed_at` on an
  actual false→true transition, not on redundant true→true saves.
