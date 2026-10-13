# Leader permission rework — open customers, per-team assignee slots

## Context

Today a MANAGER (leader) sees a customer only if one of the customer's 3
assignee slots is held by someone on their team, and assignee candidates are
scoped by `area_teams` (area → team). All teams share one global set of 3
slots (`customers.assigned_to` / `_2` / `_3`).

New model:

1. Customers are **open to every MANAGER** (and ADMIN). Area no longer
   restricts which leader sees a customer or which members can be assigned.
2. **Each team has its own 3 assignee slots per customer.** Team A filling 2
   does not consume Team B's 3.
3. A leader only sees / assigns **their own team's** assignees and only sees
   **their own team members' activity logs**. Stage and pool follow each
   assignee (already per-slot).
4. Every customer records the **team that created it** (`created_by_team_id`).
5. **Change log is shared**: every leader reads every team's change log and
   may edit the customer's profile.
6. Area ↔ team binding (`area_teams`) is removed.

SALESPERSON visibility is unchanged: only customers they are assigned to, and
no change-log access.

## Data model

### New table `customer_assignments`

Replaces the nine columns `assigned_to{,_2,_3}`, `pool_{1,2,3}`,
`pool_{1,2,3}_since`, `stage_{1,2,3}` on `customers`.

```sql
create table customer_assignments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  slot int not null check (slot in (1, 2, 3)),
  user_id uuid not null references profiles (id) on delete cascade,
  pool text not null default 'ACTIVE' check (pool in ('ACTIVE','POTENTIAL')),
  pool_since timestamptz,
  stage_id uuid references pipeline_stages (id) on delete set null,
  unique (customer_id, team_id, slot),
  unique (customer_id, user_id)
);
```

- `team_id` is the assignee's team **at assignment time**. If the user later
  moves team, existing rows keep the old `team_id` (see Open risks).
- Empty slot = no row.
- Existing `pool` values: verify the actual enum in schema.sql before the
  migration is written.

### `customers`

- Add `created_by_team_id uuid references teams (id) on delete set null`.
- Backfill: **all existing customers → SK Team.**
- Drop the nine slot columns after back-fill (manual migration, ordered).

### Other tables carrying `slot`

`assignment_events`, `stage_events`, `removal_requests` keep their `slot`
and gain `team_id` so `(customer, team, slot)` identifies the seat.
Backfill `team_id` from the user's current team.

### Back-fill of assignments (your rule G)

Each existing slot value → one `customer_assignments` row with `team_id` =
**that user's current team** (not SK Team). Users with no team: see Open risks.

### Dropped

`area_teams` table, `Area.teamIds`, `store.addAreaTeam/removeAreaTeam`, the
team section of `admin/area/page.tsx`. `areas.last_auto_assigned_user_id`
rotation pointer stays but is scoped per customer's creating team (below).

## RLS / triggers

| Object | New rule |
|---|---|
| `customers` select | ADMIN or MANAGER: all. SALESPERSON: has a `customer_assignments` row. |
| `customers` insert | unchanged (ADMIN/MANAGER), must set `created_by_team_id` = own team for MANAGER |
| `customers` update | ADMIN/MANAGER: all (shared profile editing). SALESPERSON: assigned only. |
| `customer_assignments` select | ADMIN all; MANAGER **own team's rows only**; SALESPERSON own row. Other teams' assignees are therefore invisible to leaders. |
| `customer_assignments` write | ADMIN any; MANAGER only rows where `team_id = my_team_id()` and `user_id` is on my team; assignee may delete own row. Replaces `protect_customer_assignment`. |
| `activities` select | ADMIN all; MANAGER/SP: only rows whose `user_id` is on **own team** (SP: own rows plus teammates' only if today's behaviour allows — keep today's). |
| `activities` insert | author must hold an assignment on the customer (MANAGER too, as today's UI rule) |
| `customer_change_log` select | ADMIN + **all MANAGERs**; insert: ADMIN/MANAGER |
| `deal_closures`, `removal_requests`, `tasks`, `stage_events`, `assignment_events`, `notifications` | Rewrite `is_customer_assignee(...)` → "has assignment row on my team"; approvals remain own-team only. |
| `profiles` select | **Unchanged** (own team + admin). Change log already snapshots `changed_by_name`, so cross-team authors display without reading their profile; IC/phone stay private. |
| `teams` select | MANAGER/ADMIN read all (for created-by-team labels and filter; team names only). |

**ADMIN (super admin) sees and can do everything**, in every rule above:
all customers, all teams' `customer_assignments` (all seats of every team),
all activity logs, all change logs, all dashboard data, can assign on behalf
of any team (picks the team explicitly), approves any team's requests.
Every new RLS policy / trigger keeps an `is_admin()` branch; every UI scope
check treats ADMIN as unscoped.

`is_customer_assignee(a1,a2,a3)` is replaced by
`is_customer_assignee(customer_id)`.

## Store / types

- `Customer`: remove `assignedToUserId{,2,3}`, `pool{1,2,3}`, `pool{1,2,3}Since`,
  `stage{1,2,3}Id`; add `createdByTeamId` and `assignments: Assignment[]`
  (loaded from `customer_assignments`, filtered by RLS).
- `visibleCustomers`: ADMIN/MANAGER → all customers.
- Helpers `assigneeSlots(c)`, pool/stage lookups reimplemented on
  `assignments`; all callers (≈ every file under Impact) updated.
- `reassignCustomer(customerId, slot, userId)` → operates on the **caller's
  team's** slot (ADMIN passes a team explicitly).
- Pool-limit check (`assignmentError`) unchanged — still counts a user's own
  assignments.
- Realtime: add `customer_assignments` to the sync table list.

## Behavior changes

### Customer list (`/customers`, `CustomerListView`)
- MANAGER sees all customers.
- "Assigned To" column and stage badges show **own team's assignees only**.
- New filter **"Created by"**: *All teams / My team* (ADMIN: pick any team).
- New "Created by team" column (team name).

### Customer detail
- Assignee block: own team's 3 seats; other teams' seats hidden.
- Candidate dropdown: all active non-admin members of **own team** (area no
  longer restricts).
- Activity blocks: grouped by author as today, but only authors on own team.
- Change log visible to all leaders.
- "Log activity" form rule unchanged (MANAGER only if holding a seat).

### Create customer
- Writes `created_by_team_id`.
- Duplicate phone: the `window.confirm` becomes a choice:
  **Open existing customer / Assign existing to my team members / Create
  anyway**. "Assign to my team" opens that customer's detail with the empty
  seat selector focused; if own team's 3 seats are full, show a message.

### Auto second-assign (`autoSecondAssign.ts`, `netlify/functions/sweep-auto-assign.mts`)
- Candidate pool = active, auto-assign-enabled SALESPERSONs of the customer's
  `created_by_team_id` team (not the area's teams).
- Operates on that team's seats only. Legacy customers (`created_by` null)
  stay permanently ineligible as today — they now also have SK Team as
  creating team, but the `created_by` check is kept.
- Rotation pointer: keep `areas.last_auto_assigned_user_id`; when a creating
  team has several areas the pointer is still per area but candidates are the
  team's members. (Revisit if fairness across areas matters.)

### Blasting
- Blast criteria/draw (admin), request form, and claim approval scope stay
  area/team-agnostic.
- **SP access to blast customers (new, fixes a gap):** a SALESPERSON on an
  active blast item (parent request `APPROVED`, item unlocked, not expired)
  may **read and update the profile** of that customer, but may **not log
  activity**, create tasks, or change stage/pool — until they hold a seat.
  - RLS: `customers_select` / `customers_update` gain a branch "an
    unlocked, unexpired `blast_items` row exists for me on this customer".
    Existing column triggers keep applying (phone/remark stay
    ADMIN/MANAGER-only; assignment columns/rows untouched).
  - UI: customer detail hides "Log activity" for a blast-only viewer.
  - Marking an item DONE is via the remark on the blasting row only (the
    "log activity flips DONE" side effect no longer applies to blast-only SPs).
  - The 20% DONE → unlock-next-batch mechanism is unchanged.
- **Claim approve (leader, one click):** assigns the customer into the
  requester's **team's first empty seat** (`resolveBlastClaim`); from then on
  the SP has a normal seat and can log activity. Seat full → per-customer
  error, rest of batch continues.

### Dashboard
- **New leads by source (monthly + yearly)**: counts customers where
  `created_by_team_id` = leader's team (ADMIN: all, optional team filter).
  Table gains an **Area** dimension: rows = source × area (new lead count per
  source per area, plus totals).
- Area filter options: **all areas** for both ADMIN and MANAGER.
- All other sections (pipeline funnel, leaderboard, conversion, closed-by-
  source, removal, assignment counts): scoped to own team members'
  assignments/stages, independent of area (as today's `scopedUserIds`).

### Other scoped views
- `/team/agent-logs`: area list = all areas; agents = own team SPs.
- Removal approvals / Inactive listings / Blast requests: area dropdown =
  all areas; approval scope stays own-team assignees only.
- `admin/area`: remove team linking; auto-assign toggle stays.

## Migration order (manual SQL, run by hand in Supabase)

Delivered as a commented block at the end of `supabase/schema.sql`. Runs in
phases; each phase is independently deployable:

1. **Schema add (no behavior change):** create `customer_assignments`, add
   `created_by_team_id` + backfill SK Team, add `team_id` to event tables.
   Back-fill `customer_assignments` from old columns; old columns stay and
   keep working.
2. **Dual-write period:** app writes both models (short, optional — can skip
   if downtime accepted).
3. **Cutover:** app reads/writes only `customer_assignments`; new RLS and
   triggers; open `customers`/`teams`/`profiles` read for MANAGER.
4. **Cleanup:** drop old columns and `area_teams`.

The user is told when to run each SQL block (see memory: migrations are
manual, a merged feature silently no-ops until the SQL runs).

## Impact list (files reading slot/pool/stage columns or area↔team)

`lib/store.tsx`, `lib/types.ts`, `lib/mappers.ts`, `lib/autoSecondAssign.ts`,
`lib/dashboardMetrics.ts`, `lib/inactiveListings.ts`, `lib/blasting.ts`,
`lib/whatsapp.ts`, `netlify/functions/sweep-auto-assign.mts`,
`app/(dashboard)/customers/page.tsx`, `customers/[id]/page.tsx`,
`dashboard/page.tsx`, `my-customers/page.tsx`, `team/agent-logs/page.tsx`,
`admin/area/page.tsx`, `components/CustomerListView.tsx`,
`AgentLogBrowser.tsx`, `RemovalApprovalsBrowser.tsx`,
`InactiveListingsBrowser.tsx`, `BlastRequestForm.tsx`,
`BlastClaimsBrowser.tsx`, `BlastApprovalsBrowser.tsx`, `MainNav.tsx`,
plus the `*.check.ts` fixtures.

## Open risks

- **User changes team.** Their existing seats keep the old `team_id`; the new
  team's leader would not see them, and the old team's leader keeps seeing
  them. Proposed: moving a user in `admin/teams` also updates `team_id` on
  their active assignments. Needs confirmation.
- **Users with no team** cannot be assigned (no seat owner) — enforce in UI.
- (Resolved) User changing team: their seats move with them to the new team.
- (Resolved) `profiles` stays unchanged; no cross-team IC/phone exposure.
- **Leaders editing any customer** (shared change log implies shared edit):
  profile edit confirm / identity lock rules stay, but any leader may edit.
- Duplicate-phone "assign to my team" must hit the same seat-limit and
  pool-limit checks as normal assignment.

## Testing

Manual (no test framework), plus update the `*.check.ts` scripts that cover
`autoSecondAssign`, `dashboardMetrics`, `blasting`, `inactiveListings` for the
new assignment shape. Key scenarios: Team A fills 2 seats, Team B still has 3
and cannot see A's seats; B-leader cannot read A-member activity but can read
the change log; creating-team filter and dashboard new-leads × area counts;
duplicate-phone flow; auto second-assign only draws from creating team.
