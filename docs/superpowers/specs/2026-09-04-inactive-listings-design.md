# Inactive Listings design

## Problem

Two things don't exist today:

1. Active-pool (`pool = ACTIVE`) customers with no activity log from their assignee never get auto-cleared. Only the potential pool (`pool = INACTIVE`) has an auto-pull sweep (`sweepStalePool` in [lib/store.tsx](../../../lib/store.tsx), 60 days, silent).
2. No warning before either pull happens — a salesperson only finds out a listing was pulled after the fact (or never, since the sweep is silent).

## Scope

- Auto-pull the active pool after 30 days of no log from the assignee (mirrors the existing 60-day potential-pool sweep).
- A new "Inactive Listings" tab that warns before either pull: active pool at day 25+, potential pool at day 50+.
- Visible to every role, scoped differently: salesperson sees their own; manager sees their team's, with Area + Member filters; admin sees everyone, same filters.
- Red badge count on the nav tab (and per-option counts in the Area/Member filter dropdowns), matching the existing Remove Approvals pattern.

Out of scope: notifications/emails for the reminder (the tab + badge *is* the reminder, consistent with how Remove Approvals already works — no push notification system exists here); changing the potential-pool sweep threshold or logic (already correct).

## Staleness calc

**Potential pool (INACTIVE):** unchanged — `lastTouched = max(pool*Since, last own activity)`. Warn at `now - lastTouched >= 50 days`. Auto-pull already fires at 60 days (`sweepStalePool`).

**Active pool (ACTIVE):** new. `pool*Since` is always null for ACTIVE (only set on transition to INACTIVE — see `togglePool` in [lib/store.tsx:1786](../../../lib/store.tsx)), so the anchor is last-log-only:

```
lastTouched = last own activity on this customer, else customer.createdAt
```

Warn at `now - lastTouched >= 25 days`. Auto-pull at `>= 30 days`.

"Own activity" = an `Activity` row where `authorUserId` matches the slot's assignee and `customerId` matches — same filter `sweepStalePool` already uses for the potential-pool case.

## Auto-pull (extend `sweepStalePool`)

Generalize the existing per-slot sweep in `lib/store.tsx` to run both thresholds in one pass over the three slots of every customer:

- `pool === "INACTIVE"` → 60-day threshold, anchor `pool*Since`
- `pool === "ACTIVE"` → 30-day threshold, anchor `customer.createdAt` (no `pool*Since` available)

Both branches use the same "last own activity" lookup and the same clearing behavior already in place (null out that slot's assignee/pool/since/stage, admin sweeps every slot, non-admin sweeps only their own). No behavior change for existing INACTIVE handling — just adding the ACTIVE branch alongside it.

## New tab

**Route:** `app/(dashboard)/inactive-listings/page.tsx`, one route for all roles (unlike Remove Approvals' separate `/admin/...` and `/team/...` routes — a salesperson needs to land here too, so a single shared page reads `currentUser.role` and adjusts what it shows).

**Nav:** add to `MainNav.tsx`'s tab list unconditionally (not gated behind `role !== "SALESPERSON"` like Agent Log / Remove Approvals). Badge = count of all warn-eligible slots (active day25+ plus potential day50+) within the viewer's own scope, same red-pill style as the existing `pendingRemovalCount` badge.

**Component:** `components/InactiveListingsBrowser.tsx`, modeled on `RemovalApprovalsBrowser.tsx`. Two stacked sections:

- **Active Pool — 25+ days no update** (table)
- **Potential Pool — 50+ days no update** (table)

Row columns: Customer name, Business Name, Area, Assignee (omitted for a salesperson viewing their own list — always themselves), Days stale, linking to `/customers/{id}` (same `Link` pattern as `RemovalApprovalsBrowser`).

**Scoping:**
- SALESPERSON: only their own assignee slots. No filters shown.
- MANAGER: slots whose assignee is on the manager's team (`users.filter(u => u.teamId === currentUser.teamId)`, same set `visibleCustomers` already builds in `lib/store.tsx`). Area filter limited to areas owned by the manager's team (`areas.filter(a => a.teamId === currentUser.teamId)`, same scoping `RemovalApprovalsBrowser` already does). Member filter limited to the manager's team members.
- ADMIN: everyone. Area filter lists all areas, Member filter lists all salespeople (managers/admins aren't listing assignees, so no need to include them — matches the existing "exclude ADMIN from assignee candidates" convention from the `39263c9` commit).

Filter dropdowns follow the existing "Name (N)" plain-text count pattern from `RemovalApprovalsBrowser`'s Area dropdown — no colored badges inside a `<select>`.

## Files touched

- `lib/store.tsx` — extend `sweepStalePool` to cover the ACTIVE branch.
- `components/InactiveListingsBrowser.tsx` — new.
- `app/(dashboard)/inactive-listings/page.tsx` — new.
- `components/MainNav.tsx` — add the tab + badge.
