# 30-minute idle logout

## Context

Smallest of the four session/UI items requested together (session lifecycle,
single-session login, mobile-friendly, remove notifications — the last is
already done, see
[2026-09-07-remove-notifications-design.md](2026-09-07-remove-notifications-design.md)).
This spec covers only auto-logout after 30 minutes of no user activity.

The "close the browser → must log in again" half of the original session-
lifecycle ask is **explicitly deferred**, not part of this spec: the two
implementation paths both have real problems — overriding
`@supabase/ssr`'s cookie `maxAge` hits a
[known upstream bug](https://github.com/supabase/ssr/issues/40) where the
setting is silently ignored, and a `sessionStorage`-based client-side flag
forces a relogin in any freshly-opened tab even when the browser was never
closed (bad multi-tab UX, and this app's realtime sync was specifically
built to support multiple open tabs). Revisit separately if still wanted.

## Scope

After 30 minutes with no mouse/keyboard/touch/scroll activity **in a given
browser tab**, that tab logs the user out (same as clicking "Log out") and
lands on `/login`.

**Out of scope:**
- No cross-tab synchronization — each tab times its own idle period
  independently. A tab sitting idle logs out even if the user is actively
  working in another tab of the same browser. Acceptable for this round;
  revisit if it becomes a real complaint.
- No warning/countdown modal before logout — silent, matches the existing
  manual "Log out" button's behavior exactly (no confirmation there either).
- No change to Supabase's underlying session/cookie lifetime — this is a
  client-side UX timer only, using the store's existing `logout()` (already
  calls `supabase.auth.signOut()`).

## Design

**Where:** [app/(dashboard)/layout.tsx](../../../app/(dashboard)/layout.tsx)
— already a client component with `useStore()` and the effect that redirects
to `/login` once `currentUser` becomes null. No new file needed; adding the
timer here means logout naturally triggers that existing redirect, no
router code duplicated.

**Mechanism:** one `useEffect` keyed on `currentUser`, active only while
logged in. A single `setTimeout` reset by a `resetTimer` callback attached
to `mousemove`, `mousedown`, `keydown`, `touchstart`, and `scroll` on
`window`. Firing calls the store's `logout()`. Cleans up (clears the
timeout, removes listeners) on unmount or once `currentUser` goes null (so
a manual logout doesn't leave a stray timer running).

```ts
const IDLE_LOGOUT_MS = 30 * 60 * 1000;

useEffect(() => {
  if (!currentUser) return;
  let timer: ReturnType<typeof setTimeout>;
  function resetTimer() {
    clearTimeout(timer);
    timer = setTimeout(() => logout(), IDLE_LOGOUT_MS);
  }
  const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
  events.forEach((e) => window.addEventListener(e, resetTimer));
  resetTimer();
  return () => {
    clearTimeout(timer);
    events.forEach((e) => window.removeEventListener(e, resetTimer));
  };
}, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps
```

## Testing

No automated test framework (repo convention — manual QA + `npx tsc --noEmit`).
30 minutes is impractical to sit through, so verify with a temporarily
shortened constant, reverted before commit:
- Temporarily change `IDLE_LOGOUT_MS` to `5000` (5 seconds), run `npm run dev`,
  log in, don't touch the mouse/keyboard — confirm redirect to `/login`
  within ~5 seconds.
- Log in again, move the mouse every ~3 seconds — confirm no logout happens
  (the timer keeps resetting).
- Revert `IDLE_LOGOUT_MS` to `30 * 60 * 1000` before committing.
- Confirm a manual "Log out" click still works unchanged.
