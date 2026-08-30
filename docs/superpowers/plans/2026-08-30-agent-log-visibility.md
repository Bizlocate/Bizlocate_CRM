# Agent Log Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the customer detail page's activity log into per-agent blocks, gate the Manager's write form to only their own assigned customers, and give Admin a new page to browse any agent's log across all customers.

**Architecture:** Two independent, additive UI changes on top of existing data — no schema or store changes. Task 1 reshapes rendering in the existing customer detail page. Task 2 adds one new admin route plus a nav-tab entry, filtering data already loaded by `useStore()`.

**Tech Stack:** Next.js App Router, React (client components, `"use client"`), TypeScript, existing `useStore()` context from `lib/store.tsx`, inline styles matching existing pages (no CSS framework in this codebase).

## Global Constraints

- No backend/RLS change. The Manager write-form gate is UI-only, per
  `docs/superpowers/specs/2026-08-30-agent-log-visibility-design.md`.
- No schema change — `Activity.authorUserId` (in [lib/types.ts:259](lib/types.ts:259)) already carries what's needed.
- No test framework in this repo (`package.json` has no `test` script). Verification is `npm run build` (type-check) plus manual check in the browser preview.
- Match existing code style in the files touched: inline `style={{...}}` objects, no CSS classes beyond the existing `.card`/`.field-input`/`.btn` utility classes, no new dependencies.

---

### Task 1: Customer profile — grouped log blocks + Manager write-gate

**Files:**
- Modify: `app/(dashboard)/customers/[id]/page.tsx`

**Interfaces:**
- Consumes: `Activity` type (`id`, `customerId`, `type`, `content`, `followUp`, `author`, `authorUserId`, `time`, `createdAt`) from `@/lib/types`; `User` fields `.id`, `.name`, `.role` from `useStore()`'s `users`; existing local `assignedUsers: { slot: 1 | 2 | 3; user: User }[]` (already computed at [app/(dashboard)/customers/[id]/page.tsx:74-76](app/(dashboard)/customers/[id]/page.tsx:74)); existing local `customerActivities: Activity[]` (already computed at line 110).
- Produces: nothing consumed by Task 2 — this task is self-contained.

- [ ] **Step 1: Import `Activity` type**

In `app/(dashboard)/customers/[id]/page.tsx`, change the types import:

```tsx
import { ACTIVITY_STYLES, Activity, ActivityType } from "@/lib/types";
```

- [ ] **Step 2: Add the `canLogActivity` gate and `logGroups` derivation**

Immediately after the existing `const customerActivities = activities.filter((a) => a.customerId === customer.id);` line (currently line 110), add:

```tsx
  const canLogActivity = currentUser.role !== "MANAGER" || assignedUsers.some(({ user }) => user.id === currentUser.id);

  function roleLabel(role: string) {
    return role === "SALESPERSON" ? "Sales Person" : role === "MANAGER" ? "Manager" : "Admin";
  }

  const logGroups: { key: string; label: string; roleLabel: string; entries: Activity[] }[] = [];
  const groupedAuthorIds = new Set<string>();

  assignedUsers.forEach(({ slot, user }) => {
    groupedAuthorIds.add(user.id);
    logGroups.push({
      key: user.id,
      label: assignedUsers.length > 1 ? `${user.name} (Assigned ${slot})` : user.name,
      roleLabel: roleLabel(user.role),
      entries: customerActivities.filter((a) => a.authorUserId === user.id),
    });
  });

  const otherAuthorIds = Array.from(new Set(customerActivities.map((a) => a.authorUserId).filter((id) => !groupedAuthorIds.has(id))));
  otherAuthorIds
    .map((authorId) => ({ authorId, latest: customerActivities.find((a) => a.authorUserId === authorId)! }))
    .sort((a, b) => new Date(b.latest.createdAt).getTime() - new Date(a.latest.createdAt).getTime())
    .forEach(({ authorId }) => {
      const entries = customerActivities.filter((a) => a.authorUserId === authorId);
      const author = users.find((u) => u.id === authorId);
      logGroups.push({
        key: authorId,
        label: author?.name ?? entries[0]?.author ?? "Unknown",
        roleLabel: author ? roleLabel(author.role) : "",
        entries,
      });
    });
```

This groups `customerActivities` (already newest-first from the store) by author: assignee slots first in slot order, then any other author ordered by their most recent entry. `assignedUsers` is filtered to filled slots already, so an unfilled slot produces no block — matching the spec's "only slots that are currently filled" rule; a filled slot with zero activities still gets a block via the empty-`entries` array, rendered in Step 4.

- [ ] **Step 3: Gate the write form**

Find the "Log activity" form (currently `<form onSubmit={handleLogActivity} ...>` through its closing `</form>`, lines ~355-382). Wrap it:

```tsx
          {canLogActivity && (
            <form onSubmit={handleLogActivity} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  className="field-input"
                  style={{ width: 120 }}
                  value={activityType}
                  onChange={(e) => setActivityType(e.target.value as ActivityType)}
                >
                  <option value="NOTE">Note</option>
                  <option value="CALL">Call</option>
                  <option value="VISIT">Visit</option>
                </select>
                <input
                  className="field-input"
                  style={{ flex: 1 }}
                  placeholder="What happened?"
                  value={activityContent}
                  onChange={(e) => setActivityContent(e.target.value)}
                />
                <button className="btn btn-primary" type="submit">Log</button>
              </div>
              <input
                className="field-input"
                placeholder="Follow-up date (optional)"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
              />
            </form>
          )}
```

(Only the wrapping `{canLogActivity && ( ... )}` is new — the form's contents are unchanged, just re-indented one level.)

- [ ] **Step 4: Replace the single activity list with grouped blocks**

Replace the block that currently reads:

```tsx
          <div className="card">
            {customerActivities.length === 0 && (
              <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>No activity logged yet.</div>
            )}
            {customerActivities.map((a) => {
              const style = ACTIVITY_STYLES[a.type];
              return (
                <div key={a.id} style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: style.bg, color: style.color }}>
                      {style.label}
                    </span>
                    <span style={{ fontSize: 12, color: "#9aa0ab" }}>{a.time} · {a.author}</span>
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{a.content}</div>
                  {a.followUp && <div style={{ fontSize: 12, color: "#8a5a00", fontWeight: 500 }}>{a.followUp}</div>}
                </div>
              );
            })}
          </div>
```

with:

```tsx
          {logGroups.length === 0 && (
            <div className="card" style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>No activity logged yet.</div>
          )}
          {logGroups.map((group) => (
            <div key={group.key} className="card" style={{ marginBottom: 16 }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid #eef0f2", background: "#f7f7f8", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>
                  {group.label}{group.roleLabel ? ` · ${group.roleLabel}` : ""}
                </span>
                <span style={{ fontSize: 11.5, color: "#9aa0ab" }}>
                  {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}
                </span>
              </div>
              {group.entries.length === 0 ? (
                <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>No activity logged yet.</div>
              ) : (
                group.entries.map((a) => {
                  const style = ACTIVITY_STYLES[a.type];
                  return (
                    <div key={a.id} style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2", display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: style.bg, color: style.color }}>
                          {style.label}
                        </span>
                        <span style={{ fontSize: 12, color: "#9aa0ab" }}>{a.time}</span>
                      </div>
                      <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{a.content}</div>
                      {a.followUp && <div style={{ fontSize: 12, color: "#8a5a00", fontWeight: 500 }}>{a.followUp}</div>}
                    </div>
                  );
                })
              )}
            </div>
          ))}
```

(The per-entry author name is dropped from the row since the block header already names the author — avoids repeating it on every line.)

- [ ] **Step 5: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors in `app/(dashboard)/customers/[id]/page.tsx`.

- [ ] **Step 6: Manual verification**

Using the browser preview (`npm run dev`):
1. Open a customer with 2 assignees who each have logged activities → confirm two blocks appear, in slot order, each with only that assignee's entries and correct counts.
2. Log an activity as the current user → confirm it appears at the top of that user's own block (or a new block if they weren't already an author).
3. Log in as a Manager who is **not** one of the customer's three assignees → confirm the "Log activity" form is gone but all blocks are still visible read-only.
4. Log in as a Manager who **is** an assignee on a different customer → confirm the form shows there.
5. Log in as Admin or Salesperson → confirm the form still shows exactly as before (unaffected by the gate).

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/customers/[id]/page.tsx"
git commit -m "Customer profile: group activity log per agent, gate Manager write form

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Admin global agent-log page

**Files:**
- Create: `app/(dashboard)/admin/agent-logs/page.tsx`
- Modify: `components/AdminTabs.tsx`

**Interfaces:**
- Consumes: `useStore()` fields `users: User[]`, `activities: Activity[]`, `currentUser` — same shapes as Task 1 (no change made there affects this task). `User.role` is one of `"ADMIN" | "MANAGER" | "SALESPERSON"` ([lib/types.ts:1](lib/types.ts:1)). `Activity` fields as listed in Task 1.
- Produces: new route `/admin/agent-logs`, reachable via the admin tab bar. Nothing else depends on this route.

- [ ] **Step 1: Add the nav tab**

In `components/AdminTabs.tsx`, add an entry to the `TABS` array (after `"Users"` fits the "people-facing" grouping best):

```tsx
const TABS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/agent-logs", label: "Agent Logs" },
  { href: "/admin/teams", label: "Teams" },
  { href: "/admin/area", label: "Area" },
  { href: "/admin/business-tags", label: "Business Tag" },
  { href: "/admin/stages", label: "Pipeline Stages" },
  { href: "/admin/profile-lists", label: "Profile Lists" },
  { href: "/admin/field-settings", label: "Required Fields" },
];
```

- [ ] **Step 2: Create the page**

Create `app/(dashboard)/admin/agent-logs/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { ACTIVITY_STYLES } from "@/lib/types";
import AdminTabs from "@/components/AdminTabs";

export default function AdminAgentLogsPage() {
  const { users, activities, customers } = useStore();
  const agents = users.filter((u) => u.role === "SALESPERSON" || u.role === "MANAGER");
  const [agentId, setAgentId] = useState<string>("");
  // users load asynchronously from the store, so `agents` is empty on first render —
  // fall back to the first loaded agent until the person picks one explicitly.
  const effectiveAgentId = agentId || agents[0]?.id || "";

  const agentActivities = activities.filter((a) => a.authorUserId === effectiveAgentId);

  function customerName(customerId: string) {
    return customers.find((c) => c.id === customerId)?.name ?? "Unknown customer";
  }

  return (
    <div style={{ padding: "28px 32px" }}>
      <AdminTabs />
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Agent Logs</div>
      <div style={{ marginBottom: 16 }}>
        <select className="field-input" style={{ width: 260 }} value={effectiveAgentId} onChange={(e) => setAgentId(e.target.value)}>
          {agents.length === 0 && <option value="">No agents</option>}
          {agents.map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
          ))}
        </select>
      </div>
      <div className="card">
        {agentActivities.length === 0 && (
          <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>No activity logged by this agent yet.</div>
        )}
        {agentActivities.map((a) => {
          const style = ACTIVITY_STYLES[a.type];
          return (
            <div key={a.id} style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: style.bg, color: style.color }}>
                  {style.label}
                </span>
                <span style={{ fontSize: 12, color: "#9aa0ab" }}>{a.time}</span>
                <Link href={`/customers/${a.customerId}`} style={{ fontSize: 12, fontWeight: 600, color: "#4046c9" }}>
                  {customerName(a.customerId)}
                </Link>
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{a.content}</div>
              {a.followUp && <div style={{ fontSize: 12, color: "#8a5a00", fontWeight: 500 }}>{a.followUp}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

`customers` is already exported by `useStore()` ([lib/store.tsx:279](lib/store.tsx:279) declares it on the context type, returned at [lib/store.tsx:1588](lib/store.tsx:1588)) — this is the full unscoped list, which is what's needed here since a picked agent's customers may span teams. No store changes required.

- [ ] **Step 3: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 4: Manual verification**

Using the browser preview, logged in as Admin:
1. Visit `/admin/agent-logs` (or click "Agent Logs" in the admin tab bar) → page loads, agent dropdown lists all Managers and Salespeople (no Admins).
2. Pick an agent who has logged entries on 2+ different customers → confirm every entry shows, newest first, each with the correct customer name and a working link to that customer's profile.
3. Pick an agent with zero logged entries → confirm the "No activity logged by this agent yet." message shows.
4. Log in as Manager or Salesperson and try navigating to `/admin/agent-logs` directly → confirm the existing `AdminLayout` guard ([app/(dashboard)/admin/layout.tsx](app/(dashboard)/admin/layout.tsx)) redirects them to `/customers` (no new guard code needed — this is inherited for free from the route group).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/admin/agent-logs/page.tsx" components/AdminTabs.tsx
git commit -m "Add admin agent-logs page: browse any agent's log across all customers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
