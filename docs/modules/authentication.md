# Authentication

## Purpose

Every route in the CRM is internal-only — there's no public content and no self-signup. This module gets a user from "has a browser open" to "identified, role-known, and dropped into the dashboard behind a server-enforced guard." It's the dependency every other module sits on: nothing else can trust `auth.uid()` without this working correctly first.

## Key concepts

- **Credential store**: `auth.users` (Supabase-managed). App code never touches password hashes directly — Supabase Auth owns hashing, comparison, and session issuance.
- **Session**: httpOnly cookies set by `@supabase/ssr`, refreshed transparently by Next.js middleware on every request. No custom session table, no manual token hashing (this replaces the source plan's `src/lib/auth.ts` bcrypt/crypto session logic entirely).
- **Identity + role**: `auth.uid()` gives you *who*; a join/lookup against `profiles` gives you *role* and *team*. `getCurrentUser()` (server-side helper) returns both together so route guards and RLS-scoped queries always have role available.
- **No OAuth, no magic links, no self-registration** — email/password only, accounts created exclusively by an Admin (see [`admin-console.md`](admin-console.md)).

## Permissions

Authentication itself has no role distinction — everyone logs in the same way. What differs post-login is what each role can *see and do*, covered per-module. One constraint enforced at login: a `profiles.status = 'INACTIVE'` user is rejected even with correct credentials (deactivated by an Admin, see Admin Console).

## User experience flow

**First login (any role):**
1. User receives credentials out-of-band from an Admin (temp password generated at account creation).
2. Visits `/login`, enters email + password.
3. On success, Supabase issues a session cookie; user is redirected to `/customers` (their default landing page, scoped to whatever they're allowed to see).
4. On failure (wrong password, or account `INACTIVE`), the form shows a generic "Invalid email or password" — never reveals which part was wrong or whether the account exists.

**Every subsequent visit:**
1. User navigates to any `/(dashboard)/*` route.
2. A server-side layout guard calls `getCurrentUser()`. If no valid session, redirect to `/login` before any page content renders — no flash of protected data.
3. If session valid, the dashboard shell renders with the user's name, role, and the notification bell in the header.

**Logout:**
1. User clicks "Log out" in the header.
2. Session is invalidated server-side and the cookie cleared; redirected to `/login`.

## Key interactions with other modules

- Every other module's RLS policies depend on `auth.uid()` resolving correctly — this module is a hard prerequisite.
- [`admin-console.md`](admin-console.md) creates the `auth.users` + `profiles` rows this module authenticates against.
- [`settings.md`](settings.md) lets a logged-in user change their own password through Supabase Auth's update-user API (not a raw `passwordHash` field, since that no longer exists on `profiles`).
