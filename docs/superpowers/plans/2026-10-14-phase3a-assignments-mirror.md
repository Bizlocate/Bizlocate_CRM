# Phase 3a — `customer_assignments` table, mirrored from the old slot columns

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `customer_assignments` table (one row per assigned seat: customer, team, seat 1-3, user, pool, stage), keep it automatically in sync with the existing `customers.assigned_to*/pool_*/stage_*` columns via database triggers, and load it into the app store — with **no behavior change** anywhere in the UI.

**Architecture:** The old columns stay authoritative. A security-definer function `resync_customer_assignments(customer_id)` rebuilds one customer's seat rows from those columns (team = the assignee's current team, seat number = the old slot number, so `(customer, team, seat)` can never collide). Triggers call it when a customer's assignment/pool/stage columns change and when a user changes team. The app only *reads* the new table (RLS: visible wherever the customer is visible; no client write policies). Later sub-phases (3b-3d) move readers and then writers onto it.

**Tech Stack:** Supabase Postgres (plpgsql), Next.js 15 / React 18 / TypeScript.

**Part of:** `docs/superpowers/specs/2026-10-13-leader-open-customers-team-slots-design.md`, Phase 3 (see `2026-10-13-leader-rework-roadmap.md` for the 3a-3d split).

## Global Constraints

- Zero behavior change: no existing screen, query, policy or trigger is modified. The new table is read-only for clients.
- Seat number = old slot number (`assigned_to` → 1, `assigned_to_2` → 2, `assigned_to_3` → 3); team = `profiles.team_id` of the assignee **at sync time**. Assignees with no team get no row (a `team_id` is required).
- `pool` values are `'ACTIVE'` / `'INACTIVE'` (the existing `PoolStatus`), nullable like the old columns.
- The migration must be re-runnable (idempotent) and must never be able to block normal customer/profile writes — keep trigger functions tiny and `security definer` with `set search_path = public`.
- Schema changes are manual: written as a commented block at the end of `supabase/schema.sql`; the user runs it by hand. The app code must work **before** the SQL is run (the new table is absent: loading it just yields nothing) so deploy order does not matter.
- No test framework: type-check with `npx tsc --noEmit`; DB verification is by the SQL queries in Task 3.

---

### Task 1: SQL — table, resync function, triggers, backfill, realtime

**Files:**
- Modify: `supabase/schema.sql` (append a commented migration block at the very end of the file)

**Interfaces:**
- Produces (DB): table `customer_assignments(id, customer_id, team_id, slot, user_id, pool, pool_since, stage_id)` with `unique (customer_id, team_id, slot)`; function `resync_customer_assignments(cid uuid)`; triggers `customers_resync_assignments` (on `customers`) and `profiles_resync_assignments` (on `profiles`); `customer_assignments` added to the `supabase_realtime` publication.

- [ ] **Step 1: Append the migration block**

Append to the end of `supabase/schema.sql`:

```sql

-- ============================================================
-- Migration: customer_assignments (Phase 3a) — one row per assigned seat
-- (customer, team, seat 1-3, user, pool, stage), mirrored automatically from
-- the old customers.assigned_to*/pool_*/stage_* columns by triggers. The app
-- only reads it for now; the old columns stay authoritative until the
-- Phase 3c cutover. Run once, in this order, against an already-provisioned
-- database. Safe to re-run.
--
-- STEP 0 (read-only, run first): list assignees that have no team — they get
-- no row (a team is required), so they will be missing from the mirror:
--   select p.id, p.name, count(*) as seats
--   from profiles p
--   join customers c on p.id in (c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--   where p.team_id is null
--   group by p.id, p.name;
-- Expected: no rows (or only users you are fine losing from the mirror).
-- ============================================================
--
-- create table if not exists customer_assignments (
--   id uuid primary key default gen_random_uuid(),
--   customer_id uuid not null references customers (id) on delete cascade,
--   team_id uuid not null references teams (id) on delete cascade,
--   slot int not null check (slot in (1, 2, 3)),
--   user_id uuid not null references profiles (id) on delete cascade,
--   pool text check (pool in ('ACTIVE', 'INACTIVE')),
--   pool_since timestamptz,
--   stage_id uuid references pipeline_stages (id) on delete set null,
--   unique (customer_id, team_id, slot)
-- );
-- create index if not exists customer_assignments_customer_idx on customer_assignments (customer_id);
-- create index if not exists customer_assignments_user_idx on customer_assignments (user_id);
--
-- alter table customer_assignments enable row level security;
-- -- visible wherever the customer itself is visible (customers' own RLS
-- -- applies inside the subquery); no client write policies on purpose --
-- -- only the security-definer triggers below write this table.
-- drop policy if exists "customer_assignments_select" on customer_assignments;
-- create policy "customer_assignments_select" on customer_assignments for select using (
--   is_admin()
--   or exists (select 1 from customers c where c.id = customer_assignments.customer_id)
-- );
--
-- -- Rebuilds one customer's seat rows from its old slot columns: drops rows
-- -- that no longer match, upserts the rest (so unchanged seats keep their id
-- -- and don't churn Realtime).
-- create or replace function resync_customer_assignments(cid uuid) returns void as $$
-- declare
--   c customers%rowtype;
-- begin
--   select * into c from customers where id = cid;
--   if not found then
--     return;
--   end if;
--
--   delete from customer_assignments ca
--   where ca.customer_id = cid
--     and not exists (
--       select 1
--       from (values (1, c.assigned_to), (2, c.assigned_to_2), (3, c.assigned_to_3)) as s(slot, uid)
--       join profiles p on p.id = s.uid
--       where s.slot = ca.slot and s.uid = ca.user_id and p.team_id = ca.team_id
--     );
--
--   insert into customer_assignments (customer_id, team_id, slot, user_id, pool, pool_since, stage_id)
--   select cid, p.team_id, s.slot, s.uid, s.pool, s.since, s.stage
--   from (values
--     (1, c.assigned_to,   c.pool_1, c.pool_1_since, c.stage_1),
--     (2, c.assigned_to_2, c.pool_2, c.pool_2_since, c.stage_2),
--     (3, c.assigned_to_3, c.pool_3, c.pool_3_since, c.stage_3)
--   ) as s(slot, uid, pool, since, stage)
--   join profiles p on p.id = s.uid and p.team_id is not null
--   on conflict (customer_id, team_id, slot) do update
--     set user_id = excluded.user_id,
--         pool = excluded.pool,
--         pool_since = excluded.pool_since,
--         stage_id = excluded.stage_id;
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- create or replace function trg_customers_resync_assignments() returns trigger as $$
-- begin
--   perform resync_customer_assignments(new.id);
--   return null;
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- drop trigger if exists customers_resync_assignments on customers;
-- create trigger customers_resync_assignments
--   after insert or update of
--     assigned_to, assigned_to_2, assigned_to_3,
--     pool_1, pool_2, pool_3,
--     pool_1_since, pool_2_since, pool_3_since,
--     stage_1, stage_2, stage_3
--   on customers
--   for each row execute function trg_customers_resync_assignments();
--
-- -- a user moving to another team takes their seats with them
-- create or replace function trg_profiles_resync_assignments() returns trigger as $$
-- declare
--   cid uuid;
-- begin
--   for cid in
--     select id from customers where new.id in (assigned_to, assigned_to_2, assigned_to_3)
--   loop
--     perform resync_customer_assignments(cid);
--   end loop;
--   return null;
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- drop trigger if exists profiles_resync_assignments on profiles;
-- create trigger profiles_resync_assignments
--   after update of team_id on profiles
--   for each row
--   when (old.team_id is distinct from new.team_id)
--   execute function trg_profiles_resync_assignments();
--
-- -- backfill every existing customer
-- do $$
-- declare
--   cid uuid;
-- begin
--   for cid in select id from customers loop
--     perform resync_customer_assignments(cid);
--   end loop;
-- end $$;
--
-- -- Realtime (run once; errors with "already member" if repeated — ignore)
-- alter publication supabase_realtime add table customer_assignments;
--
-- -- Rollback, if ever needed:
-- --   drop trigger if exists customers_resync_assignments on customers;
-- --   drop trigger if exists profiles_resync_assignments on profiles;
-- --   drop function if exists trg_customers_resync_assignments();
-- --   drop function if exists trg_profiles_resync_assignments();
-- --   drop function if exists resync_customer_assignments(uuid);
-- --   drop table if exists customer_assignments;
```

- [ ] **Step 2: Verify the block**

Run a Grep on `supabase/schema.sql`: the block appears once at the end of the file and every non-blank line after the heading starts with `--`.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "Schema: customer_assignments mirrored from the old slot columns (manual migration)"
```

- [ ] **Step 4: STOP — hand the SQL to the user** (controller step, not the implementer's)

Tell the user: run STEP 0 and send the result; then run the uncommented block in the Supabase SQL editor; then run the two verification queries in Task 3 and send the numbers. Local commits for Task 2 may proceed meanwhile; the app works with or without the table.

---

### Task 2: Load `customer_assignments` into the store (read-only, unused for now)

**Files:**
- Modify: `lib/types.ts` (add interface after `AssignmentEvent`, ~line 345)
- Modify: `lib/mappers.ts` (add `mapCustomerAssignment`; extend the type import on line 1)
- Modify: `lib/store.tsx` (import ~line 10 and type-import list ~line 14-40; `Store` interface ~line 426; state ~line 580; loader after `loadChangeLog` ~line 794; both load sequences — `await loadChangeLog();` appears twice, ~lines 979 and 1118; realtime entry ~line 1037; logout `setCustomers([])` ~line 1148; `value` object ~line 2655)

**Interfaces:**
- Produces:
  - `interface CustomerAssignment { id: string; customerId: string; teamId: string; slot: 1 | 2 | 3; userId: string; pool: PoolStatus | null; poolSince: string | null; stageId: string | null }` exported from `lib/types.ts`.
  - `mapCustomerAssignment(row): CustomerAssignment` exported from `lib/mappers.ts`.
  - `useStore().customerAssignments: CustomerAssignment[]` (RLS-scoped: only seats of customers visible to the viewer).

- [ ] **Step 1: Type**

In `lib/types.ts`, directly after the `AssignmentEvent` interface add:

```ts
// One assigned seat on a customer: which team holds it, which of that
// team's seats (1-3), who sits there, and that person's pool + stage on the
// customer. Mirrored from the customers table's old slot columns for now
// (see the customer_assignments migration in supabase/schema.sql).
export interface CustomerAssignment {
  id: string;
  customerId: string;
  teamId: string;
  slot: 1 | 2 | 3;
  userId: string;
  pool: PoolStatus | null;
  poolSince: string | null;
  stageId: string | null;
}
```

- [ ] **Step 2: Mapper**

In `lib/mappers.ts`, add `CustomerAssignment` to the type import on line 1 (alphabetical, after `Customer`), and append:

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

- [ ] **Step 3: Store wiring**

In `lib/store.tsx`:

1. Add `mapCustomerAssignment` to the `from "./mappers"` import (line ~10) and `CustomerAssignment` to the `from "./types"` import list.
2. In `interface Store`, after `customers: Customer[];` add `customerAssignments: CustomerAssignment[];`.
3. After the `const [changeLog, setChangeLog] = useState<CustomerChangeLogEntry[]>([]);` line add:

```ts
  const [customerAssignments, setCustomerAssignments] = useState<CustomerAssignment[]>([]);
```

4. After the `loadChangeLog` function add:

```ts
  // Read-only mirror of the customers' slot columns (see the
  // customer_assignments migration). If the table doesn't exist yet the
  // query just returns nothing and the app behaves exactly as before.
  async function loadCustomerAssignments(): Promise<CustomerAssignment[]> {
    const supabase = createClient();
    const { data } = await supabase.from("customer_assignments").select("*");
    const mapped = (data ?? []).map(mapCustomerAssignment);
    setCustomerAssignments(mapped);
    return mapped;
  }
```

5. In **both** load sequences, directly after `await loadChangeLog();` add `await loadCustomerAssignments();` (the init `useEffect` and `login`).
6. **Do not** add a realtime subscription for this table in this phase. All realtime entries share one channel; if `customer_assignments` is not yet in the `supabase_realtime` publication (e.g. app deployed before the SQL ran) Supabase can fail the whole channel and live sync for every table stops. Nothing reads the data yet, so Phase 3b adds the entry once the table is guaranteed to exist. (The SQL in Task 1 still adds the table to the publication.)

7. In `logout`, after `setCustomers([]);` add `setCustomerAssignments([]);`.
8. In the `value: Store = { ... }` object, after `customers,` add `customerAssignments,`.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/mappers.ts lib/store.tsx
git commit -m "Store: load customer_assignments (read-only mirror, not used yet)"
```

---

### Task 3: Verify (after the user has run the Task 1 SQL)

**Files:** none modified.

- [ ] **Step 1: DB check — the mirror matches the old columns** (user runs in the Supabase SQL editor; expected: `mirrored` equals `expected`)

```sql
select
  (select count(*) from customer_assignments) as mirrored,
  (select count(*)
     from customers c
     cross join lateral (values (c.assigned_to), (c.assigned_to_2), (c.assigned_to_3)) as v(uid)
     join profiles p on p.id = v.uid
     where p.team_id is not null) as expected;
```

- [ ] **Step 2: DB check — spot check pools/stages** (expected: `bad` = 0)

```sql
select count(*) as bad
from customer_assignments ca
join customers c on c.id = ca.customer_id
where not (
  (ca.slot = 1 and ca.user_id = c.assigned_to   and ca.pool is not distinct from c.pool_1 and ca.stage_id is not distinct from c.stage_1) or
  (ca.slot = 2 and ca.user_id = c.assigned_to_2 and ca.pool is not distinct from c.pool_2 and ca.stage_id is not distinct from c.stage_2) or
  (ca.slot = 3 and ca.user_id = c.assigned_to_3 and ca.pool is not distinct from c.pool_3 and ca.stage_id is not distinct from c.stage_3)
);
```

- [ ] **Step 3: Live trigger check** (user, with a test customer they can safely modify — or skip if none): reassign one seat or toggle one pool in the app, then re-run Step 1/2. Expected: still equal / 0. Also change a test user's team in `/admin/users` and confirm Step 1 still equal.

- [ ] **Step 4: App check** (after deploy): open any page signed in as ADMIN, open the browser Network tab, filter `customer_assignments`: the request returns 200 with one row per assigned seat. No visible change anywhere in the UI.

- [ ] **Step 5: Report results to the user**, including any query whose two numbers differ, with the numbers.
