# Realtime sync (whole store) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every array held in `StoreProvider` (`lib/store.tsx`) updates live across all open sessions — an insert/update/delete by any user is reflected in every other user's browser within ~1 second, no page refresh — matching the spec's motivating example (Admin approves a blast request, the affected salesperson's nav badge updates without reload).

**Architecture:** One Supabase Realtime channel per logged-in session, subscribed to Postgres Changes on all 31 table-backed state arrays, wired into the existing `StoreProvider` in `lib/store.tsx`. A single generic reducer (`applyRealtimeChange`) reuses every existing `mapXxx` row-mapper to turn a change payload into an insert/update/delete against the matching `useState` array — no per-table bespoke code.

**Tech Stack:** `@supabase/supabase-js` v2 Realtime Postgres Changes API (already installed, already used for auth — no new dependency). No test framework in this repo.

## Global Constraints

- No automated test framework exists (`package.json` has no test runner — confirmed). Every task's verification step is `npx tsc --noEmit` (whole-codebase type check) plus a concrete manual check, matching this repo's established convention (see `docs/superpowers/plans/2026-09-07-retargeting-blasting.md`).
- Schema/publication changes are **not auto-applied**. `supabase/schema.sql` is a reference file only — the actual Supabase database is updated by hand in the Supabase SQL editor. Task 1's migration must be run there before Task 2's manual end-to-end check will show real cross-session updates.
- RLS is already confirmed enabled (`rowsecurity = true`) on every table in the live Supabase database — Realtime automatically scopes each subscriber's change events to what their own RLS policies let them `select`, so no extra client-side filtering is needed.

---

## Task 1: Publication migration

**Files:**
- Modify: `supabase/schema.sql` (append at end of file, after the last commented migration block)

- [ ] **Step 1: Append the migration block**

Add this to the end of `supabase/schema.sql`, matching the file's existing convention (every statement commented with `--` — the user copy-pastes the uncommented SQL into the Supabase SQL editor themselves):

```sql

-- ============================================================
-- Migration: Realtime sync — add every table the client keeps
-- live in lib/store.tsx to the Realtime publication (notifications
-- was already added; this covers the other 30 state-backed tables).
-- ============================================================
--
-- alter publication supabase_realtime add table
--   profiles, teams, areas, sub_areas,
--   business_tag_industries, business_tag_categories, business_tag_types,
--   lead_sources, property_types, purposes, languages, firsttime_branch_types,
--   races, target_races, target_types, removal_reasons,
--   mandatory_field_settings, pipeline_stages,
--   customers, activities, customer_change_log, deal_closures, sales_targets,
--   assignment_events, stage_events,
--   removal_requests, blast_requests, blast_items, blast_claim_requests,
--   tasks;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/schema.sql
git commit -m "$(cat <<'EOF'
Add realtime publication migration for whole-store sync

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

**Tell the user explicitly after this commit:** this SQL has **not** been run against the live Supabase database yet — copy the uncommented `alter publication ...` statement into the Supabase SQL editor before testing Task 2 end to end across two sessions.

---

## Task 2: Realtime wiring in the store

**Files:**
- Modify: `lib/store.tsx`

**Interfaces:**
- Produces: no new public `Store` interface members — this is internal wiring. Existing consumers (`MainNav.tsx`, every page reading from `useStore()`) get live data through the same `users`, `customers`, `blastRequests`, etc. arrays they already read; no call-site changes anywhere else in the app.

- [ ] **Step 1: Add `useRef` to the React import**

In `lib/store.tsx`, find:

```ts
import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
```

Replace with:

```ts
import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
```

- [ ] **Step 2: Add the generic realtime merge helper**

Find (this is right after `mapNotification`, right before `interface LoginResult`):

```ts
function mapNotification(row: { id: string; message: string; created_at: string; read: boolean }): Notification {
  return { id: row.id, message: row.message, time: formatTimestamp(row.created_at), unread: !row.read };
}

interface LoginResult {
```

Replace with:

```ts
function mapNotification(row: { id: string; message: string; created_at: string; read: boolean }): Notification {
  return { id: row.id, message: row.message, time: formatTimestamp(row.created_at), unread: !row.read };
}

// One Realtime channel (see the effect in StoreProvider) drives every
// table-backed array in the store through this single reducer, reusing
// the mapXxx row-mappers already defined above -- no per-table bespoke
// insert/update/delete code. keyOf defaults to `id` for every table
// except mandatory_field_settings (keyed by fieldKey).
type RealtimeTableEntry = {
  table: string;
  setState: (fn: (prev: any[]) => any[]) => void;
  mapRow: (row: any) => any;
  keyOf: (item: any) => string;
};

function applyRealtimeChange(entry: RealtimeTableEntry, payload: RealtimePostgresChangesPayload<Record<string, any>>) {
  if (payload.eventType === "DELETE") {
    const deadKey = entry.keyOf(entry.mapRow(payload.old));
    entry.setState((prev) => prev.filter((x) => entry.keyOf(x) !== deadKey));
    return;
  }
  const mapped = entry.mapRow(payload.new);
  entry.setState((prev) => {
    const i = prev.findIndex((x) => entry.keyOf(x) === entry.keyOf(mapped));
    if (i === -1) return [...prev, mapped];
    const copy = [...prev];
    copy[i] = mapped;
    return copy;
  });
}

interface LoginResult {
```

- [ ] **Step 3: Run the type check to confirm no errors so far**

Run: `npx tsc --noEmit`
Expected: no new errors (this step only added unused-at-this-point but referenced-nowhere-yet types/functions, which TS does not flag).

- [ ] **Step 4: Add `usersRef` (kept current for the two mappers that need a `users` join)**

Find:

```ts
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
```

Replace with:

```ts
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // mapActivity/mapChangeLog need a live users lookup for the author's
  // name; the realtime effect below sets its channel up once per login,
  // so its callbacks read this ref (not the `users` state variable
  // directly) to always see the latest users array.
  const usersRef = useRef(users);
  useEffect(() => {
    usersRef.current = users;
  }, [users]);
```

- [ ] **Step 5: Add the subscription effect**

Find the end of the existing post-login load effect:

```ts
      setInitialized(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentUser = useMemo(
```

Replace with:

```ts
      setInitialized(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!currentUserId) return;
    const supabase = createClient();
    const entries: RealtimeTableEntry[] = [
      { table: "profiles", setState: (fn) => setUsers(fn), mapRow: mapProfile, keyOf: (x) => x.id },
      { table: "teams", setState: (fn) => setTeams(fn), mapRow: mapTeam, keyOf: (x) => x.id },
      { table: "areas", setState: (fn) => setAreas(fn), mapRow: mapArea, keyOf: (x) => x.id },
      { table: "sub_areas", setState: (fn) => setSubAreas(fn), mapRow: mapSubArea, keyOf: (x) => x.id },
      { table: "business_tag_industries", setState: (fn) => setBusinessTagIndustries(fn), mapRow: mapBusinessTagIndustry, keyOf: (x) => x.id },
      { table: "business_tag_categories", setState: (fn) => setBusinessTagCategories(fn), mapRow: mapBusinessTagCategory, keyOf: (x) => x.id },
      { table: "business_tag_types", setState: (fn) => setBusinessTagTypes(fn), mapRow: mapBusinessTagType, keyOf: (x) => x.id },
      { table: "lead_sources", setState: (fn) => setLeadSources(fn), mapRow: mapLeadSource, keyOf: (x) => x.id },
      { table: "property_types", setState: (fn) => setPropertyTypes(fn), mapRow: mapPropertyType, keyOf: (x) => x.id },
      { table: "purposes", setState: (fn) => setPurposes(fn), mapRow: mapPurpose, keyOf: (x) => x.id },
      { table: "languages", setState: (fn) => setLanguages(fn), mapRow: mapLanguage, keyOf: (x) => x.id },
      { table: "firsttime_branch_types", setState: (fn) => setFirsttimeBranchTypes(fn), mapRow: mapFirsttimeBranchType, keyOf: (x) => x.id },
      { table: "races", setState: (fn) => setRaces(fn), mapRow: mapRace, keyOf: (x) => x.id },
      { table: "target_races", setState: (fn) => setTargetRaces(fn), mapRow: mapTargetRace, keyOf: (x) => x.id },
      { table: "target_types", setState: (fn) => setTargetTypes(fn), mapRow: mapTargetType, keyOf: (x) => x.id },
      { table: "mandatory_field_settings", setState: (fn) => setFieldRequirements(fn), mapRow: mapFieldRequirement, keyOf: (x) => x.fieldKey },
      { table: "pipeline_stages", setState: (fn) => setStages(fn), mapRow: mapStage, keyOf: (x) => x.id },
      { table: "customers", setState: (fn) => setCustomers(fn), mapRow: mapCustomer, keyOf: (x) => x.id },
      { table: "activities", setState: (fn) => setActivities(fn), mapRow: (row) => mapActivity(row, new Map(usersRef.current.map((u) => [u.id, u]))), keyOf: (x) => x.id },
      { table: "customer_change_log", setState: (fn) => setChangeLog(fn), mapRow: (row) => mapChangeLog(row, new Map(usersRef.current.map((u) => [u.id, u]))), keyOf: (x) => x.id },
      { table: "deal_closures", setState: (fn) => setDealClosures(fn), mapRow: mapDealClosure, keyOf: (x) => x.id },
      { table: "sales_targets", setState: (fn) => setSalesTargets(fn), mapRow: mapSalesTarget, keyOf: (x) => x.id },
      { table: "assignment_events", setState: (fn) => setAssignmentEvents(fn), mapRow: mapAssignmentEvent, keyOf: (x) => x.id },
      { table: "stage_events", setState: (fn) => setStageEvents(fn), mapRow: mapStageEvent, keyOf: (x) => x.id },
      { table: "removal_reasons", setState: (fn) => setRemovalReasons(fn), mapRow: mapRemovalReason, keyOf: (x) => x.id },
      { table: "removal_requests", setState: (fn) => setRemovalRequests(fn), mapRow: mapRemovalRequest, keyOf: (x) => x.id },
      { table: "blast_requests", setState: (fn) => setBlastRequests(fn), mapRow: mapBlastRequest, keyOf: (x) => x.id },
      { table: "blast_items", setState: (fn) => setBlastItems(fn), mapRow: mapBlastItem, keyOf: (x) => x.id },
      { table: "blast_claim_requests", setState: (fn) => setBlastClaimRequests(fn), mapRow: mapBlastClaimRequest, keyOf: (x) => x.id },
      { table: "tasks", setState: (fn) => setTasks(fn), mapRow: mapTask, keyOf: (x) => x.id },
      { table: "notifications", setState: (fn) => setNotifications(fn), mapRow: mapNotification, keyOf: (x) => x.id },
    ];
    const channel = supabase.channel("db-changes");
    for (const entry of entries) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: entry.table },
        (payload: RealtimePostgresChangesPayload<Record<string, any>>) => applyRealtimeChange(entry, payload)
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentUser = useMemo(
```

This effect only depends on `currentUserId`: it subscribes once per login and its cleanup (`removeChannel`) runs automatically both on logout (`currentUserId` goes back to `null` in `logout()`, already existing code — no change needed there) and on unmount. No changes needed to `login()` or `logout()`.

- [ ] **Step 6: Run the type check**

Run: `npx tsc --noEmit`
Expected: no errors. If TS flags `entry.setState(fn)` calls inside the array literal (e.g. "argument of type ... is not assignable"), it means one of the `setX` functions has a narrower type than `(prev: any[]) => any[]` expects — check that table's `useState<T[]>` declaration matches the pattern of the others (all 31 are plain `useState<Model[]>([])`, so this shouldn't happen, but fix the specific mismatched entry if it does rather than loosening the shared type).

- [ ] **Step 7: Manual verification**

Requires Task 1's migration already run against Supabase and `npm run dev` running. Two browser sessions (or one normal + one incognito window), logged in as different users:

1. **The motivating scenario:** log in as an Admin in session A and a Salesperson in session B. In session B, sit on any dashboard page (not `/blasting`). In session A, approve a pending blast request for that salesperson (or submit + approve one if none exist). Within ~1 second, session B's nav bar shows the new red batch-count badge on the Blasting tab — no refresh.
2. Log an activity on a customer in session A → session B (viewing that same customer's detail page) shows the new activity appear live, with the correct author name (confirms the `usersRef` join works for `mapActivity`).
3. Rename a Purpose (or any lookup value) as Admin in session A → session B's customer-form Purpose dropdown shows the new name without reload.
4. A Manager approves/rejects a removal request in session A → the Admin's Remove Approvals badge count in session B changes live.
5. Log out session A → check the browser console for errors (confirms the channel's cleanup ran and no callback fired against cleared state).

- [ ] **Step 8: Commit**

```bash
git add lib/store.tsx
git commit -m "$(cat <<'EOF'
Add realtime sync for every store table via one Postgres Changes channel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
