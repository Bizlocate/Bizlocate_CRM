# New Customer Modal + Multi-Assign (up to 3) — Design

Date: 2026-08-30

## Purpose

Two changes to the customer-creation flow:

1. Turn the New Customer form into a modal (matching the New User modal's look), with fields regrouped into clear rows.
2. Let a customer be followed up by up to 3 people at once ("Assigned To" x3), with a WhatsApp button per assignee.

## Part A — New Customer as a Modal

`NewCustomerForm` in `app/(dashboard)/customers/page.tsx` currently renders inline as a `card` when `+ New Customer` is clicked. Change it to a `modal-overlay` + `modal-card` (same classes/structure as `admin/users/page.tsx`'s `showAddModal` block: header with title + `×` close, click-outside-to-close, Create/Cancel footer).

Field grouping — each row is its own flex container (not a single flex-wrap pool), so the grouping holds regardless of window width:

| Row | Fields |
|---|---|
| 1 | Name, Phone, Email |
| — | "Business Profile" section label |
| 2 | Source, Area, Subarea |
| 3 | Business Industry, Business Category, Business Type |
| 4 | Property Type, Purpose, Race, Language |
| 5 | Business Name, Firsttime/Branch, Target Race, Target Type, Budget |
| — | "Assigned To" section label |
| 6 | Assigned To 1, Assigned To 2, Assigned To 3 (see Part B) |
| 7 | Remark (full width) |

Cascading behavior (Area→Subarea, Business Industry→Category→Type) and the required-field asterisk/validation logic are unchanged, just re-laid-out.

## Part B — Assigned To x3

### Data model

`customers.assigned_to` (existing, `not null`) stays as slot 1 — no data migration needed, existing rows already have it. Add two nullable columns:

```sql
alter table customers add column if not exists assigned_to_2 uuid references profiles (id);
alter table customers add column if not exists assigned_to_3 uuid references profiles (id);
```

RLS policies that currently check `assigned_to = auth.uid()` (or `in (select id from profiles where team_id = my_team_id())`) — `customers_select`, `customers_update`, and the 4 activity/task policies referencing `c.assigned_to` — extend to also match `assigned_to_2`/`assigned_to_3` (own-slot OR own-team-slot, same shape, just OR'd across 3 columns).

`customers_protect_assignment` trigger (blocks non-admin from changing `assigned_to` on update) extends to guard all 3 columns the same way.

### Types & store (`lib/types.ts`, `lib/store.tsx`)

- `Customer`: add `assignedToUserId2: string | null`, `assignedToUserId3: string | null`.
- `mapCustomer`: map `assigned_to_2`/`assigned_to_3`.
- `addCustomer`: input gains optional `assignedToUserId2`, `assignedToUserId3`; insert maps them to the two new columns.
- `visibleCustomers` (salesperson: own only; manager: own team): check membership across all 3 slots, not just `assignedToUserId`.
- Customer-limit counting (the per-user active-customer count used by `assignmentError`): a customer counts against a user's limit if that user occupies *any* of the 3 slots — i.e. all 3 concurrent assignees each use one unit of their own limit.
- `reassignCustomer(customerId, newUserId)` → `reassignCustomer(customerId, slot: 1 | 2 | 3, userId: string | null)`. Admin-only (unchanged). Setting slot 1 to `null` is not allowed (always required); slots 2/3 accept `null` to clear.

### Customer creation validation

- Slot 1 required (existing `assigned_to` required-field behavior, unchanged key `assigned_to`).
- Slots 2/3 optional, no asterisk.
- The same user can't occupy two slots at once — in the New Customer modal and in the detail-page reassign selects, each slot's dropdown excludes users already chosen in the other slots.

### Customers list page (`app/(dashboard)/customers/page.tsx`)

- "Assigned To" column: join the names of all filled slots with ", ".
- "Assigned To" search filter: matches if the selected user occupies any of the 3 slots.

### Customer detail page (`[id]/page.tsx`)

- Header line: show all filled assignees (e.g. "Assigned: Alice, Bob"). One WhatsApp button per assignee that has a phone number, each opening its own `wa.me` link with the existing `buildAssignmentMessage`. Button label distinguishes them when more than one is shown (e.g. "WhatsApp — Alice").
- Reassign controls (admin-only, top-right): three select+confirm rows, one per slot, using the updated `reassignCustomer(customerId, slot, userId)`. Slot 1's select has no "unassign" option; slots 2/3 include a "—" option to clear.
- `canEditProfile` (currently `ADMIN || MANAGER || currentUser.id === customer.assignedToUserId`): extend to match any of the 3 slots.

## Testing

Manual, via the `run` skill:
1. Open New Customer — confirm it's a modal (overlay, ×, click-outside-to-close) with fields grouped into the rows above.
2. Create a customer assigning 3 different salespeople to the 3 slots; confirm the same person can't be picked twice.
3. Open the customer list — confirm the Assigned To column shows all 3 names, and searching by any one of them finds the customer.
4. Open the customer detail page — confirm 3 WhatsApp buttons appear (for slots with a phone), each linking to the right person; confirm each of the 3 salespeople can see/edit the customer (RLS) and a 4th unrelated salesperson cannot.
5. As admin, reassign slot 2 to a different user, then clear slot 3; confirm customer-limit counts update for all affected users.
6. Confirm a salesperson at their customer limit can still be assigned as slot 2/3 of one more customer only up to their own limit (each slot they occupy, across any customer, counts toward that same limit).
