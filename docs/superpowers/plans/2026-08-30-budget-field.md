# Budget Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Budget" as a 9th admin-managed flat lookup list (alongside Source/Property Type/Purpose/etc.), with a `budget_id` column on `customers`, wired into the New Customer form, the customer detail page, and the existing Admin Profile Lists page. Not a mandatory field.

**Architecture:** This is a carbon-copy of the existing Business Profile lookup-list pattern (`target_types` is the closest analog — flat table, no cascading, no hierarchy) applied once more. No new UI patterns, no new admin page — `Budget` becomes a 9th entry on the already-generic `admin/profile-lists` page.

**Tech Stack:** Same as the rest of this repo. No automated test framework — verify via `npx tsc --noEmit` and manual click-through via the `run` skill.

## Global Constraints

- Table shape: `budgets (id uuid pk default gen_random_uuid(), name text not null unique)` — identical to `target_types`.
- `customers.budget_id uuid references budgets (id) on delete set null` — nullable, no seed rows (admin populates ranges themselves).
- RLS: select open to any authenticated user, insert/update/delete admin-only — identical shape to `target_types`.
- Budget is NOT added to `MANDATORY_FIELD_KEYS` (`lib/types.ts`) or the Required Fields admin page — always optional, no asterisk, no blocking validation on the New Customer form.
- Match existing code style exactly: same fire-and-forget `.then(() => {})` pattern, same `field-input`/`field-label` classes.
- No automated test suite — verify every task via `npx tsc --noEmit` (zero errors) plus manual reasoning/click-through.

---

### Task 1: Schema — `budgets` table + `customers.budget_id`

**Files:**
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: table `budgets`, column `customers.budget_id`.

- [ ] **Step 1: Add the table to the main schema**

Insert this block right after the `create table target_types (...)` block and before `create table customers (...)` (search for `create table target_types` to find the exact spot — it's immediately followed by `create table mandatory_field_settings` from a later plan; place `budgets` right after `mandatory_field_settings` and before `customers`):

```sql
create table budgets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);
```

- [ ] **Step 2: Add `budget_id` to the main `customers` table**

In the `create table customers (...)` block, add one line among the other nullable Business Profile columns (next to `target_type_id`):

```sql
  target_type_id uuid references target_types (id) on delete set null,
  budget_id uuid references budgets (id) on delete set null,
```

- [ ] **Step 3: Add RLS**

Right after the existing `mandatory_field_settings` RLS policies (search for `mandatory_field_settings_update_admin`), before the `-- customers:` comment, add:

```sql
alter table budgets enable row level security;

create policy "budgets_select" on budgets for select using (auth.uid() is not null);
create policy "budgets_insert_admin" on budgets for insert with check (is_admin());
create policy "budgets_update_admin" on budgets for update using (is_admin());
create policy "budgets_delete_admin" on budgets for delete using (is_admin());
```

- [ ] **Step 4: Append the already-provisioned-database migration note**

At the very end of `supabase/schema.sql`, append (fully `--`-commented, matching every other migration block in this file exactly — copy the style precisely, every line prefixed `-- `):

```sql

-- ============================================================
-- Migration: Budget field — run once against an already-provisioned
-- database (everything below already exists in the main schema
-- above for fresh installs).
-- ============================================================
--
-- create table budgets (
--   id uuid primary key default gen_random_uuid(),
--   name text not null unique
-- );
--
-- alter table customers add column if not exists budget_id uuid references budgets (id) on delete set null;
--
-- alter table budgets enable row level security;
--
-- create policy "budgets_select" on budgets for select using (auth.uid() is not null);
-- create policy "budgets_insert_admin" on budgets for insert with check (is_admin());
-- create policy "budgets_update_admin" on budgets for update using (is_admin());
-- create policy "budgets_delete_admin" on budgets for delete using (is_admin());
```

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql
git commit -m "Add budgets table and customers.budget_id column

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Manual step — apply the migration**

Tell the user: open the Supabase SQL editor and run the uncommented version of Steps 1-3 above (table + column + RLS). Confirm no errors before continuing to Task 2.

---

### Task 2: Types + Store — `Budget` type, CRUD, `Customer.budgetId`

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/store.tsx`

**Interfaces:**
- Produces: `export interface Budget { id: string; name: string }`, `Customer.budgetId: string | null`, store state `budgets: Budget[]`, `addBudget`/`updateBudget`/`deleteBudget`, `mapCustomer` extended, `CustomerProfileInput` extended with `budgetId`.

- [ ] **Step 1: Add the `Budget` type**

In `lib/types.ts`, after the `TargetType` interface, add:

```ts
export interface Budget {
  id: string;
  name: string;
}
```

- [ ] **Step 2: Add `budgetId` to `Customer`**

In the `Customer` interface, add one field next to `targetTypeId`:

```ts
targetTypeId: string | null;
budgetId: string | null;
```

- [ ] **Step 3: Type-check (expected transient error)**

Run: `npx tsc --noEmit`
Expected: one error in `lib/store.tsx` — `mapCustomer` no longer satisfies `Customer` (missing `budgetId`). This is expected and fixed in Step 6 below, in the same task.

- [ ] **Step 4: Add store wiring for the `budgets` list**

In `lib/store.tsx`, add `Budget` to the type import (alphabetically, right before `BusinessTagCategory`):

```ts
import {
  Activity,
  ActivityType,
  Area,
  Budget,
  BusinessTagCategory,
  ...
```

Add a mapper next to `mapTargetType`:

```ts
function mapBudget(row: { id: string; name: string }): Budget {
  return { id: row.id, name: row.name };
}
```

Add state next to `targetTypes`:

```ts
const [budgets, setBudgets] = useState<Budget[]>([]);
```

Add a loader next to `loadTargetTypes`:

```ts
async function loadBudgets(): Promise<Budget[]> {
  const supabase = createClient();
  const { data } = await supabase.from("budgets").select("*").order("name");
  const mapped = (data ?? []).map(mapBudget);
  setBudgets(mapped);
  return mapped;
}
```

Add `loadBudgets()` to BOTH `Promise.all([...])` arrays (search for `Promise.all([` to find both — the `useEffect` and `login()`), alongside `loadTargetTypes()`.

Add CRUD functions next to `addTargetType`/`updateTargetType`/`deleteTargetType`:

```ts
function addBudget(name: string) {
  const supabase = createClient();
  supabase.from("budgets").insert({ name }).select().single().then(({ data, error }) => {
    if (!error && data) setBudgets((prev) => [...prev, mapBudget(data)]);
  });
}
function updateBudget(id: string, name: string) {
  setBudgets((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
  const supabase = createClient();
  supabase.from("budgets").update({ name }).eq("id", id).then(() => {});
}
function deleteBudget(id: string) {
  setBudgets((prev) => prev.filter((i) => i.id !== id));
  const supabase = createClient();
  supabase.from("budgets").delete().eq("id", id).then(() => {});
}
```

Add to the `Store` interface: `budgets: Budget[];` next to `targetTypes: TargetType[];`, and `addBudget: (name: string) => void; updateBudget: (id: string, name: string) => void; deleteBudget: (id: string) => void;` next to the `targetType` CRUD signatures.

Add to the `value: Store = { ... }` object: `budgets,` next to `targetTypes,`, and `addBudget, updateBudget, deleteBudget,` next to `addTargetType, updateTargetType, deleteTargetType,`.

- [ ] **Step 5: Extend `CustomerProfileInput`**

Add `budgetId: string | null;` to the `CustomerProfileInput` interface (next to `targetTypeId`), and `budgetId: null,` to `emptyCustomerProfile` (next to `targetTypeId: null,`).

- [ ] **Step 6: Extend `mapCustomer` and `updateCustomerProfile`'s `columnMap`**

In `mapCustomer`'s row parameter type, add `budget_id: string | null;` (next to `target_type_id: string | null;`), and in its return object add `budgetId: row.budget_id,` (next to `targetTypeId: row.target_type_id,`).

In `addCustomer`'s insert payload, add `budget_id: profile.budgetId,` (next to `target_type_id: profile.targetTypeId,`).

In `updateCustomerProfile`'s `columnMap`, add `budgetId: "budget_id",` (next to `targetTypeId: "target_type_id",`).

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors (this resolves the transient error from Step 3).

- [ ] **Step 8: Commit**

```bash
git add lib/types.ts lib/store.tsx
git commit -m "Add Budget type and store wiring, extend Customer with budgetId

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Admin Profile Lists — add Budget as a 9th list

**Files:**
- Modify: `app/(dashboard)/admin/profile-lists/page.tsx`

**Interfaces:**
- Consumes: `budgets`, `addBudget`, `updateBudget`, `deleteBudget` (Task 2).

- [ ] **Step 1: Add "Budget" to the `LISTS` array**

```ts
const LISTS = [
  "Source",
  "Property Type",
  "Purpose",
  "Language",
  "Firsttime/Branch",
  "Race",
  "Target Race",
  "Target Type",
  "Budget",
] as const;
```

- [ ] **Step 2: Destructure the new store fields and add the `config` entry**

Add `budgets, addBudget, updateBudget, deleteBudget,` to the `useStore()` destructure (next to `targetTypes, addTargetType, updateTargetType, deleteTargetType,`).

Add to the `config` object:

```ts
Budget: { items: budgets, onAdd: addBudget, onUpdate: updateBudget, onDelete: deleteBudget },
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

As ADMIN, go to Admin → Profile Lists. Confirm "Budget" appears as a 9th entry in the left picker. Click it, add a few ranges (e.g. "Below RM50k", "RM50k-100k"), confirm they persist on reload.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/admin/profile-lists/page.tsx"
git commit -m "Add Budget as a 9th Profile Lists entry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Wire Budget into the New Customer form and customer detail page

**Files:**
- Modify: `app/(dashboard)/customers/page.tsx`
- Modify: `app/(dashboard)/customers/[id]/page.tsx`

**Interfaces:**
- Consumes: `budgets` (Task 2/3).

- [ ] **Step 1: New Customer form — add the Budget field**

In `app/(dashboard)/customers/page.tsx`'s `NewCustomerForm`, add `budgets,` to the `useStore()` destructure (next to `targetTypes,`).

Add state next to `targetTypeId`:

```ts
const [budgetId, setBudgetId] = useState("");
```

In `handleSubmit`'s `addCustomer(...)` call, add `budgetId: budgetId || null,` next to `targetTypeId: targetTypeId || null,`.

In the JSX, add a field right after the "Target Type" field block, following the plain (non-mandatory) select pattern already used for Race/Target Race (no `Asterisk`, no `fieldStyle`, no `onFocus`/`clearInvalid` — Budget isn't a mandatory-eligible field):

```tsx
<div style={{ flex: "1 1 180px" }}>
  <label className="field-label">Budget</label>
  <select className="field-input" value={budgetId} onChange={(e) => setBudgetId(e.target.value)}>
    <option value="">—</option>
    {budgets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
  </select>
</div>
```

- [ ] **Step 2: Customer detail page — add the Budget field**

In `app/(dashboard)/customers/[id]/page.tsx`, add `budgets,` to the `useStore()` destructure (next to `targetTypes,`).

In the Business Profile card's JSX, add one more `profileSelect(...)` call right after the "Target Type" one:

```tsx
{profileSelect("Budget", customer.budgetId, budgets, (v) => updateCustomerProfile(customer.id, { budgetId: v || null }))}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

**Prerequisite:** Task 1's migration must be applied, and Task 3's admin page should have at least one Budget range added.

As ADMIN/MANAGER, open the New Customer form. Confirm a Budget dropdown appears (no red asterisk, not required — submitting with it blank succeeds). Create a customer with a Budget selected. Open its detail page, confirm the Budget shows and is editable there too.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/customers/page.tsx" "app/(dashboard)/customers/[id]/page.tsx"
git commit -m "Wire Budget field into New Customer form and detail page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** data model → Task 1. Admin UI (reusing existing Profile Lists page) → Task 3. Form/detail page → Task 4. "Not mandatory" constraint → explicitly called out in Task 4's Step 1 (no Asterisk/fieldStyle/clearInvalid) and in Global Constraints (not added to `MANDATORY_FIELD_KEYS`).
- **Type consistency:** `budgetId` used identically across `Customer` (Task 2), `CustomerProfileInput` (Task 2), the New Customer form's state (Task 4), and the detail page's `updateCustomerProfile` call (Task 4).
- **No placeholders:** every step contains complete, runnable code.
