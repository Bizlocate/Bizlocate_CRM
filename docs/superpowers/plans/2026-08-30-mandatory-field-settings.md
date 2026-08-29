# Mandatory Field Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admin toggle which of 10 fields are mandatory at customer creation; the New Customer form shows a red asterisk on currently-required fields and blocks submit (with a red-highlighted box) if any are left empty.

**Architecture:** One new fixed-key settings table (`mandatory_field_settings`), loaded once at login/init like every other lookup list in `lib/store.tsx`. A new admin page renders the 10 fields as checkboxes (not the open-ended add/rename/delete `LookupListEditor` pattern, since this key set is fixed). The New Customer form reads the live settings to decide asterisks and to gate `handleSubmit`.

**Tech Stack:** Same as the rest of this repo — Next.js App Router, Supabase, no test framework; verify via `npx tsc --noEmit` and manual click-through via the `run` skill.

## Global Constraints

- The 10 field keys, exactly as follows (snake_case DB key → display label → New Customer form state variable): `phone` → "Phone" → `phone`; `assigned_to` → "Assigned To" → `assignedToUserId`; `source` → "Source" → `sourceId`; `area` → "Area" → `areaId`; `sub_area` → "Subarea" → `subAreaId`; `property_type` → "Property Type" → `propertyTypeId`; `purpose` → "Purpose" → `purposeId`; `business_industry` → "Business Industry" → `businessIndustryId`; `business_category` → "Business Category" → `businessCategoryId`; `business_type` → "Business Type" → `businessTypeId`.
- All 10 seeded `required = true` by default.
- Only the New Customer creation form is gated by this. The customer detail page (editing after creation) is completely unaffected — no changes to `app/(dashboard)/customers/[id]/page.tsx` in this plan.
- Error/highlight color: `#a13a2b` (the existing red used throughout this codebase for delete/error states — see `components/LookupListEditor.tsx:89`, `app/(dashboard)/admin/stages/page.tsx:108`).
- Match existing code style: inline `style={{...}}`, `className="btn btn-primary"`/`"field-input"`/`"field-label"`/`"card"`, no new dependencies.
- No automated test suite in this repo — verify every task via `npx tsc --noEmit` (must be zero errors) plus manual reasoning/click-through.

---

### Task 1: Schema — `mandatory_field_settings` table

**Files:**
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: table `mandatory_field_settings (field_key text primary key, required boolean not null default true)`, RLS (select any authenticated, update admin-only), 10 seed rows.

- [ ] **Step 1: Add the table to the main (fresh-install) schema**

In `supabase/schema.sql`, insert this block right after the `create table target_types (...)` block and before `create table customers (...)` (around line 124-129):

```sql
create table mandatory_field_settings (
  field_key text primary key,
  required boolean not null default true
);
```

- [ ] **Step 2: Add RLS**

Right after the existing `create policy "target_types_delete_admin" on target_types for delete using (is_admin());` line (around line 419), before the `-- customers:` comment, add:

```sql
alter table mandatory_field_settings enable row level security;

create policy "mandatory_field_settings_select" on mandatory_field_settings for select using (auth.uid() is not null);
create policy "mandatory_field_settings_update_admin" on mandatory_field_settings for update using (is_admin());
```

- [ ] **Step 3: Seed the 10 rows**

Right after the existing `insert into purposes (name) values ('Rent'), ('Buy'), ('Buy/Rent');` / `insert into firsttime_branch_types (name) values ('First Time'), ('Branch');` lines (around line 510-511), add:

```sql
insert into mandatory_field_settings (field_key, required) values
  ('phone', true),
  ('assigned_to', true),
  ('source', true),
  ('area', true),
  ('sub_area', true),
  ('property_type', true),
  ('purpose', true),
  ('business_industry', true),
  ('business_category', true),
  ('business_type', true);
```

- [ ] **Step 4: Append the already-provisioned-database migration note**

At the very end of `supabase/schema.sql`, append (fully `--`-commented, matching every other migration block already in this file — see the "Migration: Customer Business Profile" block a few lines above for the exact style to copy):

```sql

-- ============================================================
-- Migration: Mandatory Field Settings — run once against an
-- already-provisioned database (everything below already exists
-- in the main schema above for fresh installs).
-- ============================================================
--
-- create table mandatory_field_settings (
--   field_key text primary key,
--   required boolean not null default true
-- );
--
-- alter table mandatory_field_settings enable row level security;
--
-- create policy "mandatory_field_settings_select" on mandatory_field_settings for select using (auth.uid() is not null);
-- create policy "mandatory_field_settings_update_admin" on mandatory_field_settings for update using (is_admin());
--
-- insert into mandatory_field_settings (field_key, required) values
--   ('phone', true),
--   ('assigned_to', true),
--   ('source', true),
--   ('area', true),
--   ('sub_area', true),
--   ('property_type', true),
--   ('purpose', true),
--   ('business_industry', true),
--   ('business_category', true),
--   ('business_type', true);
```

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql
git commit -m "Add mandatory_field_settings table

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Manual step — apply the migration**

Tell the user: open the Supabase SQL editor for this project and run the uncommented version of the SQL from Step 1-3 above (table + RLS + seed — strip the `--` prefixes from Step 4's block, or just copy Steps 1-3 verbatim, they're already uncommented). Confirm no errors before continuing to Task 3 (Task 2 is pure TypeScript and doesn't need the DB).

---

### Task 2: Types — `FieldRequirement` + label map

**Files:**
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: `export interface FieldRequirement { fieldKey: string; required: boolean }`, `export const MANDATORY_FIELD_KEYS: readonly string[]`, `export const MANDATORY_FIELD_LABELS: Record<string, string>`.

- [ ] **Step 1: Add the type and label constants**

In `lib/types.ts`, after the `TargetType` interface (after line 70), add:

```ts
export interface FieldRequirement {
  fieldKey: string;
  required: boolean;
}

export const MANDATORY_FIELD_KEYS = [
  "phone",
  "assigned_to",
  "source",
  "area",
  "sub_area",
  "property_type",
  "purpose",
  "business_industry",
  "business_category",
  "business_type",
] as const;

export const MANDATORY_FIELD_LABELS: Record<string, string> = {
  phone: "Phone",
  assigned_to: "Assigned To",
  source: "Source",
  area: "Area",
  sub_area: "Subarea",
  property_type: "Property Type",
  purpose: "Purpose",
  business_industry: "Business Industry",
  business_category: "Business Category",
  business_type: "Business Type",
};
```

`MANDATORY_FIELD_KEYS` and `MANDATORY_FIELD_LABELS` are shared by Task 4 (admin page, to render the fixed list in a stable order) and Task 5 (New Customer form, to know which keys to check and what to call them).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "Add FieldRequirement type and mandatory field label map

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Store — load/update field requirements

**Files:**
- Modify: `lib/store.tsx`

**Interfaces:**
- Consumes: `FieldRequirement` (Task 2).
- Produces: `fieldRequirements: FieldRequirement[]` on the `Store` interface, `updateFieldRequirement: (fieldKey: string, required: boolean) => void`.

- [ ] **Step 1: Add the type import**

Add `FieldRequirement` to the `import { ... } from "./types";` block in `lib/store.tsx` (alphabetically, between `FirsttimeBranchType` and `Language`):

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
  FieldRequirement,
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
  TargetRace,
  TargetType,
  Task,
  Team,
  User,
} from "./types";
```

- [ ] **Step 2: Add the mapper**

Add after `mapBusinessTagType` (near the other `map*` functions):

```ts
function mapFieldRequirement(row: { field_key: string; required: boolean }): FieldRequirement {
  return { fieldKey: row.field_key, required: row.required };
}
```

- [ ] **Step 3: Add state and loader**

Add the state declaration next to `targetTypes` (line 348):

```ts
const [fieldRequirements, setFieldRequirements] = useState<FieldRequirement[]>([]);
```

Add the loader next to `loadTargetTypes` (near the other lookup loaders, before the `useEffect`):

```ts
async function loadFieldRequirements(): Promise<FieldRequirement[]> {
  const supabase = createClient();
  const { data } = await supabase.from("mandatory_field_settings").select("*");
  const mapped = (data ?? []).map(mapFieldRequirement);
  setFieldRequirements(mapped);
  return mapped;
}
```

Add `loadFieldRequirements()` to BOTH `Promise.all([...])` arrays (the `useEffect` at line 526-545 and `login()` at line 568-587), alongside `loadTargetTypes()`.

- [ ] **Step 4: Add the update function**

Add next to `updateTargetType`:

```ts
function updateFieldRequirement(fieldKey: string, required: boolean) {
  setFieldRequirements((prev) => prev.map((f) => (f.fieldKey === fieldKey ? { ...f, required } : f)));
  const supabase = createClient();
  supabase.from("mandatory_field_settings").update({ required }).eq("field_key", fieldKey).then(() => {});
}
```

- [ ] **Step 5: Add to the `Store` interface and the `value` object**

In the `Store` interface, add `fieldRequirements: FieldRequirement[];` next to `targetTypes: TargetType[];` (line 234), and `updateFieldRequirement: (fieldKey: string, required: boolean) => void;` next to `updateTargetType` in the CRUD section (line 299).

In the `value: Store = { ... }` object, add `fieldRequirements,` next to `targetTypes,` (line 1363), and `updateFieldRequirement,` next to `updateTargetType,` (line 1417 area).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual verification**

**Prerequisite:** Task 1's migration must already be applied (Step 6 of Task 1).

Not independently visible in the UI yet (no admin page or form changes until Tasks 4-5). Confirm the app still loads without errors after login (open browser console, check no runtime error from the new loader).

- [ ] **Step 8: Commit**

```bash
git add lib/store.tsx
git commit -m "Load and update mandatory field settings in store

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Admin Required Fields page

**Files:**
- Create: `app/(dashboard)/admin/field-settings/page.tsx`
- Modify: `components/AdminTabs.tsx`

**Interfaces:**
- Consumes: `fieldRequirements`, `updateFieldRequirement` (Task 3), `MANDATORY_FIELD_KEYS`, `MANDATORY_FIELD_LABELS` (Task 2).

- [ ] **Step 1: Add the tab entry**

In `components/AdminTabs.tsx`, add a new entry to the `TABS` array after `"Profile Lists"`:

```ts
const TABS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/teams", label: "Teams" },
  { href: "/admin/area", label: "Area" },
  { href: "/admin/business-tags", label: "Business Tag" },
  { href: "/admin/stages", label: "Pipeline Stages" },
  { href: "/admin/profile-lists", label: "Profile Lists" },
  { href: "/admin/field-settings", label: "Required Fields" },
];
```

- [ ] **Step 2: Write the page**

```tsx
"use client";

import { useStore } from "@/lib/store";
import AdminTabs from "@/components/AdminTabs";
import { MANDATORY_FIELD_KEYS, MANDATORY_FIELD_LABELS } from "@/lib/types";

export default function AdminFieldSettingsPage() {
  const { fieldRequirements, updateFieldRequirement } = useStore();

  function isRequired(fieldKey: string): boolean {
    return fieldRequirements.find((f) => f.fieldKey === fieldKey)?.required ?? false;
  }

  return (
    <div style={{ padding: "28px 32px" }}>
      <AdminTabs />
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Admin — Required Fields</div>
      <div style={{ fontSize: 13.5, color: "#6b7280", marginBottom: 20 }}>
        Fields checked here must be filled in before a new customer can be created. Editing a customer afterward is unaffected.
      </div>
      <div className="card">
        {MANDATORY_FIELD_KEYS.map((fieldKey) => (
          <label
            key={fieldKey}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid #eef0f2", fontSize: 13.5, cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={isRequired(fieldKey)}
              onChange={(e) => updateFieldRequirement(fieldKey, e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            <span style={{ fontWeight: 500 }}>{MANDATORY_FIELD_LABELS[fieldKey]}</span>
            <span style={{ color: "#9aa0ab" }}>— required at creation</span>
          </label>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Log in as ADMIN, go to Admin → Required Fields. Confirm all 10 rows show checked (assuming Task 1's seed ran). Uncheck one, reload the page, confirm it stayed unchecked (persisted).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/admin/field-settings/page.tsx" components/AdminTabs.tsx
git commit -m "Add Admin Required Fields settings page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: New Customer form — asterisks + blocking validation

**Files:**
- Modify: `app/(dashboard)/customers/page.tsx`

**Interfaces:**
- Consumes: `fieldRequirements` (Task 3), `MANDATORY_FIELD_LABELS` (Task 2, imported for reference only — the form already has its own field labels in JSX; this task doesn't change label text, only adds a conditional asterisk).

- [ ] **Step 1: Import `fieldRequirements` and add a lookup helper**

In `app/(dashboard)/customers/page.tsx`, change `NewCustomerForm`'s `useStore()` destructure to add `fieldRequirements`:

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
  fieldRequirements,
} = useStore();
```

Right after the existing `filteredSubAreas`/`filteredCategories`/`filteredTypes` `const`s, add:

```ts
function isFieldRequired(fieldKey: string): boolean {
  return fieldRequirements.find((f) => f.fieldKey === fieldKey)?.required ?? false;
}

function Asterisk({ fieldKey }: { fieldKey: string }) {
  return isFieldRequired(fieldKey) ? <span style={{ color: "#a13a2b" }}> *</span> : null;
}
```

- [ ] **Step 2: Add `invalidFields` state**

Add next to the other `useState` declarations in `NewCustomerForm`:

```ts
const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
```

- [ ] **Step 3: Rewrite `handleSubmit` to validate before calling `addCustomer`**

Replace the current `handleSubmit`:

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

with:

```ts
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!name.trim()) return;

  const fieldValues: Record<string, string> = {
    phone,
    assigned_to: assignedToUserId,
    source: sourceId,
    area: areaId,
    sub_area: subAreaId,
    property_type: propertyTypeId,
    purpose: purposeId,
    business_industry: businessIndustryId,
    business_category: businessCategoryId,
    business_type: businessTypeId,
  };
  const failing = new Set<string>();
  for (const [fieldKey, value] of Object.entries(fieldValues)) {
    if (isFieldRequired(fieldKey) && !value) failing.add(fieldKey);
  }
  if (failing.size > 0) {
    setInvalidFields(failing);
    return;
  }

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

function clearInvalid(fieldKey: string) {
  setInvalidFields((prev) => {
    if (!prev.has(fieldKey)) return prev;
    const next = new Set(prev);
    next.delete(fieldKey);
    return next;
  });
}

function fieldStyle(fieldKey: string): React.CSSProperties {
  return invalidFields.has(fieldKey) ? { borderColor: "#a13a2b" } : {};
}
```

Note: `assignedToUserId` no longer defaults away the empty case silently — since it's seeded from `users[0]?.id ?? ""`, it's only empty when there are zero active users, which now correctly blocks creation with a visible red highlight instead of silently sending an empty assignee (previously `!assignedToUserId` returned early with no feedback at all).

- [ ] **Step 4: Add asterisks and red-border styling to the 10 fields' JSX**

For each of the 10 fields below, apply two changes: add `<Asterisk fieldKey="..." />` right after the label text, and add `style={fieldStyle("...")}` merged into the existing `className="field-input"` element (as a second prop, not replacing anything), and add `onFocus={() => clearInvalid("...")}` (clearing the highlight as soon as the user interacts with the field — simpler and more forgiving than requiring a specific new value, since a `<select>`'s `onChange` only fires after a different option is chosen, but focusing it already signals the user is addressing it).

Phone (base field, currently has no red-border capability):
```tsx
<div style={{ flex: "1 1 150px" }}>
  <label className="field-label">Phone<Asterisk fieldKey="phone" /></label>
  <input className="field-input" style={fieldStyle("phone")} onFocus={() => clearInvalid("phone")} value={phone} onChange={(e) => setPhone(e.target.value)} />
</div>
```

Assigned To:
```tsx
<div style={{ flex: "1 1 160px" }}>
  <label className="field-label">Assigned To<Asterisk fieldKey="assigned_to" /></label>
  <select className="field-input" style={fieldStyle("assigned_to")} onFocus={() => clearInvalid("assigned_to")} value={assignedToUserId} onChange={(e) => setAssignedToUserId(e.target.value)}>
    {users.filter((u) => u.active).map((u) => (
      <option key={u.id} value={u.id}>{u.name}</option>
    ))}
  </select>
</div>
```

Source:
```tsx
<div style={{ flex: "1 1 180px" }}>
  <label className="field-label">Source<Asterisk fieldKey="source" /></label>
  <select className="field-input" style={fieldStyle("source")} onFocus={() => clearInvalid("source")} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
    <option value="">—</option>
    {leadSources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
  </select>
</div>
```

Area:
```tsx
<div style={{ flex: "1 1 180px" }}>
  <label className="field-label">Area<Asterisk fieldKey="area" /></label>
  <select className="field-input" style={fieldStyle("area")} onFocus={() => clearInvalid("area")} value={areaId} onChange={(e) => { setAreaId(e.target.value); setSubAreaId(""); }}>
    <option value="">—</option>
    {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
  </select>
</div>
```

Subarea:
```tsx
<div style={{ flex: "1 1 180px" }}>
  <label className="field-label">Subarea<Asterisk fieldKey="sub_area" /></label>
  <select className="field-input" style={fieldStyle("sub_area")} onFocus={() => clearInvalid("sub_area")} value={subAreaId} onChange={(e) => setSubAreaId(e.target.value)} disabled={!areaId}>
    <option value="">—</option>
    {filteredSubAreas.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
  </select>
</div>
```

Property Type:
```tsx
<div style={{ flex: "1 1 180px" }}>
  <label className="field-label">Property Type<Asterisk fieldKey="property_type" /></label>
  <select className="field-input" style={fieldStyle("property_type")} onFocus={() => clearInvalid("property_type")} value={propertyTypeId} onChange={(e) => setPropertyTypeId(e.target.value)}>
    <option value="">—</option>
    {propertyTypes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
  </select>
</div>
```

Purpose:
```tsx
<div style={{ flex: "1 1 180px" }}>
  <label className="field-label">Purpose<Asterisk fieldKey="purpose" /></label>
  <select className="field-input" style={fieldStyle("purpose")} onFocus={() => clearInvalid("purpose")} value={purposeId} onChange={(e) => setPurposeId(e.target.value)}>
    <option value="">—</option>
    {purposes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
  </select>
</div>
```

Business Industry:
```tsx
<div style={{ flex: "1 1 180px" }}>
  <label className="field-label">Business Industry<Asterisk fieldKey="business_industry" /></label>
  <select className="field-input" style={fieldStyle("business_industry")} onFocus={() => clearInvalid("business_industry")} value={businessIndustryId} onChange={(e) => { setBusinessIndustryId(e.target.value); setBusinessCategoryId(""); setBusinessTypeId(""); }}>
    <option value="">—</option>
    {businessTagIndustries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
  </select>
</div>
```

Business Category:
```tsx
<div style={{ flex: "1 1 180px" }}>
  <label className="field-label">Business Category<Asterisk fieldKey="business_category" /></label>
  <select className="field-input" style={fieldStyle("business_category")} onFocus={() => clearInvalid("business_category")} value={businessCategoryId} onChange={(e) => { setBusinessCategoryId(e.target.value); setBusinessTypeId(""); }} disabled={!businessIndustryId}>
    <option value="">—</option>
    {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
  </select>
</div>
```

Business Type:
```tsx
<div style={{ flex: "1 1 180px" }}>
  <label className="field-label">Business Type<Asterisk fieldKey="business_type" /></label>
  <select className="field-input" style={fieldStyle("business_type")} onFocus={() => clearInvalid("business_type")} value={businessTypeId} onChange={(e) => setBusinessTypeId(e.target.value)} disabled={!businessCategoryId}>
    <option value="">—</option>
    {filteredTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
  </select>
</div>
```

Every other field in the form (Name, Email, Race, Language, Business Name, Firsttime/Branch, Target Race, Target Type, Remark) is unchanged — not part of the 10 mandatory-eligible keys.

- [ ] **Step 5: Reset `invalidFields` when the form closes/reopens**

Since `NewCustomerForm` is unmounted when `showForm` is false (`CustomersPage` only renders it conditionally) and freshly mounted each time it reopens, `invalidFields` naturally resets to `new Set()` on every open — no explicit reset code needed. Confirm this is actually true by checking `CustomersPage`'s render: `{showForm && canCreate && (<NewCustomerForm onClose={() => setShowForm(false)} />)}` — yes, conditional rendering unmounts on `false`, so no extra step is needed here beyond this confirmation.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual verification**

**Prerequisite:** Tasks 1, 3, 4 must be done and the migration applied, so `fieldRequirements` has real data.

As ADMIN/MANAGER, open New Customer form. Confirm all 10 fields (per Admin → Required Fields' current settings) show a red `*`. Leave several empty, click Create — confirm it does NOT submit, and every empty required field's box gets a red border. Fill in one of the highlighted fields — confirm its red border clears immediately (via the `onFocus` handler firing before the value even changes, since focusing signals intent to address it) without needing to click Create again. Fill in all required fields and Create — confirm the customer is created and the form closes. Reopen the form — confirm no stale red borders from the previous attempt.

Then in Admin → Required Fields, uncheck one field (e.g. Phone), go back to New Customer form, confirm its asterisk is gone and it no longer blocks submission when left empty.

- [ ] **Step 8: Commit**

```bash
git add "app/(dashboard)/customers/page.tsx"
git commit -m "Add mandatory field asterisks and blocking validation to New Customer form

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** all 10 fields (design spec's Fields Covered table) map to Task 5's `fieldValues` map and Task 4's `MANDATORY_FIELD_KEYS` list. Admin toggle UI maps to Task 4. Data model maps to Task 1. Store wiring maps to Task 3. Asterisk + blocking validation maps to Task 5.
- **Type consistency:** `fieldKey` string values are identical across Task 1's seed (`'phone'`, `'assigned_to'`, ...), Task 2's `MANDATORY_FIELD_KEYS`/`MANDATORY_FIELD_LABELS` (`"phone"`, `"assigned_to"`, ...), Task 4's rendering loop, and Task 5's `fieldValues` map keys (`phone`, `assigned_to`, ...) — all match exactly, snake_case, no drift.
- **No placeholders:** every step contains complete, runnable code.
