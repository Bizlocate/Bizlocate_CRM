# Customer Business Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 13-field admin-configurable Business Profile to customers, and along the way finish wiring `customers`/`stages`/`activities`/`tasks`/`notifications` to real Supabase persistence (today they are mock, in-memory-only state that resets on every page reload — see `lib/mock-data.ts:3-4`).

**Architecture:** Two phases. Phase 1 (Tasks 1-5) replaces the mock local-state entities with real Supabase-backed CRUD, following the exact pattern already used for `users`/`teams`/`areas`/`businessTag*` in `lib/store.tsx` — no new tables needed, the DB schema for these already exists. Phase 2 (Tasks 6-13) adds the Business Profile: 8 new admin-managed flat lookup tables (reusing a new generic `LookupListEditor` component instead of 8 bespoke admin pages), 15 new nullable columns on `customers`, and new fieldsets on the customer create form and detail page.

**Tech Stack:** Next.js (App Router) + React, Supabase (Postgres + `@supabase/supabase-js` via `lib/supabase/client.ts`), no test framework in this repo — verification is manual via the `run` skill (start dev server, click through) plus `npx tsc --noEmit` for type safety. Pure-logic-only modules get a `node:assert` self-check script (see `lib/parseBusinessTagCsv.check.ts` for the existing convention) — none of the tasks below introduce pure-logic modules, so none add a `.check.ts` file.

## Global Constraints

- Match existing code style exactly: inline `style={{...}}` objects, `className="btn btn-primary"` / `"field-input"` / `"field-label"` / `"card"` utility classes, no new UI libraries.
- All Supabase table/column names are `snake_case`; all TS fields are `camelCase` — every new mapper function follows the existing `mapArea`/`mapBusinessTagIndustry` naming and shape convention in `lib/store.tsx`.
- Every new lookup table is a flat `(id uuid pk, name text not null unique)` shape, RLS: `select` open to any authenticated user, `insert`/`update`/`delete` admin-only — identical to the existing `areas` table policy shape in `supabase/schema.sql:273-276`.
- All new `customers` columns are nullable — the Business Profile is filled in gradually, never blocks customer creation.
- Phase 2 requires a manual step: the user must run the Task 6 migration SQL in the Supabase SQL editor before Task 7 onward will work end-to-end (this repo has no Supabase CLI / DB credentials available to the implementer — confirmed via `npx supabase --version` failing in this environment). Each Phase 2 task still gets written and type-checked; full browser verification of Phase 2 tasks is only possible after that manual step.
- No automated test suite exists in this repo (confirmed via `package.json:5-9` — no test script, no test runner dependency). Do not add one. Verify via `npx tsc --noEmit` (must pass with zero errors after every task) and manual click-through in the browser preview.

---

## Phase 1: Persist existing entities to Supabase

### Task 1: Wire Pipeline Stages to Supabase

**Files:**
- Modify: `lib/store.tsx`

**Interfaces:**
- Produces: `loadStages(): Promise<Stage[]>` (called from the two existing `Promise.all([...])` init blocks in `login()` and the `useEffect`), rewritten `addStage`, `renameStage`, `moveStage`, `deleteStage` (same signatures as today, now `async`/Supabase-backed instead of local-only).

- [ ] **Step 1: Replace the mock `stages` state with a Supabase-backed load**

In `lib/store.tsx`, change:
```ts
const [stages, setStages] = useState<Stage[]>(seedStages);
```
to:
```ts
const [stages, setStages] = useState<Stage[]>([]);
```

Add a `mapStage` function next to the other `map*` functions near the top of the file (after `mapBusinessTagType`):
```ts
function mapStage(row: { id: string; name: string; order: number; is_default: boolean }): Stage {
  return { id: row.id, name: row.name, order: row.order, isDefault: row.is_default };
}
```

Add a `loadStages` function next to `loadBusinessTagTypes`:
```ts
async function loadStages(): Promise<Stage[]> {
  const supabase = createClient();
  const { data } = await supabase.from("pipeline_stages").select("*").order("order");
  const mapped = (data ?? []).map(mapStage);
  setStages(mapped);
  return mapped;
}
```

Add `loadStages()` to both `Promise.all([...])` arrays (the one inside the `useEffect` and the one inside `login`), alongside `loadBusinessTagTypes()`.

- [ ] **Step 2: Rewrite `addStage`/`renameStage`/`moveStage`/`deleteStage` against Supabase**

Replace the existing `addStage`, `renameStage`, `moveStage`, `deleteStage` functions with:
```ts
async function addStage(name: string, isDefault: boolean) {
  const supabase = createClient();
  if (isDefault) {
    await supabase.from("pipeline_stages").update({ is_default: false }).eq("is_default", true);
  }
  const order = stages.length + 1;
  const { data, error } = await supabase
    .from("pipeline_stages")
    .insert({ name, order, is_default: isDefault })
    .select()
    .single();
  if (!error && data) {
    setStages((prev) => [...(isDefault ? prev.map((s) => ({ ...s, isDefault: false })) : prev), mapStage(data)]);
  }
}

function renameStage(id: string, name: string) {
  setStages((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  const supabase = createClient();
  supabase.from("pipeline_stages").update({ name }).eq("id", id).then(() => {});
}

function moveStage(id: string, direction: -1 | 1) {
  const sorted = [...stages].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((s) => s.id === id);
  const swapIdx = idx + direction;
  if (idx === -1 || swapIdx < 0 || swapIdx >= sorted.length) return;
  const a = sorted[idx];
  const b = sorted[swapIdx];
  setStages((prev) =>
    prev.map((s) => {
      if (s.id === a.id) return { ...s, order: b.order };
      if (s.id === b.id) return { ...s, order: a.order };
      return s;
    })
  );
  const supabase = createClient();
  supabase.from("pipeline_stages").update({ order: b.order }).eq("id", a.id).then(() => {});
  supabase.from("pipeline_stages").update({ order: a.order }).eq("id", b.id).then(() => {});
}

function deleteStage(id: string) {
  const count = customers.filter((c) => c.stageId === id).length;
  if (count > 0) {
    return { ok: false, error: `${count} customer(s) are on this stage. Move them first.` };
  }
  setStages((prev) => prev.filter((s) => s.id !== id));
  const supabase = createClient();
  supabase.from("pipeline_stages").delete().eq("id", id).then(() => {});
  return { ok: true };
}
```

Note `addStage` is now `async` — the `Store` interface's `addStage: (name: string, isDefault: boolean) => void;` line stays the same signature-wise (callers don't await it; fire-and-forget is fine, matching how `addArea` etc. already behave).

- [ ] **Step 3: Remove the now-unused `seedStages` import**

Change:
```ts
import {
  seedActivities,
  seedCustomers,
  seedNotifications,
  seedStages,
  seedTasks,
} from "./mock-data";
```
to:
```ts
import {
  seedActivities,
  seedCustomers,
  seedNotifications,
  seedTasks,
} from "./mock-data";
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Use the `run` skill to start the dev server, log in as an ADMIN. Go to Admin → Pipeline Stages. Add a stage, rename one, reorder with the arrows, reload the page — confirm all changes persisted (didn't reset). Delete a non-default stage with zero customers on it — confirm it's gone after reload.

- [ ] **Step 6: Commit**

```bash
git add lib/store.tsx
git commit -m "Wire pipeline stages to Supabase

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Wire Notifications to Supabase

**Files:**
- Modify: `lib/store.tsx`

**Interfaces:**
- Consumes: `currentUser: User | null` (already in scope).
- Produces: `loadNotifications(): Promise<Notification[]>`, rewritten `markNotificationsRead`, new internal `createNotification(userId: string, message: string)` helper used by Task 3's `reassignCustomer`.

- [ ] **Step 1: Add a timestamp formatter, mapper, and loader**

Add near the top of `lib/store.tsx`, after the other `map*` functions:
```ts
function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

function mapNotification(row: { id: string; message: string; created_at: string; read: boolean }): Notification {
  return { id: row.id, message: row.message, time: formatTimestamp(row.created_at), unread: !row.read };
}
```

Add a loader next to `loadStages`:
```ts
async function loadNotifications(userId: string): Promise<Notification[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const mapped = (data ?? []).map(mapNotification);
  setNotifications(mapped);
  return mapped;
}
```

- [ ] **Step 2: Call `loadNotifications` once the current user is known**

Notifications depend on knowing `currentUserId`, unlike the other lists loaded up-front. In the `useEffect`, after `if (profile) setCurrentUserId(profile.id);`, add:
```ts
if (profile) {
  setCurrentUserId(profile.id);
  loadNotifications(profile.id);
}
```
Do the same in `login()` after `setCurrentUserId(profile.id);`:
```ts
setCurrentUserId(profile.id);
await loadNotifications(profile.id);
```

- [ ] **Step 3: Replace `markNotificationsRead` and change the default `notifications` state**

Change:
```ts
const [notifications, setNotifications] = useState<Notification[]>(seedNotifications);
```
to:
```ts
const [notifications, setNotifications] = useState<Notification[]>([]);
```

Replace `markNotificationsRead`:
```ts
function markNotificationsRead() {
  const unreadIds = notifications.filter((n) => n.unread).map((n) => n.id);
  setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  if (unreadIds.length === 0) return;
  const supabase = createClient();
  supabase.from("notifications").update({ read: true }).in("id", unreadIds).then(() => {});
}
```

- [ ] **Step 4: Add a `createNotification` helper for Task 3 to use**

Add next to `markNotificationsRead`:
```ts
function createNotification(userId: string, message: string) {
  const supabase = createClient();
  supabase
    .from("notifications")
    .insert({ user_id: userId, type: "ASSIGNMENT", message, read: false })
    .select()
    .single()
    .then(({ data, error }) => {
      if (!error && data && data.user_id === currentUserId) {
        setNotifications((prev) => [mapNotification(data), ...prev]);
      }
    });
}
```
(Only the recipient's own store instance shows the new notification optimistically; this matches the existing single-tab, no-realtime pattern used everywhere else in this store.)

- [ ] **Step 5: Remove the now-unused `seedNotifications` import**

Change the `mock-data` import to drop `seedNotifications`:
```ts
import {
  seedActivities,
  seedCustomers,
  seedTasks,
} from "./mock-data";
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (`createNotification` is unused until Task 3 wires it in — that's fine, it's a named function declaration, not a variable, so it won't trigger an unused-var error under this repo's `tsconfig.json`; if it does, ignore the warning until Task 3 consumes it in the same file.)

- [ ] **Step 7: Manual verification**

Not independently visible yet (nothing creates a notification until Task 3). Confirm the app still loads and the notification bell shows "No notifications" without crashing, logged in as any user.

- [ ] **Step 8: Commit**

```bash
git add lib/store.tsx
git commit -m "Wire notifications to Supabase

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Wire Customers (base fields) to Supabase

**Files:**
- Modify: `lib/store.tsx`

**Interfaces:**
- Consumes: `loadStages` (Task 1, for the FK), `createNotification` (Task 2).
- Produces: `loadCustomers(): Promise<Customer[]>`, rewritten `addCustomer`, `reassignCustomer`, `deleteCustomer`, `updateCustomerStage`. `addCustomer`'s returned shape stays `{ ok: boolean; error?: string }` but the function becomes `async` (the `Store` interface type for `addCustomer` must be updated to return `Promise<{ ok: boolean; error?: string }>`, which changes the call sites in Task 12's form — noted there).

- [ ] **Step 1: Add `mapCustomer` and `loadCustomers`**

Add after `mapStage`:
```ts
function mapCustomer(row: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  assigned_to: string;
  stage_id: string;
}): Customer {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? "",
    phone: row.phone ?? "",
    assignedToUserId: row.assigned_to,
    stageId: row.stage_id,
  };
}
```

Add after `loadNotifications`:
```ts
async function loadCustomers(): Promise<Customer[]> {
  const supabase = createClient();
  const { data } = await supabase.from("customers").select("*").order("name");
  const mapped = (data ?? []).map(mapCustomer);
  setCustomers(mapped);
  return mapped;
}
```

Call `loadCustomers()` alongside `loadStages()` in both the `useEffect` and `login()`'s `Promise.all([...])` arrays.

- [ ] **Step 2: Change the default `customers` state**

Change:
```ts
const [customers, setCustomers] = useState<Customer[]>(seedCustomers);
```
to:
```ts
const [customers, setCustomers] = useState<Customer[]>([]);
```

- [ ] **Step 3: Rewrite `addCustomer`**

Replace:
```ts
function addCustomer(input: { name: string; email: string; phone: string; assignedToUserId: string }) {
  const error = assignmentError(input.assignedToUserId);
  if (error) return { ok: false, error };
  const defaultStage = stages.find((s) => s.isDefault) ?? stages[0];
  setCustomers((prev) => [
    ...prev,
    {
      id: genId("c"),
      name: input.name,
      email: input.email,
      phone: input.phone,
      assignedToUserId: input.assignedToUserId,
      stageId: defaultStage?.id ?? "",
    },
  ]);
  return { ok: true };
}
```
with:
```ts
async function addCustomer(input: { name: string; email: string; phone: string; assignedToUserId: string }) {
  const error = assignmentError(input.assignedToUserId);
  if (error) return { ok: false, error };
  const defaultStage = stages.find((s) => s.isDefault) ?? stages[0];
  if (!defaultStage) return { ok: false, error: "No pipeline stage configured. Add one in Admin → Pipeline Stages first." };
  const supabase = createClient();
  const { data, error: dbError } = await supabase
    .from("customers")
    .insert({
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      assigned_to: input.assignedToUserId,
      stage_id: defaultStage.id,
      created_by: currentUserId,
    })
    .select()
    .single();
  if (dbError || !data) return { ok: false, error: dbError?.message ?? "Could not create customer." };
  setCustomers((prev) => [...prev, mapCustomer(data)]);
  return { ok: true };
}
```

- [ ] **Step 4: Rewrite `reassignCustomer`, `deleteCustomer`, `updateCustomerStage`**

Replace:
```ts
function reassignCustomer(customerId: string, newAssigneeId: string) {
  const customer = customers.find((c) => c.id === customerId);
  if (customer && customer.assignedToUserId !== newAssigneeId) {
    const error = assignmentError(newAssigneeId, customerId);
    if (error) return { ok: false, error };
  }
  setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, assignedToUserId: newAssigneeId } : c)));
  const assignee = users.find((u) => u.id === newAssigneeId);
  if (assignee && customer) {
    setNotifications((prev) => [
      { id: genId("n"), message: `${assignee.name} was assigned ${customer.name}.`, time: "just now", unread: true },
      ...prev,
    ]);
  }
  return { ok: true };
}

function deleteCustomer(customerId: string) {
  setCustomers((prev) => prev.filter((c) => c.id !== customerId));
}

function updateCustomerStage(customerId: string, stageId: string) {
  setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, stageId } : c)));
}
```
with:
```ts
function reassignCustomer(customerId: string, newAssigneeId: string) {
  const customer = customers.find((c) => c.id === customerId);
  if (customer && customer.assignedToUserId !== newAssigneeId) {
    const error = assignmentError(newAssigneeId, customerId);
    if (error) return { ok: false, error };
  }
  setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, assignedToUserId: newAssigneeId } : c)));
  const supabase = createClient();
  supabase.from("customers").update({ assigned_to: newAssigneeId }).eq("id", customerId).then(() => {});
  const assignee = users.find((u) => u.id === newAssigneeId);
  if (assignee && customer) {
    createNotification(newAssigneeId, `${assignee.name} was assigned ${customer.name}.`);
  }
  return { ok: true };
}

function deleteCustomer(customerId: string) {
  setCustomers((prev) => prev.filter((c) => c.id !== customerId));
  const supabase = createClient();
  supabase.from("customers").delete().eq("id", customerId).then(() => {});
}

function updateCustomerStage(customerId: string, stageId: string) {
  setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, stageId } : c)));
  const supabase = createClient();
  supabase.from("customers").update({ stage_id: stageId }).eq("id", customerId).then(() => {});
}
```

- [ ] **Step 5: Update the `Store` interface's `addCustomer` type**

Change:
```ts
addCustomer: (input: { name: string; email: string; phone: string; assignedToUserId: string }) => { ok: boolean; error?: string };
```
to:
```ts
addCustomer: (input: { name: string; email: string; phone: string; assignedToUserId: string }) => Promise<{ ok: boolean; error?: string }>;
```

- [ ] **Step 6: Update `NewCustomerForm`'s call site for the now-`async` `addCustomer`**

In `app/(dashboard)/customers/page.tsx`, change `handleSubmit`:
```ts
function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!name.trim() || !assignedToUserId) return;
  const result = addCustomer({ name, email, phone, assignedToUserId });
  if (!result.ok) {
    alert(result.error ?? "Could not add customer.");
    return;
  }
  onClose();
}
```
to:
```ts
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!name.trim() || !assignedToUserId) return;
  const result = await addCustomer({ name, email, phone, assignedToUserId });
  if (!result.ok) {
    alert(result.error ?? "Could not add customer.");
    return;
  }
  onClose();
}
```

- [ ] **Step 7: Remove the now-unused `seedCustomers` import**

```ts
import {
  seedActivities,
  seedTasks,
} from "./mock-data";
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Manual verification**

As ADMIN or MANAGER: create a new customer, reload the page, confirm it's still there. As ADMIN, reassign a customer to a different salesperson, confirm the assignee gets a notification (log in as that salesperson in another session/incognito window, check the bell). Delete a customer as ADMIN, confirm it's gone after reload.

- [ ] **Step 10: Commit**

```bash
git add lib/store.tsx "app/(dashboard)/customers/page.tsx"
git commit -m "Wire customers to Supabase

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Wire Activities to Supabase

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `lib/store.tsx`

**Interfaces:**
- Produces: `loadActivities(): Promise<Activity[]>`, rewritten `addActivity`.

- [ ] **Step 1: Widen `activities.follow_up_date` to free text**

The current UI's follow-up input is a loose text field (e.g. "Follow-up: 2 Aug 2026"), not a real date picker, so the `date` column type doesn't fit. In `supabase/schema.sql`, change the `activities` table definition (around line 100-108):
```sql
create table activities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  user_id uuid not null references profiles (id),
  type text not null check (type in ('CALL', 'VISIT', 'NOTE')),
  content text not null,
  follow_up_date date,
  created_at timestamptz not null default now()
);
```
to:
```sql
create table activities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  user_id uuid not null references profiles (id),
  type text not null check (type in ('CALL', 'VISIT', 'NOTE')),
  content text not null,
  follow_up text,
  created_at timestamptz not null default now()
);
```

At the very end of `supabase/schema.sql`, append a migration note for anyone applying this against an already-provisioned database (this table was created empty and unused, so this is a safe type change with no data loss):
```sql

-- ============================================================
-- Migration: widen activities.follow_up_date / tasks.due_date to
-- free text (the UI accepts loose text like "2 Aug 2026", not a
-- strict date) — run once against an already-provisioned database.
-- ============================================================
--
-- alter table activities rename column follow_up_date to follow_up;
-- alter table activities alter column follow_up type text;
-- alter table tasks rename column due_date to due;
-- alter table tasks alter column due type text;
```

- [ ] **Step 2: Add `mapActivity` and `loadActivities`**

Add after `mapCustomer` in `lib/store.tsx`:
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
    time: formatTimestamp(row.created_at),
  };
}
```

Add after `loadCustomers`:
```ts
async function loadActivities(): Promise<Activity[]> {
  const supabase = createClient();
  const { data } = await supabase.from("activities").select("*").order("created_at", { ascending: false });
  const usersById = new Map(users.map((u) => [u.id, u]));
  const mapped = (data ?? []).map((row) => mapActivity(row, usersById));
  setActivities(mapped);
  return mapped;
}
```
Call `loadActivities()` alongside `loadCustomers()` in both `Promise.all([...])` blocks — it must run after `loadUsers()` resolves (within the same `Promise.all`, `users` state won't have updated yet when `loadActivities` reads it via closure). To avoid this ordering hazard, change both call sites to load activities from the *returned* users array instead of the `users` state variable:

Change `loadActivities` to accept the users list as a parameter:
```ts
async function loadActivities(usersList: User[]): Promise<Activity[]> {
  const supabase = createClient();
  const { data } = await supabase.from("activities").select("*").order("created_at", { ascending: false });
  const usersById = new Map(usersList.map((u) => [u.id, u]));
  const mapped = (data ?? []).map((row) => mapActivity(row, usersById));
  setActivities(mapped);
  return mapped;
}
```

In the `useEffect`, restructure so users load first, then activities:
```ts
const [, loadedUsers] = await Promise.all([
  loadTeams(),
  loadUsers(),
  loadAreas(),
  loadSubAreas(),
  loadBusinessTagIndustries(),
  loadBusinessTagCategories(),
  loadBusinessTagTypes(),
  loadStages(),
  loadCustomers(),
]);
await loadActivities(loadedUsers);
const profile = loadedUsers.find((u) => u.id === data.user!.id);
```
Apply the same restructuring in `login()`: run `loadActivities(loadedUsers)` after the existing `Promise.all([...])` line, before `setCurrentUserId`.

- [ ] **Step 3: Rewrite `addActivity`**

Replace:
```ts
function addActivity(customerId: string, type: ActivityType, content: string, followUp: string) {
  setActivities((prev) => [
    { id: genId("a"), customerId, type, content, followUp, author: currentUser?.name ?? "", time: "just now" },
    ...prev,
  ]);
}
```
with:
```ts
function addActivity(customerId: string, type: ActivityType, content: string, followUp: string) {
  if (!currentUser) return;
  const supabase = createClient();
  supabase
    .from("activities")
    .insert({ customer_id: customerId, user_id: currentUser.id, type, content, follow_up: followUp || null })
    .select()
    .single()
    .then(({ data, error }) => {
      if (!error && data) {
        setActivities((prev) => [mapActivity(data, new Map(users.map((u) => [u.id, u]))), ...prev]);
      }
    });
}
```

- [ ] **Step 4: Change the default `activities` state and drop the `seedActivities` import**

```ts
const [activities, setActivities] = useState<Activity[]>([]);
```
and drop `seedActivities` from the `mock-data` import — it now imports only `seedTasks`:
```ts
import { seedTasks } from "./mock-data";
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

**Prerequisite:** open the Supabase SQL editor for this project and run the two `alter table` / `rename column` statements from Step 1's migration note (both tables are currently empty, so this is a no-risk change).

Open a customer's detail page, log a Call/Visit/Note activity with a follow-up note, reload the page, confirm it's still there with the correct author and timestamp.

- [ ] **Step 7: Commit**

```bash
git add supabase/schema.sql lib/store.tsx
git commit -m "Wire activities to Supabase

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Wire Tasks to Supabase

**Files:**
- Modify: `lib/store.tsx`

**Interfaces:**
- Produces: `loadTasks(usersList: User[]): Promise<Task[]>` (following Task 4's users-list-parameter pattern isn't actually needed here since `Task` has no author field — a plain no-arg loader is fine), rewritten `addTask`, `toggleTaskDone`.

- [ ] **Step 1: Add `mapTask` and `loadTasks`**

Add after `mapActivity`:
```ts
function mapTask(row: { id: string; customer_id: string; title: string; due: string | null; done: boolean }): Task {
  return { id: row.id, customerId: row.customer_id, title: row.title, due: row.due ?? "No due date", done: row.done };
}
```

Add after `loadActivities`:
```ts
async function loadTasks(): Promise<Task[]> {
  const supabase = createClient();
  const { data } = await supabase.from("tasks").select("*").order("created_at");
  const mapped = (data ?? []).map(mapTask);
  setTasks(mapped);
  return mapped;
}
```
Call `loadTasks()` alongside `loadCustomers()` in both `Promise.all([...])` blocks (it has no user-ordering dependency, unlike `loadActivities`).

- [ ] **Step 2: Rewrite `addTask` and `toggleTaskDone`**

Replace:
```ts
function addTask(customerId: string, title: string, due: string) {
  setTasks((prev) => [...prev, { id: genId("t"), customerId, title, due, done: false }]);
}

function toggleTaskDone(taskId: string) {
  setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)));
}
```
with:
```ts
function addTask(customerId: string, title: string, due: string) {
  if (!currentUser) return;
  const supabase = createClient();
  supabase
    .from("tasks")
    .insert({ customer_id: customerId, user_id: currentUser.id, title, due: due || null, done: false })
    .select()
    .single()
    .then(({ data, error }) => {
      if (!error && data) setTasks((prev) => [...prev, mapTask(data)]);
    });
}

function toggleTaskDone(taskId: string) {
  const target = tasks.find((t) => t.id === taskId);
  if (!target) return;
  setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)));
  const supabase = createClient();
  supabase.from("tasks").update({ done: !target.done }).eq("id", taskId).then(() => {});
}
```

- [ ] **Step 3: Change the default `tasks` state, drop the `mock-data` import and `genId`**

```ts
const [tasks, setTasks] = useState<Task[]>([]);
```

Remove the `mock-data` import entirely (it's now unused — `seedTasks` was the last one):
```ts
import { createClient } from "./supabase/client";
```
(delete the `import { seedTasks } from "./mock-data";` line)

Remove the now-unused `genId` function (no remaining callers after this task):
```ts
function genId(prefix: string) {
  return prefix + Math.random().toString(36).slice(2, 8);
}
```

- [ ] **Step 4: Delete the now-fully-unused mock data file**

`lib/mock-data.ts` is no longer imported anywhere. Delete it:
```bash
git rm lib/mock-data.ts
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

On a customer's detail page, add a task with a due date, reload, confirm it's still there. Check it off as done, reload, confirm it stays checked (moved to the "Done" section).

- [ ] **Step 7: Commit**

```bash
git add -A lib/store.tsx lib/mock-data.ts
git commit -m "Wire tasks to Supabase, remove mock data file

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Phase 2: Customer Business Profile

**Before starting Task 7:** run the SQL from Task 6 in the Supabase SQL editor for this project. Tasks 8-13 assume the new tables and columns already exist in the database.

### Task 6: Schema migration — lookup tables + customer columns

**Files:**
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: 8 new tables (`lead_sources`, `property_types`, `purposes`, `languages`, `firsttime_branch_types`, `races`, `target_races`, `target_types`), each `(id uuid pk, name text not null unique)`. 15 new nullable columns on `customers` (see Data Model section of the design doc at `docs/superpowers/specs/2026-08-30-customer-business-profile-design.md`).

- [ ] **Step 1: Add the 8 lookup tables**

In `supabase/schema.sql`, insert this block right after the `business_tag_types` table definition (after line 87, before `create table customers`):
```sql
create table lead_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table property_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table purposes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table languages (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table firsttime_branch_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table races (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table target_races (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table target_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);
```

- [ ] **Step 2: Add the migration for an already-provisioned database**

At the very end of `supabase/schema.sql`, append:
```sql

-- ============================================================
-- Migration: Customer Business Profile — run once against an
-- already-provisioned database.
-- ============================================================

create table lead_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table property_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table purposes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table languages (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table firsttime_branch_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table races (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table target_races (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table target_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

alter table customers add column if not exists source_id uuid references lead_sources (id) on delete set null;
alter table customers add column if not exists area_id uuid references areas (id) on delete set null;
alter table customers add column if not exists sub_area_id uuid references sub_areas (id) on delete set null;
alter table customers add column if not exists property_type_id uuid references property_types (id) on delete set null;
alter table customers add column if not exists purpose_id uuid references purposes (id) on delete set null;
alter table customers add column if not exists business_industry_id uuid references business_tag_industries (id) on delete set null;
alter table customers add column if not exists business_category_id uuid references business_tag_categories (id) on delete set null;
alter table customers add column if not exists business_type_id uuid references business_tag_types (id) on delete set null;
alter table customers add column if not exists race_id uuid references races (id) on delete set null;
alter table customers add column if not exists language_id uuid references languages (id) on delete set null;
alter table customers add column if not exists business_name text;
alter table customers add column if not exists firsttime_branch_id uuid references firsttime_branch_types (id) on delete set null;
alter table customers add column if not exists target_race_id uuid references target_races (id) on delete set null;
alter table customers add column if not exists target_type_id uuid references target_types (id) on delete set null;
alter table customers add column if not exists remark text;

alter table lead_sources enable row level security;
alter table property_types enable row level security;
alter table purposes enable row level security;
alter table languages enable row level security;
alter table firsttime_branch_types enable row level security;
alter table races enable row level security;
alter table target_races enable row level security;
alter table target_types enable row level security;

create policy "lead_sources_select" on lead_sources for select using (auth.uid() is not null);
create policy "lead_sources_insert_admin" on lead_sources for insert with check (is_admin());
create policy "lead_sources_update_admin" on lead_sources for update using (is_admin());
create policy "lead_sources_delete_admin" on lead_sources for delete using (is_admin());

create policy "property_types_select" on property_types for select using (auth.uid() is not null);
create policy "property_types_insert_admin" on property_types for insert with check (is_admin());
create policy "property_types_update_admin" on property_types for update using (is_admin());
create policy "property_types_delete_admin" on property_types for delete using (is_admin());

create policy "purposes_select" on purposes for select using (auth.uid() is not null);
create policy "purposes_insert_admin" on purposes for insert with check (is_admin());
create policy "purposes_update_admin" on purposes for update using (is_admin());
create policy "purposes_delete_admin" on purposes for delete using (is_admin());

create policy "languages_select" on languages for select using (auth.uid() is not null);
create policy "languages_insert_admin" on languages for insert with check (is_admin());
create policy "languages_update_admin" on languages for update using (is_admin());
create policy "languages_delete_admin" on languages for delete using (is_admin());

create policy "firsttime_branch_types_select" on firsttime_branch_types for select using (auth.uid() is not null);
create policy "firsttime_branch_types_insert_admin" on firsttime_branch_types for insert with check (is_admin());
create policy "firsttime_branch_types_update_admin" on firsttime_branch_types for update using (is_admin());
create policy "firsttime_branch_types_delete_admin" on firsttime_branch_types for delete using (is_admin());

create policy "races_select" on races for select using (auth.uid() is not null);
create policy "races_insert_admin" on races for insert with check (is_admin());
create policy "races_update_admin" on races for update using (is_admin());
create policy "races_delete_admin" on races for delete using (is_admin());

create policy "target_races_select" on target_races for select using (auth.uid() is not null);
create policy "target_races_insert_admin" on target_races for insert with check (is_admin());
create policy "target_races_update_admin" on target_races for update using (is_admin());
create policy "target_races_delete_admin" on target_races for delete using (is_admin());

create policy "target_types_select" on target_types for select using (auth.uid() is not null);
create policy "target_types_insert_admin" on target_types for insert with check (is_admin());
create policy "target_types_update_admin" on target_types for update using (is_admin());
create policy "target_types_delete_admin" on target_types for delete using (is_admin());

create or replace function protect_customer_remark_column() returns trigger as $$
begin
  if new.remark is distinct from old.remark and not (
    is_admin() or exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
  ) then
    raise exception 'only an admin or manager can change the remark';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger customers_protect_remark
  before update on customers
  for each row execute function protect_customer_remark_column();

insert into purposes (name) values ('Rent'), ('Buy'), ('Buy/Rent');
insert into firsttime_branch_types (name) values ('First Time'), ('Branch');
```

- [ ] **Step 3: Also update the main (fresh-install) schema for consistency**

Add the same 15 columns to the original `create table customers (...)` block (around line 89-98):
```sql
create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  assigned_to uuid not null references profiles (id),
  stage_id uuid not null references pipeline_stages (id),
  source_id uuid references lead_sources (id) on delete set null,
  area_id uuid references areas (id) on delete set null,
  sub_area_id uuid references sub_areas (id) on delete set null,
  property_type_id uuid references property_types (id) on delete set null,
  purpose_id uuid references purposes (id) on delete set null,
  business_industry_id uuid references business_tag_industries (id) on delete set null,
  business_category_id uuid references business_tag_categories (id) on delete set null,
  business_type_id uuid references business_tag_types (id) on delete set null,
  race_id uuid references races (id) on delete set null,
  language_id uuid references languages (id) on delete set null,
  business_name text,
  firsttime_branch_id uuid references firsttime_branch_types (id) on delete set null,
  target_race_id uuid references target_races (id) on delete set null,
  target_type_id uuid references target_types (id) on delete set null,
  remark text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);
```

Add RLS enable + policies for the 8 new tables right after the existing `business_tag_types` RLS block (after line 300, before the `-- customers:` comment), using the same 4 policies per table already written in Step 2 above (copy that block verbatim into this location too — fresh installs need it enabled from the start, not just as a commented migration).

Add the `protect_customer_remark_column` function + `customers_protect_remark` trigger to the "Column-level guards" section, right after `customers_protect_assignment` (after line 201).

Add the two seed `insert into purposes ...` / `insert into firsttime_branch_types ...` statements to the "Seed" section at the bottom, right after the existing `insert into pipeline_stages ...` seed (after line 385).

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "Add Business Profile schema: 8 lookup tables + 15 customer columns

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Manual step — apply the migration**

Tell the user: open the Supabase SQL editor for this project and run the SQL block from Step 2 above (the one under "Migration: Customer Business Profile"). Confirm no errors before continuing to Task 7.

---

### Task 7: Types — lookup interfaces + Customer extension

**Files:**
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: `LeadSource`, `PropertyType`, `Purpose`, `Language`, `FirsttimeBranchType`, `Race`, `TargetRace`, `TargetType` interfaces (each `{ id: string; name: string }`). Extended `Customer` interface with 13 new optional fields.

- [ ] **Step 1: Add the 8 lookup interfaces**

In `lib/types.ts`, after the `SubArea` interface (after line 30), add:
```ts
export interface LeadSource {
  id: string;
  name: string;
}

export interface PropertyType {
  id: string;
  name: string;
}

export interface Purpose {
  id: string;
  name: string;
}

export interface Language {
  id: string;
  name: string;
}

export interface FirsttimeBranchType {
  id: string;
  name: string;
}

export interface Race {
  id: string;
  name: string;
}

export interface TargetRace {
  id: string;
  name: string;
}

export interface TargetType {
  id: string;
  name: string;
}
```

- [ ] **Step 2: Extend the `Customer` interface**

Change:
```ts
export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  stageId: string;
  assignedToUserId: string;
}
```
to:
```ts
export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  stageId: string;
  assignedToUserId: string;
  sourceId: string | null;
  areaId: string | null;
  subAreaId: string | null;
  propertyTypeId: string | null;
  purposeId: string | null;
  businessIndustryId: string | null;
  businessCategoryId: string | null;
  businessTypeId: string | null;
  raceId: string | null;
  languageId: string | null;
  businessName: string;
  firsttimeBranchId: string | null;
  targetRaceId: string | null;
  targetTypeId: string | null;
  remark: string;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: errors in `lib/store.tsx` — `mapCustomer` no longer satisfies the `Customer` type (missing the new required fields). This is expected; Task 9 fixes it. Confirm the errors are only in `lib/store.tsx` and only about the new `Customer` fields.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "Add Business Profile lookup types + extend Customer interface

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Store — CRUD for the 8 lookup lists

**Files:**
- Modify: `lib/store.tsx`

**Interfaces:**
- Consumes: `LeadSource`, `PropertyType`, `Purpose`, `Language`, `FirsttimeBranchType`, `Race`, `TargetRace`, `TargetType` (Task 7).
- Produces: state arrays `leadSources`, `propertyTypes`, `purposes`, `languages`, `firsttimeBranchTypes`, `races`, `targetRaces`, `targetTypes` on the `Store` interface, each with `add<Name>(name: string): void`, `update<Name>(id: string, name: string): void`, `delete<Name>(id: string): void` (24 functions total), following the exact shape of `addArea`/`updateArea`/`deleteArea`.

- [ ] **Step 1: Add mapper functions**

After `mapBusinessTagType`, add 8 mappers (all identical shape to `mapArea`):
```ts
function mapLeadSource(row: { id: string; name: string }): LeadSource {
  return { id: row.id, name: row.name };
}

function mapPropertyType(row: { id: string; name: string }): PropertyType {
  return { id: row.id, name: row.name };
}

function mapPurpose(row: { id: string; name: string }): Purpose {
  return { id: row.id, name: row.name };
}

function mapLanguage(row: { id: string; name: string }): Language {
  return { id: row.id, name: row.name };
}

function mapFirsttimeBranchType(row: { id: string; name: string }): FirsttimeBranchType {
  return { id: row.id, name: row.name };
}

function mapRace(row: { id: string; name: string }): Race {
  return { id: row.id, name: row.name };
}

function mapTargetRace(row: { id: string; name: string }): TargetRace {
  return { id: row.id, name: row.name };
}

function mapTargetType(row: { id: string; name: string }): TargetType {
  return { id: row.id, name: row.name };
}
```

- [ ] **Step 2: Update the type import**

Add the 8 new type names to the `import { ... } from "./types";` block in `lib/store.tsx`:
```ts
import {
  Activity,
  ActivityType,
  Area,
  BusinessTagCategory,
  BusinessTagIndustry,
  BusinessTagType,
  Customer,
  CsvBusinessTagPreview,
  CsvPreview,
  FirsttimeBranchType,
  Language,
  LeadSource,
  Notification,
  PropertyType,
  Purpose,
  Race,
  Role,
  Stage,
  SubArea,
  Target Race,
  TargetType,
  Task,
  Team,
  User,
} from "./types";
```
(Note: `TargetRace` — no space; write it as one identifier `TargetRace`.)

- [ ] **Step 3: Add state + loaders**

Add 8 state declarations next to `businessTagTypes`:
```ts
const [leadSources, setLeadSources] = useState<LeadSource[]>([]);
const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
const [purposes, setPurposes] = useState<Purpose[]>([]);
const [languages, setLanguages] = useState<Language[]>([]);
const [firsttimeBranchTypes, setFirsttimeBranchTypes] = useState<FirsttimeBranchType[]>([]);
const [races, setRaces] = useState<Race[]>([]);
const [targetRaces, setTargetRaces] = useState<TargetRace[]>([]);
const [targetTypes, setTargetTypes] = useState<TargetType[]>([]);
```

Add 8 loaders next to `loadBusinessTagTypes`:
```ts
async function loadLeadSources(): Promise<LeadSource[]> {
  const supabase = createClient();
  const { data } = await supabase.from("lead_sources").select("*").order("name");
  const mapped = (data ?? []).map(mapLeadSource);
  setLeadSources(mapped);
  return mapped;
}

async function loadPropertyTypes(): Promise<PropertyType[]> {
  const supabase = createClient();
  const { data } = await supabase.from("property_types").select("*").order("name");
  const mapped = (data ?? []).map(mapPropertyType);
  setPropertyTypes(mapped);
  return mapped;
}

async function loadPurposes(): Promise<Purpose[]> {
  const supabase = createClient();
  const { data } = await supabase.from("purposes").select("*").order("name");
  const mapped = (data ?? []).map(mapPurpose);
  setPurposes(mapped);
  return mapped;
}

async function loadLanguages(): Promise<Language[]> {
  const supabase = createClient();
  const { data } = await supabase.from("languages").select("*").order("name");
  const mapped = (data ?? []).map(mapLanguage);
  setLanguages(mapped);
  return mapped;
}

async function loadFirsttimeBranchTypes(): Promise<FirsttimeBranchType[]> {
  const supabase = createClient();
  const { data } = await supabase.from("firsttime_branch_types").select("*").order("name");
  const mapped = (data ?? []).map(mapFirsttimeBranchType);
  setFirsttimeBranchTypes(mapped);
  return mapped;
}

async function loadRaces(): Promise<Race[]> {
  const supabase = createClient();
  const { data } = await supabase.from("races").select("*").order("name");
  const mapped = (data ?? []).map(mapRace);
  setRaces(mapped);
  return mapped;
}

async function loadTargetRaces(): Promise<TargetRace[]> {
  const supabase = createClient();
  const { data } = await supabase.from("target_races").select("*").order("name");
  const mapped = (data ?? []).map(mapTargetRace);
  setTargetRaces(mapped);
  return mapped;
}

async function loadTargetTypes(): Promise<TargetType[]> {
  const supabase = createClient();
  const { data } = await supabase.from("target_types").select("*").order("name");
  const mapped = (data ?? []).map(mapTargetType);
  setTargetTypes(mapped);
  return mapped;
}
```

Add all 8 loader calls to both `Promise.all([...])` init arrays, alongside `loadBusinessTagTypes()`.

- [ ] **Step 4: Add CRUD functions**

Add 24 functions (3 per list), each following `addArea`/`updateArea`/`deleteArea` exactly:
```ts
function addLeadSource(name: string) {
  const supabase = createClient();
  supabase.from("lead_sources").insert({ name }).select().single().then(({ data, error }) => {
    if (!error && data) setLeadSources((prev) => [...prev, mapLeadSource(data)]);
  });
}
function updateLeadSource(id: string, name: string) {
  setLeadSources((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
  const supabase = createClient();
  supabase.from("lead_sources").update({ name }).eq("id", id).then(() => {});
}
function deleteLeadSource(id: string) {
  setLeadSources((prev) => prev.filter((i) => i.id !== id));
  const supabase = createClient();
  supabase.from("lead_sources").delete().eq("id", id).then(() => {});
}

function addPropertyType(name: string) {
  const supabase = createClient();
  supabase.from("property_types").insert({ name }).select().single().then(({ data, error }) => {
    if (!error && data) setPropertyTypes((prev) => [...prev, mapPropertyType(data)]);
  });
}
function updatePropertyType(id: string, name: string) {
  setPropertyTypes((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
  const supabase = createClient();
  supabase.from("property_types").update({ name }).eq("id", id).then(() => {});
}
function deletePropertyType(id: string) {
  setPropertyTypes((prev) => prev.filter((i) => i.id !== id));
  const supabase = createClient();
  supabase.from("property_types").delete().eq("id", id).then(() => {});
}

function addPurpose(name: string) {
  const supabase = createClient();
  supabase.from("purposes").insert({ name }).select().single().then(({ data, error }) => {
    if (!error && data) setPurposes((prev) => [...prev, mapPurpose(data)]);
  });
}
function updatePurpose(id: string, name: string) {
  setPurposes((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
  const supabase = createClient();
  supabase.from("purposes").update({ name }).eq("id", id).then(() => {});
}
function deletePurpose(id: string) {
  setPurposes((prev) => prev.filter((i) => i.id !== id));
  const supabase = createClient();
  supabase.from("purposes").delete().eq("id", id).then(() => {});
}

function addLanguage(name: string) {
  const supabase = createClient();
  supabase.from("languages").insert({ name }).select().single().then(({ data, error }) => {
    if (!error && data) setLanguages((prev) => [...prev, mapLanguage(data)]);
  });
}
function updateLanguage(id: string, name: string) {
  setLanguages((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
  const supabase = createClient();
  supabase.from("languages").update({ name }).eq("id", id).then(() => {});
}
function deleteLanguage(id: string) {
  setLanguages((prev) => prev.filter((i) => i.id !== id));
  const supabase = createClient();
  supabase.from("languages").delete().eq("id", id).then(() => {});
}

function addFirsttimeBranchType(name: string) {
  const supabase = createClient();
  supabase.from("firsttime_branch_types").insert({ name }).select().single().then(({ data, error }) => {
    if (!error && data) setFirsttimeBranchTypes((prev) => [...prev, mapFirsttimeBranchType(data)]);
  });
}
function updateFirsttimeBranchType(id: string, name: string) {
  setFirsttimeBranchTypes((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
  const supabase = createClient();
  supabase.from("firsttime_branch_types").update({ name }).eq("id", id).then(() => {});
}
function deleteFirsttimeBranchType(id: string) {
  setFirsttimeBranchTypes((prev) => prev.filter((i) => i.id !== id));
  const supabase = createClient();
  supabase.from("firsttime_branch_types").delete().eq("id", id).then(() => {});
}

function addRace(name: string) {
  const supabase = createClient();
  supabase.from("races").insert({ name }).select().single().then(({ data, error }) => {
    if (!error && data) setRaces((prev) => [...prev, mapRace(data)]);
  });
}
function updateRace(id: string, name: string) {
  setRaces((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
  const supabase = createClient();
  supabase.from("races").update({ name }).eq("id", id).then(() => {});
}
function deleteRace(id: string) {
  setRaces((prev) => prev.filter((i) => i.id !== id));
  const supabase = createClient();
  supabase.from("races").delete().eq("id", id).then(() => {});
}

function addTargetRace(name: string) {
  const supabase = createClient();
  supabase.from("target_races").insert({ name }).select().single().then(({ data, error }) => {
    if (!error && data) setTargetRaces((prev) => [...prev, mapTargetRace(data)]);
  });
}
function updateTargetRace(id: string, name: string) {
  setTargetRaces((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
  const supabase = createClient();
  supabase.from("target_races").update({ name }).eq("id", id).then(() => {});
}
function deleteTargetRace(id: string) {
  setTargetRaces((prev) => prev.filter((i) => i.id !== id));
  const supabase = createClient();
  supabase.from("target_races").delete().eq("id", id).then(() => {});
}

function addTargetType(name: string) {
  const supabase = createClient();
  supabase.from("target_types").insert({ name }).select().single().then(({ data, error }) => {
    if (!error && data) setTargetTypes((prev) => [...prev, mapTargetType(data)]);
  });
}
function updateTargetType(id: string, name: string) {
  setTargetTypes((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
  const supabase = createClient();
  supabase.from("target_types").update({ name }).eq("id", id).then(() => {});
}
function deleteTargetType(id: string) {
  setTargetTypes((prev) => prev.filter((i) => i.id !== id));
  const supabase = createClient();
  supabase.from("target_types").delete().eq("id", id).then(() => {});
}
```

- [ ] **Step 5: Add to the `Store` interface and the returned `value` object**

In the `Store` interface, after the `addBusinessTagType`/`updateBusinessTagType`/`deleteBusinessTagType` lines, add:
```ts
leadSources: LeadSource[];
propertyTypes: PropertyType[];
purposes: Purpose[];
languages: Language[];
firsttimeBranchTypes: FirsttimeBranchType[];
races: Race[];
targetRaces: TargetRace[];
targetTypes: TargetType[];

addLeadSource: (name: string) => void;
updateLeadSource: (id: string, name: string) => void;
deleteLeadSource: (id: string) => void;
addPropertyType: (name: string) => void;
updatePropertyType: (id: string, name: string) => void;
deletePropertyType: (id: string) => void;
addPurpose: (name: string) => void;
updatePurpose: (id: string, name: string) => void;
deletePurpose: (id: string) => void;
addLanguage: (name: string) => void;
updateLanguage: (id: string, name: string) => void;
deleteLanguage: (id: string) => void;
addFirsttimeBranchType: (name: string) => void;
updateFirsttimeBranchType: (id: string, name: string) => void;
deleteFirsttimeBranchType: (id: string) => void;
addRace: (name: string) => void;
updateRace: (id: string, name: string) => void;
deleteRace: (id: string) => void;
addTargetRace: (name: string) => void;
updateTargetRace: (id: string, name: string) => void;
deleteTargetRace: (id: string) => void;
addTargetType: (name: string) => void;
updateTargetType: (id: string, name: string) => void;
deleteTargetType: (id: string) => void;
```

In the `value: Store = { ... }` object at the bottom of `StoreProvider`, after the `addBusinessTagType`/`updateBusinessTagType`/`deleteBusinessTagType` lines, add:
```ts
leadSources,
propertyTypes,
purposes,
languages,
firsttimeBranchTypes,
races,
targetRaces,
targetTypes,
addLeadSource,
updateLeadSource,
deleteLeadSource,
addPropertyType,
updatePropertyType,
deletePropertyType,
addPurpose,
updatePurpose,
deletePurpose,
addLanguage,
updateLanguage,
deleteLanguage,
addFirsttimeBranchType,
updateFirsttimeBranchType,
deleteFirsttimeBranchType,
addRace,
updateRace,
deleteRace,
addTargetRace,
updateTargetRace,
deleteTargetRace,
addTargetType,
updateTargetType,
deleteTargetType,
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: same pre-existing `mapCustomer`/`Customer` errors from Task 7, no new errors.

- [ ] **Step 7: Commit**

```bash
git add lib/store.tsx
git commit -m "Add store CRUD for the 8 Business Profile lookup lists

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Store — extend Customer with Business Profile fields

**Files:**
- Modify: `lib/store.tsx`

**Interfaces:**
- Produces: extended `mapCustomer`, extended `addCustomer` input type, new `updateCustomerProfile(customerId: string, patch: Partial<Omit<Customer, "id" | "assignedToUserId" | "stageId" | "remark">>): void`, new `updateCustomerRemark(customerId: string, remark: string): void`.

- [ ] **Step 1: Extend `mapCustomer`**

Replace the `mapCustomer` function from Task 3 with:
```ts
function mapCustomer(row: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  assigned_to: string;
  stage_id: string;
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
  remark: string | null;
}): Customer {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? "",
    phone: row.phone ?? "",
    assignedToUserId: row.assigned_to,
    stageId: row.stage_id,
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
    remark: row.remark ?? "",
  };
}
```

- [ ] **Step 2: Extend `addCustomer`'s input and insert payload**

Define the profile input shape once, above `addCustomer`:
```ts
interface CustomerProfileInput {
  sourceId: string | null;
  areaId: string | null;
  subAreaId: string | null;
  propertyTypeId: string | null;
  purposeId: string | null;
  businessIndustryId: string | null;
  businessCategoryId: string | null;
  businessTypeId: string | null;
  raceId: string | null;
  languageId: string | null;
  businessName: string;
  firsttimeBranchId: string | null;
  targetRaceId: string | null;
  targetTypeId: string | null;
  remark: string;
}

const emptyCustomerProfile: CustomerProfileInput = {
  sourceId: null,
  areaId: null,
  subAreaId: null,
  propertyTypeId: null,
  purposeId: null,
  businessIndustryId: null,
  businessCategoryId: null,
  businessTypeId: null,
  raceId: null,
  languageId: null,
  businessName: "",
  firsttimeBranchId: null,
  targetRaceId: null,
  targetTypeId: null,
  remark: "",
};
```

Change `addCustomer`'s signature and insert call (from Task 3) to:
```ts
async function addCustomer(input: { name: string; email: string; phone: string; assignedToUserId: string } & Partial<CustomerProfileInput>) {
  const error = assignmentError(input.assignedToUserId);
  if (error) return { ok: false, error };
  const defaultStage = stages.find((s) => s.isDefault) ?? stages[0];
  if (!defaultStage) return { ok: false, error: "No pipeline stage configured. Add one in Admin → Pipeline Stages first." };
  const profile = { ...emptyCustomerProfile, ...input };
  const supabase = createClient();
  const { data, error: dbError } = await supabase
    .from("customers")
    .insert({
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      assigned_to: input.assignedToUserId,
      stage_id: defaultStage.id,
      created_by: currentUserId,
      source_id: profile.sourceId,
      area_id: profile.areaId,
      sub_area_id: profile.subAreaId,
      property_type_id: profile.propertyTypeId,
      purpose_id: profile.purposeId,
      business_industry_id: profile.businessIndustryId,
      business_category_id: profile.businessCategoryId,
      business_type_id: profile.businessTypeId,
      race_id: profile.raceId,
      language_id: profile.languageId,
      business_name: profile.businessName || null,
      firsttime_branch_id: profile.firsttimeBranchId,
      target_race_id: profile.targetRaceId,
      target_type_id: profile.targetTypeId,
      remark: profile.remark || null,
    })
    .select()
    .single();
  if (dbError || !data) return { ok: false, error: dbError?.message ?? "Could not create customer." };
  setCustomers((prev) => [...prev, mapCustomer(data)]);
  return { ok: true };
}
```

Update the `Store` interface's `addCustomer` line (from Task 3) to:
```ts
addCustomer: (input: { name: string; email: string; phone: string; assignedToUserId: string } & Partial<CustomerProfileInput>) => Promise<{ ok: boolean; error?: string }>;
```

- [ ] **Step 3: Add `updateCustomerProfile` and `updateCustomerRemark`**

Add next to `updateCustomerStage`:
```ts
function updateCustomerProfile(customerId: string, patch: Partial<CustomerProfileInput>) {
  setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, ...patch } : c)));
  const columnMap: Record<string, string> = {
    sourceId: "source_id",
    areaId: "area_id",
    subAreaId: "sub_area_id",
    propertyTypeId: "property_type_id",
    purposeId: "purpose_id",
    businessIndustryId: "business_industry_id",
    businessCategoryId: "business_category_id",
    businessTypeId: "business_type_id",
    raceId: "race_id",
    languageId: "language_id",
    businessName: "business_name",
    firsttimeBranchId: "firsttime_branch_id",
    targetRaceId: "target_race_id",
    targetTypeId: "target_type_id",
  };
  const dbPatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const column = columnMap[key];
    if (column) dbPatch[column] = value === "" ? null : value;
  }
  const supabase = createClient();
  supabase.from("customers").update(dbPatch).eq("id", customerId).then(() => {});
}

function updateCustomerRemark(customerId: string, remark: string) {
  setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, remark } : c)));
  const supabase = createClient();
  supabase.from("customers").update({ remark: remark || null }).eq("id", customerId).then(() => {});
}
```

Add both to the `Store` interface (next to `updateCustomerStage`) and to the `value` object:
```ts
updateCustomerProfile: (customerId: string, patch: Partial<CustomerProfileInput>) => void;
updateCustomerRemark: (customerId: string, remark: string) => void;
```

- [ ] **Step 4: Export `CustomerProfileInput` for the form components**

Since `NewCustomerForm` (Task 12) and the detail page (Task 13) need this type, add `export` to its declaration:
```ts
export interface CustomerProfileInput {
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (this resolves the `mapCustomer`/`Customer` mismatch flagged since Task 7).

- [ ] **Step 6: Manual verification**

Not independently visible in the UI yet (no form fields wired until Task 12/13). Confirm the app still builds and the existing customer create/detail flows work exactly as before (profile fields silently default to null/empty).

- [ ] **Step 7: Commit**

```bash
git add lib/store.tsx
git commit -m "Extend customer store functions with Business Profile fields

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Generic `LookupListEditor` component

**Files:**
- Create: `components/LookupListEditor.tsx`

**Interfaces:**
- Consumes: nothing from the store directly — pure props component.
- Produces: `export default function LookupListEditor(props: { title: string; items: { id: string; name: string }[]; onAdd: (name: string) => void; onUpdate: (id: string, name: string) => void; onDelete: (id: string) => void }): JSX.Element`, used by Task 11.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";

interface LookupItem {
  id: string;
  name: string;
}

export default function LookupListEditor({
  title,
  items,
  onAdd,
  onUpdate,
  onDelete,
}: {
  title: string;
  items: LookupItem[];
  onAdd: (name: string) => void;
  onUpdate: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function handleAdd() {
    if (!newName.trim()) return;
    onAdd(newName.trim());
    setNewName("");
  }

  function startEdit(id: string, name: string) {
    setEditingId(id);
    setEditingName(name);
  }

  function saveEdit() {
    if (editingId && editingName.trim()) onUpdate(editingId, editingName.trim());
    setEditingId(null);
  }

  function handleDelete(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    onDelete(id);
    setConfirmDeleteId(null);
  }

  return (
    <div className="card">
      <div
        style={{
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
        {title}
      </div>
      {items.length === 0 && <div style={{ padding: 20, fontSize: 13.5, color: "#9aa0ab" }}>No items yet. Add one below.</div>}
      {items.map((item) => (
        <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderBottom: "1px solid #eef0f2", fontSize: 13.5 }}>
          {editingId === item.id ? (
            <input
              className="field-input"
              style={{ flex: 1 }}
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={saveEdit}
              onKeyDown={(e) => e.key === "Enter" && saveEdit()}
              autoFocus
            />
          ) : (
            <div style={{ flex: 1, fontWeight: 500 }}>{item.name}</div>
          )}
          <span style={{ color: "#4046c9", fontWeight: 500, cursor: "pointer" }} onClick={() => startEdit(item.id, item.name)}>
            Edit
          </span>
          <span
            style={{ color: confirmDeleteId === item.id ? "#a13a2b" : "#4046c9", fontWeight: 500, cursor: "pointer" }}
            onClick={() => handleDelete(item.id)}
          >
            {confirmDeleteId === item.id ? "Confirm delete?" : "Delete"}
          </span>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, padding: 16 }}>
        <input
          className="field-input"
          style={{ flex: 1 }}
          placeholder="New item name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <button className="btn btn-outline" type="button" onClick={handleAdd}>
          + Add
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (this component isn't imported anywhere yet).

- [ ] **Step 3: Commit**

```bash
git add components/LookupListEditor.tsx
git commit -m "Add generic LookupListEditor component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Admin Profile Lists page + AdminTabs entry

**Files:**
- Create: `app/(dashboard)/admin/profile-lists/page.tsx`
- Modify: `components/AdminTabs.tsx`

**Interfaces:**
- Consumes: `LookupListEditor` (Task 10), the 8 lookup state arrays + CRUD functions from `useStore()` (Task 8).

- [ ] **Step 1: Add the tab entry**

In `components/AdminTabs.tsx`, add a new entry to the `TABS` array after `"Pipeline Stages"`:
```ts
const TABS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/teams", label: "Teams" },
  { href: "/admin/area", label: "Area" },
  { href: "/admin/business-tags", label: "Business Tag" },
  { href: "/admin/stages", label: "Pipeline Stages" },
  { href: "/admin/profile-lists", label: "Profile Lists" },
];
```

- [ ] **Step 2: Write the page**

```tsx
"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import AdminTabs from "@/components/AdminTabs";
import LookupListEditor from "@/components/LookupListEditor";

const LISTS = [
  "Source",
  "Property Type",
  "Purpose",
  "Language",
  "Firsttime/Branch",
  "Race",
  "Target Race",
  "Target Type",
] as const;

type ListName = (typeof LISTS)[number];

export default function AdminProfileListsPage() {
  const {
    leadSources,
    propertyTypes,
    purposes,
    languages,
    firsttimeBranchTypes,
    races,
    targetRaces,
    targetTypes,
    addLeadSource,
    updateLeadSource,
    deleteLeadSource,
    addPropertyType,
    updatePropertyType,
    deletePropertyType,
    addPurpose,
    updatePurpose,
    deletePurpose,
    addLanguage,
    updateLanguage,
    deleteLanguage,
    addFirsttimeBranchType,
    updateFirsttimeBranchType,
    deleteFirsttimeBranchType,
    addRace,
    updateRace,
    deleteRace,
    addTargetRace,
    updateTargetRace,
    deleteTargetRace,
    addTargetType,
    updateTargetType,
    deleteTargetType,
  } = useStore();

  const [selected, setSelected] = useState<ListName>("Source");

  const config: Record<ListName, { items: { id: string; name: string }[]; onAdd: (name: string) => void; onUpdate: (id: string, name: string) => void; onDelete: (id: string) => void }> = {
    Source: { items: leadSources, onAdd: addLeadSource, onUpdate: updateLeadSource, onDelete: deleteLeadSource },
    "Property Type": { items: propertyTypes, onAdd: addPropertyType, onUpdate: updatePropertyType, onDelete: deletePropertyType },
    Purpose: { items: purposes, onAdd: addPurpose, onUpdate: updatePurpose, onDelete: deletePurpose },
    Language: { items: languages, onAdd: addLanguage, onUpdate: updateLanguage, onDelete: deleteLanguage },
    "Firsttime/Branch": { items: firsttimeBranchTypes, onAdd: addFirsttimeBranchType, onUpdate: updateFirsttimeBranchType, onDelete: deleteFirsttimeBranchType },
    Race: { items: races, onAdd: addRace, onUpdate: updateRace, onDelete: deleteRace },
    "Target Race": { items: targetRaces, onAdd: addTargetRace, onUpdate: updateTargetRace, onDelete: deleteTargetRace },
    "Target Type": { items: targetTypes, onAdd: addTargetType, onUpdate: updateTargetType, onDelete: deleteTargetType },
  };

  const active = config[selected];

  return (
    <div style={{ padding: "28px 32px" }}>
      <AdminTabs />
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Admin — Profile Lists</div>
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 20 }}>
        <div className="card" style={{ padding: 8 }}>
          {LISTS.map((name) => (
            <div
              key={name}
              onClick={() => setSelected(name)}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                fontSize: 13.5,
                fontWeight: 500,
                cursor: "pointer",
                background: selected === name ? "#eef0ff" : "transparent",
                color: selected === name ? "#4046c9" : "#20222b",
              }}
            >
              {name}
            </div>
          ))}
        </div>
        <LookupListEditor title={selected} items={active.items} onAdd={active.onAdd} onUpdate={active.onUpdate} onDelete={active.onDelete} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Log in as ADMIN, go to Admin → Profile Lists. Click through all 8 lists in the left picker. Add an item to each, rename one, delete one (with confirm). Reload the page, confirm everything persisted.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/admin/profile-lists/page.tsx" components/AdminTabs.tsx
git commit -m "Add Admin Profile Lists page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: New Customer form — Business Profile fieldset

**Files:**
- Modify: `app/(dashboard)/customers/page.tsx`

**Interfaces:**
- Consumes: `CustomerProfileInput` (Task 9, exported from `lib/store.tsx`), the 8 lookup lists + `areas`/`subAreas`/`businessTagIndustries`/`businessTagCategories`/`businessTagTypes` (already in `useStore()`).

- [ ] **Step 1: Import the new lists and type in `NewCustomerForm`**

In `app/(dashboard)/customers/page.tsx`, change the `useStore()` destructure inside `NewCustomerForm`:
```ts
const { users, addCustomer } = useStore();
```
to:
```ts
const {
  users,
  addCustomer,
  leadSources,
  areas,
  subAreas,
  propertyTypes,
  purposes,
  businessTagIndustries,
  businessTagCategories,
  businessTagTypes,
  races,
  languages,
  firsttimeBranchTypes,
  targetRaces,
  targetTypes,
} = useStore();
```

- [ ] **Step 2: Add state for the 13 new fields**

After the existing `assignedToUserId` state line, add:
```ts
const [sourceId, setSourceId] = useState("");
const [areaId, setAreaId] = useState("");
const [subAreaId, setSubAreaId] = useState("");
const [propertyTypeId, setPropertyTypeId] = useState("");
const [purposeId, setPurposeId] = useState("");
const [businessIndustryId, setBusinessIndustryId] = useState("");
const [businessCategoryId, setBusinessCategoryId] = useState("");
const [businessTypeId, setBusinessTypeId] = useState("");
const [raceId, setRaceId] = useState("");
const [languageId, setLanguageId] = useState("");
const [businessName, setBusinessName] = useState("");
const [firsttimeBranchId, setFirsttimeBranchId] = useState("");
const [targetRaceId, setTargetRaceId] = useState("");
const [targetTypeId, setTargetTypeId] = useState("");
const [remark, setRemark] = useState("");

const filteredSubAreas = subAreas.filter((s) => s.areaId === areaId);
const filteredCategories = businessTagCategories.filter((c) => c.industryId === businessIndustryId);
const filteredTypes = businessTagTypes.filter((t) => t.categoryId === businessCategoryId);
```

- [ ] **Step 3: Update `handleSubmit` to pass the new fields**

Replace (from Task 3's Step 6):
```ts
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!name.trim() || !assignedToUserId) return;
  const result = await addCustomer({ name, email, phone, assignedToUserId });
  if (!result.ok) {
    alert(result.error ?? "Could not add customer.");
    return;
  }
  onClose();
}
```
with:
```ts
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!name.trim() || !assignedToUserId) return;
  const result = await addCustomer({
    name,
    email,
    phone,
    assignedToUserId,
    sourceId: sourceId || null,
    areaId: areaId || null,
    subAreaId: subAreaId || null,
    propertyTypeId: propertyTypeId || null,
    purposeId: purposeId || null,
    businessIndustryId: businessIndustryId || null,
    businessCategoryId: businessCategoryId || null,
    businessTypeId: businessTypeId || null,
    raceId: raceId || null,
    languageId: languageId || null,
    businessName,
    firsttimeBranchId: firsttimeBranchId || null,
    targetRaceId: targetRaceId || null,
    targetTypeId: targetTypeId || null,
    remark,
  });
  if (!result.ok) {
    alert(result.error ?? "Could not add customer.");
    return;
  }
  onClose();
}
```

- [ ] **Step 4: Add the Business Profile fieldset to the JSX**

After the closing `</div>` of the "Assigned To" field block and before the `<button className="btn btn-primary" type="submit">Create</button>` line, add a full-width break and the new fields (each wrapped the same way as the existing `<div style={{ flex: "1 1 200px" }}>` pattern):
```tsx
<div style={{ flexBasis: "100%", height: 0 }} />
<div style={{ fontSize: 13, fontWeight: 700, flexBasis: "100%", marginTop: 4 }}>Business Profile</div>

<div style={{ flex: "1 1 180px" }}>
  <label className="field-label">Source</label>
  <select className="field-input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
    <option value="">—</option>
    {leadSources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
  </select>
</div>
<div style={{ flex: "1 1 180px" }}>
  <label className="field-label">Area</label>
  <select className="field-input" value={areaId} onChange={(e) => { setAreaId(e.target.value); setSubAreaId(""); }}>
    <option value="">—</option>
    {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
  </select>
</div>
<div style={{ flex: "1 1 180px" }}>
  <label className="field-label">Subarea</label>
  <select className="field-input" value={subAreaId} onChange={(e) => setSubAreaId(e.target.value)} disabled={!areaId}>
    <option value="">—</option>
    {filteredSubAreas.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
  </select>
</div>
<div style={{ flex: "1 1 180px" }}>
  <label className="field-label">Property Type</label>
  <select className="field-input" value={propertyTypeId} onChange={(e) => setPropertyTypeId(e.target.value)}>
    <option value="">—</option>
    {propertyTypes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
  </select>
</div>
<div style={{ flex: "1 1 180px" }}>
  <label className="field-label">Purpose</label>
  <select className="field-input" value={purposeId} onChange={(e) => setPurposeId(e.target.value)}>
    <option value="">—</option>
    {purposes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
  </select>
</div>
<div style={{ flex: "1 1 180px" }}>
  <label className="field-label">Business Industry</label>
  <select className="field-input" value={businessIndustryId} onChange={(e) => { setBusinessIndustryId(e.target.value); setBusinessCategoryId(""); setBusinessTypeId(""); }}>
    <option value="">—</option>
    {businessTagIndustries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
  </select>
</div>
<div style={{ flex: "1 1 180px" }}>
  <label className="field-label">Business Category</label>
  <select className="field-input" value={businessCategoryId} onChange={(e) => { setBusinessCategoryId(e.target.value); setBusinessTypeId(""); }} disabled={!businessIndustryId}>
    <option value="">—</option>
    {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
  </select>
</div>
<div style={{ flex: "1 1 180px" }}>
  <label className="field-label">Business Type</label>
  <select className="field-input" value={businessTypeId} onChange={(e) => setBusinessTypeId(e.target.value)} disabled={!businessCategoryId}>
    <option value="">—</option>
    {filteredTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
  </select>
</div>
<div style={{ flex: "1 1 180px" }}>
  <label className="field-label">Race</label>
  <select className="field-input" value={raceId} onChange={(e) => setRaceId(e.target.value)}>
    <option value="">—</option>
    {races.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
  </select>
</div>
<div style={{ flex: "1 1 180px" }}>
  <label className="field-label">Language</label>
  <select className="field-input" value={languageId} onChange={(e) => setLanguageId(e.target.value)}>
    <option value="">—</option>
    {languages.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
  </select>
</div>
<div style={{ flex: "1 1 200px" }}>
  <label className="field-label">Business Name</label>
  <input className="field-input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
</div>
<div style={{ flex: "1 1 180px" }}>
  <label className="field-label">Firsttime / Branch</label>
  <select className="field-input" value={firsttimeBranchId} onChange={(e) => setFirsttimeBranchId(e.target.value)}>
    <option value="">—</option>
    {firsttimeBranchTypes.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
  </select>
</div>
<div style={{ flex: "1 1 180px" }}>
  <label className="field-label">Target Race</label>
  <select className="field-input" value={targetRaceId} onChange={(e) => setTargetRaceId(e.target.value)}>
    <option value="">—</option>
    {targetRaces.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
  </select>
</div>
<div style={{ flex: "1 1 180px" }}>
  <label className="field-label">Target Type</label>
  <select className="field-input" value={targetTypeId} onChange={(e) => setTargetTypeId(e.target.value)}>
    <option value="">—</option>
    {targetTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
  </select>
</div>
<div style={{ flex: "1 1 100%" }}>
  <label className="field-label">Remark</label>
  <input className="field-input" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Note for the assigned salesperson" />
</div>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

As ADMIN/MANAGER, open the New Customer form. Confirm the Business Profile fieldset renders below the existing fields. Pick an Area — confirm Subarea options filter to that area and any prior Subarea selection clears. Pick a Business Industry — confirm Category filters, then pick a Category — confirm Type filters, and confirm changing Industry clears both Category and Type. Fill in a few fields including Remark, submit, open the created customer, confirm the values were saved (full display comes in Task 13, but you can check via Supabase table editor in the meantime if the detail page doesn't show them yet).

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/customers/page.tsx"
git commit -m "Add Business Profile fieldset to New Customer form

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 13: Customer detail page — Business Profile card + remark permission

**Files:**
- Modify: `app/(dashboard)/customers/[id]/page.tsx`

**Interfaces:**
- Consumes: `updateCustomerProfile`, `updateCustomerRemark` (Task 9), the 8 lookup lists + `areas`/`subAreas`/`businessTag*` (Task 8 / existing).

- [ ] **Step 1: Import the new store fields**

Change the `useStore()` destructure:
```ts
const {
  currentUser,
  visibleCustomers,
  users,
  stages,
  activities,
  tasks,
  updateCustomerStage,
  reassignCustomer,
  deleteCustomer,
  addActivity,
  addTask,
  toggleTaskDone,
} = useStore();
```
to:
```ts
const {
  currentUser,
  visibleCustomers,
  users,
  stages,
  activities,
  tasks,
  updateCustomerStage,
  updateCustomerProfile,
  updateCustomerRemark,
  reassignCustomer,
  deleteCustomer,
  addActivity,
  addTask,
  toggleTaskDone,
  leadSources,
  areas,
  subAreas,
  propertyTypes,
  purposes,
  businessTagIndustries,
  businessTagCategories,
  businessTagTypes,
  races,
  languages,
  firsttimeBranchTypes,
  targetRaces,
  targetTypes,
} = useStore();
```

- [ ] **Step 2: Compute permissions and filtered cascade options**

After `const assignedUser = users.find((u) => u.id === customer.assignedToUserId);`, add:
```ts
const canEditProfile = currentUser.role === "ADMIN" || currentUser.role === "MANAGER" || currentUser.id === customer.assignedToUserId;
const canEditRemark = currentUser.role === "ADMIN" || currentUser.role === "MANAGER";
const filteredSubAreas = subAreas.filter((s) => s.areaId === customer.areaId);
const filteredCategories = businessTagCategories.filter((c) => c.industryId === customer.businessIndustryId);
const filteredTypes = businessTagTypes.filter((t) => t.categoryId === customer.businessCategoryId);
```

- [ ] **Step 3: Add a small reusable inline-select helper inside the component**

After the `handleDelete` function, add:
```tsx
function profileSelect(
  label: string,
  value: string | null,
  options: { id: string; name: string }[],
  onChange: (value: string) => void,
  disabled = false
) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: "#9aa0ab", marginBottom: 4 }}>{label}</div>
      {canEditProfile ? (
        <select className="field-input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
          <option value="">—</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      ) : (
        <div style={{ fontSize: 13.5 }}>{options.find((o) => o.id === value)?.name ?? "—"}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add the Business Profile card to the JSX**

After the closing `</div>` of the Stage `<select>` block (the `<div style={{ marginTop: 16, ... }}>Stage: ...</div>` block) and before the `<div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", ...}}>` Activity/Tasks grid, insert:
```tsx
<div className="card" style={{ marginTop: 20, padding: 20 }}>
  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Business Profile</div>
  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
    {profileSelect("Source", customer.sourceId, leadSources, (v) => updateCustomerProfile(customer.id, { sourceId: v || null }))}
    {profileSelect("Area", customer.areaId, areas, (v) => updateCustomerProfile(customer.id, { areaId: v || null, subAreaId: null }))}
    {profileSelect("Subarea", customer.subAreaId, filteredSubAreas, (v) => updateCustomerProfile(customer.id, { subAreaId: v || null }), !customer.areaId)}
    {profileSelect("Property Type", customer.propertyTypeId, propertyTypes, (v) => updateCustomerProfile(customer.id, { propertyTypeId: v || null }))}
    {profileSelect("Purpose", customer.purposeId, purposes, (v) => updateCustomerProfile(customer.id, { purposeId: v || null }))}
    {profileSelect("Business Industry", customer.businessIndustryId, businessTagIndustries, (v) => updateCustomerProfile(customer.id, { businessIndustryId: v || null, businessCategoryId: null, businessTypeId: null }))}
    {profileSelect("Business Category", customer.businessCategoryId, filteredCategories, (v) => updateCustomerProfile(customer.id, { businessCategoryId: v || null, businessTypeId: null }), !customer.businessIndustryId)}
    {profileSelect("Business Type", customer.businessTypeId, filteredTypes, (v) => updateCustomerProfile(customer.id, { businessTypeId: v || null }), !customer.businessCategoryId)}
    {profileSelect("Race", customer.raceId, races, (v) => updateCustomerProfile(customer.id, { raceId: v || null }))}
    {profileSelect("Language", customer.languageId, languages, (v) => updateCustomerProfile(customer.id, { languageId: v || null }))}
    <div>
      <div style={{ fontSize: 11.5, color: "#9aa0ab", marginBottom: 4 }}>Business Name</div>
      {canEditProfile ? (
        <input
          className="field-input"
          value={customer.businessName}
          onChange={(e) => updateCustomerProfile(customer.id, { businessName: e.target.value })}
        />
      ) : (
        <div style={{ fontSize: 13.5 }}>{customer.businessName || "—"}</div>
      )}
    </div>
    {profileSelect("Firsttime / Branch", customer.firsttimeBranchId, firsttimeBranchTypes, (v) => updateCustomerProfile(customer.id, { firsttimeBranchId: v || null }))}
    {profileSelect("Target Race", customer.targetRaceId, targetRaces, (v) => updateCustomerProfile(customer.id, { targetRaceId: v || null }))}
    {profileSelect("Target Type", customer.targetTypeId, targetTypes, (v) => updateCustomerProfile(customer.id, { targetTypeId: v || null }))}
  </div>
  <div style={{ marginTop: 16 }}>
    <div style={{ fontSize: 11.5, color: "#9aa0ab", marginBottom: 4 }}>Remark</div>
    {canEditRemark ? (
      <input
        className="field-input"
        value={customer.remark}
        onChange={(e) => updateCustomerRemark(customer.id, e.target.value)}
        placeholder="Note for the assigned salesperson"
      />
    ) : (
      <div style={{ fontSize: 13.5 }}>{customer.remark || "—"}</div>
    )}
  </div>
</div>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

As ADMIN: open a customer, confirm the Business Profile card shows all 13 fields as editable selects/inputs (values set on the New Customer form should already show), edit a couple, reload, confirm they persisted. Confirm Remark is editable.

As the assigned SALESPERSON (log in as that user, or temporarily reassign a customer to yourself for testing): confirm all 12 non-Remark fields are still editable, but confirm Remark renders as plain read-only text with no input box.

As a SALESPERSON who is *not* assigned to the customer (shouldn't even reach this page — `visibleCustomers` already filters it out per the existing pattern at `app/(dashboard)/customers/[id]/page.tsx:26-30`; confirm navigating to that customer's URL directly redirects to `/customers`).

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/customers/[id]/page.tsx"
git commit -m "Add Business Profile card to customer detail page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** all 13 fields (spec table) map to Tasks 6/7/9/12/13. Admin management (spec's Admin UI section) maps to Tasks 8/10/11. Permissions section maps to Task 13's `canEditProfile`/`canEditRemark`. Migration section maps to Task 6. The pre-existing mock-data gap discovered during data-model review is handled by Tasks 1-5 (approved by the user as an expanded-scope addition on top of the original design doc).
- **Type consistency:** `CustomerProfileInput` (Task 9) field names match the `Customer` interface extension (Task 7) and the `NewCustomerForm` state names (Task 12) and the detail-page `updateCustomerProfile` calls (Task 13) — all camelCase, all identical names (`sourceId`, `areaId`, `subAreaId`, `propertyTypeId`, `purposeId`, `businessIndustryId`, `businessCategoryId`, `businessTypeId`, `raceId`, `languageId`, `businessName`, `firsttimeBranchId`, `targetRaceId`, `targetTypeId`). Store function names (`addLeadSource`/`updateLeadSource`/`deleteLeadSource`, etc., Task 8) match their usage in Task 11's `config` object exactly.
- **No placeholders:** every step above contains complete, runnable code — no "similar to Task N" shortcuts, no TODOs.
