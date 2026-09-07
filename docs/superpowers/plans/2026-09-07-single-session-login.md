# Single session per login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Submitting the login form for an account ends any other session already logged in as that account, within about a second, without breaking multi-tab use of a single already-logged-in session.

**Architecture:** A `session_token` column on `profiles`, minted fresh only by the actual login-form path and merely adopted (not overwritten) by page-reload/new-tab restores, watched by a second, narrowly-filtered Realtime channel that calls the store's existing `logout()` on mismatch. A `sessionStorage` flag carries the "kicked" reason across the redirect to `/login`.

**Tech Stack:** `crypto.randomUUID()` (native), the existing Realtime Postgres Changes setup — no new dependency.

## Global Constraints

- No automated test framework — verification is `npx tsc --noEmit` plus a manual two-browser check.
- Schema changes are not auto-applied — Task 1's migration must be run by hand in the Supabase SQL editor before Task 2 can be tested end to end.
- `profiles` is already in the Realtime publication (from the whole-store sync migration) — no publication change needed here.

---

## Task 1: `session_token` column

**Files:**
- Modify: `supabase/schema.sql` (append at end of file)

- [ ] **Step 1: Append the migration**

```sql

-- ============================================================
-- Migration: Single session per login — profiles.session_token
-- lets a fresh login invalidate any other session already active
-- for that account (see docs/superpowers/specs/2026-09-07-single-session-login-design.md).
-- ============================================================
--
-- alter table profiles add column if not exists session_token uuid;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/schema.sql
git commit -m "$(cat <<'EOF'
Add session_token migration for single-session-per-login

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

**Tell the user explicitly after this commit:** run the uncommented `alter table` statement in the Supabase SQL editor before testing Task 2.

---

## Task 2: Mint/adopt/watch the session token in the store

**Files:**
- Modify: `lib/store.tsx`

**Interfaces:**
- Consumes: the existing `usersRef`-style ref pattern, the existing `RealtimePostgresChangesPayload` import, the existing `logout()` function (unchanged, no signature change).
- Produces: no new `Store` interface members — this is internal to `login()`, the auto-restore effect, and one new watcher effect.

- [ ] **Step 1: Add the session-token ref next to `usersRef`**

Find:

```ts
  const usersRef = useRef(users);
  useEffect(() => {
    usersRef.current = users;
  }, [users]);
```

Replace with:

```ts
  const usersRef = useRef(users);
  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  // Set by login() (a fresh login) or adopted from the DB on auto-restore
  // (an existing session continuing, e.g. reload/new tab -- never
  // overwritten there). The session-guard effect below compares this
  // against the value Realtime reports for this account's profiles row;
  // a mismatch means a *different* login overwrote it, i.e. this session
  // just got signed out elsewhere.
  const mySessionTokenRef = useRef<string | null>(null);
```

- [ ] **Step 2: Adopt the existing token on auto-restore**

Find:

```ts
        const profile = loadedUsers.find((u) => u.id === data.user!.id);
        if (profile) {
          setCurrentUserId(profile.id);
          sweepStalePool(loadedCustomers, loadedActivities, loadedAssignmentEvents, profile.id, profile.role === "ADMIN");
          sweepAutoSecondAssign(loadedCustomers, loadResults[2], loadResults[0], loadedUsers, loadResults[16], loadedActivities, profile.role === "ADMIN");
          sweepBlastRequests(loadedBlastRequests, loadedBlastItems, profile.role === "ADMIN");
        }
      }
      setInitialized(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
```

Replace with:

```ts
        const profile = loadedUsers.find((u) => u.id === data.user!.id);
        if (profile) {
          setCurrentUserId(profile.id);
          const { data: tokenRow } = await supabase.from("profiles").select("session_token").eq("id", profile.id).single();
          mySessionTokenRef.current = tokenRow?.session_token ?? null;
          sweepStalePool(loadedCustomers, loadedActivities, loadedAssignmentEvents, profile.id, profile.role === "ADMIN");
          sweepAutoSecondAssign(loadedCustomers, loadResults[2], loadResults[0], loadedUsers, loadResults[16], loadedActivities, profile.role === "ADMIN");
          sweepBlastRequests(loadedBlastRequests, loadedBlastItems, profile.role === "ADMIN");
        }
      }
      setInitialized(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 3: Add the session-guard watcher effect**

Find:

```ts
  const currentUser = useMemo(
    () => users.find((u) => u.id === currentUserId) ?? null,
    [users, currentUserId]
  );

  async function login(email: string, password: string): Promise<LoginResult> {
```

Replace with:

```ts
  // Separate from the whole-store sync channel above -- different concern
  // (one filtered row, not the whole table) and it needs to call logout()
  // directly rather than merge a row into state.
  useEffect(() => {
    if (!currentUserId) return;
    const supabase = createClient();
    const channel = supabase
      .channel("session-guard")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${currentUserId}` },
        (payload: RealtimePostgresChangesPayload<Record<string, any>>) => {
          if ((payload.new.session_token ?? null) !== mySessionTokenRef.current) {
            sessionStorage.setItem("bizlocate_kicked", "1");
            logout();
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentUser = useMemo(
    () => users.find((u) => u.id === currentUserId) ?? null,
    [users, currentUserId]
  );

  async function login(email: string, password: string): Promise<LoginResult> {
```

- [ ] **Step 4: Mint and write a fresh token on login**

Find:

```ts
    const profile = loadedUsers.find((u) => u.id === data.user.id);
    if (!profile || !profile.active) {
      await supabase.auth.signOut();
      return { ok: false, error: "This account has no CRM profile set up. Contact your administrator." };
    }
    setCurrentUserId(profile.id);
    sweepStalePool(loadedCustomers, loadedActivities, loadedAssignmentEvents, profile.id, profile.role === "ADMIN");
    sweepAutoSecondAssign(loadedCustomers, loadResults[2], loadResults[0], loadedUsers, loadResults[16], loadedActivities, profile.role === "ADMIN");
    sweepBlastRequests(loadedBlastRequests, loadedBlastItems, profile.role === "ADMIN");
    return { ok: true };
  }
```

Replace with:

```ts
    const profile = loadedUsers.find((u) => u.id === data.user.id);
    if (!profile || !profile.active) {
      await supabase.auth.signOut();
      return { ok: false, error: "This account has no CRM profile set up. Contact your administrator." };
    }
    const sessionToken = crypto.randomUUID();
    mySessionTokenRef.current = sessionToken;
    const { error: tokenError } = await supabase.from("profiles").update({ session_token: sessionToken }).eq("id", profile.id);
    if (tokenError) console.error("Failed to set session_token:", tokenError);
    setCurrentUserId(profile.id);
    sweepStalePool(loadedCustomers, loadedActivities, loadedAssignmentEvents, profile.id, profile.role === "ADMIN");
    sweepAutoSecondAssign(loadedCustomers, loadResults[2], loadResults[0], loadedUsers, loadResults[16], loadedActivities, profile.role === "ADMIN");
    sweepBlastRequests(loadedBlastRequests, loadedBlastItems, profile.role === "ADMIN");
    return { ok: true };
  }
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/store.tsx
git commit -m "$(cat <<'EOF'
Mint/adopt/watch session_token for single-session-per-login

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: "Logged out elsewhere" notice on the login page

**Files:**
- Modify: `app/login/page.tsx`

- [ ] **Step 1: Show the notice when the kicked flag is set**

Find:

```tsx
export default function LoginPage() {
  const router = useRouter();
  const { login } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
```

Replace with:

```tsx
export default function LoginPage() {
  const router = useRouter();
  const { login } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [kickedNotice, setKickedNotice] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("bizlocate_kicked")) {
      sessionStorage.removeItem("bizlocate_kicked");
      setKickedNotice(true);
    }
  }, []);
```

- [ ] **Step 2: Add the `useEffect` import**

Find:

```tsx
import { useState } from "react";
```

Replace with:

```tsx
import { useEffect, useState } from "react";
```

- [ ] **Step 3: Render the notice above the form's error text**

Find:

```tsx
          {error && <div className="error-text">{error}</div>}
```

Replace with:

```tsx
          {kickedNotice && !error && (
            <div className="error-text">You were logged out because this account signed in somewhere else.</div>
          )}
          {error && <div className="error-text">{error}</div>}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification (requires Task 1's migration already run)**

1. Log in as the same account in two different browsers (or one normal + one incognito window). Within ~1 second of the second login, the first browser lands on `/login` showing "You were logged out because this account signed in somewhere else."
2. Log in once, open a second tab, and reload the first tab — confirm neither kicks the other.
3. Manually click "Log out" — confirm `/login` shows no notice.

- [ ] **Step 6: Commit**

```bash
git add app/login/page.tsx
git commit -m "$(cat <<'EOF'
Show "logged out elsewhere" notice on the login page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
