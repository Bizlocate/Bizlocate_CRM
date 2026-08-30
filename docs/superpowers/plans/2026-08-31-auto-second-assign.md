# Auto Second-Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3 days after a customer is created (with slot 1 already assigned), auto-fill slot 2 once, round-robin from the active SALESPERSON members of the team that owns the customer's area. Admin sets which team owns each area on the existing `/admin/area` page.

**Architecture:** Two new nullable columns (`areas.team_id`, `teams.last_auto_assigned_user_id`) — no new tables, no RLS policy changes (existing admin-only blanket update policies on `areas`/`teams` already cover them). A new compute-on-load sweep function in `lib/store.tsx`, run only for ADMIN sessions, mirroring the existing 60-day pool sweep's shape and its "operate only on the snapshot arrays passed in, never the closure `customers`/`users` state" discipline — this sweep deliberately does **not** call the existing `reassignCustomer`/`assignmentError` functions, because both read `customers` from closure, which is still stale (often `[]`) at the exact point in the initial-load effect (and in `login()`) where this sweep must run.

**Tech Stack:** Next.js App Router, React client component, TypeScript, Supabase (`@supabase/ssr` client via `createClient()`), existing `useStore()` context in `lib/store.tsx`. No test framework in this repo — verify via `npm run build` (type-check) plus manual click-through in the browser preview.

## Global Constraints

- Candidate pool per team: `status === "ACTIVE"` (i.e. `User.active === true`), `role === "SALESPERSON"`, `teamId` equal to the team in question — ordered by `name` (tie-break `id`) for a stable, deterministic sequence.
- The auto-assign sweep only runs when the current session's role is `"ADMIN"` — mirrors `sweepStalePool`'s existing `isAdmin` branch. Non-admin sessions never attempt it.
- The sweep must never call `reassignCustomer` or `assignmentError` — both read the `customers` state variable from closure, which can be stale at the point this sweep runs. It operates only on the snapshot arrays passed into it (`customersList`, `areasList`, `teamsList`, `usersList`) and functional `setState` updaters (`setCustomers((prev) => ...)`, `setTeams((prev) => ...)`), exactly like `sweepStalePool` already does.
- Trigger conditions per customer: `assignedToUserId2` is null, `assignedToUserId` is set, `createdAt` is ≥ 3 days old, `areaId` resolves to an area with a `teamId` set, that team has a non-empty candidate pool once slot-1/slot-3 occupants are excluded.
- If the next-in-rotation candidate is at their `activePoolLimit` (same check `assignmentError` does: count that user's customers where the matching slot's pool is `"ACTIVE"`, compare to their `activePoolLimit`), try the next candidate in rotation order instead of failing the whole slot. Advance `teams.last_auto_assigned_user_id` only to whoever actually gets assigned.
- Match existing code style exactly: inline `style={{...}}` objects, `.field-input`/`.card` classes, fire-and-forget `.then(() => {})` on writes, no new dependencies.

---

### Task 1: Schema — `areas.team_id` + `teams.last_auto_assigned_user_id`

**Files:**
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: columns `areas.team_id`, `teams.last_auto_assigned_user_id`.

- [ ] **Step 1: Add both columns to the main schema**

In `supabase/schema.sql`, find `create table areas (...)` and add `team_id` as its last column before the closing `)`:

```sql
create table areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  team_id uuid references teams (id) on delete set null
);
```

Find `create table teams (...)` (it's defined *before* `profiles` in this file — `manager_id`'s comment notes its FK is added after `profiles` exists, to avoid a forward reference to a table that doesn't exist yet). `last_auto_assigned_user_id` has the exact same problem, so add it the same way: bare, no inline `references`:

```sql
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  manager_id uuid, -- fk added after profiles exists (circular ref)
  last_auto_assigned_user_id uuid -- fk added after profiles exists, same as manager_id
);
```

Then find the existing `alter table teams add constraint teams_manager_id_fkey foreign key (manager_id) references profiles (id) on delete set null;` (it runs right after `profiles` is created — search for `teams_manager_id_fkey`) and add a second constraint right after it, in the same `alter table teams` statement:

```sql
alter table teams
  add constraint teams_manager_id_fkey foreign key (manager_id) references profiles (id) on delete set null,
  add constraint teams_last_auto_assigned_user_id_fkey foreign key (last_auto_assigned_user_id) references profiles (id) on delete set null;
```

(This replaces the single-constraint version of that `alter table teams` statement with a two-constraint version — same statement, one more `add constraint` clause, comma-separated.)

- [ ] **Step 2: No RLS changes needed**

`areas_update_admin` (`create policy "areas_update_admin" on areas for update using (is_admin());`) and `teams_update_admin` (`create policy "teams_update_admin" on teams for update using (is_admin());`) are both blanket admin-only update policies already covering every column on their tables, including the two new ones. Confirm both policies exist as described and do not add anything new for this step.

- [ ] **Step 3: Append the already-provisioned-database migration note**

At the very end of `supabase/schema.sql`, append (fully `--`-commented, matching every other migration block in this file exactly):

```sql

-- ============================================================
-- Migration: Auto second-assignment — run once against an
-- already-provisioned database (everything below already exists in
-- the main schema above for fresh installs).
-- ============================================================
--
-- alter table areas add column if not exists team_id uuid references teams (id) on delete set null;
-- alter table teams add column if not exists last_auto_assigned_user_id uuid references profiles (id) on delete set null;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "Schema: add areas.team_id + teams.last_auto_assigned_user_id

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Types + Store — mapping, `updateAreaTeam`, the auto-assign sweep

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/store.tsx`

**Interfaces:**
- Consumes: existing `Customer` fields (`assignedToUserId`, `assignedToUserId2`, `assignedToUserId3`, `pool1`/`pool2`/`pool3`, `areaId`, `createdAt`), existing `User` fields (`active`, `role`, `teamId`, `activePoolLimit`), existing `createNotification` function.
- Produces: `Area.teamId: string | null`, `Team.lastAutoAssignedUserId: string | null`, `updateAreaTeam: (id: string, teamId: string | null) => void` (new `Store` method). The sweep itself is internal (not exposed on `Store` — it's invoked automatically on load/login, same as `sweepStalePool`).

Both files change together in this task — the type widening and the store code that satisfies it are introduced atomically, so `npm run build` stays green at every commit in this task (unlike splitting types and store into separate tasks, which would leave the build broken in between).

- [ ] **Step 1: Add `teamId` to `Area`, `lastAutoAssignedUserId` to `Team`**

In `lib/types.ts`, find the `Area` interface (currently `export interface Area { id: string; name: string; }`) and add the new field:

```ts
export interface Area {
  id: string;
  name: string;
  teamId: string | null;
}
```

Find the `Team` interface (currently `export interface Team { id: string; name: string; managerId: string | null; }`) and add the new field:

```ts
export interface Team {
  id: string;
  name: string;
  managerId: string | null;
  lastAutoAssignedUserId: string | null;
}
```

- [ ] **Step 2: Update `mapArea` to read `team_id`**

In `lib/store.tsx`, replace:

```ts
function mapArea(row: { id: string; name: string }): Area {
  return { id: row.id, name: row.name };
}
```

with:

```ts
function mapArea(row: { id: string; name: string; team_id: string | null }): Area {
  return { id: row.id, name: row.name, teamId: row.team_id };
}
```

- [ ] **Step 3: Update `mapTeam` to read `last_auto_assigned_user_id`**

Replace:

```ts
function mapTeam(row: { id: string; name: string; manager_id: string | null }): Team {
  return { id: row.id, name: row.name, managerId: row.manager_id };
}
```

with:

```ts
function mapTeam(row: { id: string; name: string; manager_id: string | null; last_auto_assigned_user_id: string | null }): Team {
  return { id: row.id, name: row.name, managerId: row.manager_id, lastAutoAssignedUserId: row.last_auto_assigned_user_id };
}
```

- [ ] **Step 4: Add `updateAreaTeam`**

Right after the existing `updateArea` function (search for `function updateArea(id: string, name: string)`), add a sibling function — mirroring `updateUserTeam`'s optimistic-update-with-rollback style (search for `function updateUserTeam` to see the pattern this follows):

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

- [ ] **Step 5: Add `updateAreaTeam` to the `Store` interface and the context value object**

In the `Store` interface, find `addArea: (name: string) => void; updateArea: (id: string, name: string) => void;` and add the new method right after `updateArea`:

```ts
  addArea: (name: string) => void;
  updateArea: (id: string, name: string) => void;
  updateAreaTeam: (id: string, teamId: string | null) => void;
```

In the `const value: Store = { ... }` object, find `addArea, updateArea,` and add it there too:

```ts
    addArea,
    updateArea,
    updateAreaTeam,
```

- [ ] **Step 6: Add the `sweepAutoSecondAssign` function**

Right after the existing `sweepStalePool` function (search for its closing brace — the function ends right before `async function loadTasks(): Promise<Task[]>`), add:

```ts
  // Auto second-assignment: 3 days after a customer is created (slot 1
  // already assigned), if slot 2 is still empty, round-robin the next
  // active SALESPERSON from the team that owns the customer's area into
  // slot 2. Deliberately does NOT call reassignCustomer/assignmentError —
  // both read `customers` from closure, which is still stale at the exact
  // point in the initial-load effect (and in login()) where this sweep
  // runs, before React has re-rendered with the freshly-loaded data.
  // Operates only on the snapshot arrays passed in and functional setState
  // updaters, same discipline sweepStalePool already follows.
  // Admin-only: teams' RLS only allows ADMIN to update
  // last_auto_assigned_user_id, so a non-admin session never attempts
  // this (mirrors sweepStalePool's own isAdmin branch).
  // ponytail: compute-on-load sweep, not real-time — same accepted
  // imprecision as the pool sweep. Upgrade to a cron/edge function sweep
  // if sub-day precision ever matters.
  function sweepAutoSecondAssign(customersList: Customer[], areasList: Area[], teamsList: Team[], usersList: User[], isAdmin: boolean) {
    if (!isAdmin) return;
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const supabase = createClient();
    for (const c of customersList) {
      if (c.assignedToUserId2 || !c.assignedToUserId || !c.areaId) continue;
      if (now - new Date(c.createdAt).getTime() < THREE_DAYS_MS) continue;
      const area = areasList.find((a) => a.id === c.areaId);
      if (!area?.teamId) continue;
      const team = teamsList.find((t) => t.id === area.teamId);
      if (!team) continue;
      const excluded = [c.assignedToUserId, c.assignedToUserId3].filter((id): id is string => !!id);
      const candidates = usersList
        .filter((u) => u.active && u.role === "SALESPERSON" && u.teamId === team.id && !excluded.includes(u.id))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      if (candidates.length === 0) continue;
      const lastIndex = candidates.findIndex((u) => u.id === team.lastAutoAssignedUserId);
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
          ).length;
          if (activeCount >= limit) continue;
        }
        winner = candidate;
        break;
      }
      if (!winner) continue;
      const winnerId = winner.id;
      const winnerName = winner.name;
      setCustomers((prev) =>
        prev.map((row) => (row.id === c.id ? { ...row, assignedToUserId2: winnerId, pool2: "ACTIVE", pool2Since: null } : row))
      );
      supabase.from("customers").update({ assigned_to_2: winnerId, pool_2: "ACTIVE", pool_2_since: null }).eq("id", c.id).then(() => {});
      setTeams((prev) => prev.map((t) => (t.id === team.id ? { ...t, lastAutoAssignedUserId: winnerId } : t)));
      supabase.from("teams").update({ last_auto_assigned_user_id: winnerId }).eq("id", team.id).then(() => {});
      createNotification(winnerId, `${winnerName} was assigned ${c.name}.`);
    }
  }
```

- [ ] **Step 7: Call the sweep in both load paths**

In the initial-load `useEffect` (search for `sweepStalePool(loadedCustomers, loadedActivities, profile.id, profile.role === "ADMIN");` inside the `useEffect`), add the new call right after it. This block also needs `loadedAreas`/`loadedTeams` pulled from the same `Promise.all` results array — `loadTeams()` is index `0` and `loadAreas()` is index `2` in that array (confirm by reading the `Promise.all([...])` list immediately above if it has shifted):

```ts
          sweepStalePool(loadedCustomers, loadedActivities, profile.id, profile.role === "ADMIN");
          sweepAutoSecondAssign(loadedCustomers, loadResults[2] as Area[], loadResults[0] as Team[], loadedUsers, profile.role === "ADMIN");
```

In `login()` (search for the second `sweepStalePool(loadedCustomers, loadedActivities, profile.id, profile.role === "ADMIN");` call, inside `login()`), add the equivalent call right after it:

```ts
    sweepStalePool(loadedCustomers, loadedActivities, profile.id, profile.role === "ADMIN");
    sweepAutoSecondAssign(loadedCustomers, loadResults[2] as Area[], loadResults[0] as Team[], loadedUsers, profile.role === "ADMIN");
```

(`loadResults[2]`/`loadResults[0]` are already typed as `Area[]`/`Team[]` by `Promise.all`'s inference over `[loadTeams(), loadUsers(), loadAreas(), ...]` — the `as Area[]`/`as Team[]` casts above are only needed if TypeScript widens the tuple to a union array in this particular `Promise.all` call; if the build passes without them, drop the casts for cleanliness.)

- [ ] **Step 8: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add lib/types.ts lib/store.tsx
git commit -m "Add Area.teamId/Team.lastAutoAssignedUserId, auto second-assignment sweep, updateAreaTeam

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: UI — Team dropdown on `/admin/area`

**Files:**
- Modify: `app/(dashboard)/admin/area/page.tsx`

**Interfaces:**
- Consumes: `teams: Team[]`, `updateAreaTeam` from `useStore()` (Task 2).
- Produces: nothing consumed elsewhere — self-contained.

- [ ] **Step 1: Destructure `teams` and `updateAreaTeam`**

Change the `useStore()` destructure (currently `const { areas, subAreas, addArea, updateArea, deleteArea, addSubArea, updateSubArea, deleteSubArea, previewAreaCsv, confirmAreaCsvImport } = useStore();`):

```tsx
  const { areas, subAreas, teams, addArea, updateArea, updateAreaTeam, deleteArea, addSubArea, updateSubArea, deleteSubArea, previewAreaCsv, confirmAreaCsvImport } = useStore();
```

- [ ] **Step 2: Add a "Team" column to the list header**

Replace:

```tsx
        <div style={{ display: "grid", gridTemplateColumns: "2.6fr 1fr", padding: "12px 20px", background: "#f7f7f8", borderBottom: "1px solid #e2e4e9", fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".03em" }}>
          <div>Area</div><div>Sub-Areas</div>
        </div>
```

with:

```tsx
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", padding: "12px 20px", background: "#f7f7f8", borderBottom: "1px solid #e2e4e9", fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".03em" }}>
          <div>Area</div><div>Sub-Areas</div><div>Team</div>
        </div>
```

- [ ] **Step 3: Add the Team dropdown to each area row**

Replace:

```tsx
              <div style={{ display: "grid", gridTemplateColumns: "2.6fr 1fr", padding: "14px 20px", alignItems: "center", fontSize: 13.5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  {editingAreaId === a.id ? (
                    <input className="field-input" style={{ flex: "1 1 200px" }} value={editingAreaName} onChange={(e) => setEditingAreaName(e.target.value)} onBlur={saveEditArea} autoFocus />
                  ) : (
                    <span style={{ fontWeight: 500, cursor: "pointer" }} onClick={() => setExpandedAreaId(expanded ? null : a.id)}>
                      {expanded ? "▾" : "▸"} {a.name}
                    </span>
                  )}
                  <span style={{ color: "#4046c9", fontWeight: 500, cursor: "pointer" }} onClick={() => startEditArea(a.id, a.name)}>Edit</span>
                  <span style={{ color: confirmDeleteAreaId === a.id ? "#a13a2b" : "#4046c9", fontWeight: 500, cursor: "pointer" }} onClick={() => handleDeleteArea(a.id)}>
                    {confirmDeleteAreaId === a.id ? "Confirm delete?" : "Delete"}
                  </span>
                </div>
                <div style={{ color: "#6b7280" }}>{rows.length}</div>
              </div>
```

with:

```tsx
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", padding: "14px 20px", alignItems: "center", fontSize: 13.5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  {editingAreaId === a.id ? (
                    <input className="field-input" style={{ flex: "1 1 200px" }} value={editingAreaName} onChange={(e) => setEditingAreaName(e.target.value)} onBlur={saveEditArea} autoFocus />
                  ) : (
                    <span style={{ fontWeight: 500, cursor: "pointer" }} onClick={() => setExpandedAreaId(expanded ? null : a.id)}>
                      {expanded ? "▾" : "▸"} {a.name}
                    </span>
                  )}
                  <span style={{ color: "#4046c9", fontWeight: 500, cursor: "pointer" }} onClick={() => startEditArea(a.id, a.name)}>Edit</span>
                  <span style={{ color: confirmDeleteAreaId === a.id ? "#a13a2b" : "#4046c9", fontWeight: 500, cursor: "pointer" }} onClick={() => handleDeleteArea(a.id)}>
                    {confirmDeleteAreaId === a.id ? "Confirm delete?" : "Delete"}
                  </span>
                </div>
                <div style={{ color: "#6b7280" }}>{rows.length}</div>
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
              </div>
```

- [ ] **Step 4: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 5: Manual verification**

Using the browser preview (`npm run dev`), as ADMIN:
1. Go to `/admin/area` — confirm a new "Team" column appears with a dropdown per area row, defaulting to "—".
2. Pick a team for an area, confirm it persists after a reload.
3. Create a customer in that area with only slot 1 assigned to some salesperson NOT on that team (so they're excluded only if they happen to also be a member — otherwise it doesn't matter). Manually backdate that customer's `created_at` in Supabase by 4 days (or wait), reload as ADMIN — confirm slot 2 gets filled with the team's first-in-order active salesperson.
4. Create a second customer in the same area, backdate it too, reload — confirm the *next* person in that team's order gets it (rotation advanced), and that the first customer's slot 2 is untouched on this later sweep (idempotent — it's already filled).
5. Log in as a SALESPERSON or MANAGER and confirm nothing changes for a pending customer in their own session (the sweep only runs for ADMIN) — it should still get picked up next time an ADMIN loads the app.
6. Set every candidate in a test team to be at their active-pool limit, confirm a pending customer in that team's area is skipped with no error; raise one person's limit and reload as ADMIN — confirm that customer now gets assigned.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/admin/area/page.tsx"
git commit -m "Admin Area page: add Team dropdown per area, feeds auto second-assignment

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
