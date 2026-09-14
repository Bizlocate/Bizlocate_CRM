# Area ↔ Team many-to-many

## Context

An area currently belongs to at most one team (`areas.team_id`). In
practice a boundary area — e.g. KL Maluri — needs to be worked by two
different teams at once, and there's no way to express that: setting
`areas.team_id` to team B silently un-assigns it from team A. This spec
makes area↔team many-to-many so one area can be linked to multiple teams
(and a team can already cover multiple areas today — `areas.team_id` has
no unique constraint, so that direction already works).

Confirmed out of scope: an individual salesperson holding multiple areas
independently of their team. `profiles.team_id` and `teams.manager_id`
stay single-valued FKs — unchanged. The "adding a member to Setapak team
removes their previous area" symptom is a side effect of this same
`areas.team_id` single-FK limitation (a salesperson's area coverage is
whatever team they're on, and a team now being linkable to multiple areas
at once resolves it) — no separate per-user area assignment feature is
being added.

## Data model

Replace `areas.team_id` with a join table:

```sql
create table area_teams (
  area_id uuid not null references areas (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  primary key (area_id, team_id)
);

alter table area_teams enable row level security;

create policy "area_teams_select" on area_teams for select using (auth.uid() is not null);
create policy "area_teams_insert_admin" on area_teams for insert with check (is_admin());
create policy "area_teams_delete_admin" on area_teams for delete using (is_admin());
```

(Mirrors the existing `areas`/`sub_areas` RLS convention: any
authenticated user reads, only admin writes. No update policy needed —
membership is added/removed as rows, never edited in place.)

`areas.last_auto_assigned_user_id uuid references profiles (id) on delete
set null` is added — the round-robin pointer moves from team to area (see
below). `areas.team_id` and `teams.last_auto_assigned_user_id` are
dropped once data is migrated.

No RLS change anywhere else. Customer visibility (`customers` policies,
`my_team_id()`) is driven by `profiles.team_id` — who a customer is
*assigned to*, not the customer's area — so it's untouched by an area
gaining a second team.

`lib/types.ts`:
- `Area.teamId: string | null` → `Area.teamIds: string[]`, plus
  `lastAutoAssignedUserId: string | null`.
- `Team.lastAutoAssignedUserId` removed.

## Auto second-assignment pool

`sweepAutoSecondAssign` ([lib/store.tsx:1054](../../../lib/store.tsx:1054))
currently resolves one team from `area.teamId` and pulls candidates with
`u.teamId === team.id`. Changes to:

- **Candidate pool:** union of active, auto-assign-enabled SALESPERSONs
  across every team in `area.teamIds`, de-duplicated, same
  name/id-tiebreak ordering as today.
- **Rotation pointer:** reads/writes `areas.last_auto_assigned_user_id`
  instead of `teams.last_auto_assigned_user_id`. The pool is now the
  area's pool (it can span teams), so fairness has to be tracked per area,
  not per team — a team's own pointer would be meaningless once that team
  is shared across two areas with different partner teams.
- **Pick-next / at-limit skip / exclude slot 1 & 3 / batch in-memory
  pointer tracking (`pointerByTeam` → `pointerByArea`):** unchanged
  logic, just keyed by area id instead of team id.
- An area with zero linked teams behaves exactly like today's
  `area.teamId === null` — never triggers auto-assignment.

## Other call sites reading `Area.teamId`

`Area.teamId` (singular) is read in seven more places beyond
`sweepAutoSecondAssign` and the admin area page — all "scope to the area's
team(s)" checks that become an `includes()` against `teamIds` instead of
an `===` against `teamId`:

- [components/AgentLogBrowser.tsx:51-54](../../../components/AgentLogBrowser.tsx#L51-L54) —
  narrows the Agent dropdown to the selected area's team once an area is
  picked.
- [components/RemovalApprovalsBrowser.tsx:28](../../../components/RemovalApprovalsBrowser.tsx#L28) —
  a MANAGER's Area filter dropdown is scoped to areas their team owns.
- [components/InactiveListingsBrowser.tsx:56](../../../components/InactiveListingsBrowser.tsx#L56) —
  same MANAGER area-scoping pattern.
- [app/(dashboard)/customers/[id]/page.tsx:557-563](../../../app/(dashboard)/customers/%5Bid%5D/page.tsx#L557-L563) —
  reassign-slot candidate dropdowns scoped to the customer's area's team.
- [app/(dashboard)/customers/page.tsx:735-737](../../../app/(dashboard)/customers/page.tsx#L735-L737) —
  same candidate-scoping for the new-customer form's assignee dropdowns.
- [app/(dashboard)/dashboard/page.tsx:199](../../../app/(dashboard)/dashboard/page.tsx#L199) —
  a MANAGER's area filter on the dashboard.
- [app/(dashboard)/team/agent-logs/page.tsx:9](../../../app/(dashboard)/team/agent-logs/page.tsx#L9) —
  scopes the Agent Log's area list to a MANAGER's team.

Each becomes: wherever the old code compared `area.teamId === someTeamId`
(guarding on `someTeamId` being non-null first), the new code checks
`!!someTeamId && area.teamIds.includes(someTeamId)`. Same resulting
candidate/filter set for an area still linked to exactly one team;
an area linked to two teams now correctly matches both teams' scope
instead of arbitrarily matching only one.

## Admin UI (`app/(dashboard)/admin/area/page.tsx`)

Team column stops being a single `<select>`. On row expand (same
expand/collapse the row already has for sub-areas), show:

- The area's currently-linked teams, each with a "Remove" action —
  same visual pattern as team members on `admin/teams/page.tsx`
  ([app/(dashboard)/admin/teams/page.tsx:140-146](../../../app/(dashboard)/admin/teams/page.tsx#L140-L146)).
- A `<select>` of teams not yet linked + "+ Add team" button to link one.

The collapsed row's "Team" column becomes a comma-joined list of linked
team names (or "—" if none), replacing the current dropdown shown inline.

`admin/teams/page.tsx`'s "Team name (Area)" field (the name-prefill
dropdown on team creation) is unrelated to this relationship and stays as
is — it's just a naming convenience, not a link.

## Store API (`lib/store.tsx`)

- `updateAreaTeam(id, teamId)` removed, replaced by:
  - `addAreaTeam(areaId: string, teamId: string)` — inserts into
    `area_teams`, optimistic local update, rollback on error (same
    pattern as `updateAreaTeam` today).
  - `removeAreaTeam(areaId: string, teamId: string)` — deletes the row,
    same optimistic pattern.
- `loadAreas()` additionally loads `area_teams` and folds it into each
  `Area.teamIds` (separate query, joined client-side — same pattern
  `loadAreas`/`loadSubAreas` already use as two independent calls rather
  than a Supabase join).
- `mapArea` drops `team_id`; gains `last_auto_assigned_user_id` →
  `lastAutoAssignedUserId`.
- `mapTeam` drops `last_auto_assigned_user_id`/`lastAutoAssignedUserId`.

## Migration (manual — run by hand in Supabase, per repo convention)

Written as a commented block appended to `supabase/schema.sql`, same as
every other post-launch migration in this file:

```sql
-- create table area_teams (
--   area_id uuid not null references areas (id) on delete cascade,
--   team_id uuid not null references teams (id) on delete cascade,
--   primary key (area_id, team_id)
-- );
-- alter table area_teams enable row level security;
-- create policy "area_teams_select" on area_teams for select using (auth.uid() is not null);
-- create policy "area_teams_insert_admin" on area_teams for insert with check (is_admin());
-- create policy "area_teams_delete_admin" on area_teams for delete using (is_admin());
--
-- insert into area_teams (area_id, team_id)
--   select id, team_id from areas where team_id is not null;
--
-- alter table areas add column if not exists last_auto_assigned_user_id uuid references profiles (id) on delete set null;
--
-- alter table areas drop column if exists team_id;
-- alter table teams drop column if exists last_auto_assigned_user_id;
```

Order matters: back-fill `area_teams` from `areas.team_id` **before**
dropping that column. `teams.last_auto_assigned_user_id`'s existing
values aren't migrated forward — each area's rotation restarts from
scratch (`lastAutoAssignedUserId = null`), which just means the very next
sweep picks the first candidate in name order for that area instead of
resuming an old team-scoped position. Acceptable one-time reset, not
worth carrying old per-team pointer values into a differently-scoped
pool.

## Out of scope

- Per-user (salesperson) multi-area assignment independent of team —
  confirmed not needed; team↔area many-to-many covers the real scenarios.
- Any change to `profiles.team_id` or `teams.manager_id` cardinality.
- Any change to customer/task/notification/sales-target RLS.
- Any change to the first-assignment flow (manual/webhook) — only the
  second-slot auto-assign sweep reads `area.teamId` today.

## Testing

Manual verification only (repo convention, no test framework):
- Link one area to two teams on `/admin/area`. Confirm both teams' active
  salespeople appear as candidates for that area's second-assignment
  sweep, and rotation alternates fairly across the combined pool.
- Remove one of the two linked teams — confirm that team's members stop
  being candidates for that area on the next sweep, and the other team
  keeps rotating normally.
- Confirm a team can still be linked to two different areas at once
  (already-working direction — regression check only).
- Confirm an area with no linked team never triggers auto-assignment.
- Confirm `admin/teams` add/remove member no longer has any side effect
  on area↔team links (it never touched `areas` — sanity check post-change).
- Link an area to two teams. As a MANAGER on each of those teams, confirm
  the area now shows up in that manager's Area filter on the dashboard,
  Agent Log, and Removal Approvals pages, and that both teams' active
  salespeople appear as assignee candidates for a customer in that area
  (new-customer form and reassign dropdowns).
