# Phase 3b — Move every reader of slot/pool/stage onto `customer.assignments`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every place that only *reads* a customer's assignees / pools / stages stops using the twelve flat fields (`assignedToUserId{,2,3}`, `pool{1,2,3}`, `pool{1,2,3}Since`, `stage{1,2,3}Id`) and reads `customer.assignments` (a list of seats) instead — with **no behavior change anywhere**.

**Architecture:** `Customer` gains `assignments: CustomerAssignment[]`. In this phase the list is **derived on the client** from the old flat fields (+ each user's current team) by `withSeats()` — so it is always identical to the flat fields, including optimistic updates, with no DB read, no realtime and no lag. Writers still write the flat fields. In Phase 3c the *source* of `assignments` flips to the `customer_assignments` table (one place: the store), the writers move over, and the flat fields are deleted — readers will not need to change again. The Phase 3a client-side DB load of `customer_assignments` is **removed** here (it would be unused; 3c re-adds it).

**Tech Stack:** TypeScript / React 18 / Next.js 15; `node --experimental-strip-types` self-check scripts.

**Part of:** `docs/superpowers/plans/2026-10-13-leader-rework-roadmap.md` (Phase 3b).

## Global Constraints

- **Zero behavior change.** Every converted reader must return exactly what it returned before for the same data. The existing `lib/*.check.ts` scripts are the regression net: their *assertions must not change* (only fixture builders do).
- Pure `lib/*.ts` files that are run by Node directly (`*.check.ts`, the Netlify function) must keep **type-only** imports from other lib files (runtime imports there need a `.ts` extension and the Netlify bundler is strict). So `autoSecondAssign.ts`, `inactiveListings.ts`, `dashboardMetrics.ts` read `c.assignments` inline and import nothing new at runtime.
- `assignments` is ordered by `slot` ascending and contains **only populated seats** (a seat exists iff its `userId` is non-null). `teamId` may be `null` in this phase (assignee with no team) — nothing in 3b reads it.
- Writers (`addCustomer`, `reassignCustomer`, `togglePool`, `logActivityAndStage`, `sweepStalePool`'s optimistic update, `resolveClientRemoval`, `resolveBlastClaim`) and the flat fields on `Customer` are **not touched** in this phase.
- `lib/store.tsx` reaches `Customer` objects through `customers` (now a derived, enriched list). `setCustomers` keeps working on the raw list.
- No schema/SQL changes in this phase. No database access during implementation.
- Type-check with `npx tsc --noEmit`; run every `lib/*.check.ts` that exists.

## File Structure

- Create: `lib/assignments.ts` (+ `lib/assignments.check.ts`) — derive seats + tiny reader helpers.
- Modify: `lib/types.ts`, `lib/mappers.ts`, `lib/store.tsx` — model + enrichment + remove 3a read-load.
- Modify: `lib/dashboardMetrics.ts`, `lib/inactiveListings.ts`, `lib/autoSecondAssign.ts`, `netlify/functions/sweep-auto-assign.mts`.
- Modify: `components/MainNav.tsx`, `components/CustomerListView.tsx`, `components/AgentLogBrowser.tsx`.
- Modify: `app/(dashboard)/customers/[id]/page.tsx`, `app/(dashboard)/dashboard/page.tsx`.
- Modify (fixture builders only): `lib/blasting.check.ts`, `lib/dashboardMetrics.check.ts`, `lib/inactiveListings.check.ts`, `lib/autoSecondAssign.check.ts`.

---

### Task 1: Model + helpers + fixtures

**Files:**
- Modify: `lib/types.ts` (`Customer` ~line 211-249; `CustomerAssignment` ~line 347-360)
- Modify: `lib/mappers.ts` (remove `mapCustomerAssignment` + its type import; add `assignments: []` to `mapCustomer`)
- Create: `lib/assignments.ts`, `lib/assignments.check.ts`
- Modify (builders): `lib/blasting.check.ts`, `lib/dashboardMetrics.check.ts`, `lib/inactiveListings.check.ts`, `lib/autoSecondAssign.check.ts`

**Interfaces:**
- Produces:
  - `Customer.assignments: CustomerAssignment[]`
  - `CustomerAssignment.teamId: string | null` (was `string`)
  - `seatsFromSlots(c: SlotFields, teamIdOf: (userId: string) => string | null): CustomerAssignment[]`
  - `withSeats(customers: Customer[], users: Pick<User, "id" | "teamId">[]): Customer[]` (returns copies whose `assignments` are derived)
  - Seat `id` format: `"<customerId>:<slot>"`.

- [ ] **Step 1: Write the failing check**

Create `lib/assignments.check.ts`:

```ts
// Self-check for assignments. Run with:
//   node --experimental-strip-types lib/assignments.check.ts
import assert from "node:assert";
import { seatsFromSlots, withSeats } from "./assignments.ts";
import type { Customer } from "./types.ts";

function slots(overrides: Partial<Customer> = {}) {
  return {
    id: "c1",
    assignedToUserId: null, assignedToUserId2: null, assignedToUserId3: null,
    pool1: null, pool2: null, pool3: null,
    pool1Since: null, pool2Since: null, pool3Since: null,
    stage1Id: null, stage2Id: null, stage3Id: null,
    ...overrides,
  };
}

// --- only populated slots become seats, in slot order, carrying pool/since/stage ---
{
  const seats = seatsFromSlots(
    slots({ assignedToUserId: "u1", pool1: "ACTIVE", stage1Id: "s1", assignedToUserId3: "u3", pool3: "INACTIVE", pool3Since: "2026-01-01T00:00:00Z", stage3Id: "s3" }),
    (id) => (id === "u1" ? "t1" : null)
  );
  assert.deepStrictEqual(seats.map((s) => s.slot), [1, 3], "empty slot 2 is skipped");
  assert.deepStrictEqual(seats[0], { id: "c1:1", customerId: "c1", teamId: "t1", slot: 1, userId: "u1", pool: "ACTIVE", poolSince: null, stageId: "s1" });
  assert.strictEqual(seats[1].teamId, null, "assignee with no team -> null teamId, seat is still kept");
  assert.strictEqual(seats[1].poolSince, "2026-01-01T00:00:00Z");
  assert.deepStrictEqual(seatsFromSlots(slots(), () => null), [], "no assignees -> no seats");
}

// --- a seat is kept even if its pool/stage are null (assigned but unpooled) ---
{
  const seats = seatsFromSlots(slots({ assignedToUserId2: "u2" }), () => "t");
  assert.strictEqual(seats.length, 1);
  assert.strictEqual(seats[0].pool, null);
  assert.strictEqual(seats[0].stageId, null);
}

// --- withSeats: derives per customer using each user's CURRENT team; does not mutate input ---
{
  const raw = [{ ...fullCustomer("c1"), assignedToUserId: "u1", assignedToUserId2: "u2" }, fullCustomer("c2")];
  const out = withSeats(raw, [{ id: "u1", teamId: "tA" }, { id: "u2", teamId: "tB" }]);
  assert.deepStrictEqual(out[0].assignments.map((s) => [s.userId, s.teamId]), [["u1", "tA"], ["u2", "tB"]]);
  assert.deepStrictEqual(out[1].assignments, []);
  assert.deepStrictEqual(raw[0].assignments, [], "input customers are not mutated");
}

function fullCustomer(id: string): Customer {
  return {
    id, name: "C", email: "", phone: "", assignments: [],
    stage1Id: null, stage2Id: null, stage3Id: null,
    assignedToUserId: null, assignedToUserId2: null, assignedToUserId3: null,
    pool1: null, pool2: null, pool3: null,
    pool1Since: null, pool2Since: null, pool3Since: null,
    sourceId: null, areaId: null, subAreaId: null, propertyTypeId: null, purposeId: null,
    businessIndustryId: null, businessCategoryId: null, businessTypeId: null,
    raceId: null, languageId: null, businessName: "",
    firsttimeBranchId: null, targetRaceId: null, targetTypeId: null, budgetMin: null, budgetMax: null,
    optionalPhone: "", remark: "", createdBy: null, createdByTeamId: null,
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  };
}

console.log("assignments.check.ts: all assertions passed");
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --experimental-strip-types lib/assignments.check.ts`
Expected: FAIL — `Cannot find module './assignments.ts'`.

- [ ] **Step 3: Types**

In `lib/types.ts`:
1. In `interface Customer`, after `updatedAt: string;` add:

```ts
  // Seats on this customer (one per populated slot, slot ascending).
  // Derived on the client from the flat slot fields above for now (see
  // lib/assignments.ts); Phase 3c makes the customer_assignments table the
  // source and removes the flat fields.
  assignments: CustomerAssignment[];
```

2. In `interface CustomerAssignment` change `teamId: string;` to `teamId: string | null;` and extend its leading comment with: `// teamId is null for an assignee who has no team.`

- [ ] **Step 4: Helpers**

Create `lib/assignments.ts`:

```ts
import type { Customer, CustomerAssignment, User } from "./types";

type SlotFields = Pick<
  Customer,
  | "id"
  | "assignedToUserId" | "assignedToUserId2" | "assignedToUserId3"
  | "pool1" | "pool2" | "pool3"
  | "pool1Since" | "pool2Since" | "pool3Since"
  | "stage1Id" | "stage2Id" | "stage3Id"
>;

/**
 * Seats of one customer, derived from its flat slot columns: one per
 * populated slot, slot ascending. `teamIdOf` resolves an assignee's team (null
 * when they have none). Same mapping the customer_assignments DB mirror uses
 * (seat number = slot number), minus its "no team => no row" rule.
 */
export function seatsFromSlots(c: SlotFields, teamIdOf: (userId: string) => string | null): CustomerAssignment[] {
  const slots = [
    { slot: 1 as const, userId: c.assignedToUserId, pool: c.pool1, poolSince: c.pool1Since, stageId: c.stage1Id },
    { slot: 2 as const, userId: c.assignedToUserId2, pool: c.pool2, poolSince: c.pool2Since, stageId: c.stage2Id },
    { slot: 3 as const, userId: c.assignedToUserId3, pool: c.pool3, poolSince: c.pool3Since, stageId: c.stage3Id },
  ];
  const seats: CustomerAssignment[] = [];
  for (const s of slots) {
    if (!s.userId) continue;
    seats.push({
      id: `${c.id}:${s.slot}`,
      customerId: c.id,
      teamId: teamIdOf(s.userId),
      slot: s.slot,
      userId: s.userId,
      pool: s.pool,
      poolSince: s.poolSince,
      stageId: s.stageId,
    });
  }
  return seats;
}

/** Copies of `customers` whose `assignments` are derived from the flat fields + each user's current team. */
export function withSeats(customers: Customer[], users: Pick<User, "id" | "teamId">[]): Customer[] {
  const teamOf = new Map(users.map((u) => [u.id, u.teamId]));
  return customers.map((c) => ({ ...c, assignments: seatsFromSlots(c, (id) => teamOf.get(id) ?? null) }));
}
```

- [ ] **Step 5: Mapper**

In `lib/mappers.ts`: delete the `mapCustomerAssignment` function and remove `CustomerAssignment` from the type import on line 1; in `mapCustomer`'s returned object, after `updatedAt: row.updated_at,` add `assignments: [],`.

- [ ] **Step 6: Fixture builders (4 files)**

Each of `lib/blasting.check.ts`, `lib/dashboardMetrics.check.ts`, `lib/inactiveListings.check.ts`, `lib/autoSecondAssign.check.ts` has a `function customer(overrides...)` that ends `return { ...fields, ...overrides };`. Change each so the seats are derived from whatever the test set on the flat fields (so no test body changes):

1. Add at the top of the file: `import { seatsFromSlots } from "./assignments.ts";`
2. Inside `customer()`, replace the `return { ...all fields..., ...overrides, };` with:

```ts
  const base: Customer = { ...<the same default fields>, assignments: [], ...overrides };
  return { ...base, assignments: overrides.assignments ?? seatsFromSlots(base, () => null) };
```

(Keep every default field exactly as it was; only add `assignments: []` to the literal and the derivation line. `autoSecondAssign.check.ts` / `inactiveListings.check.ts` already import types from `./types.ts` — keep that.)

- [ ] **Step 7: Run all checks and type-check**

Run:

```bash
node --experimental-strip-types lib/assignments.check.ts
node --experimental-strip-types lib/blasting.check.ts
node --experimental-strip-types lib/dashboardMetrics.check.ts
node --experimental-strip-types lib/inactiveListings.check.ts
node --experimental-strip-types lib/autoSecondAssign.check.ts
npx tsc --noEmit
```

Expected: the five checks print their "all assertions passed" line; `tsc` reports errors **only** in `lib/store.tsx` about `customerAssignments`/`mapCustomerAssignment`/`CustomerAssignment` import (fixed in Task 2) — nowhere else. (A `MODULE_TYPELESS_PACKAGE_JSON` warning is normal.)

- [ ] **Step 8: Commit**

```bash
git add lib/types.ts lib/mappers.ts lib/assignments.ts lib/assignments.check.ts lib/blasting.check.ts lib/dashboardMetrics.check.ts lib/inactiveListings.check.ts lib/autoSecondAssign.check.ts
git commit -m "Customer.assignments: derive seats from the slot fields (model + helpers)"
```

---

### Task 2: Store — enrich customers with seats, drop the unused 3a DB read

**Files:**
- Modify: `lib/store.tsx`

**Interfaces:**
- Consumes: `withSeats(customers, users)` from `lib/assignments.ts` (Task 1).
- Produces: `useStore().customers` and `visibleCustomers` are **enriched** (each has `assignments`); `customerAssignments` no longer exists on the store.

- [ ] **Step 1: Remove the Phase 3a read-only load**

Delete, in `lib/store.tsx`: `mapCustomerAssignment` from the `./mappers` import and `CustomerAssignment` from the `./types` import; the `customerAssignments: CustomerAssignment[];` line in `interface Store`; the `const [customerAssignments, setCustomerAssignments] = useState...` line; the whole `loadCustomerAssignments` function with its comment; **both** `await loadCustomerAssignments();` calls; the `setCustomerAssignments([]);` line in `logout`; `customerAssignments,` in the `value` object; and the comment line in the realtime `entries` array that begins `// customer_assignments: no live subscription yet`.

- [ ] **Step 2: Enrich**

Add the import `import { withSeats } from "./assignments";` next to the other `./` imports.

Replace

```ts
  const [customers, setCustomers] = useState<Customer[]>([]);
```

with

```ts
  const [rawCustomers, setCustomers] = useState<Customer[]>([]);
  // Customers as the rest of the app sees them: the raw rows plus a derived
  // `assignments` seat list (see lib/assignments.ts). Recomputed whenever a
  // customer or a user's team changes, so it can never go stale.
  const customers = useMemo(() => withSeats(rawCustomers, users), [rawCustomers, users]);
```

(`users` state is declared earlier in the component; if `useMemo` is not yet imported from `react`, add it.)

- [ ] **Step 3: Enrich the two lists that bypass state**

`sweepStalePool(loadedCustomers, ...)` is called with the raw list returned by `loadCustomers()` in two places (the init `useEffect` and `login`). In both calls replace `loadedCustomers` with `withSeats(loadedCustomers, loadedUsers)` (`loadedUsers` is in scope at both).

- [ ] **Step 4: Type-check and checks**

Run `npx tsc --noEmit` — Expected: clean. Run the five check scripts from Task 1 — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/store.tsx
git commit -m "Store: expose customers with derived seats; drop the unused customer_assignments read"
```

---

### Task 3: `dashboardMetrics.ts`

**Files:**
- Modify: `lib/dashboardMetrics.ts` (`slotsInScope` ~lines 13-23; `assignToAppointmentDuration` ~lines 354-361)

**Interfaces:** consumes `Customer.assignments`. No signature changes.

- [ ] **Step 1: `slotsInScope`**

Replace

```ts
function slotsInScope(c: Customer, scopedIds?: Set<string>): { stageId: string | null; userId: string | null }[] {
  const slots = [
    { stageId: c.stage1Id, userId: c.assignedToUserId },
    { stageId: c.stage2Id, userId: c.assignedToUserId2 },
    { stageId: c.stage3Id, userId: c.assignedToUserId3 },
  ];
  if (!scopedIds) return slots;
  return slots.filter((s) => s.userId !== null && scopedIds.has(s.userId));
}
```

with

```ts
function slotsInScope(c: Customer, scopedIds?: Set<string>): { stageId: string | null; userId: string | null }[] {
  const slots = c.assignments.map((s) => ({ stageId: s.stageId, userId: s.userId }));
  if (!scopedIds) return slots;
  return slots.filter((s) => s.userId !== null && scopedIds.has(s.userId));
}
```

(Unscoped callers no longer see an *empty* slot's leftover stage; empty slots have a null stage in practice — Task 9 has a SQL check for that.)

- [ ] **Step 2: `assignToAppointmentDuration`**

Replace

```ts
    const slots: { stageId: string | null; userId: string | null; slot: 1 | 2 | 3 }[] = [
      { stageId: c.stage1Id, userId: c.assignedToUserId, slot: 1 },
      { stageId: c.stage2Id, userId: c.assignedToUserId2, slot: 2 },
      { stageId: c.stage3Id, userId: c.assignedToUserId3, slot: 3 },
    ];
    for (const s of slots) {
```

with

```ts
    for (const s of c.assignments) {
```

(`s.userId`, `s.stageId`, `s.slot` have the same names below; nothing else in the loop changes.)

- [ ] **Step 3: Verify**

Run `node --experimental-strip-types lib/dashboardMetrics.check.ts` — Expected: "all checks passed". Run `npx tsc --noEmit` — Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add lib/dashboardMetrics.ts
git commit -m "dashboardMetrics: read seats from customer.assignments"
```

---

### Task 4: `inactiveListings.ts`

**Files:**
- Modify: `lib/inactiveListings.ts` (`computeSlotAges` loop ~lines 61-78)

**Interfaces:** consumes `Customer.assignments`. No signature changes.

- [ ] **Step 1: Replace the slot array**

Replace

```ts
  for (const c of customers) {
    (
      [
        { slot: 1 as const, pool: c.pool1, since: c.pool1Since, userId: c.assignedToUserId },
        { slot: 2 as const, pool: c.pool2, since: c.pool2Since, userId: c.assignedToUserId2 },
        { slot: 3 as const, pool: c.pool3, since: c.pool3Since, userId: c.assignedToUserId3 },
      ] as const
    ).forEach(({ slot, pool, since, userId }) => {
```

with

```ts
  for (const c of customers) {
    c.assignments.forEach(({ slot, pool, poolSince: since, userId }) => {
```

The body (`if (!pool || !userId) return; ... ages.push(...)`) and the closing `});` stay exactly as they are.

- [ ] **Step 2: Verify**

Run `node --experimental-strip-types lib/inactiveListings.check.ts` — Expected: "all assertions passed". `npx tsc --noEmit` — clean.

- [ ] **Step 3: Commit**

```bash
git add lib/inactiveListings.ts
git commit -m "inactiveListings: read seats from customer.assignments"
```

---

### Task 5: `autoSecondAssign.ts` and the Netlify sweep

**Files:**
- Modify: `lib/autoSecondAssign.ts`
- Modify: `netlify/functions/sweep-auto-assign.mts` (line 2 import, line 44)

**Interfaces:** consumes `Customer.assignments`. `secondAssignDueAt` / `isSecondAssignDue` customer param type becomes `Pick<Customer, "id" | "createdAt" | "assignments">`.

- [ ] **Step 1: `secondAssignDueAt` and `isSecondAssignDue`**

Change both signatures' `customer` type from `Pick<Customer, "id" | "createdAt" | "pool1Since" | "assignedToUserId">` to `Pick<Customer, "id" | "createdAt" | "assignments">`. In `secondAssignDueAt`, replace

```ts
  if (slot1Stage?.excludeFromAutoAssign) {
    const lastOwnActivity = activities
      .filter((a) => a.customerId === customer.id && a.authorUserId === customer.assignedToUserId)
      .reduce((max, a) => Math.max(max, new Date(a.createdAt).getTime()), 0);
    const lastTouched = Math.max(new Date(customer.pool1Since ?? customer.createdAt).getTime(), lastOwnActivity);
```

with

```ts
  if (slot1Stage?.excludeFromAutoAssign) {
    const slot1 = customer.assignments.find((s) => s.slot === 1);
    const lastOwnActivity = activities
      .filter((a) => a.customerId === customer.id && a.authorUserId === slot1?.userId)
      .reduce((max, a) => Math.max(max, new Date(a.createdAt).getTime()), 0);
    const lastTouched = Math.max(new Date(slot1?.poolSince ?? customer.createdAt).getTime(), lastOwnActivity);
```

- [ ] **Step 2: `computeAutoSecondAssignPlan`**

Replace

```ts
    if (c.assignedToUserId2 || !c.assignedToUserId || !c.areaId) continue;
```

with

```ts
    const slot1 = c.assignments.find((s) => s.slot === 1);
    if (c.assignments.some((s) => s.slot === 2) || !slot1 || !c.areaId) continue;
```

Replace `const slot1Stage = c.stage1Id ? stages.find((s) => s.id === c.stage1Id) : undefined;` with `const slot1Stage = slot1.stageId ? stages.find((s) => s.id === slot1.stageId) : undefined;`.

Replace `const excluded = [c.assignedToUserId, c.assignedToUserId3].filter((id): id is string => !!id);` with

```ts
    const excluded = [slot1.userId, c.assignments.find((s) => s.slot === 3)?.userId].filter((id): id is string => !!id);
```

Replace the `activeCount` filter

```ts
        const activeCount = customers.filter((other) =>
          (other.assignedToUserId === candidate.id && other.pool1 === "ACTIVE") ||
          (other.assignedToUserId2 === candidate.id && other.pool2 === "ACTIVE") ||
          (other.assignedToUserId3 === candidate.id && other.pool3 === "ACTIVE")
        ).length + (extraAssignedCount.get(candidate.id) ?? 0);
```

with

```ts
        const activeCount = customers.filter((other) =>
          other.assignments.some((s) => s.userId === candidate.id && s.pool === "ACTIVE")
        ).length + (extraAssignedCount.get(candidate.id) ?? 0);
```

Also update the doc comment above `secondAssignDueAt` only where it names `pool1Since` ("falling back to slot 1's pool-since/createdAt").

- [ ] **Step 3: Netlify function**

In `netlify/functions/sweep-auto-assign.mts`: add `import { withSeats } from "../../lib/assignments.ts";` after the `autoSecondAssign` import, and replace `const customers = (customerRows ?? []).map(mapCustomer);` with `const customers = withSeats((customerRows ?? []).map(mapCustomer), users);` (move it below the `const users = ...` line if it is not already after it — `users` must be defined first).

- [ ] **Step 4: Verify**

Run `node --experimental-strip-types lib/autoSecondAssign.check.ts` — Expected: "all assertions passed" (the assertions are unchanged; the fixture builder derives seats from `assignedToUserId`/`pool1Since` overrides). `npx tsc --noEmit` — clean.

- [ ] **Step 5: Commit**

```bash
git add lib/autoSecondAssign.ts netlify/functions/sweep-auto-assign.mts
git commit -m "autoSecondAssign: read seats from customer.assignments"
```

---

### Task 6: Components — `MainNav`, `CustomerListView`, `AgentLogBrowser`

**Files:**
- Modify: `components/MainNav.tsx` (`countDefaultStageFor`, ~lines 14-27)
- Modify: `components/CustomerListView.tsx` (~lines 115-117, 139, 156-160, 232-262, 276-281)
- Modify: `components/AgentLogBrowser.tsx` (lines 12-21)

- [ ] **Step 1: `MainNav.countDefaultStageFor`**

Replace

```ts
    return customers.filter((c) =>
      [
        { userId: c.assignedToUserId, stageId: c.stage1Id },
        { userId: c.assignedToUserId2, stageId: c.stage2Id },
        { userId: c.assignedToUserId3, stageId: c.stage3Id },
      ].some((slot) => slot.userId !== null && userIds.has(slot.userId) && slot.stageId === defaultStage.id)
    ).length;
```

with

```ts
    return customers.filter((c) => c.assignments.some((s) => userIds.has(s.userId) && s.stageId === defaultStage.id)).length;
```

- [ ] **Step 2: `CustomerListView`**

1. `assigneeIds` — replace the function with:

```ts
  function assigneeIds(c: Pick<Customer, "assignments">): string[] {
    return c.assignments.map((s) => s.userId);
  }
```

2. Stage filter (unified list branch) — replace `} else if (c.stage1Id !== searchStageId && c.stage2Id !== searchStageId && c.stage3Id !== searchStageId) {` with `} else if (!c.assignments.some((s) => s.stageId === searchStageId)) {`.
3. `myPool` — replace the 5-line ternary chain (`const myPool = c.assignedToUserId === currentUser.id ? c.pool1 : ... : null;`) with `const myPool = c.assignments.find((s) => s.userId === currentUser.id)?.pool ?? null;`.
4. `stageOrderOf` — replace

```ts
      : c.assignedToUserId ? c.stage1Id : c.assignedToUserId2 ? c.stage2Id : c.assignedToUserId3 ? c.stage3Id : null;
```

with `      : c.assignments[0]?.stageId ?? null;`.
5. `myStageId` body — replace the three `if (c.assignedToUserId… === currentUser.id) return c.stageNId;` lines + `return null;` with `return c.assignments.find((s) => s.userId === currentUser.id)?.stageId ?? null;` (keep the `if (!currentUser) return null;` line before it).
6. `stageBadgeNames` — replace its body with `return c.assignments.map((s) => stageNameOf(s.stageId));`.
7. `assigneeNames` — change the parameter type from the inline `{ assignedToUserId… }` object type to `Pick<Customer, "assignments">` (body unchanged).

- [ ] **Step 3: `AgentLogBrowser`**

Replace the two helper functions (lines 12-21) with:

```ts
function assigneeIds(c: Customer): string[] {
  return c.assignments.map((s) => s.userId);
}

function agentStageId(c: Customer, agentId: string): string | null {
  return c.assignments.find((s) => s.userId === agentId)?.stageId ?? null;
}
```

- [ ] **Step 4: Verify**

`npx tsc --noEmit` — Expected: clean. Grep the three files: no remaining `assignedToUserId`, `stage1Id`, `pool1` references.

- [ ] **Step 5: Commit**

```bash
git add components/MainNav.tsx components/CustomerListView.tsx components/AgentLogBrowser.tsx
git commit -m "MainNav, customer list, agent log: read seats from customer.assignments"
```

---

### Task 7: Pages — customer detail and dashboard

**Files:**
- Modify: `app/(dashboard)/customers/[id]/page.tsx` (~lines 153-173 and ~571-573)
- Modify: `app/(dashboard)/dashboard/page.tsx` (~lines 242 and 300)

- [ ] **Step 1: Customer detail — assigned users**

Replace

```tsx
  const assignedSlots: { slot: 1 | 2 | 3; userId: string | null }[] = [
    { slot: 1, userId: customer.assignedToUserId },
    { slot: 2, userId: customer.assignedToUserId2 },
    { slot: 3, userId: customer.assignedToUserId3 },
  ];
  const assignedUsers = assignedSlots
    .map(({ slot, userId }) => ({ slot, user: userId ? users.find((u) => u.id === userId) : undefined }))
    .filter((a): a is { slot: 1 | 2 | 3; user: NonNullable<typeof a.user> } => !!a.user);
```

with

```tsx
  const assignedUsers = customer.assignments
    .map((seat) => ({ slot: seat.slot, user: users.find((u) => u.id === seat.userId) }))
    .filter((a): a is { slot: 1 | 2 | 3; user: NonNullable<typeof a.user> } => !!a.user);
```

Then grep the file for other uses of `assignedSlots`; if any remain, replace each with the equivalent over `customer.assignments` (there should be none).

- [ ] **Step 2: Customer detail — pool/stage lookups**

Replace `poolOf` and `stageOf` bodies:

```tsx
  function poolOf(slot: 1 | 2 | 3) {
    return customer!.assignments.find((s) => s.slot === slot)?.pool ?? null;
  }

  function stageOf(slot: 1 | 2 | 3) {
    return customer!.assignments.find((s) => s.slot === slot)?.stageId ?? null;
  }
```

- [ ] **Step 3: Customer detail — reassign rows**

In the `rows` array change the three `current:` values to `customer.assignments.find((s) => s.slot === 1)?.userId ?? null` (slot 2 → `2`, slot 3 → `3`).

- [ ] **Step 4: Dashboard page**

Line ~242: replace `.filter((c) => [c.assignedToUserId, c.assignedToUserId2, c.assignedToUserId3].some((id) => id !== null && memberIds.has(id)))` with `.filter((c) => c.assignments.some((s) => memberIds.has(s.userId)))`.
Line ~300: replace `pipeline.customers.filter((c) => [c.assignedToUserId, c.assignedToUserId2, c.assignedToUserId3].includes(memberId))` with `pipeline.customers.filter((c) => c.assignments.some((s) => s.userId === memberId))`.

- [ ] **Step 5: Verify**

`npx tsc --noEmit` — Expected: clean. Grep both files: no remaining `assignedToUserId`, `stage1Id`, `pool1`.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/customers/[id]/page.tsx" "app/(dashboard)/dashboard/page.tsx"
git commit -m "Customer detail and dashboard: read seats from customer.assignments"
```

---

### Task 8: Store's own read-only helpers

**Files:**
- Modify: `lib/store.tsx` (`assigneeSlots` ~line 116; `deleteStage` ~line 1856; `assignmentError` ~lines 1870-1877)

- [ ] **Step 1: `assigneeSlots`** (used by `visibleCustomers`)

Replace its body: `return c.assignments.map((s) => s.userId);` (keep the name and signature `function assigneeSlots(c: Customer): string[]`).

- [ ] **Step 2: `deleteStage`**

Replace `const count = customers.filter((c) => c.stage1Id === id || c.stage2Id === id || c.stage3Id === id).length;` with `const count = customers.filter((c) => c.assignments.some((s) => s.stageId === id)).length;`.

Note: `deleteStage` was later reverted to the flat-field count (FK guard, see the comment in `lib/store.tsx`).

- [ ] **Step 3: `assignmentError`**

Replace the `.filter` callback body

```ts
      if (c.id === excludeCustomerId) return false;
      return (
        (c.assignedToUserId === userId && c.pool1 === pool) ||
        (c.assignedToUserId2 === userId && c.pool2 === pool) ||
        (c.assignedToUserId3 === userId && c.pool3 === pool)
      );
```

with

```ts
      if (c.id === excludeCustomerId) return false;
      return c.assignments.some((s) => s.userId === userId && s.pool === pool);
```

- [ ] **Step 4: Verify**

`npx tsc --noEmit` — clean. In `lib/store.tsx`, the only remaining uses of the flat fields must be inside the writers listed in Global Constraints (`addCustomer`, `reassignCustomer`, `togglePool`, `logActivityAndStage`, `sweepStalePool`, `resolveClientRemoval`, `resolveBlastClaim`): grep `assignedToUserId|pool1|stage1Id` and confirm each hit is in one of them.

- [ ] **Step 5: Commit**

```bash
git add lib/store.tsx
git commit -m "Store: read-only helpers use customer.assignments"
```

---

### Task 9: Verify

**Files:** none modified.

- [ ] **Step 1: Automated**

```bash
npx tsc --noEmit
node --experimental-strip-types lib/assignments.check.ts
node --experimental-strip-types lib/blasting.check.ts
node --experimental-strip-types lib/dashboardMetrics.check.ts
node --experimental-strip-types lib/inactiveListings.check.ts
node --experimental-strip-types lib/autoSecondAssign.check.ts
```

Expected: tsc clean, every check passes with its assertions **unchanged** from before this phase (`git diff <phase-start>..HEAD -- 'lib/*.check.ts'` shows only the builder lines and the new `assignments.check.ts`).

- [ ] **Step 2: Data pre-check — one SQL query for the user** (read-only; expected `0`)

```sql
select count(*) from customers
where (assigned_to   is null and (pool_1 is not null or stage_1 is not null))
   or (assigned_to_2 is null and (pool_2 is not null or stage_2 is not null))
   or (assigned_to_3 is null and (pool_3 is not null or stage_3 is not null));
```

(If non-zero, an empty slot carries a leftover stage/pool that the old unscoped dashboard funnel counted and the new one will not — tell the user the number before shipping.)

- [ ] **Step 3: Manual before/after** (user, in the app, after deploy — numbers must match what they saw before): as a leader — the `Customers` and `My Customers` red badges, the customer list (Assigned Agent(s) column, Stage badges, Stage filter, Assigned-To filter), My Customers Active/Potential tabs, the customer detail page's Assigned line / pool toggle / stage badge / reassign dropdowns; Dashboard pipeline funnel and member filter; Agent Log (counts and list); Inactive Listings count. As a salesperson: Customers list, badge, detail page.

- [ ] **Step 4: Report results to the user**, including any number that differs from before, with where it differs.
