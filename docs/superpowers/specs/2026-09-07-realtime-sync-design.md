# Realtime sync (whole store)

## Context

Nothing in the app is actually live today. [`docs/architecture.md`](../../architecture.md)
claims `notifications` already uses Supabase Realtime, but that's stale
documentation: `grep -r "\.channel(" .` finds zero matches anywhere in the
codebase. In reality every list in [`lib/store.tsx`](../../../lib/store.tsx)
is fetched once in the post-login `useEffect` (line ~1060) and only patched
locally, in the tab that performed the action (e.g. `createNotification`
pushes straight into local state after its own insert — it doesn't wait for
a server echo). A second browser session (another user, or the same user's
other tab) never hears about the change until it reloads the page.

Concrete failure this spec fixes: an Admin approves a blast request; the
salesperson already has `/blasting` (or any page — the nav badge is global)
open in their browser and won't see the new red badge count until they
manually refresh.

RLS confirmed live on every table in Supabase (`select tablename, rowsecurity
from pg_tables where schemaname='public'` → all `true`), so subscribing to
Postgres Changes is safe: each client only receives change events for rows
its own RLS policies already let it `select`.

## Scope

Every array currently held in `StoreProvider`'s state (~28 tables, all of
`lib/store.tsx`'s `useState` calls except the two that aren't table-backed:
`currentUserId`, `initialized`) becomes live: an insert/update/delete by any
user, in any session, is reflected in every other open session within about
a second, no page refresh.

**Out of scope:**
- No optimistic-UI rework — existing local patches after a user's own
  mutation stay as they are (they'll just get redundantly re-applied,
  harmless, when the matching Realtime event for that same row arrives
  moments later — see Design).
- No change to what any role can see — Realtime inherits each row's existing
  RLS policy, so scoping is identical to today's `select("*")` results.
- No presence/typing-indicator features — this is data sync only.

## Design

**One channel, not 28.** In the existing post-login `useEffect` in
`lib/store.tsx`, after the initial `Promise.all([...loadX()])` resolves,
open a single `supabase.channel("db-changes")` and chain one
`.on("postgres_changes", { event: "*", schema: "public", table: "<t>" }, handler)`
per table, then one `.subscribe()`. One websocket for the whole app, not one
per table.

**Generic merge, reusing existing mappers.** Every `mapXxx(row)` function in
`lib/store.tsx` is already a pure row → app-model transform — that's exactly
what a Postgres Changes payload's `.new` is shaped for. One helper:

```ts
function applyChange<T>(
  setState: React.Dispatch<React.SetStateAction<T[]>>,
  mapRow: (row: any) => T,
  keyOf: (t: T) => string,
  payload: RealtimePostgresChangesPayload<any>
) {
  if (payload.eventType === "DELETE") {
    const deadKey = keyOf(mapRow(payload.old));
    setState((prev) => prev.filter((x) => keyOf(x) !== deadKey));
    return;
  }
  const mapped = mapRow(payload.new);
  setState((prev) => {
    const i = prev.findIndex((x) => keyOf(x) === keyOf(mapped));
    if (i === -1) return [...prev, mapped];
    const copy = [...prev];
    copy[i] = mapped;
    return copy;
  });
}
```

`keyOf` is `(x) => x.id` for every table except `fieldRequirements`
(`mandatory_field_settings`, keyed by `field_key` in the DB / `fieldKey` on
the model). DELETE payloads only need the row's key, which Postgres always
includes in `old` regardless of `REPLICA IDENTITY` setting (it's the primary
key) — no `REPLICA IDENTITY FULL` migration required.

Applying an event for a row the local state already has (because the local
session made the change itself and already patched it) is a same-value
overwrite — safe no-op in practice, not worth deduping.

**One exception: `mapActivity`.** It takes a second argument, `usersById`,
to resolve the author's name — a client-side join, not stored on the row.
Its Realtime handler can't close over a stale `users` array (the channel is
set up once in the effect), so it reads a `usersRef` kept current by:

```ts
const usersRef = useRef(users);
useEffect(() => { usersRef.current = users; }, [users]);
```

and calls `mapActivity(payload.new, new Map(usersRef.current.map(u => [u.id, u])))`.

**Cleanup.** `supabase.removeChannel(channel)` on logout, alongside the
existing `setNotifications([])` reset (`lib/store.tsx:1174`) and the other
`setX([])` calls in that same logout path.

**Migration (manual — you run this in the Supabase SQL editor, per the
existing "schema changes aren't auto-applied" convention):**

```sql
alter publication supabase_realtime add table
  profiles, teams, areas, sub_areas,
  business_tag_industries, business_tag_categories, business_tag_types,
  lead_sources, property_types, purposes, languages, firsttime_branch_types,
  races, target_races, target_types, removal_reasons,
  mandatory_field_settings, pipeline_stages,
  customers, activities, customer_change_log, deal_closures, sales_targets,
  assignment_events, stage_events,
  removal_requests, blast_requests, blast_items, blast_claim_requests,
  tasks;
```

(`notifications` is already in the publication.)

## Testing

No automated test framework in this repo (matches existing convention —
manual QA only, see other specs in this folder). Verify with two browser
sessions logged in as different users (or the same user in two tabs):

- Admin approves a pending blast request in session A → session B (logged
  in as the affected salesperson, sitting on any page) shows the new red
  batch-count badge on the Blasting tab within ~1 second, no refresh —
  the scenario that motivated this spec.
- Manager approves/rejects a removal request in session A → session B
  (Admin) sees the Remove Approvals badge count change live.
- Salesperson logs an activity on a customer in session A → session B
  (viewing that same customer's page) shows the new activity appear live,
  with the correct author name.
- Admin edits a lookup value (e.g. renames a Purpose) in session A →
  session B's dropdowns reflect the new name without reload.
- Log out in session A → confirm no console errors from a channel callback
  firing after the store's state has been cleared.
