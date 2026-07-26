# Admin Console

## Purpose

Someone has to create accounts, organize salespeople into teams, and configure the pipeline stages every customer moves through — this module is that back-office layer. It's Admin-only end to end; Managers and Salespeople never see these screens.

## Key concepts / data model

- **User management**: creates `auth.users` (via Supabase Auth admin API, not self-signup) + the matching `profiles` row (`name`, `role`, `team_id`, `status`). New users get a system-generated temporary password shown once to the Admin to relay out-of-band.
- **Team management**: `teams` table — `name`, `manager_id` (one manager per team, optional). A `profiles.team_id` links a member into a team; this `team_id` is what drives Manager-level visibility scoping everywhere else in the app.
- **Pipeline stage config**: `pipeline_stages` — `name`, `order`, `is_default`. Reordering/renaming here changes what every customer's stage selector shows, globally.

## Permissions

Every action in this module requires `profiles.role = 'ADMIN'`, enforced both by RLS on the underlying tables and by a route/page-level redirect for non-admins (defense in depth — RLS is the real gate, the redirect is just so a Manager doesn't hit a confusing blocked-form UI).

| Action | Admin | Everyone else |
|---|---|---|
| Create/edit/deactivate users | Yes | No access |
| Create/edit teams, assign manager | Yes | No access |
| Create/edit/reorder/delete pipeline stages | Yes | No access |

## User experience flow

**Creating a new salesperson:**
1. Admin visits `/admin/users`, clicks "New user."
2. Enters name, email, role (`SALESPERSON`), optionally a team.
3. Submits — account is created, a temp password is shown once on screen for the Admin to relay to the new hire.
4. New user appears in the users table immediately with status `ACTIVE`.

**Deactivating a user:**
1. Admin finds the user in `/admin/users`, sets status to `INACTIVE`.
2. That user's next login attempt is rejected even with correct credentials (see [`authentication.md`](authentication.md)) — existing sessions are not force-expired in this scope, so a live session continues until it naturally expires.

**Setting up a team:**
1. Admin visits `/admin/teams`, creates a team with a name and picks a manager from existing users.
2. Assigns salespeople to the team by editing their `team_id` from the users page.
3. That team's manager immediately gains visibility into every customer assigned to a team member (see [`customers-pipeline.md`](customers-pipeline.md)) — no separate "grant visibility" step.

**Configuring pipeline stages:**
1. Admin visits `/admin/stages`, sees the current ordered list (e.g. New, Contacted, Qualified, Won, Lost).
2. Adds a stage (e.g. "Negotiation"), sets its position in the order.
3. Every customer's stage selector reflects the new list immediately — existing customers keep whatever stage they were already on.

## Key interactions with other modules

- [`authentication.md`](authentication.md) — this module is the only way an `auth.users` account comes into existence; there's no self-registration path.
- [`customers-pipeline.md`](customers-pipeline.md) — teams and stages configured here directly drive that module's visibility scoping and stage selector.
