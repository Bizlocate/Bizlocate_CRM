# Customer Identity Edit Lock + Change Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict editing a customer's `name`/`phone` to ADMIN/MANAGER (currently no one has an edit UI for them), and log every business-profile field change (including `name`/`phone`/`remark`) to a new `customer_change_log` table, visible to ADMIN/MANAGER on the customer detail page.

**Architecture:** One new append-only table (`customer_change_log`, RLS mirrors the existing `activities` pattern). One shared diff-and-log helper in `lib/store.tsx` wraps the three functions that already write to `customers` (`updateCustomerProfile`, `updateCustomerRemark`, and the new `updateCustomerIdentity`) so the logging logic exists exactly once. One new UI card on the existing customer detail page — no new route, no new admin tab.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Supabase (`@supabase/ssr` client via `createClient()`), existing `useStore()` context in `lib/store.tsx`. No test framework in this repo — verify via `npm run build` (type-check) plus manual click-through in the browser preview.

## Global Constraints

- `customer_change_log` rows store **display text**, not raw ids — a lookup field's old/new value is the resolved name (e.g. `"KL"`, not the area's uuid), so the log stays readable if a lookup entry is later renamed or deleted.
- `field_key` in `customer_change_log` is the **DB column name** (`source_id`, `business_name`, `name`, `phone`, `remark`, ...), not the store's camelCase key.
- Pipeline stage changes, pool toggles, and reassignment are explicitly **not** logged by this table — out of scope (per `docs/superpowers/specs/2026-08-31-identity-lock-and-change-log-design.md`).
- RLS: `customer_change_log` select is ADMIN (all rows) or MANAGER (rows for customers where an assignee shares the manager's team, via the existing `is_customer_assignee()` helper). Insert allowed for anyone who can already update that customer (any assignee, or admin) — a SALESPERSON's own edits are exactly what gets logged.
- Match existing code style exactly: inline `style={{...}}` objects, `.field-input`/`.card` utility classes, fire-and-forget `.then(() => {})` on writes, no new dependencies.

---

### Task 1: Schema — `customer_change_log` table + RLS

**Files:**
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: table `customer_change_log (id, customer_id, changed_by, field_key, old_value, new_value, created_at)`.

- [ ] **Step 1: Add the table to the main schema**

In `supabase/schema.sql`, insert this block right after the `create table activities (...)` block and before `create table tasks (...)` (search for `create table tasks` to find the exact spot):

```sql
create table customer_change_log (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  changed_by uuid not null references profiles (id),
  field_key text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 2: Add RLS**

Right after the existing `tasks_update` policy block and before the `-- notifications:` comment (search for `-- notifications: recipient only`), add:

```sql
-- customer_change_log: append-only, inherits customer visibility for insert;
-- select limited to admin (all) / manager (own team) — salesperson can write
-- but not read this log.
create policy "customer_change_log_select" on customer_change_log for select using (
  is_admin()
  or (
    exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
    and exists (
      select 1 from customers c
      where c.id = customer_change_log.customer_id
        and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
    )
  )
);
create policy "customer_change_log_insert" on customer_change_log for insert with check (
  is_admin()
  or exists (
    select 1 from customers c
    where c.id = customer_change_log.customer_id
      and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
  )
);
```

Then enable RLS on the table (add next to the other `alter table ... enable row level security;` lines, e.g. right before the `customer_change_log_select` policy above):

```sql
alter table customer_change_log enable row level security;
```

- [ ] **Step 3: Append the already-provisioned-database migration note**

At the very end of `supabase/schema.sql`, append (fully `--`-commented, matching every other migration block in this file exactly):

```sql

-- ============================================================
-- Migration: Customer identity edit lock + change log — run once
-- against an already-provisioned database (everything below already
-- exists in the main schema above for fresh installs).
-- ============================================================
--
-- create table customer_change_log (
--   id uuid primary key default gen_random_uuid(),
--   customer_id uuid not null references customers (id) on delete cascade,
--   changed_by uuid not null references profiles (id),
--   field_key text not null,
--   old_value text,
--   new_value text,
--   created_at timestamptz not null default now()
-- );
--
-- alter table customer_change_log enable row level security;
--
-- create policy "customer_change_log_select" on customer_change_log for select using (
--   is_admin()
--   or (
--     exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--     and exists (
--       select 1 from customers c
--       where c.id = customer_change_log.customer_id
--         and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--     )
--   )
-- );
-- create policy "customer_change_log_insert" on customer_change_log for insert with check (
--   is_admin()
--   or exists (
--     select 1 from customers c
--     where c.id = customer_change_log.customer_id
--       and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--   )
-- );
```

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "Schema: add customer_change_log table + RLS

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Types — `CustomerChangeLogEntry` + field label map

**Files:**
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: `export interface CustomerChangeLogEntry { id, customerId, fieldKey, oldValue, newValue, changedByName, changedByUserId, time, createdAt }`; `export const PROFILE_FIELD_LABELS: Record<string, string>`.

- [ ] **Step 1: Add the type and label map**

At the end of `lib/types.ts`, after the existing `Notification` interface, add:

```ts
export interface CustomerChangeLogEntry {
  id: string;
  customerId: string;
  fieldKey: string;
  oldValue: string | null;
  newValue: string | null;
  changedByName: string;
  changedByUserId: string;
  time: string;
  createdAt: string;
}

export const PROFILE_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  phone: "Phone",
  source_id: "Source",
  area_id: "Area",
  sub_area_id: "Subarea",
  property_type_id: "Property Type",
  purpose_id: "Purpose",
  business_industry_id: "Business Industry",
  business_category_id: "Business Category",
  business_type_id: "Business Type",
  race_id: "Race",
  language_id: "Language",
  business_name: "Business Name",
  firsttime_branch_id: "Firsttime / Branch",
  target_race_id: "Target Race",
  target_type_id: "Target Type",
  budget_id: "Budget",
  remark: "Remark",
};
```

- [ ] **Step 2: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds (this file has no consumers yet, so nothing else can break).

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "Add CustomerChangeLogEntry type + PROFILE_FIELD_LABELS map

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Store — load, diff-and-log helper, `updateCustomerIdentity`

**Files:**
- Modify: `lib/store.tsx`

**Interfaces:**
- Consumes: `CustomerChangeLogEntry`, `PROFILE_FIELD_LABELS` from `./types` (Task 2). Existing `Customer` type fields (`sourceId`, `areaId`, ... `name`, `phone`, `remark`) and existing lookup-array state (`leadSources`, `areas`, `subAreas`, `propertyTypes`, `purposes`, `businessTagIndustries`, `businessTagCategories`, `businessTagTypes`, `races`, `languages`, `firsttimeBranchTypes`, `targetRaces`, `targetTypes`, `budgets` — all already declared in this file).
- Produces: `changeLog: CustomerChangeLogEntry[]` (new store field, filtered by `customerId` at the call site same as `activities`), `updateCustomerIdentity(customerId: string, patch: { name?: string; phone?: string }) => void` (new store method). `updateCustomerProfile` and `updateCustomerRemark` keep their existing signatures — Task 4 calls them exactly as before.

- [ ] **Step 1: Import the new type**

In the `import { ... } from "./types";` block near the top of `lib/store.tsx`, add `CustomerChangeLogEntry` (keep alphabetical order — it goes right after `Customer,` and before `CsvBusinessTagPreview,`):

```ts
  Customer,
  CustomerChangeLogEntry,
  CsvBusinessTagPreview,
```

- [ ] **Step 2: Add the `mapChangeLog` function**

Right after the existing `mapActivity` function (ends at `lib/store.tsx:241` with `formatTimestamp`'s definition following it — insert `mapChangeLog` between `mapActivity`'s closing `}` and `mapTask`):

```ts
function mapChangeLog(row: {
  id: string;
  customer_id: string;
  field_key: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  created_at: string;
}, usersById: Map<string, User>): CustomerChangeLogEntry {
  return {
    id: row.id,
    customerId: row.customer_id,
    fieldKey: row.field_key,
    oldValue: row.old_value,
    newValue: row.new_value,
    changedByName: usersById.get(row.changed_by)?.name ?? "",
    changedByUserId: row.changed_by,
    time: formatTimestamp(row.created_at),
    createdAt: row.created_at,
  };
}
```

(All of these are top-level `function` declarations in the module, so exact ordering relative to `formatTimestamp` doesn't matter.)

- [ ] **Step 3: Add the `changeLog` state**

At `lib/store.tsx:401-403`, add a sibling state next to `activities`:

```ts
  const [activities, setActivities] = useState<Activity[]>([]);
  const [changeLog, setChangeLog] = useState<CustomerChangeLogEntry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
```

- [ ] **Step 4: Add `loadChangeLog`**

Right after the existing `loadActivities` function (`lib/store.tsx:571-578`), add:

```ts
  async function loadChangeLog(usersList: User[]): Promise<CustomerChangeLogEntry[]> {
    const supabase = createClient();
    const { data } = await supabase.from("customer_change_log").select("*").order("created_at", { ascending: false });
    const usersById = new Map(usersList.map((u) => [u.id, u]));
    const mapped = (data ?? []).map((row) => mapChangeLog(row, usersById));
    setChangeLog(mapped);
    return mapped;
  }
```

- [ ] **Step 5: Call `loadChangeLog` in both load paths**

In the `useEffect` initial-load block (`lib/store.tsx:641-679`), right after `const loadedActivities = await loadActivities(loadedUsers);`, add:

```ts
        await loadChangeLog(loadedUsers);
```

In the `login()` function (`lib/store.tsx:686-726`), right after `const loadedActivities = await loadActivities(loadedUsers);`, add the same line:

```ts
    await loadChangeLog(loadedUsers);
```

- [ ] **Step 6: Add the display-resolution + logging helper**

Right before `function updateCustomerStage` (`lib/store.tsx:1450`), add:

```ts
  // Business-profile field change log: resolves a raw stored value (a
  // lookup id, or a plain string for name/phone/businessName/remark) to
  // the human-readable text that gets written to customer_change_log, so
  // the log stays readable even if a lookup entry is later renamed.
  function resolveProfileFieldDisplay(key: string, value: unknown): string {
    if (value === null || value === undefined || value === "") return "";
    const str = String(value);
    const lookupByCamelKey: Record<string, { id: string; name: string }[]> = {
      sourceId: leadSources,
      areaId: areas,
      subAreaId: subAreas,
      propertyTypeId: propertyTypes,
      purposeId: purposes,
      businessIndustryId: businessTagIndustries,
      businessCategoryId: businessTagCategories,
      businessTypeId: businessTagTypes,
      raceId: races,
      languageId: languages,
      firsttimeBranchId: firsttimeBranchTypes,
      targetRaceId: targetRaces,
      targetTypeId: targetTypes,
      budgetId: budgets,
    };
    const list = lookupByCamelKey[key];
    if (list) return list.find((x) => x.id === str)?.name ?? str;
    return str;
  }

  // Shared by updateCustomerProfile / updateCustomerRemark / updateCustomerIdentity:
  // diffs `patch` (camelCase keys) against `before` (the pre-update Customer),
  // resolves each changed field to display text, and inserts one
  // customer_change_log row per field that actually changed.
  // `columnMap` maps each patch key to its DB column name (used as field_key).
  function logProfileChanges(
    customerId: string,
    columnMap: Record<string, string>,
    before: Record<string, unknown>,
    patch: Record<string, unknown>
  ) {
    if (!currentUser) return;
    const rows: { customer_id: string; changed_by: string; field_key: string; old_value: string | null; new_value: string | null }[] = [];
    for (const [key, newRaw] of Object.entries(patch)) {
      const column = columnMap[key];
      if (!column) continue;
      const oldDisplay = resolveProfileFieldDisplay(key, before[key]);
      const newDisplay = resolveProfileFieldDisplay(key, newRaw === "" ? null : newRaw);
      if (oldDisplay === newDisplay) continue;
      rows.push({
        customer_id: customerId,
        changed_by: currentUser.id,
        field_key: column,
        old_value: oldDisplay || null,
        new_value: newDisplay || null,
      });
    }
    if (rows.length === 0) return;
    const supabase = createClient();
    supabase
      .from("customer_change_log")
      .insert(rows)
      .select()
      .then(({ data, error }) => {
        if (!error && data) {
          const usersById = new Map(users.map((u) => [u.id, u]));
          setChangeLog((prev) => [...data.map((row) => mapChangeLog(row, usersById)), ...prev]);
        }
      });
  }
```

- [ ] **Step 7: Wire logging into `updateCustomerProfile`**

Replace the existing `updateCustomerProfile` function (`lib/store.tsx:1456-1482`):

```ts
  function updateCustomerProfile(customerId: string, patch: Partial<Omit<CustomerProfileInput, "remark">>) {
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
      budgetId: "budget_id",
    };
    const dbPatch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      const column = columnMap[key];
      if (column) dbPatch[column] = value === "" ? null : value;
    }
    const supabase = createClient();
    supabase.from("customers").update(dbPatch).eq("id", customerId).then(() => {});
  }
```

with:

```ts
  function updateCustomerProfile(customerId: string, patch: Partial<Omit<CustomerProfileInput, "remark">>) {
    const before = customers.find((c) => c.id === customerId);
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
      budgetId: "budget_id",
    };
    const dbPatch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      const column = columnMap[key];
      if (column) dbPatch[column] = value === "" ? null : value;
    }
    const supabase = createClient();
    supabase.from("customers").update(dbPatch).eq("id", customerId).then(() => {});
    if (before) logProfileChanges(customerId, columnMap, before as unknown as Record<string, unknown>, patch as Record<string, unknown>);
  }
```

(Only two additions: capturing `before` at the top, and the `logProfileChanges(...)` call at the end — the rest is unchanged.)

- [ ] **Step 8: Wire logging into `updateCustomerRemark`, add `updateCustomerIdentity`**

Replace the existing `updateCustomerRemark` function (`lib/store.tsx:1484-1488`):

```ts
  function updateCustomerRemark(customerId: string, remark: string) {
    setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, remark } : c)));
    const supabase = createClient();
    supabase.from("customers").update({ remark: remark || null }).eq("id", customerId).then(() => {});
  }
```

with:

```ts
  function updateCustomerRemark(customerId: string, remark: string) {
    const before = customers.find((c) => c.id === customerId);
    setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, remark } : c)));
    const supabase = createClient();
    supabase.from("customers").update({ remark: remark || null }).eq("id", customerId).then(() => {});
    if (before) logProfileChanges(customerId, { remark: "remark" }, before as unknown as Record<string, unknown>, { remark });
  }

  function updateCustomerIdentity(customerId: string, patch: { name?: string; phone?: string }) {
    const before = customers.find((c) => c.id === customerId);
    setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, ...patch } : c)));
    const dbPatch: Record<string, unknown> = {};
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.phone !== undefined) dbPatch.phone = patch.phone || null;
    const supabase = createClient();
    supabase.from("customers").update(dbPatch).eq("id", customerId).then(() => {});
    if (before) logProfileChanges(customerId, { name: "name", phone: "phone" }, before as unknown as Record<string, unknown>, patch as Record<string, unknown>);
  }
```

- [ ] **Step 9: Expose `changeLog` and `updateCustomerIdentity` on the `Store` interface**

In the `Store` interface (`lib/store.tsx:260-377`), add `changeLog: CustomerChangeLogEntry[];` right after `activities: Activity[];` (line 280):

```ts
  activities: Activity[];
  changeLog: CustomerChangeLogEntry[];
  tasks: Task[];
```

And add `updateCustomerIdentity` right after `updateCustomerProfile` in the method list (line 366):

```ts
  updateCustomerProfile: (customerId: string, patch: Partial<Omit<CustomerProfileInput, "remark">>) => void;
  updateCustomerIdentity: (customerId: string, patch: { name?: string; phone?: string }) => void;
  updateCustomerRemark: (customerId: string, remark: string) => void;
```

- [ ] **Step 10: Add both to the context value object**

In the `const value: Store = { ... }` object (`lib/store.tsx:1569-1671`), add `changeLog,` right after `activities,` (line 1589):

```ts
    activities,
    changeLog,
    tasks,
```

And add `updateCustomerIdentity,` right after `updateCustomerProfile,` (line 1663):

```ts
    updateCustomerProfile,
    updateCustomerIdentity,
    updateCustomerRemark,
```

- [ ] **Step 11: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors in `lib/store.tsx`.

- [ ] **Step 12: Commit**

```bash
git add lib/store.tsx
git commit -m "Store: load customer_change_log, log profile/identity/remark edits, add updateCustomerIdentity

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: UI — editable name/phone gate + Change History card

**Files:**
- Modify: `app/(dashboard)/customers/[id]/page.tsx`

**Interfaces:**
- Consumes: `changeLog: CustomerChangeLogEntry[]`, `updateCustomerIdentity` from `useStore()` (Task 3); `PROFILE_FIELD_LABELS` from `@/lib/types` (Task 2).
- Produces: nothing consumed elsewhere — this task is self-contained.

- [ ] **Step 1: Import `PROFILE_FIELD_LABELS` and destructure new store fields**

Change the types import:

```tsx
import { ACTIVITY_STYLES, Activity, ActivityType, PROFILE_FIELD_LABELS } from "@/lib/types";
```

In the `useStore()` destructure, add `changeLog` (next to `activities`) and `updateCustomerIdentity` (next to `updateCustomerProfile`):

```tsx
    activities,
    changeLog,
    tasks,
    updateCustomerStage,
    updateCustomerProfile,
    updateCustomerIdentity,
    updateCustomerRemark,
```

- [ ] **Step 2: Add `canEditIdentity` and name/phone draft state**

Right after the existing `const canEditRemark = ...` line (currently `lib/app/(dashboard)/customers/[id]/page.tsx:106`), add:

```tsx
  const canEditIdentity = currentUser.role === "ADMIN" || currentUser.role === "MANAGER";
```

In the state declarations near the top of the component (next to `businessNameDraft`/`remarkDraft`), add:

```tsx
  const [nameDraft, setNameDraft] = useState(customer?.name ?? "");
  const [phoneDraft, setPhoneDraft] = useState(customer?.phone ?? "");
```

In the existing `useEffect` that resets `businessNameDraft`/`remarkDraft` on `customer?.id` change, add the same reset for the two new drafts:

```tsx
  useEffect(() => {
    setBusinessNameDraft(customer?.businessName ?? "");
    setRemarkDraft(customer?.remark ?? "");
    setNameDraft(customer?.name ?? "");
    setPhoneDraft(customer?.phone ?? "");
  }, [customer?.id]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 3: Make the name heading editable for ADMIN/MANAGER**

Replace:

```tsx
          <div style={{ fontSize: 22, fontWeight: 700 }}>{customer.name}</div>
```

with:

```tsx
          {canEditIdentity ? (
            <input
              className="field-input"
              style={{ fontSize: 22, fontWeight: 700, padding: "2px 8px", width: "auto", minWidth: 220 }}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => {
                if (nameDraft.trim() && nameDraft !== customer.name) {
                  updateCustomerIdentity(customer.id, { name: nameDraft.trim() });
                }
              }}
            />
          ) : (
            <div style={{ fontSize: 22, fontWeight: 700 }}>{customer.name}</div>
          )}
```

(`name` is `not null` in the DB — the `nameDraft.trim()` guard skips saving an empty value instead of erroring.)

- [ ] **Step 4: Make the phone number editable for ADMIN/MANAGER**

Replace:

```tsx
            <span>
              {customer.phone} · Assigned:{" "}
```

with:

```tsx
            <span>
              {canEditIdentity ? (
                <input
                  className="field-input"
                  style={{ width: 130, display: "inline-block", padding: "2px 6px", fontSize: 13.5 }}
                  value={phoneDraft}
                  onChange={(e) => setPhoneDraft(e.target.value)}
                  onBlur={() => {
                    if (phoneDraft !== customer.phone) {
                      updateCustomerIdentity(customer.id, { phone: phoneDraft });
                    }
                  }}
                />
              ) : (
                customer.phone
              )}
              {" "}· Assigned:{" "}
```

- [ ] **Step 5: Add the Change History card**

Right after the closing `</div>` of the "Business Profile" card (search for the card containing `<div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Business Profile</div>` — its closing `</div>` is immediately followed by `<div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", ...`), insert:

```tsx
      {canEditIdentity && (
        <div className="card" style={{ marginTop: 20, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Change History</div>
          {(() => {
            const entries = changeLog.filter((l) => l.customerId === customer.id);
            if (entries.length === 0) {
              return <div style={{ fontSize: 13.5, color: "#9aa0ab" }}>No changes logged yet.</div>;
            }
            return entries.map((l) => (
              <div key={l.id} style={{ padding: "10px 0", borderBottom: "1px solid #eef0f2", fontSize: 13 }}>
                <span style={{ color: "#9aa0ab" }}>{l.time}</span>
                {" · "}
                <span style={{ fontWeight: 600 }}>{l.changedByName}</span>
                {" · "}
                <span>{PROFILE_FIELD_LABELS[l.fieldKey] ?? l.fieldKey}</span>
                {": "}
                <span style={{ color: "#6b7280" }}>{l.oldValue || "—"}</span>
                {" → "}
                <span>{l.newValue || "—"}</span>
              </div>
            ));
          })()}
        </div>
      )}
```

- [ ] **Step 6: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 7: Manual verification**

Using the browser preview (`npm run dev`):
1. Log in as SALESPERSON, open a customer assigned to you → name/phone show as plain text (no input box), no "Change History" card visible. Change a Business Profile field (e.g. Source) → the change saves as before.
2. Log in as ADMIN, open the same customer → name and phone now show as editable inputs; edit the name, click away (blur) → confirm it saves (reload the page, new name persists). Confirm the "Change History" card now shows an entry for the SALESPERSON's earlier Source change (`{time} · {salesperson name} · Source: {old} → {new}`), and a new entry for your own name edit (`Name: {old} → {new}`).
3. Log in as MANAGER who shares a team with this customer's assignee → confirm the same edit rights and Change History visibility as ADMIN.
4. Log in as MANAGER who does **not** share a team with any assignee on this customer (or simply doesn't have access to it at all, per existing customer visibility) → this customer shouldn't even be reachable; skip if there's no such customer in your test data — the RLS policy from Task 1 already covers this.
5. Try saving an empty name (clear the input, blur) → confirm nothing is sent and the field reverts to the last saved name on next reload (guarded client-side by `nameDraft.trim()`).

- [ ] **Step 8: Commit**

```bash
git add "app/(dashboard)/customers/[id]/page.tsx"
git commit -m "Customer profile: lock name/phone edit to admin/manager, add Change History card

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
