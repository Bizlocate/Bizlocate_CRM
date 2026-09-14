# Manager "My Customers" tab

## Context

MANAGER's existing `/customers` tab shows the full unified customer list
(all customers, no pool tabs — see
[customer-pool-system-design.md](2026-08-30-customer-pool-system-design.md)).
A manager can also be a customer's assignee (occupy slot 1/2/3, same as a
SALESPERSON), but had no view of their *own* follow-up queue the way a
SALESPERSON does on `/customers` (Active Pool / Potential Pool tabs). This
adds that view as a separate nav tab, MANAGER only.

## Scope

- New nav tab **"My Customers"**, visible only to `role === "MANAGER"`,
  positioned after "Customers" and before "To Do" in
  [MainNav.tsx](../../../components/MainNav.tsx).
- New route `app/(dashboard)/my-customers/page.tsx`. Non-MANAGER visiting
  the URL directly is redirected to `/dashboard` (same guard pattern as
  other role-gated pages, e.g. `/admin/*`).
- Existing `/customers` route and its MANAGER behavior (unified list, no
  pool tabs, sees all customers) is unchanged.

## Behavior

Mirrors the SALESPERSON branch already on `/customers`
([customers/page.tsx](../../../app/(dashboard)/customers/page.tsx)) applied
to whichever slot the MANAGER occupies instead of always slot semantics
being for a SALESPERSON:

- List is `visibleCustomers` filtered to rows where `currentUser.id` equals
  `assignedToUserId`, `assignedToUserId2`, or `assignedToUserId3`.
- Two tabs above the filter card, **Active Pool** / **Potential Pool**,
  default Active. Filter uses the pool field (`pool1`/`pool2`/`pool3`)
  matching whichever slot is the manager's own — same lookup as
  `isSalesperson`'s `myPool` in `customers/page.tsx`.
- "Assigned To" column hidden (same as SP: it's always the viewer).
  Stage badge shows only the manager's own slot's stage (`myStageId`
  logic), not all three.
- Same search/filter fields (name, brand name, phone, stage, keyword,
  source, area, sub area, property type, business industry/category/type,
  race, firsttime/branch, purpose) as the existing list.
- Default sort: new-stage-first, same as SP (`isSalesperson` sort branch).
- No "+ New Customer" button, no export — those stay only on `/customers`
  (manager already has both there).
- Pool toggle on the customer detail page needs no change: it already
  permits `currentUser.id === user.id` regardless of role
  ([customers/[id]/page.tsx:464](../../../app/(dashboard)/customers/[id]/page.tsx)),
  so a manager can already flip their own slot's pool from either list.

## Nav badge

"My Customers" tab badge = count of the manager's own assigned customers
currently in the default ("New") stage — same formula as the existing SP
badge on the "Customers" tab (`newStageCustomerCount` in
[MainNav.tsx](../../../components/MainNav.tsx)), just generalized from
"SALESPERSON only" to "current user's own slot, when role is SALESPERSON
or MANAGER".

## Implementation shape

Extract the list-rendering portion of `CustomersPage` (filter card + table,
currently branching on `isSalesperson`) into a shared component,
`CustomerListView`, parameterized by `scope: "own" | "all"` instead of
reading `currentUser.role` directly for that branching:
- `scope === "own"`: filter to own slot, pool tabs, hide Assigned To,
  own-stage badge, new-stage-first sort.
- `scope === "all"`: current ADMIN/MANAGER behavior (unified list, no pool
  tabs, all assignees shown, created-date-desc sort).

`/customers/page.tsx` keeps the create form, export modal, and page chrome;
it computes `scope` from role (`SALESPERSON` → `"own"`, `ADMIN`/`MANAGER`
→ `"all"`) and renders `CustomerListView`.

`/my-customers/page.tsx` is a thin page: role guard, then renders
`CustomerListView` with `scope="own"` forced (no create form, no export,
no role-based scope switch — always "own" regardless that the viewer here
is always MANAGER).

## Out of scope

- Any change to pool toggle permissions (already correct per-slot-occupant
  check, independent of role).
- SALESPERSON gets no new tab — their existing `/customers` already is
  their "own" view.
- ADMIN gets no "My Customers" tab — admins aren't assignees
  (`assigneeOptions` already excludes `role === "ADMIN"` in
  `NewCustomerForm`).
- Any change to `/customers` MANAGER behavior itself.

## Testing

Manual verification only (matches existing precedent — no test framework
for UI-level features in this codebase):
- As MANAGER with customers assigned to self: "My Customers" tab shows
  only those, Active/Potential tabs filter correctly by own slot's pool.
- As MANAGER with no customers assigned to self: tab shows empty list, no
  errors.
- Toggle own slot's pool from the customer detail page reached via "My
  Customers": list reflects the change without a full reload.
- As SALESPERSON or ADMIN: "My Customers" tab is absent from nav; direct
  navigation to `/my-customers` redirects away.
- `/customers` for MANAGER is unchanged (unified list, no pool tabs, all
  assignees visible, create/export still present).
- Nav badge count matches the number of the manager's own assigned
  customers in the default stage.
