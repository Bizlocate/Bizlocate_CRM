# Inactive Listings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-pull active-pool slots after 30 days of no log (mirroring the existing 60-day potential-pool pull), and add an "Inactive Listings" tab that warns before either pull fires (active day 25+, potential day 50+), scoped by role with Area/Member filters and a red nav badge.

**Architecture:** A new pure module (`lib/inactiveListings.ts`) computes per-slot staleness and viewer scoping once; both the existing background auto-pull sweep in `lib/store.tsx` and the new UI (browser component + nav badge) import from it. No new DB columns, no new Store methods — everything is derived client-side from data already loaded (`customers`, `activities`, `users`, `areas`).

**Tech Stack:** Next.js 15 (App Router, client components), TypeScript, no test framework — pure-logic modules ship a `node --experimental-strip-types` self-check file (see `lib/dashboardMetrics.check.ts` for the existing convention); UI-only changes are verified with `npx tsc --noEmit`.

## Global Constraints

- Active pool (`pool = "ACTIVE"`): auto-pull at 30 days no log; warn at 25 days no log.
- Potential pool (`pool = "INACTIVE"`, labeled "Potential Pool" in the UI): auto-pull at 60 days no log (unchanged, already correct); warn at 50 days no log.
- "No log" = no `Activity` row with `authorUserId` equal to the slot's assignee, on that customer, more recent than the anchor. Active pool's anchor is `customer.createdAt` (its `pool*Since` is always null — see `togglePool`, `lib/store.tsx:1786`). Potential pool's anchor is `pool*Since`.
- `/inactive-listings` is one shared route for every role (unlike Remove Approvals' separate `/admin/...` / `/team/...` routes) — a salesperson must land here too.
- Nav badge = red pill, same style as the existing Remove Approvals badge (`components/MainNav.tsx:49-53`).
- Area/Member filter dropdowns show a plain-text "Name (N)" count per option, same convention as `RemovalApprovalsBrowser`'s Area dropdown (`components/RemovalApprovalsBrowser.tsx:56-59`) — no colored badges inside `<select>`.
- No notification/email system is added — the tab + badge is the reminder.

---

### Task 1: Pure staleness module

**Files:**
- Create: `lib/inactiveListings.ts`
- Create: `lib/inactiveListings.check.ts`

**Interfaces:**
- Produces (used by Task 2 and Task 3):
  - `interface SlotAge { customerId: string; slot: 1 | 2 | 3; userId: string; pool: PoolStatus; daysStale: number }`
  - `computeSlotAges(customers: Customer[], activities: Activity[], now?: number): SlotAge[]`
  - `isStalePastPull(age: SlotAge): boolean`
  - `isWarnZone(age: SlotAge): boolean`
  - `scopeSlotAgesToViewer(ages: SlotAge[], users: Pick<User, "id" | "teamId">[], viewer: Pick<User, "id" | "role" | "teamId">): SlotAge[]`
  - `ACTIVE_WARN_DAYS = 25`, `ACTIVE_PULL_DAYS = 30`, `POTENTIAL_WARN_DAYS = 50`, `POTENTIAL_PULL_DAYS = 60`

- [ ] **Step 1: Write `lib/inactiveListings.ts`**

```typescript
import { Activity, Customer, PoolStatus, Role, User } from "./types";

export interface SlotAge {
  customerId: string;
  slot: 1 | 2 | 3;
  userId: string;
  pool: PoolStatus;
  daysStale: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const ACTIVE_WARN_DAYS = 25;
export const ACTIVE_PULL_DAYS = 30;
export const POTENTIAL_WARN_DAYS = 50;
export const POTENTIAL_PULL_DAYS = 60;

function lastOwnActivityMs(customerId: string, userId: string, activities: Activity[]): number {
  return activities
    .filter((a) => a.customerId === customerId && a.authorUserId === userId)
    .reduce((max, a) => Math.max(max, new Date(a.createdAt).getTime()), 0);
}

// A slot's "last touched" timestamp. ACTIVE has no pool*Since (only set on
// the transition to INACTIVE -- see togglePool in store.tsx), so its
// anchor is last-log-only (falling back to when the customer was created);
// INACTIVE anchors on when it entered the pool. Whichever activity/anchor
// is more recent wins, same rule the original 60-day sweep used.
function slotLastTouchedMs(pool: PoolStatus, since: string | null, createdAt: string, lastActivityMs: number): number {
  const anchor = pool === "INACTIVE" && since ? new Date(since).getTime() : new Date(createdAt).getTime();
  return Math.max(anchor, lastActivityMs);
}

/** One entry per non-empty, pooled assignee slot across all three slots of every customer. */
export function computeSlotAges(customers: Customer[], activities: Activity[], now: number = Date.now()): SlotAge[] {
  const ages: SlotAge[] = [];
  for (const c of customers) {
    (
      [
        { slot: 1 as const, pool: c.pool1, since: c.pool1Since, userId: c.assignedToUserId },
        { slot: 2 as const, pool: c.pool2, since: c.pool2Since, userId: c.assignedToUserId2 },
        { slot: 3 as const, pool: c.pool3, since: c.pool3Since, userId: c.assignedToUserId3 },
      ] as const
    ).forEach(({ slot, pool, since, userId }) => {
      if (!pool || !userId) return;
      const lastActivityMs = lastOwnActivityMs(c.id, userId, activities);
      const lastTouchedMs = slotLastTouchedMs(pool, since, c.createdAt, lastActivityMs);
      ages.push({ customerId: c.id, slot, userId, pool, daysStale: (now - lastTouchedMs) / DAY_MS });
    });
  }
  return ages;
}

function pullDaysFor(pool: PoolStatus): number {
  return pool === "ACTIVE" ? ACTIVE_PULL_DAYS : POTENTIAL_PULL_DAYS;
}

function warnDaysFor(pool: PoolStatus): number {
  return pool === "ACTIVE" ? ACTIVE_WARN_DAYS : POTENTIAL_WARN_DAYS;
}

/** Past the auto-pull threshold -- sweepStalePool clears these. */
export function isStalePastPull(age: SlotAge): boolean {
  return age.daysStale >= pullDaysFor(age.pool);
}

/** In the warning window: past the warn threshold, not yet pulled. */
export function isWarnZone(age: SlotAge): boolean {
  return age.daysStale >= warnDaysFor(age.pool) && age.daysStale < pullDaysFor(age.pool);
}

/**
 * Same scoping visibleCustomers already applies in store.tsx: ADMIN sees
 * everything, MANAGER sees only their own team's assignees, everyone else
 * (SALESPERSON) sees only their own slots.
 */
export function scopeSlotAgesToViewer(
  ages: SlotAge[],
  users: Pick<User, "id" | "teamId">[],
  viewer: Pick<User, "id" | "role" | "teamId">
): SlotAge[] {
  if (viewer.role === "ADMIN") return ages;
  if (viewer.role === "MANAGER") {
    const teamUserIds = new Set(users.filter((u) => u.teamId === viewer.teamId).map((u) => u.id));
    return ages.filter((a) => teamUserIds.has(a.userId));
  }
  return ages.filter((a) => a.userId === viewer.id);
}
```

- [ ] **Step 2: Write `lib/inactiveListings.check.ts`**

```typescript
// Self-check for inactiveListings. Run with:
//   node --experimental-strip-types lib/inactiveListings.check.ts
import assert from "node:assert";
import {
  ACTIVE_PULL_DAYS,
  ACTIVE_WARN_DAYS,
  POTENTIAL_PULL_DAYS,
  POTENTIAL_WARN_DAYS,
  computeSlotAges,
  isStalePastPull,
  isWarnZone,
  scopeSlotAgesToViewer,
} from "./inactiveListings.ts";
import type { Activity, Customer } from "./types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-04T00:00:00Z").getTime();

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
    optionalPhone: "", remark: "",
    createdAt: new Date(NOW - 100 * DAY_MS).toISOString(),
    updatedAt: new Date(NOW - 100 * DAY_MS).toISOString(),
    ...overrides,
  };
}

function activity(overrides: Partial<Activity> & { id: string; customerId: string; authorUserId: string; createdAt: string }): Activity {
  return { type: "CALL", content: "", followUp: "", author: "", time: "", ...overrides };
}

function daysAgo(n: number): string {
  return new Date(NOW - n * DAY_MS).toISOString();
}

// --- computeSlotAges: ACTIVE anchors on last own activity, else createdAt ---
{
  const c = customer({ id: "c1", assignedToUserId: "u1", pool1: "ACTIVE", createdAt: daysAgo(100) });
  const acts: Activity[] = [activity({ id: "a1", customerId: "c1", authorUserId: "u1", createdAt: daysAgo(27) })];
  const ages = computeSlotAges([c], acts, NOW);
  assert.strictEqual(ages.length, 1);
  assert.strictEqual(ages[0].pool, "ACTIVE");
  assert.ok(Math.abs(ages[0].daysStale - 27) < 0.01, `expected ~27 days stale, got ${ages[0].daysStale}`);
}

{
  // No activity at all -> falls back to customer.createdAt
  const c = customer({ id: "c2", assignedToUserId: "u1", pool1: "ACTIVE", createdAt: daysAgo(40) });
  const ages = computeSlotAges([c], [], NOW);
  assert.ok(Math.abs(ages[0].daysStale - 40) < 0.01);
}

// --- computeSlotAges: INACTIVE anchors on pool*Since vs last activity, latest wins ---
{
  const c = customer({ id: "c3", assignedToUserId2: "u2", pool2: "INACTIVE", pool2Since: daysAgo(70) });
  const acts: Activity[] = [activity({ id: "a2", customerId: "c3", authorUserId: "u2", createdAt: daysAgo(55) })];
  const ages = computeSlotAges([c], acts, NOW);
  const slot2 = ages.find((a) => a.slot === 2)!;
  assert.ok(Math.abs(slot2.daysStale - 55) < 0.01, `activity is more recent than pool2Since, should win: got ${slot2.daysStale}`);
}

// --- isStalePastPull / isWarnZone thresholds ---
{
  const activeJustUnder = { customerId: "x", slot: 1 as const, userId: "u", pool: "ACTIVE" as const, daysStale: ACTIVE_PULL_DAYS - 0.1 };
  const activeAtPull = { ...activeJustUnder, daysStale: ACTIVE_PULL_DAYS };
  const activeInWarn = { ...activeJustUnder, daysStale: ACTIVE_WARN_DAYS + 1 };
  const activeBeforeWarn = { ...activeJustUnder, daysStale: ACTIVE_WARN_DAYS - 1 };
  assert.strictEqual(isStalePastPull(activeJustUnder), false);
  assert.strictEqual(isStalePastPull(activeAtPull), true);
  assert.strictEqual(isWarnZone(activeInWarn), true);
  assert.strictEqual(isWarnZone(activeBeforeWarn), false);
  assert.strictEqual(isWarnZone(activeAtPull), false, "at the pull threshold it's pulled, not warned");

  const potentialInWarn = { customerId: "x", slot: 1 as const, userId: "u", pool: "INACTIVE" as const, daysStale: POTENTIAL_WARN_DAYS + 1 };
  const potentialAtPull = { ...potentialInWarn, daysStale: POTENTIAL_PULL_DAYS };
  assert.strictEqual(isWarnZone(potentialInWarn), true);
  assert.strictEqual(isStalePastPull(potentialAtPull), true);
  assert.strictEqual(isWarnZone(potentialAtPull), false);
}

// --- scopeSlotAgesToViewer ---
{
  const ages = [
    { customerId: "c1", slot: 1 as const, userId: "sales-a", pool: "ACTIVE" as const, daysStale: 26 },
    { customerId: "c2", slot: 1 as const, userId: "sales-b", pool: "ACTIVE" as const, daysStale: 26 },
    { customerId: "c3", slot: 1 as const, userId: "sales-c", pool: "ACTIVE" as const, daysStale: 26 },
  ];
  const users = [
    { id: "sales-a", teamId: "team-1" },
    { id: "sales-b", teamId: "team-1" },
    { id: "sales-c", teamId: "team-2" },
  ];
  assert.strictEqual(scopeSlotAgesToViewer(ages, users, { id: "admin-1", role: "ADMIN", teamId: null }).length, 3);
  const managerScoped = scopeSlotAgesToViewer(ages, users, { id: "mgr-1", role: "MANAGER", teamId: "team-1" });
  assert.deepStrictEqual(managerScoped.map((a) => a.userId).sort(), ["sales-a", "sales-b"]);
  const salesScoped = scopeSlotAgesToViewer(ages, users, { id: "sales-a", role: "SALESPERSON", teamId: "team-1" });
  assert.deepStrictEqual(salesScoped.map((a) => a.userId), ["sales-a"]);
}

console.log("inactiveListings.check.ts: all assertions passed");
```

- [ ] **Step 3: Run the self-check**

Run: `node --experimental-strip-types lib/inactiveListings.check.ts`
Expected: `inactiveListings.check.ts: all assertions passed` (no assertion errors).

- [ ] **Step 4: Commit**

```bash
git add lib/inactiveListings.ts lib/inactiveListings.check.ts
git commit -m "Add pure staleness-calc module for active/potential pool warn+pull

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Extend the auto-pull sweep to the active pool

**Files:**
- Modify: `lib/store.tsx:750-801` (the `sweepStalePool` function and its leading comment)

**Interfaces:**
- Consumes: `computeSlotAges`, `isStalePastPull` from `lib/inactiveListings.ts` (Task 1)
- No signature change to `sweepStalePool` itself — both existing call sites (`lib/store.tsx` initial-load effect and `login()`) keep working unmodified.

- [ ] **Step 1: Add the import**

In `lib/store.tsx`, near the top with the other local imports (after the `parseBusinessTagCsv` import), add:

```typescript
import { computeSlotAges, isStalePastPull } from "./inactiveListings";
```

- [ ] **Step 2: Replace the function body**

Replace lines 750-801 (the comment block + `sweepStalePool`) with:

```typescript
  // Auto-removal for both pools: any assignee slot (1, 2, or 3 -- all three
  // are nullable now that a customer can go unassigned) sitting stale for
  // 30+ days (active pool) or 60+ days (potential pool) with no activity
  // logged by that assignee gets cleared. No cron infra exists, so this
  // runs as a compute-on-load sweep scoped to what the current session is
  // allowed to touch: their own slots, or (for an admin) every slot.
  // Staleness calc lives in lib/inactiveListings.ts, shared with the
  // Inactive Listings warning tab (same thresholds, 5 days earlier).
  // ponytail: compute-on-load sweep, not real-time. Upgrade to a cron/edge
  // function sweep if sub-day precision ever matters.
  function sweepStalePool(customersList: Customer[], activitiesList: Activity[], forUserId: string, isAdmin: boolean) {
    const stale = computeSlotAges(customersList, activitiesList)
      .filter(isStalePastPull)
      .filter((age) => isAdmin || age.userId === forUserId)
      .map((age) => ({ customerId: age.customerId, slot: age.slot }));
    if (stale.length === 0) return;
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
    const supabase = createClient();
    for (const { customerId, slot } of stale) {
      const update = slot === 1
        ? { assigned_to: null, pool_1: null, pool_1_since: null, stage_1: null }
        : slot === 2
        ? { assigned_to_2: null, pool_2: null, pool_2_since: null, stage_2: null }
        : { assigned_to_3: null, pool_3: null, pool_3_since: null, stage_3: null };
      supabase.from("customers").update(update).eq("id", customerId).then(() => {});
    }
  }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `store.tsx` or `inactiveListings.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/store.tsx
git commit -m "sweepStalePool: also auto-pull active-pool slots after 30 days

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: InactiveListingsBrowser component

**Files:**
- Create: `components/InactiveListingsBrowser.tsx`

**Interfaces:**
- Consumes: `useStore()` (`customers`, `activities`, `users`, `areas`, `currentUser` — all already on the `Store` interface, no changes needed), plus `computeSlotAges`, `isWarnZone`, `scopeSlotAgesToViewer`, `SlotAge`, `ACTIVE_WARN_DAYS`, `POTENTIAL_WARN_DAYS` from `lib/inactiveListings.ts` (Task 1).
- Produces: default export `InactiveListingsBrowser` — a client component, no props (mirrors `RemovalApprovalsBrowser`'s no-props shape). Consumed by Task 4's page.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import {
  ACTIVE_WARN_DAYS,
  POTENTIAL_WARN_DAYS,
  SlotAge,
  computeSlotAges,
  isWarnZone,
  scopeSlotAgesToViewer,
} from "@/lib/inactiveListings";

/**
 * Warns before the active-pool 30-day / potential-pool 60-day auto-pull
 * sweep (sweepStalePool in lib/store.tsx) reaches a slot: active pool from
 * day 25, potential pool from day 50. One shared component behind the
 * single /inactive-listings route for every role -- scoping and the
 * Area/Member filters are computed client-side from currentUser, same
 * pattern RemovalApprovalsBrowser uses for its Area filter.
 */
export default function InactiveListingsBrowser() {
  const { customers, activities, users, areas, currentUser } = useStore();
  const [filterAreaId, setFilterAreaId] = useState("");
  const [filterUserId, setFilterUserId] = useState("");

  const scoped = useMemo(() => {
    if (!currentUser) return [];
    const ages = computeSlotAges(customers, activities).filter(isWarnZone);
    return scopeSlotAgesToViewer(ages, users, currentUser);
  }, [customers, activities, users, currentUser]);

  const showFilters = currentUser?.role !== "SALESPERSON";

  function areaIdOf(customerId: string) {
    return customers.find((c) => c.id === customerId)?.areaId ?? null;
  }
  function userName(userId: string) {
    return users.find((u) => u.id === userId)?.name ?? "Unknown";
  }
  function areaName(customerId: string) {
    return areas.find((a) => a.id === areaIdOf(customerId))?.name ?? "—";
  }
  function customerName(customerId: string) {
    return customers.find((c) => c.id === customerId)?.name ?? "Unknown customer";
  }
  function businessName(customerId: string) {
    return customers.find((c) => c.id === customerId)?.businessName || "—";
  }

  // Manager's dropdowns are scoped to their own team, same as
  // RemovalApprovalsBrowser's Area filter.
  const areaOptions = currentUser?.role === "MANAGER" ? areas.filter((a) => a.teamId === currentUser.teamId) : areas;
  const memberOptions = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === "MANAGER") return users.filter((u) => u.teamId === currentUser.teamId && u.role === "SALESPERSON");
    return users.filter((u) => u.role === "SALESPERSON");
  }, [users, currentUser]);

  const filtered = scoped.filter((age) => {
    if (filterAreaId && areaIdOf(age.customerId) !== filterAreaId) return false;
    if (filterUserId && age.userId !== filterUserId) return false;
    return true;
  });

  const activeRows = filtered.filter((a) => a.pool === "ACTIVE").sort((a, b) => b.daysStale - a.daysStale);
  const potentialRows = filtered.filter((a) => a.pool === "INACTIVE").sort((a, b) => b.daysStale - a.daysStale);

  function countForArea(areaId: string) {
    return scoped.filter((age) => areaIdOf(age.customerId) === areaId && (!filterUserId || age.userId === filterUserId)).length;
  }
  function countForMember(userId: string) {
    return scoped.filter((age) => age.userId === userId && (!filterAreaId || areaIdOf(age.customerId) === filterAreaId)).length;
  }
  const allAreasCount = scoped.filter((age) => !filterUserId || age.userId === filterUserId).length;
  const allMembersCount = scoped.filter((age) => !filterAreaId || areaIdOf(age.customerId) === filterAreaId).length;

  function Section({ title, rows }: { title: string; rows: SlotAge[] }) {
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>{title}</div>
        <div className="card">
          {rows.length === 0 && (
            <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>Nothing here.</div>
          )}
          {rows.map((r) => (
            <div key={`${r.customerId}-${r.slot}`} style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <Link href={`/customers/${r.customerId}`} style={{ color: "inherit" }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{customerName(r.customerId)} — {businessName(r.customerId)}</div>
                <div style={{ fontSize: 12, color: "#9aa0ab", marginTop: 3 }}>
                  {areaName(r.customerId)}
                  {showFilters ? ` · ${userName(r.userId)}` : ""}
                </div>
              </Link>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#a13a2b" }}>{Math.floor(r.daysStale)} days</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {showFilters && (
        <div style={{ marginBottom: 16, display: "flex", gap: 12 }}>
          <div style={{ maxWidth: 260, flex: 1 }}>
            <label className="field-label">Area</label>
            <select className="field-input" value={filterAreaId} onChange={(e) => setFilterAreaId(e.target.value)}>
              <option value="">All areas ({allAreasCount})</option>
              {areaOptions.map((a) => <option key={a.id} value={a.id}>{a.name} ({countForArea(a.id)})</option>)}
            </select>
          </div>
          <div style={{ maxWidth: 260, flex: 1 }}>
            <label className="field-label">Member</label>
            <select className="field-input" value={filterUserId} onChange={(e) => setFilterUserId(e.target.value)}>
              <option value="">All members ({allMembersCount})</option>
              {memberOptions.map((u) => <option key={u.id} value={u.id}>{u.name} ({countForMember(u.id)})</option>)}
            </select>
          </div>
        </div>
      )}
      <Section title={`Active Pool — ${ACTIVE_WARN_DAYS}+ days no update`} rows={activeRows} />
      <Section title={`Potential Pool — ${POTENTIAL_WARN_DAYS}+ days no update`} rows={potentialRows} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `InactiveListingsBrowser.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/InactiveListingsBrowser.tsx
git commit -m "Add InactiveListingsBrowser: active/potential warn lists with Area+Member filters

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Route + nav tab with badge

**Files:**
- Create: `app/(dashboard)/inactive-listings/page.tsx`
- Modify: `components/MainNav.tsx`

**Interfaces:**
- Consumes: `InactiveListingsBrowser` (Task 3); `computeSlotAges`, `isWarnZone`, `scopeSlotAgesToViewer` (Task 1).

- [ ] **Step 1: Write the page**

```tsx
"use client";

import InactiveListingsBrowser from "@/components/InactiveListingsBrowser";

export default function InactiveListingsPage() {
  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Inactive Listings</div>
      <InactiveListingsBrowser />
    </div>
  );
}
```

- [ ] **Step 2: Update `components/MainNav.tsx`**

Change the store destructure on line 8 from:

```typescript
  const { currentUser, removalRequests } = useStore();
```

to:

```typescript
  const { currentUser, removalRequests, customers, activities, users } = useStore();
```

Add this import at the top of the file, after the existing `useStore` import:

```typescript
import { computeSlotAges, isWarnZone, scopeSlotAgesToViewer } from "@/lib/inactiveListings";
```

After the existing `pendingRemovalCount` line (line 15), add:

```typescript
  // Same staleness calc InactiveListingsBrowser uses for its own rows --
  // see lib/inactiveListings.ts.
  const inactiveListingsCount = currentUser
    ? scopeSlotAgesToViewer(computeSlotAges(customers, activities).filter(isWarnZone), users, currentUser).length
    : 0;
```

Change the `tabs` array (currently lines 17-20) from:

```typescript
  const tabs: { href: string; label: string; active: boolean; badge?: number }[] = [
    { href: "/dashboard", label: "Dashboard", active: pathname.startsWith("/dashboard") },
    { href: "/customers", label: "Customers", active: pathname.startsWith("/customers") },
  ];
```

to:

```typescript
  const tabs: { href: string; label: string; active: boolean; badge?: number }[] = [
    { href: "/dashboard", label: "Dashboard", active: pathname.startsWith("/dashboard") },
    { href: "/customers", label: "Customers", active: pathname.startsWith("/customers") },
    { href: "/inactive-listings", label: "Inactive Listings", active: pathname.startsWith("/inactive-listings"), badge: inactiveListingsCount },
  ];
```

(Leave the `if (currentUser.role !== "SALESPERSON") { ... }` block below it untouched — Inactive Listings is unconditional, unlike Agent Log / Remove Approvals.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `MainNav.tsx` or the new page.

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev`, log in as a SALESPERSON, a MANAGER, and an ADMIN (three separate checks) and confirm:
- The "Inactive Listings" tab is visible in all three cases (unlike Agent Log/Remove Approvals, which only manager/admin see).
- Salesperson: no Area/Member filters shown; list (if any) only shows their own customers.
- Manager: Area/Member filters shown, scoped to their own team; badge count matches the number of rows across both sections.
- Admin: Area/Member filters cover every area/salesperson.
- Clicking a row navigates to `/customers/{id}`.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/inactive-listings/page.tsx" components/MainNav.tsx
git commit -m "Add Inactive Listings tab to nav with red badge count

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** active-pool 30-day auto-pull (Task 2), potential-pool 60-day auto-pull (unchanged, verified untouched by Task 2's diff), warn tab at day 25/50 in two blocks (Task 3), salesperson/manager/admin scoping + Area/Member filters (Task 3), red nav badge + per-option counts (Task 3 + Task 4) — all covered.
- **Placeholders:** none — every step has literal, complete code.
- **Type consistency:** `SlotAge`, `computeSlotAges`, `isStalePastPull`, `isWarnZone`, `scopeSlotAgesToViewer` are defined once in Task 1 and referenced with identical names/signatures in Tasks 2-4.
