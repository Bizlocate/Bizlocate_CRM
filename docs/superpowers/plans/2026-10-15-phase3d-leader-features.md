# Phase 3d — Leader features: duplicate-phone assign, auto-assign by creating team, areas no longer belong to teams

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the leader rework: (1) creating a customer whose phone already exists lets a leader open it or assign it straight to their own team's members instead of creating a duplicate; (2) the daily auto "second assignee" now comes from the team that **created** the customer; (3) areas are no longer tied to teams anywhere (no area↔team linking UI, no area-based assignee options, no `Area.teamIds`).

**Architecture:** Almost all code. One tiny additive SQL step: a per-team rotation pointer (`teams.last_auto_assigned_user_id`) replaces the per-area pointer, so two teams working the same area don't disturb each other's round-robin. `computeAutoSecondAssignPlan` reads the creating team from `Customer.createdByTeamId` and that team's seats; the Netlify function writes the new pointer. The `area_teams` table and the unused `areas.last_auto_assigned_user_id` column are left in the DB for Phase 4 to drop.

**Tech Stack:** Next.js 15 / React 18 / TypeScript, Supabase, `node --experimental-strip-types` check scripts.

**Part of:** `docs/superpowers/plans/2026-10-13-leader-rework-roadmap.md` (3d).

## Global Constraints

- Deploy order: **run the Task 1 SQL first**, then push the app/Netlify function (the function writes the new column; before the SQL runs, its pointer update just fails and is logged — harmless, but run the SQL first anyway).
- Auto second-assign semantic (decided with the user): the second assignee is drawn from the **creating team's** active, auto-assign-enabled SALESPERSONs; a customer with no `createdByTeamId` (admin-created) or no `createdBy` (legacy) is never eligible; due-ness (7 days / 14-day-idle rule) is judged from the **creating team's seat 1**; eligible only when that team has seat 1 and no seat 2; nobody who already holds ANY seat on the customer can win; pool limit and round-robin as before; the area must exist and have `autoAssignEnabled`; the per-area "resume" cutoff (`autoAssignResumedAt`) still applies.
- Existing `lib/autoSecondAssign.check.ts` **assertions must not change**; fixture data may (customers need `createdByTeamId` and their owner seat must belong to that team).
- Pure libs run by Node directly keep type-only imports from other lib files.
- Duplicate-phone matching stays exactly as today (exact match of the entered phone / optional phone against any customer's phone / optional phone, among the customers the viewer can see — which for leaders is now every customer).
- A leader assigns only into **their own team's** seats; an ADMIN may pick any non-admin member (the member's team decides the seat). A person already holding a seat on that customer cannot be picked.
- The detail page, store writers and RLS from Phase 3c are not changed.
- No test framework: self-checks are `lib/*.check.ts`; `npx tsc --noEmit`. Never edit an assertion.

## File Structure

- Modify: `supabase/schema.sql` (one small migration block)
- Modify: `lib/autoSecondAssign.ts` (+ `.check.ts`), `netlify/functions/sweep-auto-assign.mts`
- Modify: `lib/types.ts`, `lib/mappers.ts`, `lib/store.tsx`, `app/(dashboard)/admin/area/page.tsx`, `components/InactiveListingsBrowser.tsx`, `components/RemovalApprovalsBrowser.tsx`, fixtures in `lib/dashboardMetrics.check.ts`, `lib/parseAreaCsv.check.ts`
- Modify: `app/(dashboard)/customers/page.tsx` (new-customer form)

---

### Task 1: SQL — per-team rotation pointer

**Files:**
- Modify: `supabase/schema.sql` (append at the very end)

- [ ] **Step 1: Append the migration block**

```sql

-- ============================================================
-- Migration: Phase 3d — per-team rotation pointer for the daily auto
-- second-assign (it used to be per area; the second person now comes from the
-- team that created the customer, so fairness is tracked per team). Additive
-- and safe to run any time; run it BEFORE deploying Phase 3d. The old
-- areas.last_auto_assigned_user_id column is no longer used (dropped in Phase 4).
-- ============================================================
--
-- alter table teams add column if not exists last_auto_assigned_user_id uuid references profiles (id) on delete set null;
```

- [ ] **Step 2: Verify** — the heading appears once; every non-blank line from it to EOF starts with `--`.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "Schema: teams.last_auto_assigned_user_id (Phase 3d, manual migration)"
```

- [ ] **Step 4: STOP — hand the SQL to the user** (controller step): they run the uncommented `alter table` in the Supabase SQL editor. Do not push the app before they confirm.

---

### Task 2: Auto second-assign draws from the creating team

**Files:**
- Modify: `lib/autoSecondAssign.ts`, `lib/autoSecondAssign.check.ts` (fixture data only), `netlify/functions/sweep-auto-assign.mts` (pointer + action fields only)

**Interfaces:**
- Produces:
  - `SecondAssignAction { customerId: string; areaId: string; teamId: string; winnerId: string; stageId: string | null }` (adds `teamId`).
  - `computeAutoSecondAssignPlan(customers, areas, users, stages, activities, now, teams: { id: string; lastAutoAssignedUserId: string | null }[] = []): SecondAssignAction[]` — new optional last parameter `teams` (rotation pointers); existing 6-argument calls keep working.

- [ ] **Step 1: Rewrite the plan loop**

In `lib/autoSecondAssign.ts` replace the whole `computeAutoSecondAssignPlan` function (and the `SecondAssignAction` interface above it) with:

```ts
export interface SecondAssignAction {
  customerId: string;
  areaId: string;
  teamId: string;
  winnerId: string;
  stageId: string | null;
}

/**
 * The full second-seat auto-assign decision for one sweep pass: which
 * customers are due, who wins each one via round-robin, honoring each
 * candidate's activePoolLimit. Pure -- returns the plan as data, does not
 * write anything.
 *
 * The second person always comes from the team that CREATED the customer
 * (`createdByTeamId`): that team's seat 1 decides when it is due, only that
 * team's active auto-assign salespeople can win, and the round-robin pointer
 * is per team (`teams[].lastAutoAssignedUserId`). Nobody who already holds
 * any seat on the customer can win (a person holds one seat per customer).
 * pointerByTeam/extraAssignedCount track this call's own in-progress picks so
 * the second customer processed for a team sees the first one's winner,
 * instead of both reading the same stale pointer and colliding.
 */
export function computeAutoSecondAssignPlan(
  customers: Customer[],
  areas: Area[],
  users: User[],
  stages: Stage[],
  activities: Activity[],
  now: number,
  teams: { id: string; lastAutoAssignedUserId: string | null }[] = []
): SecondAssignAction[] {
  const defaultStage = stages.find((s) => s.isDefault) ?? stages[0];
  const actions: SecondAssignAction[] = [];
  const pointerByTeam = new Map<string, string | null>();
  const extraAssignedCount = new Map<string, number>();
  for (const c of customers) {
    if (!c.areaId || !c.createdBy || !c.createdByTeamId) continue; // legacy/imported or admin-created: never eligible
    const teamId = c.createdByTeamId;
    const area = areas.find((a) => a.id === c.areaId);
    if (!area || !area.autoAssignEnabled) continue;
    const teamSeats = c.assignments.filter((s) => s.teamId === teamId);
    const slot1 = teamSeats.find((s) => s.slot === 1);
    if (!slot1 || teamSeats.some((s) => s.slot === 2)) continue;
    const slot1Stage = slot1.stageId ? stages.find((s) => s.id === slot1.stageId) : undefined;
    if (!isSecondAssignDue({ id: c.id, createdAt: c.createdAt, assignments: teamSeats }, activities, slot1Stage, area.autoAssignResumedAt, now)) continue;
    const excluded = c.assignments.map((s) => s.userId);
    const candidates = users
      .filter((u) => u.active && u.autoAssignEnabled && u.role === "SALESPERSON" && u.teamId === teamId && !excluded.includes(u.id))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    if (candidates.length === 0) continue;
    const currentPointer = pointerByTeam.has(teamId) ? pointerByTeam.get(teamId)! : teams.find((t) => t.id === teamId)?.lastAutoAssignedUserId ?? null;
    const lastIndex = candidates.findIndex((u) => u.id === currentPointer);
    const startIndex = lastIndex === -1 ? 0 : (lastIndex + 1) % candidates.length;
    let winner: User | undefined;
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[(startIndex + i) % candidates.length];
      const limit = candidate.activePoolLimit;
      if (limit !== null && limit !== undefined) {
        const activeCount = customers.filter((other) =>
          other.assignments.some((s) => s.userId === candidate.id && s.pool === "ACTIVE")
        ).length + (extraAssignedCount.get(candidate.id) ?? 0);
        if (activeCount >= limit) continue;
      }
      winner = candidate;
      break;
    }
    if (!winner) continue;
    const winnerId = winner.id;
    pointerByTeam.set(teamId, winnerId);
    extraAssignedCount.set(winnerId, (extraAssignedCount.get(winnerId) ?? 0) + 1);
    actions.push({ customerId: c.id, areaId: area.id, teamId, winnerId, stageId: defaultStage?.id ?? null });
  }
  return actions;
}
```

Keep `secondAssignDueAt` and `isSecondAssignDue` exactly as they are.

- [ ] **Step 2: Fixture data in `lib/autoSecondAssign.check.ts`** (assertions unchanged)

Change the `customer()` builder's seat derivation from `seatsFromSlots(base, () => "team-1")` to `seatsFromSlots(base, () => base.createdByTeamId ?? "team-1")` (the owner's seat belongs to the creating team). In each test that calls `computeAutoSecondAssignPlan` with a customer, add `createdByTeamId: "<the same team id as that test's users / area teamIds>"` to the `customer({...})` call (e.g. `cust-1`/`cust-2` → `"team-1"`, `existing`/`target` → `"team-2"`, `legacy-1` → `"team-3"`, `missed-1` → `"team-4"`, `orphan-1` → `"team-5"`, `cust-6` → `"team-6"`). Tests that call only `secondAssignDueAt` / `isSecondAssignDue` need no change. If the check script fails for any reason other than missing `createdByTeamId` fixture data, stop and report.

- [ ] **Step 3: Netlify function** (`netlify/functions/sweep-auto-assign.mts`)

1. Add `supabase.from("teams").select("id, last_auto_assigned_user_id"),` to the `Promise.all` (destructure `{ data: teamRows, error: teamError }`), throw on `teamError`, and build `const teams = (teamRows ?? []).map((t) => ({ id: t.id as string, lastAutoAssignedUserId: (t.last_auto_assigned_user_id ?? null) as string | null }));` (if the column does not exist yet the query errors — that is why the SQL runs first).
2. Pass `teams` as the last argument to `computeAutoSecondAssignPlan(customers, areas, users, stages, activities, Date.now(), teams)`.
3. In the per-action loop, the seat insert already uses the winner's team; change it to `team_id: action.teamId` (and drop the now-redundant `winnerTeamId` lookup and its "no team" guard — the plan only returns winners of the creating team). Replace the area pointer update (`supabase.from("areas").update({ last_auto_assigned_user_id: ... }).eq("id", action.areaId)`) with `supabase.from("teams").update({ last_auto_assigned_user_id: action.winnerId }).eq("id", action.teamId)` and fix the error message text accordingly.

- [ ] **Step 4: Verify** — `node --experimental-strip-types lib/autoSecondAssign.check.ts` passes; every other `lib/*.check.ts` passes; `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add lib/autoSecondAssign.ts lib/autoSecondAssign.check.ts netlify/functions/sweep-auto-assign.mts
git commit -m "Auto second-assign: draw the second person from the creating team, rotate per team"
```

---

### Task 3: Areas no longer belong to teams

**Files:**
- Modify: `lib/types.ts` (`Area`), `lib/mappers.ts` (`mapArea`), `lib/store.tsx`, `app/(dashboard)/admin/area/page.tsx`, `components/InactiveListingsBrowser.tsx`, `components/RemovalApprovalsBrowser.tsx`, `netlify/functions/sweep-auto-assign.mts`
- Modify (fixture data): `lib/autoSecondAssign.check.ts`, `lib/dashboardMetrics.check.ts`, `lib/parseAreaCsv.check.ts`

**Interfaces:**
- Produces: `Area { id, name, autoAssignEnabled, autoAssignResumedAt }` (no `teamIds`, no `lastAutoAssignedUserId`); `mapArea(row)` (one argument); store no longer exposes `addAreaTeam` / `removeAreaTeam`.

- [ ] **Step 1: Types and mapper**

In `lib/types.ts` delete `teamIds: string[];` and `lastAutoAssignedUserId: string | null;` from `interface Area`. In `lib/mappers.ts` replace `mapArea` with:

```ts
export function mapArea(row: { id: string; name: string; auto_assign_enabled: boolean; auto_assign_resumed_at: string }): Area {
  return { id: row.id, name: row.name, autoAssignEnabled: row.auto_assign_enabled ?? true, autoAssignResumedAt: row.auto_assign_resumed_at };
}
```

- [ ] **Step 2: Store**

In `lib/store.tsx`: remove `addAreaTeam` / `removeAreaTeam` (interface lines ~465-466, the two functions ~1322-1350, the `value` entries); simplify `loadAreas` to `const { data } = await supabase.from("areas").select("*").order("name"); const mapped = (data ?? []).map(mapArea);` (delete the `area_teams` query, `linksError` log, `teamIdsByArea` map); in the realtime `entries` array change the `areas` entry's `mapRow` to `mapArea`; delete the `area_teams` `channel.on(...)` listener block; delete the `areasRef` ref and its explanatory comment (only used to preserve `teamIds`). Do not touch `updateAreaAutoAssign`. If `lastAutoAssignedUserId` or `teamIds` is referenced anywhere else in the file, remove that use.

- [ ] **Step 3: Admin area page** (`app/(dashboard)/admin/area/page.tsx`)

Remove `teams`, `addAreaTeam`, `removeAreaTeam` from the `useStore()` destructure, the `newTeamId` state and `handleAddAreaTeam`, the `Team` column (header cell and row cell — change both `gridTemplateColumns: "2fr 1fr 1fr 1fr"` to `"2fr 1fr 1fr"`), and the whole "Teams" block inside the expanded area (the `Teams` label, the "No teams linked." line, the per-team rows with Remove, the select + "+ Add team" button). Keep the sub-area list, the auto-assign checkbox, CSV import and everything else.

- [ ] **Step 4: Manager area dropdowns**

In `components/InactiveListingsBrowser.tsx` and `components/RemovalApprovalsBrowser.tsx` replace

`const areaOptions = currentUser?.role === "MANAGER" ? areas.filter((a) => !!currentUser.teamId && a.teamIds.includes(currentUser.teamId)) : areas;`

with `const areaOptions = areas;` — or, cleaner, delete the constant and use `areas` where `areaOptions` is used (areas are no longer tied to teams, so every role sees every area).

- [ ] **Step 5: Netlify function and fixtures**

In `netlify/functions/sweep-auto-assign.mts` remove the `area_teams` query from the `Promise.all` (and its destructured `areaTeamRows`/`areaTeamError` and the throw), delete the `teamIdsByArea` loop, and use `const areas = (areaRows ?? []).map(mapArea);`. In the three check files remove `teamIds: [...]` and `lastAutoAssignedUserId: null` from every `Area` literal / builder (`autoSecondAssign.check.ts` `area()` builder and the `area({ id: ..., teamIds: [...] ... })` calls; `dashboardMetrics.check.ts` lines with `{ id: "a1", name: "SETAPAK", teamIds: [], ... }`; `parseAreaCsv.check.ts` `existingAreas`). Data/shape only; no assertion changes.

- [ ] **Step 6: Verify** — `npx tsc --noEmit` clean; every `lib/*.check.ts` passes; Grep `app/ components/ lib/ netlify/` for `teamIds|addAreaTeam|removeAreaTeam|area_teams|lastAutoAssignedUserId`: the only allowed hits are `lib/autoSecondAssign.ts` (the `teams[].lastAutoAssignedUserId` rotation pointer parameter and its use) and `netlify/functions/sweep-auto-assign.mts` (the same pointer, now read from `teams`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Areas no longer belong to teams: remove Area.teamIds, the area-team UI and area_teams reads"
```

---

### Task 4: New-customer form — duplicate phone assign, admin options without area

**Files:**
- Modify: `app/(dashboard)/customers/page.tsx` (`NewCustomerForm`)

**Interfaces:**
- Consumes: `reassignCustomer(customerId, teamId, slot, userId)` and `teams` from `useStore()`; `Customer.assignments`, `Customer.createdByTeamId`.

- [ ] **Step 1: Pull what is needed from the store**

In `NewCustomerForm`'s `useStore()` destructure add `teams` and `reassignCustomer`. Make sure `Customer` is imported as a type from `@/lib/types` in this file (add it to the existing `@/lib/types` import, or add the import).

- [ ] **Step 2: Assignee options without areas**

Replace the `assigneeOptions` function and its comment with:

```tsx
  // each assignee dropdown excludes whoever is already picked in the other two
  // slots (ADMIN excluded — doesn't do sales). A MANAGER picks from their own
  // team; an ADMIN may pick any member of any team (the member's team decides
  // which team's seat they take).
  function assigneeOptions(excluding: string[]) {
    return activeUsers.filter((u) =>
      u.role !== "ADMIN"
      && !!u.teamId
      && !excluding.includes(u.id)
      && (currentUser?.role === "ADMIN" || u.teamId === currentUser?.teamId)
    );
  }
```

In the three assignee `<option>`s (the `assigneeOptions([...]).map((u) => ( <option ...>{u.name}</option> ))` blocks) show the team for an ADMIN: label `{u.name}{currentUser?.role === "ADMIN" ? ` (${teams.find((t) => t.id === u.teamId)?.name ?? "—"})` : ""}`. In the Area `<select>`'s `onChange` remove the three `setAssignedToUserId*("")` resets (assignees no longer depend on the area); keep `setAreaId` and `setSubAreaId("")`.

- [ ] **Step 3: Split submit into check + create**

In `handleSubmit`, after the required-field validation and **instead of** the `window.confirm` duplicate block, do:

```tsx
    const enteredPhones = [phone.trim(), optionalPhone.trim()].filter(Boolean);
    const found = customers.filter((c) => enteredPhones.some((p) => c.phone === p || c.optionalPhone === p));
    if (found.length > 0) {
      setDupes(found);
      return;
    }
    await createCustomer();
```

Move everything from `setFormError("");` to the end of the old `handleSubmit` (the `addCustomer` call and the navigation / error handling) into a new `async function createCustomer() { ... }` unchanged.

- [ ] **Step 4: Duplicate panel state and handlers**

Add state next to the other `useState`s:

```tsx
  const [dupes, setDupes] = useState<Customer[] | null>(null);
  const [dupeAssignee, setDupeAssignee] = useState<Record<string, string>>({});
```

and handlers:

```tsx
  // members who could take a seat on an existing customer: a manager's own team (not already holding a seat on it); an admin: anyone
  function dupeCandidates(c: Customer) {
    return activeUsers.filter((u) =>
      u.role !== "ADMIN"
      && !!u.teamId
      && (currentUser?.role === "ADMIN" || u.teamId === currentUser?.teamId)
      && !c.assignments.some((s) => s.userId === u.id)
    );
  }

  function assignExisting(c: Customer) {
    const userId = dupeAssignee[c.id];
    const user = users.find((u) => u.id === userId);
    if (!user?.teamId) return;
    const taken = new Set(c.assignments.filter((s) => s.teamId === user.teamId).map((s) => s.slot));
    const slot = ([1, 2, 3] as const).find((n) => !taken.has(n));
    if (!slot) {
      alert(`${user.name}'s team already has all 3 seats on this customer.`);
      return;
    }
    const result = reassignCustomer(c.id, user.teamId, slot, userId);
    if (!result.ok) {
      alert(result.error ?? "Could not assign this customer.");
      return;
    }
    router.push(`/customers/${c.id}`);
  }
```

- [ ] **Step 5: The panel**

Wrap the component's returned JSX in a fragment `<>…</>` and, after the existing form overlay, render:

```tsx
      {dupes && (
        <div className="modal-overlay" style={{ zIndex: 60 }} onClick={(e) => { if (e.target === e.currentTarget) setDupes(null); }}>
          <div className="card modal-card" style={{ maxWidth: 720 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>This phone number is already in the system</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 14 }}>
              You don't need to create it again — open it, or assign it to a member of your team.
            </div>
            {dupes.map((c) => {
              const candidates = dupeCandidates(c);
              return (
                <div key={c.id} style={{ padding: "12px 0", borderTop: "1px solid #eef0f2" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                    {c.name} — {c.businessName || "—"} — {nameOf(businessTagTypes, c.businessTypeId) || "—"}
                  </div>
                  <div style={{ fontSize: 12, color: "#9aa0ab", margin: "2px 0 8px" }}>
                    Created by {teams.find((t) => t.id === c.createdByTeamId)?.name ?? "—"}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button className="btn btn-outline" type="button" onClick={() => router.push(`/customers/${c.id}`)}>Open</button>
                    {candidates.length > 0 ? (
                      <>
                        <select
                          className="field-input"
                          style={{ width: "auto" }}
                          value={dupeAssignee[c.id] ?? ""}
                          onChange={(e) => setDupeAssignee((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        >
                          <option value="">— assign to —</option>
                          {candidates.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}{currentUser?.role === "ADMIN" ? ` (${teams.find((t) => t.id === u.teamId)?.name ?? "—"})` : ""}
                            </option>
                          ))}
                        </select>
                        <button className="btn btn-primary" type="button" disabled={!dupeAssignee[c.id]} onClick={() => assignExisting(c)}>
                          Assign
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: 12.5, color: "#9aa0ab" }}>No free member to assign.</span>
                    )}
                  </div>
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
              <button className="btn btn-outline" type="button" onClick={() => setDupes(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={async () => {
                  setDupes(null);
                  await createCustomer();
                }}
              >
                Create anyway
              </button>
            </div>
          </div>
        </div>
      )}
```

(`nameOf` is the existing helper already used in this file; `submitting`/`formError` behave as before for the "Create anyway" path because `createCustomer` contains the old submit logic.)

- [ ] **Step 6: Verify** — `npx tsc --noEmit` clean; every `lib/*.check.ts` passes; Grep the file: no `window.confirm(` left for the duplicate case, no `areas.find((a) => a.id === areaId)?.teamIds`.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/customers/page.tsx"
git commit -m "New customer: duplicate phone lets a leader open or assign to own team; admin assignee options no longer by area"
```

---

### Task 5: Verify and ship

**Files:** none modified.

- [ ] **Step 1: Automated** — `npx tsc --noEmit`; every `lib/*.check.ts`.

- [ ] **Step 2: Order of release (controller walks the user through it)**
  1. The user runs the Task 1 SQL (`alter table teams add column ...`).
  2. Merge and push `main` (the app and the Netlify function deploy together).
  3. Manual checks, as the user (the in-app browser needs the user's login):
     - **Duplicate phone as a leader:** `+ New Customer`, type the phone of an existing customer (another team's too) → the panel appears with Open / member select + Assign / Create anyway / Cancel; Assign puts the member into the leader's team seat 1 (or the first free seat) and opens the customer; Cancel returns to the form; Create anyway creates a second customer as before.
     - **As ADMIN:** the assignee dropdowns list members of every team with the team name, even before an area is picked.
     - **`/admin/area`:** no Team column and no team-linking section; auto-assign checkbox and sub-areas still work.
     - **Leader's Removal Approvals and Inactive Listings pages:** the Area dropdown lists every area.
     - **Auto second-assign:** in Netlify → Functions → `sweep-auto-assign` → Run once (or wait for the daily run): a customer created ≥7 days ago by team T with a seat 1 and no seat 2 gets its second seat from team T's members; check `select slot, user_id, team_id from customer_assignments where customer_id = '<id>'` and that `teams.last_auto_assigned_user_id` for T moved.
  4. Report results to the user, including any step that failed with the exact message.
