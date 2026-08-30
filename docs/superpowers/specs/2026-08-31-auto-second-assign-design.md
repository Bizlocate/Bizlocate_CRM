# Auto second-assignment (3-day, round-robin by area's team)

## Context

Third slice of the "system flow upgrade" request (first two — identity
edit lock + change log, and Update/Cancel — are done and merged). This
covers: a customer an admin/leader creates (and assigns to slot 1) gets a
**second** assignee (slot 2) auto-filled 3 days later, if still empty,
picked round-robin from the team that owns the customer's area. Happens
**once** per customer — never re-fires, never touches slot 3.

## Data model

Two new nullable columns, no new tables:

- `areas.team_id uuid references teams (id) on delete set null` — which
  team owns this area. Admin sets this on the existing `/admin/area` page
  (one dropdown per area row, populated from the existing Teams list).
  Unset by default for existing areas — an area with no team assigned
  never triggers auto-assignment.
- `teams.last_auto_assigned_user_id uuid references profiles (id) on
  delete set null` — the round-robin pointer: the last person this team's
  auto-assign gave a slot to. Drives "who's next" (see below). `null`
  means the rotation hasn't started yet for this team.

`lib/types.ts`: `Area` gains `teamId: string | null`; `Team` gains
`lastAutoAssignedUserId: string | null`.

## Eligibility & rotation

- **Candidate pool** for a team: active (`status = 'ACTIVE'`) profiles
  with `role = 'SALESPERSON'` and `team_id` = that team, ordered by `name`
  (tie-break `id`) — a stable, deterministic order.
- **Trigger conditions**, checked per customer: `assignedToUserId2` (slot
  2) is null, `assignedToUserId` (slot 1) is set, `createdAt` is ≥ 3 days
  ago, the customer's `areaId` resolves to an area with a `teamId` set,
  and that team's candidate pool is non-empty.
- **Picking "next":** find `last_auto_assigned_user_id` in the team's
  current candidate-pool order; the next candidate is the one after it
  (wrapping to the start), or the first candidate if the pointer is
  `null`/not found in the current pool (e.g. that person left the team
  since). Skip anyone already occupying slot 1 or slot 3 on this specific
  customer (can't assign the same person twice — existing rule).
- **If the picked candidate is at their active-pool limit:** try the next
  candidate in rotation order instead of giving up on the customer
  entirely (existing `assignmentError`/`reassignCustomer` already reports
  this as a plain `{ ok:false, error }` — the sweep just moves to the next
  name in the same ordered list rather than failing the whole slot).
  Advance the team's pointer only to whoever actually got assigned, so the
  rotation naturally continues from there next time — full members are
  skipped for this assignment, not permanently skipped forever.
- If every candidate is at their limit (or the pool is empty after
  excluding slot 1/3), skip this customer for now — it's picked up again
  on a later sweep once someone has room.

## Implementation: compute-on-load sweep, reusing `reassignCustomer`

Same pattern as the existing 60-day pool sweep — no cron infra in this
project, so none is added:

- On store load (and on login), after customers/teams/areas/users are
  loaded, for every customer meeting the trigger conditions, resolve the
  next eligible candidate as above and call the **existing**
  `reassignCustomer(customerId, 2, userId)` — reused as-is, not
  reimplemented. That function already handles the dedup check, the
  active-pool-limit check, setting the new slot's pool to `ACTIVE`, the DB
  write, and sending the existing assignment notification
  (`createNotification`). Then update `teams.last_auto_assigned_user_id`
  to the assigned user (local state + one `customers`-style Supabase
  update on `teams`).
- `ponytail: compute-on-load sweep, not real-time. Same accepted
  imprecision as the pool sweep — upgrade path is a real cron/edge
  function sweep if sub-day precision ever matters.`

**Scope: admin sessions only.** `teams` RLS only allows ADMIN to `update`
(`teams_update_admin`). Since this sweep needs to both reassign the
customer *and* advance the team's rotation pointer, and those two writes
must stay consistent with each other, the sweep only runs when
`currentUser.role === "ADMIN"` — mirrors how the pool sweep already
branches its scope by `isAdmin`. A SALESPERSON/MANAGER session never
attempts it (would silently half-fail on the `teams` write otherwise).
Practical effect: second-assignment happens whenever an admin next loads
the app after the 3-day mark — same "eventually consistent, no cron"
tradeoff already accepted elsewhere in this codebase.

## Admin UI: Area → Team

On the existing `/admin/area` page, each area row gets one new dropdown
("Team"), listing the existing teams, defaulting to "—" (no team). No new
page, no new tab — this is a small addition to an already-generic list
page.

## Out of scope

- Any change to the 3-slot assignment model, slot 3, or manual
  reassignment flows.
- MANAGER as a rotation candidate — SALESPERSON only, per this feature's
  own scope decision (a MANAGER can still be manually assigned to any
  slot the way they already can today).
- Real-time/cron-based sweep (see ponytail note above).
- Any interaction with pipeline stage — that's the next slice of this
  overall upgrade (per-slot stage rework) and isn't touched here; a
  newly-auto-assigned slot 2 gets whatever the customer's current
  (still-single, not-yet-per-slot) stage already is, same as any other
  `reassignCustomer` call today.

## Testing

Manual verification only (matches existing repo convention — no test
framework):
- Set an area's team on `/admin/area`, create a customer in that area
  with only slot 1 assigned, backdate `created_at` (or wait 3 days),
  reload as ADMIN, confirm slot 2 gets filled with the team's
  first-in-order active salesperson (excluding whoever's slot 1), pool 2
  is `ACTIVE`, and a notification was created for that person.
- Repeat for a second customer in the same area — confirm the *next*
  person in that team's order gets it this time (rotation advanced).
  Confirm slot 2, once auto-filled, never gets touched again by a later
  sweep (idempotent).
- Put every candidate in a team at their active-pool limit — confirm the
  customer is skipped (no assignment, no error thrown), then raise one
  person's limit and reload — confirm that customer now gets assigned to
  them.
- Confirm a customer whose area has no team set is never touched.
- Confirm logging in as SALESPERSON/MANAGER does not attempt this sweep
  (no attempted write to `teams`, verifiable by absence of any console
  RLS-rejection noise, and slot 2 stays empty until an admin session loads).
