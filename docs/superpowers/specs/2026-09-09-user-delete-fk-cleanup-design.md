# Fix: Admin Can't Delete a User (FK cleanup across profiles references)

## Context

Deleting a user calls `admin.auth.admin.deleteUser(id)` ([app/api/admin/users/[id]/route.ts](../../../app/api/admin/users/%5Bid%5D/route.ts)),
which deletes the `auth.users` row. `profiles.id references auth.users(id)
on delete cascade` takes the profile with it. But a long list of other
tables reference `profiles(id)` with no `ON DELETE` action at all (the
Postgres default, `NO ACTION`) — so if the user being deleted has ever been
assigned a customer, logged an activity, closed a deal, etc., Postgres
blocks the whole delete with a foreign-key violation. Supabase's Auth Admin
API can't turn that into a clean error message, so the client sees the
literal string `"{}"` as the error (confirmed via a live Network-tab check:
`400`, body `{"error":"{}"}"`).

This is not a regression from recent work — every one of these FKs has
been unnamed/un-cascaded since the tables were created. It just means no
one has ever successfully deleted a user with real activity behind them
until now.

## Decisions

Three treatments, chosen per table based on what actually reads that
column today (traced through `lib/dashboardMetrics.ts` and every UI
consumer — see reasoning per group below):

**A. Row deleted entirely (`ON DELETE CASCADE`)** — content that's either
private to the deleted user or is fundamentally *their own* record:
- `activities.user_id` — confirmed with the user: shared customer notes are
  acceptable to lose along with the account.
- `tasks.user_id` — private per creator (RLS already hides it from everyone
  else), nothing lost from anyone else's view.
- `removal_requests.requested_by`, `blast_requests.requested_by`,
  `blast_claim_requests.requested_by` — the request is that person's own
  ask; deleting them deletes the ask.

**B. Column goes null (`ON DELETE SET NULL`), row survives** — every
per-user dashboard breakdown (`leaderboard`, `assignmentCounts`,
`assignToAppointmentDuration`, etc.) iterates the *live* `users` array and
filters events by matching id — it never joins the other direction. A
departed user already drops out of every per-person breakdown regardless
of what happens to the FK. What SET NULL actually protects is the
*aggregate* numbers (`wonAmountInMonth`, `monthlyTrend`,
`appointmentMonthlyTrend`) that sum every row regardless of user — cascading
these away would retroactively shrink past months' totals.
- `customers.assigned_to`, `assigned_to_2`, `assigned_to_3`, `created_by`
- `deal_closures.user_id`, `assignment_events.user_id`,
  `stage_events.user_id`, `sales_targets.set_by`
- `removal_requests.resolved_by`, `blast_requests.resolved_by`,
  `blast_requests.salesperson_id`, `blast_claim_requests.resolved_by`,
  `customer_delete_requests.requested_by`, `customer_delete_requests.resolved_by`
  — deliberately **not** cascade even though `requested_by`/`resolved_by`
  sounds symmetric with group A above: cascading `resolved_by` or
  `salesperson_id` would blow up a *different* customer's or salesperson's
  history just because the approving admin (or blast target) later left.
  Only the column that names the record's own author cascades; every
  "who else touched this" column goes null instead.

**C. Column goes null, but a plain-text name survives it** — the one place
a name is actually rendered by joining live: the customer profile's Change
History tab reads `CustomerChangeLogEntry.changedByName`, computed today by
looking up `changed_by` in the live `users` array (`mapChangeLog` in
`lib/store.tsx`). Once the user is gone that lookup returns nothing.
- `customer_change_log.changed_by` → `ON DELETE SET NULL`, plus a new
  `changed_by_name text` column, written once at insert time from
  `currentUser.name` and backfilled for existing rows in the same
  migration. `mapChangeLog` reads this column directly instead of doing a
  live lookup — the display name becomes a permanent snapshot, immune to
  the author's account being deleted later.

Several columns above are currently `not null` (`deal_closures.user_id`,
`assignment_events.user_id`, `stage_events.user_id`, `sales_targets.set_by`,
`customer_change_log.changed_by`, `blast_requests.salesperson_id`,
`customer_delete_requests.requested_by`) — each needs `alter column ...
drop not null` before its FK can carry `ON DELETE SET NULL` (Postgres
would otherwise fail at the moment a delete actually tries to null it).
The corresponding TS types move to `string | null` for that field; `tsc`
guides every call site that needs a null-check afterward.

## Migration

Postgres auto-names an unadorned inline FK as `{table}_{column}_fkey`.
Every statement below drops that (assumed) name and re-adds it explicitly,
so a wrong guess fails loudly (constraint doesn't exist) instead of
silently leaving the old restrictive FK in place. If any drop errors, the
fallback is `select conname from pg_constraint where conrelid =
'<table>'::regclass and contype = 'f';` to find the real name.

Full SQL goes in `supabase/schema.sql` as a new migration block, and gets
handed to the user to run by hand (per this project's standing rule — no
auto-applied migrations).

## Code changes

- `lib/types.ts`: `AssignmentEvent.userId`, `StageEvent.userId`,
  `DealClosure.userId`, `SalesTarget.setBy`,
  `CustomerDeleteRequest.requestedBy`, `BlastRequest.salespersonId` all
  become `string | null`. `CustomerChangeLogEntry` keeps `changedByName:
  string` (now backed by the persisted column, not a live join) and
  `changedByUserId: string | null`.
- `lib/store.tsx`: `mapChangeLog` drops its `usersById` lookup for the name
  and reads `row.changed_by_name` directly; every insert into
  `customer_change_log` writes `changed_by_name: currentUser.name`
  alongside `changed_by`. Every other mapper/type touch is mechanical
  (nullable field, no behavior change) — `tsc --noEmit` is the checklist
  for what else needs a null-guard.
- No change to `app/api/admin/users/[id]/route.ts` — once the FKs stop
  blocking, `admin.auth.admin.deleteUser(id)` just works.

## Out of scope

- Rewriting `leaderboard`/`assignmentCounts`/etc. to show a departed user's
  historical row by name — confirmed not needed, since none of them read a
  name from the event row in the first place (see Decision B).
- Any UI change to the Delete confirmation copy.

## Testing

Manual, matching this app's existing precedent (no test framework for
DB-dependent flows):
- Delete a user with an assigned customer, logged activities, a task, a
  deal closure, and an approved removal request → succeeds; the customer's
  slot is unassigned; the task is gone; the deal-closure total for that
  month is unchanged; the removal request the *other* party approved is
  still visible with "Unknown" as resolver.
- Confirm the customer's Change History still shows the deleted user's name
  on entries they authored.
- Delete a user with zero activity → still succeeds (no regression).
