# Activities & Tasks

## Purpose

A CRM's value is the history it keeps. This module covers the two ways a salesperson records their work on a customer: **activities** (a log of what already happened — a call, a visit, a note) and **tasks** (what needs to happen next — a follow-up with a due date). Both are lightweight by design: no attachments, no rich text, no reminders beyond the task list itself.

## Key concepts / data model

- **`activities`**: `customer_id`, `user_id` (who logged it), `type` (`CALL` / `VISIT` / `NOTE`), `content` (free text), `follow_up_date` (optional), `created_at`. Append-only — no edit or delete in scope; the log is a record of what happened, not a mutable note.
- **`tasks`**: `customer_id`, `user_id`, `title`, `due_date`, `done` (boolean), `created_at`. The only mutation is toggling `done`.

Both inherit their visibility scope from the parent customer — there's no independent activity/task-level RLS logic beyond "can the caller see this customer" (same policy helper as [`customers-pipeline.md`](customers-pipeline.md)).

## Permissions

| Action | Admin | Manager | Salesperson |
|---|---|---|---|
| View activities/tasks | On any visible customer | On own team's customers | On own assigned customers |
| Log an activity | On any visible customer | On own team's customers | On own assigned customers |
| Create a task | Same as above | Same as above | Same as above |
| Toggle task done | Same as above | Same as above | Same as above |

There's no role restriction beyond "must be able to see the customer" — any role that can view a customer can log activity and manage tasks on it.

## User experience flow

**Logging an activity:**
1. On a customer's detail page, the salesperson picks a type (Call/Visit/Note) from a dropdown and types what happened.
2. Submits — the entry appears at the top of the activity list immediately, timestamped and attributed to them.
3. Optionally sets a follow-up date on the activity (informational — doesn't auto-create a task).

**Creating and completing a task:**
1. From the same detail page, adds a task with a title and due date (e.g. "Send proposal," due in 3 days).
2. Task appears in an open-tasks list on the customer page, sorted by due date.
3. When done, checks it off — checkbox updates immediately, task moves to a "done" state (still visible, not deleted, so history is preserved).

**Reviewing history:**
1. Anyone with visibility into the customer sees the full activity timeline and task list on that customer's detail page — no separate "my activities" or "my tasks" cross-customer view in this scope (that would be a natural future addition, not built here).

## Key interactions with other modules

- [`customers-pipeline.md`](customers-pipeline.md) — every activity and task belongs to exactly one customer and inherits its visibility scope; this module has no standalone permission logic.
- Does **not** trigger notifications in this scope — only customer assignment does (see [`notifications.md`](notifications.md)). A future iteration could notify on task due dates, but that's out of scope.
