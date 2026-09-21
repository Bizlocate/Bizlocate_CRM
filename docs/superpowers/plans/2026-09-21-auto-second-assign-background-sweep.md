# Auto Second-Assign Background Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move auto second-assign off the "runs only when an admin's browser loads the app" model onto a Netlify Scheduled Function that runs once a day server-side, so backlog can never again accumulate between admin logins.

**Architecture:** Extract the five DB-row mapping functions currently private to `lib/store.tsx` into a new framework-agnostic `lib/mappers.ts`. Extract the decision loop inside `sweepAutoSecondAssign` into a new pure function `computeAutoSecondAssignPlan` in the existing `lib/autoSecondAssign.ts`. Delete `sweepAutoSecondAssign` and its two client-side call sites entirely. Add `netlify/functions/sweep-auto-assign.mts`, a Netlify Scheduled Function (`@daily`) that reads the same five tables via the existing service-role admin client, calls `computeAutoSecondAssignPlan`, and writes the results back — this is the only place the logic runs from now on.

**Tech Stack:** Next.js App Router (TypeScript), Supabase (`@supabase/supabase-js`), Netlify Scheduled Functions (`.mts`, native Node TypeScript, no `@netlify/functions` dependency). No test framework in this repo — pure logic gets `node --experimental-strip-types` self-checks (existing convention); everything else verified via `npm run build` or a manual, isolated-fixture run against Supabase.

## Global Constraints

- Match existing code style exactly: no new npm dependencies, `select("*")` reads mapped through the existing `map*` functions, fire-and-forget-free explicit `await` on writes in the new server-side function (this is a one-shot script, not a React effect — no optimistic UI to manage).
- Every relocated function (the five mappers, `formatTimestamp`) must be a pure move: identical signature, identical body, zero behavior change. `lib/store.tsx`'s existing callers of these functions are not touched beyond the import line.
- `computeAutoSecondAssignPlan` must be a pure function: no Supabase calls, no React state, same within-one-pass round-robin/pool-limit collision handling (`pointerByArea`/`extraAssignedCount` locals) the current `sweepAutoSecondAssign` already has.
- Design reference: [`docs/superpowers/specs/2026-09-21-auto-second-assign-background-sweep-design.md`](../specs/2026-09-21-auto-second-assign-background-sweep-design.md).
- Scope is auto second-assign only — do not touch `sweepStalePool` or `sweepBlastRequests`, which stay exactly as they are (still triggered by an admin session loading the app).

---

### Task 1: Extract row-mapping functions into `lib/mappers.ts`

**Files:**
- Create: `lib/mappers.ts`
- Modify: `lib/store.tsx`

**Interfaces:**
- Produces: `mapProfile`, `mapArea`, `mapStage`, `mapCustomer`, `mapActivity`, `formatTimestamp`, all exported from `lib/mappers.ts` with their exact current signatures (unchanged).

- [ ] **Step 1: Create `lib/mappers.ts`**

```ts
import type { Activity, ActivityType, Area, Customer, PoolStatus, Role, Stage, User } from "./types";

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

export function mapProfile(row: { id: string; name: string; email: string; phone: string | null; ic: string | null; role: Role; team_id: string | null; status: string; active_pool_limit: number | null; inactive_pool_limit: number | null; auto_assign_enabled: boolean }): User {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone, ic: row.ic, role: row.role, teamId: row.team_id, active: row.status === "ACTIVE", activePoolLimit: row.active_pool_limit, inactivePoolLimit: row.inactive_pool_limit, autoAssignEnabled: row.auto_assign_enabled ?? true };
}

export function mapArea(row: { id: string; name: string; auto_assign_enabled: boolean; auto_assign_resumed_at: string; last_auto_assigned_user_id: string | null }, teamIds: string[]): Area {
  return { id: row.id, name: row.name, teamIds, autoAssignEnabled: row.auto_assign_enabled ?? true, autoAssignResumedAt: row.auto_assign_resumed_at, lastAutoAssignedUserId: row.last_auto_assigned_user_id };
}

export function mapStage(row: { id: string; name: string; order: number; is_default: boolean; requires_amount: boolean; exclude_from_auto_assign: boolean }): Stage {
  return { id: row.id, name: row.name, order: row.order, isDefault: row.is_default, requiresAmount: row.requires_amount, excludeFromAutoAssign: row.exclude_from_auto_assign ?? false };
}

export function mapCustomer(row: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  optional_phone: string | null;
  assigned_to: string | null;
  assigned_to_2: string | null;
  assigned_to_3: string | null;
  pool_1: PoolStatus | null;
  pool_2: PoolStatus | null;
  pool_3: PoolStatus | null;
  pool_1_since: string | null;
  pool_2_since: string | null;
  pool_3_since: string | null;
  stage_1: string | null;
  stage_2: string | null;
  stage_3: string | null;
  source_id: string | null;
  area_id: string | null;
  sub_area_id: string | null;
  property_type_id: string | null;
  purpose_id: string | null;
  business_industry_id: string | null;
  business_category_id: string | null;
  business_type_id: string | null;
  race_id: string | null;
  language_id: string | null;
  business_name: string | null;
  firsttime_branch_id: string | null;
  target_race_id: string | null;
  target_type_id: string | null;
  budget_min: number | null;
  budget_max: number | null;
  remark: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}): Customer {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? "",
    phone: row.phone ?? "",
    assignedToUserId: row.assigned_to,
    assignedToUserId2: row.assigned_to_2,
    assignedToUserId3: row.assigned_to_3,
    pool1: row.pool_1,
    pool2: row.pool_2,
    pool3: row.pool_3,
    pool1Since: row.pool_1_since,
    pool2Since: row.pool_2_since,
    pool3Since: row.pool_3_since,
    stage1Id: row.stage_1,
    stage2Id: row.stage_2,
    stage3Id: row.stage_3,
    sourceId: row.source_id,
    areaId: row.area_id,
    subAreaId: row.sub_area_id,
    propertyTypeId: row.property_type_id,
    purposeId: row.purpose_id,
    businessIndustryId: row.business_industry_id,
    businessCategoryId: row.business_category_id,
    businessTypeId: row.business_type_id,
    raceId: row.race_id,
    languageId: row.language_id,
    businessName: row.business_name ?? "",
    firsttimeBranchId: row.firsttime_branch_id,
    targetRaceId: row.target_race_id,
    targetTypeId: row.target_type_id,
    budgetMin: row.budget_min,
    budgetMax: row.budget_max,
    optionalPhone: row.optional_phone ?? "",
    remark: row.remark ?? "",
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapActivity(row: {
  id: string;
  customer_id: string;
  type: ActivityType;
  content: string;
  follow_up: string | null;
  user_id: string;
  created_at: string;
}, usersById: Map<string, User>): Activity {
  return {
    id: row.id,
    customerId: row.customer_id,
    type: row.type,
    content: row.content,
    followUp: row.follow_up ?? "",
    author: usersById.get(row.user_id)?.name ?? "",
    authorUserId: row.user_id,
    time: formatTimestamp(row.created_at),
    createdAt: row.created_at,
  };
}
```

- [ ] **Step 2: Add the import to `lib/store.tsx`**

Find (near the top, search for `import { isSecondAssignDue } from "./autoSecondAssign";`):

```ts
import { computeBlastSweep, sampleForApproval, splitIntoBatches } from "./blasting";
import { isSecondAssignDue } from "./autoSecondAssign";
```

Replace with:

```ts
import { computeBlastSweep, sampleForApproval, splitIntoBatches } from "./blasting";
import { isSecondAssignDue } from "./autoSecondAssign";
import { formatTimestamp, mapActivity, mapArea, mapCustomer, mapProfile, mapStage } from "./mappers";
```

- [ ] **Step 3: Remove `mapProfile` from `lib/store.tsx`**

Find:

```ts
function mapProfile(row: { id: string; name: string; email: string; phone: string | null; ic: string | null; role: Role; team_id: string | null; status: string; active_pool_limit: number | null; inactive_pool_limit: number | null; auto_assign_enabled: boolean }): User {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone, ic: row.ic, role: row.role, teamId: row.team_id, active: row.status === "ACTIVE", activePoolLimit: row.active_pool_limit, inactivePoolLimit: row.inactive_pool_limit, autoAssignEnabled: row.auto_assign_enabled ?? true };
}

function mapTeam(row: { id: string; name: string; manager_id: string | null }): Team {
```

Replace with (i.e. delete the `mapProfile` function, keep `mapTeam`):

```ts
function mapTeam(row: { id: string; name: string; manager_id: string | null }): Team {
```

- [ ] **Step 4: Remove `mapArea` from `lib/store.tsx`**

Find:

```ts
function mapArea(row: { id: string; name: string; auto_assign_enabled: boolean; auto_assign_resumed_at: string; last_auto_assigned_user_id: string | null }, teamIds: string[]): Area {
  return { id: row.id, name: row.name, teamIds, autoAssignEnabled: row.auto_assign_enabled ?? true, autoAssignResumedAt: row.auto_assign_resumed_at, lastAutoAssignedUserId: row.last_auto_assigned_user_id };
}

function mapSubArea(row: { id: string; area_id: string; name: string }): SubArea {
```

Replace with (delete `mapArea`, keep `mapSubArea`):

```ts
function mapSubArea(row: { id: string; area_id: string; name: string }): SubArea {
```

- [ ] **Step 5: Remove `mapStage` and `mapCustomer` from `lib/store.tsx`**

These two are adjacent in the file. Find (search for `function mapStage(row: { id: string; name: string; order: number;` through the end of `mapCustomer`):

```ts
function mapStage(row: { id: string; name: string; order: number; is_default: boolean; requires_amount: boolean; exclude_from_auto_assign: boolean }): Stage {
  return { id: row.id, name: row.name, order: row.order, isDefault: row.is_default, requiresAmount: row.requires_amount, excludeFromAutoAssign: row.exclude_from_auto_assign ?? false };
}

function mapCustomer(row: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  optional_phone: string | null;
  assigned_to: string | null;
  assigned_to_2: string | null;
  assigned_to_3: string | null;
  pool_1: PoolStatus | null;
  pool_2: PoolStatus | null;
  pool_3: PoolStatus | null;
  pool_1_since: string | null;
  pool_2_since: string | null;
  pool_3_since: string | null;
  stage_1: string | null;
  stage_2: string | null;
  stage_3: string | null;
  source_id: string | null;
  area_id: string | null;
  sub_area_id: string | null;
  property_type_id: string | null;
  purpose_id: string | null;
  business_industry_id: string | null;
  business_category_id: string | null;
  business_type_id: string | null;
  race_id: string | null;
  language_id: string | null;
  business_name: string | null;
  firsttime_branch_id: string | null;
  target_race_id: string | null;
  target_type_id: string | null;
  budget_min: number | null;
  budget_max: number | null;
  remark: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}): Customer {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? "",
    phone: row.phone ?? "",
    assignedToUserId: row.assigned_to,
    assignedToUserId2: row.assigned_to_2,
    assignedToUserId3: row.assigned_to_3,
    pool1: row.pool_1,
    pool2: row.pool_2,
    pool3: row.pool_3,
    pool1Since: row.pool_1_since,
    pool2Since: row.pool_2_since,
    pool3Since: row.pool_3_since,
    stage1Id: row.stage_1,
    stage2Id: row.stage_2,
    stage3Id: row.stage_3,
    sourceId: row.source_id,
    areaId: row.area_id,
    subAreaId: row.sub_area_id,
    propertyTypeId: row.property_type_id,
    purposeId: row.purpose_id,
    businessIndustryId: row.business_industry_id,
    businessCategoryId: row.business_category_id,
    businessTypeId: row.business_type_id,
    raceId: row.race_id,
    languageId: row.language_id,
    businessName: row.business_name ?? "",
    firsttimeBranchId: row.firsttime_branch_id,
    targetRaceId: row.target_race_id,
    targetTypeId: row.target_type_id,
    budgetMin: row.budget_min,
    budgetMax: row.budget_max,
    optionalPhone: row.optional_phone ?? "",
    remark: row.remark ?? "",
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CustomerProfileInput {
```

Replace with (delete both functions, keep the interface that follows):

```ts
export interface CustomerProfileInput {
```

- [ ] **Step 6: Remove `mapActivity` from `lib/store.tsx`**

Find:

```ts
function mapActivity(row: {
  id: string;
  customer_id: string;
  type: ActivityType;
  content: string;
  follow_up: string | null;
  user_id: string;
  created_at: string;
}, usersById: Map<string, User>): Activity {
  return {
    id: row.id,
    customerId: row.customer_id,
    type: row.type,
    content: row.content,
    followUp: row.follow_up ?? "",
    author: usersById.get(row.user_id)?.name ?? "",
    authorUserId: row.user_id,
    time: formatTimestamp(row.created_at),
    createdAt: row.created_at,
  };
}

// changed_by_name is a permanent text snapshot taken when the row was
```

Replace with (delete the function, keep the comment that follows for `mapChangeLog`):

```ts
// changed_by_name is a permanent text snapshot taken when the row was
```

- [ ] **Step 7: Remove `formatTimestamp` from `lib/store.tsx`**

Find:

```ts
function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

// One Realtime channel (see the effect in StoreProvider) drives every
```

Replace with (delete the function, keep the comment that follows):

```ts
// One Realtime channel (see the effect in StoreProvider) drives every
```

- [ ] **Step 8: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors. `Role`, `PoolStatus`, and `ActivityType` stay used elsewhere in `lib/store.tsx` (e.g. `updateUserRole`, `togglePool`, `addActivity`) even after the five functions move out, so their import lines in `lib/store.tsx` do not need to change.

- [ ] **Step 9: Commit**

```bash
git add lib/mappers.ts lib/store.tsx
git commit -m "$(cat <<'EOF'
Extract row-mapping functions into lib/mappers.ts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Pure `computeAutoSecondAssignPlan` in `lib/autoSecondAssign.ts`

**Files:**
- Modify: `lib/autoSecondAssign.ts`
- Modify: `lib/autoSecondAssign.check.ts`

**Interfaces:**
- Consumes: `secondAssignDueAt`, `isSecondAssignDue` (both already in this file, unchanged), `Area`, `User` types (newly imported into this file).
- Produces: `SecondAssignAction` interface and `computeAutoSecondAssignPlan(customers, areas, users, stages, activities, now): SecondAssignAction[]`, both exported from `lib/autoSecondAssign.ts`.

- [ ] **Step 1: Add the `Area`/`User` type imports**

In `lib/autoSecondAssign.ts`, find:

```ts
import type { Activity, Customer, Stage } from "./types";
```

Replace with:

```ts
import type { Activity, Area, Customer, Stage, User } from "./types";
```

- [ ] **Step 2: Add `SecondAssignAction` and `computeAutoSecondAssignPlan`**

Append to the end of `lib/autoSecondAssign.ts` (after the existing `isSecondAssignDue` function):

```ts

export interface SecondAssignAction {
  customerId: string;
  areaId: string;
  winnerId: string;
  stageId: string | null;
}

/**
 * The full slot-2 auto-assign decision for one sweep pass: which customers
 * are due, who wins each one via round-robin, honoring each candidate's
 * activePoolLimit. Pure — returns the plan as data, does not write
 * anything. A single call can produce multiple actions for the same area;
 * pointerByArea/extraAssignedCount track this call's own in-progress
 * picks so the second customer processed for an area sees the first one's
 * winner, instead of both reading the same stale round-robin pointer and
 * colliding on the same person.
 */
export function computeAutoSecondAssignPlan(
  customers: Customer[],
  areas: Area[],
  users: User[],
  stages: Stage[],
  activities: Activity[],
  now: number
): SecondAssignAction[] {
  const defaultStage = stages.find((s) => s.isDefault) ?? stages[0];
  const actions: SecondAssignAction[] = [];
  const pointerByArea = new Map<string, string | null>();
  const extraAssignedCount = new Map<string, number>();
  for (const c of customers) {
    if (c.assignedToUserId2 || !c.assignedToUserId || !c.areaId) continue;
    if (!c.createdBy) continue; // legacy/imported customer, never eligible
    const area = areas.find((a) => a.id === c.areaId);
    if (!area || area.teamIds.length === 0 || !area.autoAssignEnabled) continue;
    const slot1Stage = c.stage1Id ? stages.find((s) => s.id === c.stage1Id) : undefined;
    if (!isSecondAssignDue(c, activities, slot1Stage, area.autoAssignResumedAt, now)) continue;
    const excluded = [c.assignedToUserId, c.assignedToUserId3].filter((id): id is string => !!id);
    const candidates = users
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
        const activeCount = customers.filter((other) =>
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
    actions.push({ customerId: c.id, areaId: area.id, winnerId, stageId: defaultStage?.id ?? null });
  }
  return actions;
}
```

- [ ] **Step 3: Add fixture helpers and 5 new test cases to `lib/autoSecondAssign.check.ts`**

Find the type import line and the existing `customer`/`activity` fixture helpers:

```ts
import type { Activity, Customer, Stage } from "./types.ts";
```

Replace with:

```ts
import type { Activity, Area, Customer, Stage, User } from "./types.ts";
```

Find:

```ts
import { FOURTEEN_DAYS_MS, SEVEN_DAYS_MS, isSecondAssignDue, secondAssignDueAt } from "./autoSecondAssign.ts";
```

Replace with:

```ts
import { FOURTEEN_DAYS_MS, SEVEN_DAYS_MS, computeAutoSecondAssignPlan, isSecondAssignDue, secondAssignDueAt } from "./autoSecondAssign.ts";
```

Find the end of the `activity` fixture helper (right before `function isoDaysAgo`):

```ts
function activity(overrides: Partial<Activity> & { id: string; customerId: string; authorUserId: string; createdAt: string }): Activity {
  return { type: "CALL", content: "", followUp: "", author: "", time: "", ...overrides };
}

function isoDaysAgo(days: number): string {
```

Replace with (adds `area` and `user` fixture helpers):

```ts
function activity(overrides: Partial<Activity> & { id: string; customerId: string; authorUserId: string; createdAt: string }): Activity {
  return { type: "CALL", content: "", followUp: "", author: "", time: "", ...overrides };
}

function area(overrides: Partial<Area> & { id: string }): Area {
  return { name: "Area", teamIds: [], autoAssignEnabled: true, autoAssignResumedAt: new Date(0).toISOString(), lastAutoAssignedUserId: null, ...overrides };
}

function user(overrides: Partial<User> & { id: string; name: string }): User {
  return { email: "", phone: null, ic: null, role: "SALESPERSON", teamId: null, active: true, activePoolLimit: null, inactivePoolLimit: null, autoAssignEnabled: true, ...overrides };
}

function isoDaysAgo(days: number): string {
```

Find the final line of the file:

```ts
console.log("autoSecondAssign.check.ts: all assertions passed");
```

Replace with (adds the 5 new test blocks before the final log line):

```ts
// --- computeAutoSecondAssignPlan: two eligible candidates, two due customers in one
// pass -> round-robins between them, not both landing on the same person (regression
// check for the pointerByArea/extraAssignedCount same-pass collision handling). ---
{
  const a = area({ id: "area-1", teamIds: ["team-1"], autoAssignResumedAt: isoDaysAgo(365) });
  const u1 = user({ id: "sp-1", name: "Alice", teamId: "team-1" });
  const u2 = user({ id: "sp-2", name: "Bob", teamId: "team-1" });
  const c1 = customer({ id: "cust-1", areaId: "area-1", assignedToUserId: "owner-1", createdAt: isoDaysAgo(10) });
  const c2 = customer({ id: "cust-2", areaId: "area-1", assignedToUserId: "owner-1", createdAt: isoDaysAgo(10) });
  const actions = computeAutoSecondAssignPlan([c1, c2], [a], [u1, u2], [], [], NOW);
  assert.strictEqual(actions.length, 2);
  assert.strictEqual(actions[0].winnerId, "sp-1");
  assert.strictEqual(actions[1].winnerId, "sp-2");
}

// --- computeAutoSecondAssignPlan: a candidate already at their activePoolLimit is
// skipped in favor of the next candidate. ---
{
  const a = area({ id: "area-2", teamIds: ["team-2"], autoAssignResumedAt: isoDaysAgo(365) });
  const u1 = user({ id: "sp-3", name: "Alice", teamId: "team-2", activePoolLimit: 1 });
  const u2 = user({ id: "sp-4", name: "Bob", teamId: "team-2" });
  const existing = customer({ id: "existing", areaId: "area-2", assignedToUserId: "sp-3", pool1: "ACTIVE", createdAt: isoDaysAgo(1) });
  const target = customer({ id: "target", areaId: "area-2", assignedToUserId: "owner-2", createdAt: isoDaysAgo(10) });
  const actions = computeAutoSecondAssignPlan([existing, target], [a], [u1, u2], [], [], NOW);
  assert.strictEqual(actions.length, 1);
  assert.strictEqual(actions[0].winnerId, "sp-4");
}

// --- computeAutoSecondAssignPlan: a legacy customer (createdBy: null) never produces
// an action, no matter how overdue. ---
{
  const a = area({ id: "area-3", teamIds: ["team-3"], autoAssignResumedAt: isoDaysAgo(365) });
  const u1 = user({ id: "sp-5", name: "Alice", teamId: "team-3" });
  const c = customer({ id: "legacy-1", areaId: "area-3", assignedToUserId: "owner-3", createdAt: isoDaysAgo(10), createdBy: null });
  const actions = computeAutoSecondAssignPlan([c], [a], [u1], [], [], NOW);
  assert.strictEqual(actions.length, 0);
}

// --- computeAutoSecondAssignPlan: a customer whose due date fell before the area's
// autoAssignResumedAt never produces an action (missed-window rule). ---
{
  const a = area({ id: "area-4", teamIds: ["team-4"], autoAssignResumedAt: isoDaysAgo(5) });
  const u1 = user({ id: "sp-6", name: "Alice", teamId: "team-4" });
  const c = customer({ id: "missed-1", areaId: "area-4", assignedToUserId: "owner-4", createdAt: isoDaysAgo(20) });
  const actions = computeAutoSecondAssignPlan([c], [a], [u1], [], [], NOW);
  assert.strictEqual(actions.length, 0);
}

// --- computeAutoSecondAssignPlan: no candidates available (empty team) -> no action,
// no throw. ---
{
  const a = area({ id: "area-5", teamIds: ["team-5"], autoAssignResumedAt: isoDaysAgo(365) });
  const c = customer({ id: "orphan-1", areaId: "area-5", assignedToUserId: "owner-5", createdAt: isoDaysAgo(10) });
  const actions = computeAutoSecondAssignPlan([c], [a], [], [], [], NOW);
  assert.strictEqual(actions.length, 0);
}

console.log("autoSecondAssign.check.ts: all assertions passed");
```

- [ ] **Step 4: Run the self-check**

Run:

```bash
node --experimental-strip-types lib/autoSecondAssign.check.ts
```

Expected: `autoSecondAssign.check.ts: all assertions passed` printed, exit code 0.

- [ ] **Step 5: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add lib/autoSecondAssign.ts lib/autoSecondAssign.check.ts
git commit -m "$(cat <<'EOF'
Add computeAutoSecondAssignPlan: pure version of the sweep's decision logic

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Remove the client-side sweep

**Files:**
- Modify: `lib/store.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `sweepAutoSecondAssign` no longer exists; its two call sites are removed.

- [ ] **Step 1: Delete the `sweepAutoSecondAssign` function and its doc comment**

In `lib/store.tsx`, find (search for `// Auto second-assignment: once a customer's slot 1 has been assigned`):

```ts
  // Auto second-assignment: once a customer's slot 1 has been assigned, if
  // slot 2 is still empty, round-robin the next active SALESPERSON from the
  // team that owns the customer's area into slot 2 — after 7 days normally,
  // or after 14 idle days (no activity log) if the customer's slot-1 stage
  // is flagged to skip auto-assign. Skipped entirely if the area's
  // auto-assign switch is off. Deliberately does NOT call
  // reassignCustomer/assignmentError —
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
  function sweepAutoSecondAssign(customersList: Customer[], areasList: Area[], usersList: User[], stagesList: Stage[], activitiesList: Activity[], isAdmin: boolean) {
    if (!isAdmin) return;
    const defaultStage = stagesList.find((s) => s.isDefault) ?? stagesList[0];
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
      if (!c.createdBy) continue; // legacy/imported customer, never eligible
      const area = areasList.find((a) => a.id === c.areaId);
      if (!area || area.teamIds.length === 0 || !area.autoAssignEnabled) continue;
      const slot1Stage = c.stage1Id ? stagesList.find((s) => s.id === c.stage1Id) : undefined;
      if (!isSecondAssignDue(c, activitiesList, slot1Stage, area.autoAssignResumedAt, now)) continue;
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

  async function loadTasks(): Promise<Task[]> {
```

Replace with (delete the whole function and its comment, keep `loadTasks`):

```ts
  async function loadTasks(): Promise<Task[]> {
```

- [ ] **Step 2: Remove the two call sites**

Find (in the initial-load `useEffect`):

```ts
          sweepStalePool(loadedCustomers, loadedActivities, loadedAssignmentEvents, loadedTasks, profile.id, profile.role === "ADMIN");
          sweepAutoSecondAssign(loadedCustomers, loadResults[2], loadedUsers, loadResults[16], loadedActivities, profile.role === "ADMIN");
          sweepBlastRequests(loadedBlastRequests, loadedBlastItems, profile.role === "ADMIN");
```

Replace with:

```ts
          sweepStalePool(loadedCustomers, loadedActivities, loadedAssignmentEvents, loadedTasks, profile.id, profile.role === "ADMIN");
          sweepBlastRequests(loadedBlastRequests, loadedBlastItems, profile.role === "ADMIN");
```

Find (in `login()` — the second, near-identical occurrence, distinguished by the surrounding `session_token` lines right above it):

```ts
    sweepStalePool(loadedCustomers, loadedActivities, loadedAssignmentEvents, loadedTasks, profile.id, profile.role === "ADMIN");
    sweepAutoSecondAssign(loadedCustomers, loadResults[2], loadedUsers, loadResults[16], loadedActivities, profile.role === "ADMIN");
    sweepBlastRequests(loadedBlastRequests, loadedBlastItems, profile.role === "ADMIN");
```

Replace with:

```ts
    sweepStalePool(loadedCustomers, loadedActivities, loadedAssignmentEvents, loadedTasks, profile.id, profile.role === "ADMIN");
    sweepBlastRequests(loadedBlastRequests, loadedBlastItems, profile.role === "ADMIN");
```

- [ ] **Step 3: Remove the now-unused `isSecondAssignDue` import**

Find:

```ts
import { computeBlastSweep, sampleForApproval, splitIntoBatches } from "./blasting";
import { isSecondAssignDue } from "./autoSecondAssign";
import { formatTimestamp, mapActivity, mapArea, mapCustomer, mapProfile, mapStage } from "./mappers";
```

Replace with:

```ts
import { computeBlastSweep, sampleForApproval, splitIntoBatches } from "./blasting";
import { formatTimestamp, mapActivity, mapArea, mapCustomer, mapProfile, mapStage } from "./mappers";
```

- [ ] **Step 4: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors, no unused-variable errors for `isSecondAssignDue` (it's fully removed, not just unused).

- [ ] **Step 5: Commit**

```bash
git add lib/store.tsx
git commit -m "$(cat <<'EOF'
Remove client-side sweepAutoSecondAssign — superseded by the background sweep

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Netlify Scheduled Function

**Files:**
- Create: `netlify/functions/sweep-auto-assign.mts`
- Modify: `netlify.toml`

**Interfaces:**
- Consumes: `createAdminClient` (`lib/supabase/admin.ts`, existing, unchanged), `mapProfile`/`mapArea`/`mapStage`/`mapCustomer`/`mapActivity` (Task 1), `computeAutoSecondAssignPlan` (Task 2).

- [ ] **Step 1: Create the scheduled function**

```ts
import { createAdminClient } from "../../lib/supabase/admin";
import { mapActivity, mapArea, mapCustomer, mapProfile, mapStage } from "../../lib/mappers";
import { computeAutoSecondAssignPlan } from "../../lib/autoSecondAssign";

export const config = { schedule: "@daily" };

export default async () => {
  const supabase = createAdminClient();

  const [
    { data: profileRows },
    { data: areaRows },
    { data: areaTeamRows },
    { data: stageRows },
    { data: customerRows },
    { data: activityRows },
  ] = await Promise.all([
    supabase.from("profiles").select("*"),
    supabase.from("areas").select("*"),
    supabase.from("area_teams").select("*"),
    supabase.from("pipeline_stages").select("*"),
    supabase.from("customers").select("*"),
    supabase.from("activities").select("*"),
  ]);

  const users = (profileRows ?? []).map(mapProfile);

  const teamIdsByArea = new Map<string, string[]>();
  for (const link of (areaTeamRows ?? []) as { area_id: string; team_id: string }[]) {
    const list = teamIdsByArea.get(link.area_id) ?? [];
    list.push(link.team_id);
    teamIdsByArea.set(link.area_id, list);
  }
  const areas = (areaRows ?? []).map((row) => mapArea(row, teamIdsByArea.get(row.id) ?? []));

  const stages = (stageRows ?? []).map(mapStage);
  const customers = (customerRows ?? []).map(mapCustomer);

  const usersById = new Map(users.map((u) => [u.id, u]));
  const activities = (activityRows ?? []).map((row) => mapActivity(row, usersById));

  const actions = computeAutoSecondAssignPlan(customers, areas, users, stages, activities, Date.now());

  for (const action of actions) {
    try {
      await supabase
        .from("customers")
        .update({ assigned_to_2: action.winnerId, pool_2: "ACTIVE", pool_2_since: null, stage_2: action.stageId })
        .eq("id", action.customerId);
      await supabase.from("areas").update({ last_auto_assigned_user_id: action.winnerId }).eq("id", action.areaId);
      await supabase.from("assignment_events").insert({ customer_id: action.customerId, user_id: action.winnerId, slot: 2 });
    } catch (err) {
      console.error(`sweep-auto-assign: failed to apply action for customer ${action.customerId}:`, err);
    }
  }

  console.log(`sweep-auto-assign: ${actions.length} customer(s) assigned`);
};
```

- [ ] **Step 2: Declare the functions directory in `netlify.toml`**

Find the full current contents of `netlify.toml`:

```toml
[build.environment]
  SECRETS_SCAN_OMIT_KEYS = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,NEXT_PUBLIC_SUPABASE_URL"
```

Replace with:

```toml
[build.environment]
  SECRETS_SCAN_OMIT_KEYS = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,NEXT_PUBLIC_SUPABASE_URL"

[functions]
  directory = "netlify/functions"
```

- [ ] **Step 3: Verify the module loads without error (no writes — this does not call the handler)**

`netlify/functions/*.mts` is outside this repo's `tsconfig.json` include patterns (`**/*.ts`/`**/*.tsx` don't match `.mts`), so `npm run build` does not type-check this file. Verify it separately by importing it (without invoking the default export) using Node's native TypeScript support:

```bash
node --experimental-strip-types --env-file=.env.local -e "await import('./netlify/functions/sweep-auto-assign.mts'); console.log('module loaded OK');"
```

Expected: `module loaded OK` printed, no errors. This confirms every import resolves and the file has no syntax/type errors, without touching the database (the default export is imported but not called).

- [ ] **Step 4: Commit**

```bash
git add netlify/functions/sweep-auto-assign.mts netlify.toml
git commit -m "$(cat <<'EOF'
Add Netlify Scheduled Function: daily auto second-assign sweep

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Manual end-to-end verification against isolated test data

**Files:** none (verification only)

This mirrors the exact QA method already used to verify the eligibility-fix feature this sweep is built on: create throwaway, clearly-named test rows (never real customers/areas), run the real function against them, verify the result, then delete every row created.

- [ ] **Step 1: Write a one-off setup script**

Create a scratch file (not committed — e.g. `qa_setup.tmp.mjs` at the repo root, matching this repo's existing convention for this kind of one-off check) using the service-role credentials from `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) to create, via `@supabase/supabase-js`:
- One throwaway area (e.g. `name: "QA-TEST-DELETE-ME sweep area"`, `auto_assign_enabled: true`, `auto_assign_resumed_at` far in the past), linked via `area_teams` to a real team that has at least one active, `auto_assign_enabled` SALESPERSON.
- One throwaway customer in that area (e.g. `name: "QA-TEST-DELETE-ME sweep customer"`, `created_by` set to a real admin/manager id, `assigned_to` set to any real user id, `created_at` backdated well past 7 days, `assigned_to_2: null`).

Print the created area id and customer id.

- [ ] **Step 2: Confirm the baseline**

Query the test customer's `assigned_to_2` directly via the service-role client — confirm it is `null` before running the function.

- [ ] **Step 3: Actually invoke the function**

```bash
node --experimental-strip-types --env-file=.env.local -e "const m = await import('./netlify/functions/sweep-auto-assign.mts'); await m.default();"
```

- [ ] **Step 4: Verify the result**

Query the test customer again — confirm `assigned_to_2` is now set to one of the eligible team members, `pool_2` is `ACTIVE`, and a matching row now exists in `assignment_events` (`customer_id` = the test customer, `slot: 2`). Also confirm the test area's `last_auto_assigned_user_id` was updated to match.

- [ ] **Step 5: Clean up**

Delete the test customer, the `area_teams` link, and the test area (in that order, so no foreign-key constraint blocks the delete) via the service-role client. Delete the scratch setup script file. Confirm with a final query that no row named `QA-TEST-DELETE-ME%` remains in `customers` or `areas`.

- [ ] **Step 6: Report results**

Summarize what was verified (module loads cleanly, function actually assigns slot 2 correctly against real Supabase, writes both the area pointer and the assignment_events row, test data fully cleaned up) in chat. No code changes expected from this task unless a check above fails.

- [ ] **Step 7: Remind the user of the one manual platform step this plan cannot do**

This plan cannot deploy the site or configure Netlify itself. After this branch is merged and deployed, tell the user to confirm in the Netlify dashboard (Functions tab) that `sweep-auto-assign` appears as a scheduled function with schedule `@daily`, and that a first automatic run appears in its logs within 24 hours.
