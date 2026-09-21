# Auto Second-Assign Eligibility Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `sweepAutoSecondAssign` from ever auto-assigning legacy/imported customers, and stop it from dumping a backlog onto whoever's eligible the moment an area's auto-assign switch is turned back on after being off — a customer whose 7/14-day window elapsed while the area was off must be assigned manually, never automatically, once the area reopens.

**Architecture:** One new `customers.created_by IS NOT NULL` guard (column already exists in the DB, just never read into the app). One new `areas.auto_assign_resumed_at` timestamp column, stamped to `now()` every time an area's auto-assign switch flips from off to on; the sweep's existing due-date calculation (7-day plain / 14-day-idle for Appointment/Nego-flagged stages) gets extracted into a small pure module (`lib/autoSecondAssign.ts`, matching the existing `lib/inactiveListings.ts`/`lib/blasting.ts` pattern of pure sweep-logic-plus-`.check.ts`) so the "missed the window" decision is independently testable, then wired into `sweepAutoSecondAssign` in `lib/store.tsx`.

**Tech Stack:** Next.js App Router, React client component, TypeScript, Supabase (`@supabase/ssr` client via `createClient()`), existing `useStore()` context in `lib/store.tsx`. No test framework in this repo — pure logic gets a `node --experimental-strip-types` self-check script (existing repo convention, see `lib/inactiveListings.check.ts`); everything else is verified via `npm run build` (type-check) plus manual click-through in the browser preview.

## Global Constraints

- Match existing code style exactly: inline `style={{...}}` objects where UI is touched, fire-and-forget `.then(() => {})` on Supabase writes, no new dependencies.
- `sweepAutoSecondAssign` must keep operating only on the snapshot arrays passed into it and functional `setState` updaters — never the closure `customers`/`areas`/etc. state (existing discipline, see the function's own comment block in `lib/store.tsx`).
- Every customer still gets at most one 2nd-assignment (existing `if (c.assignedToUserId2 ...) continue;` guard at the top of the loop — do not weaken it).
- Design reference: [`docs/superpowers/specs/2026-09-21-auto-second-assign-eligibility-fix-design.md`](../specs/2026-09-21-auto-second-assign-eligibility-fix-design.md).

---

### Task 1: Types + mapping — `Customer.createdBy`, `Area.autoAssignResumedAt`

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/store.tsx`

**Interfaces:**
- Produces: `Customer.createdBy: string | null`, `Area.autoAssignResumedAt: string`.

- [ ] **Step 1: Add `createdBy` to the `Customer` interface**

In `lib/types.ts`, find the `Customer` interface (search for `export interface Customer {`) and add the new field right after `remark: string;`:

```ts
  remark: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Add `autoAssignResumedAt` to the `Area` interface**

In `lib/types.ts`, find the `Area` interface (search for `export interface Area {`) and add the new field:

```ts
export interface Area {
  id: string;
  name: string;
  teamIds: string[];
  autoAssignEnabled: boolean;
  autoAssignResumedAt: string;
  lastAutoAssignedUserId: string | null;
}
```

- [ ] **Step 3: Update `mapCustomer` to read `created_by`**

In `lib/store.tsx`, find `function mapCustomer(row: {` (around line 130). In its row-type parameter, add `created_by: string | null;` right after `remark: string | null;`:

```ts
  remark: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}): Customer {
```

Then in the function body's return object, add `createdBy: row.created_by,` right after `remark: row.remark ?? "",`:

```ts
    remark: row.remark ?? "",
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
```

- [ ] **Step 4: Update `mapArea` to read `auto_assign_resumed_at`**

In `lib/store.tsx`, find:

```ts
function mapArea(row: { id: string; name: string; auto_assign_enabled: boolean; last_auto_assigned_user_id: string | null }, teamIds: string[]): Area {
  return { id: row.id, name: row.name, teamIds, autoAssignEnabled: row.auto_assign_enabled ?? true, lastAutoAssignedUserId: row.last_auto_assigned_user_id };
}
```

Replace with:

```ts
function mapArea(row: { id: string; name: string; auto_assign_enabled: boolean; auto_assign_resumed_at: string; last_auto_assigned_user_id: string | null }, teamIds: string[]): Area {
  return { id: row.id, name: row.name, teamIds, autoAssignEnabled: row.auto_assign_enabled ?? true, autoAssignResumedAt: row.auto_assign_resumed_at, lastAutoAssignedUserId: row.last_auto_assigned_user_id };
}
```

- [ ] **Step 5: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors. (This repo doesn't import generated Supabase DB types — `mapArea`/`mapCustomer`'s row parameters are manually typed inline — so this compiles regardless of whether the `auto_assign_resumed_at` column exists in the actual database yet; that's Task 5.)

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/store.tsx
git commit -m "$(cat <<'EOF'
Add Customer.createdBy + Area.autoAssignResumedAt mapping

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Pure module — `lib/autoSecondAssign.ts` (due-date calc + missed-window decision)

**Files:**
- Create: `lib/autoSecondAssign.ts`
- Create: `lib/autoSecondAssign.check.ts`

**Interfaces:**
- Consumes: `Customer` (`id`, `createdAt`, `pool1Since`, `assignedToUserId`), `Activity` (`customerId`, `authorUserId`, `createdAt`), `Stage` (`excludeFromAutoAssign`) from `lib/types.ts`.
- Produces: `secondAssignDueAt(customer, activities, slot1Stage): number`, `isSecondAssignDue(dueAt: number, areaResumedAt: string, now: number): boolean`.

- [ ] **Step 1: Write `lib/autoSecondAssign.ts`**

```ts
import type { Activity, Customer, Stage } from "./types";

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * When a customer's slot-2 auto-assignment becomes due: 7 days after slot-1
 * was created, or — if slot-1's stage is flagged excludeFromAutoAssign
 * (e.g. Appointment/Nego) — 14 days after the last activity logged by the
 * slot-1 assignee (falling back to pool1Since/createdAt if there's none).
 * Same "last touched" formula sweepStalePool already uses.
 */
export function secondAssignDueAt(
  customer: Pick<Customer, "id" | "createdAt" | "pool1Since" | "assignedToUserId">,
  activities: Pick<Activity, "customerId" | "authorUserId" | "createdAt">[],
  slot1Stage: Pick<Stage, "excludeFromAutoAssign"> | undefined
): number {
  if (slot1Stage?.excludeFromAutoAssign) {
    const lastOwnActivity = activities
      .filter((a) => a.customerId === customer.id && a.authorUserId === customer.assignedToUserId)
      .reduce((max, a) => Math.max(max, new Date(a.createdAt).getTime()), 0);
    const lastTouched = Math.max(new Date(customer.pool1Since ?? customer.createdAt).getTime(), lastOwnActivity);
    return lastTouched + FOURTEEN_DAYS_MS;
  }
  return new Date(customer.createdAt).getTime() + SEVEN_DAYS_MS;
}

/**
 * Whether a customer due at `dueAt` should actually be auto-assigned right
 * now. A due date that falls before the area's auto-assign was last turned
 * on means it became due while the area was off — that window is
 * permanently missed (needs a manual assign instead of ever being caught
 * up automatically), not just "not yet".
 */
export function isSecondAssignDue(dueAt: number, areaResumedAt: string, now: number): boolean {
  const resumedAtMs = new Date(areaResumedAt).getTime();
  if (dueAt < resumedAtMs) return false;
  return dueAt <= now;
}
```

- [ ] **Step 2: Write `lib/autoSecondAssign.check.ts`**

```ts
// Self-check for autoSecondAssign. Run with:
//   node --experimental-strip-types lib/autoSecondAssign.check.ts
import assert from "node:assert";
import { FOURTEEN_DAYS_MS, SEVEN_DAYS_MS, isSecondAssignDue, secondAssignDueAt } from "./autoSecondAssign.ts";
import type { Activity, Customer, Stage } from "./types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-21T06:00:00Z").getTime();

function customer(overrides: Partial<Customer> & { id: string }): Customer {
  return {
    name: "C", email: "", phone: "",
    stage1Id: null, stage2Id: null, stage3Id: null,
    assignedToUserId: null, assignedToUserId2: null, assignedToUserId3: null,
    pool1: null, pool2: null, pool3: null,
    pool1Since: null, pool2Since: null, pool3Since: null,
    sourceId: null, areaId: null, subAreaId: null, propertyTypeId: null, purposeId: null,
    businessIndustryId: null, businessCategoryId: null, businessTypeId: null,
    raceId: null, languageId: null, businessName: "",
    firsttimeBranchId: null, targetRaceId: null, targetTypeId: null, budgetMin: null, budgetMax: null,
    optionalPhone: "", remark: "", createdBy: "admin-1",
    createdAt: new Date(NOW - 100 * DAY_MS).toISOString(),
    updatedAt: new Date(NOW - 100 * DAY_MS).toISOString(),
    ...overrides,
  };
}

function activity(overrides: Partial<Activity> & { id: string; customerId: string; authorUserId: string; createdAt: string }): Activity {
  return { type: "CALL", content: "", followUp: "", author: "", time: "", ...overrides };
}

function isoDaysAgo(days: number): string {
  return new Date(NOW - days * DAY_MS).toISOString();
}

// --- secondAssignDueAt: plain 7-day path (no excludeFromAutoAssign stage) ---
{
  const c = customer({ id: "c1", createdAt: isoDaysAgo(10) });
  const dueAt = secondAssignDueAt(c, [], undefined);
  assert.strictEqual(dueAt, new Date(c.createdAt).getTime() + SEVEN_DAYS_MS);
}

// --- secondAssignDueAt: 14-day-idle path, no activity logged -> falls back to pool1Since ---
{
  const stage: Pick<Stage, "excludeFromAutoAssign"> = { excludeFromAutoAssign: true };
  const c = customer({ id: "c2", createdAt: isoDaysAgo(30), pool1Since: isoDaysAgo(20), assignedToUserId: "sp-1" });
  const dueAt = secondAssignDueAt(c, [], stage);
  assert.strictEqual(dueAt, new Date(c.pool1Since!).getTime() + FOURTEEN_DAYS_MS);
}

// --- secondAssignDueAt: 14-day-idle path, activity resets the clock forward ---
{
  const stage: Pick<Stage, "excludeFromAutoAssign"> = { excludeFromAutoAssign: true };
  const c = customer({ id: "c3", createdAt: isoDaysAgo(30), pool1Since: isoDaysAgo(20), assignedToUserId: "sp-1" });
  const acts = [activity({ id: "a1", customerId: "c3", authorUserId: "sp-1", createdAt: isoDaysAgo(5) })];
  const dueAt = secondAssignDueAt(c, acts, stage);
  assert.strictEqual(dueAt, new Date(acts[0].createdAt).getTime() + FOURTEEN_DAYS_MS);
}

// --- secondAssignDueAt: activity from someone else (not the slot-1 assignee) doesn't count ---
{
  const stage: Pick<Stage, "excludeFromAutoAssign"> = { excludeFromAutoAssign: true };
  const c = customer({ id: "c4", createdAt: isoDaysAgo(30), pool1Since: isoDaysAgo(20), assignedToUserId: "sp-1" });
  const acts = [activity({ id: "a2", customerId: "c4", authorUserId: "someone-else", createdAt: isoDaysAgo(1) })];
  const dueAt = secondAssignDueAt(c, acts, stage);
  assert.strictEqual(dueAt, new Date(c.pool1Since!).getTime() + FOURTEEN_DAYS_MS);
}

// --- isSecondAssignDue: not yet due ---
{
  const dueAt = NOW + 1 * DAY_MS;
  assert.strictEqual(isSecondAssignDue(dueAt, new Date(NOW - 365 * DAY_MS).toISOString(), NOW), false);
}

// --- isSecondAssignDue: due, and area has been on well before the due date -> eligible ---
{
  const dueAt = NOW - 1 * DAY_MS;
  assert.strictEqual(isSecondAssignDue(dueAt, new Date(NOW - 365 * DAY_MS).toISOString(), NOW), true);
}

// --- isSecondAssignDue: due date fell before the area's last resume -> permanently missed ---
{
  const dueAt = NOW - 90 * DAY_MS; // became due 3 months ago
  const areaResumedAt = new Date(NOW - 1 * DAY_MS).toISOString(); // area only reopened yesterday
  assert.strictEqual(isSecondAssignDue(dueAt, areaResumedAt, NOW), false);
}

// --- isSecondAssignDue: due date exactly at the area's resume moment -> eligible (boundary, not excluded) ---
{
  const resumedAt = new Date(NOW - 50 * DAY_MS).toISOString();
  assert.strictEqual(isSecondAssignDue(new Date(resumedAt).getTime(), resumedAt, NOW), true);
}

console.log("autoSecondAssign.check.ts: all assertions passed");
```

- [ ] **Step 3: Run the self-check**

Run:

```bash
node --experimental-strip-types lib/autoSecondAssign.check.ts
```

Expected: `autoSecondAssign.check.ts: all assertions passed` printed, exit code 0. If any `assert` throws, fix `lib/autoSecondAssign.ts` (not the check) until it passes — the check encodes the spec's decisions, not the other way around.

- [ ] **Step 4: Commit**

```bash
git add lib/autoSecondAssign.ts lib/autoSecondAssign.check.ts
git commit -m "$(cat <<'EOF'
Add lib/autoSecondAssign.ts: due-date calc + area-reopen missed-window rule

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire into `sweepAutoSecondAssign` — legacy-customer guard + missed-window check

**Files:**
- Modify: `lib/store.tsx`

**Interfaces:**
- Consumes: `secondAssignDueAt`, `isSecondAssignDue` (Task 2), `Customer.createdBy`, `Area.autoAssignResumedAt` (Task 1).

- [ ] **Step 1: Import the new module**

In `lib/store.tsx`, find:

```ts
import { computeSlotAges, isStalePastPull } from "./inactiveListings";
import { computeBlastSweep, sampleForApproval, splitIntoBatches } from "./blasting";
```

Replace with:

```ts
import { computeSlotAges, isStalePastPull } from "./inactiveListings";
import { computeBlastSweep, sampleForApproval, splitIntoBatches } from "./blasting";
import { isSecondAssignDue, secondAssignDueAt } from "./autoSecondAssign";
```

- [ ] **Step 2: Drop the now-unused local day-constants from `sweepAutoSecondAssign`**

Find (search for `function sweepAutoSecondAssign`):

```ts
  function sweepAutoSecondAssign(customersList: Customer[], areasList: Area[], usersList: User[], stagesList: Stage[], activitiesList: Activity[], isAdmin: boolean) {
    if (!isAdmin) return;
    const defaultStage = stagesList.find((s) => s.isDefault) ?? stagesList[0];
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const supabase = createClient();
```

Replace with:

```ts
  function sweepAutoSecondAssign(customersList: Customer[], areasList: Area[], usersList: User[], stagesList: Stage[], activitiesList: Activity[], isAdmin: boolean) {
    if (!isAdmin) return;
    const defaultStage = stagesList.find((s) => s.isDefault) ?? stagesList[0];
    const now = Date.now();
    const supabase = createClient();
```

- [ ] **Step 3: Replace the trigger-conditions block with the legacy-customer guard + pure due-date check**

Find:

```ts
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
```

Replace with:

```ts
    for (const c of customersList) {
      if (c.assignedToUserId2 || !c.assignedToUserId || !c.areaId) continue;
      if (!c.createdBy) continue; // legacy/imported customer, never eligible
      const area = areasList.find((a) => a.id === c.areaId);
      if (!area || area.teamIds.length === 0 || !area.autoAssignEnabled) continue;
      const slot1Stage = c.stage1Id ? stagesList.find((s) => s.id === c.stage1Id) : undefined;
      const dueAt = secondAssignDueAt(c, activitiesList, slot1Stage);
      if (!isSecondAssignDue(dueAt, area.autoAssignResumedAt, now)) continue;
```

- [ ] **Step 4: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add lib/store.tsx
git commit -m "$(cat <<'EOF'
sweepAutoSecondAssign: exclude legacy customers, honor area-reopen missed-window rule

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `updateAreaAutoAssign` — stamp `autoAssignResumedAt` on off→on

**Files:**
- Modify: `lib/store.tsx`

**Interfaces:**
- Consumes: `Area.autoAssignResumedAt` (Task 1).
- Produces: `updateAreaAutoAssign` now also writes `auto_assign_resumed_at` when `enabled` flips `false` → `true`.

- [ ] **Step 1: Update the function body**

Find (search for `function updateAreaAutoAssign`):

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

Replace with:

```ts
  function updateAreaAutoAssign(id: string, enabled: boolean) {
    const target = areas.find((a) => a.id === id);
    if (!target) return;
    const prevEnabled = target.autoAssignEnabled;
    const prevResumedAt = target.autoAssignResumedAt;
    const resuming = enabled && !prevEnabled;
    const nowIso = new Date().toISOString();
    setAreas((prev) =>
      prev.map((a) => (a.id === id ? { ...a, autoAssignEnabled: enabled, ...(resuming ? { autoAssignResumedAt: nowIso } : {}) } : a))
    );
    const supabase = createClient();
    supabase
      .from("areas")
      .update({ auto_assign_enabled: enabled, ...(resuming ? { auto_assign_resumed_at: nowIso } : {}) })
      .eq("id", id)
      .then(({ error }) => {
        if (error) setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, autoAssignEnabled: prevEnabled, autoAssignResumedAt: prevResumedAt } : a)));
      });
  }
```

- [ ] **Step 2: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add lib/store.tsx
git commit -m "$(cat <<'EOF'
updateAreaAutoAssign: stamp auto_assign_resumed_at on off->on transition

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Schema — `customers.created_by` (already live) + new `areas.auto_assign_resumed_at`

**Files:**
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: column `areas.auto_assign_resumed_at timestamptz not null default now()`.

Note: `customers.created_by` already exists in production (confirmed via a live read during investigation — 29 of 159 rows have it set) and is already in the `create table customers (...)` block in this file. Nothing to change there; Tasks 1–3 just start reading a column that was already being written.

- [ ] **Step 1: Add the column to the main schema (fresh installs)**

In `supabase/schema.sql`, find `create table areas (...)` (around line 65):

```sql
create table areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  auto_assign_enabled boolean not null default true,
  last_auto_assigned_user_id uuid references profiles (id) on delete set null
);
```

Replace with:

```sql
create table areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  auto_assign_enabled boolean not null default true,
  auto_assign_resumed_at timestamptz not null default now(),
  last_auto_assigned_user_id uuid references profiles (id) on delete set null
);
```

- [ ] **Step 2: Append the already-provisioned-database migration note**

At the very end of `supabase/schema.sql` (after the existing Area↔Team many-to-many migration block, which currently ends with `-- alter table teams drop column if exists last_auto_assigned_user_id;`), append:

```sql

-- ============================================================
-- Migration: Auto second-assign eligibility fix — legacy customers
-- (created_by IS NULL) are permanently excluded from auto 2nd-assign
-- (no schema change, customers.created_by already exists — this is a
-- code-only change), and areas gain auto_assign_resumed_at so a customer
-- whose 7/14-day window elapsed while the area's auto-assign was off is
-- never auto-caught-up once the area reopens. Run once against an
-- already-provisioned database (everything below already exists in the
-- main schema above for fresh installs).
-- See docs/superpowers/specs/2026-09-21-auto-second-assign-eligibility-fix-design.md
-- ============================================================
--
-- alter table areas add column if not exists auto_assign_resumed_at timestamptz not null default now();
```

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "$(cat <<'EOF'
Schema: add areas.auto_assign_resumed_at

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Flag the manual migration to the user**

This column does not exist in production yet. Per this repo's convention (schema.sql changes are never auto-applied), tell the user directly, in your final summary to them, that they must run this in the Supabase SQL editor before this feature works in prod:

```sql
alter table areas add column if not exists auto_assign_resumed_at timestamptz not null default now();
```

Until they run it, `loadAreas`'s `select("*")` simply won't return `auto_assign_resumed_at`, `mapArea` will map `undefined` into `autoAssignResumedAt`, and `isSecondAssignDue`'s `new Date(undefined).getTime()` will be `NaN` — every `dueAt < NaN` comparison is `false`, so the sweep silently falls through to treating everything as "not missed" (i.e. behaves like today, pre-fix) rather than crashing. Not a bug to fix — just note it so the user understands why the fix appears to do nothing until they run the SQL.

---

### Task 6: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm the DB migration ran**

Before testing in the browser, confirm with the user that Task 5 Step 4's `alter table` has been run in Supabase (ask if unsure — do not run DDL against production yourself).

- [ ] **Step 2: Legacy-customer exclusion**

Using the browser preview (`npm run dev`), log in as ADMIN. Pick a customer known to have `created_by = null` (any customer created before this app's Add Customer form existed) with slot 1 assigned and no slot 2, older than 7 days. Reload the page (triggers the sweep on load). Confirm slot 2 stays empty.

- [ ] **Step 3: Normal path still works for real customers**

As ADMIN/MANAGER, use the Add Customer form to create a new customer with slot 1 assigned, in an area with Auto Assign on. Backdate `created_at` in Supabase to 8 days ago (or wait). Reload as ADMIN. Confirm slot 2 gets filled via round-robin, same as before this change.

- [ ] **Step 4: Area-reopen missed-window rule**

Pick an area, turn Auto Assign off on `/admin/area`. Add a customer in that area (slot 1 only), backdate its `created_at` to 10 days ago. Confirm slot 2 stays empty while the area is off. Turn Auto Assign back on, reload as ADMIN. Confirm this customer's slot 2 is **not** filled (it missed its window while off) — check its row directly in Supabase to confirm `assigned_to_2` stays `null`. Then add a second customer to the same area *after* turning it back on, backdate that one's `created_at` to 8 days ago, reload — confirm this one **does** get 2nd-assigned normally.

- [ ] **Step 5: Appointment/Nego path unaffected**

Repeat Step 4's off/on scenario for a customer whose slot-1 stage is flagged `excludeFromAutoAssign` (Appointment or Nego) instead of the plain 7-day path — confirm the same permanent-skip behavior when its 14-day-idle due date falls before the area's reopen timestamp.

- [ ] **Step 6: Report results to the user**

Summarize what was verified and any deviations found, in chat — no code changes expected from this task unless a check above fails.
