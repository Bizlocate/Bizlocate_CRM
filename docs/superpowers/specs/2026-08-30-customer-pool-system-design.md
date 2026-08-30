# Customer Pool System (per-assignee active/inactive pool + dual limits + 60-day auto-removal)

## Context

Second half of the "admin customer list upgrade" request (first half was the
[admin customer export feature](2026-08-30-admin-customer-export-design.md)).
This spec covers: splitting each salesperson's assigned customers into an
"Active" pool (currently following) and an "Inactive/Potential" pool (parked
for later), giving each salesperson two separate limits (one per pool), and
auto-removing a customer from a salesperson's inactive pool after 60 days
without that salesperson logging any activity on it.

## Data model

Customers already carry assignment as three flat slots
(`assignedToUserId`/`assignedToUserId2`/`assignedToUserId3`) rather than a
join table. Pool status is **per assignee slot**, not per customer — the
same customer can be Active for one assignee and Inactive for another. This
follows the existing 3-slot convention instead of introducing a
`customer_assignees` join table.

`customers` table — 6 new columns, one pair per slot:
- `pool_1`, `pool_2`, `pool_3`: `'ACTIVE' | 'INACTIVE'`, default `'ACTIVE'`,
  null when the corresponding assignee slot is empty.
- `pool_1_since`, `pool_2_since`, `pool_3_since`: timestamp, set only when a
  slot's pool flips to `INACTIVE` (null while `ACTIVE`). This is the 60-day
  clock's starting point.

`users` table — replace `customer_limit` with two columns:
- `active_pool_limit`: number, nullable (null = unlimited). Migration seeds
  this from the existing `customer_limit` value.
- `inactive_pool_limit`: number, nullable (null = unlimited). Defaults null
  for existing users (unlimited) since there's no prior data to seed it
  from.

`lib/types.ts`:
- `Customer` gets `pool1/pool2/pool3: "ACTIVE" | "INACTIVE" | null` and
  `pool1Since/pool2Since/pool3Since: string | null`.
- `User.customerLimit` is replaced by `activePoolLimit: number | null` and
  `inactivePoolLimit: number | null`.
- `Activity` gains `authorUserId: string` and `createdAt: string` (raw ISO,
  alongside the existing formatted `author` name and `time` string) so the
  60-day sweep can filter activities by the assignee who logged them and
  compare real dates. Existing `author`/`time` fields are unchanged.

## Assignment behavior

- New customer creation / reassigning a slot to a different person: new
  slot's pool always starts `ACTIVE` (`pool_N = 'ACTIVE'`, `pool_N_since =
  null`).
- Clearing a slot (unassign) clears that slot's pool fields too.

## Toggling pool status

- Only the assignee occupying that slot, or an ADMIN, can toggle a slot's
  pool between Active and Inactive. MANAGER cannot.
- UI: on the customer detail page, next to each assignee's name, a small
  Active/Potential toggle control (visible/enabled per the rule above;
  read-only display otherwise).
- Toggling to `INACTIVE` sets `pool_N_since = now`. Toggling to `ACTIVE`
  clears `pool_N_since = null`.

## Limit enforcement

`assignmentError(userId, pool, excludeCustomerId?)` (extends the existing
single-limit version in [lib/store.tsx](../../../lib/store.tsx)) takes which
pool the assignment/toggle targets, counts that user's customers whose
matching slot is in that pool, and compares against `activePoolLimit` or
`inactivePoolLimit` accordingly. Checked on: new customer creation, slot
reassignment, and pool toggle (moving into a pool that's already at its
limit is blocked the same way assigning past the old single limit was).

## 60-day auto-removal

Compute-on-load sweep, no cron infrastructure exists in this project so
none is added:

- When the store loads customers + activities, for every slot with
  `pool_N = 'INACTIVE'`, compute `lastTouched = max(pool_N_since, latest
  activities.createdAt where activities.customerId = this customer AND
  activities.authorUserId = this slot's user)`.
- If `now - lastTouched > 60 days`, clear that slot: `assigned_to_N = null`,
  `pool_N = null`, `pool_N_since = null`. Persist via Supabase update, then
  update local state to match.
- Only that one assignee's slot is cleared — other assignees on the same
  customer are untouched.

`ponytail: compute-on-load sweep — checked whenever a client loads the
store, not the instant 60 days elapses. Upgrade path: a real cron/edge
function sweep if sub-day precision ever matters.`

## List UI

- `/customers` page: only for `currentUser.role === "SALESPERSON"`, two tabs
  above the filter card — **Active Pool** / **Potential Pool** — defaulting
  to Active Pool. Selecting a tab filters the list to customers where
  *this user's own slot* has that pool value.
- ADMIN/MANAGER (who see all customers, not just their own assignments) get
  no tabs — a customer can be Active for one assignee and Inactive for
  another, so a single pool filter doesn't apply cleanly to them. They
  continue to see the unified list; per-assignee pool state is visible on
  the customer detail page instead.

## Out of scope

- Admin export feature (separate spec, already implemented).
- Any change to the 3-slot assignment model itself (no join table).
- Real-time/cron-based sweep (see ponytail note above).
- Manager ability to toggle pool status.

## Testing

Manual verification only (matches the export spec — no existing test
framework precedent in this codebase for UI-level features):
- Toggle a slot to Inactive as its assignee, confirm `pool_since` set and
  Active/Potential tabs reflect it for that salesperson.
- Confirm a manager cannot toggle; confirm admin can toggle any slot.
- Hit `activePoolLimit`/`inactivePoolLimit` and confirm assignment/toggle is
  blocked with the limit message.
- Backdate a `pool_N_since` (or an activity's `created_at`) past 60 days
  with no newer activity from that assignee, reload, confirm that slot gets
  cleared and other assignees on the same customer are unaffected.
- Confirm ADMIN/MANAGER customer list shows no pool tabs; SALESPERSON list
  does, and each tab filters correctly.
