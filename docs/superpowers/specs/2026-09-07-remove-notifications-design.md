# Remove notification feature

## Context

The bell/notification feature ([Header.tsx](../../../components/Header.tsx),
`notifications` state in [lib/store.tsx](../../../lib/store.tsx)) is being
dropped — it's the smallest of four session/UI changes requested together
(session lifecycle, single-session login, mobile-friendly, remove
notifications); this spec covers only the removal.

## Scope

Remove the feature end to end from the app: the bell UI, the store's
`notifications` array and every function that reads/writes it, the
`Notification` type, and its entry in the realtime table config added in
[2026-09-07-realtime-sync-design.md](2026-09-07-realtime-sync-design.md).
The three call sites that create a notification (auto-second-assign winner,
manual reassign, removal-request resolution) lose only the
`createNotification(...)` line — the surrounding assignment/removal logic is
unrelated and stays exactly as is.

**Out of scope:** the `notifications` table itself stays in Supabase,
unused — not dropped, not touched by any migration. Nothing else in the
session/auth work (session lifecycle, single-session login, mobile) is part
of this spec.

## Design

**`lib/types.ts`**: delete the `Notification` interface.

**`lib/store.tsx`**:
- Delete `mapNotification`, `loadNotifications`, `createNotification`,
  `markNotificationsRead`.
- Delete the `notifications` state (`useState<Notification[]>([])`) and the
  `notifications` / `markNotificationsRead` fields from the `Store`
  interface.
- Delete the `{ table: "notifications", ... }` entry from the realtime
  `entries` array in the subscription effect.
- Delete the two `loadNotifications(profile.id)` call sites (auto-restore
  effect and `login()`).
- Delete the `setNotifications([])` reset in `logout()`.
- Delete the three `createNotification(...)` call sites (leave everything
  else in those three functions unchanged).
- Delete the `Notification` import from the type-import block.

**`components/Header.tsx`**: delete the bell button, its dropdown, the
`notifOpen` state, `notifRef`, `unreadCount`, and `toggleNotif` — and drop
`notifications`/`markNotificationsRead` from the `useStore()` destructure.
The outside-click/`Escape` handler keeps the `menuRef`/`menuOpen` half only
(the profile menu still needs it).

## Testing

No automated test framework (repo convention — manual QA + `npx tsc --noEmit`):
- App builds and type-checks clean.
- Header shows only the profile menu (avatar/name/role, dropdown with User
  Control/Settings/Log out where applicable) — no bell, no console errors.
- Assign a customer (manual or via auto-second-assign) and approve/reject a
  removal request — confirm those flows still work exactly as before
  (assignment/removal side effects unchanged), just with no notification
  created.
