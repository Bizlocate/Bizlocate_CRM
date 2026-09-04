# To-Do Tasks tab

## Context

Tasks (`title`, `due`, `done`) already exist, created per-customer from the
[customer detail page](../../../app/(dashboard)/customers/[id]/page.tsx)'s
Tasks card. There's no cross-customer view — per
[activities-tasks.md](../../modules/activities-tasks.md), "no separate 'my
tasks' cross-customer view in this scope (that would be a natural future
addition, not built here)." This spec builds that addition.

`tasks` RLS is already private per creator (`user_id = auth.uid()` on
select/insert/update — see `010f3d3 Make tasks private per creator`): each
user only ever sees their own tasks, admin included. This spec's scope
matches that exactly — **no RLS or schema change** — so no manual Supabase
migration is needed for this feature.

## Scope

A new **To Do** tab, visible to every role, showing only the current user's
own **open** (not-done) tasks across every customer they've logged one on —
so a salesperson (or anyone) can see everything they still owe without
opening each customer one by one.

**Out of scope** (explicitly, per this round's requirements):
- No admin/manager view of other users' tasks — dropped from the original
  ask; the earlier RLS-widening idea is not being built.
- No Area/Member filters — single-user list needs none.
- No completed-tasks section — this tab tracks pending work only; a task
  disappears from it the moment it's checked done (it's still visible on
  the customer page's existing Done section, unchanged).
- No changes to the customer detail page's own Tasks card, schema, or RLS.

## Design

**Route + component:** `/tasks` page rendering a new
`components/TodoTasksBrowser.tsx`, following the existing single-shared-route
pattern ([`InactiveListingsBrowser`](../../../components/InactiveListingsBrowser.tsx))
rather than the admin/team route split
([`AgentLogBrowser`](../../../components/AgentLogBrowser.tsx)) — there's no
role-based scoping difference here to justify two routes.

**Data:** reuse the store's existing `tasks` array (already RLS-scoped to
"mine") and `customers`, both already loaded globally. No store or type
changes needed — `Task` already has everything required (`customerId`,
`title`, `due`, `done`).

```
openTasks = tasks.filter(t => !t.done).sort by due date ascending
```

Each row resolves its customer via a `Map(customers by id)` lookup (same
lookup-table pattern `InactiveListingsBrowser` uses) for name/business name,
and links to `/customers/{customerId}`.

**Days-remaining display:** `due` is stored as `YYYY-MM-DD` (the customer
page's date input enforces this). Compute
`Math.ceil((dueDate - today) / 86400000)` and render:
- `n > 0` → "n days left"
- `n === 0` → "Due today"
- `n < 0` → "Overdue by |n| days" (styled in the existing warn red,
  `#a13a2b`, matching `InactiveListingsBrowser`'s day-count color)

**Row action:** a checkbox per row calling the existing
`toggleTaskDone(taskId)` from the store — same function the customer page's
Tasks card already uses. On toggle the task flips to `done`, so it drops out
of `openTasks` and disappears from the list on next render (no separate
"done" affordance needed here, per scope).

**Empty state:** "No pending tasks." (same style as other browsers' empty
rows).

**Nav badge:** [`MainNav.tsx`](../../../components/MainNav.tsx) gets a new
`{ href: "/tasks", label: "To Do", badge: ownOpenTaskCount }` tab, visible to
every role (not gated like Agent Log/Remove Approvals). `ownOpenTaskCount =
tasks.filter(t => !t.done).length` — computed inline in `MainNav`, no new
lib module needed (it's a one-line filter, unlike the Inactive Listings
badge which shares a genuinely non-trivial staleness computation with its
page).

## Testing

Manual (matches repo convention — no automated test framework):
- Log tasks on two different customers as a salesperson, confirm both
  appear in To Do sorted soonest-due-first, with correct day counts
  (future/today/overdue phrasing).
- Check a task done from the To Do tab, confirm it disappears from the tab
  and still shows (in the Done section) on that customer's own page.
- Confirm the nav badge count matches the number of rows shown, and updates
  immediately after checking a task done.
- Log in as a different user, confirm they only see their own tasks, never
  the first user's — matches existing per-creator RLS, no new query needed.
- Confirm the tab and badge render for all three roles (admin, manager,
  salesperson).
