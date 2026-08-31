# Pipeline stage rework (per-slot, log-gated, closed-amount capture)

## Context

Fourth slice of the "system flow upgrade" request. Today `customers.stage_id`
is one shared field for the whole customer, editable via a standalone
dropdown at the top of the detail page that commits immediately. This spec
makes stage **per-assignee** (mirrors the existing `pool_1/2/3` pattern),
moves stage-setting into the existing Activity Log form (mandatory before
"Log" can be clicked, reset every time the assignee opens the page), and
adds an amount-capture popup for stages an admin flags as needing one.

Depends on: identity-lock-and-change-log, profile-edit-confirm, and
auto-second-assign specs/plans (all merged). Auto-second-assign's sweep
and the existing 60-day pool sweep both need small follow-on changes here
since they touch assignment slots (see "Follow-on changes to existing
code" below).

## Data model

`customers` — `stage_id` (single, `not null`) is replaced by three
nullable per-slot columns, same shape as `pool_1/2/3`:
- `stage_1`, `stage_2`, `stage_3`: `uuid references pipeline_stages (id)`,
  null when that slot has no assignee.

`pipeline_stages` — one new column:
- `requires_amount boolean not null default false` — admin-managed toggle
  ("does closing a deal at this stage need a dollar amount?").

New table `deal_closures` — append-only, one row per closed-amount
submission (a customer can close, and could theoretically be reopened and
re-close, more than once over its lifetime — this is a log, not a
single overwritable field):
- `id uuid pk`, `customer_id uuid → customers`, `user_id uuid → profiles`
  (who closed it — the assignee, from their slot), `slot smallint` (1/2/3),
  `stage_id uuid → pipeline_stages`, `amount numeric not null`,
  `created_at timestamptz default now()`.

`lib/types.ts`: `Customer` gets `stage1Id/stage2Id/stage3Id: string | null`
replacing `stageId`. `Stage` gets `requiresAmount: boolean`. New
`DealClosure` type mirroring the table.

**Migration for already-provisioned databases:** backfill `stage_1` from
the old `stage_id` where slot 1 is assigned, `stage_2` where slot 2 is
assigned, `stage_3` where slot 3 is assigned (a multi-assignee customer
today implicitly shares one visible stage across all its assignees — this
preserves that as each assignee's starting point instead of resetting
everyone to the default stage on migration day, which would be noisy and
would spuriously trigger every salesperson's "New" list-sort). Then drop
`stage_id`.

## Assignment behavior (extends existing per-slot conventions)

Every place a slot gets a **new** occupant already sets that slot's pool
to `ACTIVE`; it now also sets that slot's stage to the pipeline's default
stage (`stages.find(s => s.isDefault)`), matching what `addCustomer`
already does for the single old field today:
- `addCustomer` (new customer, up to 3 initial assignees).
- `reassignCustomer` (admin manually assigns/reassigns a slot).
- `sweepAutoSecondAssign` (auto second-assignment, already shipped —
  needs a small follow-on change to also set `stage_2` when it fills
  that slot, since it predates this per-slot rework).

Clearing a slot (unassign, or the 60-day `sweepStalePool` auto-removal)
clears that slot's stage the same way it already clears pool state.

## Detail page: stage moves into the Activity Log form

- The standalone "Stage:" dropdown at the top of the page is removed.
- If the current user occupies one of the customer's three slots, opening
  the page resets the Log form's Stage picker to blank — **client-side
  only, no DB write**. (Earlier in this project the "force a re-pick"
  behavior was designed as an actual DB null-out of the shared stage
  field; now that stage is per-slot *and* lives inside the Log form
  instead of a standalone always-visible dropdown, a DB clear buys
  nothing extra — the read-only badges below already solve the "let
  others see the current value" need by reading the real stored value
  directly, so nulling it would only create a pointless gap where every
  other viewer's badge briefly shows "no stage" for no reason. The
  mandatory-reselect requirement is fully satisfied by the blank
  *picker* plus "Log" staying disabled until something's chosen — ship
  this simpler version; say if the DB-level clear is still wanted.)
- The Activity Log form gains a required **Stage** dropdown (only
  rendered for a user who occupies a slot on this customer). Log's
  existing `type`/`content`/`follow-up` fields are unchanged, but
  **content becomes optional** — "Log" now does two things together:
  1. If content was entered, insert an activity row as it does today.
  2. Always (when the user is an assignee): write the selected stage to
     that user's own `stage_N`.
  "Log" is disabled until a stage is selected — this is the "must
  reselect before you can do anything" mechanic from the original
  request, now expressed as a button-disable rather than a page-wide
  block.
- If the selected stage has `requiresAmount`, clicking "Log" first opens
  an amount popup (Confirm/Cancel) instead of submitting immediately;
  confirming submits the log entry (if any), the stage change, and one
  `deal_closures` row together. Cancelling the popup returns to the form
  with nothing submitted yet.
- Read-only stage badges: next to each assignee's name in the page
  header (same visual slot the existing Active/Potential pool badge
  already occupies), show that assignee's current stage name, styled via
  the existing `STAGE_STYLES` lookup (falls back to a neutral style for
  any admin-added stage name not in that map, same as today). This is
  the only way anyone other than that assignee sees their stage — nobody
  else can edit it.

## List page

- **SALESPERSON's own list:** the Stage column/filter now reads that
  user's own slot's stage (whichever of `stage1Id/2/3` matches their own
  assigned slot) instead of the old shared field. Sort order: their own
  "New"-stage customers first, then the rest in the existing order —
  this is the literal "New" on top" requirement from the original
  request.
- **ADMIN/MANAGER list:** the Stage column shows one badge per filled
  slot (same "one entry per assignee" shape the existing "Assigned
  Agent(s)" column already uses) instead of a single value. The Stage
  filter matches a customer if **any** slot's stage equals the selected
  filter.

## Admin: Pipeline Stages page

One new checkbox per stage, "Requires closed amount", wired to
`requiresAmount`. No new page.

## Out of scope

- ADMIN/MANAGER directly overriding a slot's stage when they are not
  that slot's assignee — not requested; they get the read-only badge
  only. Only the person occupying a slot can change that slot's stage,
  via the Log form. Can be added later if a real need shows up.
- Remove-client / approval workflow (separate upcoming slice).
- Any change to how `deal_closures` rows get surfaced on a dashboard —
  this spec only captures the data; reporting is future work.
- Historical activity log entries logged before this change are
  unaffected — they don't retroactively gain a stage association.

## Testing

Manual (matches existing repo convention — no test framework):
- As a fresh SALESPERSON assignee on a new customer: confirm the top
  "Stage:" dropdown is gone, the Activity Log form shows a required
  Stage select (starts blank), and "Log" is disabled until a stage is
  picked.
- Log with a note and a stage: confirm both the activity row and the
  stage change land, and the assignee's badge in the header updates.
- Log with no note, just a stage: confirm the stage still updates and no
  activity row is created.
- Pick a stage flagged `requiresAmount`: confirm the amount popup
  appears, Cancel aborts the whole submission (nothing saved), Confirm
  saves the stage + log + a new `deal_closures` row.
- With two assignees on one customer: confirm each one's Log form/stage
  is fully independent — one submitting doesn't affect the other's blank
  state or badge.
- As ADMIN/MANAGER not assigned to a customer: confirm you see read-only
  stage badges per assignee and no editable stage control anywhere.
- On the SALESPERSON customer list: confirm your own "New"-stage
  customers sort to the top. On the ADMIN/MANAGER list: confirm the
  Stage column shows one badge per assignee and the filter matches on
  any slot.
- Confirm a fresh `addCustomer`, a manual `reassignCustomer` onto an
  empty slot, and auto-second-assignment (backdate a customer 3+ days,
  reload as ADMIN) all start that slot's stage at the default stage.
- Confirm the 60-day pool auto-removal sweep clears a slot's stage along
  with clearing its assignment, same as it already clears pool state.
