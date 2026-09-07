# Remove notification feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the bell/notification feature end to end from the app (UI, store state, type) without touching the `notifications` table in Supabase or any unrelated logic in the three call sites that used to create a notification.

**Architecture:** Pure deletion across three files (`lib/types.ts`, `lib/store.tsx`, `components/Header.tsx`) — no new code, no schema change.

**Tech Stack:** No changes.

## Global Constraints

- No automated test framework — verification is `npx tsc --noEmit` plus a manual check.
- The `notifications` table stays in Supabase untouched — no migration in this plan.

---

## Task 1: Remove notifications from the store and its type

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/store.tsx`

- [ ] **Step 1: Delete the `Notification` type**

In `lib/types.ts`, find:

```ts
export interface Notification {
  id: string;
  message: string;
  time: string;
  unread: boolean;
}

```

Delete it entirely (including the trailing blank line before `export interface CustomerChangeLogEntry {`).

- [ ] **Step 2: Remove the `Notification` import in `lib/store.tsx`**

Find:

```ts
  LeadSource,
  Notification,
  PoolStatus,
```

Replace with:

```ts
  LeadSource,
  PoolStatus,
```

- [ ] **Step 3: Delete `mapNotification`**

Find:

```ts
function mapNotification(row: { id: string; message: string; created_at: string; read: boolean }): Notification {
  return { id: row.id, message: row.message, time: formatTimestamp(row.created_at), unread: !row.read };
}

// One Realtime channel (see the effect in StoreProvider) drives every
```

Replace with:

```ts
// One Realtime channel (see the effect in StoreProvider) drives every
```

- [ ] **Step 4: Remove `notifications` from the `Store` interface**

Find:

```ts
  tasks: Task[];
  notifications: Notification[];
  currentUser: User | null;
```

Replace with:

```ts
  tasks: Task[];
  currentUser: User | null;
```

- [ ] **Step 5: Remove `markNotificationsRead` from the `Store` interface**

Find:

```ts
  toggleTaskDone: (taskId: string) => void;

  markNotificationsRead: () => void;

  updateProfileName: (name: string) => void;
```

Replace with:

```ts
  toggleTaskDone: (taskId: string) => void;

  updateProfileName: (name: string) => void;
```

- [ ] **Step 6: Remove the `notifications` state**

Find:

```ts
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
```

Replace with:

```ts
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
```

- [ ] **Step 7: Delete `loadNotifications`**

Find:

```ts
  async function loadNotifications(userId: string): Promise<Notification[]> {
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    const mapped = (data ?? []).map(mapNotification);
    setNotifications(mapped);
    return mapped;
  }

  async function loadCustomers(): Promise<Customer[]> {
```

Replace with:

```ts
  async function loadCustomers(): Promise<Customer[]> {
```

- [ ] **Step 8: Delete the `loadNotifications` call in the auto-restore effect**

Find:

```ts
        if (profile) {
          setCurrentUserId(profile.id);
          loadNotifications(profile.id);
          sweepStalePool(loadedCustomers, loadedActivities, loadedAssignmentEvents, profile.id, profile.role === "ADMIN");
```

Replace with:

```ts
        if (profile) {
          setCurrentUserId(profile.id);
          sweepStalePool(loadedCustomers, loadedActivities, loadedAssignmentEvents, profile.id, profile.role === "ADMIN");
```

- [ ] **Step 9: Delete the `notifications` realtime table entry**

Find:

```ts
      { table: "tasks", setState: (fn) => setTasks(fn), mapRow: mapTask, keyOf: (x) => x.id },
      { table: "notifications", setState: (fn) => setNotifications(fn), mapRow: mapNotification, keyOf: (x) => x.id },
    ];
```

Replace with:

```ts
      { table: "tasks", setState: (fn) => setTasks(fn), mapRow: mapTask, keyOf: (x) => x.id },
    ];
```

- [ ] **Step 10: Delete the `loadNotifications` call in `login()`**

Find:

```ts
    setCurrentUserId(profile.id);
    await loadNotifications(profile.id);
    sweepStalePool(loadedCustomers, loadedActivities, loadedAssignmentEvents, profile.id, profile.role === "ADMIN");
```

Replace with:

```ts
    setCurrentUserId(profile.id);
    sweepStalePool(loadedCustomers, loadedActivities, loadedAssignmentEvents, profile.id, profile.role === "ADMIN");
```

- [ ] **Step 11: Delete the `notifications` reset in `logout()`**

Find:

```ts
  function logout() {
    const supabase = createClient();
    supabase.auth.signOut();
    setCurrentUserId(null);
    setCustomers([]);
    setNotifications([]);
  }
```

Replace with:

```ts
  function logout() {
    const supabase = createClient();
    supabase.auth.signOut();
    setCurrentUserId(null);
    setCustomers([]);
  }
```

- [ ] **Step 12: Delete the auto-second-assign `createNotification` call (and its now-unused `winnerName`)**

Find:

```ts
      const winnerId = winner.id;
      const winnerName = winner.name;
      pointerByTeam.set(team.id, winnerId);
      extraAssignedCount.set(winnerId, (extraAssignedCount.get(winnerId) ?? 0) + 1);
      setCustomers((prev) =>
        prev.map((row) => (row.id === c.id ? { ...row, assignedToUserId2: winnerId, pool2: "ACTIVE", pool2Since: null, stage2Id: defaultStage?.id ?? null } : row))
      );
      supabase.from("customers").update({ assigned_to_2: winnerId, pool_2: "ACTIVE", pool_2_since: null, stage_2: defaultStage?.id ?? null }).eq("id", c.id).then(() => {});
      setTeams((prev) => prev.map((t) => (t.id === team.id ? { ...t, lastAutoAssignedUserId: winnerId } : t)));
      supabase.from("teams").update({ last_auto_assigned_user_id: winnerId }).eq("id", team.id).then(() => {});
      createNotification(winnerId, `${winnerName} was assigned ${c.name}.`);
      logAssignmentEvent(c.id, winnerId, 2);
```

Replace with:

```ts
      const winnerId = winner.id;
      pointerByTeam.set(team.id, winnerId);
      extraAssignedCount.set(winnerId, (extraAssignedCount.get(winnerId) ?? 0) + 1);
      setCustomers((prev) =>
        prev.map((row) => (row.id === c.id ? { ...row, assignedToUserId2: winnerId, pool2: "ACTIVE", pool2Since: null, stage2Id: defaultStage?.id ?? null } : row))
      );
      supabase.from("customers").update({ assigned_to_2: winnerId, pool_2: "ACTIVE", pool_2_since: null, stage_2: defaultStage?.id ?? null }).eq("id", c.id).then(() => {});
      setTeams((prev) => prev.map((t) => (t.id === team.id ? { ...t, lastAutoAssignedUserId: winnerId } : t)));
      supabase.from("teams").update({ last_auto_assigned_user_id: winnerId }).eq("id", team.id).then(() => {});
      logAssignmentEvent(c.id, winnerId, 2);
```

- [ ] **Step 13: Delete the manual-reassign `createNotification` call (and its now-unused `assignee`)**

Find:

```ts
    supabase.from("customers").update(update).eq("id", customerId).then(() => {});
    const assignee = userId ? users.find((u) => u.id === userId) : undefined;
    if (assignee) {
      createNotification(userId!, `${assignee.name} was assigned ${customer.name}.`);
    }
    if (userId && changing) {
      logAssignmentEvent(customerId, userId, slot);
    }
```

Replace with:

```ts
    supabase.from("customers").update(update).eq("id", customerId).then(() => {});
    if (userId && changing) {
      logAssignmentEvent(customerId, userId, slot);
    }
```

- [ ] **Step 14: Delete the removal-request-resolution `createNotification` call**

Find:

```ts
        reassignCustomer(request.customerId, request.slot, null);
      }
    }
    createNotification(
      request.requestedBy,
      approve ? "Your client removal request was approved." : "Your client removal request was rejected."
    );
  }
```

Replace with:

```ts
        reassignCustomer(request.customerId, request.slot, null);
      }
    }
  }
```

- [ ] **Step 15: Delete `markNotificationsRead` and `createNotification`**

Find:

```ts
  function markNotificationsRead() {
    const unreadIds = notifications.filter((n) => n.unread).map((n) => n.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    if (unreadIds.length === 0) return;
    const supabase = createClient();
    supabase.from("notifications").update({ read: true }).in("id", unreadIds).then(() => {});
  }

  function createNotification(userId: string, message: string) {
    const supabase = createClient();
    supabase
      .from("notifications")
      .insert({ user_id: userId, type: "ASSIGNMENT", message, read: false })
      .select()
      .single()
      .then(({ data, error }) => {
        if (!error && data && data.user_id === currentUserId) {
          setNotifications((prev) => [mapNotification(data), ...prev]);
        }
      });
  }

  function updateProfileName(name: string) {
```

Replace with:

```ts
  function updateProfileName(name: string) {
```

- [ ] **Step 16: Remove `notifications` and `markNotificationsRead` from the returned `value` object**

Find:

```ts
    tasks,
    notifications,
```

Replace with:

```ts
    tasks,
```

Then find:

```ts
    addTask,
    toggleTaskDone,
    markNotificationsRead,
    updateProfileName,
```

Replace with:

```ts
    addTask,
    toggleTaskDone,
    updateProfileName,
```

- [ ] **Step 17: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (this will also surface any other stray reference this plan missed — fix inline if so, following the same delete-only approach).

- [ ] **Step 18: Commit**

```bash
git add lib/types.ts lib/store.tsx
git commit -m "$(cat <<'EOF'
Remove notification feature from store and types

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Remove the bell from the header

**Files:**
- Modify: `components/Header.tsx`

- [ ] **Step 1: Replace the whole file**

`components/Header.tsx` currently destructures `notifications`/`markNotificationsRead` from the store and renders a bell button + dropdown alongside the profile menu. Replace the full file with:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";

export default function Header() {
  const router = useRouter();
  const { currentUser, logout } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  if (!currentUser) return null;

  const initials = currentUser.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 64,
        padding: "0 28px",
        background: "#ffffff",
        borderBottom: "1px solid #e2e4e9",
        position: "relative",
        zIndex: 10,
      }}
    >
      <Link href="/customers" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/logo.jpg" alt="BizLocate" style={{ height: 30, width: "auto" }} />
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none" }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "#e8e9ef",
                color: "#4046c9",
                fontSize: 12,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {initials}
            </div>
            <span style={{ fontSize: 13.5, color: "#20222b", fontWeight: 500 }}>
              {currentUser.name} ({currentUser.role})
            </span>
            <div
              style={{
                width: 0,
                height: 0,
                borderLeft: "4px solid transparent",
                borderRight: "4px solid transparent",
                borderTop: "5px solid #9aa0ab",
              }}
            />
          </button>
          {menuOpen && (
            <div
              style={{
                position: "absolute",
                top: 40,
                right: 0,
                width: 160,
                background: "#fff",
                border: "1px solid #e2e4e9",
                borderRadius: 10,
                boxShadow: "0 16px 40px rgba(20,22,30,.16)",
                overflow: "hidden",
                zIndex: 5,
              }}
            >
              {currentUser.role === "ADMIN" && (
                <Link
                  href="/admin/users"
                  onClick={() => setMenuOpen(false)}
                  style={{ display: "block", padding: "10px 14px", fontSize: 13.5, color: "#20222b", borderBottom: "1px solid #eef0f2" }}
                >
                  User Control
                </Link>
              )}
              {currentUser.role === "ADMIN" && (
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  style={{ display: "block", padding: "10px 14px", fontSize: 13.5, color: "#20222b" }}
                >
                  Settings
                </Link>
              )}
              <button
                onClick={handleLogout}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  fontSize: 13.5,
                  color: "#20222b",
                  background: "none",
                  border: "none",
                  borderTop: "1px solid #eef0f2",
                }}
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run `npm run dev`, log in, confirm the header shows only the avatar/name/role menu (User Control/Settings for Admin, Log out for everyone) — no bell icon anywhere, no console errors.

- [ ] **Step 4: Commit**

```bash
git add components/Header.tsx
git commit -m "$(cat <<'EOF'
Remove notification bell from header

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
