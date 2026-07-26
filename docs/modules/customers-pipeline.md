# Customers & Pipeline

## Purpose

This is the core of the CRM: the customer record and where it sits in the sales pipeline. Everything else (activity logging, tasks, notifications) hangs off a `customers` row. The module's defining constraint is *visibility scoping* — a salesperson only sees their own assigned customers, a manager sees their team's, an admin sees everyone's — and that scoping has to hold no matter which screen or API call is used to get there.

## Key concepts / data model

- **`customers`**: `name`, `email`, `phone`, `assigned_to` (the salesperson who owns the relationship), `stage_id` (current pipeline position), `created_by`, `created_at`.
- **`pipeline_stages`**: ordered list (e.g. New → Contacted → Qualified → Won/Lost), configurable by Admin (see [`admin-console.md`](admin-console.md)), not hardcoded in application logic — a customer's stage is just a foreign key.
- A customer always has exactly one `assigned_to` and one `stage_id` — no unassigned or stage-less customers.

## Permissions

Enforced via RLS on `customers` (see [`architecture.md`](../architecture.md) for the policy pattern), not just UI hiding:

| Action | Admin | Manager | Salesperson |
|---|---|---|---|
| View | All customers | Own team's customers | Own assigned customers only |
| Create | Yes | Yes | No |
| Change stage | Yes | Yes (own team's) | Yes (own assigned only) |
| Reassign (`assigned_to`) | Yes, to anyone | No | No |
| Delete | Yes | No | No |

Creating a customer with an `assigned_to` writes a `notifications` row for that assignee (see [`notifications.md`](notifications.md)).

## User experience flow

**Admin or Manager creates a customer:**
1. From the customer list page, clicks "New customer."
2. Fills name, contact details, picks an assignee (salesperson) and initial stage (defaults to the pipeline's first stage).
3. Submits — customer appears in the list immediately; the assigned salesperson gets a live notification (separate browser session, no refresh needed).

**Salesperson works a customer:**
1. Logs in, lands on `/customers` — sees only their own assigned customers, newest first.
2. Clicks a customer to open its detail page: shows current stage, activity history, open tasks.
3. Moves the deal forward by changing its stage via a dropdown/selector — updates immediately, no page reload.
4. Logs calls/visits/notes and follow-up tasks from the same page (see [`activities-tasks.md`](activities-tasks.md)).

**Manager reviews team pipeline:**
1. Visits `/customers` — sees every customer assigned to any salesperson on their team, not just their own.
2. Can drill into any of them and change stage, same as a salesperson would for their own.
3. Cannot reassign a customer to a different salesperson or delete it — those are Admin-only.

**Admin oversight:**
1. Visits `/customers` — sees everything, across all teams.
2. Can reassign a customer to a different salesperson (e.g. territory change, salesperson left) or delete a customer outright (e.g. duplicate/test record).

## Key interactions with other modules

- [`activities-tasks.md`](activities-tasks.md) — every activity/task hangs off a `customer_id` and inherits the same visibility scope.
- [`notifications.md`](notifications.md) — customer creation/reassignment triggers a notification to the new assignee.
- [`admin-console.md`](admin-console.md) — pipeline stages and team membership (which drives Manager scoping) are configured there.
