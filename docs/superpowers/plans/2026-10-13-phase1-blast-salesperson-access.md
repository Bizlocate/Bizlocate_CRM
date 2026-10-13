# Phase 1 — Blasting: salesperson can read/update blast customers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A salesperson (or manager) with an unlocked, unexpired item on an approved blast request can open that customer, read it, and update its profile — but cannot log activity or add tasks until they are assigned a seat.

**Architecture:** Add a security-definer SQL helper `has_open_blast_item(customer_id)` and OR it into three RLS policies (`customers` select/update, `customer_change_log` insert). On the client, a pure helper `hasOpenBlastItem` mirrors the SQL rule; the customer detail page falls back to the full `customers` array when the viewer has blast access, and hides the Log-activity form and Tasks form for blast-only viewers. Existing column triggers (phone/remark manager-only, assignment, pool) keep applying untouched.

**Tech Stack:** Next.js 15 / React 18 / TypeScript, Supabase (Postgres RLS), `node --experimental-strip-types` self-check scripts (no test framework).

**Part of:** `docs/superpowers/specs/2026-10-13-leader-open-customers-team-slots-design.md` (see "Blasting" section). Independent of the seat-model rewrite (later phases); works against today's schema.

## Global Constraints

- Phone and remark stay ADMIN/MANAGER-only (existing trigger `protect_customer_remark_column`); a blast-only salesperson must not be able to change them.
- A blast-only viewer must NOT be able to: log activity, change stage, add tasks, change pool, change assignment. Activities/tasks are blocked by RLS already (`activities_insert`, `tasks_insert` require assignee) — do not loosen those.
- Access window: parent request `APPROVED`, item `unlocked_at` not null, item `status <> 'EXPIRED'` (DONE items stay accessible until the batch expires). Same rule as `visibleBlastItemsFor` in `lib/blasting.ts`.
- Schema changes are manual: written as a commented block at the end of `supabase/schema.sql`; the user runs the SQL in Supabase by hand (see memory: manual-migrations-not-auto-applied).
- No test framework: self-checks are `lib/*.check.ts` run with `node --experimental-strip-types`.
- Known accepted gap (same as today): stage columns have no column-level DB guard, so a blast-only user could write them via a hand-crafted API call; the UI hides the control. Not addressed here.

---

### Task 1: Pure helper `hasOpenBlastItem`

**Files:**
- Modify: `lib/blasting.ts` (append after `visibleBlastItemsFor`, ends line 130)
- Modify: `lib/blasting.check.ts` (add block before the final `console.log`; add import)

**Interfaces:**
- Consumes: `BlastItem`, `BlastRequest` from `lib/types.ts`; existing `visibleBlastItemsFor(items, requests, userId): BlastItem[]` in the same file.
- Produces: `hasOpenBlastItem(items: BlastItem[], requests: BlastRequest[], userId: string, customerId: string): boolean`

- [ ] **Step 1: Write the failing check**

In `lib/blasting.check.ts` change the import line to:

```ts
import { matchesBlastCriteria, hasOpenBlastItem } from "./blasting.ts";
import type { BlastItem, BlastRequest, Customer } from "./types.ts";
```

(replace the existing `import type { Customer } from "./types.ts";`). Then insert immediately before the final `console.log("blasting.check.ts: all assertions passed");`:

```ts
// --- hasOpenBlastItem: approved request + unlocked + not expired, for the right user + customer ---
{
  const req = (overrides: Partial<BlastRequest> = {}): BlastRequest => ({
    id: "r1", requestedBy: "mgr", salespersonId: "sp1",
    businessNameKeyword: null, areaId: null, subAreaId: null,
    businessIndustryId: null, businessCategoryId: null, businessTypeId: null,
    createdFrom: null, createdTo: null,
    status: "APPROVED", approvedTotal: 10, lockedExpiryDays: 7,
    resolvedBy: "admin", resolvedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  });
  const item = (overrides: Partial<BlastItem> = {}): BlastItem => ({
    id: "i1", blastRequestId: "r1", customerId: "c1", batchIndex: 1,
    unlockedAt: "2026-01-02T00:00:00Z", status: "PENDING", remark: null, doneAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  });

  assert.strictEqual(hasOpenBlastItem([item()], [req()], "sp1", "c1"), true, "unlocked pending item -> access");
  assert.strictEqual(hasOpenBlastItem([item({ status: "DONE" })], [req()], "sp1", "c1"), true, "DONE item still accessible until batch expires");
  assert.strictEqual(hasOpenBlastItem([item({ unlockedAt: null })], [req()], "sp1", "c1"), false, "locked batch -> no access");
  assert.strictEqual(hasOpenBlastItem([item({ status: "EXPIRED" })], [req()], "sp1", "c1"), false, "expired item -> no access");
  assert.strictEqual(hasOpenBlastItem([item()], [req({ status: "REJECTED" })], "sp1", "c1"), false, "request not APPROVED -> no access");
  assert.strictEqual(hasOpenBlastItem([item()], [req({ status: "EXPIRED" })], "sp1", "c1"), false, "request EXPIRED -> no access");
  assert.strictEqual(hasOpenBlastItem([item()], [req()], "sp2", "c1"), false, "other salesperson -> no access");
  assert.strictEqual(hasOpenBlastItem([item()], [req()], "sp1", "c2"), false, "other customer -> no access");
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd "C:/Bizlocate System/bizlocate_crm" && node --experimental-strip-types lib/blasting.check.ts`
Expected: FAIL — `SyntaxError: The requested module './blasting.ts' does not provide an export named 'hasOpenBlastItem'`

- [ ] **Step 3: Implement**

Append to the end of `lib/blasting.ts`:

```ts

/**
 * True when `userId` currently holds an unlocked, unexpired item for
 * `customerId` on one of their own APPROVED requests. This is the
 * client-side mirror of the `has_open_blast_item(customer_id)` SQL helper
 * that gates customers/customer_change_log RLS -- keep the two in sync.
 */
export function hasOpenBlastItem(items: BlastItem[], requests: BlastRequest[], userId: string, customerId: string): boolean {
  return visibleBlastItemsFor(items, requests, userId).some((i) => i.customerId === customerId);
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `cd "C:/Bizlocate System/bizlocate_crm" && node --experimental-strip-types lib/blasting.check.ts`
Expected: ends with `blasting.check.ts: all assertions passed` (a `MODULE_TYPELESS_PACKAGE_JSON` warning is normal).

- [ ] **Step 5: Commit**

```bash
git add lib/blasting.ts lib/blasting.check.ts
git commit -m "Add hasOpenBlastItem helper mirroring blast access rule"
```

---

### Task 2: SQL migration block (RLS) — written, then run by the user

**Files:**
- Modify: `supabase/schema.sql` (append at end of file, after the line `-- alter table removal_requests add column if not exists note text;`)

**Interfaces:**
- Produces (DB): function `has_open_blast_item(cid uuid) returns boolean`; policies `customers_select`, `customers_update`, `customer_change_log_insert` recreated with an extra OR branch.
- Consumes (DB): tables `blast_items`, `blast_requests` (exist in prod via the earlier Blasting migration).

- [ ] **Step 1: Append the migration block**

Append to the end of `supabase/schema.sql`:

```sql

-- ============================================================
-- Migration: Blasting — a salesperson (or manager) with an unlocked,
-- unexpired blast item can read and update that customer's profile, but
-- not log activity or tasks (activities_insert / tasks_insert still
-- require a real assignee slot). Run once against an already-provisioned
-- database. Phone/remark stay admin/manager-only via the existing
-- protect_customer_remark_column trigger; assignment/pool triggers are
-- unchanged, so a blast-only user cannot reassign or flip pool either.
--
-- STEP 0 (read-only, run first): confirm the live policies match what is
-- recreated below, in case they were edited by hand in Supabase:
--   select policyname, cmd, qual, with_check from pg_policies
--   where tablename in ('customers', 'customer_change_log')
--     and policyname in ('customers_select', 'customers_update', 'customer_change_log_insert');
-- Expected: customers_select / customers_update qual =
--   is_admin() OR is_customer_assignee(assigned_to, assigned_to_2, assigned_to_3)
-- If they differ, merge the difference into the statements below first.
-- ============================================================
--
-- create or replace function has_open_blast_item(cid uuid) returns boolean as $$
--   select exists (
--     select 1
--     from blast_items bi
--     join blast_requests br on br.id = bi.blast_request_id
--     where bi.customer_id = cid
--       and br.salesperson_id = auth.uid()
--       and br.status = 'APPROVED'
--       and bi.unlocked_at is not null
--       and bi.status <> 'EXPIRED'
--   );
-- $$ language sql security definer stable set search_path = public;
--
-- drop policy if exists "customers_select" on customers;
-- create policy "customers_select" on customers for select using (
--   is_admin()
--   or is_customer_assignee(assigned_to, assigned_to_2, assigned_to_3)
--   or has_open_blast_item(id)
-- );
--
-- drop policy if exists "customers_update" on customers;
-- create policy "customers_update" on customers for update using (
--   is_admin()
--   or is_customer_assignee(assigned_to, assigned_to_2, assigned_to_3)
--   or has_open_blast_item(id)
-- );
--
-- -- change-log rows written when a blast-only user edits the profile
-- drop policy if exists "customer_change_log_insert" on customer_change_log;
-- create policy "customer_change_log_insert" on customer_change_log for insert with check (
--   changed_by = auth.uid()
--   and (
--     is_admin()
--     or has_open_blast_item(customer_id)
--     or exists (
--       select 1 from customers c
--       where c.id = customer_change_log.customer_id
--         and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--     )
--   )
-- );
```

- [ ] **Step 2: Commit the SQL (not yet applied)**

```bash
git add supabase/schema.sql
git commit -m "Schema: blast-only customer access policies (manual migration)"
```

- [ ] **Step 3: STOP — ask the user to run the SQL**

Tell the user, in these words or equivalent: "Phase 1 SQL is at the end of `supabase/schema.sql` (block 'Migration: Blasting — a salesperson ... can read and update'). Please run STEP 0 first and send me the result, then run the block (uncommented) in the Supabase SQL editor. The app change in Task 3 does nothing in production until it runs." Do not proceed to Task 4's live verification until the user confirms.

---

### Task 3: Customer detail page — open for blast access, hide log + tasks

**Files:**
- Modify: `app/(dashboard)/customers/[id]/page.tsx` (lines ~1-20 imports, ~61-102 destructure/lookup, ~201-202, ~275-277, ~938-957)

**Interfaces:**
- Consumes: `hasOpenBlastItem(items, requests, userId, customerId)` from `lib/blasting.ts` (Task 1); store fields `customers`, `blastItems`, `blastRequests` (already exported by `useStore()`: `lib/store.tsx:436-437`, and `customers` is the full RLS-scoped array).
- Produces: nothing for later tasks.

- [ ] **Step 1: Import the helper**

Near the other imports at the top of `app/(dashboard)/customers/[id]/page.tsx`, add:

```tsx
import { hasOpenBlastItem } from "@/lib/blasting";
```

(Match the import alias style already used in this file — check the existing `import ... from "@/lib/..."` lines and copy that prefix exactly.)

- [ ] **Step 2: Pull extra store fields and replace the customer lookup**

In the `useStore()` destructure (starts line 61) add `customers,`, `blastItems,`, `blastRequests,` (e.g. right after `visibleCustomers,`). Then replace line 102:

```tsx
  const customer = visibleCustomers.find((c) => c.id === id);
```

with:

```tsx
  const ownCustomer = visibleCustomers.find((c) => c.id === id);
  // A customer reachable only through an approved, unlocked blast item: the
  // viewer can read it and edit its profile, but holds no assignee slot, so
  // logging activity / tasks stay off (RLS enforces that server-side too).
  const blastAccess = !ownCustomer && !!currentUser && hasOpenBlastItem(blastItems, blastRequests, currentUser.id, id);
  const customer = ownCustomer ?? (blastAccess ? customers.find((c) => c.id === id) : undefined);
```

- [ ] **Step 3: Allow profile editing for blast access**

Replace lines 201-202:

```tsx
  const canEditProfile =
    currentUser.role === "ADMIN" || currentUser.role === "MANAGER" || (assignedUsers.some(({ user }) => user.id === currentUser.id) && !myPendingRemoval);
```

with:

```tsx
  const canEditProfile =
    currentUser.role === "ADMIN" || currentUser.role === "MANAGER" || blastAccess || (assignedUsers.some(({ user }) => user.id === currentUser.id) && !myPendingRemoval);
```

(`canEditRemark` / `canEditIdentity` stay ADMIN/MANAGER only — so phone and remark remain read-only for a blast salesperson. Name stays editable because `canEditProfile` gates it, matching the existing "salespeople can rename" rule.)

- [ ] **Step 4: Block activity logging for blast-only viewers**

Replace the `canLogActivity` declaration (lines 275-277):

```tsx
  const canLogActivity = currentUser.role !== "ADMIN"
    && (currentUser.role !== "MANAGER" || assignedUsers.some(({ user }) => user.id === currentUser.id))
    && !myPendingRemoval;
```

with:

```tsx
  const canLogActivity = currentUser.role !== "ADMIN"
    && (currentUser.role !== "MANAGER" || assignedUsers.some(({ user }) => user.id === currentUser.id))
    && !myPendingRemoval
    && !blastAccess;
```

- [ ] **Step 5: Hide the Add-task form for blast-only viewers**

Wrap the form at lines 940-957. Change the opening `<form onSubmit={handleAddTask} ...>` to be conditional:

```tsx
          {!blastAccess && (
          <form onSubmit={handleAddTask} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            ...unchanged inputs and button...
          </form>
          )}
```

(Only add the `{!blastAccess && (` line before `<form` and `)}` after `</form>`; leave the form body untouched.)

- [ ] **Step 6: Type-check**

Run: `cd "C:/Bizlocate System/bizlocate_crm" && npx tsc --noEmit`
Expected: no errors. (If `blastItems`/`customers` are reported missing from `useStore()`, they are exported at `lib/store.tsx:436-437` and in the returned context value around line 2662 — confirm `customers` is in the value object near `visibleCustomers`, line ~2670, and add it there if absent.)

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/customers/[id]/page.tsx"
git commit -m "Customer detail: open blast-only customers for profile edits, no log/tasks"
```

---

### Task 4: Verify (after the user has run the SQL)

**Files:** none modified.

- [ ] **Step 1: Run self-checks**

Run: `cd "C:/Bizlocate System/bizlocate_crm" && node --experimental-strip-types lib/blasting.check.ts && npx tsc --noEmit`
Expected: assertions pass, tsc clean.

- [ ] **Step 2: Manual verification with a real salesperson account** (the user, or via the in-app browser with the dev server)

1. Admin approves a blast request for salesperson S (any criteria; customers not assigned to S).
2. As S, open `/blasting`: rows show name + phone. Click one → `/customers/{id}` opens (no redirect to `/customers`).
3. Profile fields (Area, Source, Business Name, Budget…) are editable; change one, click Update → persists after reload; as ADMIN, Change History shows the entry by S.
4. Phone and Remark are read-only for S.
5. No "Log activity" form; no "Add task" form. "Assigned:" shows "—".
6. As S, try a customer that is NOT on S's blast list → redirected to `/customers` (still blocked).
7. Mark enough items Done by remark that batch 2 unlocks; backdate a batch past 7 days (existing test method) → that batch's customers are no longer openable.
8. Manager submits claim → leader approves → customer now assigned to S: S sees the Log activity form and can log.

- [ ] **Step 3: Report results to the user**, including any step that failed, with the exact error.
