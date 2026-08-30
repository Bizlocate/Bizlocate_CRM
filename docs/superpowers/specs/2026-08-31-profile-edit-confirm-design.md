# Customer profile edit confirmation (Update/Cancel)

## Context

Today, every editable field on the customer detail page
([app/(dashboard)/customers/[id]/page.tsx](../../../app/(dashboard)/customers/[id]/page.tsx))
commits to the DB the instant it changes: a `<select>` fires
`updateCustomerProfile` on `onChange`, and `businessName`/`remark`/`name`/`phone`
fire their respective update functions on blur. A misclick or an accidental
tab-through saves immediately — there's no chance to review or back out.

This spec adds an explicit Update/Cancel step: edits are staged locally,
and only committed when the user clicks Update. Cancel discards every
pending edit and reverts to the last-saved values.

## Scope

**In scope** — everything currently editable on this page except Stage and
Pool, sharing one Update/Cancel button pair:
- Business Profile card: Source, Area, Subarea, Property Type, Purpose,
  Business Industry, Business Category, Business Type, Race, Language,
  Business Name, Firsttime/Branch, Target Race, Target Type, Budget,
  Remark.
- Header identity fields: Name, Phone.

**Out of scope** (explicitly unchanged):
- **Pipeline Stage** dropdown — not part of "business profile", and its
  behavior is being redesigned separately (forced re-selection on every
  visit). Touching it here would conflict with that upcoming work.
- **Pool Active/Potential** toggle — a single deliberate click on a
  binary switch, not a text/dropdown field a stray keystroke could
  corrupt. Trivial to click back if wrong.
- **Admin's Assigned 1/2/3 reassignment** — already a two-step
  select-then-Confirm flow, which is the same safety property this spec
  adds elsewhere.
- **Change History visibility** — already gated to
  `currentUser.role === "ADMIN" || "MANAGER"` (`canEditIdentity`); unaffected
  by this change.

**One layout change alongside this:** the Change History card currently
renders directly after the Business Profile card. It moves to the very
bottom of the page, after the Activity Log / Tasks grid — so the page
reads as Business Profile (with its new Update/Cancel bar) → Activity Log
/ Tasks → Change History last. No change to what it shows or who sees it,
just where it sits.

## Design

**Draft state:** every in-scope field already has (`businessNameDraft`,
`remarkDraft`, `nameDraft`, `phoneDraft`) or gains (one new draft variable
per Business Profile dropdown, e.g. `sourceIdDraft`, `areaIdDraft`, ...) a
piece of local component state. Every field's input handler
(`onChange` for selects, `onChange` for the two text inputs) writes only to
its draft state — no store call happens there anymore. Draft state resets
to the customer's current saved values in the existing `useEffect` keyed on
`customer?.id` (the one that already resets `businessNameDraft`/`remarkDraft`).

**Dirty check:** a single `isDirty` boolean, true when any in-scope draft
differs from the corresponding saved value on `customer`. Cascading
selects (Area→Subarea, Business Industry→Category→Type) keep their
existing clear-child-on-parent-change behavior, but only within draft
state — clearing a child draft still counts toward `isDirty` the same as
any other field.

**Update/Cancel bar:** rendered at the bottom of the Business Profile card
(after Remark), visible only when `isDirty` and the current user can edit
at least one in-scope field (`canEditProfile || canEditRemark ||
canEditIdentity`).
- **Update:** compares each draft to its saved value and, only for the
  groups that actually changed, calls the existing store functions
  unchanged:
  - Any of the 14 dropdown/business-name fields changed →
    `updateCustomerProfile(customer.id, { ...only the changed keys })`.
  - `remarkDraft` changed → `updateCustomerRemark(customer.id, remarkDraft)`.
  - `nameDraft`/`phoneDraft` changed → `updateCustomerIdentity(customer.id, { name?, phone? })`
    (name only sent if the trimmed draft is non-empty, matching the
    existing not-null guard).
  No store or schema changes — this is a UI-only change. The existing
  per-field change-log diffing inside those functions keeps working
  exactly as it does today, since it already only logs fields that
  actually differ.
- **Cancel:** resets every draft back to `customer`'s current values
  (same assignment the `useEffect` does), making `isDirty` false and
  hiding the bar.

**Permissions:** a field the current user cannot edit (e.g. Remark for a
SALESPERSON) keeps its existing read-only rendering — no draft state is
needed for it since it never changes. `isDirty`/`Update`/`Cancel` only
consider fields the current viewer can actually edit.

## Testing

Manual (matches existing repo convention — no automated test framework):
- Change 3 different Business Profile dropdowns without saving, confirm no
  DB write happens (reload the page mid-edit, confirm the old values are
  still there), then click Update, confirm all 3 persist and each produces
  its own Change History row.
- Change Remark and Name together, click Update, confirm both save via
  their respective functions and both log correctly.
- Make edits, click Cancel, confirm every field reverts to the last-saved
  value and the Update/Cancel bar disappears.
- As SALESPERSON: confirm Remark/Name/Phone stay read-only (no drafts, no
  effect on `isDirty`), and that editing an allowed dropdown still shows
  the bar and works.
- Confirm Stage and Pool are completely unaffected — still commit
  immediately on interaction, no Update/Cancel involved.
