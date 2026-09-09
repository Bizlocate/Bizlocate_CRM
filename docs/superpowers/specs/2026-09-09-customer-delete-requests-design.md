# Customer Delete Requests (manager requests, admin approves via existing Delete)

## Context

Only ADMIN can delete a customer today — the Delete button on the customer
detail page ([app/(dashboard)/customers/[id]/page.tsx](../../../app/(dashboard)/customers/[id]/page.tsx))
is admin-only, and `customers_delete_admin` RLS backs that up at the DB
level. Deletion is permanent: `deleteCustomer` hard-deletes the row and every
FK'd table (`activities`, `tasks`, `deal_closures`, `blast_items`,
`removal_requests`, `customer_change_log`, …) cascades with it.

MANAGER gets no delete access at all right now. This adds a request/approve
gate in front of the same existing delete action — a MANAGER can request
that a customer (within their own team's assignments) be deleted; an ADMIN
sees the pending request, opens the customer's profile, and deletes it with
the same Delete button that's always been there. No new deletion code path,
no email/push notification — this follows the same
request-table-with-status + nav-badge + approval-page pattern already used
by `removal_requests` and `blast_requests`.

## Data model

New table, `customer_delete_requests`:
- `id`, `created_at`
- `customer_id` — `references customers (id) on delete set null`. Not
  `cascade`: once the customer is actually deleted the request row must
  survive as history, not vanish with it.
- `customer_name`, `business_name` — snapshotted at request time. Once the
  customer is deleted, `customer_id` is null and there's no other way to
  show which customer a resolved request was about.
- `requested_by` — the manager (`references profiles`).
- `status` — `'PENDING' | 'APPROVED' | 'REJECTED'`, default `PENDING`.
- `resolved_by`, `resolved_at` — set when `deleteCustomer` closes out a
  matching pending row (APPROVED), or when an admin rejects (REJECTED).

`create unique index customer_delete_requests_one_pending on
customer_delete_requests (customer_id) where status = 'PENDING';` — same
one-pending-at-a-time rule `removal_requests` already enforces.

`lib/types.ts`: `CustomerDeleteRequestStatus`, `CustomerDeleteRequest`
(mirrors `RemovalRequest`'s shape).

## RLS

- `insert`: `requested_by = auth.uid()`, requester is a MANAGER, and
  `is_customer_assignee(...)` holds for the target customer — the same
  helper `tasks_insert` already uses, and it already resolves to "the
  customer has an assignee on my team," so no separate team check is
  needed.
- `select`: admin sees everything; `requested_by = auth.uid()` so a manager
  sees their own submissions' status.
- `update`: admin only (resolving, whether via reject or the delete
  auto-close described below).

## Manager: requesting a delete

Customer detail page, in place of the current `currentUser.role ===
"ADMIN"` block:
- ADMIN: existing "Delete" / "Confirm delete?" button, unchanged.
- MANAGER: "Request Delete" button. If a PENDING request already exists for
  this customer, it renders disabled as "Delete request pending" instead —
  same idea as `alreadyPending` in `requestClientRemoval`.
- Everyone else: nothing, same as today.

`requestCustomerDelete(customerId)` in `lib/store.tsx`: checks for an
existing pending request client-side (mirrors `requestClientRemoval`'s
guard), then inserts a row with `customer_name`/`business_name` snapshotted
from the current `customers` array. No reason/remark field — confirmed not
needed.

## Admin: approval queue

New page `/admin/delete-approvals` (admin-only nav tab, next to Blast
Approvals, badge = pending count — same convention as
`pendingRemovalCount`/`pendingBlastRequestCount` in `MainNav.tsx`), backed
by a new `CustomerDeleteApprovalsBrowser` component modeled on
`RemovalApprovalsBrowser`:
- Each pending row links to `/customers/${customerId}` (same as
  `RemovalApprovalsBrowser` already does) and shows requester + snapshotted
  customer/business name + submitted date.
- A **Reject** button right there on the row — `resolveCustomerDelete(id,
  false)` just flips status to REJECTED, no customer touched.
- **No Approve button on this page.** Approval happens by the admin opening
  the customer's profile and using the existing Delete button — the actual
  deletion has exactly one code path, the one that already exists.

## Closing the loop: `deleteCustomer` resolves its own pending request

`deleteCustomer(customerId)` gets one addition: alongside deleting the
customer row, it looks for a PENDING `customer_delete_requests` row with
that `customer_id` and updates it to APPROVED (`resolved_by: currentUser.id,
resolved_at: now`) in the same call. This runs every time a customer is
deleted — whether the admin arrived via the approval queue or just deleted
the customer on their own initiative with no request pending at all (in
which case there's nothing to resolve, a no-op). One delete path, and a
request can never end up dangling PENDING against a customer that no longer
exists.

## Out of scope

- Email/push notifications — nav badge + approval page only, matching every
  other request/approve flow in this app.
- A manager-facing history list of their own past delete requests — the
  disabled "Delete request pending" state on the customer page is the only
  feedback surface.
- Any change to what deletion actually does (still permanent, still
  cascades) — this only gates *who can trigger it* for a MANAGER.

## Testing

Manual verification only, matching every other request/approve feature in
this app (no test framework precedent for UI-level features):
- MANAGER requests delete on a customer with a teammate assignee; confirm
  the button goes to "Delete request pending" and a second request is
  blocked.
- MANAGER attempts this on a customer with no assignee from their team —
  confirm RLS rejects the insert (button shouldn't even be reachable, since
  the manager can't load that customer's profile in the first place).
- ADMIN sees it on `/admin/delete-approvals` with the snapshotted name;
  Reject flips it to REJECTED and the MANAGER's button reverts to
  requestable.
- ADMIN opens the customer's profile from the approvals link and deletes it
  — confirm the request row flips to APPROVED with `resolved_by`/
  `resolved_at` set, and the customer + its cascaded rows are gone.
- ADMIN deletes some unrelated customer with no pending request at all —
  confirm `deleteCustomer` doesn't error out with nothing to resolve.
