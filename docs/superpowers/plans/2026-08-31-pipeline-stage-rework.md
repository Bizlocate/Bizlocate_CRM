# Pipeline Stage Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pipeline stage per-assignee (`stage_1/2/3`, mirroring the existing `pool_1/2/3` pattern) instead of one shared field, move stage-setting into the Activity Log form (mandatory before "Log" can be clicked, reset every visit), and add an amount-capture popup for stages an admin flags as needing one.

**Architecture:** Schema first (per-slot columns + a new append-only `deal_closures` log table + a `requires_amount` flag on stages), then the store layer (mapping, default-stage-on-assignment wiring across every place a slot gets a new occupant, a new combined `logActivityAndStage` function replacing the old single-field `updateCustomerStage`), then two independent UI surfaces (the admin Pipeline Stages page, and the customer detail/list pages).

**Tech Stack:** Next.js App Router, React client components, TypeScript, Supabase (`@supabase/ssr` via `createClient()`), existing `useStore()` context. No test framework in this repo — verify via `npm run build` (type-check) plus manual click-through.

## Global Constraints

- Per-slot stage mirrors the existing `pool_1/2/3` convention exactly: nullable, null when that slot has no assignee, set to the pipeline's default stage (`stages.find(s => s.isDefault)`) the instant a slot gets a *new* occupant, cleared to null when a slot is cleared.
- Every place a slot's assignee changes already has this exact "set pool" / "clear pool" logic — `addCustomer`, `reassignCustomer`, `sweepStalePool` (clears on 60-day auto-removal), `sweepAutoSecondAssign` (already shipped, needs a follow-on to also default `stage_2`). Stage now rides along with every one of those, same conditions, same places.
- `sweepAutoSecondAssign` runs during the initial-load effect and in `login()`, both of which have a documented closure-staleness hazard (see its existing comment in `lib/store.tsx`) — it must keep operating only on the snapshot arrays passed into it, never `stages`/`customers` read from closure. It gains one new parameter, `stagesList: Stage[]`.
- The old standalone "Stage:" dropdown and `updateCustomerStage` are removed entirely — replaced by a new `logActivityAndStage` function driven from the Activity Log form. `updateCustomerStage` has exactly one call site today (the dropdown being removed) — confirm this before deleting it.
- The Log form's mandatory-stage behavior applies **only** to a user who occupies one of the customer's three slots. A viewer with no slot on this customer (e.g. an ADMIN who isn't assigned) keeps today's plain Log form (content required, no stage, calls the existing `addActivity` unchanged).
- The "force a fresh reselect on every visit" behavior is **client-side only** — the Log form's Stage picker resets to blank on every mount (same `[customer?.id]` effect the other drafts already use), no DB write happens just from opening the page. (See the design spec's note on why this replaced the originally-planned DB-level clear.)
- Match existing code style exactly: inline `style={{...}}` objects, `.field-input`/`.btn`/`.card` classes, fire-and-forget `.then(() => {})` on writes, no new dependencies.

---

### Task 1: Schema — per-slot stage, `requires_amount`, `deal_closures`

**Files:**
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: `customers.stage_1/stage_2/stage_3`, `pipeline_stages.requires_amount`, table `deal_closures`.

- [ ] **Step 1: Replace `customers.stage_id` with per-slot columns**

Find the `create table customers (...)` block (search for `stage_id uuid not null references pipeline_stages (id),`) and replace that one line with three nullable columns, placed right after `pool_3_since` (keeping per-slot columns grouped together, matching how `pool_1/2/3` are already grouped):

```sql
  pool_1_since timestamptz,
  pool_2_since timestamptz,
  pool_3_since timestamptz,
  stage_1 uuid references pipeline_stages (id),
  stage_2 uuid references pipeline_stages (id),
  stage_3 uuid references pipeline_stages (id),
```

- [ ] **Step 2: Add `requires_amount` to `pipeline_stages`**

Find `create table pipeline_stages (...)` and add it as the last column:

```sql
create table pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  "order" int not null,
  is_default boolean not null default false,
  requires_amount boolean not null default false
);
```

- [ ] **Step 3: Add the `deal_closures` table**

Find `create table customer_change_log (...)` and its closing `);` (right before `create table tasks (...)`). Insert this new table right after it:

```sql
create table deal_closures (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  user_id uuid not null references profiles (id),
  slot smallint not null check (slot in (1, 2, 3)),
  stage_id uuid not null references pipeline_stages (id),
  amount numeric not null,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 4: Enable RLS + add policies for `deal_closures`**

Find the existing `alter table customer_change_log enable row level security;` line and add a sibling line for the new table right after it:

```sql
alter table deal_closures enable row level security;
```

Find `create policy "customer_change_log_insert" on customer_change_log for insert with check (...)` and its closing `);` (right before the `-- notifications: recipient only` comment). Insert these two policies right after it — same shape as `activities_select`/`activities_insert` (visible to the assignee who made it, their team, and admin), with `user_id = auth.uid()` pinned on insert so attribution can't be forged (same pattern `customer_change_log_insert` already uses for `changed_by`):

```sql
-- deal_closures: append-only, inherits customer visibility (same shape as
-- activities) — visible to the closing assignee, their team, and admin.
create policy "deal_closures_select" on deal_closures for select using (
  is_admin()
  or exists (
    select 1 from customers c
    where c.id = deal_closures.customer_id
      and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
  )
);
create policy "deal_closures_insert" on deal_closures for insert with check (
  user_id = auth.uid()
  and (
    is_admin()
    or exists (
      select 1 from customers c
      where c.id = deal_closures.customer_id
        and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
    )
  )
);
```

No update/delete policy — append-only, same convention as `activities` and `customer_change_log`.

- [ ] **Step 5: No other RLS changes needed**

`customers_update` (`is_admin() or is_customer_assignee(assigned_to, assigned_to_2, assigned_to_3)`) already covers writing `stage_1/2/3` — it's a blanket per-row policy, not scoped per-column. This matches the existing security model of this app (every other business-profile column is enforced the same broad way); do not add a stricter per-slot-owner-only policy here — out of scope per the design spec.

- [ ] **Step 6: Append the already-provisioned-database migration note**

At the very end of `supabase/schema.sql`, append (fully `--`-commented, matching every other migration block in this file exactly). This one is destructive on `stage_id` (drops it after backfilling), so read it once before running against a real database:

```sql

-- ============================================================
-- Migration: Pipeline stage rework (per-slot stage, requires_amount,
-- deal_closures) — run once against an already-provisioned database
-- (everything below already exists in the main schema above for fresh
-- installs).
-- ============================================================
--
-- alter table customers add column if not exists stage_1 uuid references pipeline_stages (id);
-- alter table customers add column if not exists stage_2 uuid references pipeline_stages (id);
-- alter table customers add column if not exists stage_3 uuid references pipeline_stages (id);
-- update customers set stage_1 = stage_id where assigned_to is not null and stage_1 is null;
-- update customers set stage_2 = stage_id where assigned_to_2 is not null and stage_2 is null;
-- update customers set stage_3 = stage_id where assigned_to_3 is not null and stage_3 is null;
-- alter table customers drop column if exists stage_id;
--
-- alter table pipeline_stages add column if not exists requires_amount boolean not null default false;
--
-- create table deal_closures (
--   id uuid primary key default gen_random_uuid(),
--   customer_id uuid not null references customers (id) on delete cascade,
--   user_id uuid not null references profiles (id),
--   slot smallint not null check (slot in (1, 2, 3)),
--   stage_id uuid not null references pipeline_stages (id),
--   amount numeric not null,
--   created_at timestamptz not null default now()
-- );
--
-- alter table deal_closures enable row level security;
--
-- create policy "deal_closures_select" on deal_closures for select using (
--   is_admin()
--   or exists (
--     select 1 from customers c
--     where c.id = deal_closures.customer_id
--       and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--   )
-- );
-- create policy "deal_closures_insert" on deal_closures for insert with check (
--   user_id = auth.uid()
--   and (
--     is_admin()
--     or exists (
--       select 1 from customers c
--       where c.id = deal_closures.customer_id
--         and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--     )
--   )
-- );
```

- [ ] **Step 7: Commit**

```bash
git add supabase/schema.sql
git commit -m "Schema: per-slot pipeline stage (stage_1/2/3), pipeline_stages.requires_amount, deal_closures table

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Types + Store core — mapping, `DealClosure`, default-stage-on-assignment

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/store.tsx`

**Interfaces:**
- Consumes: Task 1's new columns/table.
- Produces: `Customer.stage1Id/stage2Id/stage3Id: string | null` (replacing `stageId`), `Stage.requiresAmount: boolean`, new `DealClosure` type, `updateStageRequiresAmount: (id: string, requiresAmount: boolean) => void` (new `Store` method), `dealClosures: DealClosure[]` (new `Store` field). `addCustomer`, `reassignCustomer`, `deleteStage` updated to use per-slot stage. `updateCustomerStage` removed.

Both files change together so `npm run build` stays green at every commit in this task (same reasoning as the equivalent task in the auto-second-assign plan).

- [ ] **Step 1: Update the `Customer` type**

In `lib/types.ts`, find the `Customer` interface (currently has `stageId: string;` right after `phone: string;`). Replace that one line:

```ts
export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  stage1Id: string | null;
  stage2Id: string | null;
  stage3Id: string | null;
  assignedToUserId: string | null;
```

(Everything else in the interface, from `assignedToUserId` onward, is unchanged — this only replaces the single `stageId: string;` line with three nullable lines.)

- [ ] **Step 2: Update the `Stage` type and add `DealClosure`**

Find `export interface Stage { id: string; name: string; order: number; isDefault: boolean; }` and add the new field:

```ts
export interface Stage {
  id: string;
  name: string;
  order: number;
  isDefault: boolean;
  requiresAmount: boolean;
}
```

Add a new type after the `CustomerChangeLogEntry`/`PROFILE_FIELD_LABELS` block at the end of the file:

```ts
export interface DealClosure {
  id: string;
  customerId: string;
  userId: string;
  slot: 1 | 2 | 3;
  stageId: string;
  amount: number;
  createdAt: string;
}
```

- [ ] **Step 3: Update `mapStage`**

In `lib/store.tsx`, replace:

```ts
function mapStage(row: { id: string; name: string; order: number; is_default: boolean }): Stage {
  return { id: row.id, name: row.name, order: row.order, isDefault: row.is_default };
}
```

with:

```ts
function mapStage(row: { id: string; name: string; order: number; is_default: boolean; requires_amount: boolean }): Stage {
  return { id: row.id, name: row.name, order: row.order, isDefault: row.is_default, requiresAmount: row.requires_amount };
}
```

- [ ] **Step 4: Update `mapCustomer`**

Find the `mapCustomer` function's row type (has `stage_id: string;` between `pool_3_since` and `source_id`) and its return object (has `stageId: row.stage_id,`). Replace both:

Row type — replace `stage_id: string;` with:

```ts
  stage_1: string | null;
  stage_2: string | null;
  stage_3: string | null;
```

Return object — replace `stageId: row.stage_id,` with:

```ts
    stage1Id: row.stage_1,
    stage2Id: row.stage_2,
    stage3Id: row.stage_3,
```

- [ ] **Step 5: Add `mapDealClosure` and `loadDealClosures`**

Right after the existing `mapChangeLog` function, add:

```ts
function mapDealClosure(row: {
  id: string;
  customer_id: string;
  user_id: string;
  slot: number;
  stage_id: string;
  amount: number;
  created_at: string;
}): DealClosure {
  return {
    id: row.id,
    customerId: row.customer_id,
    userId: row.user_id,
    slot: row.slot as 1 | 2 | 3,
    stageId: row.stage_id,
    amount: row.amount,
    createdAt: row.created_at,
  };
}
```

Add `DealClosure` to the `import { ... } from "./types";` block — exact position doesn't matter, just add it as one more named import on its own line, anywhere in that block.

Add a new state variable right next to `changeLog`'s declaration (search for `const [changeLog, setChangeLog] = useState<CustomerChangeLogEntry[]>([]);`):

```ts
  const [changeLog, setChangeLog] = useState<CustomerChangeLogEntry[]>([]);
  const [dealClosures, setDealClosures] = useState<DealClosure[]>([]);
```

Right after the existing `loadChangeLog` function, add:

```ts
  async function loadDealClosures(): Promise<DealClosure[]> {
    const supabase = createClient();
    const { data } = await supabase.from("deal_closures").select("*").order("created_at", { ascending: false });
    const mapped = (data ?? []).map(mapDealClosure);
    setDealClosures(mapped);
    return mapped;
  }
```

Call it in both load paths, right after the existing `await loadChangeLog(loadedUsers);` line (search for it — appears once in the initial `useEffect` and once in `login()`):

```ts
    await loadChangeLog(loadedUsers);
    await loadDealClosures();
```

- [ ] **Step 6: Add `dealClosures` and `updateStageRequiresAmount` to the `Store` interface and value object**

In the `Store` interface, find `changeLog: CustomerChangeLogEntry[];` and add a sibling right after it:

```ts
  changeLog: CustomerChangeLogEntry[];
  dealClosures: DealClosure[];
```

Find `deleteStage: (id: string) => { ok: boolean; error?: string };` and add a new method right after it:

```ts
  deleteStage: (id: string) => { ok: boolean; error?: string };
  updateStageRequiresAmount: (id: string, requiresAmount: boolean) => void;
```

Find `updateCustomerStage: (customerId: string, stageId: string) => void;` in the interface and **delete that line** — this method is being removed (see Step 9).

In the `const value: Store = { ... }` object, find `changeLog,` and add `dealClosures,` right after it:

```ts
    changeLog,
    dealClosures,
```

Find `deleteStage,` in the value object and add `updateStageRequiresAmount,` right after it:

```ts
    deleteStage,
    updateStageRequiresAmount,
```

Find `updateCustomerStage,` in the value object and **delete that line**.

- [ ] **Step 7: Add `updateStageRequiresAmount`, update `deleteStage`**

Right after the existing `renameStage` function, add:

```ts
  function updateStageRequiresAmount(id: string, requiresAmount: boolean) {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, requiresAmount } : s)));
    const supabase = createClient();
    supabase.from("pipeline_stages").update({ requires_amount: requiresAmount }).eq("id", id).then(() => {});
  }
```

In `deleteStage`, replace the guard's count query:

```ts
  function deleteStage(id: string) {
    const count = customers.filter((c) => c.stageId === id).length;
```

with:

```ts
  function deleteStage(id: string) {
    const count = customers.filter((c) => c.stage1Id === id || c.stage2Id === id || c.stage3Id === id).length;
```

- [ ] **Step 8: Update `addCustomer` to default each assigned slot's stage**

In `addCustomer`, replace the single line `stage_id: defaultStage.id,` in the `.insert({...})` call with three per-slot lines, placed where `stage_id` was (right after the `pool_3` line):

```ts
        pool_1: input.assignedToUserId ? "ACTIVE" : null,
        pool_2: input.assignedToUserId2 ? "ACTIVE" : null,
        pool_3: input.assignedToUserId3 ? "ACTIVE" : null,
        stage_1: input.assignedToUserId ? defaultStage.id : null,
        stage_2: input.assignedToUserId2 ? defaultStage.id : null,
        stage_3: input.assignedToUserId3 ? defaultStage.id : null,
```

(`defaultStage` is already resolved a few lines earlier in this function — no change needed there.)

- [ ] **Step 9: Update `reassignCustomer` to set/clear the slot's stage, remove `updateCustomerStage`**

Replace the whole `reassignCustomer` function body. Current version (search for `function reassignCustomer(customerId: string, slot: 1 | 2 | 3, userId: string | null)`):

```ts
  function reassignCustomer(customerId: string, slot: 1 | 2 | 3, userId: string | null) {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return { ok: false, error: "Customer not found." };
    const slotKey = slot === 1 ? "assignedToUserId" : slot === 2 ? "assignedToUserId2" : "assignedToUserId3";
    const columnKey = slot === 1 ? "assigned_to" : slot === 2 ? "assigned_to_2" : "assigned_to_3";
    const poolKey = slot === 1 ? "pool1" : slot === 2 ? "pool2" : "pool3";
    const poolColumn = slot === 1 ? "pool_1" : slot === 2 ? "pool_2" : "pool_3";
    const sinceKey = slot === 1 ? "pool1Since" : slot === 2 ? "pool2Since" : "pool3Since";
    const sinceColumn = slot === 1 ? "pool_1_since" : slot === 2 ? "pool_2_since" : "pool_3_since";
    const otherSlotKeys = (["assignedToUserId", "assignedToUserId2", "assignedToUserId3"] as const).filter((k) => k !== slotKey);
    const otherSlots = otherSlotKeys.map((k) => customer[k]).filter((id): id is string => !!id);
    if (userId && otherSlots.includes(userId)) return { ok: false, error: "The same person can't be assigned twice." };
    const changing = customer[slotKey] !== userId;
    if (userId && changing) {
      const error = assignmentError(userId, "ACTIVE", customerId);
      if (error) return { ok: false, error };
    }
    // a newly (re)assigned slot always starts in the active pool; clearing a slot clears its pool state too
    const newPool: PoolStatus | null = userId ? "ACTIVE" : null;
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === customerId
          ? { ...c, [slotKey]: userId, ...(changing ? { [poolKey]: newPool, [sinceKey]: null } : {}) }
          : c
      )
    );
    const supabase = createClient();
    const update: Record<string, string | null> = { [columnKey]: userId };
    if (changing) {
      update[poolColumn] = newPool;
      update[sinceColumn] = null;
    }
    supabase.from("customers").update(update).eq("id", customerId).then(() => {});
    const assignee = userId ? users.find((u) => u.id === userId) : undefined;
    if (assignee) {
      createNotification(userId!, `${assignee.name} was assigned ${customer.name}.`);
    }
    return { ok: true };
  }
```

Replace with (adds `stageKey`/`stageColumn`, resolves `newStageId` the same way `newPool` already is, includes it in both the local update and the DB update):

```ts
  function reassignCustomer(customerId: string, slot: 1 | 2 | 3, userId: string | null) {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return { ok: false, error: "Customer not found." };
    const slotKey = slot === 1 ? "assignedToUserId" : slot === 2 ? "assignedToUserId2" : "assignedToUserId3";
    const columnKey = slot === 1 ? "assigned_to" : slot === 2 ? "assigned_to_2" : "assigned_to_3";
    const poolKey = slot === 1 ? "pool1" : slot === 2 ? "pool2" : "pool3";
    const poolColumn = slot === 1 ? "pool_1" : slot === 2 ? "pool_2" : "pool_3";
    const sinceKey = slot === 1 ? "pool1Since" : slot === 2 ? "pool2Since" : "pool3Since";
    const sinceColumn = slot === 1 ? "pool_1_since" : slot === 2 ? "pool_2_since" : "pool_3_since";
    const stageKey = slot === 1 ? "stage1Id" : slot === 2 ? "stage2Id" : "stage3Id";
    const stageColumn = slot === 1 ? "stage_1" : slot === 2 ? "stage_2" : "stage_3";
    const otherSlotKeys = (["assignedToUserId", "assignedToUserId2", "assignedToUserId3"] as const).filter((k) => k !== slotKey);
    const otherSlots = otherSlotKeys.map((k) => customer[k]).filter((id): id is string => !!id);
    if (userId && otherSlots.includes(userId)) return { ok: false, error: "The same person can't be assigned twice." };
    const changing = customer[slotKey] !== userId;
    if (userId && changing) {
      const error = assignmentError(userId, "ACTIVE", customerId);
      if (error) return { ok: false, error };
    }
    // a newly (re)assigned slot always starts in the active pool at the default stage; clearing a slot clears both
    const newPool: PoolStatus | null = userId ? "ACTIVE" : null;
    const defaultStage = stages.find((s) => s.isDefault) ?? stages[0];
    const newStageId: string | null = userId ? (defaultStage?.id ?? null) : null;
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === customerId
          ? { ...c, [slotKey]: userId, ...(changing ? { [poolKey]: newPool, [sinceKey]: null, [stageKey]: newStageId } : {}) }
          : c
      )
    );
    const supabase = createClient();
    const update: Record<string, string | null> = { [columnKey]: userId };
    if (changing) {
      update[poolColumn] = newPool;
      update[sinceColumn] = null;
      update[stageColumn] = newStageId;
    }
    supabase.from("customers").update(update).eq("id", customerId).then(() => {});
    const assignee = userId ? users.find((u) => u.id === userId) : undefined;
    if (assignee) {
      createNotification(userId!, `${assignee.name} was assigned ${customer.name}.`);
    }
    return { ok: true };
  }
```

Then **delete** the entire `updateCustomerStage` function (search for `function updateCustomerStage(customerId: string, stageId: string) { ... }` — it's a 4-line function right before `updateCustomerProfile`). Its only caller is the standalone Stage dropdown on the customer detail page, which Task 6 removes — confirm via `grep -rn "updateCustomerStage" app lib` that after this task and Task 6 land, zero references remain outside this plan's own docs.

- [ ] **Step 10: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors. (It will fail if Task 6 hasn't landed yet and something in `app/` still references `updateCustomerStage` or `customer.stageId` — that's expected until this whole plan completes; if you're executing tasks in order and stop here, that's fine, the next task fixes it. If you want a green build after this task in isolation, note it in your report rather than leaving `updateCustomerStage` in place — deleting it now, ahead of Task 6, is what the plan specifies.)

- [ ] **Step 11: Commit**

```bash
git add lib/types.ts lib/store.tsx
git commit -m "Types+Store: per-slot Customer.stage1/2/3Id, Stage.requiresAmount, DealClosure, default-stage-on-assignment

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Store — sweep follow-ons + `logActivityAndStage`

**Files:**
- Modify: `lib/store.tsx`

**Interfaces:**
- Consumes: Task 2's `Customer.stage1Id/2Id/3Id`, `Stage.requiresAmount`, `DealClosure`, `dealClosures`/`setDealClosures`, `mapDealClosure`.
- Produces: `logActivityAndStage: (customerId: string, slot: 1 | 2 | 3, stageId: string, type: ActivityType, content: string, followUp: string, closedAmount?: number) => void` (new `Store` method). `sweepAutoSecondAssign` gains a `stagesList: Stage[]` parameter (both call sites updated). `sweepStalePool` clears a slot's stage alongside its pool on 60-day auto-removal.

- [ ] **Step 1: `sweepStalePool` clears stage on auto-removal**

In `sweepStalePool`, find the `setCustomers((prev) => prev.map((c) => { ... }))` block that clears stale slots (the `hit1`/`hit2`/`hit3` conditional spread) and add stage clearing to each branch:

```ts
    setCustomers((prev) =>
      prev.map((c) => {
        const hit1 = stale.some((s) => s.customerId === c.id && s.slot === 1);
        const hit2 = stale.some((s) => s.customerId === c.id && s.slot === 2);
        const hit3 = stale.some((s) => s.customerId === c.id && s.slot === 3);
        if (!hit1 && !hit2 && !hit3) return c;
        return {
          ...c,
          ...(hit1 ? { assignedToUserId: null, pool1: null, pool1Since: null, stage1Id: null } : {}),
          ...(hit2 ? { assignedToUserId2: null, pool2: null, pool2Since: null, stage2Id: null } : {}),
          ...(hit3 ? { assignedToUserId3: null, pool3: null, pool3Since: null, stage3Id: null } : {}),
        };
      })
    );
```

And the matching DB update right below it (each of the three `update` object literals gets one more field):

```ts
    const supabase = createClient();
    for (const { customerId, slot } of stale) {
      const update = slot === 1
        ? { assigned_to: null, pool_1: null, pool_1_since: null, stage_1: null }
        : slot === 2
        ? { assigned_to_2: null, pool_2: null, pool_2_since: null, stage_2: null }
        : { assigned_to_3: null, pool_3: null, pool_3_since: null, stage_3: null };
      supabase.from("customers").update(update).eq("id", customerId).then(() => {});
    }
```

- [ ] **Step 2: `sweepAutoSecondAssign` gains a `stagesList` parameter and defaults slot 2's stage**

Change the function signature (search for `function sweepAutoSecondAssign(customersList: Customer[], areasList: Area[], teamsList: Team[], usersList: User[], isAdmin: boolean)`):

```ts
  function sweepAutoSecondAssign(customersList: Customer[], areasList: Area[], teamsList: Team[], usersList: User[], stagesList: Stage[], isAdmin: boolean) {
```

Right after the existing `if (!isAdmin) return;` line, resolve the default stage once (mirrors how `addCustomer`/`reassignCustomer` do it):

```ts
    if (!isAdmin) return;
    const defaultStage = stagesList.find((s) => s.isDefault) ?? stagesList[0];
```

Find the two writes this function already does when it picks a winner — `setCustomers((prev) => prev.map((row) => (row.id === c.id ? { ...row, assignedToUserId2: winnerId, pool2: "ACTIVE", pool2Since: null } : row)));` and the matching `supabase.from("customers").update({ assigned_to_2: winnerId, pool_2: "ACTIVE", pool_2_since: null }).eq("id", c.id).then(() => {});`. Add `stage2Id`/`stage_2` to both:

```ts
      setCustomers((prev) =>
        prev.map((row) => (row.id === c.id ? { ...row, assignedToUserId2: winnerId, pool2: "ACTIVE", pool2Since: null, stage2Id: defaultStage?.id ?? null } : row))
      );
      supabase.from("customers").update({ assigned_to_2: winnerId, pool_2: "ACTIVE", pool_2_since: null, stage_2: defaultStage?.id ?? null }).eq("id", c.id).then(() => {});
```

- [ ] **Step 3: Update both `sweepAutoSecondAssign` call sites**

`loadStages()` is index `17` in the `Promise.all([...])` array used by both the initial-load `useEffect` and `login()` (confirm by counting the array — it's the entry right before `loadCustomers()`, which is already known to be index `18`). Update both call sites (search for `sweepAutoSecondAssign(loadedCustomers, loadResults[2], loadResults[0], loadedUsers, profile.role === "ADMIN");` — it appears twice, once in each function):

```ts
          sweepAutoSecondAssign(loadedCustomers, loadResults[2], loadResults[0], loadedUsers, loadResults[17], profile.role === "ADMIN");
```

(Same change in `login()`'s copy of this line.)

- [ ] **Step 4: Add `logActivityAndStage`**

Right after the existing `addActivity` function, add:

```ts
  // Combined "Log" action for a Log-form submission by someone who occupies
  // a slot on this customer: always writes that slot's stage (the Log form
  // requires a stage pick before this can be called — see the detail
  // page), optionally logs an activity if content was entered, and
  // optionally records a deal_closures row if the picked stage needed an
  // amount. Reuses addActivity for the activity-insert half instead of
  // duplicating it.
  function logActivityAndStage(
    customerId: string,
    slot: 1 | 2 | 3,
    stageId: string,
    type: ActivityType,
    content: string,
    followUp: string,
    closedAmount?: number
  ) {
    if (!currentUser) return;
    const stageKey = slot === 1 ? "stage1Id" : slot === 2 ? "stage2Id" : "stage3Id";
    const stageColumn = slot === 1 ? "stage_1" : slot === 2 ? "stage_2" : "stage_3";
    setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, [stageKey]: stageId } : c)));
    const supabase = createClient();
    supabase.from("customers").update({ [stageColumn]: stageId }).eq("id", customerId).then(() => {});
    if (content.trim()) {
      addActivity(customerId, type, content.trim(), followUp);
    }
    if (closedAmount !== undefined) {
      supabase
        .from("deal_closures")
        .insert({ customer_id: customerId, user_id: currentUser.id, slot, stage_id: stageId, amount: closedAmount })
        .select()
        .single()
        .then(({ data, error }) => {
          if (!error && data) setDealClosures((prev) => [mapDealClosure(data), ...prev]);
        });
    }
  }
```

- [ ] **Step 5: Add `logActivityAndStage` to the `Store` interface and value object**

In the `Store` interface, find `addActivity: (customerId: string, type: ActivityType, content: string, followUp: string) => void;` and add a sibling right after it:

```ts
  addActivity: (customerId: string, type: ActivityType, content: string, followUp: string) => void;
  logActivityAndStage: (customerId: string, slot: 1 | 2 | 3, stageId: string, type: ActivityType, content: string, followUp: string, closedAmount?: number) => void;
```

In the `const value: Store = { ... }` object, find `addActivity,` and add it there too:

```ts
    addActivity,
    logActivityAndStage,
```

- [ ] **Step 6: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add lib/store.tsx
git commit -m "Store: sweepStalePool/sweepAutoSecondAssign carry stage per-slot, add logActivityAndStage

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Admin — "Requires closed amount" toggle on Pipeline Stages

**Files:**
- Modify: `app/(dashboard)/admin/stages/page.tsx`

**Interfaces:**
- Consumes: `updateStageRequiresAmount` from `useStore()` (Task 2).
- Produces: nothing consumed elsewhere — self-contained.

- [ ] **Step 1: Destructure `updateStageRequiresAmount`**

Change the `useStore()` destructure (currently `const { stages, addStage, renameStage, moveStage, deleteStage } = useStore();`):

```tsx
  const { stages, addStage, renameStage, moveStage, deleteStage, updateStageRequiresAmount } = useStore();
```

- [ ] **Step 2: Add the checkbox to each stage row**

Find the stage row's DEFAULT badge (search for `{s.isDefault && (` inside the `sorted.map((s, i) => (...))` block) and add a checkbox right after it, before the "Edit" link:

```tsx
              {s.isDefault && (
                <span style={{ fontSize: 11, fontWeight: 700, color: "#1e7a41", background: "#e7f6ec", padding: "3px 8px", borderRadius: 20 }}>DEFAULT</span>
              )}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#6b7280", marginLeft: 8 }}>
                <input
                  type="checkbox"
                  checked={s.requiresAmount}
                  onChange={(e) => updateStageRequiresAmount(s.id, e.target.checked)}
                />
                Requires closed amount
              </label>
              <div
                onClick={() => { setEditingId(s.id); setEditName(s.name); }}
                style={{ color: "#4046c9", fontWeight: 500, fontSize: 13, marginLeft: 16, cursor: "pointer" }}
              >
                Edit
              </div>
```

(Only the new `<label>` block is added — the surrounding DEFAULT badge and Edit link are unchanged, just now with the checkbox between them.)

- [ ] **Step 3: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 4: Manual verification**

Using the browser preview, as ADMIN:
1. Go to `/admin/stages` — confirm each stage row has a "Requires closed amount" checkbox.
2. Toggle one on, reload, confirm it persists.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/admin/stages/page.tsx"
git commit -m "Admin Pipeline Stages: add 'Requires closed amount' toggle per stage

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Customer detail page — remove standalone Stage, per-slot badges, Log-gated stage picker + amount popup

**Files:**
- Modify: `app/(dashboard)/customers/[id]/page.tsx`

**Interfaces:**
- Consumes: `logActivityAndStage`, `dealClosures` (unused directly by this page, but confirms Task 3 landed) from `useStore()`; `STAGE_STYLES` from `@/lib/types` (not yet imported in this file); `Customer.stage1Id/2Id/3Id` (Task 2).
- Produces: nothing consumed elsewhere — self-contained.

- [ ] **Step 1: Import `STAGE_STYLES`, destructure `logActivityAndStage`, remove `updateCustomerStage`**

Change the types import:

```tsx
import { ACTIVITY_STYLES, Activity, ActivityType, PROFILE_FIELD_LABELS, STAGE_STYLES } from "@/lib/types";
```

In the `useStore()` destructure, find `updateCustomerStage,` (it sits right after `tasks,` and right before `updateCustomerProfile,`) and replace that one line with `logActivityAndStage,`:

```tsx
    tasks,
    logActivityAndStage,
    updateCustomerProfile,
```

- [ ] **Step 2: Add `stageOf` helper and `myAssignedSlot`**

Right after the existing `poolOf` function, add:

```tsx
  function stageOf(slot: 1 | 2 | 3) {
    return slot === 1 ? customer!.stage1Id : slot === 2 ? customer!.stage2Id : customer!.stage3Id;
  }
```

Right after `assignedUsers` is computed (search for the `.filter((a): a is ...)` line that defines it), add:

```tsx
  const myAssignedSlot = assignedUsers.find(({ user }) => user.id === currentUser.id)?.slot ?? null;
```

(This is computed before the `if (!currentUser || !customer) return null;` guard's surrounding code reads `currentUser`/`customer` freely below that guard — place it after the guard, alongside where `assignedUsers` itself is defined, since both need `customer` to be non-null.)

- [ ] **Step 3: Add stage badges next to each assignee's name in the header**

Find the assignee badge rendering block (search for `{pool && (` inside the `assignedUsers.map(({ slot, user }, i) => { ... })` block in the header). Add a stage badge right after the existing pool badge's closing `)}`:

```tsx
                      {pool && (
                        canToggle ? (
                          <button type="button" onClick={() => handleTogglePool(slot, pool)} style={{ ...badgeStyle, cursor: "pointer" }}>
                            {pool === "ACTIVE" ? "Active" : "Potential"}
                          </button>
                        ) : (
                          <span style={badgeStyle}>{pool === "ACTIVE" ? "Active" : "Potential"}</span>
                        )
                      )}
                      {(() => {
                        const stage = stages.find((s) => s.id === stageOf(slot));
                        if (!stage) return null;
                        const stageStyle = STAGE_STYLES[stage.name] ?? { bg: "#eef0f4", color: "#4b5566" };
                        return (
                          <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: stageStyle.bg, color: stageStyle.color }}>
                            {stage.name}
                          </span>
                        );
                      })()}
```

(This badge is read-only for everyone, including the assignee it belongs to — the only way to change a slot's stage is via that person's own Log form below.)

- [ ] **Step 4: Remove the standalone Stage dropdown**

Delete this whole block entirely (it currently sits right after the admin reassignment section, before the Business Profile card):

```tsx
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>Stage:</span>
        <select
          className="field-input"
          style={{ width: "auto" }}
          value={customer.stageId}
          onChange={(e) => updateCustomerStage(customer.id, e.target.value)}
        >
          {[...stages].sort((a, b) => a.order - b.order).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
```

- [ ] **Step 5: Add Log-form draft state, reset it per customer**

Add these state declarations near the existing `activityType`/`activityContent`/`followUp` ones:

```tsx
  const [logStageId, setLogStageId] = useState("");
  const [showClosedAmountModal, setShowClosedAmountModal] = useState(false);
  const [closedAmountDraft, setClosedAmountDraft] = useState("");
```

In the existing `useEffect` that resets drafts on `[customer?.id]` (the one that already resets `profileDraft`/`remarkDraft`/`nameDraft`/`phoneDraft`), add:

```tsx
  useEffect(() => {
    setProfileDraft(draftFromCustomer(customer));
    setRemarkDraft(customer?.remark ?? "");
    setNameDraft(customer?.name ?? "");
    setPhoneDraft(customer?.phone ?? "");
    setLogStageId("");
  }, [customer?.id]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 6: Replace `handleLogActivity`, add the amount-confirm handler**

Replace the existing `handleLogActivity` function:

```tsx
  function handleLogActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!activityContent.trim()) return;
    addActivity(customer!.id, activityType, activityContent.trim(), followUp.trim() ? `Follow-up: ${followUp.trim()}` : "");
    setActivityContent("");
    setFollowUp("");
  }
```

with:

```tsx
  const selectedLogStage = stages.find((s) => s.id === logStageId);

  function handleLogActivity(e: React.FormEvent) {
    e.preventDefault();
    if (myAssignedSlot) {
      if (!logStageId) return;
      if (selectedLogStage?.requiresAmount) {
        setShowClosedAmountModal(true);
        return;
      }
      logActivityAndStage(customer!.id, myAssignedSlot, logStageId, activityType, activityContent, followUp.trim() ? `Follow-up: ${followUp.trim()}` : "");
      setActivityContent("");
      setFollowUp("");
      setLogStageId("");
    } else {
      if (!activityContent.trim()) return;
      addActivity(customer!.id, activityType, activityContent.trim(), followUp.trim() ? `Follow-up: ${followUp.trim()}` : "");
      setActivityContent("");
      setFollowUp("");
    }
  }

  function handleConfirmClosedAmount() {
    const amount = Number(closedAmountDraft);
    if (!closedAmountDraft.trim() || Number.isNaN(amount) || amount <= 0) return;
    logActivityAndStage(customer!.id, myAssignedSlot!, logStageId, activityType, activityContent, followUp.trim() ? `Follow-up: ${followUp.trim()}` : "", amount);
    setActivityContent("");
    setFollowUp("");
    setLogStageId("");
    setClosedAmountDraft("");
    setShowClosedAmountModal(false);
  }
```

- [ ] **Step 7: Add the Stage picker to the Log form, gate the "Log" button, add the amount modal**

Replace the Activity Log form (search for `{canLogActivity && (` through its closing `)}`):

```tsx
          {canLogActivity && (
            <form onSubmit={handleLogActivity} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  className="field-input"
                  style={{ width: 120 }}
                  value={activityType}
                  onChange={(e) => setActivityType(e.target.value as ActivityType)}
                >
                  <option value="NOTE">Note</option>
                  <option value="CALL">Call</option>
                  <option value="VISIT">Visit</option>
                </select>
                <input
                  className="field-input"
                  style={{ flex: 1 }}
                  placeholder="What happened?"
                  value={activityContent}
                  onChange={(e) => setActivityContent(e.target.value)}
                />
                <button className="btn btn-primary" type="submit">Log</button>
              </div>
              <input
                className="field-input"
                placeholder="Follow-up date (optional)"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
              />
            </form>
          )}
```

with:

```tsx
          {canLogActivity && (
            <form onSubmit={handleLogActivity} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {myAssignedSlot && (
                <div>
                  <div style={{ fontSize: 11.5, color: "#9aa0ab", marginBottom: 4 }}>Stage</div>
                  <select
                    className="field-input"
                    style={{ width: "auto" }}
                    value={logStageId}
                    onChange={(e) => setLogStageId(e.target.value)}
                  >
                    <option value="">— Select stage —</option>
                    {[...stages].sort((a, b) => a.order - b.order).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  className="field-input"
                  style={{ width: 120 }}
                  value={activityType}
                  onChange={(e) => setActivityType(e.target.value as ActivityType)}
                >
                  <option value="NOTE">Note</option>
                  <option value="CALL">Call</option>
                  <option value="VISIT">Visit</option>
                </select>
                <input
                  className="field-input"
                  style={{ flex: 1 }}
                  placeholder="What happened? (optional)"
                  value={activityContent}
                  onChange={(e) => setActivityContent(e.target.value)}
                />
                <button className="btn btn-primary" type="submit" disabled={!!myAssignedSlot && !logStageId}>Log</button>
              </div>
              <input
                className="field-input"
                placeholder="Follow-up date (optional)"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
              />
            </form>
          )}
          {showClosedAmountModal && (
            <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowClosedAmountModal(false); }}>
              <div className="card modal-card" style={{ maxWidth: 360 }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Closed amount</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
                  {selectedLogStage?.name} requires a closed amount.
                </div>
                <input
                  className="field-input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Amount"
                  value={closedAmountDraft}
                  onChange={(e) => setClosedAmountDraft(e.target.value)}
                  autoFocus
                />
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button className="btn btn-primary" type="button" onClick={handleConfirmClosedAmount}>Confirm</button>
                  <button className="btn btn-outline" type="button" onClick={() => setShowClosedAmountModal(false)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
```

- [ ] **Step 8: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors. `grep -rn "updateCustomerStage\|\.stageId" app lib` should now return nothing in `app/` (Task 2 already removed `stageId` from `Customer` and deleted `updateCustomerStage` from the store — this step's removals are what make the app-side reference-free too). The customer list page (Task 6) still has its own `.stageId` references — those are fixed there, not here.

- [ ] **Step 9: Manual verification**

Using the browser preview, as a SALESPERSON assigned to a customer:
1. Confirm the standalone "Stage:" dropdown near the top of the page is gone.
2. Confirm the Activity Log form shows a Stage picker (starts on "— Select stage —"), and "Log" is disabled until you pick one.
3. Pick a stage, leave content blank, click Log — confirm the header badge next to your name updates to the new stage, and no activity row was created.
4. Pick a stage and write a note, click Log — confirm both the stage badge updates and the note appears in your own Activity Log group.
5. Pick a stage flagged `requiresAmount` (set one via Task 4's admin toggle first) — confirm the amount modal appears on Log, Cancel aborts everything (badge/content untouched), Confirm with a valid amount saves stage + note (if any) together.
6. Navigate away and back into the same customer — confirm the Stage picker is blank again (client-side reset only — reload mid-session without submitting and confirm the badge still shows your last real saved stage, not blank, since no DB write happened just from visiting).
7. As ADMIN viewing a customer you're not assigned to: confirm you see read-only stage badges per assignee, the Log form has no Stage picker, and Log still works as a plain note (content required, same as before this change).

- [ ] **Step 10: Commit**

```bash
git add "app/(dashboard)/customers/[id]/page.tsx"
git commit -m "Customer detail page: remove standalone Stage dropdown, per-slot read-only badges, Log-gated stage picker + closed-amount modal

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Customer list page — per-slot stage display, sort, filter

**Files:**
- Modify: `app/(dashboard)/customers/page.tsx`

**Interfaces:**
- Consumes: `Customer.stage1Id/2Id/3Id` (Task 2). `stages`, `currentUser`, `isSalesperson` already in scope.
- Produces: nothing consumed elsewhere — self-contained.

- [ ] **Step 1: Add `myStageId` and `stageNameOf`/`stageBadgeNames` helpers**

Right after the existing `stageName` function (search for `function stageName(stageId: string) { ... }` — search will find only the one about to be replaced), replace it:

```tsx
  function stageName(stageId: string) {
    return stages.find((s) => s.id === stageId)?.name ?? "";
  }
```

with:

```tsx
  function stageNameOf(stageId: string | null) {
    return stages.find((s) => s.id === stageId)?.name ?? "—";
  }

  function myStageId(c: Customer): string | null {
    if (!currentUser) return null;
    if (c.assignedToUserId === currentUser.id) return c.stage1Id;
    if (c.assignedToUserId2 === currentUser.id) return c.stage2Id;
    if (c.assignedToUserId3 === currentUser.id) return c.stage3Id;
    return null;
  }

  function stageBadgeNames(c: Customer): string[] {
    return [
      { userId: c.assignedToUserId, stageId: c.stage1Id },
      { userId: c.assignedToUserId2, stageId: c.stage2Id },
      { userId: c.assignedToUserId3, stageId: c.stage3Id },
    ]
      .filter((s) => s.userId)
      .map((s) => stageNameOf(s.stageId));
  }
```

- [ ] **Step 2: Fix the stage filter (own-slot for SALESPERSON, any-slot for ADMIN/MANAGER)**

In the `filteredCustomers` `useMemo`, replace:

```tsx
      if (searchStageId && c.stageId !== searchStageId) return false;
```

with:

```tsx
      if (searchStageId) {
        if (isSalesperson) {
          if (myStageId(c) !== searchStageId) return false;
        } else if (c.stage1Id !== searchStageId && c.stage2Id !== searchStageId && c.stage3Id !== searchStageId) {
          return false;
        }
      }
```

- [ ] **Step 3: Add the "New" sort for SALESPERSON**

Right after the `filteredCustomers` `useMemo` block closes, add a new derived list:

```tsx
  const sortedCustomers = useMemo(() => {
    if (!isSalesperson) return filteredCustomers;
    const defaultStage = stages.find((s) => s.isDefault);
    if (!defaultStage) return filteredCustomers;
    return [...filteredCustomers].sort((a, b) => {
      const aNew = myStageId(a) === defaultStage.id ? 0 : 1;
      const bNew = myStageId(b) === defaultStage.id ? 0 : 1;
      return aNew - bNew;
    });
  }, [filteredCustomers, isSalesperson, stages, currentUser]);
```

- [ ] **Step 4: Update `fieldResolvers.stage` (CSV export)**

Replace:

```tsx
    stage: (c) => stageName(c.stageId),
```

with:

```tsx
    stage: (c) => stageBadgeNames(c).join(", "),
```

- [ ] **Step 5: Render per-slot stage badges in the list, and use `sortedCustomers` for the row map**

Replace the single stage-badge cell (search for the `<div>` containing the `<span style={{ ... background: style.bg, color: style.color }}>{stageName(c.stageId)}</span>` block, inside `filteredCustomers.map((c) => { const style = STAGE_STYLES[stageName(c.stageId)] ?? ...; return ( ... ) })`) and the surrounding map call. Current version:

```tsx
            {filteredCustomers.map((c) => {
              const style = STAGE_STYLES[stageName(c.stageId)] ?? { bg: "#eef0f4", color: "#4b5566" };
              return (
                <div
                  key={c.id}
                  onClick={() => router.push(`/customers/${c.id}`)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: gridCols,
                    padding: "14px 20px",
                    borderBottom: "1px solid #eef0f2",
                    alignItems: "center",
                    fontSize: 13.5,
                    cursor: "pointer",
                  }}
                >
                  {canExport && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleOne(c.id)} />
                    </div>
                  )}
                  <div style={{ color: "#6b7280" }}>{formatDate(c.createdAt)}</div>
                  <div style={{ color: "#6b7280" }}>{nameOf(businessTagTypes, c.businessTypeId) || "—"}</div>
                  <div style={{ color: "#6b7280" }}>{c.businessName || "—"}</div>
                  <div style={{ color: "#6b7280" }}>{c.phone}</div>
                  <div style={{ fontWeight: 500 }}>{c.name}</div>
                  <div style={{ color: "#6b7280" }}>{nameOf(subAreas, c.subAreaId) || "—"}</div>
                  <div style={{ color: "#6b7280" }}>{nameOf(leadSources, c.sourceId) || "—"}</div>
                  <div>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "4px 10px",
                        borderRadius: 20,
                        background: style.bg,
                        color: style.color,
                      }}
                    >
                      {stageName(c.stageId)}
                    </span>
                  </div>
                  {showAssignedTo && <div style={{ color: "#6b7280" }}>{assigneeNames(c)}</div>}
                  <div style={{ color: "#6b7280" }}>{nameOf(purposes, c.purposeId) || "—"}</div>
                  <div style={{ color: "#6b7280" }}>{formatDate(c.updatedAt)}</div>
                  <div style={{ color: "#c5c8cf", fontSize: 16, textAlign: "right" }}>›</div>
                </div>
              );
            })}
```

Replace with:

```tsx
            {sortedCustomers.map((c) => {
              return (
                <div
                  key={c.id}
                  onClick={() => router.push(`/customers/${c.id}`)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: gridCols,
                    padding: "14px 20px",
                    borderBottom: "1px solid #eef0f2",
                    alignItems: "center",
                    fontSize: 13.5,
                    cursor: "pointer",
                  }}
                >
                  {canExport && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleOne(c.id)} />
                    </div>
                  )}
                  <div style={{ color: "#6b7280" }}>{formatDate(c.createdAt)}</div>
                  <div style={{ color: "#6b7280" }}>{nameOf(businessTagTypes, c.businessTypeId) || "—"}</div>
                  <div style={{ color: "#6b7280" }}>{c.businessName || "—"}</div>
                  <div style={{ color: "#6b7280" }}>{c.phone}</div>
                  <div style={{ fontWeight: 500 }}>{c.name}</div>
                  <div style={{ color: "#6b7280" }}>{nameOf(subAreas, c.subAreaId) || "—"}</div>
                  <div style={{ color: "#6b7280" }}>{nameOf(leadSources, c.sourceId) || "—"}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {showAssignedTo ? (
                      stageBadgeNames(c).map((name, i) => {
                        const style = STAGE_STYLES[name] ?? { bg: "#eef0f4", color: "#4b5566" };
                        return (
                          <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: style.bg, color: style.color }}>
                            {name}
                          </span>
                        );
                      })
                    ) : (() => {
                      const name = stageNameOf(myStageId(c));
                      const style = STAGE_STYLES[name] ?? { bg: "#eef0f4", color: "#4b5566" };
                      return (
                        <span style={{ fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: style.bg, color: style.color }}>
                          {name}
                        </span>
                      );
                    })()}
                  </div>
                  {showAssignedTo && <div style={{ color: "#6b7280" }}>{assigneeNames(c)}</div>}
                  <div style={{ color: "#6b7280" }}>{nameOf(purposes, c.purposeId) || "—"}</div>
                  <div style={{ color: "#6b7280" }}>{formatDate(c.updatedAt)}</div>
                  <div style={{ color: "#c5c8cf", fontSize: 16, textAlign: "right" }}>›</div>
                </div>
              );
            })}
```

Also update the empty-state check right above it — replace `{filteredCustomers.length === 0 && (` with `{sortedCustomers.length === 0 && (` (same array contents, just keeping the check consistent with what's actually rendered; `filteredCustomers.length` and `sortedCustomers.length` are always equal, so this is a no-op behaviorally, but keep them matching for clarity).

- [ ] **Step 6: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors. `grep -rn "\.stageId\b" app lib` should now return nothing anywhere in the codebase.

- [ ] **Step 7: Manual verification**

Using the browser preview:
1. As SALESPERSON: confirm your own customers show a single stage badge (your own slot's stage), and customers at the default "New" stage sort to the top of your list.
2. As ADMIN/MANAGER: confirm the Stage column shows one badge per assignee (matching however many slots are filled), and the Stage filter matches a customer if *any* slot has the selected stage.
3. Export a selection as CSV/Excel (ADMIN) — confirm the Stage column in the export lists all filled slots' stage names, comma-separated.

- [ ] **Step 8: Commit**

```bash
git add "app/(dashboard)/customers/page.tsx"
git commit -m "Customer list: per-slot stage badges, own-slot New-first sort for salesperson, any-slot filter for admin/manager

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
