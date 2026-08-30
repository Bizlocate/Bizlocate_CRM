# Agent Log Visibility — Admin/Manager Oversight Design

## Purpose

Admin doesn't follow up customers directly — their job is oversight: open a
customer profile and see who it's assigned to, plus each assigned agent's
own log, kept separate per agent. Manager has two jobs: follow up their own
assigned customers (writes logs, same as a salesperson), and monitor their
team's salespeople on customers not assigned to them (reads logs only — no
log is required from a manager on a customer that isn't theirs).

Today the customer detail page renders one merged activity timeline
regardless of who wrote each entry, and any role that can see a customer can
write to it. This spec splits the log by author and tightens the write-form
visibility to match the two Manager jobs.

## Scope

Three independent, additive changes, all on top of existing data (no schema
change — `Activity.authorUserId` already exists):

1. Customer profile: activity log grouped into per-agent stacked blocks.
2. New Admin-only page: pick an agent, see every log entry they've authored
   across all customers.
3. Manager: the "Log activity" write form only appears on customers where
   the Manager is one of the three assignee slots.

Out of scope: any backend/RLS permission change. The Manager write-form
change is UI-only — a Manager can technically still write to a non-own
customer via direct API/store call, same as today. Locking that down at the
data layer is a known gap, not addressed here.

## 1. Customer profile — grouped log blocks

**Current**: `app/(dashboard)/customers/[id]/page.tsx` renders
`customerActivities` (all activities for the customer, any author) as one
flat list, newest first, inside a single `.card`.

**New**: group `customerActivities` by `authorUserId` into stacked blocks —
no tabs, no dropdown filter, all blocks visible on the page at once.

- **Block order**: Assigned 1 → Assigned 2 → Assigned 3 (only slots that are
  currently filled, i.e. `assignedToUserId`/`2`/`3` non-null), each labeled
  with that assignee's name and slot number if 2+ slots are filled.
  Then any *other* authors (someone who logged an entry while assigned, or
  an Admin/Manager who added a note on a customer that isn't theirs) — one
  block per remaining unique `authorUserId`, ordered by that author's most
  recent activity, newest first.
- **Block header**: author name, role badge (Sales Person / Manager /
  Admin, looked up from `users`), entry count. If an author in the "other"
  group no longer holds any of the three assignee slots (e.g. reassigned
  away), the header still shows their name — the log is a historical
  record, not tied to current assignment.
- **Within a block**: identical item rendering to today (type badge, time,
  content, follow-up line) — only the grouping wrapper is new.
- **Empty block**: an assignee slot with zero activities still renders an
  empty block with "No activity logged yet." — makes it visible at a glance
  which agent hasn't logged anything.
- The write form ("Log activity") stays where it is today, above the
  blocks. A newly submitted activity is attributed to the current user via
  existing `addActivity` logic (unchanged) and appears at the top of that
  author's block after the state refresh.
- This is a pure render change in one file — group `customerActivities`
  with a `useMemo` keyed on `[customerActivities, customer]`, no store or
  type changes.

## 2. Agent Logs — customer-directory drill-down (`/admin/agent-logs`, `/team/agent-logs`)

**Revised** (superseded the first cut of this section, which rendered a
flat activity feed per agent — replaced before that version shipped to
users, based on follow-up direction: the tool should be customer-list-first,
not log-first). Shared component `components/AgentLogBrowser.tsx`, used by
two thin pages:

- **Admin** — `/admin/agent-logs`. Agent picker offers every
  `SALESPERSON`/`MANAGER` company-wide; customer pool is the full
  `customers` list.
- **Manager** — `/team/agent-logs`, a new route group with its own
  role-gated layout (mirrors `admin/layout.tsx` but requires `MANAGER`).
  Agent picker offers only `SALESPERSON`s on the manager's own team
  (`teamId` match) — a manager doesn't need this tool to check their own
  customers, only their reports'. Customer pool is `visibleCustomers`
  (already team-scoped by the store).
- **Top-level nav, not admin-nested**: reachable via a primary "Agent Log"
  tab next to "Customers" (`components/MainNav.tsx`, rendered in the
  dashboard layout for every page), not folded into `AdminTabs`'s
  Users/Teams/Stages config sub-nav — this tool is a daily oversight view,
  not a one-off admin config screen. Shown only to Admin and Manager;
  Salesperson sees no tab bar (unchanged). The tab's target route depends
  on role (`/admin/agent-logs` vs `/team/agent-logs`).

**Filters, applied together:**
1. **Area** (dropdown, default "All Areas") — customer's `areaId`.
2. **Stage** (dropdown, default "All Stages") — customer's `stageId`.
3. **Agent** (dropdown, required — defaults to the first agent in the list).

These aren't a two-step narrow-then-drill-down: Area/Stage filter the
*picked agent's customer list* directly, and stay applied if set. Left on
"All", they don't restrict anything.

**Result list**: every customer where the picked agent is one of the three
assignee slots, filtered by Area/Stage, sorted by `updatedAt` descending
(most recently touched on top). Each row: business name (or name),
area, stage badge, last-updated date — click through to `/customers/[id]`
(section 1's grouped log blocks live there). No write form, no activity
rows — this page's job is "find the customer," not "read the log entry."

## 3. Manager write-form visibility

On the customer detail page, wrap the existing "Log activity" form
(currently always rendered for anyone who can see the page) in a check:

```
const canLogActivity =
  currentUser.role !== "MANAGER" ||
  assigneeSlots(customer).includes(currentUser.id);
```

- `MANAGER` not in any of the customer's three assignee slots → form is
  hidden, only the read-only grouped blocks (section 1) show.
- `MANAGER` in a slot, or role is `ADMIN`/`SALESPERSON` → unchanged from
  today.
- No change to `addActivity` itself, RLS, or the store's permission
  helpers — this is a UI affordance only, matching the "no log required"
  framing (soft, not enforced at the data layer).

## Testing

No automated test framework in this project (`package.json` has no `test`
script). Verification is manual, per change:

1. Customer with 2 assignees, each with their own logged activities →
   profile shows two blocks in slot order, correct entries in each.
2. Log an activity as each role → confirm it lands in the right author's
   block.
3. `/admin/agent-logs` as Admin → pick an agent with entries on 2+
   customers → confirm all entries show, links to the right customer.
4. Manager on own customer → form visible, can log. Manager on team
   customer not their own → form hidden, blocks still visible read-only.
5. Salesperson and Admin behavior on the detail page unchanged from before
   this change.
