# Auto second-assignment refinements (area toggle, 7-day window, stage gating)

## Context

Follow-up to the existing auto second-assignment feature (3-day, round-robin
by area's team — see
[`2026-08-31-auto-second-assign-design.md`](2026-08-31-auto-second-assign-design.md),
implemented in `sweepAutoSecondAssign` in `lib/store.tsx`). Five requested
changes:

1. Per-area on/off switch for auto-assign, admin-toggleable at any time.
2. The 3-day wait before 2nd-assign becomes 7 days.
3. A customer whose slot-1 stage is "appointment"/"nego" (or any stage an
   admin flags as such) does not get an immediate 2nd-assign at the 7-day
   mark.
4. Instead, that customer gets its 2nd-assign once its slot-1 stage has sat
   untouched (no log) for 14 days.
5. Round-robin must continue from wherever it left off across days/sweeps,
   never restarting from the first team member. **Already true** of the
   current implementation — `teams.last_auto_assigned_user_id` is persisted
   in the DB and read back as the rotation pointer on every sweep call, so
   this item requires no code change. Confirmed with the requester; noted
   here only so this spec accounts for all 5 numbered points.

Every customer gets exactly one 2nd-assign, via exactly one of two mutually
exclusive paths, both gated from the same `createdAt` clock:

- **Path A (normal stage):** at the 7-day mark, if the customer's slot-1
  stage is *not* flagged as excluded, 2nd-assign fires immediately.
- **Path B (appointment/nego stage):** if the slot-1 stage *is* flagged as
  excluded (whether it already was at the 7-day mark, or became so before
  then), the 7-day gate is replaced by a 14-day-idle gate: 2nd-assign fires
  once nobody has logged activity on the customer for 14 days.

Since `assignedToUserId2` is set exactly once and the sweep's first check is
already "skip if slot 2 is filled," these two paths can never both fire for
the same customer.

## Data model

Two new columns, both admin-editable, both default to today's behavior:

- `areas.auto_assign_enabled boolean not null default true` — off means the
  sweep skips every customer in that area entirely (both the existing
  round-robin logic and the new stage gating below never run for them).
- `pipeline_stages.exclude_from_auto_assign boolean not null default
  false` — admin flags which pipeline stages (e.g. "Appointment",
  "Negotiation") count as "in progress, don't auto-assign yet." Stage names
  are admin-configured free text (`/admin/stages`), not a fixed enum, so
  this is a flag rather than a hardcoded name match — renaming a stage
  never silently breaks the gating.

`lib/types.ts`: `Area` gains `autoAssignEnabled: boolean`; `Stage` gains
`excludeFromAutoAssign: boolean`.

## Sweep logic changes (`sweepAutoSecondAssign`)

Existing trigger conditions (slot 2 empty, slot 1 set, area resolves to a
team with a non-empty candidate pool) are unchanged. Two conditions are
added/changed, evaluated in order:

1. **Area switch (new):** if `area.autoAssignEnabled === false`, skip this
   customer. (Whole-area skip — no partial effect on rotation pointer.)
2. **Timing gate (changed):** resolve the customer's slot-1 stage
   (`stagesList.find(s => s.id === c.stage1Id)`).
   - If that stage is missing or `excludeFromAutoAssign` is false (or
     `stage1Id` is null): **Path A** — same as today but 7 days instead of
     3: skip unless `now - createdAt >= SEVEN_DAYS_MS`.
   - If that stage has `excludeFromAutoAssign === true`: **Path B** —
     compute `lastTouched` the same way the existing 60-day
     `sweepStalePool` computes staleness: `max(pool1Since ?? createdAt,
     latest activity-log entry on this customer authored by
     assignedToUserId)`. Skip unless `now - lastTouched >=
     FOURTEEN_DAYS_MS`.

Rotation, candidate pool, and `activePoolLimit` logic below the timing gate
are unchanged (per point 5, already correct).

**Signature change:** `sweepAutoSecondAssign` gains an `activitiesList:
Activity[]` parameter (needed for Path B's `lastTouched`). Both call sites
(initial-load effect and `login()`) already have `loadedActivities` in
scope at the point they call this function today — pass it through.

## Admin UI

- **`/admin/area`:** each area row gets an "Auto Assign" checkbox next to
  the existing Team dropdown (same row, no new page). New store method
  `updateAreaAutoAssign(id: string, enabled: boolean)`, mirroring
  `updateAreaTeam`'s optimistic-update-with-rollback style.
- **`/admin/stages`:** each stage row gets a "Skip auto-assign" checkbox
  next to the existing "Requires closed amount" checkbox. New store method
  `updateStageExcludeFromAutoAssign(id: string, excluded: boolean)`,
  mirroring `updateStageRequiresAmount`'s plain (no-rollback) style.

## Out of scope

- Scheduled/time-window auto-assign (e.g. "off between 6pm–9am") — this is
  a manual on/off switch only, per the requester's own framing ("过后可以开
  回系统继续做auto assign的动作").
- A dedicated "stage entered at" timestamp — Path B reuses the existing
  `pool1Since` + activity-log signal (same one `sweepStalePool` already
  uses), rather than adding new schema to track exactly when a customer
  entered its current stage.
- Any change to slot-1 assignment, slot 3, manual reassignment, or the
  round-robin/pool-limit mechanics themselves.

## Testing

Manual verification only (matches existing repo convention — no test
framework):

- Toggle an area's Auto Assign off, confirm a pending customer in that area
  is never 2nd-assigned regardless of age/stage; toggle back on, confirm it
  gets picked up on the next admin-session load.
- Flag a stage as "Skip auto-assign," assign a customer's slot-1 stage to
  it before the 7-day mark — confirm no 2nd-assign fires at 7 days.
- For that same customer, confirm 2nd-assign fires once 14 days pass with
  no activity-log entry from the slot-1 assignee (backdate `pool1Since`/an
  activity, or wait).
- Confirm a customer whose slot-1 stage is never flagged gets 2nd-assigned
  at exactly 7 days (not 3), same round-robin behavior as before.
- Confirm round-robin pointer continues across two separate sweeps on
  different days without resetting to the first team member (regression
  check on point 5 — already covered by existing behavior, no code
  changed).
