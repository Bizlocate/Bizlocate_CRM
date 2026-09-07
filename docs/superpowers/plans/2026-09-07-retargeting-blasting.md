# Retargeting Blasting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the informal "manager asks admin for a blasting list" weekly workflow into the CRM: a manager requests old-customer leads per team member by criteria, admin approves with a quantity cap, the salesperson gets a self-expiring copy-friendly phone/name list drip-fed in batches of 50, and afterward can request their manager assign back whichever customers responded.

**Architecture:** Three new Supabase tables (`blast_requests`, `blast_items`, `blast_claim_requests`) follow the exact shape of the existing `removal_requests` workflow. A new pure-function module `lib/blasting.ts` (mirrors `lib/inactiveListings.ts`) holds criteria matching, sampling, batch-splitting, and the compute-on-load sweep math; `lib/store.tsx` owns all state + Supabase I/O and calls into it. Four new pages/components follow existing shared-route and admin/team-route conventions already in this codebase (`RemovalApprovalsBrowser`, `InactiveListingsBrowser`).

**Tech Stack:** Next.js 15 (App Router) + React 18 + TypeScript, Supabase (Postgres + RLS), no test framework, no state library beyond the existing React Context store in `lib/store.tsx`.

**Spec:** [docs/superpowers/specs/2026-09-04-retargeting-blasting-design.md](../specs/2026-09-04-retargeting-blasting-design.md)

## Global Constraints

- No automated test framework exists in this repo (confirmed: `package.json` has no test runner). Every task's verification step is `npx tsc --noEmit` (catches type errors across the whole codebase) plus a concrete manual check — matches every prior spec's "Testing: manual verification" convention. Do not add Jest/Vitest/etc. — out of scope and not requested.
- Schema changes are **not auto-applied**. `supabase/schema.sql` is a reference file; the actual Supabase database must be updated by hand (Dashboard → SQL Editor). Task 1's migration block must be copy-pasted and run there before Tasks 4+ are tested against a live app — flag this to the user explicitly when Task 1 is done.
- Batch size is a fixed constant, 50 (`BLAST_BATCH_SIZE`) — not admin-configurable.
- Unlocked-batch expiry is a fixed 7 days (`BLAST_UNLOCKED_EXPIRY_DAYS`) — not admin-configurable. Locked-queue expiry (`locked_expiry_days`) IS admin-configurable, set once per request at approve time.
- The batch-unlock / both-expiry sweep runs **admin-session-only** (see Task 4) — same accepted lag as the existing `sweepAutoSecondAssign`. This means batches only actually advance/expire when an ADMIN's session loads the app. Flag this to the user as a real operational note, not just an implementation footnote — an admin needs to open the CRM periodically for the mechanism to progress, same as the existing auto-second-assign feature already requires.
- Follow existing code style exactly: inline `style={{ }}` objects (no CSS modules/Tailwind), the shared `card` / `btn btn-primary` / `btn btn-outline` / `field-label` / `field-input` classes, `"use client"` at the top of every component/page file, `useStore()` for all data access.

---

## Task 1: Database migration

**Files:**
- Modify: `supabase/schema.sql` (append at end of file, after the last `-- Migration: ...` block around line 1912)

**Interfaces:**
- Produces: three new tables — `blast_requests`, `blast_items`, `blast_claim_requests` — with the exact columns Task 2's TypeScript types and Task 4/5's `store.tsx` code below assume.

- [ ] **Step 1: Append the migration block**

Add this to the end of `supabase/schema.sql`, matching the exact commented-block convention every other migration in this file already uses (a real `--` per line — the user copy-pastes the SQL, uncommented, into the Supabase SQL editor):

```sql

-- ============================================================
-- Migration: Retargeting Blasting — manager requests a batch of old-
-- customer leads per team member by criteria, admin approves with a
-- quantity cap, salesperson gets a self-expiring phone/name list drip-fed
-- in batches of 50, then can request their manager assign responders back
-- to them. Run once against an already-provisioned database.
-- ============================================================
--
-- create table blast_requests (
--   id uuid primary key default gen_random_uuid(),
--   requested_by uuid not null references profiles (id),
--   salesperson_id uuid not null references profiles (id),
--   business_name_keyword text,
--   area_id uuid references areas (id),
--   sub_area_id uuid references sub_areas (id),
--   business_industry_id uuid references business_tag_industries (id),
--   business_category_id uuid references business_tag_categories (id),
--   business_type_id uuid references business_tag_types (id),
--   status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
--   approved_total int check (approved_total is null or approved_total >= 0),
--   locked_expiry_days int check (locked_expiry_days is null or locked_expiry_days >= 0),
--   resolved_by uuid references profiles (id),
--   resolved_at timestamptz,
--   created_at timestamptz not null default now()
-- );
--
-- create table blast_items (
--   id uuid primary key default gen_random_uuid(),
--   blast_request_id uuid not null references blast_requests (id) on delete cascade,
--   customer_id uuid not null references customers (id) on delete cascade,
--   batch_index int not null check (batch_index >= 1),
--   unlocked_at timestamptz,
--   status text not null default 'PENDING' check (status in ('PENDING', 'DONE', 'EXPIRED')),
--   remark text,
--   done_at timestamptz,
--   created_at timestamptz not null default now(),
--   unique (blast_request_id, customer_id)
-- );
--
-- create table blast_claim_requests (
--   id uuid primary key default gen_random_uuid(),
--   requested_by uuid not null references profiles (id),
--   customer_ids uuid[] not null,
--   status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
--   resolved_by uuid references profiles (id),
--   resolved_at timestamptz,
--   created_at timestamptz not null default now()
-- );
--
-- alter table blast_requests enable row level security;
-- alter table blast_items enable row level security;
-- alter table blast_claim_requests enable row level security;
--
-- -- blast_requests: admin approves/rejects everything; a manager sees and
-- -- submits only for their own team's salespeople; the salesperson can see
-- -- (but never write) their own requests.
-- create policy "blast_requests_select" on blast_requests for select using (
--   is_admin() or requested_by = auth.uid() or salesperson_id = auth.uid()
-- );
-- create policy "blast_requests_insert" on blast_requests for insert with check (
--   requested_by = auth.uid()
--   and exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--   and exists (select 1 from profiles sp where sp.id = blast_requests.salesperson_id and sp.team_id = my_team_id())
-- );
-- create policy "blast_requests_update_admin" on blast_requests for update using (is_admin());
--
-- -- blast_items: visible/writable by admin (approval draw + the sweep) or
-- -- the salesperson the parent request targets (their own remark/done
-- -- marking). A manager has no direct access -- they only ever see
-- -- aggregate status via blast_requests.
-- create policy "blast_items_select" on blast_items for select using (
--   is_admin()
--   or exists (
--     select 1 from blast_requests br
--     where br.id = blast_items.blast_request_id and br.salesperson_id = auth.uid()
--   )
-- );
-- create policy "blast_items_insert_admin" on blast_items for insert with check (is_admin());
-- create policy "blast_items_update" on blast_items for update using (
--   is_admin()
--   or exists (
--     select 1 from blast_requests br
--     where br.id = blast_items.blast_request_id and br.salesperson_id = auth.uid()
--   )
-- );
--
-- -- blast_claim_requests: the salesperson sees/submits their own; approval
-- -- is the requester's own manager only -- deliberately not is_admin(),
-- -- per the design spec ("admin does not see or act on claim requests").
-- create policy "blast_claim_requests_select" on blast_claim_requests for select using (
--   is_admin()
--   or requested_by = auth.uid()
--   or exists (
--     select 1 from profiles me
--     join profiles req on req.team_id = me.team_id
--     where me.id = auth.uid() and me.role = 'MANAGER' and req.id = blast_claim_requests.requested_by
--   )
-- );
-- create policy "blast_claim_requests_insert" on blast_claim_requests for insert with check (
--   requested_by = auth.uid()
-- );
-- create policy "blast_claim_requests_update" on blast_claim_requests for update using (
--   exists (
--     select 1 from profiles me
--     join profiles req on req.team_id = me.team_id
--     where me.id = auth.uid() and me.role = 'MANAGER' and req.id = blast_claim_requests.requested_by
--   )
-- );
```

- [ ] **Step 2: Commit**

```bash
git add supabase/schema.sql
git commit -m "Add retargeting blasting schema migration (blast_requests/blast_items/blast_claim_requests)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

Tell the user explicitly after this commit: this SQL has **not** been run against the live Supabase database — they must copy the uncommented statements into the Supabase SQL editor before Task 4 onward can be tested end to end.

---

## Task 2: Types

**Files:**
- Modify: `lib/types.ts` (append after the existing `RemovalRequest` interface, end of file)

**Interfaces:**
- Consumes: nothing new (plain data types).
- Produces: `BlastRequestStatus`, `BlastRequest`, `BlastItemStatus`, `BlastItem`, `BlastClaimRequestStatus`, `BlastClaimRequest` — used by every later task.

- [ ] **Step 1: Add the types**

Append to the end of `lib/types.ts`:

```typescript
export type BlastRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export interface BlastRequest {
  id: string;
  requestedBy: string;
  salespersonId: string;
  businessNameKeyword: string | null;
  areaId: string | null;
  subAreaId: string | null;
  businessIndustryId: string | null;
  businessCategoryId: string | null;
  businessTypeId: string | null;
  status: BlastRequestStatus;
  approvedTotal: number | null;
  lockedExpiryDays: number | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export type BlastItemStatus = "PENDING" | "DONE" | "EXPIRED";

export interface BlastItem {
  id: string;
  blastRequestId: string;
  customerId: string;
  batchIndex: number;
  unlockedAt: string | null;
  status: BlastItemStatus;
  remark: string | null;
  doneAt: string | null;
  createdAt: string;
}

export type BlastClaimRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface BlastClaimRequest {
  id: string;
  requestedBy: string;
  customerIds: string[];
  status: BlastClaimRequestStatus;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (the file only adds exports nothing else references yet).

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "Add Blast request/item/claim types

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: `lib/blasting.ts` — pure helper module

**Files:**
- Create: `lib/blasting.ts`

**Interfaces:**
- Consumes: `BlastRequest`, `BlastItem`, `Customer` from `lib/types.ts` (Task 2).
- Produces (exact names/signatures Task 4/5/6/7/8/9 all rely on):
  - `BLAST_BATCH_SIZE: number`
  - `BLAST_UNLOCK_DONE_RATIO: number`
  - `BLAST_UNLOCKED_EXPIRY_DAYS: number`
  - `type BlastCriteria = Pick<BlastRequest, "businessNameKeyword" | "areaId" | "subAreaId" | "businessIndustryId" | "businessCategoryId" | "businessTypeId">`
  - `matchesBlastCriteria(customer: Customer, criteria: BlastCriteria): boolean`
  - `matchingCustomers(customers: Customer[], criteria: BlastCriteria): Customer[]`
  - `sampleForApproval(customers: Customer[], criteria: BlastCriteria, count: number): Customer[]`
  - `splitIntoBatches(customerIds: string[]): string[][]`
  - `interface BlastSweepResult { toUnlock: string[]; toExpireItems: string[]; toExpireRequests: string[] }`
  - `computeBlastSweep(requests: BlastRequest[], items: BlastItem[], now?: number): BlastSweepResult`
  - `visibleBlastItemsFor(items: BlastItem[], requests: BlastRequest[], userId: string): BlastItem[]`

- [ ] **Step 1: Write the module**

```typescript
import type { BlastItem, BlastRequest, Customer } from "./types";

export const BLAST_BATCH_SIZE = 50;
export const BLAST_UNLOCK_DONE_RATIO = 0.2;
export const BLAST_UNLOCKED_EXPIRY_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type BlastCriteria = Pick<
  BlastRequest,
  "businessNameKeyword" | "areaId" | "subAreaId" | "businessIndustryId" | "businessCategoryId" | "businessTypeId"
>;

/** AND-match across whichever criteria fields are filled; a blank field means "match all" for that dimension. */
export function matchesBlastCriteria(customer: Customer, criteria: BlastCriteria): boolean {
  if (criteria.businessNameKeyword && !customer.businessName.toLowerCase().includes(criteria.businessNameKeyword.toLowerCase())) {
    return false;
  }
  if (criteria.areaId && customer.areaId !== criteria.areaId) return false;
  if (criteria.subAreaId && customer.subAreaId !== criteria.subAreaId) return false;
  if (criteria.businessIndustryId && customer.businessIndustryId !== criteria.businessIndustryId) return false;
  if (criteria.businessCategoryId && customer.businessCategoryId !== criteria.businessCategoryId) return false;
  if (criteria.businessTypeId && customer.businessTypeId !== criteria.businessTypeId) return false;
  return true;
}

export function matchingCustomers(customers: Customer[], criteria: BlastCriteria): Customer[] {
  return customers.filter((c) => matchesBlastCriteria(c, criteria));
}

/** Newest-customer-first sample of up to `count` matching customers, drawn once at approve time. */
export function sampleForApproval(customers: Customer[], criteria: BlastCriteria, count: number): Customer[] {
  return matchingCustomers(customers, criteria)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, count);
}

/** Splits a drawn sample into 1-indexed batches of BLAST_BATCH_SIZE, in the order given. */
export function splitIntoBatches(customerIds: string[]): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < customerIds.length; i += BLAST_BATCH_SIZE) {
    batches.push(customerIds.slice(i, i + BLAST_BATCH_SIZE));
  }
  return batches;
}

export interface BlastSweepResult {
  toUnlock: string[]; // blast_items ids whose batch should unlock now
  toExpireItems: string[]; // blast_items ids to flip to EXPIRED
  toExpireRequests: string[]; // blast_requests ids to flip to EXPIRED
}

/**
 * Compute-on-load sweep, same shape as sweepStalePool in lib/store.tsx: a
 * pure computation over a snapshot -- the caller does the actual setState +
 * Supabase writes. Three rules per request, evaluated per batch in
 * ascending batch_index order (see the design spec's "Unlock / expiry
 * mechanics" section):
 *  1. If a locked-queue deadline has passed (now - resolved_at >=
 *     locked_expiry_days) while any batch is still locked, the WHOLE
 *     request expires -- every still-locked item across every batch is
 *     flipped, and no unlock/7-day check runs for this request at all.
 *  2. Otherwise, an already-unlocked batch expires 7 days after its own
 *     unlocked_at, regardless of done status.
 *  3. Otherwise, an unlocked batch at >=20% done unlocks the next batch
 *     (only if that next batch is still locked).
 */
export function computeBlastSweep(requests: BlastRequest[], items: BlastItem[], now: number = Date.now()): BlastSweepResult {
  const toUnlock: string[] = [];
  const toExpireItems: string[] = [];
  const toExpireRequests: string[] = [];

  for (const req of requests) {
    if (req.status !== "APPROVED") continue;
    const reqItems = items.filter((i) => i.blastRequestId === req.id);
    const batchIndexes = Array.from(new Set(reqItems.map((i) => i.batchIndex))).sort((a, b) => a - b);

    const hasLockedBatch = batchIndexes.some((bi) => !reqItems.find((i) => i.batchIndex === bi)!.unlockedAt);
    if (hasLockedBatch && req.lockedExpiryDays != null && req.resolvedAt) {
      const deadline = new Date(req.resolvedAt).getTime() + req.lockedExpiryDays * DAY_MS;
      if (now >= deadline) {
        toExpireRequests.push(req.id);
        for (const item of reqItems) {
          if (!item.unlockedAt && item.status !== "EXPIRED") toExpireItems.push(item.id);
        }
        continue; // whole request expired -- skip unlock/7-day checks below
      }
    }

    for (const batchIndex of batchIndexes) {
      const batchItems = reqItems.filter((i) => i.batchIndex === batchIndex);
      const unlockedAt = batchItems[0]?.unlockedAt;
      if (!unlockedAt) continue; // still locked, deadline not reached above

      if (now - new Date(unlockedAt).getTime() >= BLAST_UNLOCKED_EXPIRY_DAYS * DAY_MS) {
        for (const item of batchItems) {
          if (item.status !== "EXPIRED") toExpireItems.push(item.id);
        }
        continue;
      }

      const doneCount = batchItems.filter((i) => i.status === "DONE").length;
      if (doneCount / batchItems.length >= BLAST_UNLOCK_DONE_RATIO) {
        const nextBatch = reqItems.filter((i) => i.batchIndex === batchIndex + 1);
        if (nextBatch.length > 0 && !nextBatch[0].unlockedAt) {
          toUnlock.push(...nextBatch.map((i) => i.id));
        }
      }
    }
  }
  return { toUnlock, toExpireItems, toExpireRequests };
}

/** Items a salesperson currently sees on their own /blasting list: their own request, unlocked, not expired. */
export function visibleBlastItemsFor(items: BlastItem[], requests: BlastRequest[], userId: string): BlastItem[] {
  const ownRequestIds = new Set(
    requests.filter((r) => r.salespersonId === userId && r.status === "APPROVED").map((r) => r.id)
  );
  return items.filter((i) => ownRequestIds.has(i.blastRequestId) && i.unlockedAt && i.status !== "EXPIRED");
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification (temporary scratch check)**

Since there's no test framework, sanity-check `computeBlastSweep` by hand once with `node -e` against compiled output is impractical (this is a `.ts` file with import syntax) — instead defer verification of this module's actual behavior to Task 4/5's manual end-to-end check, where it runs for real inside the store. Skip a standalone check here; the type-check above is this task's gate.

- [ ] **Step 4: Commit**

```bash
git add lib/blasting.ts
git commit -m "Add lib/blasting.ts: criteria matching, sampling, batching, sweep math

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Store state, loading, and the sweep

**Files:**
- Modify: `lib/store.tsx`
  - Near `mapRemovalRequest` (around line 328-350): add `mapBlastRequest`, `mapBlastItem`, `mapBlastClaimRequest`.
  - Inside `interface Store` (around line 369-502): add new array fields.
  - Near `const [removalRequests, setRemovalRequests] = useState...` (around line 531): add three new `useState` pairs.
  - Near `loadRemovalRequests` (around line 743): add three new load functions.
  - Inside the initial-load `useEffect` (around line 890-934) and `login()` (around line 941+): wire in the three loads + the sweep call.

**Interfaces:**
- Consumes: `BlastRequest`/`BlastItem`/`BlastClaimRequest` (Task 2), `computeBlastSweep` (Task 3).
- Produces: `blastRequests: BlastRequest[]`, `blastItems: BlastItem[]`, `blastClaimRequests: BlastClaimRequest[]` on the `Store` context (read by every UI task); `sweepBlastRequests` (internal, not exported on `Store` — called only from the load effects, same as `sweepStalePool`).

- [ ] **Step 1: Add the row mappers**

In `lib/store.tsx`, right after the existing `mapRemovalRequest` function (ends around line 350), add:

```typescript
function mapBlastRequest(row: {
  id: string;
  requested_by: string;
  salesperson_id: string;
  business_name_keyword: string | null;
  area_id: string | null;
  sub_area_id: string | null;
  business_industry_id: string | null;
  business_category_id: string | null;
  business_type_id: string | null;
  status: string;
  approved_total: number | null;
  locked_expiry_days: number | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}): BlastRequest {
  return {
    id: row.id,
    requestedBy: row.requested_by,
    salespersonId: row.salesperson_id,
    businessNameKeyword: row.business_name_keyword,
    areaId: row.area_id,
    subAreaId: row.sub_area_id,
    businessIndustryId: row.business_industry_id,
    businessCategoryId: row.business_category_id,
    businessTypeId: row.business_type_id,
    status: row.status as BlastRequestStatus,
    approvedTotal: row.approved_total,
    lockedExpiryDays: row.locked_expiry_days,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

function mapBlastItem(row: {
  id: string;
  blast_request_id: string;
  customer_id: string;
  batch_index: number;
  unlocked_at: string | null;
  status: string;
  remark: string | null;
  done_at: string | null;
  created_at: string;
}): BlastItem {
  return {
    id: row.id,
    blastRequestId: row.blast_request_id,
    customerId: row.customer_id,
    batchIndex: row.batch_index,
    unlockedAt: row.unlocked_at,
    status: row.status as BlastItemStatus,
    remark: row.remark,
    doneAt: row.done_at,
    createdAt: row.created_at,
  };
}

function mapBlastClaimRequest(row: {
  id: string;
  requested_by: string;
  customer_ids: string[];
  status: string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}): BlastClaimRequest {
  return {
    id: row.id,
    requestedBy: row.requested_by,
    customerIds: row.customer_ids,
    status: row.status as BlastClaimRequestStatus,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}
```

- [ ] **Step 2: Add the imports**

At the top of `lib/store.tsx`, find the existing `import { ... } from "./types"` block (where `RemovalRequest`, `RemovalRequestStatus` are imported) and add: `BlastRequest`, `BlastRequestStatus`, `BlastItem`, `BlastItemStatus`, `BlastClaimRequest`, `BlastClaimRequestStatus`.

Add a new import line for the sweep helper, near the top with the other local imports:

```typescript
import { computeBlastSweep } from "./blasting";
```

- [ ] **Step 3: Add state fields to the `Store` interface**

In `interface Store` (around line 393-395, right after `removalRequests: RemovalRequest[];`), add:

```typescript
  blastRequests: BlastRequest[];
  blastItems: BlastItem[];
  blastClaimRequests: BlastClaimRequest[];
```

- [ ] **Step 4: Add `useState` pairs**

Right after `const [removalRequests, setRemovalRequests] = useState<RemovalRequest[]>([]);` (around line 531), add:

```typescript
  const [blastRequests, setBlastRequests] = useState<BlastRequest[]>([]);
  const [blastItems, setBlastItems] = useState<BlastItem[]>([]);
  const [blastClaimRequests, setBlastClaimRequests] = useState<BlastClaimRequest[]>([]);
```

- [ ] **Step 5: Add the load functions**

Right after `loadRemovalRequests` (ends around line 749), add:

```typescript
  async function loadBlastRequests(): Promise<BlastRequest[]> {
    const supabase = createClient();
    const { data } = await supabase.from("blast_requests").select("*").order("created_at", { ascending: false });
    const mapped = (data ?? []).map(mapBlastRequest);
    setBlastRequests(mapped);
    return mapped;
  }

  async function loadBlastItems(): Promise<BlastItem[]> {
    const supabase = createClient();
    const { data } = await supabase.from("blast_items").select("*").order("batch_index");
    const mapped = (data ?? []).map(mapBlastItem);
    setBlastItems(mapped);
    return mapped;
  }

  async function loadBlastClaimRequests(): Promise<BlastClaimRequest[]> {
    const supabase = createClient();
    const { data } = await supabase.from("blast_claim_requests").select("*").order("created_at", { ascending: false });
    const mapped = (data ?? []).map(mapBlastClaimRequest);
    setBlastClaimRequests(mapped);
    return mapped;
  }

  // Admin-session-only compute-on-load sweep for all three blast batch/
  // expiry rules (see lib/blasting.ts computeBlastSweep for the actual
  // math). Mirrors sweepAutoSecondAssign's admin-only convention: unlocking
  // a batch only ever changes rows already scoped to their own
  // salesperson, so it doesn't need to run under every session -- but it
  // does mean batches only advance while an admin's session loads the app.
  // ponytail: same accepted lag as sweepAutoSecondAssign. Upgrade path: a
  // real cron/edge function sweep if this needs to run without an admin
  // logging in.
  function sweepBlastRequests(requestsList: BlastRequest[], itemsList: BlastItem[], isAdmin: boolean) {
    if (!isAdmin) return;
    const { toUnlock, toExpireItems, toExpireRequests } = computeBlastSweep(requestsList, itemsList);
    if (toUnlock.length === 0 && toExpireItems.length === 0 && toExpireRequests.length === 0) return;
    const now = new Date().toISOString();
    setBlastItems((prev) =>
      prev.map((i) => {
        if (toUnlock.includes(i.id)) return { ...i, unlockedAt: now };
        if (toExpireItems.includes(i.id)) return { ...i, status: "EXPIRED" as const };
        return i;
      })
    );
    if (toExpireRequests.length > 0) {
      setBlastRequests((prev) => prev.map((r) => (toExpireRequests.includes(r.id) ? { ...r, status: "EXPIRED" as const } : r)));
    }
    const supabase = createClient();
    for (const id of toUnlock) supabase.from("blast_items").update({ unlocked_at: now }).eq("id", id).then(() => {});
    for (const id of toExpireItems) supabase.from("blast_items").update({ status: "EXPIRED" }).eq("id", id).then(() => {});
    for (const id of toExpireRequests) supabase.from("blast_requests").update({ status: "EXPIRED" }).eq("id", id).then(() => {});
  }
```

- [ ] **Step 6: Wire the loads + sweep into the initial-load effect**

In the `useEffect` around line 890-934, add the three loads after the existing `await loadRemovalReasons(); await loadRemovalRequests();` lines (same style — separate awaited calls after the big `Promise.all`, not added into it, since these don't need to block the rest), and pass the loaded values into a new `sweepBlastRequests` call alongside the existing sweep calls:

```typescript
        await loadRemovalReasons();
        await loadRemovalRequests();
        const loadedBlastRequests = await loadBlastRequests();
        const loadedBlastItems = await loadBlastItems();
        await loadBlastClaimRequests();
        const profile = loadedUsers.find((u) => u.id === data.user!.id);
        if (profile) {
          setCurrentUserId(profile.id);
          loadNotifications(profile.id);
          sweepStalePool(loadedCustomers, loadedActivities, loadedAssignmentEvents, profile.id, profile.role === "ADMIN");
          sweepAutoSecondAssign(loadedCustomers, loadResults[2], loadResults[0], loadedUsers, loadResults[16], loadedActivities, profile.role === "ADMIN");
          sweepBlastRequests(loadedBlastRequests, loadedBlastItems, profile.role === "ADMIN");
        }
```

- [ ] **Step 7: Wire the same into `login()`**

`login()` (around line 941-990) repeats the same load sequence for the sign-in path. Find its `await loadRemovalReasons(); await loadRemovalRequests();` and the `const profile = ...` block right after, and apply the identical change as Step 6 (same three loads, same `sweepBlastRequests` call using `profile.role === "ADMIN"` — `login()` already computes `profile` the same way the initial-load effect does, right before its own `sweepStalePool`/`sweepAutoSecondAssign` calls).

- [ ] **Step 8: Expose the new arrays from the provider's return value**

Find the `return { ... }` object at the end of `StoreProvider` (where `removalRequests,` is listed, around line 2193) and add right after it:

```typescript
    blastRequests,
    blastItems,
    blastClaimRequests,
```

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (The `Store` interface now declares `blastRequests`/`blastItems`/`blastClaimRequests` and the return object satisfies it — no mutation functions referencing them yet, that's Task 5.)

- [ ] **Step 10: Commit**

```bash
git add lib/store.tsx
git commit -m "Load blast_requests/blast_items/blast_claim_requests, add admin-only sweep

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Store mutations

**Files:**
- Modify: `lib/store.tsx`
  - Near `requestClientRemoval`/`resolveClientRemoval` (around line 2043-2102): add the blast-request submit/approve/reject functions.
  - Inside `addActivity` (around line 1970-1983): hook in the done-marking side effect.
  - After `addActivity`: add `markBlastItemDone`, `requestBlastClaim`, `resolveBlastClaim`.
  - Inside `interface Store` (from Task 4): add the new function signatures.
  - In the provider's `return { ... }` (from Task 4): export the new functions.

**Interfaces:**
- Consumes: `sampleForApproval`, `splitIntoBatches` (Task 3); `blastRequests`/`blastItems`/`blastClaimRequests` state + mappers (Task 4); existing `reassignCustomer`, `createNotification`, `customers`, `currentUser`.
- Produces (added to `Store`, consumed by Tasks 6-9):
  - `submitBlastRequests: (rows: { salespersonId: string; businessNameKeyword: string; areaId: string | null; subAreaId: string | null; businessIndustryId: string | null; businessCategoryId: string | null; businessTypeId: string | null }[]) => void`
  - `resolveBlastRequest: (requestId: string, decision: { approve: true; approvedTotal: number; lockedExpiryDays: number } | { approve: false }) => void`
  - `markBlastItemDone: (itemId: string, remark: string) => void`
  - `requestBlastClaim: (customerIds: string[]) => void`
  - `resolveBlastClaim: (requestId: string, approve: boolean) => void`

- [ ] **Step 1: Add the `Store` interface signatures**

In `interface Store`, right after `resolveClientRemoval: (requestId: string, approve: boolean) => void;` (around line 494), add:

```typescript
  submitBlastRequests: (rows: { salespersonId: string; businessNameKeyword: string; areaId: string | null; subAreaId: string | null; businessIndustryId: string | null; businessCategoryId: string | null; businessTypeId: string | null }[]) => void;
  resolveBlastRequest: (requestId: string, decision: { approve: true; approvedTotal: number; lockedExpiryDays: number } | { approve: false }) => void;
  markBlastItemDone: (itemId: string, remark: string) => void;
  requestBlastClaim: (customerIds: string[]) => void;
  resolveBlastClaim: (requestId: string, approve: boolean) => void;
```

- [ ] **Step 2: Add the import for the sampling helpers**

Extend the `import { computeBlastSweep } from "./blasting";` line added in Task 4 to also bring in `sampleForApproval` and `splitIntoBatches`:

```typescript
import { computeBlastSweep, sampleForApproval, splitIntoBatches } from "./blasting";
```

- [ ] **Step 3: Add `submitBlastRequests` and `resolveBlastRequest`**

Right after `resolveClientRemoval` (ends around line 2102), add:

```typescript
  // Manager's "add a row per team member" submit -- rows with no
  // salespersonId picked are simply skipped (a member who doesn't need
  // blasting this week is left off, not submitted as an empty ask).
  function submitBlastRequests(rows: { salespersonId: string; businessNameKeyword: string; areaId: string | null; subAreaId: string | null; businessIndustryId: string | null; businessCategoryId: string | null; businessTypeId: string | null }[]) {
    if (!currentUser) return;
    const supabase = createClient();
    for (const row of rows) {
      if (!row.salespersonId) continue;
      supabase
        .from("blast_requests")
        .insert({
          requested_by: currentUser.id,
          salesperson_id: row.salespersonId,
          business_name_keyword: row.businessNameKeyword.trim() || null,
          area_id: row.areaId,
          sub_area_id: row.subAreaId,
          business_industry_id: row.businessIndustryId,
          business_category_id: row.businessCategoryId,
          business_type_id: row.businessTypeId,
          status: "PENDING",
        })
        .select()
        .single()
        .then(({ data, error }) => {
          if (!error && data) setBlastRequests((prev) => [mapBlastRequest(data), ...prev]);
        });
    }
  }

  // Admin approves (drawing + batching the sample right away) or rejects a
  // pending blast request. Draw order and batch size come from
  // lib/blasting.ts so the same rules the sweep uses later stay in one
  // place.
  function resolveBlastRequest(requestId: string, decision: { approve: true; approvedTotal: number; lockedExpiryDays: number } | { approve: false }) {
    if (!currentUser) return;
    const request = blastRequests.find((r) => r.id === requestId);
    if (!request) return;
    const now = new Date().toISOString();
    const supabase = createClient();

    if (!decision.approve) {
      setBlastRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: "REJECTED", resolvedBy: currentUser.id, resolvedAt: now } : r))
      );
      supabase
        .from("blast_requests")
        .update({ status: "REJECTED", resolved_by: currentUser.id, resolved_at: now })
        .eq("id", requestId)
        .then(() => {});
      return;
    }

    const sample = sampleForApproval(customers, request, decision.approvedTotal);
    const batches = splitIntoBatches(sample.map((c) => c.id));

    setBlastRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? { ...r, status: "APPROVED", approvedTotal: decision.approvedTotal, lockedExpiryDays: decision.lockedExpiryDays, resolvedBy: currentUser.id, resolvedAt: now }
          : r
      )
    );
    supabase
      .from("blast_requests")
      .update({
        status: "APPROVED",
        approved_total: decision.approvedTotal,
        locked_expiry_days: decision.lockedExpiryDays,
        resolved_by: currentUser.id,
        resolved_at: now,
      })
      .eq("id", requestId)
      .then(() => {});

    const rows = batches.flatMap((batch, batchIdx) =>
      batch.map((customerId) => ({
        blast_request_id: requestId,
        customer_id: customerId,
        batch_index: batchIdx + 1,
        unlocked_at: batchIdx === 0 ? now : null,
        status: "PENDING",
      }))
    );
    if (rows.length === 0) return;
    supabase
      .from("blast_items")
      .insert(rows)
      .select()
      .then(({ data, error }) => {
        if (!error && data) setBlastItems((prev) => [...prev, ...data.map(mapBlastItem)]);
      });
  }
```

- [ ] **Step 4: Hook done-marking into `addActivity`**

Modify the existing `addActivity` function (around line 1970-1983) so the success callback also checks for an open blast item on the same customer for the current user. Change:

```typescript
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

to:

```typescript
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
          markBlastItemDoneForActivity(customerId);
        }
      });
  }

  // Logging any activity on a customer while it's still an open (unlocked,
  // not done, not expired) blast item for the current user flips that item
  // to Done too -- the alternate path to the remark box, per the
  // retargeting blasting design. No-op if there's no matching open item.
  function markBlastItemDoneForActivity(customerId: string) {
    if (!currentUser) return;
    const openItem = blastItems.find((i) => {
      if (i.customerId !== customerId || i.status !== "PENDING" || !i.unlockedAt) return false;
      const request = blastRequests.find((r) => r.id === i.blastRequestId);
      return request?.salespersonId === currentUser.id && request.status === "APPROVED";
    });
    if (!openItem) return;
    const now = new Date().toISOString();
    setBlastItems((prev) => prev.map((i) => (i.id === openItem.id ? { ...i, status: "DONE", doneAt: now } : i)));
    const supabase = createClient();
    supabase.from("blast_items").update({ status: "DONE", done_at: now }).eq("id", openItem.id).then(() => {});
  }
```

- [ ] **Step 5: Add `markBlastItemDone`, `requestBlastClaim`, `resolveBlastClaim`**

Right after `markBlastItemDoneForActivity`, add:

```typescript
  // The salesperson's remark-box path to marking a blast item Done (the
  // other path is markBlastItemDoneForActivity above, via logging an
  // activity on the customer's profile).
  function markBlastItemDone(itemId: string, remark: string) {
    const now = new Date().toISOString();
    setBlastItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, status: "DONE", remark, doneAt: now } : i)));
    const supabase = createClient();
    supabase.from("blast_items").update({ status: "DONE", remark, done_at: now }).eq("id", itemId).then(() => {});
  }

  // Salesperson batches up several responded-to customers and asks their
  // manager to assign them back. One row, array of customer ids -- the
  // manager approves/rejects the whole batch at once.
  function requestBlastClaim(customerIds: string[]) {
    if (!currentUser || customerIds.length === 0) return;
    const supabase = createClient();
    supabase
      .from("blast_claim_requests")
      .insert({ requested_by: currentUser.id, customer_ids: customerIds, status: "PENDING" })
      .select()
      .single()
      .then(({ data, error }) => {
        if (!error && data) setBlastClaimRequests((prev) => [mapBlastClaimRequest(data), ...prev]);
      });
  }

  // Always the requester's own manager, regardless of which area/team the
  // customer itself belongs to -- deliberate exception to normal
  // area-scoping, per the design spec. Approval reuses reassignCustomer
  // into the requester's first empty slot; a customer that can't be
  // assigned (no empty slot, pool limit) is reported and skipped without
  // blocking the rest of the batch.
  function resolveBlastClaim(requestId: string, approve: boolean) {
    if (!currentUser) return;
    const request = blastClaimRequests.find((r) => r.id === requestId);
    if (!request) return;
    const status: BlastClaimRequestStatus = approve ? "APPROVED" : "REJECTED";
    const now = new Date().toISOString();
    setBlastClaimRequests((prev) =>
      prev.map((r) => (r.id === requestId ? { ...r, status, resolvedBy: currentUser.id, resolvedAt: now } : r))
    );
    const supabase = createClient();
    supabase
      .from("blast_claim_requests")
      .update({ status, resolved_by: currentUser.id, resolved_at: now })
      .eq("id", requestId)
      .then(() => {});
    if (!approve) return;

    const errors: string[] = [];
    for (const customerId of request.customerIds) {
      const customer = customers.find((c) => c.id === customerId);
      if (!customer) {
        errors.push("A claimed customer could not be found.");
        continue;
      }
      const emptySlot: 1 | 2 | 3 | null = !customer.assignedToUserId ? 1 : !customer.assignedToUserId2 ? 2 : !customer.assignedToUserId3 ? 3 : null;
      if (!emptySlot) {
        errors.push(`${customer.name}: no empty assignee slot.`);
        continue;
      }
      const result = reassignCustomer(customerId, emptySlot, request.requestedBy);
      if (!result.ok) errors.push(`${customer.name}: ${result.error}`);
    }
    if (errors.length > 0) {
      alert(`Some customers could not be assigned:\n${errors.join("\n")}`);
    }
  }
```

- [ ] **Step 6: Export the new functions from the provider's return value**

In the `return { ... }` object (same spot as Task 4 Step 8), add:

```typescript
    submitBlastRequests,
    resolveBlastRequest,
    markBlastItemDone,
    requestBlastClaim,
    resolveBlastClaim,
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Manual verification**

Requires Task 1's migration already run against Supabase (per the Global Constraints note) and a dev server running (`npm run dev`):
1. Log in as a MANAGER. Confirm no crash (the new loads run without error).
2. In the browser console (or a temporary button, removed after checking) call the store's `submitBlastRequests` with one row for a real salesperson id on your team and no criteria filled — confirm a new row appears in Supabase's `blast_requests` table with `status = 'PENDING'`.
3. Log in as ADMIN, confirm `blastRequests` loaded (check via React DevTools or a `console.log` in the store) shows that pending row.

This is a placeholder manual check — Task 7 replaces step 2's console call with a real form, so treat this step as "does the plumbing not crash," not full UI verification.

- [ ] **Step 9: Commit**

```bash
git add lib/store.tsx
git commit -m "Add blast request/claim submit+approve+reject, done-marking on activity log

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Manager submit UI (`/blast-requests`)

**Files:**
- Create: `components/BlastRequestForm.tsx`
- Create: `app/(dashboard)/blast-requests/page.tsx`

**Interfaces:**
- Consumes: `useStore()` fields `users`, `areas`, `subAreas`, `businessTagIndustries`, `businessTagCategories`, `businessTagTypes`, `currentUser`, `blastRequests`, and function `submitBlastRequests` (Task 5).
- Produces: page rendered at `/blast-requests`, no exports consumed elsewhere.

- [ ] **Step 1: Write `components/BlastRequestForm.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";

interface DraftRow {
  salespersonId: string;
  businessNameKeyword: string;
  areaId: string;
  subAreaId: string;
  businessIndustryId: string;
  businessCategoryId: string;
  businessTypeId: string;
}

const emptyRow: DraftRow = {
  salespersonId: "",
  businessNameKeyword: "",
  areaId: "",
  subAreaId: "",
  businessIndustryId: "",
  businessCategoryId: "",
  businessTypeId: "",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Manager's weekly "who wants blasting leads" submission -- one row per
 * team member who needs a list this week (members who don't need one are
 * simply left off, not given an empty row). Every criteria field is
 * optional; a blank field is "match all" for that dimension, resolved
 * against the whole customers table (not just this manager's own area) --
 * see the design spec.
 */
export default function BlastRequestForm() {
  const {
    currentUser,
    users,
    areas,
    subAreas,
    businessTagIndustries,
    businessTagCategories,
    businessTagTypes,
    blastRequests,
    submitBlastRequests,
  } = useStore();
  const [rows, setRows] = useState<DraftRow[]>([{ ...emptyRow }]);

  const teamSalespeople = currentUser
    ? users.filter((u) => u.teamId === currentUser.teamId && u.role === "SALESPERSON")
    : [];

  function updateRow(index: number, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { ...emptyRow }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit() {
    submitBlastRequests(
      rows
        .filter((r) => r.salespersonId)
        .map((r) => ({
          salespersonId: r.salespersonId,
          businessNameKeyword: r.businessNameKeyword,
          areaId: r.areaId || null,
          subAreaId: r.subAreaId || null,
          businessIndustryId: r.businessIndustryId || null,
          businessCategoryId: r.businessCategoryId || null,
          businessTypeId: r.businessTypeId || null,
        }))
    );
    setRows([{ ...emptyRow }]);
  }

  const myHistory = currentUser ? blastRequests.filter((r) => r.requestedBy === currentUser.id) : [];

  function salespersonName(id: string) {
    return users.find((u) => u.id === id)?.name ?? "Unknown";
  }

  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        {rows.map((row, index) => {
          const filteredSubAreas = subAreas.filter((s) => s.areaId === row.areaId);
          const filteredCategories = businessTagCategories.filter((c) => c.industryId === row.businessIndustryId);
          const filteredTypes = businessTagTypes.filter((t) => t.categoryId === row.businessCategoryId);
          return (
            <div key={index} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #eef0f2" }}>
              <div style={{ minWidth: 160 }}>
                <label className="field-label">Salesperson</label>
                <select className="field-input" value={row.salespersonId} onChange={(e) => updateRow(index, { salespersonId: e.target.value })}>
                  <option value="">Select…</option>
                  {teamSalespeople.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div style={{ minWidth: 160 }}>
                <label className="field-label">Business name keyword</label>
                <input className="field-input" value={row.businessNameKeyword} onChange={(e) => updateRow(index, { businessNameKeyword: e.target.value })} placeholder="All" />
              </div>
              <div style={{ minWidth: 140 }}>
                <label className="field-label">Area</label>
                <select className="field-input" value={row.areaId} onChange={(e) => updateRow(index, { areaId: e.target.value, subAreaId: "" })}>
                  <option value="">All</option>
                  {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div style={{ minWidth: 140 }}>
                <label className="field-label">Sub-area</label>
                <select className="field-input" value={row.subAreaId} onChange={(e) => updateRow(index, { subAreaId: e.target.value })} disabled={!row.areaId}>
                  <option value="">All</option>
                  {filteredSubAreas.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div style={{ minWidth: 140 }}>
                <label className="field-label">Business industry</label>
                <select className="field-input" value={row.businessIndustryId} onChange={(e) => updateRow(index, { businessIndustryId: e.target.value, businessCategoryId: "", businessTypeId: "" })}>
                  <option value="">All</option>
                  {businessTagIndustries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div style={{ minWidth: 140 }}>
                <label className="field-label">Business category</label>
                <select className="field-input" value={row.businessCategoryId} onChange={(e) => updateRow(index, { businessCategoryId: e.target.value, businessTypeId: "" })} disabled={!row.businessIndustryId}>
                  <option value="">All</option>
                  {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ minWidth: 140 }}>
                <label className="field-label">Business type</label>
                <select className="field-input" value={row.businessTypeId} onChange={(e) => updateRow(index, { businessTypeId: e.target.value })} disabled={!row.businessCategoryId}>
                  <option value="">All</option>
                  {filteredTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              {rows.length > 1 && (
                <button className="btn btn-outline" type="button" onClick={() => removeRow(index)}>Remove</button>
              )}
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-outline" type="button" onClick={addRow}>+ Add Row</button>
          <button className="btn btn-primary" type="button" onClick={handleSubmit} disabled={!rows.some((r) => r.salespersonId)}>
            Submit
          </button>
        </div>
      </div>

      <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>Your submitted requests</div>
      <div className="card">
        {myHistory.length === 0 && <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>No requests submitted yet.</div>}
        {myHistory.map((r) => (
          <div key={r.id} style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2" }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{salespersonName(r.salespersonId)}</div>
            <div style={{ fontSize: 12, color: "#9aa0ab", marginTop: 3 }}>
              {r.status}
              {r.status === "APPROVED" && r.approvedTotal != null ? ` — ${r.approvedTotal} customers` : ""}
              {" · "}
              {formatDate(r.createdAt)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `app/(dashboard)/blast-requests/page.tsx`**

```typescript
"use client";

import BlastRequestForm from "@/components/BlastRequestForm";

export default function BlastRequestsPage() {
  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Blast Requests</div>
      <BlastRequestForm />
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

With the dev server running and Task 1's SQL already applied:
1. Log in as a MANAGER. Navigate to `/blast-requests` directly (nav wiring is Task 10).
2. Confirm the team's salespeople appear in the dropdown, add a second row, fill in an Area on one row and confirm its Sub-area dropdown populates only that area's sub-areas; same for Business industry → category → type.
3. Remove a row, submit with only one row filled. Confirm it appears under "Your submitted requests" with status PENDING.
4. Check Supabase's `blast_requests` table directly to confirm the row landed with the right `salesperson_id`/criteria columns.

- [ ] **Step 5: Commit**

```bash
git add components/BlastRequestForm.tsx "app/(dashboard)/blast-requests/page.tsx"
git commit -m "Add manager blast-request submit UI at /blast-requests

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Admin approve UI (`/admin/blast-requests`)

**Files:**
- Create: `components/BlastApprovalsBrowser.tsx`
- Create: `app/(dashboard)/admin/blast-requests/page.tsx`

**Interfaces:**
- Consumes: `useStore()` fields `blastRequests`, `customers`, `users`, function `resolveBlastRequest` (Task 5); `matchingCustomers` from `lib/blasting.ts` (Task 3).
- Produces: page rendered at `/admin/blast-requests`.

- [ ] **Step 1: Write `components/BlastApprovalsBrowser.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { matchingCustomers } from "@/lib/blasting";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

/** Admin's approval queue for pending blast requests -- one live matching count per row, computed client-side against the already-loaded customers array (same approach the rest of this app already uses, no new server aggregation). */
export default function BlastApprovalsBrowser() {
  const { blastRequests, customers, users, areas, subAreas, businessTagIndustries, businessTagCategories, businessTagTypes, resolveBlastRequest } = useStore();
  const pending = blastRequests.filter((r) => r.status === "PENDING");
  const [approvedTotalDrafts, setApprovedTotalDrafts] = useState<Record<string, number>>({});
  const [lockedExpiryDrafts, setLockedExpiryDrafts] = useState<Record<string, number>>({});

  function userName(id: string) {
    return users.find((u) => u.id === id)?.name ?? "Unknown";
  }
  function lookupName(list: { id: string; name: string }[], id: string | null) {
    return id ? list.find((x) => x.id === id)?.name ?? "Unknown" : "All";
  }

  function criteriaSummary(r: (typeof pending)[number]) {
    const parts = [
      r.businessNameKeyword ? `"${r.businessNameKeyword}"` : null,
      r.areaId ? `Area: ${lookupName(areas, r.areaId)}` : null,
      r.subAreaId ? `Sub-area: ${lookupName(subAreas, r.subAreaId)}` : null,
      r.businessIndustryId ? `Industry: ${lookupName(businessTagIndustries, r.businessIndustryId)}` : null,
      r.businessCategoryId ? `Category: ${lookupName(businessTagCategories, r.businessCategoryId)}` : null,
      r.businessTypeId ? `Type: ${lookupName(businessTagTypes, r.businessTypeId)}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "All customers";
  }

  return (
    <div className="card">
      {pending.length === 0 && <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>No pending blast requests.</div>}
      {pending.map((r) => {
        const matchCount = matchingCustomers(customers, r).length;
        const approvedTotal = approvedTotalDrafts[r.id] ?? matchCount;
        const lockedExpiryDays = lockedExpiryDrafts[r.id] ?? 7;
        return (
          <div key={r.id} style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2" }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{userName(r.requestedBy)} → {userName(r.salespersonId)}</div>
            <div style={{ fontSize: 13, color: "#3d4250", marginTop: 3 }}>{criteriaSummary(r)}</div>
            <div style={{ fontSize: 12, color: "#9aa0ab", marginTop: 3 }}>{matchCount} matching customers · {formatDate(r.createdAt)}</div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginTop: 10, flexWrap: "wrap" }}>
              <div>
                <label className="field-label">Approve how many</label>
                <input
                  className="field-input"
                  type="number"
                  min={0}
                  max={matchCount}
                  value={approvedTotal}
                  onChange={(e) => setApprovedTotalDrafts((prev) => ({ ...prev, [r.id]: Number(e.target.value) }))}
                  style={{ width: 100 }}
                />
              </div>
              <div>
                <label className="field-label">Locked batch expiry (days)</label>
                <input
                  className="field-input"
                  type="number"
                  min={1}
                  value={lockedExpiryDays}
                  onChange={(e) => setLockedExpiryDrafts((prev) => ({ ...prev, [r.id]: Number(e.target.value) }))}
                  style={{ width: 100 }}
                />
              </div>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  if (!window.confirm(`Approve blasting ${approvedTotal} customers to ${userName(r.salespersonId)}?`)) return;
                  resolveBlastRequest(r.id, { approve: true, approvedTotal, lockedExpiryDays });
                }}
              >
                Approve
              </button>
              <button className="btn btn-outline" type="button" onClick={() => resolveBlastRequest(r.id, { approve: false })}>Reject</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Write `app/(dashboard)/admin/blast-requests/page.tsx`**

```typescript
"use client";

import BlastApprovalsBrowser from "@/components/BlastApprovalsBrowser";

export default function AdminBlastRequestsPage() {
  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Blast Approvals</div>
      <BlastApprovalsBrowser />
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

1. As ADMIN, navigate to `/admin/blast-requests`. Confirm the pending request from Task 6's manual check appears with the right criteria summary and a live matching count.
2. Change "Approve how many" to a number smaller than the match count, set a locked expiry days value, click Approve, confirm the dialog, and confirm the row disappears from the pending list.
3. Check Supabase: `blast_requests.status = 'APPROVED'`, `approved_total` matches what you entered; `blast_items` has exactly that many rows, batch 1 (up to 50) has a non-null `unlocked_at`, later batches (if `approved_total > 50`) have `unlocked_at = null`.
4. Submit a second request and Reject it — confirm it disappears and its `status = 'REJECTED'` in Supabase.

- [ ] **Step 5: Commit**

```bash
git add components/BlastApprovalsBrowser.tsx "app/(dashboard)/admin/blast-requests/page.tsx"
git commit -m "Add admin blast-approval UI at /admin/blast-requests

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Salesperson blasting list (`/blasting`)

**Files:**
- Create: `components/BlastingListBrowser.tsx`
- Create: `app/(dashboard)/blasting/page.tsx`

**Interfaces:**
- Consumes: `useStore()` fields `blastItems`, `blastRequests`, `customers`, `currentUser`, functions `markBlastItemDone`, `requestBlastClaim` (Task 5).
- Produces: page rendered at `/blasting`.

- [ ] **Step 1: Write `components/BlastingListBrowser.tsx`**

```typescript
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";

/**
 * A salesperson's own blasting list -- grouped by batch (50 customers
 * each), only unlocked/unexpired items shown per batch, with a "N of M
 * batches, K locked" indicator so the salesperson knows more is queued up.
 * Locked batches' items ARE fetched (RLS allows it -- they belong to this
 * salesperson's own request) but filtered out of what's rendered here.
 */
export default function BlastingListBrowser() {
  const { blastItems, blastRequests, customers, currentUser, markBlastItemDone, requestBlastClaim } = useStore();
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeBatch, setActiveBatch] = useState<number | null>(null);

  const myItems = useMemo(() => {
    if (!currentUser) return [];
    const ownRequestIds = new Set(
      blastRequests.filter((r) => r.salespersonId === currentUser.id && r.status === "APPROVED").map((r) => r.id)
    );
    return blastItems.filter((i) => ownRequestIds.has(i.blastRequestId));
  }, [blastItems, blastRequests, currentUser]);

  const totalBatches = Array.from(new Set(myItems.map((i) => i.batchIndex))).sort((a, b) => a - b);
  const unlockedBatches = totalBatches.filter((bi) => myItems.some((i) => i.batchIndex === bi && i.unlockedAt && i.status !== "EXPIRED"));
  const currentBatch = activeBatch ?? unlockedBatches[0] ?? null;

  const rows = myItems.filter((i) => i.batchIndex === currentBatch && i.unlockedAt && i.status !== "EXPIRED");

  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  function toggleSelected(itemId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function submitClaim() {
    const customerIds = rows.filter((r) => selected.has(r.id)).map((r) => r.customerId);
    if (customerIds.length === 0) return;
    requestBlastClaim(Array.from(new Set(customerIds)));
    setSelected(new Set());
  }

  async function copyPhone(phone: string) {
    try {
      await navigator.clipboard.writeText(phone);
    } catch {
      // clipboard permission denied -- nothing else to do, the number is still visible to copy by hand
    }
  }

  if (!currentUser) return null;

  if (unlockedBatches.length === 0) {
    return <div className="card" style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>No blasting list available right now.</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {totalBatches.map((bi) => {
          const isUnlocked = unlockedBatches.includes(bi);
          return (
            <button
              key={bi}
              type="button"
              className={bi === currentBatch ? "btn btn-primary" : "btn btn-outline"}
              disabled={!isUnlocked}
              onClick={() => setActiveBatch(bi)}
            >
              Batch {bi}{!isUnlocked ? " (locked)" : ""}
            </button>
          );
        })}
      </div>

      <div className="card">
        {rows.length === 0 && <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>Nothing in this batch.</div>}
        {rows.map((item) => {
          const customer = customerById.get(item.customerId);
          if (!customer) return null;
          const draft = remarkDrafts[item.id] ?? item.remark ?? "";
          return (
            <div key={item.id} style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2", display: "flex", alignItems: "center", gap: 12 }}>
              <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelected(item.id)} />
              <Link href={`/customers/${customer.id}`} style={{ color: "inherit", minWidth: 160 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{customer.name}</div>
                <div style={{ fontSize: 12, color: "#9aa0ab", marginTop: 2 }}>{item.status === "DONE" ? "Done" : "Pending"}</div>
              </Link>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{customer.phone}</div>
              <button className="btn btn-outline" type="button" onClick={() => copyPhone(customer.phone)}>Copy</button>
              <input
                className="field-input"
                style={{ flex: 1, minWidth: 160 }}
                placeholder="Remark…"
                value={draft}
                onChange={(e) => setRemarkDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
              />
              <button className="btn btn-outline" type="button" onClick={() => markBlastItemDone(item.id, draft)}>Save</button>
            </div>
          );
        })}
      </div>

      {rows.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button className="btn btn-primary" type="button" disabled={selected.size === 0} onClick={submitClaim}>
            Request Assign to Me ({selected.size})
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `app/(dashboard)/blasting/page.tsx`**

```typescript
"use client";

import BlastingListBrowser from "@/components/BlastingListBrowser";

export default function BlastingPage() {
  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Blasting</div>
      <BlastingListBrowser />
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

1. Log in as the salesperson approved in Task 7. Navigate to `/blasting`. Confirm Batch 1 shows with name + phone + Copy button + remark box, and (if `approved_total > 50`) Batch 2 shows as "(locked)" and is not clickable.
2. Click Copy on a row, paste somewhere, confirm the phone number matches.
3. Type a remark and click Save on a row — confirm it flips to "Done" without disappearing from the list.
4. Open that same customer's profile via the row link, log an activity — confirm (reload `/blasting`) that row is also "Done" now (the `addActivity` hook from Task 5).
5. Check several rows, click "Request Assign to Me" — confirm a `blast_claim_requests` row appears in Supabase with those `customer_ids` and `status = 'PENDING'`.

- [ ] **Step 5: Commit**

```bash
git add components/BlastingListBrowser.tsx "app/(dashboard)/blasting/page.tsx"
git commit -m "Add salesperson blasting list UI at /blasting

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Manager claim approvals (`/team/blast-claims`)

**Files:**
- Create: `components/BlastClaimsBrowser.tsx`
- Create: `app/(dashboard)/team/blast-claims/page.tsx`

**Interfaces:**
- Consumes: `useStore()` fields `blastClaimRequests`, `customers`, `users`, `currentUser`, function `resolveBlastClaim` (Task 5).
- Produces: page rendered at `/team/blast-claims`.

- [ ] **Step 1: Write `components/BlastClaimsBrowser.tsx`**

```typescript
"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Manager's claim-approval queue: pending "assign these back to me"
 * batches from their own team's salespeople -- deliberately NOT filtered
 * by the customers' own area, since blasting can legitimately cross into
 * areas outside this manager's team (see the design spec).
 */
export default function BlastClaimsBrowser() {
  const { blastClaimRequests, customers, users, currentUser, resolveBlastClaim } = useStore();

  const teamUserIds = new Set(currentUser ? users.filter((u) => u.teamId === currentUser.teamId).map((u) => u.id) : []);
  const pending = blastClaimRequests.filter((r) => r.status === "PENDING" && teamUserIds.has(r.requestedBy));

  function userName(id: string) {
    return users.find((u) => u.id === id)?.name ?? "Unknown";
  }
  function customerName(id: string) {
    return customers.find((c) => c.id === id)?.name ?? "Unknown customer";
  }

  return (
    <div className="card">
      {pending.length === 0 && <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>No pending claim requests.</div>}
      {pending.map((r) => (
        <div key={r.id} style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2" }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{userName(r.requestedBy)} — {r.customerIds.length} customer(s)</div>
          <div style={{ fontSize: 13, color: "#3d4250", marginTop: 6, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {r.customerIds.map((customerId) => (
              <Link key={customerId} href={`/customers/${customerId}`} style={{ color: "inherit", textDecoration: "underline" }}>
                {customerName(customerId)}
              </Link>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "#9aa0ab", marginTop: 6 }}>{formatDate(r.createdAt)}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary" type="button" onClick={() => resolveBlastClaim(r.id, true)}>Approve</button>
            <button className="btn btn-outline" type="button" onClick={() => resolveBlastClaim(r.id, false)}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write `app/(dashboard)/team/blast-claims/page.tsx`**

```typescript
"use client";

import BlastClaimsBrowser from "@/components/BlastClaimsBrowser";

export default function TeamBlastClaimsPage() {
  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Blast Claims</div>
      <BlastClaimsBrowser />
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

1. Log in as the manager whose team includes the salesperson from Task 8. Navigate to `/team/blast-claims`. Confirm the claim request submitted in Task 8 appears, with clickable customer name links.
2. Click Approve. Confirm the row disappears, and in Supabase: `blast_claim_requests.status = 'APPROVED'`; the claimed customer(s) now have `assigned_to`/`assigned_to_2`/`assigned_to_3` (whichever was empty) set to the salesperson's id, and a notification was created for them.
3. Submit another claim request as the salesperson, this time for a customer whose area belongs to a *different* team than the manager's — confirm it still appears on this manager's `/team/blast-claims` (the cross-area exception).
4. Log in as a *different* manager (one whose team does not include this salesperson) and confirm `/team/blast-claims` shows nothing for that request — the `teamUserIds` filter keeps it scoped to the requester's own manager only.
5. Log in as ADMIN and confirm there is no admin route/page showing claim requests (admin deliberately has no UI for this).

- [ ] **Step 5: Commit**

```bash
git add components/BlastClaimsBrowser.tsx "app/(dashboard)/team/blast-claims/page.tsx"
git commit -m "Add manager blast-claim approval UI at /team/blast-claims

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: Nav wiring

**Files:**
- Modify: `components/MainNav.tsx`

**Interfaces:**
- Consumes: `useStore()` fields `blastItems`, `blastRequests`, `blastClaimRequests`; `visibleBlastItemsFor` from `lib/blasting.ts` (Task 3).
- Produces: nothing consumed elsewhere — this is the final integration point.

- [ ] **Step 1: Add the new store fields and helper import**

In `components/MainNav.tsx`, extend the existing `useStore()` destructure (currently `{ currentUser, removalRequests, customers, activities, assignmentEvents, users, tasks }`) to also pull `blastItems`, `blastRequests`, `blastClaimRequests`. Add the import:

```typescript
import { visibleBlastItemsFor } from "@/lib/blasting";
```

- [ ] **Step 2: Add the three badge computations**

Right after the existing `inactiveListingsCount` `useMemo` (around line 20-26), add:

```typescript
  // Salesperson's own badge: still-pending items on their currently
  // visible (unlocked, unexpired) blasting list.
  const myOpenBlastItemCount = useMemo(() => {
    if (!currentUser || currentUser.role !== "SALESPERSON") return 0;
    return visibleBlastItemsFor(blastItems, blastRequests, currentUser.id).filter((i) => i.status === "PENDING").length;
  }, [blastItems, blastRequests, currentUser]);

  // Manager's badge: pending claim requests from their own team.
  const pendingBlastClaimCount = useMemo(() => {
    if (!currentUser || currentUser.role !== "MANAGER") return 0;
    const teamUserIds = new Set(users.filter((u) => u.teamId === currentUser.teamId).map((u) => u.id));
    return blastClaimRequests.filter((r) => r.status === "PENDING" && teamUserIds.has(r.requestedBy)).length;
  }, [blastClaimRequests, users, currentUser]);

  // Admin's badge: every pending blast request awaiting approval --
  // matches the existing Remove Approvals badge convention.
  const pendingBlastRequestCount = useMemo(() => {
    if (!currentUser || currentUser.role !== "ADMIN") return 0;
    return blastRequests.filter((r) => r.status === "PENDING").length;
  }, [blastRequests, currentUser]);
```

- [ ] **Step 3: Add the tabs**

In the tabs-building block (around line 35-48), add role-specific tabs. The salesperson tab goes in the base `tabs` array (everyone-visible tabs are already there — but this one is SALESPERSON-only, so add it in the same conditional style as the `role !== "SALESPERSON"` block below, mirrored for this role):

```typescript
  const tabs: { href: string; label: string; active: boolean; badge?: number }[] = [
    { href: "/dashboard", label: "Dashboard", active: pathname.startsWith("/dashboard") },
    { href: "/customers", label: "Customers", active: pathname.startsWith("/customers") },
    { href: "/tasks", label: "To Do", active: pathname.startsWith("/tasks"), badge: openTaskCount },
    { href: "/inactive-listings", label: "Inactive Listings", active: pathname.startsWith("/inactive-listings"), badge: inactiveListingsCount },
  ];
  if (currentUser.role === "SALESPERSON") {
    tabs.push({ href: "/blasting", label: "Blasting", active: pathname.startsWith("/blasting"), badge: myOpenBlastItemCount });
  }
  if (currentUser.role !== "SALESPERSON") {
    const agentLogHref = currentUser.role === "ADMIN" ? "/admin/agent-logs" : "/team/agent-logs";
    const removeApprovalsHref = currentUser.role === "ADMIN" ? "/admin/remove-approvals" : "/team/remove-approvals";
    tabs.push(
      { href: agentLogHref, label: "Agent Log", active: pathname.startsWith(agentLogHref) },
      { href: removeApprovalsHref, label: "Remove Approvals", active: pathname.startsWith(removeApprovalsHref), badge: pendingRemovalCount }
    );
  }
  if (currentUser.role === "MANAGER") {
    tabs.push(
      { href: "/blast-requests", label: "Blast Requests", active: pathname.startsWith("/blast-requests") },
      { href: "/team/blast-claims", label: "Blast Claims", active: pathname.startsWith("/team/blast-claims"), badge: pendingBlastClaimCount }
    );
  }
  if (currentUser.role === "ADMIN") {
    tabs.push({ href: "/admin/blast-requests", label: "Blast Approvals", active: pathname.startsWith("/admin/blast-requests"), badge: pendingBlastRequestCount });
  }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Full manual verification (all roles)**

With the dev server running and Task 1's SQL already applied against Supabase:
1. As SALESPERSON: confirm a "Blasting" tab appears with a badge matching the count of PENDING items currently visible on `/blasting`.
2. As MANAGER: confirm "Blast Requests" (no badge) and "Blast Claims" (badge = pending claims for their team) both appear; clicking each navigates correctly.
3. As ADMIN: confirm "Blast Approvals" appears with a badge matching the pending-request count; no "Blast Requests"/"Blast Claims"/"Blasting" tabs show for admin.
4. Run through the full happy path end to end once more from a clean pending request: manager submits (`/blast-requests`) → admin approves with `approved_total` > 50 so a second batch exists (`/admin/blast-requests`) → salesperson sees batch 1 only, marks ~20% done via remark (`/blasting`) → reload and confirm batch 2 unlocks (this requires an ADMIN session to reload the app per the Global Constraints note, since the sweep is admin-only) → salesperson selects done items and requests claim → manager approves (`/team/blast-claims`) → confirm the customer is now assigned to that salesperson on `/customers/{id}`.

- [ ] **Step 6: Commit**

```bash
git add components/MainNav.tsx
git commit -m "Wire retargeting blasting nav tabs and badges into MainNav

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
