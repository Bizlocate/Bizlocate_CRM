# Customer identity edit lock + business profile change log

## Context

First slice of a larger "system flow upgrade" request (see chat log — the
other four slices, in build order, are: auto second-assignment after 3 days,
per-assignee pipeline stage rework + Closed Case amount capture, and the
remove-client approval workflow; each gets its own spec later). This spec
covers two small, independent-but-shared-code changes:

- **D** — Customer `name`/`phone` become editable, but only by ADMIN/MANAGER.
  Today neither field has an edit UI at all (detail page shows them as plain
  text); SALESPERSON must never get one.
- **E** — Every business-profile field change (the fields already covered by
  `updateCustomerProfile`, plus `name`/`phone`/`remark`) is written to a
  change log, visible to ADMIN and MANAGER (scoped to their own team, same
  visibility rule the rest of the customer data already uses).

Both land in the same function (`updateCustomerProfile` in
[lib/store.tsx](../../../lib/store.tsx)), so they're built together instead
of touching that function twice.

Out of scope: pipeline stage changes, pool toggles, and reassignment are
**not** logged here — those are per-assignee flows with their own audit
trail (existing Agent Log pages) and get covered when the pipeline-stage
spec lands.

## Data model

`customer_change_log` — new table:

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `customer_id` | uuid → customers | |
| `changed_by` | uuid → profiles | who made the edit |
| `field_key` | text | DB column name, e.g. `name`, `phone`, `source_id`, `business_name` (not the store's camelCase key) |
| `old_value` | text, nullable | human-readable display value, not the raw id |
| `new_value` | text, nullable | same |
| `created_at` | timestamptz default now() | |

Values are resolved to their **display text** at write time (e.g. for
`area_id` the row stores `"KL"` / `"PJ"`, not the uuid), so the log stays
readable even if a lookup entry is later renamed or deleted.

RLS mirrors the existing `is_customer_assignee()` pattern used for
`activities`/`tasks`, restricted to ADMIN/MANAGER (SALESPERSON can insert —
their edits are what gets logged — but cannot read the log):

```sql
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
  exists (
    select 1 from customers c
    where c.id = customer_change_log.customer_id
      and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
  )
  or is_admin()
);
```

No update/delete policy — append-only, same convention as `activities`.

## Store changes (lib/store.tsx)

- `CustomerProfileInput` gains no new shape — `name`/`phone` are handled by
  a new, separate function so the identity lock stays a single obvious
  gate instead of a flag threaded through the existing profile patch type:

  ```ts
  updateCustomerIdentity: (customerId: string, patch: { name?: string; phone?: string }) => void;
  ```

- Both `updateCustomerProfile` and `updateCustomerIdentity` (and
  `updateCustomerRemark`, folded in for the same reason it's already a
  sibling function) resolve each changed field's old/new display value and
  insert one `customer_change_log` row per changed field, tagged with
  `currentUser.id`. A small shared helper does the diff + resolve + insert
  so the three functions don't duplicate it.
- Lookup-id fields resolve their display string from the arrays already
  loaded in the store (`leadSources`, `areas`, `subAreas`, ... — same lists
  `profileSelect()` on the detail page already uses). Plain text fields
  (`name`, `phone`, `businessName`, `remark`) log the raw string.

## UI (customer detail page)

- `canEditIdentity = currentUser.role === "ADMIN" || currentUser.role === "MANAGER"`.
  Name (header) and phone become editable inputs, gated by
  `canEditIdentity`, using the same "input + commit on blur" pattern
  `businessName`/`remark` already use. SALESPERSON keeps the current
  plain-text display.
- New **Change History** card, visible only when
  `currentUser.role === "ADMIN" || currentUser.role === "MANAGER"` (RLS
  backs this up — a SALESPERSON's query would come back empty anyway).
  Lists `customer_change_log` rows for this customer, newest first:
  `{time} · {changed_by name} · {field label}: {old_value} → {new_value}`.
  Field label resolved from a small `PROFILE_FIELD_LABELS` map in
  `lib/types.ts` keyed by the same DB column names as `field_key` (mirrors
  the existing `MANDATORY_FIELD_LABELS` map, different key set).

## Testing

Manual (matches existing precedent — no test framework in this repo for
UI-level features):
- As SALESPERSON: confirm name/phone show as text, not inputs. Change a
  profile field (e.g. Source), confirm a log row is created but the
  Change History card itself isn't visible to this user.
- As ADMIN: edit name/phone, confirm it saves and a log row appears with
  old/new text values. Confirm Change History shows entries from a
  SALESPERSON's edit on the same customer.
- As MANAGER: confirm Change History only shows for customers whose
  assignee shares this manager's team (same scoping as the rest of the
  customer data).
