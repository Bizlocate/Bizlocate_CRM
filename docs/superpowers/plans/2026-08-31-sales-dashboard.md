# Sales Dashboard + Monthly $ Targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a role-scoped "Dashboard" tab (left of Customers) showing pipeline/revenue/activity metrics for ADMIN (company-wide), MANAGER (own team), and SALESPERSON (self), plus a new monthly $ target that ADMIN/MANAGER can set per person.

**Architecture:** One new DB table (`sales_targets`) wired into the existing `lib/store.tsx` context (same load/upsert pattern every other table already uses). A new pure-function module (`lib/dashboardMetrics.ts`) does all the counting/summing math, unit-tested with the repo's existing `node --experimental-strip-types *.check.ts` convention (no test framework installed — matches `lib/parseAreaCsv.check.ts`). A single new route (`app/(dashboard)/dashboard/page.tsx`) renders 5 sections, branching on `currentUser.role`, built up incrementally task by task. `MainNav` is updated last to link it all together.

**Tech Stack:** Next.js 15 (App Router) + React 18 + Supabase (Postgres + RLS), plain inline-style React (no CSS framework, no chart library — matches the whole existing codebase).

## Global Constraints

- No new npm dependencies (repo has none beyond `@supabase/*`, `next`, `react`, `xlsx` — see `package.json`). Charts are hand-rolled `<div>` bars, matching the "no dependency" rung of the ladder.
- Follow existing store.tsx conventions exactly: `mapX` row-mapper functions, `loadX` async loaders returning the mapped array, optimistic local `setX` before the Supabase call, snake_case DB columns / camelCase TS fields.
- Follow existing page conventions: inline `style={{...}}` objects, `.card` / `.btn` / `.btn-primary` / `.btn-outline` / `.field-input` / `.field-label` CSS classes from `app/globals.css` — no new CSS classes needed.
- `sales_targets` schema changes are NOT auto-applied to the live Supabase project by any task — `supabase/schema.sql` is a hand-run file (see its own top comment: "run once in Supabase SQL editor"). Task 1 ends with an explicit instruction for a human to paste the new SQL into the Supabase SQL Editor before Task 2 can be smoke-tested against real data.
- Money is formatted `"RM " + n.toLocaleString("en-MY", { maximumFractionDigits: 0 })` — no existing currency formatter to reuse (grepped, none exists), `en-MY` locale matches `formatTimestamp` in `lib/store.tsx:327`.
- `Activity.followUp` and `Task.due` are **freeform text**, not dates (confirmed: `app/(dashboard)/customers/[id]/page.tsx:727` — plain `<input placeholder="Due date">`, not `type="date"`). Nothing in this plan parses them as dates.

---

### Task 1: `sales_targets` table + `SalesTarget` type

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: `SalesTarget { id: string; userId: string; yearMonth: string; amount: number; setBy: string; createdAt: string; updatedAt: string }` — consumed by Task 2 (store) and Task 3 (metrics).
- Produces: DB table `sales_targets(id, user_id, year_month, amount, set_by, created_at, updated_at)`, unique on `(user_id, year_month)`.

- [ ] **Step 1: Add the table, right after `removal_requests` (after its unique index, before `create table tasks`)**

In `supabase/schema.sql`, find:
```sql
create unique index removal_requests_one_pending on removal_requests (customer_id, slot) where status = 'PENDING';

create table tasks (
```
Replace with:
```sql
create unique index removal_requests_one_pending on removal_requests (customer_id, slot) where status = 'PENDING';

create table sales_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  year_month text not null,
  amount numeric not null check (amount >= 0),
  set_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, year_month)
);

create table tasks (
```

- [ ] **Step 2: Enable RLS on the new table**

Find:
```sql
alter table removal_requests enable row level security;
alter table notifications enable row level security;
```
Replace with:
```sql
alter table removal_requests enable row level security;
alter table sales_targets enable row level security;
alter table notifications enable row level security;
```

- [ ] **Step 3: Add RLS policies (select/insert/update; no delete — out of scope)**

Find:
```sql
create policy "removal_requests_update" on removal_requests for update using (
  is_admin()
  or (
    exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
    and exists (
      select 1 from customers c
      where c.id = removal_requests.customer_id
        and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
    )
  )
);

-- notifications: recipient only; inserted by admin/manager on customer assignment
```
Replace with:
```sql
create policy "removal_requests_update" on removal_requests for update using (
  is_admin()
  or (
    exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
    and exists (
      select 1 from customers c
      where c.id = removal_requests.customer_id
        and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
    )
  )
);

-- sales_targets: admin sets anyone's; manager sets own team's + own; everyone
-- in scope can read (self, own team, or admin sees all)
create policy "sales_targets_select" on sales_targets for select using (
  is_admin()
  or user_id = auth.uid()
  or user_id in (select id from profiles where team_id = my_team_id())
);
create policy "sales_targets_insert" on sales_targets for insert with check (
  set_by = auth.uid()
  and (
    is_admin()
    or user_id = auth.uid()
    or user_id in (select id from profiles where team_id = my_team_id())
  )
);
create policy "sales_targets_update" on sales_targets for update using (
  is_admin()
  or user_id = auth.uid()
  or user_id in (select id from profiles where team_id = my_team_id())
);

-- notifications: recipient only; inserted by admin/manager on customer assignment
```

- [ ] **Step 4: Append the "already-provisioned database" migration block at the end of the file**

The file ends with the `activities_delete` migration comment block. Append after the very last line (`-- );`):
```sql

-- ============================================================
-- Migration: sales_targets table (monthly $ target per user) — run once
-- against an already-provisioned database (everything below already
-- exists in the main schema above for fresh installs).
-- ============================================================
--
-- create table sales_targets (
--   id uuid primary key default gen_random_uuid(),
--   user_id uuid not null references profiles(id) on delete cascade,
--   year_month text not null,
--   amount numeric not null check (amount >= 0),
--   set_by uuid not null references profiles(id),
--   created_at timestamptz not null default now(),
--   updated_at timestamptz not null default now(),
--   unique (user_id, year_month)
-- );
--
-- alter table sales_targets enable row level security;
--
-- create policy "sales_targets_select" on sales_targets for select using (
--   is_admin()
--   or user_id = auth.uid()
--   or user_id in (select id from profiles where team_id = my_team_id())
-- );
-- create policy "sales_targets_insert" on sales_targets for insert with check (
--   set_by = auth.uid()
--   and (
--     is_admin()
--     or user_id = auth.uid()
--     or user_id in (select id from profiles where team_id = my_team_id())
--   )
-- );
-- create policy "sales_targets_update" on sales_targets for update using (
--   is_admin()
--   or user_id = auth.uid()
--   or user_id in (select id from profiles where team_id = my_team_id())
-- );
```

- [ ] **Step 5: Add the `SalesTarget` type to `lib/types.ts`**

Add after `DealClosure` (right before `export interface RemovalReason`):
```ts
export interface SalesTarget {
  id: string;
  userId: string;
  yearMonth: string; // 'YYYY-MM'
  amount: number;
  setBy: string;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (the type isn't consumed anywhere yet, so nothing should break).

- [ ] **Step 7: Tell the user to run the SQL manually, then commit**

This step cannot be automated — say to the user: "Paste the new `sales_targets` table + RLS policies (the parts of `supabase/schema.sql` you just added, not the bottom migration-comment copy) into the Supabase SQL Editor for the project and run them, then let me know so I can continue." Wait for confirmation before Task 2's manual/browser testing will show real data (Task 2's typecheck doesn't need it, but nothing will load without the table existing).

```bash
git add supabase/schema.sql lib/types.ts
git commit -m "Add sales_targets table + SalesTarget type"
```

---

### Task 2: Wire `sales_targets` into `lib/store.tsx`

**Files:**
- Modify: `lib/store.tsx`

**Interfaces:**
- Consumes: `SalesTarget` from Task 1 (`lib/types.ts`).
- Produces: `useStore().salesTargets: SalesTarget[]` and `useStore().upsertSalesTarget(userId: string, yearMonth: string, amount: number): void` — consumed by Task 4 (page).

- [ ] **Step 1: Add `SalesTarget` to the type import block**

Find (in the `import { ... } from "./types";` block):
```ts
  Role,
  Stage,
```
Replace with:
```ts
  Role,
  SalesTarget,
  Stage,
```

- [ ] **Step 2: Add the row mapper, right after `mapDealClosure`**

Find:
```ts
function mapRemovalRequest(row: {
```
Replace with:
```ts
function mapSalesTarget(row: {
  id: string;
  user_id: string;
  year_month: string;
  amount: number;
  set_by: string;
  created_at: string;
  updated_at: string;
}): SalesTarget {
  return {
    id: row.id,
    userId: row.user_id,
    yearMonth: row.year_month,
    amount: row.amount,
    setBy: row.set_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRemovalRequest(row: {
```

- [ ] **Step 3: Add to the `Store` interface**

Find:
```ts
  dealClosures: DealClosure[];
  removalReasons: RemovalReason[];
```
Replace with:
```ts
  dealClosures: DealClosure[];
  salesTargets: SalesTarget[];
  removalReasons: RemovalReason[];
```

Find:
```ts
  updateStageRequiresAmount: (id: string, requiresAmount: boolean) => void;
```
Replace with:
```ts
  updateStageRequiresAmount: (id: string, requiresAmount: boolean) => void;
  upsertSalesTarget: (userId: string, yearMonth: string, amount: number) => void;
```

- [ ] **Step 4: Add state**

Find:
```ts
  const [dealClosures, setDealClosures] = useState<DealClosure[]>([]);
```
Replace with:
```ts
  const [dealClosures, setDealClosures] = useState<DealClosure[]>([]);
  const [salesTargets, setSalesTargets] = useState<SalesTarget[]>([]);
```

- [ ] **Step 5: Add the loader, right after `loadDealClosures`**

Find:
```ts
  async function loadRemovalRequests(): Promise<RemovalRequest[]> {
```
Replace with:
```ts
  async function loadSalesTargets(): Promise<SalesTarget[]> {
    const supabase = createClient();
    const { data } = await supabase.from("sales_targets").select("*").order("year_month", { ascending: false });
    const mapped = (data ?? []).map(mapSalesTarget);
    setSalesTargets(mapped);
    return mapped;
  }

  async function loadRemovalRequests(): Promise<RemovalRequest[]> {
```

- [ ] **Step 6: Call the loader on init and on login**

Find (appears twice — once in the init `useEffect`, once in `login`):
```ts
        await loadDealClosures();
        await loadRemovalReasons();
```
Replace with (this exact block appears once — the init effect):
```ts
        await loadDealClosures();
        await loadSalesTargets();
        await loadRemovalReasons();
```

Find:
```ts
    await loadDealClosures();
    await loadRemovalReasons();
```
Replace with (this is the `login()` copy, note the different indentation — 4 spaces not 8):
```ts
    await loadDealClosures();
    await loadSalesTargets();
    await loadRemovalReasons();
```

- [ ] **Step 7: Add `upsertSalesTarget`, right after `updateStageRequiresAmount`**

Find:
```ts
  function updateStageRequiresAmount(id: string, requiresAmount: boolean) {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, requiresAmount } : s)));
    const supabase = createClient();
    supabase.from("pipeline_stages").update({ requires_amount: requiresAmount }).eq("id", id).then(() => {});
  }
```
Replace with:
```ts
  function updateStageRequiresAmount(id: string, requiresAmount: boolean) {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, requiresAmount } : s)));
    const supabase = createClient();
    supabase.from("pipeline_stages").update({ requires_amount: requiresAmount }).eq("id", id).then(() => {});
  }

  // Optimistic upsert on (user_id, year_month): updates the local row if one
  // exists for this user+month, otherwise appends a temp-id row until the
  // server response replaces it.
  function upsertSalesTarget(userId: string, yearMonth: string, amount: number) {
    if (!currentUser) return;
    const now = new Date().toISOString();
    setSalesTargets((prev) => {
      const existing = prev.find((t) => t.userId === userId && t.yearMonth === yearMonth);
      if (existing) return prev.map((t) => (t === existing ? { ...t, amount, updatedAt: now } : t));
      return [...prev, { id: `temp-${userId}-${yearMonth}`, userId, yearMonth, amount, setBy: currentUser.id, createdAt: now, updatedAt: now }];
    });
    const supabase = createClient();
    supabase
      .from("sales_targets")
      .upsert({ user_id: userId, year_month: yearMonth, amount, set_by: currentUser.id }, { onConflict: "user_id,year_month" })
      .select()
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          const mapped = mapSalesTarget(data);
          setSalesTargets((prev) => prev.map((t) => (t.userId === userId && t.yearMonth === yearMonth ? mapped : t)));
        }
      });
  }
```

- [ ] **Step 8: Expose in the context value**

Find:
```ts
    dealClosures,
    removalReasons,
```
Replace with:
```ts
    dealClosures,
    salesTargets,
    removalReasons,
```

Find:
```ts
    updateStageRequiresAmount,
    reassignCustomer,
```
Replace with:
```ts
    updateStageRequiresAmount,
    upsertSalesTarget,
    reassignCustomer,
```

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Manual smoke test (requires Task 1's SQL already run in Supabase)**

Run `npm run dev`, log in as any user, open the browser console, and confirm no errors on load (the new `loadSalesTargets()` call should silently return `[]` if the table is empty — no crash). If Task 1's SQL hasn't been run yet against this Supabase project, this will surface as a failed `sales_targets` query in the network tab (400/404) — expected until the human completes Task 1 Step 7.

- [ ] **Step 11: Commit**

```bash
git add lib/store.tsx
git commit -m "Load and upsert sales_targets in the store"
```

---

### Task 3: `lib/dashboardMetrics.ts` — pure calculation functions

**Files:**
- Create: `lib/dashboardMetrics.ts`
- Create: `lib/dashboardMetrics.check.ts`

**Interfaces:**
- Consumes: `Customer, Stage, DealClosure, Activity, Task, User, SalesTarget` from `lib/types.ts`.
- Produces (all consumed by Task 4–7's page code):
  - `yearMonthOf(iso: string): string`
  - `stageFunnel(customers: Customer[], stages: Stage[]): { stageId: string; stageName: string; count: number }[]`
  - `lostCount(customers: Customer[], stages: Stage[]): number`
  - `wonAmountInMonth(dealClosures: DealClosure[], yearMonth: string): number`
  - `leaderboard(users: User[], dealClosures: DealClosure[], salesTargets: SalesTarget[], activities: Activity[], yearMonth: string): { userId: string; name: string; won: number; target: number | null; attainmentPct: number | null; activityCount: number }[]`
  - `monthlyTrend(customers: Customer[], dealClosures: DealClosure[], monthsBack: number, now: Date): { yearMonth: string; won: number; newLeads: number }[]`
  - `openTaskCount(tasks: Task[], customerIds: Set<string>): number`
  - `pacePct(now: Date, yearMonth: string): number`
  - `conversionRatePct(dealClosures: DealClosure[], customers: Customer[], yearMonth: string): number | null`
  - `scopedUserIds(users: User[], currentUser: User): Set<string>`

- [ ] **Step 1: Write `lib/dashboardMetrics.ts`**

```ts
import { Activity, Customer, DealClosure, SalesTarget, Stage, Task, User } from "./types";

export function yearMonthOf(iso: string): string {
  return iso.slice(0, 7);
}

export interface FunnelRow {
  stageId: string;
  stageName: string;
  count: number;
}

// Counts across all 3 assignee slots — a customer with two slots in the
// same stage counts twice, matching how the pipeline actually works (each
// slot is its own independent deal).
export function stageFunnel(customers: Customer[], stages: Stage[]): FunnelRow[] {
  const sorted = [...stages].sort((a, b) => a.order - b.order);
  return sorted.map((s) => {
    const count = customers.filter((c) => c.stage1Id === s.id || c.stage2Id === s.id || c.stage3Id === s.id).length;
    return { stageId: s.id, stageName: s.name, count };
  });
}

// "Lost" isn't a schema flag — it's a naming convention the rest of the
// app already relies on (see STAGE_STYLES in lib/types.ts).
export function lostCount(customers: Customer[], stages: Stage[]): number {
  const lostStageIds = new Set(stages.filter((s) => s.name.trim().toLowerCase() === "lost").map((s) => s.id));
  if (lostStageIds.size === 0) return 0;
  return customers.filter(
    (c) =>
      (c.stage1Id !== null && lostStageIds.has(c.stage1Id)) ||
      (c.stage2Id !== null && lostStageIds.has(c.stage2Id)) ||
      (c.stage3Id !== null && lostStageIds.has(c.stage3Id))
  ).length;
}

export function wonAmountInMonth(dealClosures: DealClosure[], yearMonth: string): number {
  return dealClosures.filter((d) => yearMonthOf(d.createdAt) === yearMonth).reduce((sum, d) => sum + d.amount, 0);
}

export interface LeaderboardRow {
  userId: string;
  name: string;
  won: number;
  target: number | null;
  attainmentPct: number | null;
  activityCount: number;
}

export function leaderboard(
  users: User[],
  dealClosures: DealClosure[],
  salesTargets: SalesTarget[],
  activities: Activity[],
  yearMonth: string
): LeaderboardRow[] {
  const rows = users.map((u) => {
    const won = dealClosures
      .filter((d) => d.userId === u.id && yearMonthOf(d.createdAt) === yearMonth)
      .reduce((sum, d) => sum + d.amount, 0);
    const target = salesTargets.find((t) => t.userId === u.id && t.yearMonth === yearMonth)?.amount ?? null;
    const attainmentPct = target !== null && target > 0 ? Math.round((won / target) * 100) : null;
    const activityCount = activities.filter((a) => a.authorUserId === u.id && yearMonthOf(a.createdAt) === yearMonth).length;
    return { userId: u.id, name: u.name, won, target, attainmentPct, activityCount };
  });
  return rows.sort((a, b) => b.won - a.won);
}

export interface MonthPoint {
  yearMonth: string;
  won: number;
  newLeads: number;
}

// Oldest to newest, always `monthsBack` entries ending at `now`'s month.
export function monthlyTrend(customers: Customer[], dealClosures: DealClosure[], monthsBack: number, now: Date): MonthPoint[] {
  const points: MonthPoint[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const won = wonAmountInMonth(dealClosures, yearMonth);
    const newLeads = customers.filter((c) => yearMonthOf(c.createdAt) === yearMonth).length;
    points.push({ yearMonth, won, newLeads });
  }
  return points;
}

export function openTaskCount(tasks: Task[], customerIds: Set<string>): number {
  return tasks.filter((t) => !t.done && customerIds.has(t.customerId)).length;
}

// % of the given month elapsed as of `now`. A month that isn't the current
// one reads as 100% ("fully elapsed") — there's no partial pace to show for
// a past or future month.
export function pacePct(now: Date, yearMonth: string): number {
  const [y, m] = yearMonth.split("-").map(Number);
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (yearMonth !== currentYearMonth) return 100;
  const daysInMonth = new Date(y, m, 0).getDate();
  return Math.round((now.getDate() / daysInMonth) * 100);
}

// Rough approximation, not true cohort conversion: (# distinct customers
// with a won deal-closure this month) / (# customers created this month).
export function conversionRatePct(dealClosures: DealClosure[], customers: Customer[], yearMonth: string): number | null {
  const newLeads = customers.filter((c) => yearMonthOf(c.createdAt) === yearMonth).length;
  if (newLeads === 0) return null;
  const wonCustomerIds = new Set(dealClosures.filter((d) => yearMonthOf(d.createdAt) === yearMonth).map((d) => d.customerId));
  return Math.round((wonCustomerIds.size / newLeads) * 100);
}

export function scopedUserIds(users: User[], currentUser: User): Set<string> {
  if (currentUser.role === "ADMIN") return new Set(users.map((u) => u.id));
  if (currentUser.role === "MANAGER") return new Set(users.filter((u) => u.teamId === currentUser.teamId).map((u) => u.id));
  return new Set([currentUser.id]);
}
```

- [ ] **Step 2: Write `lib/dashboardMetrics.check.ts`**

```ts
// Self-check for dashboardMetrics. Run with:
//   node --experimental-strip-types lib/dashboardMetrics.check.ts
import assert from "node:assert";
import {
  conversionRatePct,
  leaderboard,
  lostCount,
  monthlyTrend,
  openTaskCount,
  pacePct,
  scopedUserIds,
  stageFunnel,
  wonAmountInMonth,
} from "./dashboardMetrics.ts";
import type { Activity, Customer, DealClosure, SalesTarget, Stage, Task, User } from "./types.ts";

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
    firsttimeBranchId: null, targetRaceId: null, targetTypeId: null, budgetId: null,
    remark: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function stage(overrides: Partial<Stage> & { id: string; name: string; order: number }): Stage {
  return { isDefault: false, requiresAmount: false, ...overrides };
}

function dealClosure(overrides: Partial<DealClosure> & { id: string; customerId: string; userId: string; amount: number; createdAt: string }): DealClosure {
  return { slot: 1, stageId: "won-stage", ...overrides };
}

function user(overrides: Partial<User> & { id: string; name: string }): User {
  return { email: "", phone: null, ic: null, role: "SALESPERSON", teamId: null, active: true, activePoolLimit: null, inactivePoolLimit: null, ...overrides };
}

function activity(overrides: Partial<Activity> & { id: string; customerId: string; authorUserId: string; createdAt: string }): Activity {
  return { type: "CALL", content: "", followUp: "", author: "", time: "", ...overrides };
}

function task(overrides: Partial<Task> & { id: string; customerId: string; done: boolean }): Task {
  return { title: "T", due: "", ...overrides };
}

// --- stageFunnel: counts across all 3 slots, ordered by stage.order ---
const newStage = stage({ id: "new", name: "New", order: 1 });
const wonStage = stage({ id: "won", name: "Won", order: 2 });
const lostStage = stage({ id: "lost", name: "Lost", order: 3 });
const funnelCustomers = [
  customer({ id: "c1", stage1Id: "new" }),
  customer({ id: "c2", stage2Id: "won" }),
  customer({ id: "c3", stage1Id: "won", stage3Id: "new" }),
];
const funnel = stageFunnel(funnelCustomers, [wonStage, newStage, lostStage]);
assert.deepEqual(funnel.map((f) => f.stageId), ["new", "won", "lost"], "sorted by order regardless of input order");
assert.equal(funnel.find((f) => f.stageId === "new")!.count, 2);
assert.equal(funnel.find((f) => f.stageId === "won")!.count, 2);
assert.equal(funnel.find((f) => f.stageId === "lost")!.count, 0);

// --- lostCount: matches stage name "Lost" case-insensitively, across slots ---
const lostCustomers = [customer({ id: "c1", stage2Id: "lost" }), customer({ id: "c2", stage1Id: "new" })];
assert.equal(lostCount(lostCustomers, [newStage, lostStage]), 1);
assert.equal(lostCount(lostCustomers, [newStage]), 0, "no Lost stage configured -> 0, not a crash");

// --- wonAmountInMonth ---
const closures = [
  dealClosure({ id: "d1", customerId: "c1", userId: "u1", amount: 100, createdAt: "2026-08-05T00:00:00Z" }),
  dealClosure({ id: "d2", customerId: "c2", userId: "u1", amount: 50, createdAt: "2026-07-05T00:00:00Z" }),
];
assert.equal(wonAmountInMonth(closures, "2026-08"), 100);
assert.equal(wonAmountInMonth(closures, "2026-07"), 50);
assert.equal(wonAmountInMonth(closures, "2026-09"), 0);

// --- leaderboard: sorted desc by won, target/attainment/activity per user ---
const users = [user({ id: "u1", name: "Alice" }), user({ id: "u2", name: "Bob" })];
const targets: SalesTarget[] = [{ id: "t1", userId: "u1", yearMonth: "2026-08", amount: 200, setBy: "admin", createdAt: "", updatedAt: "" }];
const activities = [
  activity({ id: "a1", customerId: "c1", authorUserId: "u1", createdAt: "2026-08-01T00:00:00Z" }),
  activity({ id: "a2", customerId: "c1", authorUserId: "u1", createdAt: "2026-07-01T00:00:00Z" }),
];
const board = leaderboard(users, closures, targets, activities, "2026-08");
assert.equal(board[0].name, "Alice", "Alice has 100 won this month, Bob has 0 -> Alice first");
assert.equal(board[0].won, 100);
assert.equal(board[0].target, 200);
assert.equal(board[0].attainmentPct, 50);
assert.equal(board[0].activityCount, 1, "only the August activity counts");
assert.equal(board[1].name, "Bob");
assert.equal(board[1].target, null, "no target row for Bob");
assert.equal(board[1].attainmentPct, null);

// --- monthlyTrend: oldest to newest, monthsBack entries ending at `now` ---
const trendCustomers = [customer({ id: "c1", createdAt: "2026-06-10T00:00:00Z" }), customer({ id: "c2", createdAt: "2026-08-10T00:00:00Z" })];
const trend = monthlyTrend(trendCustomers, closures, 3, new Date(2026, 7, 15)); // August 2026 (month index 7)
assert.deepEqual(trend.map((p) => p.yearMonth), ["2026-06", "2026-07", "2026-08"]);
assert.equal(trend[0].newLeads, 1);
assert.equal(trend[0].won, 0);
assert.equal(trend[1].won, 50);
assert.equal(trend[2].won, 100);
assert.equal(trend[2].newLeads, 1);

// --- openTaskCount ---
const tasks = [task({ id: "t1", customerId: "c1", done: false }), task({ id: "t2", customerId: "c1", done: true }), task({ id: "t3", customerId: "c2", done: false })];
assert.equal(openTaskCount(tasks, new Set(["c1"])), 1, "c1 has 1 open + 1 done; only the open one counts");
assert.equal(openTaskCount(tasks, new Set(["c1", "c2"])), 2);

// --- pacePct ---
assert.equal(pacePct(new Date(2026, 7, 15), "2026-07"), 100, "past month reads as fully elapsed");
assert.equal(pacePct(new Date(2026, 7, 31), "2026-08"), 100, "Aug 31 of 31 days = 100%");
assert.equal(pacePct(new Date(2026, 7, 15), "2026-08"), 48, "Aug 15 of 31 days = round(15/31*100) = 48");

// --- conversionRatePct: trendCustomers has 1 lead in Aug (c2); closures'
// won customerId in Aug is c1, which isn't in trendCustomers -> 0 of 1 won ---
assert.equal(conversionRatePct(closures, trendCustomers, "2026-08"), 0, "1 lead (c2) created in Aug, 0 of them (c2) won -> 0%");
assert.equal(conversionRatePct(closures, trendCustomers, "2026-05"), null, "no leads created in May -> null, not divide-by-zero");

// --- scopedUserIds ---
const admin = user({ id: "admin1", name: "Admin", role: "ADMIN" });
const manager = user({ id: "mgr1", name: "Mgr", role: "MANAGER", teamId: "team1" });
const teammate = user({ id: "u3", name: "Teammate", teamId: "team1" });
const other = user({ id: "u4", name: "Other", teamId: "team2" });
const allUsers = [admin, manager, teammate, other];
assert.deepEqual([...scopedUserIds(allUsers, admin)].sort(), ["admin1", "mgr1", "u3", "u4"].sort());
assert.deepEqual([...scopedUserIds(allUsers, manager)].sort(), ["mgr1", "u3"].sort());
const sales = user({ id: "u5", name: "Sales", role: "SALESPERSON" });
assert.deepEqual([...scopedUserIds(allUsers, sales)], ["u5"]);

console.log("dashboardMetrics: all checks passed");
```

- [ ] **Step 3: Run it**

Run: `node --experimental-strip-types lib/dashboardMetrics.check.ts`
Expected: `dashboardMetrics: all checks passed` — if any `assert` throws, fix `dashboardMetrics.ts` (not the test) unless the test's own expected value was computed wrong; re-run until it passes.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/dashboardMetrics.ts lib/dashboardMetrics.check.ts
git commit -m "Add dashboardMetrics pure calculation functions + self-check"
```

---

### Task 4: Dashboard page scaffold + Pipeline & 业绩 + 我的数字 sections

**Files:**
- Create: `app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `useStore()` (`currentUser, users, stages, dealClosures, activities, visibleCustomers, salesTargets`), `scopedUserIds, stageFunnel, lostCount, wonAmountInMonth` from `lib/dashboardMetrics.ts`.
- Produces: route `/dashboard`, reachable directly by URL (nav link added in Task 8).

- [ ] **Step 1: Write the page**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { lostCount, scopedUserIds, stageFunnel, wonAmountInMonth } from "@/lib/dashboardMetrics";

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMoney(n: number): string {
  return "RM " + n.toLocaleString("en-MY", { maximumFractionDigits: 0 });
}

function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-MY", { month: "short", year: "numeric" });
}

export default function DashboardPage() {
  const { currentUser, users, stages, dealClosures, activities, salesTargets, visibleCustomers } = useStore();
  const [yearMonth, setYearMonth] = useState(currentYearMonth);

  const scopedIds = useMemo(() => (currentUser ? scopedUserIds(users, currentUser) : new Set<string>()), [users, currentUser]);
  const scopedDealClosures = useMemo(() => dealClosures.filter((d) => scopedIds.has(d.userId)), [dealClosures, scopedIds]);
  const scopedTargets = useMemo(
    () => salesTargets.filter((t) => scopedIds.has(t.userId) && t.yearMonth === yearMonth),
    [salesTargets, scopedIds, yearMonth]
  );

  if (!currentUser) return null;

  const funnel = stageFunnel(visibleCustomers, stages);
  const won = wonAmountInMonth(scopedDealClosures, yearMonth);
  const lost = lostCount(visibleCustomers, stages);
  const targetTotal = scopedTargets.reduce((sum, t) => sum + t.amount, 0);
  const attainmentPct = targetTotal > 0 ? Math.round((won / targetTotal) * 100) : null;
  const maxFunnelCount = Math.max(1, ...funnel.map((f) => f.count));

  const myWon = wonAmountInMonth(dealClosures.filter((d) => d.userId === currentUser.id), yearMonth);
  const myTarget = salesTargets.find((t) => t.userId === currentUser.id && t.yearMonth === yearMonth)?.amount ?? null;
  const myAttainmentPct = myTarget && myTarget > 0 ? Math.round((myWon / myTarget) * 100) : null;
  const myActivityCount = activities.filter((a) => a.authorUserId === currentUser.id && a.createdAt.slice(0, 7) === yearMonth).length;

  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Dashboard</div>
        <input type="month" className="field-input" style={{ width: 160 }} value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} />
      </div>

      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Pipeline & 业绩 — {monthLabel(yearMonth)}</div>
      <div className="card" style={{ padding: 20, marginBottom: 24, display: "flex", gap: 32, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 10 }}>
            Stage funnel
          </div>
          {funnel.length === 0 && <div style={{ fontSize: 13, color: "#9aa0ab" }}>No pipeline stages configured.</div>}
          {funnel.map((f) => (
            <div key={f.stageId} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                <span>{f.stageName}</span>
                <span style={{ color: "#6b7280" }}>{f.count}</span>
              </div>
              <div style={{ background: "#eef0f4", borderRadius: 4, height: 8 }}>
                <div style={{ background: "#4046c9", borderRadius: 4, height: 8, width: `${(f.count / maxFunnelCount) * 100}%` }} />
              </div>
            </div>
          ))}
          <div style={{ fontSize: 12.5, color: "#a13a2b", marginTop: 6 }}>Lost: {lost}</div>
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 10 }}>
            Won this month
          </div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{formatMoney(won)}</div>
          {targetTotal > 0 ? (
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{attainmentPct}% of {formatMoney(targetTotal)} target</div>
          ) : (
            <div style={{ fontSize: 13, color: "#9aa0ab", marginTop: 4 }}>No target set</div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>我的数字</div>
      <div className="card" style={{ padding: 20, marginBottom: 24, display: "flex", gap: 32, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>My won this month</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{formatMoney(myWon)}</div>
          <div style={{ fontSize: 12.5, color: "#9aa0ab" }}>{myTarget ? `${myAttainmentPct}% of ${formatMoney(myTarget)} target` : "No target set"}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>My activities logged</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{myActivityCount}</div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual test**

Run `npm run dev`, navigate directly to `http://localhost:3000/dashboard` (no nav link yet — Task 8 adds it) while logged in. Confirm:
- Page renders with no console errors.
- Changing the month input recomputes "Won this month" and "我的数字".
- As a SALESPERSON: funnel/lost reflect only your own assigned customers (compare against `/customers` filtered to yourself).
- As ADMIN: funnel/lost reflect every customer in the system.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/dashboard/page.tsx"
git commit -m "Add dashboard page: pipeline funnel, won vs target, my numbers"
```

---

### Task 5: 团队表现 leaderboard + inline target editor (ADMIN/MANAGER only)

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `useStore().upsertSalesTarget` (Task 2), `leaderboard` from `lib/dashboardMetrics.ts` (Task 3).
- Produces: a `TargetCell` component local to this file (not exported elsewhere).

- [ ] **Step 1: Add `useEffect` to the React import**

Find:
```ts
import { useMemo, useState } from "react";
```
Replace with:
```ts
import { useEffect, useMemo, useState } from "react";
```

- [ ] **Step 2: Add `leaderboard` to the metrics import and `upsertSalesTarget` to the store destructure**

Find:
```ts
import { lostCount, scopedUserIds, stageFunnel, wonAmountInMonth } from "@/lib/dashboardMetrics";
```
Replace with:
```ts
import { leaderboard, lostCount, scopedUserIds, stageFunnel, wonAmountInMonth } from "@/lib/dashboardMetrics";
```

Find:
```ts
  const { currentUser, users, stages, dealClosures, activities, salesTargets, visibleCustomers } = useStore();
```
Replace with:
```ts
  const { currentUser, users, stages, dealClosures, activities, salesTargets, visibleCustomers, upsertSalesTarget } = useStore();
```

- [ ] **Step 3: Add the `TargetCell` component above `DashboardPage`**

Find:
```ts
export default function DashboardPage() {
```
Replace with:
```ts
function TargetCell({
  userId,
  yearMonth,
  target,
  onSave,
}: {
  userId: string;
  yearMonth: string;
  target: number | null;
  onSave: (userId: string, yearMonth: string, amount: number) => void;
}) {
  const [value, setValue] = useState(target !== null ? String(target) : "");
  useEffect(() => setValue(target !== null ? String(target) : ""), [target]);
  return (
    <input
      className="field-input"
      style={{ width: 110, padding: "6px 8px", fontSize: 12.5 }}
      type="number"
      min={0}
      placeholder="Set target"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const n = Number(value);
        if (value.trim() !== "" && !Number.isNaN(n) && n >= 0) onSave(userId, yearMonth, n);
      }}
    />
  );
}

export default function DashboardPage() {
```

- [ ] **Step 4: Insert the leaderboard section between "Pipeline & 业绩" and "我的数字"**

Find:
```tsx
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>我的数字</div>
```
Replace with:
```tsx
      {(currentUser.role === "ADMIN" || currentUser.role === "MANAGER") && (
        <>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>团队表现</div>
          <div className="card" style={{ marginBottom: 24 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
                padding: "12px 20px",
                background: "#f7f7f8",
                borderBottom: "1px solid #e2e4e9",
                fontSize: 12,
                fontWeight: 600,
                color: "#6b7280",
                textTransform: "uppercase",
                letterSpacing: ".03em",
              }}
            >
              <div>Name</div>
              <div>Won</div>
              <div>Target</div>
              <div>Attainment</div>
              <div>Activities</div>
            </div>
            {leaderboardRows.length === 0 && <div style={{ padding: 20, fontSize: 13.5, color: "#9aa0ab" }}>No team members.</div>}
            {leaderboardRows.map((row) => (
              <div
                key={row.userId}
                style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "12px 20px", alignItems: "center", fontSize: 13, borderBottom: "1px solid #eef0f2" }}
              >
                <div>{row.name}</div>
                <div>{formatMoney(row.won)}</div>
                <div>
                  <TargetCell userId={row.userId} yearMonth={yearMonth} target={row.target} onSave={upsertSalesTarget} />
                </div>
                <div>{row.attainmentPct !== null ? `${row.attainmentPct}%` : "—"}</div>
                <div>{row.activityCount}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>我的数字</div>
```

- [ ] **Step 5: Compute `leaderboardRows` above the `return`**

Find:
```ts
  const myActivityCount = activities.filter((a) => a.authorUserId === currentUser.id && a.createdAt.slice(0, 7) === yearMonth).length;
```
Replace with:
```ts
  const myActivityCount = activities.filter((a) => a.authorUserId === currentUser.id && a.createdAt.slice(0, 7) === yearMonth).length;
  const leaderboardRows = leaderboard(
    users.filter((u) => scopedIds.has(u.id) && u.active),
    dealClosures,
    salesTargets,
    activities,
    yearMonth
  );
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual test**

`npm run dev`, visit `/dashboard`:
- As SALESPERSON: confirm the 团队表现 section does not render at all.
- As MANAGER: confirm only your own team's members appear, type a number into a Target cell, tab/click away (blur) — confirm Attainment recalculates immediately, reload the page, confirm the value persisted.
- As ADMIN: confirm every active user across every team appears; set a target for someone on a different team than yourself, confirm it saves.

- [ ] **Step 8: Commit**

```bash
git add "app/(dashboard)/dashboard/page.tsx"
git commit -m "Add team leaderboard with inline target editor"
```

---

### Task 6: 预测 — pace vs target + open task count

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `useStore().tasks` (already in store), `pacePct, openTaskCount` from `lib/dashboardMetrics.ts` (Task 3).

- [ ] **Step 1: Add `tasks` to the store destructure and the two new metrics to the import**

Find:
```ts
import { leaderboard, lostCount, scopedUserIds, stageFunnel, wonAmountInMonth } from "@/lib/dashboardMetrics";
```
Replace with:
```ts
import { leaderboard, lostCount, openTaskCount, pacePct, scopedUserIds, stageFunnel, wonAmountInMonth } from "@/lib/dashboardMetrics";
```

Find:
```ts
  const { currentUser, users, stages, dealClosures, activities, salesTargets, visibleCustomers, upsertSalesTarget } = useStore();
```
Replace with:
```ts
  const { currentUser, users, stages, dealClosures, activities, salesTargets, visibleCustomers, upsertSalesTarget, tasks } = useStore();
```

- [ ] **Step 2: Compute pace + open task count above the `return`**

Find:
```ts
  const leaderboardRows = leaderboard(
```
Replace with:
```ts
  const pace = pacePct(new Date(), yearMonth);
  const openTasks = openTaskCount(tasks, new Set(visibleCustomers.map((c) => c.id)));
  const leaderboardRows = leaderboard(
```

- [ ] **Step 3: Insert the 预测 section between 团队表现 and 我的数字**

Find:
```tsx
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>我的数字</div>
```
Replace with:
```tsx
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>预测</div>
      <div className="card" style={{ padding: 20, marginBottom: 24, display: "flex", gap: 32, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 10 }}>
            Pace vs target
          </div>
          {targetTotal > 0 ? (
            <>
              <div style={{ position: "relative", background: "#eef0f4", borderRadius: 4, height: 10 }}>
                <div
                  style={{
                    background: attainmentPct !== null && attainmentPct >= pace ? "#1e7a41" : "#4046c9",
                    borderRadius: 4,
                    height: 10,
                    width: `${Math.min(100, attainmentPct ?? 0)}%`,
                  }}
                />
                <div style={{ position: "absolute", left: `${Math.min(100, pace)}%`, top: -3, width: 2, height: 16, background: "#a13a2b" }} title={`${pace}% of month elapsed`} />
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>{attainmentPct}% achieved · {pace}% of the month elapsed</div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "#9aa0ab" }}>No target set for this scope.</div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Open tasks</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{openTasks}</div>
        </div>
      </div>

      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>我的数字</div>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual test**

`/dashboard`: with a target set for the current scope, confirm the progress bar fills to the attainment %, the red pace marker sits at "% of month elapsed" (e.g. ~50% on the 15th of a 30-day month), and the bar turns green once attainment ≥ pace. Add/complete a task on a customer in scope, confirm "Open tasks" updates on reload.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/dashboard/page.tsx"
git commit -m "Add forecast section: pace vs target, open task count"
```

---

### Task 7: 趋势 — 6-month won $ and new-leads-vs-won charts

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `monthlyTrend` from `lib/dashboardMetrics.ts` (Task 3).

- [ ] **Step 1: Add `monthlyTrend` to the import**

Find:
```ts
import { leaderboard, lostCount, openTaskCount, pacePct, scopedUserIds, stageFunnel, wonAmountInMonth } from "@/lib/dashboardMetrics";
```
Replace with:
```ts
import { leaderboard, lostCount, monthlyTrend, openTaskCount, pacePct, scopedUserIds, stageFunnel, wonAmountInMonth } from "@/lib/dashboardMetrics";
```

- [ ] **Step 2: Compute the trend above the `return`**

Find:
```ts
  const pace = pacePct(new Date(), yearMonth);
```
Replace with:
```ts
  const trend = monthlyTrend(visibleCustomers, scopedDealClosures, 6, new Date());
  const maxTrendWon = Math.max(1, ...trend.map((p) => p.won));
  const maxTrendLeads = Math.max(1, ...trend.map((p) => p.newLeads));
  const pace = pacePct(new Date(), yearMonth);
```

- [ ] **Step 3: Append the 趋势 section at the end, after 我的数字's closing `</div>`**

Find:
```tsx
        <div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>My activities logged</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{myActivityCount}</div>
        </div>
      </div>
    </div>
  );
}
```
Replace with:
```tsx
        <div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>My activities logged</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{myActivityCount}</div>
        </div>
      </div>

      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>趋势（近6个月）</div>
      <div className="card" style={{ padding: 20, marginBottom: 24, display: "flex", gap: 40, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 10 }}>
            Won $ by month
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 100 }}>
            {trend.map((p) => (
              <div key={p.yearMonth} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ background: "#4046c9", borderRadius: "3px 3px 0 0", height: `${(p.won / maxTrendWon) * 90 + (p.won > 0 ? 4 : 0)}px` }} title={formatMoney(p.won)} />
                <div style={{ fontSize: 10.5, color: "#9aa0ab", marginTop: 4 }}>{monthLabel(p.yearMonth)}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: "1 1 260px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 10 }}>
            New leads vs won
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 100 }}>
            {trend.map((p) => (
              <div key={p.yearMonth} style={{ flex: 1, display: "flex", gap: 3, justifyContent: "center", alignItems: "flex-end" }}>
                <div style={{ width: 8, background: "#9aa0ab", borderRadius: "3px 3px 0 0", height: `${(p.newLeads / maxTrendLeads) * 90 + (p.newLeads > 0 ? 4 : 0)}px` }} title={`${p.newLeads} new`} />
                <div style={{ width: 8, background: "#1e7a41", borderRadius: "3px 3px 0 0", height: `${(p.won / maxTrendWon) * 90 + (p.won > 0 ? 4 : 0)}px` }} title={formatMoney(p.won)} />
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: "#9aa0ab", marginTop: 6 }}>grey = new leads · green = won $</div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual test**

`/dashboard`: confirm two 6-month bar charts render at the bottom, bars scale sensibly (tallest bar in each chart roughly fills the 100px row height), hovering a bar shows its exact value via the native title tooltip.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/dashboard/page.tsx"
git commit -m "Add 6-month trend charts: won $ and new leads vs won"
```

---

### Task 8: Nav — add Dashboard tab, unhide MainNav for SALESPERSON

**Files:**
- Modify: `components/MainNav.tsx`

**Interfaces:**
- Consumes: nothing new (route `/dashboard` already exists from Task 4).

- [ ] **Step 1: Replace the whole component**

Find:
```tsx
export default function MainNav() {
  const { currentUser } = useStore();
  const pathname = usePathname();
  if (!currentUser || currentUser.role === "SALESPERSON") return null;

  const agentLogHref = currentUser.role === "ADMIN" ? "/admin/agent-logs" : "/team/agent-logs";
  const removeApprovalsHref = currentUser.role === "ADMIN" ? "/admin/remove-approvals" : "/team/remove-approvals";
  const tabs = [
    { href: "/customers", label: "Customers", active: pathname.startsWith("/customers") },
    { href: agentLogHref, label: "Agent Log", active: pathname.startsWith(agentLogHref) },
    { href: removeApprovalsHref, label: "Remove Approvals", active: pathname.startsWith(removeApprovalsHref) },
  ];
```
Replace with:
```tsx
export default function MainNav() {
  const { currentUser } = useStore();
  const pathname = usePathname();
  if (!currentUser) return null;

  const tabs = [
    { href: "/dashboard", label: "Dashboard", active: pathname.startsWith("/dashboard") },
    { href: "/customers", label: "Customers", active: pathname.startsWith("/customers") },
  ];
  if (currentUser.role !== "SALESPERSON") {
    const agentLogHref = currentUser.role === "ADMIN" ? "/admin/agent-logs" : "/team/agent-logs";
    const removeApprovalsHref = currentUser.role === "ADMIN" ? "/admin/remove-approvals" : "/team/remove-approvals";
    tabs.push(
      { href: agentLogHref, label: "Agent Log", active: pathname.startsWith(agentLogHref) },
      { href: removeApprovalsHref, label: "Remove Approvals", active: pathname.startsWith(removeApprovalsHref) }
    );
  }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual test**

`npm run dev`:
- As SALESPERSON: confirm the nav bar now shows (it was hidden entirely before), with exactly two tabs — Dashboard, Customers — and no Agent Log / Remove Approvals.
- As MANAGER: confirm four tabs in order — Dashboard, Customers, Agent Log, Remove Approvals — Dashboard sits left of Customers.
- As ADMIN: same four tabs, same order.
- Click "Dashboard" from each role, confirm it navigates to `/dashboard` and highlights as active.

- [ ] **Step 4: Commit**

```bash
git add components/MainNav.tsx
git commit -m "Add Dashboard nav tab; unhide MainNav for SALESPERSON"
```

---

## Self-Review Notes

- **Spec coverage:** All 5 sections (Pipeline & 业绩, 团队表现, 预测, Sales 个人/我的数字, 趋势) map to Tasks 4/5/6/7. The `sales_targets` table + RLS + who-can-set rules map to Task 1. Nav placement (left of Customers, visible to all 3 roles) maps to Task 8. The `followUp`/`due` freeform-text correction from the revised spec is reflected in Task 6 (open task count, not a date-filtered list) and called out in Global Constraints.
- **Type consistency checked:** `SalesTarget` (Task 1) → `mapSalesTarget`/`salesTargets`/`upsertSalesTarget` (Task 2) → `leaderboard()`'s `salesTargets: SalesTarget[]` param and `LeaderboardRow.target: number | null` (Task 3) → `upsertSalesTarget` prop type on `TargetCell` and `row.target` usage (Task 5) — all match. `scopedUserIds` return type `Set<string>` used consistently in Tasks 4–6.
- **No placeholders:** every step has real, complete code — no `// TODO`, no "similar to Task N" without the actual code repeated in full.
