# Remove Client Approval Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let whoever occupies a customer slot request their own removal (with a required reason) via a special "Remove Client" option in the existing Log form's Stage picker, requiring ADMIN/MANAGER approval before the slot actually clears — never a hard delete of the customer.

**Architecture:** Two new tables (`removal_reasons`, a flat lookup mirroring `budgets`; `removal_requests`, an append-only-except-status-update log table). Store layer follows the exact same CRUD-mirror + reuse-existing-functions discipline already established this session (`requestClientRemoval` inserts a request; `resolveClientRemoval` reuses the existing `reassignCustomer(customerId, slot, null)` to actually clear a slot on approval, exactly like an admin manually clearing one today). UI: one sentinel option added to an existing dropdown, one new modal (mirrors the `requiresAmount` modal shipped in the previous slice), one new shared list-and-approve component reused by two thin page wrappers (mirrors the existing Agent Log admin/team split), one new top-level nav tab.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Supabase (`@supabase/ssr` via `createClient()`), existing `useStore()` context. No test framework in this repo — verify via `npm run build` (type-check) plus manual click-through.

## Global Constraints

- "Remove Client" is a fixed sentinel value in the Stage `<select>`, **not** a `pipeline_stages` row — it must never appear as a real stage anywhere (list page, badges, sort, filter, `requires_amount` checks).
- Only whoever occupies a slot can request removal for that slot (role-agnostic — matches how stage editing itself is scoped).
- Approve/Reject is ADMIN (any request) or MANAGER (only requests where the customer's assignees share their team) — this is enforced by RLS on `removal_requests`' `update` policy, not just UI hiding.
- Approving a request reuses the **existing** `reassignCustomer(customerId, slot, null)` — do not reimplement slot-clearing logic. This only clears one assignee slot (assignee, pool, stage); it never touches the customer row's other fields and never deletes the customer.
- A customer+slot can only have one `PENDING` request at a time.
- `removal_requests` visibility (`select`) is already fully scoped by its own RLS (admin sees all, a manager/assignee sees only requests tied to customers they're already scoped to see) — the two "Remove Approvals" page wrappers do NOT need extra role-based filtering props; they read the same globally-loaded `removalRequests` state directly, filtered only by `status === "PENDING"`. This is unlike `AgentLogBrowser`, whose props differ per caller for a different reason (agent-list scoping); don't copy that prop-passing shape here, it isn't needed.
- Match existing code style: inline `style={{...}}` objects, `.field-input`/`.btn`/`.card`/`.modal-overlay`/`.modal-card` classes, fire-and-forget `.then(() => {})` on writes, no new dependencies.

---

### Task 1: Schema — `removal_reasons`, `removal_requests`

**Files:**
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: tables `removal_reasons (id, name)`, `removal_requests (id, customer_id, slot, requested_by, reason_id, status, resolved_by, resolved_at, created_at)`.

- [ ] **Step 1: Add `removal_reasons`**

Find `create table budgets (...)` and its closing `);` (right before `create table customers`). Insert right after it:

```sql
create table removal_reasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);
```

- [ ] **Step 2: Add `removal_requests`**

Find `create table deal_closures (...)` and its closing `);` (right before `create table tasks`). Insert right after it:

```sql
create table removal_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  slot smallint not null check (slot in (1, 2, 3)),
  requested_by uuid not null references profiles (id),
  reason_id uuid not null references removal_reasons (id),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  resolved_by uuid references profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 3: Enable RLS on both tables**

Find `alter table deal_closures enable row level security;` (search for it — it's in a block of `alter table ... enable row level security;` lines) and add two more lines right after it:

```sql
alter table removal_reasons enable row level security;
alter table removal_requests enable row level security;
```

- [ ] **Step 4: Add RLS policies for `removal_reasons`**

Find `create policy "budgets_delete_admin" on budgets for delete using (is_admin());` and the `-- customers:` comment right after it. Insert between them — same shape as `budgets`' own policies:

```sql
create policy "removal_reasons_select" on removal_reasons for select using (auth.uid() is not null);
create policy "removal_reasons_insert_admin" on removal_reasons for insert with check (is_admin());
create policy "removal_reasons_update_admin" on removal_reasons for update using (is_admin());
create policy "removal_reasons_delete_admin" on removal_reasons for delete using (is_admin());
```

- [ ] **Step 5: Add RLS policies for `removal_requests`**

Find `create policy "deal_closures_insert" on deal_closures for insert with check (...)` and its closing `);` (right before the `-- notifications: recipient only` comment). Insert right after it:

```sql
-- removal_requests: select/insert mirror deal_closures (visible to the
-- requester, their team, and admin); update (approve/reject) is
-- ADMIN, or MANAGER scoped to their own team's customers only — a
-- salesperson can never resolve their own request.
create policy "removal_requests_select" on removal_requests for select using (
  is_admin()
  or exists (
    select 1 from customers c
    where c.id = removal_requests.customer_id
      and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
  )
);
create policy "removal_requests_insert" on removal_requests for insert with check (
  requested_by = auth.uid()
  and exists (
    select 1 from customers c
    where c.id = removal_requests.customer_id
      and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
  )
);
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
```

No delete policy on either table (`removal_reasons` is admin-only CRUD like every other lookup list; `removal_requests` rows are never deleted, only resolved via update).

- [ ] **Step 6: Append the already-provisioned-database migration note**

At the very end of `supabase/schema.sql`, append (fully `--`-commented, matching every other migration block in this file exactly):

```sql

-- ============================================================
-- Migration: Remove client approval workflow — run once against an
-- already-provisioned database (everything below already exists in
-- the main schema above for fresh installs).
-- ============================================================
--
-- create table removal_reasons (
--   id uuid primary key default gen_random_uuid(),
--   name text not null unique
-- );
--
-- create table removal_requests (
--   id uuid primary key default gen_random_uuid(),
--   customer_id uuid not null references customers (id) on delete cascade,
--   slot smallint not null check (slot in (1, 2, 3)),
--   requested_by uuid not null references profiles (id),
--   reason_id uuid not null references removal_reasons (id),
--   status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
--   resolved_by uuid references profiles (id),
--   resolved_at timestamptz,
--   created_at timestamptz not null default now()
-- );
--
-- alter table removal_reasons enable row level security;
-- alter table removal_requests enable row level security;
--
-- create policy "removal_reasons_select" on removal_reasons for select using (auth.uid() is not null);
-- create policy "removal_reasons_insert_admin" on removal_reasons for insert with check (is_admin());
-- create policy "removal_reasons_update_admin" on removal_reasons for update using (is_admin());
-- create policy "removal_reasons_delete_admin" on removal_reasons for delete using (is_admin());
--
-- create policy "removal_requests_select" on removal_requests for select using (
--   is_admin()
--   or exists (
--     select 1 from customers c
--     where c.id = removal_requests.customer_id
--       and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--   )
-- );
-- create policy "removal_requests_insert" on removal_requests for insert with check (
--   requested_by = auth.uid()
--   and exists (
--     select 1 from customers c
--     where c.id = removal_requests.customer_id
--       and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--   )
-- );
-- create policy "removal_requests_update" on removal_requests for update using (
--   is_admin()
--   or (
--     exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--     and exists (
--       select 1 from customers c
--       where c.id = removal_requests.customer_id
--         and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--     )
--   )
-- );
```

- [ ] **Step 7: Commit**

```bash
git add supabase/schema.sql
git commit -m "Schema: add removal_reasons + removal_requests (remove client approval workflow)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Types + Store — mapping, CRUD, `requestClientRemoval`, `resolveClientRemoval`

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/store.tsx`

**Interfaces:**
- Consumes: Task 1's tables, existing `reassignCustomer`, `createNotification`.
- Produces: `RemovalReason`, `RemovalRequestStatus`, `RemovalRequest` types. `removalReasons: RemovalReason[]`, `removalRequests: RemovalRequest[]` (new `Store` fields). `addRemovalReason/updateRemovalReason/deleteRemovalReason` (mirror the `Budget` CRUD triplet). `requestClientRemoval: (customerId: string, slot: 1 | 2 | 3, reasonId: string) => { ok: boolean; error?: string }`. `resolveClientRemoval: (requestId: string, approve: boolean) => void`.

Both files change together so `npm run build` stays green at every commit.

- [ ] **Step 1: Add the types**

In `lib/types.ts`, add at the end of the file:

```ts
export interface RemovalReason {
  id: string;
  name: string;
}

export type RemovalRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface RemovalRequest {
  id: string;
  customerId: string;
  slot: 1 | 2 | 3;
  requestedBy: string;
  reasonId: string;
  status: RemovalRequestStatus;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: Add mapping functions**

In `lib/store.tsx`, add `RemovalReason`, `RemovalRequest`, `RemovalRequestStatus` to the `import { ... } from "./types";` block (anywhere in that list, exact position doesn't matter).

Right after the existing `mapBudget` function (search for `function mapBudget`), add:

```ts
function mapRemovalReason(row: { id: string; name: string }): RemovalReason {
  return { id: row.id, name: row.name };
}
```

Right after the existing `mapDealClosure` function, add:

```ts
function mapRemovalRequest(row: {
  id: string;
  customer_id: string;
  slot: number;
  requested_by: string;
  reason_id: string;
  status: string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}): RemovalRequest {
  return {
    id: row.id,
    customerId: row.customer_id,
    slot: row.slot as 1 | 2 | 3,
    requestedBy: row.requested_by,
    reasonId: row.reason_id,
    status: row.status as RemovalRequestStatus,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}
```

- [ ] **Step 3: Add state, load functions, and wire them into both load paths**

Right after the existing `const [dealClosures, setDealClosures] = useState<DealClosure[]>([]);` line, add:

```ts
  const [removalReasons, setRemovalReasons] = useState<RemovalReason[]>([]);
  const [removalRequests, setRemovalRequests] = useState<RemovalRequest[]>([]);
```

Right after the existing `loadBudgets` function, add:

```ts
  async function loadRemovalReasons(): Promise<RemovalReason[]> {
    const supabase = createClient();
    const { data } = await supabase.from("removal_reasons").select("*").order("name");
    const mapped = (data ?? []).map(mapRemovalReason);
    setRemovalReasons(mapped);
    return mapped;
  }
```

Right after the existing `loadDealClosures` function, add:

```ts
  async function loadRemovalRequests(): Promise<RemovalRequest[]> {
    const supabase = createClient();
    const { data } = await supabase.from("removal_requests").select("*").order("created_at", { ascending: false });
    const mapped = (data ?? []).map(mapRemovalRequest);
    setRemovalRequests(mapped);
    return mapped;
  }
```

Find both places that currently call `await loadDealClosures();` (once in the initial-load `useEffect`, once in `login()`) and add two lines right after each occurrence:

```ts
    await loadDealClosures();
    await loadRemovalReasons();
    await loadRemovalRequests();
```

Do **not** add these into the large indexed `Promise.all([...])` array earlier in each function — that array's entries are referenced by numeric index elsewhere (`loadResults[0]`, `[1]`, `[2]`, `[17]`, `[18]`) and inserting into the middle would shift every one of those. Follow the existing precedent set by `loadChangeLog`/`loadDealClosures` themselves: sequential `await` calls after the array resolves.

- [ ] **Step 4: Add the `removal_reasons` CRUD triplet**

Right after the existing `deleteBudget` function, add (mirrors `addBudget`/`updateBudget`/`deleteBudget` exactly):

```ts
  function addRemovalReason(name: string) {
    const supabase = createClient();
    supabase.from("removal_reasons").insert({ name }).select().single().then(({ data, error }) => {
      if (!error && data) setRemovalReasons((prev) => [...prev, mapRemovalReason(data)]);
    });
  }
  function updateRemovalReason(id: string, name: string) {
    setRemovalReasons((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
    const supabase = createClient();
    supabase.from("removal_reasons").update({ name }).eq("id", id).then(() => {});
  }
  function deleteRemovalReason(id: string) {
    setRemovalReasons((prev) => prev.filter((i) => i.id !== id));
    const supabase = createClient();
    supabase.from("removal_reasons").delete().eq("id", id).then(() => {});
  }
```

- [ ] **Step 5: Add `requestClientRemoval` and `resolveClientRemoval`**

Right after the existing `logActivityAndStage` function, add:

```ts
  // Whoever occupies a slot requests their own removal from a customer —
  // does not touch the slot itself; only inserts a PENDING request an
  // ADMIN/MANAGER must approve (see resolveClientRemoval). Blocks a
  // second request while one is already pending for the same slot.
  function requestClientRemoval(customerId: string, slot: 1 | 2 | 3, reasonId: string): { ok: boolean; error?: string } {
    if (!currentUser) return { ok: false, error: "Not signed in." };
    const alreadyPending = removalRequests.some(
      (r) => r.customerId === customerId && r.slot === slot && r.status === "PENDING"
    );
    if (alreadyPending) return { ok: false, error: "A removal request for this slot is already pending." };
    const supabase = createClient();
    supabase
      .from("removal_requests")
      .insert({ customer_id: customerId, slot, requested_by: currentUser.id, reason_id: reasonId, status: "PENDING" })
      .select()
      .single()
      .then(({ data, error }) => {
        if (!error && data) setRemovalRequests((prev) => [mapRemovalRequest(data), ...prev]);
      });
    return { ok: true };
  }

  // ADMIN/MANAGER approves or rejects a pending removal request. Approval
  // reuses the existing reassignCustomer(customerId, slot, null) to clear
  // the slot (assignee, pool, stage) — the customer record itself is
  // never touched or deleted. Rejection only updates the request's status.
  function resolveClientRemoval(requestId: string, approve: boolean) {
    if (!currentUser) return;
    const request = removalRequests.find((r) => r.id === requestId);
    if (!request) return;
    const status: RemovalRequestStatus = approve ? "APPROVED" : "REJECTED";
    const now = new Date().toISOString();
    setRemovalRequests((prev) =>
      prev.map((r) => (r.id === requestId ? { ...r, status, resolvedBy: currentUser.id, resolvedAt: now } : r))
    );
    const supabase = createClient();
    supabase
      .from("removal_requests")
      .update({ status, resolved_by: currentUser.id, resolved_at: now })
      .eq("id", requestId)
      .then(() => {});
    if (approve) reassignCustomer(request.customerId, request.slot, null);
    createNotification(
      request.requestedBy,
      approve ? "Your client removal request was approved." : "Your client removal request was rejected."
    );
  }
```

- [ ] **Step 6: Add everything to the `Store` interface and value object**

In the `Store` interface, find `dealClosures: DealClosure[];` and add two lines right after it:

```ts
  dealClosures: DealClosure[];
  removalReasons: RemovalReason[];
  removalRequests: RemovalRequest[];
```

Find `deleteBudget: (id: string) => void;` and add three lines right after it:

```ts
  deleteBudget: (id: string) => void;
  addRemovalReason: (name: string) => void;
  updateRemovalReason: (id: string, name: string) => void;
  deleteRemovalReason: (id: string) => void;
```

Find `logActivityAndStage: (customerId: string, slot: 1 | 2 | 3, stageId: string, type: ActivityType, content: string, followUp: string, closedAmount?: number) => void;` and add two lines right after it:

```ts
  logActivityAndStage: (customerId: string, slot: 1 | 2 | 3, stageId: string, type: ActivityType, content: string, followUp: string, closedAmount?: number) => void;
  requestClientRemoval: (customerId: string, slot: 1 | 2 | 3, reasonId: string) => { ok: boolean; error?: string };
  resolveClientRemoval: (requestId: string, approve: boolean) => void;
```

In the `const value: Store = { ... }` object, find `dealClosures,` and add two lines right after it:

```ts
    dealClosures,
    removalReasons,
    removalRequests,
```

Find `deleteBudget,` and add three lines right after it:

```ts
    deleteBudget,
    addRemovalReason,
    updateRemovalReason,
    deleteRemovalReason,
```

Find `logActivityAndStage,` and add two lines right after it:

```ts
    logActivityAndStage,
    requestClientRemoval,
    resolveClientRemoval,
```

- [ ] **Step 7: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add lib/types.ts lib/store.tsx
git commit -m "Types+Store: removal_reasons/removal_requests mapping, CRUD, requestClientRemoval, resolveClientRemoval

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Admin Profile Lists — add "Removal Reason"

**Files:**
- Modify: `app/(dashboard)/admin/profile-lists/page.tsx`

**Interfaces:**
- Consumes: `removalReasons`, `addRemovalReason`, `updateRemovalReason`, `deleteRemovalReason` from `useStore()` (Task 2).
- Produces: nothing consumed elsewhere — self-contained.

- [ ] **Step 1: Add "Removal Reason" to the `LISTS` array**

Change:

```tsx
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

to:

```tsx
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
  "Removal Reason",
] as const;
```

- [ ] **Step 2: Destructure the new store fields and add a config entry**

In the `useStore()` destructure, add `removalReasons, addRemovalReason, updateRemovalReason, deleteRemovalReason,` (anywhere in that list — e.g. right after `deleteBudget,`).

In the `config` object, add a `"Removal Reason"` entry right after `Budget:`:

```tsx
    Budget: { items: budgets, onAdd: addBudget, onUpdate: updateBudget, onDelete: deleteBudget },
    "Removal Reason": { items: removalReasons, onAdd: addRemovalReason, onUpdate: updateRemovalReason, onDelete: deleteRemovalReason },
```

- [ ] **Step 3: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 4: Manual verification**

Using the browser preview, as ADMIN: go to `/admin/profile-lists`, click "Removal Reason" in the left column, add a couple of reasons, confirm they persist after reload.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/admin/profile-lists/page.tsx"
git commit -m "Admin Profile Lists: add Removal Reason as a managed lookup list

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Customer detail page — "Remove Client" stage option, reason modal, "Removal Pending" badge

**Files:**
- Modify: `app/(dashboard)/customers/[id]/page.tsx`

**Interfaces:**
- Consumes: `removalReasons`, `requestClientRemoval`, `removalRequests` from `useStore()` (Task 2).
- Produces: nothing consumed elsewhere — self-contained.

- [ ] **Step 1: Destructure the new store fields**

In the `useStore()` destructure, add `removalReasons, removalRequests, requestClientRemoval,` (e.g. right after `logActivityAndStage,`).

- [ ] **Step 2: Add a "pending removal" helper**

Right after the existing `stageOf` function, add:

```tsx
  function pendingRemovalForSlot(slot: 1 | 2 | 3) {
    return removalRequests.some((r) => r.customerId === customer!.id && r.slot === slot && r.status === "PENDING");
  }
```

- [ ] **Step 3: Add state for the reason modal**

Right after the existing `const [closedAmountDraft, setClosedAmountDraft] = useState("");` line, add:

```tsx
  const [showRemoveReasonModal, setShowRemoveReasonModal] = useState(false);
  const [removeReasonId, setRemoveReasonId] = useState("");
```

- [ ] **Step 4: Add the "Remove Client" sentinel option to the Stage picker**

Find the Stage `<select>` in the Log form (search for `<option value="">— Select stage —</option>`) — right after the `{[...stages].sort(...).map(...)}` block that lists real stages, add one more option:

```tsx
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
                    <option value="__REMOVE_CLIENT__">Remove Client</option>
                  </select>
```

(This replaces the existing `<select>...</select>` block for the Stage picker — the only change is the one new `<option>` added at the end, everything else is identical.)

- [ ] **Step 5: Branch `handleLogActivity` on the sentinel value**

Replace the existing `handleLogActivity` function:

```tsx
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
```

with:

```tsx
  function handleLogActivity(e: React.FormEvent) {
    e.preventDefault();
    if (myAssignedSlot) {
      if (!logStageId) return;
      if (logStageId === "__REMOVE_CLIENT__") {
        setShowRemoveReasonModal(true);
        return;
      }
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
```

(`selectedLogStage` is `stages.find((s) => s.id === logStageId)` — for the sentinel value it's always `undefined`, so the existing `requiresAmount` branch would never have matched anyway; the new sentinel check comes first so it never reaches that line.)

- [ ] **Step 6: Add the reason-confirm handler**

Right after the existing `handleConfirmClosedAmount` function, add:

```tsx
  function handleConfirmRemoveReason() {
    if (!removeReasonId || !myAssignedSlot) return;
    const result = requestClientRemoval(customer!.id, myAssignedSlot, removeReasonId);
    if (!result.ok) {
      alert(result.error ?? "Could not submit the removal request.");
      return;
    }
    setLogStageId("");
    setRemoveReasonId("");
    setShowRemoveReasonModal(false);
  }
```

- [ ] **Step 7: Add the reason modal JSX**

Right after the existing closed-amount modal block (search for its closing `)}` — the block starts with `{showClosedAmountModal && (` and ends right before `{visibleLogGroups.length === 0 && (`), add:

```tsx
          {showRemoveReasonModal && (
            <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowRemoveReasonModal(false); }}>
              <div className="card modal-card" style={{ maxWidth: 360 }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Remove client</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
                  This sends a removal request to admin/manager for approval — the customer isn't deleted, only your assignment.
                </div>
                <select className="field-input" value={removeReasonId} onChange={(e) => setRemoveReasonId(e.target.value)}>
                  <option value="">— Select reason —</option>
                  {removalReasons.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button className="btn btn-primary" type="button" disabled={!removeReasonId} onClick={handleConfirmRemoveReason}>Confirm</button>
                  <button className="btn btn-outline" type="button" onClick={() => setShowRemoveReasonModal(false)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
```

- [ ] **Step 8: Show "Removal Pending" instead of the real stage badge while a request is outstanding**

Find the per-slot stage badge IIFE in the header (search for `const stage = stages.find((s) => s.id === stageOf(slot));`):

```tsx
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

Replace with:

```tsx
                      {pendingRemovalForSlot(slot) ? (
                        <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "#fff4e0", color: "#8a5a00" }}>
                          Removal Pending
                        </span>
                      ) : (() => {
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

- [ ] **Step 9: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 10: Manual verification**

Using the browser preview, as a SALESPERSON assigned to a customer:
1. In the Log form's Stage picker, confirm "Remove Client" is the last option, after every real stage.
2. Pick it, click Log — confirm the reason modal opens (not a normal save), Confirm is disabled until a reason is picked.
3. Cancel the modal — confirm nothing was saved (badge still shows the real stage, reload confirms no request exists).
4. Pick "Remove Client" again, pick a reason, Confirm — confirm your slot's badge now reads "Removal Pending", and trying to submit a second removal request for the same slot fails with an error (test this by picking "Remove Client" → a reason → Confirm again).
5. As ADMIN or another viewer, confirm they also see "Removal Pending" on that assignee's badge.

- [ ] **Step 11: Commit**

```bash
git add "app/(dashboard)/customers/[id]/page.tsx"
git commit -m "Customer detail page: 'Remove Client' stage option, reason modal, Removal Pending badge

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Remove Approvals — shared component, admin/team pages, nav tab

**Files:**
- Create: `components/RemovalApprovalsBrowser.tsx`
- Create: `app/(dashboard)/admin/remove-approvals/page.tsx`
- Create: `app/(dashboard)/team/remove-approvals/page.tsx`
- Modify: `components/MainNav.tsx`

**Interfaces:**
- Consumes: `removalRequests`, `removalReasons`, `resolveClientRemoval`, `users`, `customers` from `useStore()` (Task 2 + existing).
- Produces: routes `/admin/remove-approvals`, `/team/remove-approvals`; nothing else consumed elsewhere.

`/admin/*` and `/team/*` routes already inherit role guards for free from their respective `layout.tsx` files (`app/(dashboard)/admin/layout.tsx`, `app/(dashboard)/team/layout.tsx`) — no new guard code needed in either page.

- [ ] **Step 1: Create the shared component**

Create `components/RemovalApprovalsBrowser.tsx`:

```tsx
"use client";

import { useStore } from "@/lib/store";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Pending removal-request queue, shared by the Admin
 * (`/admin/remove-approvals`) and Manager (`/team/remove-approvals`)
 * pages. No props needed: `removalRequests` is already fully scoped by
 * its own RLS per session (admin sees every request, a manager sees
 * only requests tied to customers they're already scoped to see), so
 * both callers read the exact same store state and this component only
 * filters to PENDING.
 */
export default function RemovalApprovalsBrowser() {
  const { removalRequests, removalReasons, customers, users, resolveClientRemoval } = useStore();
  const pending = removalRequests.filter((r) => r.status === "PENDING");

  function customerName(customerId: string) {
    return customers.find((c) => c.id === customerId)?.name ?? "Unknown customer";
  }
  function userName(userId: string) {
    return users.find((u) => u.id === userId)?.name ?? "Unknown";
  }
  function reasonName(reasonId: string) {
    return removalReasons.find((r) => r.id === reasonId)?.name ?? "Unknown reason";
  }

  return (
    <div className="card">
      {pending.length === 0 && (
        <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>No pending removal requests.</div>
      )}
      {pending.map((r) => (
        <div key={r.id} style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{customerName(r.customerId)} — Assigned {r.slot}</div>
            <div style={{ fontSize: 12, color: "#9aa0ab", marginTop: 2 }}>
              {userName(r.requestedBy)} · {reasonName(r.reasonId)} · {formatDate(r.createdAt)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" type="button" onClick={() => resolveClientRemoval(r.id, true)}>Approve</button>
            <button className="btn btn-outline" type="button" onClick={() => resolveClientRemoval(r.id, false)}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create the admin page**

Create `app/(dashboard)/admin/remove-approvals/page.tsx`:

```tsx
"use client";

import RemovalApprovalsBrowser from "@/components/RemovalApprovalsBrowser";

export default function AdminRemoveApprovalsPage() {
  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Remove Approvals</div>
      <RemovalApprovalsBrowser />
    </div>
  );
}
```

- [ ] **Step 3: Create the team (manager) page**

Create `app/(dashboard)/team/remove-approvals/page.tsx`:

```tsx
"use client";

import RemovalApprovalsBrowser from "@/components/RemovalApprovalsBrowser";

export default function TeamRemoveApprovalsPage() {
  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Remove Approvals</div>
      <RemovalApprovalsBrowser />
    </div>
  );
}
```

- [ ] **Step 4: Add the nav tab**

In `components/MainNav.tsx`, change:

```tsx
  const agentLogHref = currentUser.role === "ADMIN" ? "/admin/agent-logs" : "/team/agent-logs";
  const tabs = [
    { href: "/customers", label: "Customers", active: pathname.startsWith("/customers") },
    { href: agentLogHref, label: "Agent Log", active: pathname.startsWith(agentLogHref) },
  ];
```

to:

```tsx
  const agentLogHref = currentUser.role === "ADMIN" ? "/admin/agent-logs" : "/team/agent-logs";
  const removeApprovalsHref = currentUser.role === "ADMIN" ? "/admin/remove-approvals" : "/team/remove-approvals";
  const tabs = [
    { href: "/customers", label: "Customers", active: pathname.startsWith("/customers") },
    { href: agentLogHref, label: "Agent Log", active: pathname.startsWith(agentLogHref) },
    { href: removeApprovalsHref, label: "Remove Approvals", active: pathname.startsWith(removeApprovalsHref) },
  ];
```

- [ ] **Step 5: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 6: Manual verification**

Using the browser preview:
1. As ADMIN: confirm a "Remove Approvals" tab appears next to "Agent Log" at the top level, linking to `/admin/remove-approvals`. Confirm it lists the pending request created in Task 4's manual test, with the correct customer, slot, requester, and reason.
2. Click Approve — confirm the request disappears from the list, the customer's slot is now empty (assignee/pool/stage all cleared, verify on the customer detail page), and the customer record itself still loads fine (not deleted).
3. Create a second removal request (Task 4's flow) and Reject it this time — confirm it disappears from the queue, the slot and its stage are unchanged, and the badge on the customer detail page reverts from "Removal Pending" back to the real stage name.
4. As MANAGER: confirm `/team/remove-approvals` only shows requests tied to your own team's customers.
5. Confirm the requester (SALESPERSON) receives a notification for both the approved and the rejected outcome.

- [ ] **Step 7: Commit**

```bash
git add components/RemovalApprovalsBrowser.tsx "app/(dashboard)/admin/remove-approvals/page.tsx" "app/(dashboard)/team/remove-approvals/page.tsx" components/MainNav.tsx
git commit -m "Add Remove Approvals: shared browser component, admin/team pages, nav tab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
