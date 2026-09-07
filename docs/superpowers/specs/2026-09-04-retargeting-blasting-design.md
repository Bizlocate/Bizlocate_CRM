# Retargeting Blasting

## Context

Weekly workflow today (informal, off-system): in the team meeting each
salesperson tells their manager what kind of old-customer leads they want
(by business name keyword, area+subarea, or business type) for WhatsApp
blasting. The manager relays the ask to admin, who manually filters the
master customer DB and sends the list to the salesperson outside the
system. This spec brings that whole loop into the CRM: manager submits the
ask, admin approves with a quantity cap, the salesperson gets a
copy-friendly phone/name list that self-expires, and afterward can request
their manager assign back whichever customers responded.

Blasting never touches customer assignment — a customer can be blasted to a
salesperson while still assigned (or unassigned, or assigned to someone
else) elsewhere in the system. Assignment only happens if/when the
salesperson later requests it back and their manager approves. This is what
lets the source pool be "the entire customers table, regardless of current
assignment state" per this round's requirements.

## Data model

### `blast_requests`

One row per salesperson per criteria ask. A manager's weekly submission
creates one row per team member in a single form action, but each row has
its own independent lifecycle from there (mirrors how `removal_requests`
rows are independent even though a user might submit several).

- `id`
- `requested_by` (→ profiles, the manager)
- `salesperson_id` (→ profiles, who the list is for)
- `business_name_keyword` (text, nullable — substring match)
- `area_id` (→ areas, nullable)
- `sub_area_id` (→ areas/sub-areas, nullable)
- `business_industry_id` (→ business_tag_industries, nullable)
- `business_category_id` (→ business_tag_categories, nullable)
- `business_type_id` (→ business_tag_types, nullable)
- `status`: `'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'`
- `approved_total` (nullable, set on approve — how many customers admin
  approved, ≤ the matching count at approve time)
- `locked_expiry_days` (nullable, set on approve — see Expiry below)
- `resolved_by`, `resolved_at` (nullable)
- `created_at`

All six criteria fields are independently optional; a blank field means
"match all" for that dimension. Matching is AND across whichever fields are
filled, using the same dropdown-backed lookups already used elsewhere on the
customer profile form (area→sub-area cascade, business industry→category→
type cascade) plus a plain substring match on `customers.businessName` for
the keyword. The industry/category/type fields map to `Customer.businessIndustryId` /
`businessCategoryId` / `businessTypeId` — the existing three-level business
tag hierarchy, not a single flat field.

### `blast_items`

The actual customers drawn once a request is approved.

- `id`
- `blast_request_id` (→ blast_requests)
- `customer_id` (→ customers)
- `batch_index` (1, 2, 3… — customers are split into batches of 50, in the
  order drawn)
- `unlocked_at` (nullable timestamp — null while the batch is locked)
- `status`: `'PENDING' | 'DONE' | 'EXPIRED'`
- `remark` (text, nullable)
- `done_at` (nullable)
- `created_at`

Sampling order: `customer.createdAt` descending (newest customers first).
No duplicate `customer_id` within the same `blast_request` across its
batches. Duplicate customers across *different* requests (same or
different salesperson) are allowed and not checked — accepted overlap, not
a bug.

### `blast_claim_requests`

Batched "assign these back to me" asks a salesperson submits after
blasting.

- `id`
- `requested_by` (→ profiles, the salesperson)
- `customer_ids` (array of → customers)
- `status`: `'PENDING' | 'APPROVED' | 'REJECTED'`
- `resolved_by`, `resolved_at` (nullable)
- `created_at`

## Approval flow

### Manager submits (`/blast-requests`)

New page, add-a-row form: pick a team member — the dropdown includes the
manager themselves alongside their salespeople, since a manager can
request a blasting list for their own use too, not only for their team —
optionally fill business name keyword / area+subarea / business type (all
optional — a member who doesn't need blasting is simply left off the
form). Submitting creates one `blast_requests` row per filled-in member
row, all `PENDING`. The manager can also see their own submitted requests
and current status on this page.

A manager who targets themselves shows up on their own `/blasting` list
exactly like a salesperson does (the page is role-agnostic, scoped only by
`salespersonId === currentUser.id`) — the nav tab is visible to
MANAGER as well as SALESPERSON for this reason.

### Admin approves (`/admin/blast-requests`)

Same shared-component two-route pattern as Agent Log / Remove Approvals.
Lists every `PENDING` request: manager, salesperson, criteria, and a live
matching count computed client-side against the already-loaded `customers`
array (same filtering approach the rest of the store already uses — no new
server aggregation).

Per row, admin types `approved_total` (defaults to the live matching count,
editable downward) and `locked_expiry_days`, then clicks Approve. On
approve:

1. Draw `approved_total` customers per the sampling rule above (newest
   first).
2. Split into batches of 50 (`batch_index` 1..k).
3. Batch 1 unlocks immediately (`unlocked_at = now`); the rest stay locked.
4. Set `resolved_by`, `resolved_at`, `status = 'APPROVED'`.

Reject is a plain status flip to `REJECTED`, no reason required (matches
the existing `removal_requests` reject convention).

### Salesperson views the list (`/blasting`)

New tab, visible to every role but scoped to "my own" for a salesperson —
matches the shared-route pattern from Inactive Listings / To Do rather than
the admin/team split.

Shows only this salesperson's `blast_items` where the parent request is
`APPROVED`, the item's batch is unlocked, and the item isn't expired.
Grouped/tabbed by batch, with a simple indicator of how many batches exist
in total and how many are unlocked (e.g. "Batch 1 of 3 — 2 locked").

Each row: customer name + phone number (one-click copy button), a remark
text box, and a Done/Pending status. The row links through to the full
customer detail page (`/customers/{id}`) exactly like any other customer
link in the app — no restricted view; the phone/name-with-copy treatment is
about making the *list* fast to scan, not about hiding data behind it.

Marking an item Done happens two ways:
- Typing a remark and submitting it on the blasting list row, or
- Logging any activity on that customer from its detail page while it's
  still an active (unlocked, unexpired) blast item for the current user —
  the existing `logActivity` path checks for a matching open `blast_items`
  row for `(customerId, currentUser)` and flips it to `DONE` as a side
  effect.

Either path sets `status = 'DONE'`, `done_at = now`. The row stays visible
in the list (just shown as Done) until the batch's own 7-day expiry clears
it — Done doesn't remove it early.

Checking multiple rows and clicking "Request Assign to Me" creates one
`blast_claim_requests` row with those `customer_ids`, status `PENDING`.

### Manager approves claims (`/team/blast-claims`)

New tab. Lists `PENDING` claim requests made by this manager's own team
members — scoped by `requested_by`'s team, deliberately **not** filtered by
the customers' own area (a manager's usual area-scoping is bypassed here on
purpose, since blasting can legitimately cross into other areas).

Approve: for each `customer_id`, call the existing `reassignCustomer`
into the requester's first empty slot — reusing existing slot-occupancy and
`activePoolLimit` checks as-is. A customer that fails (e.g. no empty slot,
limit hit) is reported individually and skipped; it doesn't block the rest
of the batch. Successfully assigned customers get the normal
`createNotification` used elsewhere for assignment.

Reject: status flips to `REJECTED`, nothing else changes. The underlying
`blast_items` rows are untouched — if they haven't expired, the salesperson
can select and re-submit a claim request for the same customers later.

## Unlock / expiry mechanics

Compute-on-load sweep, same style as the existing `sweepStalePool` in
[lib/store.tsx](../../../lib/store.tsx) — no cron infrastructure exists in
this project, so none is added here either.

On every store load, for each `APPROVED` `blast_request`:

1. **Unlock check** — find the highest-`batch_index` batch with a non-null
   `unlocked_at`. If ≥20% of its items are `DONE` and a next batch exists
   and is still locked, set that next batch's items' `unlocked_at = now`.
2. **Unlocked-batch expiry** — for every already-unlocked batch, if
   `now - unlocked_at >= 7 days`, flip every item in that batch (`DONE` or
   `PENDING`) to `status = 'EXPIRED'`. This clock is fixed at 7 days and is
   independent per batch — it does not depend on `locked_expiry_days`.
3. **Locked-queue expiry** — if `now - resolved_at >= locked_expiry_days`
   and any batch still has no `unlocked_at`, the whole request expires:
   `blast_requests.status = 'EXPIRED'`, and every still-locked item across
   every locked batch is flipped to `status = 'EXPIRED'`. Batches that had
   already unlocked before this point are untouched and keep running out
   on their own 7-day clocks from step 2.

`ponytail: compute-on-load sweep, not a scheduled job — same lag tolerance
already accepted for the pool sweep. Upgrade path: a real cron/edge
function if same-instant precision ever matters.`

`EXPIRED` items are excluded from the salesperson's `/blasting` view but
the rows stay in the DB (soft state, not a delete) for admin-side history —
matches how `removal_requests`/`blast_requests` keep resolved rows around
rather than deleting them.

## Nav & role visibility

- **Manager**: `Blast Requests` tab (`/blast-requests`) — submit asks, see
  own submission history/status.
- **Admin**: `Blast Approvals` tab (`/admin/blast-requests`) — approve/
  reject pending requests. Admin does not see or act on claim requests —
  that's manager-only.
- **Manager** (additional): `Blast Claims` tab (`/team/blast-claims`) —
  approve/reject their team's claim requests.
- **Salesperson**: `Blasting` tab (`/blasting`) — view unlocked list, mark
  done, submit claim requests.
- Nav badges: salesperson's badge = count of own `PENDING` blast items
  currently visible (unlocked, unexpired). Manager's badge = count of
  `PENDING` `blast_claim_requests` from their team.

## Out of scope

- Deduplicating a customer who gets blasted to multiple salespeople across
  different requests — accepted overlap, not checked.
- Admin/manager hand-picking specific customers instead of the automatic
  oldest-first sample.
- Any change to existing pool/assignment behavior from blasting itself —
  assignment only ever changes via claim approval, which reuses
  `reassignCustomer` unmodified.
- A rejection reason on either `blast_requests` or `blast_claim_requests`
  rejection — plain reject, matching `removal_requests` convention.
- Re-submitting a rejected `blast_request` — the manager can submit a new
  row with the same criteria at any time; no "resubmit" affordance needed.

## Testing

Manual (matches repo convention — no automated test framework):

- Manager submits a multi-row request (some members with criteria, some
  skipped). Confirm only filled-in rows create `blast_requests`.
- Admin sees live matching count update as criteria change; approves with
  `approved_total` less than the live count and a `locked_expiry_days`
  value. Confirm batch 1 (up to 50 items) unlocks immediately, later
  batches stay locked.
- As the salesperson: confirm `/blasting` shows only batch 1, with
  name+phone+copy+remark per row, and clicking through opens the full
  customer profile.
- Mark ~20% of batch 1 done via remark; reload; confirm batch 2 unlocks.
  Log an activity directly on a batch-1 customer's profile instead of using
  the remark box; confirm that also flips it to Done.
- Backdate a batch's `unlocked_at` past 7 days; reload; confirm every item
  in that batch (done or not) disappears from the salesperson's view.
- Backdate a request's `resolved_at` past `locked_expiry_days` while a
  batch is still locked; reload; confirm the whole request and all
  remaining locked batches expire, while any already-unlocked batch is
  unaffected.
- Salesperson selects several done items, submits a claim request. As the
  manager, confirm it appears on `/team/blast-claims` even for a customer
  outside the manager's own area; approve it and confirm the customer gets
  assigned into an empty slot with a notification sent. Reject a different
  claim and confirm the customer stays claimable again later (until it
  expires).
- Confirm admin never sees `/team/blast-claims` content and a different
  manager (not the requester's own) never sees another team's claims.
