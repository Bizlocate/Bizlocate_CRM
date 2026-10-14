# Auto-assign switches move to Teams

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto second-assign is controlled only from `/admin/teams`: one On/Off per team (default On) and one On/Off per salesperson beside their name in the team (default On). The per-area switch (`/admin/area`) and the per-user checkbox (`/admin/users`) are removed. A customer's area no longer matters to auto-assign.

**Architecture:** Two new columns on `teams` (`auto_assign_enabled` default true, `auto_assign_resumed_at` default epoch). `computeAutoSecondAssignPlan` reads the creating team's switch + resume cutoff (instead of the area's) and no longer takes `areas`. The existing `profiles.auto_assign_enabled` column and `updateUserAutoAssign` are reused, only the UI moves. The old `areas.auto_assign_enabled/auto_assign_resumed_at` columns stay in the DB, unused (Phase 4 drops them).

**Tech Stack:** Next.js 15 / React 18 / TypeScript, Supabase, `node --experimental-strip-types` checks.

## Global Constraints

- Deploy order: run the Task 1 SQL first, then push.
- Rules (decided with the user): team OFF → customers created by that team get no auto second assignee; member OFF → that salesperson is never picked; defaults all ON; turning a team back ON stamps `auto_assign_resumed_at = now`, and a customer whose due date fell before that moment is permanently skipped (same "missed window" rule the area switch had) — `isSecondAssignDue(..., resumedAt, now)` is unchanged and now receives the TEAM's resume time.
- The epoch default (`'1970-01-01T00:00:00Z'`) is deliberate: with `now()` every existing overdue customer would be skipped forever.
- Customers need no area to be eligible any more; `SecondAssignAction` loses `areaId`.
- Never edit an assertion in `lib/autoSecondAssign.check.ts`; call arguments and fixture data may change (the plan function loses its `areas` parameter and needs the team's switch data).
- Leader-visible behavior elsewhere is unchanged.

---

### Task 1: SQL — team switches

**Files:** Modify `supabase/schema.sql` (append at the very end).

- [ ] **Step 1: Append (every line commented, match the file's line endings)**

```sql

-- ============================================================
-- Migration: auto-assign switches move to teams — a per-team On/Off (default
-- On) and a resume cutoff (a customer whose due date fell before the team was
-- last switched back On is permanently skipped). The epoch default keeps every
-- currently-eligible customer eligible. Additive and safe; run BEFORE deploying
-- the matching app version. The old areas.auto_assign_* columns are no longer
-- used (dropped in Phase 4).
-- ============================================================
--
-- alter table teams add column if not exists auto_assign_enabled boolean not null default true;
-- alter table teams add column if not exists auto_assign_resumed_at timestamptz not null default '1970-01-01T00:00:00Z';
```

- [ ] **Step 2: Verify** the heading appears once and every non-blank line from it to EOF starts with `--`.
- [ ] **Step 3: Commit** — `git add supabase/schema.sql && git commit -m "Schema: teams.auto_assign_enabled / auto_assign_resumed_at (manual migration)"`
- [ ] **Step 4: STOP (controller)** — the user runs the two `alter table` lines before anything is pushed.

---

### Task 2: Plan function, Netlify, Team type + mapper + fixtures

**Files:** Modify `lib/autoSecondAssign.ts`, `lib/autoSecondAssign.check.ts`, `netlify/functions/sweep-auto-assign.mts`, `lib/types.ts`, `lib/mappers.ts`, `lib/store.tsx` (only `mapTeam` + the Team-related types in this task), `lib/dashboardMetrics.check.ts`, `lib/parseAreaCsv.check.ts` (Area shape).

**Interfaces:**
- `Team { id; name; managerId; autoAssignEnabled: boolean; autoAssignResumedAt: string }`
- `Area { id; name }` (loses `autoAssignEnabled`, `autoAssignResumedAt`)
- `computeAutoSecondAssignPlan(customers, users, stages, activities, now, teams: TeamSwitch[]): SecondAssignAction[]` where `TeamSwitch = { id: string; lastAutoAssignedUserId: string | null; autoAssignEnabled: boolean; autoAssignResumedAt: string }` (exported); `teams` is now REQUIRED; `areas` parameter removed.
- `SecondAssignAction { customerId; teamId; winnerId; stageId }`.

- [ ] **Step 1: Types and mappers**

`lib/types.ts`: add `autoAssignEnabled: boolean; autoAssignResumedAt: string;` to `Team`; delete the same two fields from `Area`. `lib/mappers.ts` `mapArea` → `(row: { id: string; name: string }): Area` returning `{ id, name }`. `lib/store.tsx` `mapTeam` → row type adds `auto_assign_enabled?: boolean; auto_assign_resumed_at?: string;` and returns `autoAssignEnabled: row.auto_assign_enabled ?? true, autoAssignResumedAt: row.auto_assign_resumed_at ?? "1970-01-01T00:00:00Z"`.

- [ ] **Step 2: `computeAutoSecondAssignPlan`**

Replace the signature and the head of the loop in `lib/autoSecondAssign.ts`:

```ts
export interface TeamSwitch {
  id: string;
  lastAutoAssignedUserId: string | null;
  autoAssignEnabled: boolean;
  autoAssignResumedAt: string;
}

export interface SecondAssignAction {
  customerId: string;
  teamId: string;
  winnerId: string;
  stageId: string | null;
}

export function computeAutoSecondAssignPlan(
  customers: Customer[],
  users: User[],
  stages: Stage[],
  activities: Activity[],
  now: number,
  teams: TeamSwitch[]
): SecondAssignAction[] {
  const defaultStage = stages.find((s) => s.isDefault) ?? stages[0];
  const actions: SecondAssignAction[] = [];
  const pointerByTeam = new Map<string, string | null>();
  const extraAssignedCount = new Map<string, number>();
  for (const c of customers) {
    if (!c.createdBy || !c.createdByTeamId) continue; // legacy/imported or admin-created: never eligible
    const teamId = c.createdByTeamId;
    const team = teams.find((t) => t.id === teamId);
    if (!team || !team.autoAssignEnabled) continue;
    const teamSeats = c.assignments.filter((s) => s.teamId === teamId);
    const slot1 = teamSeats.find((s) => s.slot === 1);
    if (!slot1 || teamSeats.some((s) => s.slot === 2)) continue;
    const slot1Stage = slot1.stageId ? stages.find((s) => s.id === slot1.stageId) : undefined;
    if (!isSecondAssignDue({ id: c.id, createdAt: c.createdAt, assignments: teamSeats }, activities, slot1Stage, team.autoAssignResumedAt, now)) continue;
    // ... everything below (excluded, candidates, pointer, rotation, pool limit, push) unchanged,
    // except: `currentPointer` reads `team.lastAutoAssignedUserId` instead of looking the team up again,
    // and the pushed action is `{ customerId: c.id, teamId, winnerId, stageId: defaultStage?.id ?? null }`.
```

Update the doc comment above the function: the team's switch + resume time replace the area's; areas are not used.

- [ ] **Step 3: Fixtures in `lib/autoSecondAssign.check.ts`** (assertions untouched)

Remove the `area()` builder and every `area({...})` call. For each test add a `teams` array and call `computeAutoSecondAssignPlan(customers, users, stages, activities, NOW, teams)`; the team entry for a test is `{ id: "<that test's team id>", lastAutoAssignedUserId: null, autoAssignEnabled: true, autoAssignResumedAt: <the old area's autoAssignResumedAt: isoDaysAgo(365) or isoDaysAgo(5) for the missed-window test> }`. Keep `createdByTeamId` on the customers. Customers no longer need `areaId`, but leaving it set is harmless. The orphan test (no users) must still give 0 actions; the legacy test (createdBy null) still 0.

- [ ] **Step 4: Other fixtures** — remove `autoAssignEnabled` / `autoAssignResumedAt` from the `Area` literals in `lib/dashboardMetrics.check.ts` (lines ~191-192) and `lib/parseAreaCsv.check.ts` (line ~35). Data/shape only.

- [ ] **Step 5: Netlify** (`netlify/functions/sweep-auto-assign.mts`) — drop the `areas` query and its error/mapping (and the `mapArea` import); select `id, last_auto_assigned_user_id, auto_assign_enabled, auto_assign_resumed_at` from `teams` and map to `TeamSwitch` (`autoAssignEnabled: t.auto_assign_enabled ?? true`, `autoAssignResumedAt: t.auto_assign_resumed_at ?? "1970-01-01T00:00:00Z"`); call `computeAutoSecondAssignPlan(customers, users, stages, activities, Date.now(), teams)`; the rest (seat insert with `action.teamId`, teams pointer update, assignment_events) unchanged.

- [ ] **Step 6: Verify** — every `lib/*.check.ts` via `node --experimental-strip-types lib/<name>.check.ts` passes; `npx tsc --noEmit` reports errors ONLY about the store/admin pages that Task 3 fixes (`updateAreaAutoAssign`, `Area.autoAssignEnabled` uses) — list them. Never edit an assertion.

- [ ] **Step 7: Commit** — `git commit -am "Auto second-assign: the team's switch and resume time replace the area's; areas are not used"`

---

### Task 3: Store, Teams page, remove the old switches

**Files:** Modify `lib/store.tsx`, `app/(dashboard)/admin/teams/page.tsx`, `app/(dashboard)/admin/area/page.tsx`, `app/(dashboard)/admin/users/page.tsx`.

**Interfaces:** store gains `updateTeamAutoAssign(id: string, enabled: boolean): void`; loses `updateAreaAutoAssign`. `updateUserAutoAssign` stays.

- [ ] **Step 1: Store**

Add to `interface Store` `updateTeamAutoAssign: (id: string, enabled: boolean) => void;` and remove `updateAreaAutoAssign`. Replace the `updateAreaAutoAssign` function with:

```ts
  // Team-wide auto second-assign switch. Switching back ON stamps the resume
  // time: a customer whose due date already passed before this moment is
  // never auto-assigned (the sweep treats that as "missed the window").
  function updateTeamAutoAssign(id: string, enabled: boolean) {
    const target = teams.find((t) => t.id === id);
    if (!target) return;
    const prev = { autoAssignEnabled: target.autoAssignEnabled, autoAssignResumedAt: target.autoAssignResumedAt };
    const nowIso = new Date().toISOString();
    const resuming = enabled && !target.autoAssignEnabled;
    setTeams((all) => all.map((t) => (t.id === id ? { ...t, autoAssignEnabled: enabled, ...(resuming ? { autoAssignResumedAt: nowIso } : {}) } : t)));
    createClient()
      .from("teams")
      .update(resuming ? { auto_assign_enabled: true, auto_assign_resumed_at: nowIso } : { auto_assign_enabled: enabled })
      .eq("id", id)
      .then(({ error }) => {
        if (error) {
          console.error("updateTeamAutoAssign failed", error);
          setTeams((all) => all.map((t) => (t.id === id ? { ...t, ...prev } : t)));
        }
      });
  }
```

Put it in the `value` object in place of `updateAreaAutoAssign`.

- [ ] **Step 2: Teams page** (`app/(dashboard)/admin/teams/page.tsx`)

1. Destructure `updateTeamAutoAssign` and `updateUserAutoAssign` from `useStore()`.
2. Table header and rows grid: `"2fr 1.2fr 1fr"` → `"2fr 1.2fr .8fr 1fr"` (both places); add a header cell `Auto Assign` between Manager and Actions and, in each team row between the manager cell and the actions cell:

```tsx
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#6b7280" }}>
                  <input type="checkbox" checked={t.autoAssignEnabled} onChange={(e) => updateTeamAutoAssign(t.id, e.target.checked)} />
                  {t.autoAssignEnabled ? "On" : "Off"}
                </label>
```

3. In the member rows, between the role label and "Remove", for `m.role === "SALESPERSON"` only:

```tsx
                      {m.role === "SALESPERSON" && (
                        <label style={{ display: "flex", alignItems: "center", gap: 4, color: "#6b7280" }} title="Include this member in the auto second-assign rotation">
                          <input type="checkbox" checked={m.autoAssignEnabled} onChange={(e) => updateUserAutoAssign(m.id, e.target.checked)} />
                          {m.autoAssignEnabled ? "On" : "Off"}
                        </label>
                      )}
```

(A team that is Off visually greys its members' switches: add `opacity: t.autoAssignEnabled ? 1 : 0.5` to that label's style.)

- [ ] **Step 3: Area page** — remove the `Auto Assign` column header and cell (the checkbox + its label), change both `gridTemplateColumns: "2fr 1fr 1fr"` back to `"2fr 1fr"`, remove `updateAreaAutoAssign` from the destructure.
- [ ] **Step 4: Users page** — remove the auto-assign column: its header cell, the checkbox cell, and `updateUserAutoAssign` from the destructure; reduce the grid template (both header and rows) by one column; keep every other column and its widths intact.
- [ ] **Step 5: Verify** — `npx tsc --noEmit` clean; every `lib/*.check.ts` passes; Grep `app components lib netlify` for `updateAreaAutoAssign|area.autoAssign|a.autoAssignEnabled`: zero hits.
- [ ] **Step 6: Commit** — `git commit -am "Auto-assign switches live on Teams: per-team and per-member On/Off; removed from Area and Users pages"`

---

### Task 4: Ship

- [ ] The user runs the two `alter table` lines; then merge/push. Manual checks: `/admin/teams` shows an Auto Assign On/Off per team and, when a team is expanded, an On/Off beside each salesperson (managers have none); toggling is saved (reload); `/admin/area` and `/admin/users` have no auto-assign control; switch a team Off → run Netlify `sweep-auto-assign` → nothing is assigned for that team's customers; back On → works again.
