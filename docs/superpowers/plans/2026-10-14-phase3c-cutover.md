# Phase 3c — Cutover: seats live in `customer_assignments`; leaders see all customers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `customer_assignments` becomes the single source of truth for who is assigned to a customer (each team has its own seats 1-3). Every write goes to it; the old flat slot columns on `customers` stop being written (and are dropped in Phase 4). New permission rules: a leader sees **all** customers but only **their own team's seats**, only **their own team members' activity logs**, and the **change log of every team**; ADMIN sees and does everything.

**Architecture:** Read path first (Task 1: the store loads `customer_assignments` and attaches the rows to each customer as `customer.assignments` — readers were already moved in 3b, so nothing else reads the flat fields). Then writers (Task 2) insert/update/delete seat rows directly; RLS + a guard trigger decide who may. One SQL cutover block (Task 6) drops the Phase 3a mirror, replaces every policy that depended on the flat columns, adds the seat guard/policies and a trigger that keeps `customers.updated_at` fresh. **App and SQL go live together** (runbook in Task 7): run the SQL, deploy immediately.

**Tech Stack:** Supabase Postgres (RLS, plpgsql), Next.js 15 / React 18 / TypeScript, `node --experimental-strip-types` check scripts.

**Part of:** `docs/superpowers/plans/2026-10-13-leader-rework-roadmap.md` (3c). Spec: `docs/superpowers/specs/2026-10-13-leader-open-customers-team-slots-design.md`.

## Global Constraints

- **Hard cutover, short window.** Until the SQL block runs, the app from this plan must NOT be deployed (it writes `customer_assignments` directly, which the old RLS forbids). Local commits and pushes to a branch are fine; **do not push to `origin/main` until the user has run the SQL** (Task 7).
- A person holds **at most one seat per customer** (`unique (customer_id, user_id)`); a seat's user must belong to the seat's team; seat numbers are 1-3 **per team** (`unique (customer_id, team_id, slot)`).
- Who may write seats: ADMIN any; MANAGER only seats of **their own team**; a seat's own user may update its pool/stage and delete (clear) their own seat; salespeople cannot insert seats. Reassigning a seat to another user = `update user_id` (ADMIN/MANAGER only); `customer_id`, `team_id`, `slot` never change except when a user moves team (trigger).
- Leaders see: all customers; only their own team's seats; activity logs only where the **author** is on their team (plus their own); change log of all customers; approvals (removal) only for their own team's seats.
- ADMIN is unscoped everywhere; never remove an `is_admin()` branch.
- The flat fields (`assignedToUserId*`, `pool*`, `stage*Id`) **stay on the `Customer` type and in `mapCustomer`** in this phase (stale, never read, never written) — removing them forces churn in all test fixtures and is Phase 4. Nothing in app code may read them after this phase (grep check in Task 7), except `mappers.ts`/`types.ts`/test fixtures.
- Seat writes use **client-generated ids** (`crypto.randomUUID()`) so an optimistic row and its Realtime echo are the same row.
- Removal order matters (RLS): log the removal + delete the assignee's activities **before** deleting the seat (kept from today).
- Schema changes are manual: a commented block at the end of `supabase/schema.sql`; the user runs the uncommented text in the Supabase SQL editor (inside the block's own `begin; … commit;`). Take a backup first (Task 7).
- No test framework: self-checks are `lib/*.check.ts` (`node --experimental-strip-types`), type-check with `npx tsc --noEmit`. The SQL cannot be run by agents; it is reviewed line by line and verified by the user (Task 7).

## File Structure

- Modify: `lib/assignments.ts` (+ `.check.ts`), `lib/types.ts`, `lib/mappers.ts`, `lib/store.tsx`
- Modify: `lib/dashboardMetrics.ts`, `lib/inactiveListings.ts` (+ their checks), `components/InactiveListingsBrowser.tsx`
- Modify: `app/(dashboard)/customers/[id]/page.tsx`
- Modify: `netlify/functions/sweep-auto-assign.mts`
- Modify (fixture builders): the four `lib/*.check.ts` with a `customer()` builder
- Modify: `supabase/schema.sql` (append the cutover block)

---

### Task 1: Read path — load `customer_assignments`, attach to customers

**Files:**
- Modify: `lib/assignments.ts`, `lib/assignments.check.ts`, `lib/types.ts`, `lib/mappers.ts`, `lib/store.tsx`
- Modify (builders): `lib/blasting.check.ts`, `lib/dashboardMetrics.check.ts`, `lib/inactiveListings.check.ts`, `lib/autoSecondAssign.check.ts`
- Modify: `netlify/functions/sweep-auto-assign.mts` (read side only)

**Interfaces:**
- Produces:
  - `CustomerAssignment.teamId: string` (non-null — the DB column is NOT NULL)
  - `attachSeats(customers: Customer[], seats: CustomerAssignment[]): Customer[]` — copies with `assignments` = that customer's seats sorted by `slot` then `teamId`
  - `seatsFromSlots(c, teamIdOf: (userId: string) => string): CustomerAssignment[]` (test support; flat fields → seats)
  - `mapCustomerAssignment(row)` in `lib/mappers.ts`
  - store-internal: state `customerAssignments`, `setCustomerAssignments`, `loadCustomerAssignments(): Promise<CustomerAssignment[]>`; `useStore().customers` / `visibleCustomers` carry `assignments` from the table.
  - `withSeats` is **removed**.

- [ ] **Step 1: Update the check first (failing)**

Replace the whole of `lib/assignments.check.ts` with:

```ts
// Self-check for assignments. Run with:
//   node --experimental-strip-types lib/assignments.check.ts
import assert from "node:assert";
import { attachSeats, seatsFromSlots } from "./assignments.ts";
import type { Customer, CustomerAssignment } from "./types.ts";

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

function seat(overrides: Partial<CustomerAssignment> & { id: string; customerId: string }): CustomerAssignment {
  return { teamId: "t1", slot: 1, userId: "u1", pool: "ACTIVE", poolSince: null, stageId: null, ...overrides };
}

// --- seatsFromSlots (test support): only populated slots, in slot order ---
{
  const seats = seatsFromSlots(
    slots({ assignedToUserId: "u1", pool1: "ACTIVE", stage1Id: "s1", assignedToUserId3: "u3", pool3: "INACTIVE", pool3Since: "2026-01-01T00:00:00Z", stage3Id: "s3" }),
    () => "t1"
  );
  assert.deepStrictEqual(seats.map((s) => s.slot), [1, 3], "empty slot 2 is skipped");
  assert.deepStrictEqual(seats[0], { id: "c1:1", customerId: "c1", teamId: "t1", slot: 1, userId: "u1", pool: "ACTIVE", poolSince: null, stageId: "s1" });
  assert.strictEqual(seats[1].poolSince, "2026-01-01T00:00:00Z");
  assert.deepStrictEqual(seatsFromSlots(slots(), () => "t1"), [], "no assignees -> no seats");
}

// --- attachSeats: groups by customer, sorts by slot then team, leaves customers without seats empty, does not mutate input ---
{
  const raw = [fullCustomer("c1"), fullCustomer("c2"), fullCustomer("c3")];
  const out = attachSeats(raw, [
    seat({ id: "a", customerId: "c1", teamId: "tB", slot: 2, userId: "u2" }),
    seat({ id: "b", customerId: "c1", teamId: "tA", slot: 2, userId: "u3" }),
    seat({ id: "c", customerId: "c1", teamId: "tA", slot: 1, userId: "u1" }),
    seat({ id: "d", customerId: "c2", teamId: "tA", slot: 1, userId: "u4" }),
    seat({ id: "e", customerId: "ghost", teamId: "tA", slot: 1, userId: "u5" }),
  ]);
  assert.deepStrictEqual(out[0].assignments.map((s) => s.id), ["c", "b", "a"], "slot asc, then team id");
  assert.deepStrictEqual(out[1].assignments.map((s) => s.id), ["d"]);
  assert.deepStrictEqual(out[2].assignments, [], "customer with no seats");
  assert.deepStrictEqual(raw[0].assignments, [], "input customers are not mutated");
}

console.log("assignments.check.ts: all assertions passed");
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --experimental-strip-types lib/assignments.check.ts`
Expected: FAIL — `attachSeats` is not exported.

- [ ] **Step 3: `lib/assignments.ts`**

Replace the whole file with:

```ts
import type { Customer, CustomerAssignment } from "./types";

type SlotFields = Pick<
  Customer,
  | "id"
  | "assignedToUserId" | "assignedToUserId2" | "assignedToUserId3"
  | "pool1" | "pool2" | "pool3"
  | "pool1Since" | "pool2Since" | "pool3Since"
  | "stage1Id" | "stage2Id" | "stage3Id"
>;

/**
 * TEST SUPPORT (the *.check.ts fixture builders): one seat per populated
 * flat slot, slot ascending, so fixtures can still be written with the old
 * slot fields. Production code never calls this -- seats come from the
 * customer_assignments table. Removed together with the flat fields in Phase 4.
 */
export function seatsFromSlots(c: SlotFields, teamIdOf: (userId: string) => string): CustomerAssignment[] {
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

/** Copies of `customers` whose `assignments` are that customer's seat rows (slot, then team, ascending). */
export function attachSeats(customers: Customer[], seats: CustomerAssignment[]): Customer[] {
  const byCustomer = new Map<string, CustomerAssignment[]>();
  for (const s of seats) {
    const list = byCustomer.get(s.customerId) ?? [];
    list.push(s);
    byCustomer.set(s.customerId, list);
  }
  return customers.map((c) => ({
    ...c,
    assignments: (byCustomer.get(c.id) ?? []).slice().sort((a, b) => a.slot - b.slot || a.teamId.localeCompare(b.teamId)),
  }));
}
```

- [ ] **Step 4: Types and mapper**

In `lib/types.ts`: in `interface CustomerAssignment` change `teamId: string | null;` to `teamId: string;`, delete the line `// teamId is null for an assignee who has no team.`, and replace the comment above the interface with:

```ts
// One assigned seat on a customer: which team holds it, which of that team's
// seats (1-3), who sits there, and that person's pool + stage on the
// customer. One row of the customer_assignments table.
```

In `lib/mappers.ts`: add `CustomerAssignment` to the type import on line 1 and append:

```ts
export function mapCustomerAssignment(row: {
  id: string;
  customer_id: string;
  team_id: string;
  slot: number;
  user_id: string;
  pool: PoolStatus | null;
  pool_since: string | null;
  stage_id: string | null;
}): CustomerAssignment {
  return {
    id: row.id,
    customerId: row.customer_id,
    teamId: row.team_id,
    slot: row.slot as 1 | 2 | 3,
    userId: row.user_id,
    pool: row.pool,
    poolSince: row.pool_since,
    stageId: row.stage_id,
  };
}
```

- [ ] **Step 5: Fixture builders (4 files)**

In `lib/blasting.check.ts`, `lib/dashboardMetrics.check.ts`, `lib/inactiveListings.check.ts`, `lib/autoSecondAssign.check.ts` the builder ends with `return { ...base, assignments: overrides.assignments ?? seatsFromSlots(base, () => null) };`. Change `() => null` to `() => "team-1"` in each. No other change.

- [ ] **Step 6: Store — load and attach**

In `lib/store.tsx`:

1. Imports: in the `./assignments` import replace `withSeats` with `attachSeats`; add `mapCustomerAssignment` to the `./mappers` import and `CustomerAssignment` to the `./types` import list.
2. After the `const [rawCustomers, setCustomers] = useState<Customer[]>([]);` line add `const [customerAssignments, setCustomerAssignments] = useState<CustomerAssignment[]>([]);` and change the derived memo to

```ts
  const customers = useMemo(() => attachSeats(rawCustomers, customerAssignments), [rawCustomers, customerAssignments]);
```

(update its comment: "the raw rows plus each customer's seats from customer_assignments (see lib/assignments.ts)").
3. After `loadChangeLog` add:

```ts
  async function loadCustomerAssignments(): Promise<CustomerAssignment[]> {
    const supabase = createClient();
    const { data } = await supabase.from("customer_assignments").select("*");
    const mapped = (data ?? []).map(mapCustomerAssignment);
    setCustomerAssignments(mapped);
    return mapped;
  }
```

4. In **both** load sequences (init `useEffect` and `login`), directly after `await loadChangeLog();` add `const loadedAssignments = await loadCustomerAssignments();`, and change the `sweepStalePool(withSeats(loadedCustomers, loadedUsers), …)` first argument to `attachSeats(loadedCustomers, loadedAssignments)`.
5. Realtime: in the `entries` array, after the `customers` entry add

```ts
      { table: "customer_assignments", setState: (fn) => setCustomerAssignments(fn), mapRow: mapCustomerAssignment, keyOf: (x) => x.id },
```

6. In `logout`, after `setCustomers([]);` add `setCustomerAssignments([]);`.
7. `visibleCustomers`: in the `MANAGER` branch replace the whole body with `return customers;` (the RLS decides what a leader receives; their *seats* are team-scoped by the DB, so nothing further to filter). Delete the now-unused `teamUserIds` line and, if `assigneeSlots` becomes unused, delete that helper too.

- [ ] **Step 7: Netlify function — read seats from the table**

In `netlify/functions/sweep-auto-assign.mts`: import `mapCustomerAssignment` (add to the `../../lib/mappers.ts` import) and `attachSeats` (replace the `withSeats` import with `attachSeats`). Add `supabase.from("customer_assignments").select("*"),` to the `Promise.all` (destructure as `{ data: seatRows, error: seatError }`), `if (seatError) throw seatError;`, and replace the `customers` line with

```ts
  const customers = attachSeats((customerRows ?? []).map(mapCustomer), (seatRows ?? []).map(mapCustomerAssignment));
```

- [ ] **Step 8: Verify**

Run the six checks (`assignments`, `blasting`, `dashboardMetrics`, `inactiveListings`, `autoSecondAssign`, `whatsapp`, `parseAreaCsv`, `parseBusinessTagCsv` — every `lib/*.check.ts`) and `npx tsc --noEmit`.
Expected: all pass, tsc clean. (Before the cutover SQL the 3a mirror keeps the table in sync with the old writers, so this task alone behaves like 3b.)

- [ ] **Step 9: Commit**

```bash
git add lib netlify
git commit -m "Seats now come from customer_assignments (read path); managers' visibleCustomers = all"
```

---

### Task 2: Store writers → seat rows

**Files:**
- Modify: `lib/store.tsx` (writers; the `Store` interface lines for `reassignCustomer` / `togglePool`)
- Modify: `app/(dashboard)/customers/[id]/page.tsx` (only the call sites of `togglePool` and `reassignCustomer`, minimal; the UI rework is Task 3)

**Interfaces:**
- Consumes: `customer.assignments`, `customerAssignments` state (Task 1).
- Produces (store API changes):
  - `reassignCustomer(customerId: string, teamId: string, slot: 1 | 2 | 3, userId: string | null): { ok: boolean; error?: string }`
  - `togglePool(customerId: string, userId: string, pool: PoolStatus): { ok: boolean; error?: string }`
  - `addCustomer`, `logActivityAndStage`, `requestClientRemoval`, `resolveClientRemoval`, `resolveBlastClaim`, `sweepStalePool` keep their signatures but write seats.

- [ ] **Step 1: Seat insert helper**

In `lib/store.tsx`, directly above `function logAssignmentEvent` add:

```ts
  // Seat writes go straight to customer_assignments; RLS plus the
  // protect_seat_row trigger decide who may. Ids are generated here so the
  // optimistic row and the Realtime echo of the same insert are one row.
  async function insertSeats(
    rows: { customerId: string; teamId: string; slot: 1 | 2 | 3; userId: string; stageId: string | null }[]
  ): Promise<boolean> {
    const seats: CustomerAssignment[] = rows.map((r) => ({
      id: crypto.randomUUID(),
      customerId: r.customerId,
      teamId: r.teamId,
      slot: r.slot,
      userId: r.userId,
      pool: "ACTIVE",
      poolSince: null,
      stageId: r.stageId,
    }));
    setCustomerAssignments((prev) => [...prev, ...seats]);
    const { error } = await createClient()
      .from("customer_assignments")
      .insert(seats.map((s) => ({ id: s.id, customer_id: s.customerId, team_id: s.teamId, slot: s.slot, user_id: s.userId, pool: s.pool, stage_id: s.stageId })));
    if (error) {
      setCustomerAssignments((prev) => prev.filter((s) => !seats.some((n) => n.id === s.id)));
      alert(`Could not save the assignment: ${error.message}`);
      return false;
    }
    return true;
  }

  // Shared failure path for seat updates/deletes: tell the user and re-sync from the DB.
  function seatWriteFailed(message: string) {
    alert(`Could not save the change: ${message}`);
    loadCustomerAssignments();
  }
```

- [ ] **Step 2: `reassignCustomer`**

Replace the whole function with:

```ts
  function reassignCustomer(customerId: string, teamId: string, slot: 1 | 2 | 3, userId: string | null) {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return { ok: false, error: "Customer not found." };
    const seat = customer.assignments.find((s) => s.teamId === teamId && s.slot === slot);
    if (userId && customer.assignments.some((s) => s.id !== seat?.id && s.userId === userId)) {
      return { ok: false, error: "The same person can't be assigned twice." };
    }
    if ((seat?.userId ?? null) === userId) return { ok: true };
    if (userId) {
      const error = assignmentError(userId, "ACTIVE", customerId);
      if (error) return { ok: false, error };
    }
    const supabase = createClient();
    if (!userId) {
      // clearing the seat (the seat exists: both null === null was handled above)
      setCustomerAssignments((prev) => prev.filter((s) => s.id !== seat!.id));
      supabase.from("customer_assignments").delete().eq("id", seat!.id).then(({ error }) => {
        if (error) seatWriteFailed(error.message);
      });
      return { ok: true };
    }
    // a newly (re)assigned seat always starts in the active pool at the default stage
    const defaultStage = stages.find((s) => s.isDefault) ?? stages[0];
    const stageId = defaultStage?.id ?? null;
    if (seat) {
      setCustomerAssignments((prev) => prev.map((s) => (s.id === seat.id ? { ...s, userId, pool: "ACTIVE", poolSince: null, stageId } : s)));
      supabase
        .from("customer_assignments")
        .update({ user_id: userId, pool: "ACTIVE", pool_since: null, stage_id: stageId })
        .eq("id", seat.id)
        .then(({ error }) => {
          if (error) seatWriteFailed(error.message);
        });
    } else {
      insertSeats([{ customerId, teamId, slot, userId, stageId }]);
    }
    logAssignmentEvent(customerId, userId, slot);
    return { ok: true };
  }
```

Update the `Store` interface line to `reassignCustomer: (customerId: string, teamId: string, slot: 1 | 2 | 3, userId: string | null) => { ok: boolean; error?: string };`.

- [ ] **Step 3: `togglePool`**

Replace the whole function with:

```ts
  function togglePool(customerId: string, userId: string, pool: PoolStatus) {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return { ok: false, error: "Customer not found." };
    const seat = customer.assignments.find((s) => s.userId === userId);
    if (!seat) return { ok: false, error: "This person has no seat on this customer." };
    if (currentUser?.role !== "ADMIN" && currentUser?.id !== userId) {
      return { ok: false, error: "Only the assignee or an admin can change this pool status." };
    }
    if (pool === "INACTIVE") {
      const error = assignmentError(userId, "INACTIVE", customerId);
      if (error) return { ok: false, error };
    }
    const since = pool === "INACTIVE" ? new Date().toISOString() : null;
    setCustomerAssignments((prev) => prev.map((s) => (s.id === seat.id ? { ...s, pool, poolSince: since } : s)));
    createClient()
      .from("customer_assignments")
      .update({ pool, pool_since: since })
      .eq("id", seat.id)
      .then(({ error }) => {
        if (error) seatWriteFailed(error.message);
      });
    return { ok: true };
  }
```

Update the `Store` interface line to `togglePool: (customerId: string, userId: string, pool: PoolStatus) => { ok: boolean; error?: string };`.

- [ ] **Step 4: `addCustomer`**

Replace the assignee validation block and the customer insert/after-insert code so that: (a) assignees are collected with their form field number; (b) each assignee's team is resolved; (c) the customer row is inserted **without** any `assigned_to*`/`pool_*`/`stage_*` columns; (d) seats are inserted afterwards.

Replace from `const assigneeIds = [input.assignedToUserId, ...` through the `for (const id of assigneeIds) { ... }` loop with:

```ts
    const assignees = [input.assignedToUserId, input.assignedToUserId2, input.assignedToUserId3]
      .map((userId, i) => ({ userId, field: (i + 1) as 1 | 2 | 3 }))
      .filter((a): a is { userId: string; field: 1 | 2 | 3 } => !!a.userId);
    if (new Set(assignees.map((a) => a.userId)).size !== assignees.length) return { ok: false, error: "The same person can't be assigned twice." };
    for (const a of assignees) {
      const error = assignmentError(a.userId, "ACTIVE");
      if (error) return { ok: false, error };
      if (!users.find((u) => u.id === a.userId)?.teamId) return { ok: false, error: `${users.find((u) => u.id === a.userId)?.name ?? "This person"} has no team, so can't be assigned.` };
    }
```

In the `.insert({ ... })` of the customer delete these nine keys: `assigned_to`, `assigned_to_2`, `assigned_to_3`, `pool_1`, `pool_2`, `pool_3`, `stage_1`, `stage_2`, `stage_3`.

Replace the three `if (input.assignedToUserId…) logAssignmentEvent(...)` lines (and keep the comment above them) with:

```ts
    // Seat number = the form field (1-3) when free in that person's team, else that team's next free number.
    const usedByTeam = new Map<string, Set<number>>();
    const seatRows = assignees.map((a) => {
      const teamId = users.find((u) => u.id === a.userId)!.teamId!;
      const used = usedByTeam.get(teamId) ?? new Set<number>();
      const slot = (!used.has(a.field) ? a.field : ([1, 2, 3] as const).find((n) => !used.has(n))!) as 1 | 2 | 3;
      used.add(slot);
      usedByTeam.set(teamId, used);
      return { customerId: data.id as string, teamId, slot, userId: a.userId, stageId: defaultStage.id as string | null };
    });
    if (seatRows.length > 0) {
      const saved = await insertSeats(seatRows);
      if (!saved) return { ok: false, error: "The customer was created but could not be assigned. Open it and assign again.", customerId: data.id as string };
      for (const r of seatRows) logAssignmentEvent(r.customerId, r.userId, r.slot);
    }
```

(The final `return { ok: true, customerId: data.id as string };` stays.)

- [ ] **Step 5: `sweepStalePool`**

Replace the `.map(...)` and everything after the `if (stale.length === 0) return;` line with:

```ts
    if (stale.length === 0) return;
    setCustomerAssignments((prev) => prev.filter((s) => !stale.some((x) => x.customerId === s.customerId && x.userId === s.userId)));
    const supabase = createClient();
    for (const { customerId, userId } of stale) {
      supabase.from("customer_assignments").delete().eq("customer_id", customerId).eq("user_id", userId).then(() => {});
    }
  }
```

and change the preceding `.map((age) => ({ customerId: age.customerId, slot: age.slot }));` to `.map((age) => ({ customerId: age.customerId, userId: age.userId }));`.

- [ ] **Step 6: `logActivityAndStage` (stage write)**

Replace the lines from `const stageKey = ...` through the `supabase.from("customers").update({ [stageColumn]: stageId })...` statement (keep `const supabase = createClient();` — declare it before use) with:

```ts
    const seat = customers.find((c) => c.id === customerId)?.assignments.find((s) => s.userId === currentUser.id);
    if (!seat) return;
    const stageChanged = seat.stageId !== stageId;
    setCustomerAssignments((prev) => prev.map((s) => (s.id === seat.id ? { ...s, stageId } : s)));
    const supabase = createClient();
    supabase.from("customer_assignments").update({ stage_id: stageId }).eq("id", seat.id).then(({ error }) => {
      if (error) seatWriteFailed(error.message);
    });
```

(The `if (stageChanged) { supabase.from("stage_events")... }` block and everything below stay; the `slot` parameter is still used for `stage_events`/`deal_closures`.)

- [ ] **Step 7: `resolveClientRemoval`**

Replace the `if (approve) { ... }` body:

```ts
    if (approve) {
      const seat = customers.find((x) => x.id === request.customerId)?.assignments.find((s) => s.userId === request.requestedBy);
      if (seat) {
        // log + delete before clearing: the RLS checks need the manager's team to still hold a seat
        const removedUser = users.find((u) => u.id === request.requestedBy);
        const reasonName = removalReasons.find((r) => r.id === request.reasonId)?.name;
        const logNote = [reasonName, request.note].filter(Boolean).join(": ");
        logAssignmentRemoval(request.customerId, seat.slot, removedUser?.name ?? "Unknown", logNote || undefined);
        deleteAssigneeActivities(request.customerId, request.requestedBy);
        reassignCustomer(request.customerId, seat.teamId, seat.slot, null);
      }
    }
```

- [ ] **Step 8: `resolveBlastClaim`**

Replace the line `const errors: string[] = [];` and the `for` loop body with:

```ts
    const errors: string[] = [];
    const requesterTeamId = users.find((u) => u.id === request.requestedBy)?.teamId;
    for (const customerId of request.customerIds) {
      const customer = customers.find((c) => c.id === customerId);
      if (!customer) {
        errors.push("A claimed customer could not be found.");
        continue;
      }
      if (!requesterTeamId) {
        errors.push(`${customer.name}: the requester has no team.`);
        continue;
      }
      const taken = new Set(customer.assignments.filter((s) => s.teamId === requesterTeamId).map((s) => s.slot));
      const emptySlot = ([1, 2, 3] as const).find((n) => !taken.has(n));
      if (!emptySlot) {
        errors.push(`${customer.name}: no empty assignee slot.`);
        continue;
      }
      const result = reassignCustomer(customerId, requesterTeamId, emptySlot, request.requestedBy);
      if (!result.ok) errors.push(`${customer.name}: ${result.error}`);
    }
```

- [ ] **Step 9: Detail page call sites (minimal)**

In `app/(dashboard)/customers/[id]/page.tsx`: change `handleTogglePool` to take a user id:

```tsx
  function handleTogglePool(userId: string, pool: "ACTIVE" | "INACTIVE") {
    const next = pool === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const result = togglePool(customer!.id, userId, next);
    if (!result.ok) alert(result.error ?? "Could not change pool status.");
  }
```

and at its call site (`onClick={() => handleTogglePool(slot, pool)}`) pass `user.id` instead of `slot`. For the reassign row call `reassignCustomer(customer.id, slot, value || null)` make a temporary compile-fixing change: pass the team of the seat being edited — replace with `reassignCustomer(customer.id, seatTeamId, slot, value || null)` and, **just above the `rows`/IIFE block**, add the placeholder `const seatTeamId = currentUser.role === "MANAGER" ? currentUser.teamId : customer.assignments[0]?.teamId ?? customer.createdByTeamId ?? null;` guarded: `if (!seatTeamId) return; ` is **not** possible in JSX — instead wrap the confirm handler body: `if (!seatTeamId) return;` as its first line. (Task 3 replaces this whole block; this step only keeps the file compiling.)

- [ ] **Step 10: Verify**

`npx tsc --noEmit` clean; all `lib/*.check.ts` pass. Grep `lib/store.tsx` for `assignedToUserId|pool1|pool2|pool3|stage1Id|stage2Id|stage3Id|assigned_to|pool_1|stage_1`: remaining hits must be only (a) the `addCustomer` input *type/parameter names* (`assignedToUserId?` etc. — the form's own field names), (b) the `logAssignmentRemoval` column label strings (`assigned_to`, `assigned_to_2`, `assigned_to_3` used as `field_key`).

- [ ] **Step 11: Commit**

```bash
git add lib/store.tsx "app/(dashboard)/customers/[id]/page.tsx"
git commit -m "Store writers: assign, reassign, pool, stage, sweep, removal and blast claim write customer_assignments"
```

---

### Task 3: Customer detail — reassign rows per team

**Files:**
- Modify: `app/(dashboard)/customers/[id]/page.tsx` (state near line ~108-120; the reassign block currently at ~562-634; the header Assigned line stays)

**Interfaces:**
- Consumes: `reassignCustomer(customerId, teamId, slot, userId)`, `teams` (already destructured from the store on this page), `customer.assignments`.
- Produces: nothing for later tasks.

- [ ] **Step 1: Team state**

With the other `useState` declarations (before the `if (!currentUser || !customer) return null;` early return) add:

```tsx
  const [adminSeatTeamId, setAdminSeatTeamId] = useState("");
```

- [ ] **Step 2: Replace the reassign block**

Delete the temporary `seatTeamId` placeholder added in Task 2 Step 9. Replace the whole `{(currentUser.role === "ADMIN" || currentUser.role === "MANAGER") && ( <div style={{ marginTop: 14, ...}}> ... </div> )}` block (the one that renders "Assigned {slot}:" rows and ends with `<div style={{ marginLeft: "auto", alignSelf: "center" }}>{createdByLabel}</div>`) with:

```tsx
      {(currentUser.role === "ADMIN" || currentUser.role === "MANAGER") && (() => {
        // Which team's three seats the rows show: a manager always their own;
        // an admin picks (default: the team that created the customer, else
        // the first team holding a seat, else the first team).
        const seatTeamId =
          currentUser.role === "MANAGER"
            ? currentUser.teamId
            : adminSeatTeamId || customer.createdByTeamId || customer.assignments[0]?.teamId || teams[0]?.id || null;
        const rowDefs = [
          { slot: 1 as const, value: reassignTo1, setValue: setReassignTo1 },
          { slot: 2 as const, value: reassignTo2, setValue: setReassignTo2 },
          { slot: 3 as const, value: reassignTo3, setValue: setReassignTo3 },
        ].map((r) => ({ ...r, current: customer.assignments.find((s) => s.teamId === seatTeamId && s.slot === r.slot)?.userId ?? null }));
        // a person can hold only one seat on a customer, whichever team's
        const heldByAnyone = customer.assignments.map((s) => s.userId);
        return (
          <div style={{ marginTop: 14, display: "flex", gap: 20, flexWrap: "wrap" }}>
            {currentUser.role === "ADMIN" && (
              <select
                className="field-input"
                style={{ width: "auto" }}
                value={seatTeamId ?? ""}
                onChange={(e) => {
                  setAdminSeatTeamId(e.target.value);
                  setReassignTo1(null);
                  setReassignTo2(null);
                  setReassignTo3(null);
                }}
              >
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            {seatTeamId && rowDefs.map(({ slot, value, setValue, current }) => {
              const options = users.filter(
                (u) => u.active && u.role !== "ADMIN" && u.teamId === seatTeamId && (u.id === current || !heldByAnyone.includes(u.id))
              );
              const currentUserObj = current ? users.find((u) => u.id === current) : undefined;
              return (
                <div key={slot} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#9aa0ab", fontWeight: 500 }}>Assigned {slot}:</span>
                  <select
                    className="field-input"
                    style={{ width: "auto" }}
                    value={value ?? current ?? ""}
                    onChange={(e) => setValue(e.target.value)}
                  >
                    <option value="">—</option>
                    {options.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  {value !== null && value !== (current ?? "") && (
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        const isRemoval = value === "" && !!current;
                        const removedName = currentUserObj?.name ?? "this assignee";
                        if (isRemoval && !window.confirm(`Remove ${removedName} from Assigned ${slot}? This permanently deletes their activity log for this customer — it can't be undone. (A "Removed" entry stays in Change History.)`)) return;
                        // log + delete before clearing: the RLS checks need the seat to still exist
                        if (isRemoval) {
                          logAssignmentRemoval(customer.id, slot, removedName);
                          deleteAssigneeActivities(customer.id, current!);
                        }
                        const result = reassignCustomer(customer.id, seatTeamId, slot, value || null);
                        if (!result.ok) {
                          alert(result.error ?? "Could not reassign customer.");
                          return;
                        }
                        setValue(null);
                      }}
                    >
                      Confirm
                    </button>
                  )}
                </div>
              );
            })}
            <div style={{ marginLeft: "auto", alignSelf: "center" }}>{createdByLabel}</div>
          </div>
        );
      })()}
```

(`useState` for `reassignTo1..3` already exists. `areas` may become unused on this page for this block only — it is still used by the profile selects, so leave the destructure.)

- [ ] **Step 3: Verify**

`npx tsc --noEmit` clean. Grep the page for `areaTeamIds`: zero hits.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/customers/[id]/page.tsx"
git commit -m "Customer detail: reassign rows are the viewer's team seats (admin picks the team)"
```

---

### Task 4: Pure libs — stop matching events by slot number alone

A slot number is now only unique **per team**, so two seats of one customer can share it. Events carry `userId`, which is unique per customer.

**Files:**
- Modify: `lib/dashboardMetrics.ts` (`latestAssignmentBefore` ~line 320; its callers ~354-358 and ~417)
- Modify: `lib/inactiveListings.ts` (`warnZoneSlotsFor` lines ~145-148)
- Modify: `components/InactiveListingsBrowser.tsx` (key at line ~90)
- Modify (only if their assertions now fail for data reasons): fixture DATA in `lib/dashboardMetrics.check.ts`, `lib/inactiveListings.check.ts`

**Interfaces:** `latestAssignmentBefore(assignmentEvents, customerId, userId: string | null, slot, beforeIso)` (module-private).

- [ ] **Step 1: `dashboardMetrics.ts`**

Replace `latestAssignmentBefore` with:

```ts
function latestAssignmentBefore(
  assignmentEvents: AssignmentEvent[],
  customerId: string,
  userId: string | null,
  slot: 1 | 2 | 3,
  beforeIso: string
): AssignmentEvent | null {
  const candidates = assignmentEvents.filter(
    (e) => e.customerId === customerId && e.slot === slot && (userId === null || e.userId === userId) && e.createdAt <= beforeIso
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, e) => (e.createdAt > latest.createdAt ? e : latest));
}
```

In `assignToAppointmentDuration` change the stage-event filter to `.filter((e) => e.customerId === c.id && e.slot === s.slot && e.userId === s.userId && appointmentStageIds.has(e.stageId))` and the call to `latestAssignmentBefore(assignmentEvents, c.id, s.userId, s.slot, enteredAppointment.createdAt)`. In `closedDurationBySource` change the call to `latestAssignmentBefore(assignmentEvents, d.customerId, d.userId, d.slot, d.createdAt)` (`DealClosure.userId` is `string | null`).

- [ ] **Step 2: `inactiveListings.ts`**

In `warnZoneSlotsFor` replace the `pending` set and the final filter with user-keyed ones:

```ts
  const pending = new Set(
    removalRequests.filter((r) => r.status === "PENDING").map((r) => `${r.customerId}|${r.requestedBy}`)
  );
  const ages = computeSlotAges(customers, activities, assignmentEvents, tasks, now).filter(isWarnZone);
  return scopeSlotAgesToViewer(ages, users, viewer).filter((a) => !pending.has(`${a.customerId}|${a.userId}`));
```

and change the `removalRequests` parameter type to `Pick<RemovalRequest, "customerId" | "requestedBy" | "status">[]`.

In `components/InactiveListingsBrowser.tsx` change the row key `${r.customerId}-${r.slot}` to `${r.customerId}-${r.userId}`.

- [ ] **Step 3: Verify**

Run `node --experimental-strip-types lib/dashboardMetrics.check.ts` and `lib/inactiveListings.check.ts`. If an assertion fails **only because a fixture event/removal request lacks the matching `userId`/`requestedBy`** of the seat it is meant for, fix the fixture DATA (never an assertion) and list each change in your report; any other failure: stop and report. `npx tsc --noEmit` clean.

- [ ] **Step 4: Commit**

```bash
git add lib components/InactiveListingsBrowser.tsx
git commit -m "Match assignment/stage/removal events by user, not slot number alone"
```

---

### Task 5: Netlify sweep writes a seat

**Files:**
- Modify: `netlify/functions/sweep-auto-assign.mts` (the per-action write, ~lines 51-60)

- [ ] **Step 1: Replace the customer update**

Replace the `supabase.from("customers").update({ assigned_to_2: ..., pool_2: "ACTIVE", pool_2_since: null, stage_2: action.stageId }).eq("id", action.customerId)` statement and its error handling (the `{ error: customerUpdateError }` block) with:

```ts
    const winnerTeamId = users.find((u) => u.id === action.winnerId)?.teamId;
    if (!winnerTeamId) {
      console.error(`sweep-auto-assign: winner ${action.winnerId} has no team, skipping customer ${action.customerId}`);
      continue;
    }
    const { error: seatInsertError } = await supabase.from("customer_assignments").insert({
      customer_id: action.customerId,
      team_id: winnerTeamId,
      slot: 2,
      user_id: action.winnerId,
      pool: "ACTIVE",
      stage_id: action.stageId,
    });
    if (seatInsertError) {
      console.error(`sweep-auto-assign: failed to assign customer ${action.customerId}:`, seatInsertError);
      continue;
    }
```

(Everything after it — the area pointer update and the `assignment_events` insert — stays.)

- [ ] **Step 2: Verify**

`npx tsc --noEmit` clean. Grep the file for `assigned_to|pool_2|stage_2`: zero hits.

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/sweep-auto-assign.mts
git commit -m "Auto second-assign sweep inserts a seat in the winner's team"
```

---

### Task 6: SQL — the cutover block

**Files:**
- Modify: `supabase/schema.sql` (append at the very end)

**Interfaces:** produces the DB behavior in "Global Constraints". Nothing else consumes it in code.

- [ ] **Step 1: Append the block**

Append to the end of `supabase/schema.sql` (the whole text below, every line commented with `-- `; keep this exact content):

```sql

-- ============================================================
-- Migration: Phase 3c CUTOVER — customer_assignments becomes the source of
-- truth for who is assigned to a customer; leaders see all customers.
-- Run ONCE, together with deploying the Phase 3c app (the old app and this
-- schema are not compatible). Runbook: docs/superpowers/plans/2026-10-14-phase3c-cutover.md Task 7.
--
-- STEP 0 (read-only; save the output of all four before running anything):
--   select schemaname, tablename, policyname, cmd, qual, with_check from pg_policies order by tablename, policyname;
--   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.prosrc ilike '%assigned_to%' order by 1;
--   select event_object_table, trigger_name from information_schema.triggers where trigger_schema = 'public' order by 1, 2;
--   select count(*) as seats from customer_assignments;   -- the Phase 3a mirror must be populated
-- Send me the first three before running the block: any policy or function
-- that mentions assigned_to / is_customer_assignee and is NOT replaced below
-- would silently go stale.
-- ============================================================
--
-- begin;
--
-- -- 1. one last sync from the old columns, then stop mirroring
-- do $$
-- declare
--   cid uuid;
-- begin
--   for cid in select id from customers loop
--     perform resync_customer_assignments(cid);
--   end loop;
-- end $$;
-- drop trigger if exists customers_resync_assignments on customers;
-- drop trigger if exists profiles_resync_assignments on profiles;
-- drop function if exists trg_customers_resync_assignments();
-- drop function if exists trg_profiles_resync_assignments();
-- drop function if exists resync_customer_assignments(uuid);
--
-- -- 2. a person holds at most one seat per customer
-- do $$
-- begin
--   if not exists (select 1 from pg_constraint where conname = 'customer_assignments_customer_user_key') then
--     alter table customer_assignments add constraint customer_assignments_customer_user_key unique (customer_id, user_id);
--   end if;
-- end $$;
--
-- -- 3. helpers
-- create or replace function is_manager() returns boolean as $$
--   select exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER');
-- $$ language sql security definer stable set search_path = public;
--
-- -- the caller holds a seat on the customer, or someone on the caller's team does
-- create or replace function is_customer_member(cid uuid) returns boolean as $$
--   select exists (
--     select 1 from customer_assignments ca
--     where ca.customer_id = cid and (ca.user_id = auth.uid() or ca.team_id = my_team_id())
--   );
-- $$ language sql security definer stable set search_path = public;
--
-- -- 4. seat guard: a seat never moves between customers/teams/seat numbers
-- -- (except via the team-move trigger below, i.e. nested trigger depth), and
-- -- its occupant must belong to the seat's team.
-- create or replace function protect_seat_row() returns trigger as $$
-- declare
--   holder_team uuid;
-- begin
--   if pg_trigger_depth() > 1 then
--     return new;
--   end if;
--   if tg_op = 'UPDATE' and (
--     new.customer_id is distinct from old.customer_id
--     or new.team_id is distinct from old.team_id
--     or new.slot is distinct from old.slot
--   ) then
--     raise exception 'a seat cannot be moved to another customer, team or seat number';
--   end if;
--   if tg_op = 'INSERT' or new.user_id is distinct from old.user_id then
--     select team_id into holder_team from profiles where id = new.user_id;
--     if holder_team is distinct from new.team_id then
--       raise exception 'the assignee must belong to the seat''s team';
--     end if;
--     if tg_op = 'UPDATE'
--       and (auth.jwt() ->> 'role') is distinct from 'service_role'
--       and not is_admin() and not is_manager() then
--       raise exception 'only an admin or manager can reassign a seat';
--     end if;
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- drop trigger if exists customer_assignments_protect on customer_assignments;
-- create trigger customer_assignments_protect
--   before insert or update on customer_assignments
--   for each row execute function protect_seat_row();
--
-- -- keep customers.updated_at fresh when a seat changes (the customer list's
-- -- "Last Updated" used to move on every assign / stage / pool change)
-- create or replace function trg_seat_touch_customer() returns trigger as $$
-- begin
--   update customers set updated_at = now() where id = coalesce(new.customer_id, old.customer_id);
--   return null;
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- drop trigger if exists customer_assignments_touch_customer on customer_assignments;
-- create trigger customer_assignments_touch_customer
--   after insert or update or delete on customer_assignments
--   for each row execute function trg_seat_touch_customer();
--
-- -- 5. seat policies: admin all; a manager their own team's seats; a person
-- -- their own seat (pool/stage/clear). Nobody else writes.
-- drop policy if exists "customer_assignments_select" on customer_assignments;
-- create policy "customer_assignments_select" on customer_assignments for select using (
--   is_admin() or team_id = my_team_id() or user_id = auth.uid()
-- );
-- drop policy if exists "customer_assignments_insert" on customer_assignments;
-- create policy "customer_assignments_insert" on customer_assignments for insert with check (
--   is_admin() or (is_manager() and team_id = my_team_id())
-- );
-- drop policy if exists "customer_assignments_update" on customer_assignments;
-- create policy "customer_assignments_update" on customer_assignments for update
--   using (is_admin() or user_id = auth.uid() or (is_manager() and team_id = my_team_id()))
--   with check (is_admin() or user_id = auth.uid() or (is_manager() and team_id = my_team_id()));
-- drop policy if exists "customer_assignments_delete" on customer_assignments;
-- create policy "customer_assignments_delete" on customer_assignments for delete using (
--   is_admin() or user_id = auth.uid() or (is_manager() and team_id = my_team_id())
-- );
--
-- -- 6. customers: every manager sees and edits every customer; the old
-- -- flat-column guards are no longer relevant (nothing writes those columns)
-- drop policy if exists "customers_select" on customers;
-- create policy "customers_select" on customers for select using (
--   is_admin() or is_manager() or is_customer_member(id) or has_open_blast_item(id)
-- );
-- drop policy if exists "customers_update" on customers;
-- create policy "customers_update" on customers for update using (
--   is_admin() or is_manager() or is_customer_member(id) or has_open_blast_item(id)
-- );
-- drop trigger if exists customers_protect_assignment on customers;
-- drop trigger if exists customers_protect_pool on customers;
--
-- -- 7. policies that used is_customer_assignee(assigned_to…) now use seats
-- -- activities: you read logs written by your own team (and your own); a
-- -- manager of team B never reads team A's logs on a shared customer
-- drop policy if exists "activities_select" on activities;
-- create policy "activities_select" on activities for select using (
--   is_admin()
--   or activities.user_id = auth.uid()
--   or (
--     activities.user_id in (select id from profiles where team_id = my_team_id())
--     and exists (select 1 from customers c where c.id = activities.customer_id)
--   )
-- );
-- drop policy if exists "activities_insert" on activities;
-- create policy "activities_insert" on activities for insert with check (
--   is_admin() or is_customer_member(activities.customer_id)
-- );
-- drop policy if exists "activities_delete" on activities;
-- create policy "activities_delete" on activities for delete using (
--   is_admin()
--   or (is_manager() and activities.user_id in (select id from profiles where team_id = my_team_id()))
-- );
--
-- drop policy if exists "tasks_insert" on tasks;
-- create policy "tasks_insert" on tasks for insert with check (
--   user_id = auth.uid()
--   and (is_admin() or is_customer_member(tasks.customer_id))
-- );
--
-- -- change log: every manager reads every team's; anyone who may edit may append
-- drop policy if exists "customer_change_log_select" on customer_change_log;
-- create policy "customer_change_log_select" on customer_change_log for select using (
--   is_admin() or is_manager()
-- );
-- drop policy if exists "customer_change_log_insert" on customer_change_log;
-- create policy "customer_change_log_insert" on customer_change_log for insert with check (
--   changed_by = auth.uid()
--   and (
--     is_admin() or is_manager()
--     or has_open_blast_item(customer_change_log.customer_id)
--     or is_customer_member(customer_change_log.customer_id)
--   )
-- );
--
-- drop policy if exists "deal_closures_select" on deal_closures;
-- create policy "deal_closures_select" on deal_closures for select using (
--   is_admin() or is_customer_member(deal_closures.customer_id)
-- );
-- drop policy if exists "deal_closures_insert" on deal_closures;
-- create policy "deal_closures_insert" on deal_closures for insert with check (
--   user_id = auth.uid()
--   and (is_admin() or is_customer_member(deal_closures.customer_id))
-- );
--
-- drop policy if exists "removal_requests_select" on removal_requests;
-- create policy "removal_requests_select" on removal_requests for select using (
--   is_admin() or requested_by = auth.uid() or is_customer_member(removal_requests.customer_id)
-- );
-- drop policy if exists "removal_requests_insert" on removal_requests;
-- create policy "removal_requests_insert" on removal_requests for insert with check (
--   requested_by = auth.uid()
--   and exists (
--     select 1 from customer_assignments ca
--     where ca.customer_id = removal_requests.customer_id
--       and ca.user_id = auth.uid()
--       and ca.slot = removal_requests.slot
--   )
-- );
-- drop policy if exists "removal_requests_update" on removal_requests;
-- create policy "removal_requests_update" on removal_requests for update using (
--   is_admin()
--   or (
--     is_manager()
--     and is_customer_member(removal_requests.customer_id)
--     and removal_requests.requested_by in (select id from profiles where team_id = my_team_id())
--   )
-- );
--
-- drop policy if exists "customer_delete_requests_insert" on customer_delete_requests;
-- create policy "customer_delete_requests_insert" on customer_delete_requests for insert with check (
--   requested_by = auth.uid()
--   and is_manager()
--   and is_customer_member(customer_delete_requests.customer_id)
-- );
--
-- drop policy if exists "stage_events_insert" on stage_events;
-- create policy "stage_events_insert" on stage_events for insert with check (
--   is_admin() or is_customer_member(stage_events.customer_id)
-- );
--
-- -- 8. a person changing team takes their seats along; a seat number already
-- -- taken in the new team on that customer moves to the next free one, and a
-- -- seat with no free number (or a person left without a team) is removed.
-- create or replace function trg_profiles_move_seats() returns trigger as $$
-- declare
--   s record;
--   free_slot int;
-- begin
--   if new.team_id is null then
--     delete from customer_assignments where user_id = new.id;
--     return null;
--   end if;
--   for s in select id, customer_id from customer_assignments where user_id = new.id loop
--     select min(n) into free_slot
--     from generate_series(1, 3) as n
--     where not exists (
--       select 1 from customer_assignments x
--       where x.customer_id = s.customer_id and x.team_id = new.team_id and x.slot = n
--     );
--     if free_slot is null then
--       delete from customer_assignments where id = s.id;
--     else
--       update customer_assignments set team_id = new.team_id, slot = free_slot where id = s.id;
--     end if;
--   end loop;
--   return null;
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- drop trigger if exists profiles_move_seats on profiles;
-- create trigger profiles_move_seats
--   after update of team_id on profiles
--   for each row
--   when (old.team_id is distinct from new.team_id)
--   execute function trg_profiles_move_seats();
--
-- commit;
--
-- -- Verify (seats = the STEP 0 count, or slightly more if people assigned in between; the other two = 0):
-- --   select count(*) as seats from customer_assignments;
-- --   select count(*) as policies_still_on_flat_columns from pg_policies
-- --     where qual ilike '%is_customer_assignee%' or with_check ilike '%is_customer_assignee%'
-- --        or qual ilike '%assigned_to%' or with_check ilike '%assigned_to%';
-- --   select count(*) as dup_seats from (select customer_id, user_id from customer_assignments group by 1,2 having count(*) > 1) d;
--
-- -- Rollback (only if something is badly wrong; data written to seats after the
-- -- cutover is NOT copied back to the old columns):
-- --   re-create the Phase 3a mirror (the "customer_assignments (Phase 3a)" block above),
-- --   re-create the policies/triggers you saved in STEP 0 (they are also in the main schema above),
-- --   drop trigger customer_assignments_protect / customer_assignments_touch_customer / profiles_move_seats,
-- --   run: select resync_customer_assignments(id) ... is NOT valid in reverse; restore the flat columns from a backup instead.
```

- [ ] **Step 1b: Append the post-cutover cleanup block** (a SEPARATE block after the one above; the user runs it a few days after the cutover, once the team is happy — it is not reversible without a backup)

```sql

-- ============================================================
-- Migration: Phase 3c cleanup — run a few days AFTER the cutover, once the
-- team is happy. Empties the frozen flat slot columns on customers so a
-- stale value can never be read, and so the old foreign keys from stage_1..3
-- to pipeline_stages stop blocking the deletion of a stage. Not reversible
-- without a backup. customers.updated_at is deliberately not touched.
-- ============================================================
--
-- begin;
-- alter table customers disable trigger customers_touch_updated_at;
-- update customers set
--   assigned_to = null, assigned_to_2 = null, assigned_to_3 = null,
--   pool_1 = null, pool_2 = null, pool_3 = null,
--   pool_1_since = null, pool_2_since = null, pool_3_since = null,
--   stage_1 = null, stage_2 = null, stage_3 = null;
-- alter table customers enable trigger customers_touch_updated_at;
-- commit;
```

- [ ] **Step 2: Verify**

Grep: the heading `Migration: Phase 3c CUTOVER` appears once; every non-blank line from it to EOF starts with `--`; the block contains `begin;` and `commit;` (commented).

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "Schema: Phase 3c cutover block (seats are the source of truth; leaders see all customers)"
```

- [ ] **Step 4: STOP — SQL review** (controller): an opus reviewer reads the block line by line against the current policies in the main schema and the Global Constraints before it goes to the user.

---

### Task 7: Final checks and the cutover runbook

**Files:** none modified (unless the final review finds something).

- [ ] **Step 1: Automated**

`npx tsc --noEmit` and every `lib/*.check.ts` pass. Grep the whole app (`app/`, `components/`, `lib/`, `netlify/`, excluding `lib/mappers.ts`, `lib/types.ts`, `lib/assignments.ts`, `*.check.ts`) for `assignedToUserId|pool1|pool2|pool3|stage1Id|stage2Id|stage3Id`: the only hits allowed are the `addCustomer` form/input names in `lib/store.tsx` and `app/(dashboard)/customers/page.tsx`.

- [ ] **Step 2: Runbook (the controller walks the user through it; do NOT push app code to `origin/main` before step 4)**

1. **Backup.** Supabase Dashboard → Database → Backups (note the latest restore point), and export `customers` and `customer_assignments` as CSV from the Table Editor.
2. **STEP 0 queries** from the SQL block; send me the output (policies, functions, triggers). I confirm nothing else depends on the flat columns.
3. **Pick a quiet time** (e.g. before work hours). Tell the team a 5-minute break is coming.
4. **Run the block** (uncommented) in the SQL editor, immediately **push `main`** (auto-deploy), wait for the deploy to finish, then ask everyone to hard-refresh (Ctrl+Shift+R).
5. **Smoke test, in this order,** as ADMIN then as a leader of team A then as a salesperson then as a leader of team B:
   - Leader A opens `Customers`: sees all customers (including ones only team B works); a customer team B works shows **no** team B seats to A; the red numbers are sensible.
   - Leader A assigns one of their members to a customer; leader B does the same to the same customer: both seats exist; each leader sees only their own; the salesperson sees only their own seat.
   - Salesperson logs an activity + stage; toggles Active/Potential; leader A sees the log; leader B does **not**; the change history of the customer shows edits of both teams to both leaders.
   - Salesperson requests removal → leader A approves → the seat disappears, log removed, "Removed" in Change History; leader B cannot approve it.
   - Blast claim approval gives the requester a seat in their team's first free number.
   - ADMIN sees every seat of every team and can reassign via the team picker.
   - Trigger the Netlify function once (Netlify → Functions → sweep-auto-assign → Run) or wait for the daily run: a due customer gets a second seat.
   - Move a test user to another team in `/admin/users`: their seats follow; verify with `select * from customer_assignments where user_id = '<id>'`.
6. **Verify queries** at the end of the SQL block (the three `Verify` lines) all good.
7. If anything is wrong: stop, tell me the exact symptom; do NOT improvise SQL.

- [ ] **Step 3: Report results to the user**, including any smoke-test step that failed, with the exact message.
