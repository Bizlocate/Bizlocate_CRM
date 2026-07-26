# Settings

## Purpose

The one screen every role sees the same version of: a place to update your own display name and change your own password. Deliberately minimal — no notification preferences, no theme, no profile photo in scope.

## Key concepts / data model

- Display name lives on `profiles.name` — a direct update, no confirmation step needed.
- Password change goes through Supabase Auth's own update-user API (`supabase.auth.updateUser({ password })`), not a raw column on `profiles` — Supabase Auth owns credential storage entirely, so there's no `passwordHash` field to touch in application code.
- Changing password requires re-entering the current password first, checked via a fresh sign-in attempt (or Supabase's re-authentication flow) before the update is allowed — prevents a hijacked/left-open session from silently locking the real owner out.

## Permissions

Every authenticated user (any role) can only ever edit their own profile — there's no "edit another user's settings" path here (that's [`admin-console.md`](admin-console.md)'s job, and it doesn't touch passwords).

## User experience flow

**Updating display name:**
1. Visits `/settings`, edits the name field, saves.
2. Header (which shows `name (role)`) reflects the change immediately.

**Changing password:**
1. On the same page, enters current password + new password.
2. Submits — if current password is wrong, an inline error ("check current password") appears and nothing changes.
3. If correct, password updates; existing session stays valid (no forced re-login), but the user is told to use the new password on their next login.

## Key interactions with other modules

- [`authentication.md`](authentication.md) — password changes flow through the same Supabase Auth instance that issues login sessions; this module doesn't reimplement any credential logic.
