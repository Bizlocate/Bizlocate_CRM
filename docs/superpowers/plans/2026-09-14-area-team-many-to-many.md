# Area ↔ Team Many-to-Many Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one area be linked to multiple teams (e.g. a boundary area like KL Maluri worked by two teams at once), replacing the single `areas.team_id` FK with a many-to-many `area_teams` join table. Every place that reads "the area's team" — the second-assignment auto-assign pool, manager area-scoping dropdowns, assignee-candidate dropdowns — switches from an `===` team check to an `includes()` check against the area's team list.

**Architecture:** New `area_teams(area_id, team_id)` join table replaces `areas.team_id`. The round-robin pointer for auto second-assignment moves from `teams.last_auto_assigned_user_id` to a new `areas.last_auto_assigned_user_id`, because the candidate pool it rotates through is now the area's pool (union of every linked team's salespeople), not one team's. No RLS changes anywhere except the new join table getting the same admin-write/authenticated-read policy shape `areas`/`sub_areas` already use. No new dependencies, no new pages — same admin `/admin/area` page gains a multi-team management block using the same list/add/remove interaction `admin/teams/page.tsx` already uses for team members.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Supabase (`@supabase/ssr` client via `createClient()`), existing `useStore()` context in `lib/store.tsx`. No test framework in this repo — verify via `npm run build` (type-check) plus manual click-through in the browser preview.

## Global Constraints

- `profiles.team_id` and `teams.manager_id` stay single-valued FKs — not touched by this plan.
- No RLS change to `customers`/`tasks`/`notifications`/`sales_targets` or any table besides the new `area_teams` (customer visibility is driven by `profiles.team_id` — who a customer is assigned to — not by the customer's area).
- `area_teams` RLS mirrors `areas`/`sub_areas`: any authenticated user reads (`auth.uid() is not null`), only admin inserts/deletes. No update policy — membership is added/removed as rows, never edited in place.
- Match existing code style exactly: inline `style={{...}}` objects, `.field-input`/`.card`/`.btn`/`.btn-outline`/`.btn-primary` classes, fire-and-forget `.then(() => {})` on writes, optimistic local `setState` update with rollback-on-error for every mutation (existing pattern throughout `lib/store.tsx`), no new dependencies.
- Every `area.teamId === x` read elsewhere in the app becomes `!!x && area.teamIds.includes(x)` — same resulting set for an area still linked to exactly one team, correctly matches multiple teams once an area has more than one.
- Migrations are written as commented SQL blocks appended to `supabase/schema.sql` and run by hand in the Supabase SQL editor — this repo has no migration runner, schema.sql changes are never auto-applied.

---

### Task 1: Schema — `area_teams` join table, `areas.last_auto_assigned_user_id`, drop `areas.team_id` + `teams.last_auto_assigned_user_id`

**Files:**
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: table `area_teams (area_id, team_id)`, column `areas.last_auto_assigned_user_id`.

- [ ] **Step 1: Remove `teams.last_auto_assigned_user_id`**

In `supabase/schema.sql`, find the `teams` table definition:

```sql
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  manager_id uuid, -- fk added after profiles exists (circular ref)
  last_auto_assigned_user_id uuid -- fk added after profiles exists, same as manager_id
);
```

Replace with (drop the last column, back to a plain `manager_id`-only table):

```sql
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  manager_id uuid -- fk added after profiles exists (circular ref)
);
```

- [ ] **Step 2: Drop the matching FK constraint**

Find:

```sql
alter table teams
  add constraint teams_manager_id_fkey foreign key (manager_id) references profiles (id) on delete set null,
  add constraint teams_last_auto_assigned_user_id_fkey foreign key (last_auto_assigned_user_id) references profiles (id) on delete set null;
```

Replace with (single-constraint form):

```sql
alter table teams
  add constraint teams_manager_id_fkey foreign key (manager_id) references profiles (id) on delete set null;
```

- [ ] **Step 3: Replace `areas.team_id` with `areas.last_auto_assigned_user_id`**

Find:

```sql
create table areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  team_id uuid references teams (id) on delete set null,
  auto_assign_enabled boolean not null default true
);
```

Replace with (`areas` is defined after `profiles`, line 15, so no circular-ref workaround is needed — the FK can be inline):

```sql
create table areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  auto_assign_enabled boolean not null default true,
  last_auto_assigned_user_id uuid references profiles (id) on delete set null
);
```

- [ ] **Step 4: Add the `area_teams` join table**

Find `create table sub_areas (...)`:

```sql
create table sub_areas (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas (id) on delete cascade,
  name text not null,
  unique (area_id, name)
);
```

Add `area_teams` right after it:

```sql
create table sub_areas (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas (id) on delete cascade,
  name text not null,
  unique (area_id, name)
);

create table area_teams (
  area_id uuid not null references areas (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  primary key (area_id, team_id)
);
```

- [ ] **Step 5: Enable RLS on `area_teams`**

Find `alter table sub_areas enable row level security;` (in the block starting `alter table teams enable row level security;`) and add a line right after it:

```sql
alter table sub_areas enable row level security;
alter table area_teams enable row level security;
```

- [ ] **Step 6: Add `area_teams` RLS policies**

Find the `sub_areas` policy block:

```sql
create policy "sub_areas_select" on sub_areas for select using (auth.uid() is not null);
create policy "sub_areas_insert_admin" on sub_areas for insert with check (is_admin());
create policy "sub_areas_update_admin" on sub_areas for update using (is_admin());
create policy "sub_areas_delete_admin" on sub_areas for delete using (is_admin());
```

Add right after it:

```sql
create policy "sub_areas_select" on sub_areas for select using (auth.uid() is not null);
create policy "sub_areas_insert_admin" on sub_areas for insert with check (is_admin());
create policy "sub_areas_update_admin" on sub_areas for update using (is_admin());
create policy "sub_areas_delete_admin" on sub_areas for delete using (is_admin());

-- area_teams: any authenticated user reads, admin writes (no update — rows are added/removed, never edited)
create policy "area_teams_select" on area_teams for select using (auth.uid() is not null);
create policy "area_teams_insert_admin" on area_teams for insert with check (is_admin());
create policy "area_teams_delete_admin" on area_teams for delete using (is_admin());
```

- [ ] **Step 7: Append the already-provisioned-database migration block**

At the very end of `supabase/schema.sql`, append (fully `--`-commented, matching every other migration block in this file exactly):

```sql

-- ============================================================
-- Migration: Area <-> Team many-to-many — run once against an
-- already-provisioned database (everything below already exists in
-- the main schema above for fresh installs). Order matters: back-fill
-- area_teams from areas.team_id BEFORE dropping that column.
-- See docs/superpowers/specs/2026-09-14-area-team-many-to-many-design.md
-- ============================================================
--
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

- [ ] **Step 8: Commit**

```bash
git add supabase/schema.sql
git commit -m "Schema: area_teams join table, areas.last_auto_assigned_user_id, drop areas.team_id + teams.last_auto_assigned_user_id

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Types + Store — `Area.teamIds`, `loadAreas` join, `addAreaTeam`/`removeAreaTeam`, auto-assign sweep rewrite

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/store.tsx`

**Interfaces:**
- Consumes: existing `Customer` fields (`assignedToUserId`, `assignedToUserId2`, `assignedToUserId3`, `pool1`/`pool2`/`pool3`, `stage1Id`, `areaId`, `createdAt`, `pool1Since`), existing `User` fields (`active`, `autoAssignEnabled`, `role`, `teamId`, `activePoolLimit`), existing `Stage`/`Activity` fields, existing `logAssignmentEvent` function.
- Produces: `Area.teamIds: string[]`, `Area.lastAutoAssignedUserId: string | null`, `addAreaTeam: (areaId: string, teamId: string) => void`, `removeAreaTeam: (areaId: string, teamId: string) => void` (new `Store` methods, replacing `updateAreaTeam`). `Team.lastAutoAssignedUserId` is removed. The sweep itself stays internal (not exposed on `Store`, invoked automatically on load/login, same as today).

Both files change together in this task so `npm run build` stays green at every commit in it.

- [ ] **Step 1: Update `Area`/`Team` in `lib/types.ts`**

Find:

```ts
export interface Team {
  id: string;
  name: string;
  managerId: string | null;
  lastAutoAssignedUserId: string | null;
}

export interface Area {
  id: string;
  name: string;
  teamId: string | null;
  autoAssignEnabled: boolean;
}
```

Replace with:

```ts
export interface Team {
  id: string;
  name: string;
  managerId: string | null;
}

export interface Area {
  id: string;
  name: string;
  teamIds: string[];
  autoAssignEnabled: boolean;
  lastAutoAssignedUserId: string | null;
}
```

- [ ] **Step 2: Update `mapTeam`/`mapArea` in `lib/store.tsx`**

Find:

```ts
function mapTeam(row: { id: string; name: string; manager_id: string | null; last_auto_assigned_user_id: string | null }): Team {
  return { id: row.id, name: row.name, managerId: row.manager_id, lastAutoAssignedUserId: row.last_auto_assigned_user_id };
}

function mapArea(row: { id: string; name: string; team_id: string | null; auto_assign_enabled: boolean }): Area {
  return { id: row.id, name: row.name, teamId: row.team_id, autoAssignEnabled: row.auto_assign_enabled ?? true };
}
```

Replace with:

```ts
function mapTeam(row: { id: string; name: string; manager_id: string | null }): Team {
  return { id: row.id, name: row.name, managerId: row.manager_id };
}

function mapArea(row: { id: string; name: string; auto_assign_enabled: boolean; last_auto_assigned_user_id: string | null }, teamIds: string[]): Area {
  return { id: row.id, name: row.name, teamIds, autoAssignEnabled: row.auto_assign_enabled ?? true, lastAutoAssignedUserId: row.last_auto_assigned_user_id };
}
```

- [ ] **Step 3: Rewrite `loadAreas` to fold in `area_teams`**

Find:

```ts
  async function loadAreas(): Promise<Area[]> {
    const supabase = createClient();
    const { data } = await supabase.from("areas").select("*").order("name");
    const mapped = (data ?? []).map(mapArea);
    setAreas(mapped);
    return mapped;
  }
```

Replace with:

```ts
  async function loadAreas(): Promise<Area[]> {
    const supabase = createClient();
    const [{ data }, { data: links }] = await Promise.all([
      supabase.from("areas").select("*").order("name"),
      supabase.from("area_teams").select("*"),
    ]);
    const teamIdsByArea = new Map<string, string[]>();
    for (const link of (links ?? []) as { area_id: string; team_id: string }[]) {
      const list = teamIdsByArea.get(link.area_id) ?? [];
      list.push(link.team_id);
      teamIdsByArea.set(link.area_id, list);
    }
    const mapped = (data ?? []).map((row) => mapArea(row, teamIdsByArea.get(row.id) ?? []));
    setAreas(mapped);
    return mapped;
  }
```

- [ ] **Step 4: Replace `updateAreaTeam` with `addAreaTeam`/`removeAreaTeam`**

Find:

```ts
  function updateAreaTeam(id: string, teamId: string | null) {
    const target = areas.find((a) => a.id === id);
    if (!target) return;
    const prevTeamId = target.teamId;
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, teamId } : a)));
    const supabase = createClient();
    supabase
      .from("areas")
      .update({ team_id: teamId })
      .eq("id", id)
      .then(({ error }) => {
        if (error) setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, teamId: prevTeamId } : a)));
      });
  }
```

Replace with:

```ts
  function addAreaTeam(areaId: string, teamId: string) {
    const target = areas.find((a) => a.id === areaId);
    if (!target || target.teamIds.includes(teamId)) return;
    setAreas((prev) => prev.map((a) => (a.id === areaId ? { ...a, teamIds: [...a.teamIds, teamId] } : a)));
    const supabase = createClient();
    supabase
      .from("area_teams")
      .insert({ area_id: areaId, team_id: teamId })
      .then(({ error }) => {
        if (error) setAreas((prev) => prev.map((a) => (a.id === areaId ? { ...a, teamIds: a.teamIds.filter((id) => id !== teamId) } : a)));
      });
  }

  function removeAreaTeam(areaId: string, teamId: string) {
    const target = areas.find((a) => a.id === areaId);
    if (!target) return;
    const prevTeamIds = target.teamIds;
    setAreas((prev) => prev.map((a) => (a.id === areaId ? { ...a, teamIds: a.teamIds.filter((id) => id !== teamId) } : a)));
    const supabase = createClient();
    supabase
      .from("area_teams")
      .delete()
      .eq("area_id", areaId)
      .eq("team_id", teamId)
      .then(({ error }) => {
        if (error) setAreas((prev) => prev.map((a) => (a.id === areaId ? { ...a, teamIds: prevTeamIds } : a)));
      });
  }
```

- [ ] **Step 5: Update the `Store` interface**

Find:

```ts
  addArea: (name: string) => void;
  updateArea: (id: string, name: string) => void;
  updateAreaTeam: (id: string, teamId: string | null) => void;
  updateAreaAutoAssign: (id: string, enabled: boolean) => void;
```

Replace with:

```ts
  addArea: (name: string) => void;
  updateArea: (id: string, name: string) => void;
  addAreaTeam: (areaId: string, teamId: string) => void;
  removeAreaTeam: (areaId: string, teamId: string) => void;
  updateAreaAutoAssign: (id: string, enabled: boolean) => void;
```

- [ ] **Step 6: Update the `value: Store` object**

Find:

```ts
    addArea,
    updateArea,
    updateAreaTeam,
    updateAreaAutoAssign,
```

Replace with:

```ts
    addArea,
    updateArea,
    addAreaTeam,
    removeAreaTeam,
    updateAreaAutoAssign,
```

- [ ] **Step 7: Rewrite `sweepAutoSecondAssign`**

Find the full function (starts right after `sweepStalePool`, search for `function sweepAutoSecondAssign`):

```ts
  function sweepAutoSecondAssign(customersList: Customer[], areasList: Area[], teamsList: Team[], usersList: User[], stagesList: Stage[], activitiesList: Activity[], isAdmin: boolean) {
    if (!isAdmin) return;
    const defaultStage = stagesList.find((s) => s.isDefault) ?? stagesList[0];
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const supabase = createClient();
    // The `teamsList`/`customersList` params are a frozen snapshot, but a
    // single sweep call can assign multiple customers off the same team in
    // one pass (this is a batch catch-up sweep, not a one-at-a-time
    // trigger). Track this call's own round-robin pointer and each
    // candidate's in-progress assignment count locally so the second
    // customer processed in the same sweep sees the first one's pick,
    // instead of both re-reading the same stale pointer/pool-count and
    // colliding on the same winner.
    const pointerByTeam = new Map<string, string | null>();
    const extraAssignedCount = new Map<string, number>();
    for (const c of customersList) {
      if (c.assignedToUserId2 || !c.assignedToUserId || !c.areaId) continue;
      const area = areasList.find((a) => a.id === c.areaId);
      if (!area?.teamId || !area.autoAssignEnabled) continue;
      const team = teamsList.find((t) => t.id === area.teamId);
      if (!team) continue;
      const slot1Stage = c.stage1Id ? stagesList.find((s) => s.id === c.stage1Id) : undefined;
      if (slot1Stage?.excludeFromAutoAssign) {
        const lastOwnActivity = activitiesList
          .filter((act) => act.customerId === c.id && act.authorUserId === c.assignedToUserId)
          .reduce((max, act) => Math.max(max, new Date(act.createdAt).getTime()), 0);
        const lastTouched = Math.max(new Date(c.pool1Since ?? c.createdAt).getTime(), lastOwnActivity);
        if (now - lastTouched < FOURTEEN_DAYS_MS) continue;
      } else {
        if (now - new Date(c.createdAt).getTime() < SEVEN_DAYS_MS) continue;
      }
      const excluded = [c.assignedToUserId, c.assignedToUserId3].filter((id): id is string => !!id);
      const candidates = usersList
        .filter((u) => u.active && u.autoAssignEnabled && u.role === "SALESPERSON" && u.teamId === team.id && !excluded.includes(u.id))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      if (candidates.length === 0) continue;
      const currentPointer = pointerByTeam.has(team.id) ? pointerByTeam.get(team.id)! : team.lastAutoAssignedUserId;
      const lastIndex = candidates.findIndex((u) => u.id === currentPointer);
      const startIndex = lastIndex === -1 ? 0 : (lastIndex + 1) % candidates.length;
      let winner: User | undefined;
      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[(startIndex + i) % candidates.length];
        const limit = candidate.activePoolLimit;
        if (limit !== null && limit !== undefined) {
          const activeCount = customersList.filter((other) =>
            (other.assignedToUserId === candidate.id && other.pool1 === "ACTIVE") ||
            (other.assignedToUserId2 === candidate.id && other.pool2 === "ACTIVE") ||
            (other.assignedToUserId3 === candidate.id && other.pool3 === "ACTIVE")
          ).length + (extraAssignedCount.get(candidate.id) ?? 0);
          if (activeCount >= limit) continue;
        }
        winner = candidate;
        break;
      }
      if (!winner) continue;
      const winnerId = winner.id;
      pointerByTeam.set(team.id, winnerId);
      extraAssignedCount.set(winnerId, (extraAssignedCount.get(winnerId) ?? 0) + 1);
      setCustomers((prev) =>
        prev.map((row) => (row.id === c.id ? { ...row, assignedToUserId2: winnerId, pool2: "ACTIVE", pool2Since: null, stage2Id: defaultStage?.id ?? null } : row))
      );
      supabase.from("customers").update({ assigned_to_2: winnerId, pool_2: "ACTIVE", pool_2_since: null, stage_2: defaultStage?.id ?? null }).eq("id", c.id).then(() => {});
      setTeams((prev) => prev.map((t) => (t.id === team.id ? { ...t, lastAutoAssignedUserId: winnerId } : t)));
      supabase.from("teams").update({ last_auto_assigned_user_id: winnerId }).eq("id", team.id).then(() => {});
      logAssignmentEvent(c.id, winnerId, 2);
    }
  }
```

Replace with (drops the `teamsList` param — the candidate pool and pointer are now resolved entirely from the area — and moves the rotation pointer from team to area):

```ts
  function sweepAutoSecondAssign(customersList: Customer[], areasList: Area[], usersList: User[], stagesList: Stage[], activitiesList: Activity[], isAdmin: boolean) {
    if (!isAdmin) return;
    const defaultStage = stagesList.find((s) => s.isDefault) ?? stagesList[0];
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const supabase = createClient();
    // The `customersList` param is a frozen snapshot, but a single sweep
    // call can assign multiple customers off the same area in one pass
    // (this is a batch catch-up sweep, not a one-at-a-time trigger). Track
    // this call's own round-robin pointer and each candidate's in-progress
    // assignment count locally so the second customer processed in the
    // same sweep sees the first one's pick, instead of both re-reading the
    // same stale pointer/pool-count and colliding on the same winner.
    const pointerByArea = new Map<string, string | null>();
    const extraAssignedCount = new Map<string, number>();
    for (const c of customersList) {
      if (c.assignedToUserId2 || !c.assignedToUserId || !c.areaId) continue;
      const area = areasList.find((a) => a.id === c.areaId);
      if (!area || area.teamIds.length === 0 || !area.autoAssignEnabled) continue;
      const slot1Stage = c.stage1Id ? stagesList.find((s) => s.id === c.stage1Id) : undefined;
      if (slot1Stage?.excludeFromAutoAssign) {
        const lastOwnActivity = activitiesList
          .filter((act) => act.customerId === c.id && act.authorUserId === c.assignedToUserId)
          .reduce((max, act) => Math.max(max, new Date(act.createdAt).getTime()), 0);
        const lastTouched = Math.max(new Date(c.pool1Since ?? c.createdAt).getTime(), lastOwnActivity);
        if (now - lastTouched < FOURTEEN_DAYS_MS) continue;
      } else {
        if (now - new Date(c.createdAt).getTime() < SEVEN_DAYS_MS) continue;
      }
      const excluded = [c.assignedToUserId, c.assignedToUserId3].filter((id): id is string => !!id);
      const candidates = usersList
        .filter((u) => u.active && u.autoAssignEnabled && u.role === "SALESPERSON" && !!u.teamId && area.teamIds.includes(u.teamId) && !excluded.includes(u.id))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      if (candidates.length === 0) continue;
      const currentPointer = pointerByArea.has(area.id) ? pointerByArea.get(area.id)! : area.lastAutoAssignedUserId;
      const lastIndex = candidates.findIndex((u) => u.id === currentPointer);
      const startIndex = lastIndex === -1 ? 0 : (lastIndex + 1) % candidates.length;
      let winner: User | undefined;
      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[(startIndex + i) % candidates.length];
        const limit = candidate.activePoolLimit;
        if (limit !== null && limit !== undefined) {
          const activeCount = customersList.filter((other) =>
            (other.assignedToUserId === candidate.id && other.pool1 === "ACTIVE") ||
            (other.assignedToUserId2 === candidate.id && other.pool2 === "ACTIVE") ||
            (other.assignedToUserId3 === candidate.id && other.pool3 === "ACTIVE")
          ).length + (extraAssignedCount.get(candidate.id) ?? 0);
          if (activeCount >= limit) continue;
        }
        winner = candidate;
        break;
      }
      if (!winner) continue;
      const winnerId = winner.id;
      pointerByArea.set(area.id, winnerId);
      extraAssignedCount.set(winnerId, (extraAssignedCount.get(winnerId) ?? 0) + 1);
      setCustomers((prev) =>
        prev.map((row) => (row.id === c.id ? { ...row, assignedToUserId2: winnerId, pool2: "ACTIVE", pool2Since: null, stage2Id: defaultStage?.id ?? null } : row))
      );
      supabase.from("customers").update({ assigned_to_2: winnerId, pool_2: "ACTIVE", pool_2_since: null, stage_2: defaultStage?.id ?? null }).eq("id", c.id).then(() => {});
      setAreas((prev) => prev.map((a) => (a.id === area.id ? { ...a, lastAutoAssignedUserId: winnerId } : a)));
      supabase.from("areas").update({ last_auto_assigned_user_id: winnerId }).eq("id", area.id).then(() => {});
      logAssignmentEvent(c.id, winnerId, 2);
    }
  }
```

- [ ] **Step 8: Update both call sites**

There are two identical calls — one in the initial-load `useEffect`, one in `login()`. Find (it appears twice, search for `sweepAutoSecondAssign(loadedCustomers`):

```ts
sweepAutoSecondAssign(loadedCustomers, loadResults[2], loadResults[0], loadedUsers, loadResults[16], loadedActivities, profile.role === "ADMIN");
```

Replace **both** occurrences with (drops the `loadResults[0]` teams argument — `loadResults[2]` is `loadAreas()`'s result, `loadResults[16]` is `loadStages()`'s result, unchanged):

```ts
sweepAutoSecondAssign(loadedCustomers, loadResults[2], loadedUsers, loadResults[16], loadedActivities, profile.role === "ADMIN");
```

- [ ] **Step 9: Type-check**

Run:

```bash
npm run build
```

Expected: build fails here with errors in every file still reading `Area.teamId`/`updateAreaTeam` (Task 3 and Task 4 files) — confirm the *only* errors are in `app/(dashboard)/admin/area/page.tsx`, `components/AgentLogBrowser.tsx`, `components/RemovalApprovalsBrowser.tsx`, `components/InactiveListingsBrowser.tsx`, `app/(dashboard)/customers/[id]/page.tsx`, `app/(dashboard)/customers/page.tsx`, `app/(dashboard)/dashboard/page.tsx`, `app/(dashboard)/team/agent-logs/page.tsx` — i.e. `lib/types.ts` and `lib/store.tsx` themselves are clean. Those remaining errors are resolved in Tasks 3 and 4.

- [ ] **Step 10: Commit**

```bash
git add lib/types.ts lib/store.tsx
git commit -m "Area/Team: teamIds many-to-many, loadAreas join, addAreaTeam/removeAreaTeam, area-scoped auto-assign sweep

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Admin UI — multi-team management on `/admin/area`

**Files:**
- Modify: `app/(dashboard)/admin/area/page.tsx`

**Interfaces:**
- Consumes: `teams: Team[]`, `addAreaTeam`, `removeAreaTeam` from `useStore()` (Task 2), `Area.teamIds: string[]`.
- Produces: nothing consumed elsewhere — self-contained.

- [ ] **Step 1: Swap the store destructure**

Find:

```tsx
  const { areas, subAreas, teams, addArea, updateArea, updateAreaTeam, updateAreaAutoAssign, deleteArea, addSubArea, updateSubArea, deleteSubArea, previewAreaCsv, confirmAreaCsvImport } = useStore();
```

Replace with:

```tsx
  const { areas, subAreas, teams, addArea, updateArea, addAreaTeam, removeAreaTeam, updateAreaAutoAssign, deleteArea, addSubArea, updateSubArea, deleteSubArea, previewAreaCsv, confirmAreaCsvImport } = useStore();
```

- [ ] **Step 2: Add `newTeamId` state and `handleAddAreaTeam`**

Find:

```tsx
  const [newSubAreaName, setNewSubAreaName] = useState("");
```

Add right after it:

```tsx
  const [newSubAreaName, setNewSubAreaName] = useState("");
  const [newTeamId, setNewTeamId] = useState("");
```

Find `handleAddSubArea`:

```tsx
  function handleAddSubArea(areaId: string) {
    if (!newSubAreaName.trim()) return;
    addSubArea(areaId, newSubAreaName.trim());
    setNewSubAreaName("");
  }
```

Add a sibling right after it:

```tsx
  function handleAddSubArea(areaId: string) {
    if (!newSubAreaName.trim()) return;
    addSubArea(areaId, newSubAreaName.trim());
    setNewSubAreaName("");
  }

  function handleAddAreaTeam(areaId: string) {
    if (!newTeamId) return;
    addAreaTeam(areaId, newTeamId);
    setNewTeamId("");
  }
```

- [ ] **Step 3: Collapsed row — show linked team names instead of a dropdown**

Find:

```tsx
                <div>
                  <select
                    className="field-input"
                    style={{ width: "auto" }}
                    value={a.teamId ?? ""}
                    onChange={(e) => updateAreaTeam(a.id, e.target.value || null)}
                  >
                    <option value="">—</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
```

Replace with:

```tsx
                <div style={{ color: "#6b7280" }}>
                  {a.teamIds.length > 0 ? a.teamIds.map((id) => teams.find((t) => t.id === id)?.name ?? "—").join(", ") : "—"}
                </div>
```

- [ ] **Step 4: Expanded row — add a Teams list/add/remove block above the sub-areas**

Find the start of the expanded block:

```tsx
              {expanded && (
                <div style={{ padding: "0 20px 16px 40px" }}>
                  {rows.map((s) => (
```

Replace with (inserts a "Teams" section, same list/Remove + select/Add-button pattern `admin/teams/page.tsx` already uses for members, before the existing sub-areas list):

```tsx
              {expanded && (
                <div style={{ padding: "0 20px 16px 40px" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 6 }}>Teams</div>
                  {a.teamIds.length === 0 && <div style={{ fontSize: 13, color: "#9aa0ab", padding: "6px 0" }}>No teams linked.</div>}
                  {a.teamIds.map((teamId) => (
                    <div key={teamId} style={{ display: "flex", alignItems: "center", gap: 14, padding: "6px 0", fontSize: 13 }}>
                      <span style={{ color: "#374151" }}>{teams.find((t) => t.id === teamId)?.name ?? "—"}</span>
                      <span style={{ color: "#a13a2b", cursor: "pointer" }} onClick={() => removeAreaTeam(a.id, teamId)}>Remove</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 18 }}>
                    <select
                      className="field-input"
                      style={{ flex: "1 1 240px" }}
                      value={newTeamId}
                      onChange={(e) => setNewTeamId(e.target.value)}
                    >
                      <option value="">— Select team —</option>
                      {teams.filter((t) => !a.teamIds.includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <button className="btn btn-outline" type="button" onClick={() => handleAddAreaTeam(a.id)}>+ Add team</button>
                  </div>

                  {rows.map((s) => (
```

(The rest of the expanded block — sub-area rows and the "+ Add" sub-area form — is unchanged; this only inserts new JSX before it.)

- [ ] **Step 5: Type-check**

Run:

```bash
npm run build
```

Expected: no errors remaining in `app/(dashboard)/admin/area/page.tsx`. Errors may remain in the Task 4 files — that's expected until Task 4 is done.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/admin/area/page.tsx"
git commit -m "Admin Area page: multi-team link/unlink per area

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Update remaining `Area.teamId` call sites

**Files:**
- Modify: `components/AgentLogBrowser.tsx`
- Modify: `components/RemovalApprovalsBrowser.tsx`
- Modify: `components/InactiveListingsBrowser.tsx`
- Modify: `app/(dashboard)/customers/[id]/page.tsx`
- Modify: `app/(dashboard)/customers/page.tsx`
- Modify: `app/(dashboard)/dashboard/page.tsx`
- Modify: `app/(dashboard)/team/agent-logs/page.tsx`

**Interfaces:**
- Consumes: `Area.teamIds: string[]` (Task 2). No new interfaces produced — every change here is a self-contained one-line filter/lookup swap, each file already compiles independently of the others, so this is one task covering all seven mechanical edits rather than seven separate task gates.

- [ ] **Step 1: `components/AgentLogBrowser.tsx`**

Find:

```tsx
  // Narrow the Agent dropdown to the selected area's own team once an area
  // is picked -- an area belongs to one team (area.teamId), same link the
  // rest of the app uses to scope assignee candidates to an area's team.
  const selectedAreaTeamId = areaId ? filterAreas.find((a) => a.id === areaId)?.teamId ?? null : null;
  const areaAgents = selectedAreaTeamId ? agents.filter((a) => a.teamId === selectedAreaTeamId) : agents;
```

Replace with:

```tsx
  // Narrow the Agent dropdown to the selected area's own team(s) once an
  // area is picked -- an area can belong to multiple teams (area.teamIds),
  // same link the rest of the app uses to scope assignee candidates to an
  // area's team(s).
  const selectedAreaTeamIds = areaId ? filterAreas.find((a) => a.id === areaId)?.teamIds ?? [] : [];
  const areaAgents = selectedAreaTeamIds.length > 0 ? agents.filter((a) => !!a.teamId && selectedAreaTeamIds.includes(a.teamId)) : agents;
```

- [ ] **Step 2: `components/RemovalApprovalsBrowser.tsx`**

Find:

```tsx
  // Admin picks from every area; a manager's dropdown is scoped to only the
  // areas their own team owns (same area<->team link the assignee-scoping
  // sweep uses), since that's the slice of the company they're responsible for.
  const areaOptions = currentUser?.role === "MANAGER" ? areas.filter((a) => a.teamId === currentUser.teamId) : areas;
```

Replace with:

```tsx
  // Admin picks from every area; a manager's dropdown is scoped to only the
  // areas their own team owns (same area<->team link the assignee-scoping
  // sweep uses), since that's the slice of the company they're responsible for.
  const areaOptions = currentUser?.role === "MANAGER" ? areas.filter((a) => !!currentUser.teamId && a.teamIds.includes(currentUser.teamId)) : areas;
```

- [ ] **Step 3: `components/InactiveListingsBrowser.tsx`**

Find:

```tsx
  // Manager's dropdowns are scoped to their own team, same as
  // RemovalApprovalsBrowser's Area filter.
  const areaOptions = currentUser?.role === "MANAGER" ? areas.filter((a) => a.teamId === currentUser.teamId) : areas;
```

Replace with:

```tsx
  // Manager's dropdowns are scoped to their own team, same as
  // RemovalApprovalsBrowser's Area filter.
  const areaOptions = currentUser?.role === "MANAGER" ? areas.filter((a) => !!currentUser.teamId && a.teamIds.includes(currentUser.teamId)) : areas;
```

(The `memberOptions` line right below it filters `User.teamId` against `currentUser.teamId` — both still single-valued — leave that line untouched.)

- [ ] **Step 4: `app/(dashboard)/customers/[id]/page.tsx`**

Find:

```tsx
              // scoped to the team that owns the customer's area — ADMIN excluded (doesn't
              // do sales), applies the same way whether an ADMIN or a MANAGER is reassigning.
              // No team on the area yet? No candidates — set it on /admin/area first.
              const areaTeamId = areas.find((a) => a.id === customer.areaId)?.teamId;
              const scopedOptions = users.filter((u) =>
                u.active
                && !otherCurrent.includes(u.id)
                && u.role !== "ADMIN"
                && !!areaTeamId
                && u.teamId === areaTeamId
              );
```

Replace with:

```tsx
              // scoped to the team(s) that own the customer's area — ADMIN excluded (doesn't
              // do sales), applies the same way whether an ADMIN or a MANAGER is reassigning.
              // No team on the area yet? No candidates — set it on /admin/area first.
              const areaTeamIds = areas.find((a) => a.id === customer.areaId)?.teamIds ?? [];
              const scopedOptions = users.filter((u) =>
                u.active
                && !otherCurrent.includes(u.id)
                && u.role !== "ADMIN"
                && !!u.teamId
                && areaTeamIds.includes(u.teamId)
              );
```

- [ ] **Step 5: `app/(dashboard)/customers/page.tsx`**

Find:

```tsx
  // each assignee dropdown excludes whoever is already picked in the other two slots,
  // and is scoped to the team that owns the selected area (ADMIN excluded — doesn't do sales).
  // No team on the area yet? No candidates — set it on /admin/area first.
  function assigneeOptions(excluding: string[]) {
    const teamId = areas.find((a) => a.id === areaId)?.teamId;
    if (!teamId) return [];
    return activeUsers.filter((u) => u.role !== "ADMIN" && u.teamId === teamId && !excluding.includes(u.id));
  }
```

Replace with:

```tsx
  // each assignee dropdown excludes whoever is already picked in the other two slots,
  // and is scoped to the team(s) that own the selected area (ADMIN excluded — doesn't do sales).
  // No team on the area yet? No candidates — set it on /admin/area first.
  function assigneeOptions(excluding: string[]) {
    const teamIds = areas.find((a) => a.id === areaId)?.teamIds ?? [];
    if (teamIds.length === 0) return [];
    return activeUsers.filter((u) => u.role !== "ADMIN" && !!u.teamId && teamIds.includes(u.teamId) && !excluding.includes(u.id));
  }
```

- [ ] **Step 6: `app/(dashboard)/dashboard/page.tsx`**

Find:

```tsx
  // ADMIN picks from every area; MANAGER only from areas admin has assigned
  // to their team (Area.teamId) — zero assigned areas means no dropdown at
  // all, since there's nothing to narrow down to. SP never gets one — they
  // only ever see their own scope regardless of area.
  const availableAreas = currentUser.role === "ADMIN" ? areas : areas.filter((a) => a.teamId === currentUser.teamId);
```

Replace with:

```tsx
  // ADMIN picks from every area; MANAGER only from areas admin has assigned
  // to their team (Area.teamIds) — zero assigned areas means no dropdown at
  // all, since there's nothing to narrow down to. SP never gets one — they
  // only ever see their own scope regardless of area.
  const availableAreas = currentUser.role === "ADMIN" ? areas : areas.filter((a) => !!currentUser.teamId && a.teamIds.includes(currentUser.teamId));
```

- [ ] **Step 7: `app/(dashboard)/team/agent-logs/page.tsx`**

Find:

```tsx
  const agents = users.filter((u) => u.role === "SALESPERSON" && u.teamId === currentUser?.teamId);
  const teamAreas = areas.filter((a) => a.teamId === currentUser?.teamId);
```

Replace with (the `agents` line compares two `User.teamId`s, both still single-valued — only `teamAreas` changes):

```tsx
  const agents = users.filter((u) => u.role === "SALESPERSON" && u.teamId === currentUser?.teamId);
  const teamAreas = areas.filter((a) => !!currentUser?.teamId && a.teamIds.includes(currentUser.teamId));
```

- [ ] **Step 8: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, zero TypeScript errors anywhere in the project.

- [ ] **Step 9: Commit**

```bash
git add components/AgentLogBrowser.tsx components/RemovalApprovalsBrowser.tsx components/InactiveListingsBrowser.tsx "app/(dashboard)/customers/[id]/page.tsx" app/(dashboard)/customers/page.tsx app/(dashboard)/dashboard/page.tsx app/(dashboard)/team/agent-logs/page.tsx
git commit -m "Update remaining Area.teamId call sites to Area.teamIds

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Manual verification

**Files:** none (verification only — no code changes).

- [ ] **Step 1: Run the Supabase migration**

In the Supabase SQL editor, run the commented block appended in Task 1, Step 7 (the whole block between the `-- Migration: Area <-> Team many-to-many` header and the end of file), uncommented — i.e. execute each `create table` / `create policy` / `insert into` / `alter table ... drop column` statement in order. Confirm no errors.

- [ ] **Step 2: Start the dev server and log in as ADMIN**

```bash
npm run dev
```

On `/admin/area`: link one existing area to two different teams using the new Teams block (Step 4 of Task 3). Confirm both teams show up under that area, each removable independently, reload the page and confirm the links persisted.

- [ ] **Step 3: Verify the auto second-assignment pool spans both teams**

Create a customer in that two-team area with only slot 1 assigned (to someone not on either of the two teams). Backdate `created_at` by 8+ days in Supabase (or wait), reload as ADMIN — confirm slot 2 gets auto-filled with an active salesperson from *either* of the two linked teams. Create a second such customer in the same area, backdate it too, reload — confirm the *next* person in the combined rotation gets it (not a repeat, and not scoped to only one of the two teams).

- [ ] **Step 4: Verify manager-side scoping picks up both teams**

Log in as a MANAGER of one of the two teams linked to that area. Confirm the area now appears in their Area filter on the Dashboard, Agent Log (`/team/agent-logs`), and Removal Approvals pages. Confirm a customer in that area shows candidates from both linked teams in the assignee/reassign dropdowns (`/customers` new-customer form and `/customers/[id]` reassign dropdowns) — not just their own team.

- [ ] **Step 5: Regression — single-team area and `admin/teams` member management**

Confirm an area still linked to only one team behaves exactly as before (single team shown, single team's candidates only). On `/admin/teams`, add/remove a member from a team and confirm it has no effect on that team's linked areas (area↔team links are managed only from `/admin/area` now).

- [ ] **Step 6: Confirm an area with no linked team never auto-assigns**

Create/pick an area with zero linked teams, put a slot-1-only customer in it, backdate `created_at`, reload as ADMIN — confirm slot 2 stays empty.
