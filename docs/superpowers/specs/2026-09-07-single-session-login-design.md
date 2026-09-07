# Single session per login

## Context

Third of the four session/UI items requested together (session lifecycle —
idle logout already shipped, see
[2026-09-07-idle-logout-design.md](2026-09-07-idle-logout-design.md) —
single-session login, mobile-friendly, remove notifications — done). This
spec covers: logging in as a given account anywhere invalidates that
account's previously active session(s).

Reuses the whole-store Realtime infrastructure from
[2026-09-07-realtime-sync-design.md](2026-09-07-realtime-sync-design.md) —
`profiles` is already in the Realtime publication and already synced into
the store, so this is additive, not a new subsystem.

## Scope

Submitting the login form for account X ends any other browser/device
currently signed in as X — that other session gets logged out (redirected
to `/login`) within about a second, with a short explanation shown there.

**Explicitly not a violation, not kicked:** opening a second tab of an
already-open session, or reloading a tab — neither goes through the login
form, so neither counts as "logging in again." This app's realtime sync
was specifically built to support multiple open tabs of the same session;
this feature must not break that. The distinguishing line is the login
form submission itself, not "how many tabs/devices are open."

**Out of scope:** no "active sessions" list/management UI for a user to see
or manually revoke their own other sessions — out of scope for this round.
No change to Supabase's own session/token expiry — this is a separate,
additive application-level check.

## Design

**Data:** `profiles.session_token` (uuid, nullable) — whichever login most
recently wrote it is "the" active session for that account. Migration
(manual, per repo convention):
```sql
alter table profiles add column if not exists session_token uuid;
```
No Realtime publication change needed — `profiles` is already published.

**On login (`login()` in `lib/store.tsx`, the actual form-submit path
only):** once the profile is confirmed valid, mint a new token
(`crypto.randomUUID()` — native, no dependency), remember it in a ref, and
write it to that profile's row. If the write fails (e.g. an RLS surprise),
log it — this is a security-relevant write, not fire-and-forget silent:
```ts
const sessionToken = crypto.randomUUID();
mySessionTokenRef.current = sessionToken;
const { error: tokenError } = await supabase.from("profiles").update({ session_token: sessionToken }).eq("id", profile.id);
if (tokenError) console.error("Failed to set session_token:", tokenError);
```

**On auto-restore (the app-mount effect, an existing browser session
continuing — not a fresh login):** adopt whatever token is currently on
the row instead of minting a new one, so a reload or a new tab never
invalidates its own session:
```ts
const { data: tokenRow } = await supabase.from("profiles").select("session_token").eq("id", profile.id).single();
mySessionTokenRef.current = tokenRow?.session_token ?? null;
```

**Detecting a kick:** a second Realtime channel (separate from the
whole-store sync channel — different concern, filtered differently),
subscribed only to `UPDATE`s on the current user's own `profiles` row:
```ts
useEffect(() => {
  if (!currentUserId) return;
  const supabase = createClient();
  const channel = supabase
    .channel("session-guard")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${currentUserId}` },
      (payload: RealtimePostgresChangesPayload<Record<string, any>>) => {
        if ((payload.new.session_token ?? null) !== mySessionTokenRef.current) logout();
      }
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, [currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps
```
A session's own login-time write triggers this same event too, but its
`session_token` matches `mySessionTokenRef.current` exactly (it was set
right before the write), so it's a no-op for the session that just logged
in — only every *other* session for that account, whose ref still holds
the old value, sees a mismatch and logs out.

**Kicked-session UX:** `logout()` stays exactly as is (no router access in
`lib/store.tsx`, and the dashboard layout's existing redirect-to-`/login`
effect already fires on any logout, manual or not). The Realtime handler
sets one flag right before calling `logout()`:
```ts
sessionStorage.setItem("bizlocate_kicked", "1");
logout();
```
`sessionStorage` (not app/router state) because the actual navigation to
`/login` happens later, via the dashboard layout's own effect reacting to
`currentUser` going null — this flag just needs to survive that unmount/
remount, nothing more. `/login` reads and clears it once on mount and
shows a one-line notice if it was set.

**Login page:** shows "You were logged out because this account signed in
somewhere else." when the flag was set, styled like the existing error
text.

## Testing

No automated test framework (repo convention — manual QA + `npx tsc --noEmit`):
- Log in as the same account in two different browsers (or one normal +
  one incognito window). The first one gets logged out within ~1 second of
  the second login succeeding, landing on `/login` with the "logged out
  elsewhere" notice.
- Log in once, then open a second tab to the CRM and a page reload in the
  first tab — confirm neither kicks the other (this is the regression this
  feature must not cause).
- Manually clicking "Log out" still works exactly as before, no stray
  notice on `/login`.
