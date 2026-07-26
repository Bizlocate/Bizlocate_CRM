# BizLocate CRM — Documentation

Internal sales CRM. Single company, no multi-tenancy. Three fixed roles: `ADMIN`, `MANAGER`, `SALESPERSON`.

This folder documents each functional module: what it does, its data model, who can do what, and how a user actually experiences it. For the step-by-step TDD build sequence, see [`2026-07-25-bizlocate-crm.md`](../2026-07-25-bizlocate-crm.md) — this docs folder explains the *what and why*, that file explains the *build order*.

**Difference from the source build plan:** the source plan used raw Postgres + Prisma + hand-rolled bcrypt/session auth + a custom SSE event bus. These docs describe the same modules built on **Supabase** instead — Supabase Auth for login, Supabase Postgres with Row Level Security for data access, Supabase Realtime for live notifications. Same features, fewer custom moving parts.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14+ (App Router, TypeScript) |
| Auth | Supabase Auth (email/password) |
| Database | Supabase Postgres |
| Access control | Postgres Row Level Security (RLS) policies, keyed off `auth.uid()` |
| Realtime | Supabase Realtime (Postgres change subscriptions) |
| Client | `@supabase/supabase-js` + `@supabase/ssr` (server-rendered pages, cookie-based session) |
| Tests | Vitest |

See [`architecture.md`](architecture.md) for how these fit together — the `profiles` table, RLS policy shapes, and Realtime wiring.

## Modules

| Module | Doc | Covers |
|---|---|---|
| Authentication | [`modules/authentication.md`](modules/authentication.md) | Login, logout, session, route protection |
| Customers & Pipeline | [`modules/customers-pipeline.md`](modules/customers-pipeline.md) | Customer records, pipeline stages, role-scoped visibility |
| Activities & Tasks | [`modules/activities-tasks.md`](modules/activities-tasks.md) | Call/visit/note log, follow-up tasks |
| Notifications | [`modules/notifications.md`](modules/notifications.md) | Live in-app notification bell |
| Admin Console | [`modules/admin-console.md`](modules/admin-console.md) | User management, teams, pipeline stage config |
| Settings | [`modules/settings.md`](modules/settings.md) | Personal profile, password change |

## Out of scope (all phases)

Bulk import, self-service customer sign-up, external lead intake, mobile app, email/SMS/push notifications, multi-tenancy, configurable permission matrix.
