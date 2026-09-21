# Auto second-assign: run as a background sweep, not on admin login

## Context

`sweepAutoSecondAssign` ([lib/store.tsx:1076](../../../lib/store.tsx)) only runs as a
compute-on-load side effect when an ADMIN session's browser loads the app — there is no
server-side cron. Its own comment already flags this: "compute-on-load sweep, not
real-time... Upgrade to a cron/edge function sweep if sub-day precision ever matters."
This was the root mechanism behind the 2026-09-21 mass-assignment incident investigated
earlier the same day (a long admin-idle gap let a backlog build up, then one login swept
years of it at once) — the [`2026-09-21-auto-second-assign-eligibility-fix-design.md`](2026-09-21-auto-second-assign-eligibility-fix-design.md)
spec fixed *what* gets swept (legacy-customer exclusion, area-reopen missed-window rule);
this spec changes *when* the sweep runs, so backlog never has a chance to accumulate in
the first place.

The app is hosted on Netlify. This repo already has the two building blocks a background
job needs: `lib/supabase/admin.ts` (`createAdminClient()`, a service-role Supabase client
for server-side code, already used by `app/api/admin/users/route.ts`) and
`lib/autoSecondAssign.ts` (pure, already-tested due-date/eligibility functions with no
React or browser-client dependency).

## Decisions (confirmed with requester)

1. Scope is auto second-assign only. The other two compute-on-load sweeps
   (`sweepStalePool`, `sweepBlastRequests`) stay exactly as they are — still triggered by
   an admin session loading the app. Out of scope for this spec.
2. The client-side trigger is removed, not kept as a fallback. `sweepAutoSecondAssign`
   and its two call sites (the initial-load effect and `login()`) are deleted from
   `lib/store.tsx` — the logic lives in exactly one place after this change, not two
   copies that can drift.
3. Schedule: once a day (`@daily`). The 7-day/14-day thresholds this feature works with
   don't need sub-day precision, and this matches Netlify's simplest, cheapest scheduled
   function tier.
4. No new alerting/observability. A failed run is visible in Netlify's own function logs
   (`console.error` on any thrown error) — nothing further (email, Slack, a DB error log)
   is built now; add it later if a silent failure actually becomes a problem in practice.
5. No endpoint-level secret/auth check. The function only ever writes using the
   service-role key it holds server-side (never exposed to any client); it's never called
   with untrusted input. The sweep is already idempotent (skips any customer whose slot 2
   is filled), so an accidental extra invocation is a no-op, not a hazard — deliberately
   not adding request verification for a function nothing can meaningfully abuse.

## Architecture

Three pieces, matching this repo's existing pure-logic/orchestration split
(`computeSlotAges` + `sweepStalePool`, `computeBlastSweep` + `sweepBlastRequests`):

1. **`lib/mappers.ts` (new)** — the five DB-row → typed-object mapping functions
   (`mapProfile`, `mapArea`, `mapStage`, `mapCustomer`, `mapActivity`) move out of
   `lib/store.tsx` into their own framework-agnostic file. This is a pure relocation, not
   a rewrite — same signatures, same bodies. `lib/store.tsx` imports them from here
   instead of defining them locally; behavior is unchanged. This lets the new server-side
   sweep reuse the exact same row-mapping code the client uses, instead of a second
   hand-copied version that silently drifts the next time a column gets added.

2. **`lib/autoSecondAssign.ts` (extended)** — gains one new exported pure function:

   ```ts
   export interface SecondAssignAction {
     customerId: string;
     areaId: string;
     winnerId: string;
     stageId: string | null; // default pipeline stage to set on slot 2
   }

   export function computeAutoSecondAssignPlan(
     customers: Customer[],
     areas: Area[],
     users: User[],
     stages: Stage[],
     activities: Activity[],
     now: number
   ): SecondAssignAction[]
   ```

   This is the existing loop body of `sweepAutoSecondAssign` (legacy-customer guard, area
   guard, `secondAssignDueAt`/`isSecondAssignDue`, candidate filtering, round-robin
   pointer, `activePoolLimit` check — all of it, verbatim) with every `setCustomers`/
   `setAreas`/`supabase.from(...).update(...)` call replaced by pushing one
   `SecondAssignAction` onto a return array. Same within-one-pass collision handling
   (`pointerByArea`/`extraAssignedCount` locals) as today, since a single daily run can
   still produce multiple actions for the same area.

3. **`netlify/functions/sweep-auto-assign.mts` (new)** — the actual scheduled function:

   ```ts
   export const config = { schedule: "@daily" };

   export default async () => {
     const supabase = createAdminClient();
     // fetch customers, areas (+ area_teams), profiles, pipeline_stages, activities
     // — same five tables/shapes loadCustomers/loadAreas/loadUsers/loadStages/
     // loadActivities already read, via select("*"), mapped with lib/mappers.ts
     const actions = computeAutoSecondAssignPlan(customers, areas, users, stages, activities, Date.now());
     for (const a of actions) {
       // update customers (assigned_to_2/pool_2/pool_2_since/stage_2),
       // update areas.last_auto_assigned_user_id, insert into assignment_events
     }
     console.log(`sweep-auto-assign: ${actions.length} customer(s) assigned`);
   };
   ```

   No new npm dependency — `config`/handler shape needs no `@netlify/functions` import,
   just plain objects and functions (deliberately not adding a devDependency for a
   one-line type). Reads `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` from the
   same Netlify site environment variables the Next.js server routes already use — no new
   env vars to configure, but worth confirming after first deploy since this is the first
   thing on the site that runs *outside* a Next.js request (a scheduled function is a
   separate Netlify build artifact from the Next.js app).

4. **`netlify.toml`** gains an explicit `[functions]` directory declaration
   (`directory = "netlify/functions"`) — Netlify autodetects this by default, but stating
   it removes any ambiguity for a site whose `netlify.toml` currently only configures
   secrets scanning.

**Deleted:** `sweepAutoSecondAssign` in `lib/store.tsx`, its two call sites, and its
now-unused imports (`secondAssignDueAt`, `isSecondAssignDue` — still used, just only from
inside `lib/autoSecondAssign.ts` itself now, not imported into `store.tsx` anymore).

## Data model

No schema changes. Reuses `customers.created_by`, `areas.auto_assign_enabled`,
`areas.auto_assign_resumed_at`, `areas.last_auto_assigned_user_id`,
`profiles.auto_assign_enabled`, `profiles.active_pool_limit` — all already in production
from the prior fix.

## Out of scope

- `sweepStalePool` and `sweepBlastRequests` staying as compute-on-load (decision 1).
- Any alerting/notification on sweep failure beyond Netlify's own function logs
  (decision 4).
- Any admin-facing UI to view sweep history or manually trigger a run — not requested;
  `assignment_events` already gives an audit trail of what got assigned and when.
- Endpoint authentication/secret verification (decision 5).

## Testing

`lib/autoSecondAssign.check.ts` gains coverage for `computeAutoSecondAssignPlan`,
following the file's existing `node:assert` self-check convention:

- Two eligible candidates in one area → round-robins between them across multiple actions
  in a single call (regression check for the `pointerByArea`/`extraAssignedCount`
  same-pass collision handling).
- A candidate at their `activePoolLimit` is skipped in favor of the next candidate.
- A legacy customer (`createdBy: null`) never produces an action.
- A customer whose due date falls before the area's `autoAssignResumedAt` never produces
  an action (reuses the missed-window rule from the prior spec, now exercised through the
  orchestrating function instead of only its two smaller building blocks).
- No candidates available (empty team, or all at their pool limit) → no action, no throw.

The Netlify function itself has no automated test (matches this repo's convention — no
test framework, manual verification only). Verify with `netlify functions:invoke
sweep-auto-assign` (or an equivalent manual trigger after deploy) against a small set of
manually-seeded test rows, cross-checked directly against Supabase — same method already
used to verify the eligibility-fix spec's Task 6.
