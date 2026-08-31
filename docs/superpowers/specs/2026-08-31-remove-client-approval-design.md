# Remove client approval workflow

## Context

Fifth and last slice of the "system flow upgrade" request (D+E, Update/Cancel,
auto-second-assign, and pipeline-stage-rework are all shipped). Covers: a
sales person (or any assignee) removing themselves from a customer requires
a reason and admin/manager approval — the assignee doesn't get to
unassign themselves unilaterally. This does **not** delete the customer
record — it only clears one assignee slot, exactly like an admin manually
clearing a slot today.

## Integration point: it's a Stage-picker option, not a separate button

Builds directly on the pipeline-stage-rework slice just shipped: the
Activity Log form's Stage `<select>` (rendered only for a user who
occupies a slot on this customer) gets one more option, "Remove Client" —
a fixed sentinel value, **not** a row in `pipeline_stages` (it's an exit
action, not an ongoing pipeline position, so it must never show up as a
"current stage" anywhere a real stage would). Picking it and clicking
"Log" does not go through the normal stage-save/closed-amount path at
all — it opens a **reason modal** instead (same UI shape as the
`requiresAmount` amount modal added in the previous slice): a required
Reason dropdown (admin-managed lookup) + Confirm/Cancel. Confirming
creates a request; nothing else in the form (content/type/follow-up) is
submitted with it — this is its own dedicated action, not a log entry.

## Data model

`removal_reasons` — new flat lookup table (`id`, `name`), same shape as
`budgets`/`lead_sources`. Admin-managed via the existing generic
`/admin/profile-lists` page (`LookupListEditor`) — a 10th entry alongside
Source/Property Type/.../Budget, no new admin page.

`removal_requests` — new table:
- `id`, `customer_id` (→ customers), `slot` (1/2/3), `requested_by` (→
  profiles), `reason_id` (→ removal_reasons), `status`
  (`'PENDING' | 'APPROVED' | 'REJECTED'`), `resolved_by` (→ profiles,
  nullable), `resolved_at` (nullable), `created_at`.
- A customer+slot can only have one `PENDING` request at a time — the
  store blocks submitting a new one while one is outstanding for that
  slot (checked client-side against loaded state, same pattern the
  existing "same person can't be assigned twice" check already uses).

## Who can request, who can approve

- **Request:** whoever occupies the slot — role-agnostic (SALESPERSON,
  or a MANAGER/ADMIN who happens to be an assignee), matching how stage
  editing itself is already scoped to "whoever's in that slot."
- **Approve/Reject:** ADMIN (sees every pending request) or MANAGER
  (sees only requests where the customer's assignees share their team —
  same scoping `is_customer_assignee()` already gives every other
  team-scoped view in this app). A MANAGER cannot approve/reject their
  own request if they're also the requester — RLS restricts the
  `update` to ADMIN/MANAGER role, but a MANAGER approving their own
  submitted request isn't specially blocked; out of scope, same trust
  level this app already extends to a MANAGER acting on their own team.

## Approve / Reject behavior

- **Approve:** marks the request `APPROVED` (`resolved_by`,
  `resolved_at`), then clears the slot by calling the **existing**
  `reassignCustomer(customerId, slot, null)` — reused as-is, not
  reimplemented. That already clears the assignee, pool, and (since the
  pipeline-stage-rework slice) the slot's stage, and does **not** touch
  the customer row itself in any other way — the customer profile is
  never deleted.
- **Reject:** marks the request `REJECTED` (`resolved_by`,
  `resolved_at`). The slot is untouched — the assignee keeps the
  customer, and their last real stage (which was never modified by
  submitting the request) is what the badge goes back to showing.
- Either outcome sends the requester a notification via the existing
  `createNotification` mechanism (same one assignment/reassignment
  already uses).

## UI

**Customer detail page:**
- Stage `<select>` in the Log form gets a "Remove Client" option at the
  end (after every real stage).
- Picking it and clicking "Log" opens the reason modal instead of
  submitting normally. Cancel aborts — nothing saved. Confirm (with a
  reason picked) creates the `PENDING` request.
- While a slot has a `PENDING` request, its read-only header badge (the
  one showing stage today) shows "Removal Pending" instead of the real
  stage name — for everyone viewing the customer, including the
  requester. Once resolved, the badge reverts to showing the real
  current stage (rejected) or the slot disappears entirely (approved,
  since the assignee is gone).

**New admin/manager tab, "Remove Approvals":** same shared-component,
two-route pattern the existing Agent Log feature already uses
(`/admin/agent-logs` + `/team/agent-logs` both render
`<AgentLogBrowser>`) — `/admin/remove-approvals` and
`/team/remove-approvals` both render a new `<RemovalApprovalsBrowser>`,
added to `AdminTabs` and `MainNav` the same way Agent Log was. Lists
pending requests (customer name, who requested, which slot, reason,
when), Approve/Reject buttons per row.

## Out of scope

- The requester cancelling/withdrawing their own pending request — not
  requested.
- A rejection reason/note from the approver — plain reject, no reason
  required back.
- Any change to hard-delete of a customer record — this workflow never
  touches that; `deleteCustomer` (admin-only, already exists) is a
  completely separate, untouched action.

## Testing

Manual (matches existing repo convention — no test framework):
- As an assignee, open the Log form, confirm "Remove Client" is the last
  Stage option. Pick it, click Log — confirm the reason modal opens
  instead of a normal save, Cancel saves nothing, Confirm with a reason
  creates a request and the slot's badge switches to "Removal Pending"
  immediately.
- Confirm submitting a second removal request for the same already-
  pending slot is blocked.
- As ADMIN: see the request on `/admin/remove-approvals`, Approve it —
  confirm the slot clears (assignee/pool/stage all gone), the customer
  record itself still exists and loads fine, and the requester gets a
  notification.
- As MANAGER: confirm `/team/remove-approvals` only shows requests for
  your own team's customers, not company-wide.
- Reject a different request — confirm the slot and its stage are
  unchanged, and the badge reverts from "Removal Pending" back to the
  real stage name.
