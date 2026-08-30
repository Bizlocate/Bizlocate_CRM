# Budget Field — Design

Date: 2026-08-30

## Purpose

Add a "Budget" field to the customer Business Profile — an admin-managed range list (e.g. "RM50k-100k"), same shape as Property Type/Purpose/etc. Not a mandatory field.

## Data Model

New flat lookup table, same shape as the 8 existing Business Profile lookups:

```sql
create table budgets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);
```

New nullable column on `customers`: `budget_id uuid references budgets (id) on delete set null`.

RLS: identical shape to `races`/`target_races`/etc. — select open to any authenticated user, insert/update/delete admin-only.

No seed rows — admin populates ranges via the Profile Lists page (e.g. "Below RM50k", "RM50k-100k", "RM100k-200k", "Above RM200k" — admin's choice, not hardcoded).

## Admin UI

No new page. The existing `app/(dashboard)/admin/profile-lists/page.tsx` already renders a generic left-picker + `LookupListEditor` for 8 lists — add "Budget" as a 9th entry, reusing the exact same pattern (new store state `budgets`, `addBudget`/`updateBudget`/`deleteBudget`, one more `config` entry on the page).

## Customer Form & Detail Page

- New Customer form (`app/(dashboard)/customers/page.tsx`): one more flat `<select>` in the Business Profile fieldset, alongside Property Type/Purpose, following the identical pattern (no cascading, no admin-editable-mandatory).
- Customer detail page (`[id]/page.tsx`): one more `profileSelect(...)` call in the Business Profile card, editable by the same `canEditProfile` rule as every other non-Remark field (ADMIN/MANAGER/assigned SALESPERSON).
- NOT added to `MANDATORY_FIELD_KEYS`/the Required Fields admin page — Budget is always optional, no asterisk, no blocking validation.

## Testing

Manual, via the `run` skill:
1. As ADMIN, open Admin → Profile Lists, confirm "Budget" appears as a 9th list, add a few ranges.
2. Open New Customer form, confirm Budget dropdown shows the ranges just added.
3. Create a customer with a Budget selected, open its detail page, confirm it displays and is editable.
4. Confirm Budget has no red asterisk and doesn't block customer creation when left blank (it's not in Mandatory Field Settings).
