# Mandatory Field Settings — Design

Date: 2026-08-30

## Purpose

At customer creation, ADMIN/MANAGER should be forced to capture a specific set of lead-qualification fields — these are the fields sales operations depends on being present from day one. Which fields are mandatory should itself be admin-configurable (a toggle, not a hardcoded list), so operations can adjust the requirement later without a code change.

## Fields Covered

Ten fields, mandatory by default (all `required = true` on first install):

| Field key | Label | Type |
|---|---|---|
| `phone` | Phone | base customer field |
| `assigned_to` | Assigned To | base customer field |
| `source` | Source | Business Profile field |
| `area` | Area | Business Profile field |
| `sub_area` | Subarea | Business Profile field |
| `property_type` | Property Type | Business Profile field |
| `purpose` | Purpose | Business Profile field |
| `business_industry` | Business Industry | Business Profile field |
| `business_category` | Business Category | Business Profile field |
| `business_type` | Business Type | Business Profile field |

Only the New Customer creation form is gated. Editing these fields afterward (on the customer detail page) is unaffected — they remain editable by ADMIN, MANAGER, or the assigned SALESPERSON exactly as today, and can be blanked or changed with no forced-required check. `canCreate` (ADMIN/MANAGER only) already gates who can reach the creation form at all, so "only admin/leader" naturally holds without any new access-control change.

## Data Model

New table `mandatory_field_settings`:

```sql
create table mandatory_field_settings (
  field_key text primary key,
  required boolean not null default true
);
```

Seeded with exactly the 10 keys above, `required = true` for all. This is a fixed key set — the admin UI only ever toggles `required` on an existing row; it never adds or removes rows (unlike the flat lookup lists from the Business Profile feature, which are open-ended).

RLS: `select` open to any authenticated user (the creation form needs to read current requirements to decide which asterisks/validation to apply); `update` admin-only. No `insert`/`delete` policy needed since rows are fixed and only ever seeded once.

## Admin UI

New page `app/(dashboard)/admin/field-settings/page.tsx`, new `AdminTabs` entry "Required Fields". A single list of the 10 fields (using their display labels, not raw keys), each row a checkbox bound to that field's `required` value. Toggling updates immediately (optimistic local update + fire-and-forget Supabase write, matching every other admin toggle in this codebase). No add/rename/delete controls — the key set is fixed.

## Store Changes (`lib/store.tsx`)

- `fieldRequirements: Record<string, boolean>` state (keyed by `field_key`), defaulting to `{}` before load (form treats a missing key as "not required" — i.e. fails safe toward not blocking creation if the settings row is somehow missing).
- `loadFieldRequirements()`: loads all rows into the `Record`.
- `updateFieldRequirement(fieldKey: string, required: boolean)`: optimistic update + Supabase write.

## New Customer Form (`app/(dashboard)/customers/page.tsx`)

- Each of the 10 fields' `<label className="field-label">` renders a trailing red `*` when `fieldRequirements[fieldKey]` is `true` (reactive — flips instantly if admin changes the setting, since the form re-renders from live store state).
- `handleSubmit` gains a validation pass before calling `addCustomer`: for each of the 10 keys currently marked required, check the corresponding form state is non-empty. If any fail, do not call `addCustomer`; instead populate a local `invalidFields: Set<string>` state naming every failing field and re-render.
- Each of the 10 fields' `<input>`/`<select>` gets a red border (`style={{ borderColor: invalidFields.has(fieldKey) ? "#d9483a" : undefined }}`, or the codebase's existing error color) when its key is in `invalidFields`. The field's own `onChange` clears it from `invalidFields` as soon as the user provides a value, so the red border disappears the moment the user fixes it (no need to resubmit to clear the highlight).
- `phone`'s `<input>` currently has no `required` attribute and is validated only by this new mandatory-field check (not the browser's native `required`, to keep the highlight/asterisk behavior fully driven by the admin-configurable setting rather than a mix of native and custom validation). `assignedToUserId`'s `<select>` gets the same treatment — even though it defaults to the first active user and is rarely actually empty, it's still checked (empty only if there are zero active users, an edge case that should also block creation with a visible reason rather than silently sending an empty assignee).

## Testing

Manual, via the `run` skill:
1. As ADMIN, open Admin → Required Fields. Confirm all 10 show checked. Uncheck one (e.g. Phone), reload, confirm it stayed unchecked.
2. Open New Customer form. Confirm the unchecked field (Phone) shows no red asterisk; the other 9 do.
3. Leave several required fields empty, click Create. Confirm submission is blocked and each empty required field's box turns red.
4. Fill in the previously-empty Phone field with no asterisk — confirm it's still optional (doesn't block submit even if left empty, since it was turned off in step 1).
5. Fill in all remaining required fields, click Create. Confirm the customer is created successfully and the red highlights clear.
6. Re-check Phone as required in Admin → Required Fields; confirm the New Customer form immediately shows its asterisk again on next open.
