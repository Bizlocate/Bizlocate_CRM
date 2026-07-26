# Notifications

## Purpose

When a customer gets assigned to a salesperson, they need to know without refreshing the page or checking email — this is in-app only, no email/SMS/push in scope. The module is small on purpose: one trigger (customer assignment), one delivery channel (a bell in the header), one storage table.

## Key concepts / data model

- **`notifications`**: `user_id` (recipient), `type` (e.g. `CUSTOMER_ASSIGNED`), `message`, `read` (boolean), `created_at`.
- **Delivery**: Supabase Realtime subscribes the client to Postgres changes on `notifications` filtered to `user_id = auth.uid()`. When a server action inserts a row, every open browser tab for that user receives it over a websocket within roughly a second — no polling, no custom SSE endpoint, no in-process event bus to keep in sync across server instances (the gap in the original plan's `EventEmitter` approach).
- Notifications are never deleted, only marked `read` — the bell's unread count is a live count of `read = false` rows.

## Permissions

A user can only ever see and mark-read their own notifications (`user_id = auth.uid()`, enforced by RLS) — there's no cross-user notification visibility, including for Admins.

## User experience flow

**Notification created (system-triggered, not user-initiated):**
1. An Admin or Manager creates a customer and assigns it to a salesperson (see [`customers-pipeline.md`](customers-pipeline.md)).
2. A `notifications` row is inserted for that salesperson as part of the same action.

**Receiving it live:**
1. The salesperson has the CRM open in their browser (any page under the dashboard — the bell lives in the shared header).
2. Within about a second of the assignment, the bell's unread badge count increments — no page refresh, no manual reload.

**Reading it:**
1. Clicks the bell — a dropdown lists recent notifications, newest first.
2. Opening the dropdown marks all currently-unread notifications as read; the badge clears.
3. Clicking a notification (future-friendly, not required in this scope) could deep-link to the relevant customer — current scope just shows the message text.

## Key interactions with other modules

- [`customers-pipeline.md`](customers-pipeline.md) is the only current trigger (customer assignment on create). Any future trigger (e.g. task due soon) just needs to insert into `notifications` — the delivery mechanism doesn't change.
- [`authentication.md`](authentication.md) — the Realtime subscription is only established for an authenticated session; logged-out users get no bell.
