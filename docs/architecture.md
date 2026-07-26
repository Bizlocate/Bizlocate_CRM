# Architecture

## Supabase project shape

One Supabase project, one Postgres database, no multi-tenancy. Two user tables:

- **`auth.users`** — managed entirely by Supabase Auth. Holds email + password credential. Never queried directly by app code beyond `auth.uid()`.
- **`public.profiles`** — app-owned table, one row per `auth.users` row, same `id` (FK to `auth.users.id`). Holds everything the CRM needs about a person that Supabase Auth doesn't: `name`, `role` (`ADMIN`/`MANAGER`/`SALESPERSON`), `team_id`, `status` (`ACTIVE`/`INACTIVE`).

Created via a Postgres trigger on `auth.users` insert (`handle_new_user()`), so every signed-up auth user automatically gets a `profiles` row. Since this CRM has no self-signup (admin creates users — see [`admin-console.md`](modules/admin-console.md)), the trigger fires when the admin-create-user flow calls `supabase.auth.admin.createUser()`.

## Core tables

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | App user data | `id` (=auth uid), `name`, `role`, `team_id`, `status` |
| `teams` | Sales teams | `id`, `name`, `manager_id` (→ profiles) |
| `pipeline_stages` | Configurable deal stages | `id`, `name`, `order`, `is_default` |
| `customers` | Customer/deal records | `id`, `name`, `email`, `phone`, `assigned_to` (→ profiles), `stage_id` (→ pipeline_stages), `created_by` |
| `activities` | Call/visit/note log | `id`, `customer_id`, `user_id`, `type` (`CALL`/`VISIT`/`NOTE`), `content`, `follow_up_date` |
| `tasks` | Follow-up tasks | `id`, `customer_id`, `user_id`, `title`, `due_date`, `done` |
| `notifications` | In-app notifications | `id`, `user_id`, `type`, `message`, `read` |

Full field-level detail lives in each module doc, not repeated here.

## Access control: Row Level Security

Every table above has RLS **enabled**, and every policy is written in terms of `auth.uid()` — there is no app-layer "trust me, I checked the role" query. This is the main structural difference from the original Prisma-based plan, where scoping lived only in a `customerScopeWhere()` helper that every route had to remember to call. With RLS, the database enforces scoping even if a route forgets.

Standard scoping pattern, used consistently across `customers`, `activities`, `tasks`:

- **Admin** — full access (`USING (true)`), verified via a `is_admin()` helper function that reads the caller's `profiles.role`.
- **Manager** — access rows where the related customer's `assigned_to` profile has the same `team_id` as the caller.
- **Salesperson** — access only rows where `assigned_to` (or the activity/task's owning customer's `assigned_to`) equals `auth.uid()`.

Example shape (customers table):

```sql
create policy "customers_select_scoped" on customers
for select using (
  is_admin()
  or assigned_to = auth.uid()
  or assigned_to in (
    select id from profiles where team_id = (select team_id from profiles where id = auth.uid())
  )
);
```

Write policies (`insert`/`update`/`delete`) are narrower — e.g. only Admin/Manager can `insert` a customer, only Admin can `delete`. See each module doc for the exact policy intent per action.

## Realtime notifications

`notifications` has Realtime enabled (`alter publication supabase_realtime add table notifications`). The client subscribes to a per-user channel filtered by `user_id = auth.uid()` via Supabase's Realtime Postgres Changes API. When any server action inserts a `notifications` row, every subscribed client for that `user_id` receives the row over a websocket — no custom event bus, no SSE route, and it works correctly across multiple Next.js server instances (unlike an in-process `EventEmitter`). Detail in [`modules/notifications.md`](modules/notifications.md).

## Auth session flow

`@supabase/ssr` manages the session as httpOnly cookies, refreshed automatically by Next.js middleware. Server Components call `supabase.auth.getUser()` to get the current user; combined with a `profiles` lookup (or a Postgres view joining `auth.users` + `profiles`) to get role/team. Detail in [`modules/authentication.md`](modules/authentication.md).
