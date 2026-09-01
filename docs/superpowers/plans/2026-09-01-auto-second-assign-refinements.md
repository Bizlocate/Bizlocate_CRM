# Auto Second-Assignment Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-area auto-assign on/off switch, widen the 2nd-assignment wait from 3 to 7 days, and gate that 7-day window on pipeline stage — a customer whose slot-1 stage is flagged "appointment/nego" waits instead for 14 idle days (no activity log) before getting its one-time 2nd-assignment.

**Architecture:** Two new nullable-default columns (`areas.auto_assign_enabled`, `pipeline_stages.exclude_from_auto_assign`), both admin-toggleable from existing admin pages. `sweepAutoSecondAssign` in `lib/store.tsx` (the existing compute-on-load sweep) gets an area-enabled check and a dual timing gate (7-day createdAt vs. 14-day-idle, chosen by the customer's slot-1 stage flag); it gains an `activitiesList` parameter to compute the idle gate, reusing the exact "last touched" formula the existing 60-day `sweepStalePool` already uses. Round-robin/candidate/pool-limit logic is untouched — it already persists its pointer in the DB and needs no fix (confirmed with requester).

**Tech Stack:** Next.js App Router, React client component, TypeScript, Supabase (`@supabase/ssr` client via `createClient()`), existing `useStore()` context in `lib/store.tsx`. No test framework in this repo — verify via `npm run build` (type-check) plus manual click-through in the browser preview.

## Global Constraints

- Match existing code style exactly: inline `style={{...}}` objects, `.field-input`/`.card` classes, fire-and-forget `.then(() => {})` on writes, no new dependencies.
- `sweepAutoSecondAssign` must keep operating only on the snapshot arrays passed into it and functional `setState` updaters — never the closure `customers`/`teams`/etc. state (same discipline the function already follows; see its existing comment block in `lib/store.tsx`).
- Every customer gets at most one 2nd-assignment via exactly one of two mutually exclusive paths (already guaranteed by the existing "skip if `assignedToUserId2` is set" check at the top of the loop — do not weaken it).
- Design reference: [`docs/superpowers/specs/2026-09-01-auto-second-assign-refinements-design.md`](../specs/2026-09-01-auto-second-assign-refinements-design.md).

---

### Task 1: Schema — `areas.auto_assign_enabled` + `pipeline_stages.exclude_from_auto_assign`

**Files:**
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: columns `areas.auto_assign_enabled` (default `true`), `pipeline_stages.exclude_from_auto_assign` (default `false`).

- [ ] **Step 1: Add both columns to the main schema**

In `supabase/schema.sql`, find `create table pipeline_stages (...)` (around line 56) and add `exclude_from_auto_assign` as its last column:

```sql
create table pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  "order" int not null,
  is_default boolean not null default false,
  requires_amount boolean not null default false,
  exclude_from_auto_assign boolean not null default false
);
```

Find `create table areas (...)` (around line 64) and add `auto_assign_enabled` as its last column:

```sql
create table areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  team_id uuid references teams (id) on delete set null,
  auto_assign_enabled boolean not null default true
);
```

- [ ] **Step 2: No RLS changes needed**

`areas_update_admin` and `pipeline_stages_update_admin` (search for both names in `supabase/schema.sql`) are blanket admin-only update policies already covering every column on their tables, including the two new ones. Confirm both policies exist as described and do not add anything new for this step.

- [ ] **Step 3: Append the already-provisioned-database migration note**

At the very end of `supabase/schema.sql` (after the existing `-- alter table customers add column if not exists optional_phone text;` migration note), append:

```sql

-- ============================================================
-- Migration: Auto second-assignment refinements — area on/off switch,
-- stage-gated timing. Run once against an already-provisioned database
-- (everything below already exists in the main schema above for fresh
-- installs).
-- ============================================================
--
-- alter table areas add column if not exists auto_assign_enabled boolean not null default true;
-- alter table pipeline_stages add column if not exists exclude_from_auto_assign boolean not null default false;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "Schema: add areas.auto_assign_enabled + pipeline_stages.exclude_from_auto_assign

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Types + Store — mapping and new update methods

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/store.tsx`

**Interfaces:**
- Consumes: existing `Area`/`Stage` interfaces and `mapArea`/`mapStage` functions.
- Produces: `Area.autoAssignEnabled: boolean`, `Stage.excludeFromAutoAssign: boolean`, `updateAreaAutoAssign: (id: string, enabled: boolean) => void` (new `Store` method), `updateStageExcludeFromAutoAssign: (id: string, excluded: boolean) => void` (new `Store` method).

- [ ] **Step 1: Add `autoAssignEnabled` to `Area`, `excludeFromAutoAssign` to `Stage`**

In `lib/types.ts`, find the `Area` interface (currently `{ id: string; name: string; teamId: string | null; }`) and add the new field:

```ts
export interface Area {
  id: string;
  name: string;
  teamId: string | null;
  autoAssignEnabled: boolean;
}
```

Find the `Stage` interface (currently `{ id: string; name: string; order: number; isDefault: boolean; requiresAmount: boolean; }`) and add the new field:

```ts
export interface Stage {
  id: string;
  name: string;
  order: number;
  isDefault: boolean;
  requiresAmount: boolean;
  excludeFromAutoAssign: boolean;
}
```

- [ ] **Step 2: Update `mapArea` to read `auto_assign_enabled`**

In `lib/store.tsx`, replace:

```ts
function mapArea(row: { id: string; name: string; team_id: string | null }): Area {
  return { id: row.id, name: row.name, teamId: row.team_id };
}
```

with:

```ts
function mapArea(row: { id: string; name: string; team_id: string | null; auto_assign_enabled: boolean }): Area {
  return { id: row.id, name: row.name, teamId: row.team_id, autoAssignEnabled: row.auto_assign_enabled };
}
```

- [ ] **Step 3: Update `mapStage` to read `exclude_from_auto_assign`**

Replace:

```ts
function mapStage(row: { id: string; name: string; order: number; is_default: boolean; requires_amount: boolean }): Stage {
  return { id: row.id, name: row.name, order: row.order, isDefault: row.is_default, requiresAmount: row.requires_amount };
}
```

with:

```ts
function mapStage(row: { id: string; name: string; order: number; is_default: boolean; requires_amount: boolean; exclude_from_auto_assign: boolean }): Stage {
  return { id: row.id, name: row.name, order: row.order, isDefault: row.is_default, requiresAmount: row.requires_amount, excludeFromAutoAssign: row.exclude_from_auto_assign };
}
```

- [ ] **Step 4: Add `updateAreaAutoAssign`**

Right after the existing `updateAreaTeam` function in `lib/store.tsx` (search for `function updateAreaTeam`), add a sibling function, same optimistic-update-with-rollback style:

```ts
  function updateAreaAutoAssign(id: string, enabled: boolean) {
    const target = areas.find((a) => a.id === id);
    if (!target) return;
    const prevEnabled = target.autoAssignEnabled;
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, autoAssignEnabled: enabled } : a)));
    const supabase = createClient();
    supabase
      .from("areas")
      .update({ auto_assign_enabled: enabled })
      .eq("id", id)
      .then(({ error }) => {
        if (error) setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, autoAssignEnabled: prevEnabled } : a)));
      });
  }
```

- [ ] **Step 5: Add `updateStageExcludeFromAutoAssign`**

Right after the existing `updateStageRequiresAmount` function (search for `function updateStageRequiresAmount`), add a sibling function, same plain (no-rollback) style:

```ts
  function updateStageExcludeFromAutoAssign(id: string, excluded: boolean) {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, excludeFromAutoAssign: excluded } : s)));
    const supabase = createClient();
    supabase.from("pipeline_stages").update({ exclude_from_auto_assign: excluded }).eq("id", id).then(() => {});
  }
```

- [ ] **Step 6: Add both new methods to the `Store` interface**

Find `addArea: (name: string) => void; updateArea: (id: string, name: string) => void; updateAreaTeam: (id: string, teamId: string | null) => void;` and add the new method right after `updateAreaTeam`:

```ts
  addArea: (name: string) => void;
  updateArea: (id: string, name: string) => void;
  updateAreaTeam: (id: string, teamId: string | null) => void;
  updateAreaAutoAssign: (id: string, enabled: boolean) => void;
```

Find `updateStageRequiresAmount: (id: string, requiresAmount: boolean) => void;` and add the new method right after it:

```ts
  updateStageRequiresAmount: (id: string, requiresAmount: boolean) => void;
  updateStageExcludeFromAutoAssign: (id: string, excluded: boolean) => void;
```

- [ ] **Step 7: Add both new methods to the `const value: Store = { ... }` object**

Find `addArea, updateArea, updateAreaTeam,` and add the new method right after it:

```ts
    addArea,
    updateArea,
    updateAreaTeam,
    updateAreaAutoAssign,
```

Find `updateStageRequiresAmount,` and add the new method right after it:

```ts
    updateStageRequiresAmount,
    updateStageExcludeFromAutoAssign,
```

- [ ] **Step 8: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors. (`sweepAutoSecondAssign`'s call sites still pass the old 6-arg signature at this point — Task 3 changes that — so this step only validates Tasks 1–2's own additions compile.)

- [ ] **Step 9: Commit**

```bash
git add lib/types.ts lib/store.tsx
git commit -m "Add Area.autoAssignEnabled/Stage.excludeFromAutoAssign + their update methods

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Sweep logic — area switch + 7-day/14-day stage-gated timing

**Files:**
- Modify: `lib/store.tsx`

**Interfaces:**
- Consumes: `Area.autoAssignEnabled`, `Stage.excludeFromAutoAssign` (Task 2), existing `Activity` fields (`customerId`, `authorUserId`, `createdAt`), existing `Customer.pool1Since`.
- Produces: `sweepAutoSecondAssign` now takes an `activitiesList: Activity[]` parameter (new 6th positional arg, before `isAdmin`).

- [ ] **Step 1: Add the area-enabled check and replace the single 3-day gate with the stage-gated dual timing check**

In `lib/store.tsx`, find the full `sweepAutoSecondAssign` function (search for `function sweepAutoSecondAssign`). Replace its signature line and the two lines immediately below the function's opening (`if (!isAdmin) return;` through `const supabase = createClient();`):

```ts
  function sweepAutoSecondAssign(customersList: Customer[], areasList: Area[], teamsList: Team[], usersList: User[], stagesList: Stage[], isAdmin: boolean) {
    if (!isAdmin) return;
    const defaultStage = stagesList.find((s) => s.isDefault) ?? stagesList[0];
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const supabase = createClient();
```

with:

```ts
  function sweepAutoSecondAssign(customersList: Customer[], areasList: Area[], teamsList: Team[], usersList: User[], stagesList: Stage[], activitiesList: Activity[], isAdmin: boolean) {
    if (!isAdmin) return;
    const defaultStage = stagesList.find((s) => s.isDefault) ?? stagesList[0];
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const supabase = createClient();
```

Then find the trigger-conditions block right after the `pointerByTeam`/`extraAssignedCount` declarations:

```ts
    for (const c of customersList) {
      if (c.assignedToUserId2 || !c.assignedToUserId || !c.areaId) continue;
      if (now - new Date(c.createdAt).getTime() < THREE_DAYS_MS) continue;
      const area = areasList.find((a) => a.id === c.areaId);
      if (!area?.teamId) continue;
      const team = teamsList.find((t) => t.id === area.teamId);
      if (!team) continue;
```

Replace with:

```ts
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
```

(The area check moved above the team lookup and now also requires `area.autoAssignEnabled`; the old flat 3-day check is replaced by the stage-gated branch, placed after `team` is resolved since it doesn't depend on `team` but reads more naturally grouped with the other per-customer gates before candidate-pool computation.)

- [ ] **Step 2: Update both call sites to pass `activitiesList`**

In the initial-load `useEffect` (search for `sweepAutoSecondAssign(loadedCustomers, loadResults[2], loadResults[0], loadedUsers, loadResults[16], profile.role === "ADMIN");`), replace with:

```ts
          sweepAutoSecondAssign(loadedCustomers, loadResults[2], loadResults[0], loadedUsers, loadResults[16], loadedActivities, profile.role === "ADMIN");
```

In `login()` (search for the second occurrence of the same call), replace with:

```ts
    sweepAutoSecondAssign(loadedCustomers, loadResults[2], loadResults[0], loadedUsers, loadResults[16], loadedActivities, profile.role === "ADMIN");
```

- [ ] **Step 3: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add lib/store.tsx
git commit -m "sweepAutoSecondAssign: area on/off switch, 7-day/14-day-idle stage-gated timing

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: UI — Auto Assign toggle on `/admin/area`

**Files:**
- Modify: `app/(dashboard)/admin/area/page.tsx`

**Interfaces:**
- Consumes: `updateAreaAutoAssign` from `useStore()` (Task 2), `Area.autoAssignEnabled` (Task 2).

- [ ] **Step 1: Destructure `updateAreaAutoAssign`**

Change the `useStore()` destructure (currently `const { areas, subAreas, teams, addArea, updateArea, updateAreaTeam, deleteArea, addSubArea, updateSubArea, deleteSubArea, previewAreaCsv, confirmAreaCsvImport } = useStore();`):

```tsx
  const { areas, subAreas, teams, addArea, updateArea, updateAreaTeam, updateAreaAutoAssign, deleteArea, addSubArea, updateSubArea, deleteSubArea, previewAreaCsv, confirmAreaCsvImport } = useStore();
```

- [ ] **Step 2: Add an "Auto Assign" column to the list header**

Replace:

```tsx
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", padding: "12px 20px", background: "#f7f7f8", borderBottom: "1px solid #e2e4e9", fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".03em" }}>
          <div>Area</div><div>Sub-Areas</div><div>Team</div>
        </div>
```

with:

```tsx
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "12px 20px", background: "#f7f7f8", borderBottom: "1px solid #e2e4e9", fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".03em" }}>
          <div>Area</div><div>Sub-Areas</div><div>Team</div><div>Auto Assign</div>
        </div>
```

- [ ] **Step 3: Add the Auto Assign checkbox to each area row**

Replace:

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

with:

```tsx
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "14px 20px", alignItems: "center", fontSize: 13.5 }}>
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
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#6b7280" }}>
                    <input type="checkbox" checked={a.autoAssignEnabled} onChange={(e) => updateAreaAutoAssign(a.id, e.target.checked)} />
                    On
                  </label>
                </div>
              </div>
```

- [ ] **Step 4: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/admin/area/page.tsx"
git commit -m "Admin Area page: add Auto Assign on/off toggle per area

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: UI — "Skip auto-assign" checkbox on `/admin/stages`

**Files:**
- Modify: `app/(dashboard)/admin/stages/page.tsx`

**Interfaces:**
- Consumes: `updateStageExcludeFromAutoAssign` from `useStore()` (Task 2), `Stage.excludeFromAutoAssign` (Task 2).

- [ ] **Step 1: Destructure `updateStageExcludeFromAutoAssign`**

Change the `useStore()` destructure (currently `const { stages, addStage, renameStage, moveStage, deleteStage, updateStageRequiresAmount } = useStore();`):

```tsx
  const { stages, addStage, renameStage, moveStage, deleteStage, updateStageRequiresAmount, updateStageExcludeFromAutoAssign } = useStore();
```

- [ ] **Step 2: Add the "Skip auto-assign" checkbox next to "Requires closed amount"**

Replace:

```tsx
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#6b7280", marginLeft: 8 }}>
                <input
                  type="checkbox"
                  checked={s.requiresAmount}
                  onChange={(e) => updateStageRequiresAmount(s.id, e.target.checked)}
                />
                Requires closed amount
              </label>
```

with:

```tsx
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#6b7280", marginLeft: 8 }}>
                <input
                  type="checkbox"
                  checked={s.requiresAmount}
                  onChange={(e) => updateStageRequiresAmount(s.id, e.target.checked)}
                />
                Requires closed amount
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#6b7280" }}>
                <input
                  type="checkbox"
                  checked={s.excludeFromAutoAssign}
                  onChange={(e) => updateStageExcludeFromAutoAssign(s.id, e.target.checked)}
                />
                Skip auto-assign (e.g. Appointment/Nego)
              </label>
```

- [ ] **Step 3: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 4: Manual verification**

Using the browser preview (`npm run dev`), as ADMIN:
1. Go to `/admin/area` — confirm a new "Auto Assign" column appears, checked by default for every existing area. Uncheck it for one area, reload, confirm it stays unchecked.
2. Go to `/admin/stages` — confirm a new "Skip auto-assign (e.g. Appointment/Nego)" checkbox appears per stage, unchecked by default. Check it for a stage (e.g. "Negotiation"), reload, confirm it stays checked.
3. Create a customer in an area with Auto Assign **off**, assign only slot 1, wait past 7 days (or backdate `created_at`) — confirm slot 2 never fills while the switch stays off; turn it back on, reload as ADMIN — confirm slot 2 fills on the next load.
4. Create a customer in an area with Auto Assign **on**, assign only slot 1 with a stage that is **not** flagged "skip auto-assign" — backdate `created_at` to 8 days ago, reload as ADMIN — confirm slot 2 fills (7-day path).
5. Create a second customer the same way, but set its slot-1 stage to one flagged "skip auto-assign" before the 7-day mark — confirm slot 2 does **not** fill at 7 days. Then either backdate that customer's `pool1_since` (and any of its `activities` rows authored by the slot-1 assignee) to 15+ days ago, or wait — reload as ADMIN — confirm slot 2 now fills (14-day-idle path).
6. Confirm neither path ever fires twice for the same customer (slot 2 stays put once filled), and round-robin still continues from the team's last pointer across sweeps (regression check — no code changed here).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/admin/stages/page.tsx"
git commit -m "Admin Stages page: add Skip auto-assign checkbox per stage

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
