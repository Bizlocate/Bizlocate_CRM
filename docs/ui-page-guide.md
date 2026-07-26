# BizLocate CRM — UI Page Guide

Reference for every screen in the app: what appears, who sees it, and how it behaves. For module logic (data model, permissions, flows), see [`docs/modules/`](modules/).

---

## Table of Contents

1. [Login — `/login`](#1-login----login)
2. [Dashboard Shell — shared layout](#2-dashboard-shell--shared-layout)
3. [Customer List — `/customers`](#3-customer-list----customers)
4. [Customer Detail — `/customers/:id`](#4-customer-detail----customersid)
5. [User Management — `/admin/users`](#5-user-management----adminusers)
6. [Team Management — `/admin/teams`](#6-team-management----adminteams)
7. [Pipeline Stages — `/admin/stages`](#7-pipeline-stages----adminstages)
8. [Settings — `/settings`](#8-settings----settings)

---

## 1. Login — `/login`

**Access:** Public. Unauthenticated users are redirected here from any dashboard route.

### Layout

Full-page centered card. No header, no navigation.

### UI Elements

| Element | Type | Behaviour |
|---|---|---|
| App name / logo | Static heading | "BizLocate CRM" |
| Email | Text input | `type="email"`, required |
| Password | Text input | `type="password"`, required |
| Log in | Submit button | Submits credentials; disabled while request is in flight |
| Error message | Inline text (below form) | Appears on failed attempt: "Invalid email or password." Never reveals which field was wrong or whether the account exists. Also shown if account is `INACTIVE`. |

### States

| State | What the user sees |
|---|---|
| Default | Empty form |
| Submitting | Button disabled / loading indicator |
| Error | Error message below the form; inputs remain filled |
| Success | Redirect to `/customers` |

### Notes

- No "Forgot password" link — Admin resets credentials out of band.
- No "Sign up" link — no self-registration path.

---

## 2. Dashboard Shell — Shared Layout

Wraps every route under `/(dashboard)/*`. Rendered server-side; redirects to `/login` if no valid session.

### Layout

```
┌─────────────────────────────────────────────────┐
│  HEADER                                         │
│  [BizLocate CRM]          [Bell 🔔]  [Name·Role ▾] │
├─────────────────────────────────────────────────┤
│                                                 │
│  PAGE CONTENT (slot)                            │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Header Elements

| Element | Type | Behaviour |
|---|---|---|
| App name / logo | Link | Navigates to `/customers` |
| Notification bell | Icon button + badge | Badge shows unread count (live via Supabase Realtime). Clicking opens notification dropdown (see §2.1). Hidden badge when count is 0. |
| User name + role | Text + dropdown trigger | Displays `Name (ROLE)`. Clicking opens a small menu with "Settings" and "Log out". |

### 2.1 Notification Dropdown

Opens on bell click. Closes on outside click or pressing Escape.

| Element | Behaviour |
|---|---|
| Notification list | Newest first. Each item shows message text and relative timestamp (e.g. "2 min ago"). |
| Unread indicator | Unread items visually highlighted. Opening the dropdown marks all visible items as read; badge clears. |
| Empty state | "No notifications" when list is empty. |

### 2.2 User Menu

| Item | Behaviour |
|---|---|
| Settings | Navigates to `/settings` |
| Log out | Invalidates session server-side, clears cookie, redirects to `/login` |

### Role Differences

No visible difference in the shell itself — all roles see the same header. Admin-only nav links (`/admin/*`) are not listed in the shell; users reach them by direct URL or by links that only render for Admins (implementation detail — a non-Admin hitting `/admin/*` is redirected to `/customers`).

---

## 3. Customer List — `/customers`

**Access:** All authenticated roles. Data is role-scoped server-side.

### Layout

```
┌─────────────────────────────────────────────────┐
│  Page heading: "Customers"     [+ New Customer] │
├─────────────────────────────────────────────────┤
│  TABLE                                          │
│  Name | Email | Phone | Stage | Assigned To | › │
│  ───────────────────────────────────────────── │
│  Row…                                           │
│  Row…                                           │
└─────────────────────────────────────────────────┘
```

### UI Elements

| Element | Type | Behaviour |
|---|---|---|
| Page heading | Static text | "Customers" |
| New Customer button | Button (top right) | Opens create-customer form/modal. Visible to ADMIN and MANAGER only; hidden for SALESPERSON. |
| Customer table | Data table | Columns: Name, Email, Phone, Stage, Assigned To. Rows sorted newest first by default. Each row is clickable — navigates to `/customers/:id`. |
| Stage column | Text | Shows current pipeline stage name. |
| Assigned To column | Text | Shows the assigned salesperson's display name. Hidden for SALESPERSON (they only see their own customers; the column is redundant). |

### Role Differences

| | ADMIN | MANAGER | SALESPERSON |
|---|---|---|---|
| Records shown | All customers | Own team's customers only | Own assigned customers only |
| "New Customer" button | Visible | Visible | Hidden |
| "Assigned To" column | Visible | Visible | Hidden |

### States

| State | What the user sees |
|---|---|
| Loading | Skeleton rows or spinner while data fetches |
| Empty | "No customers yet." (Admin/Manager also see a prompt to create one.) |
| Error | "Could not load customers. Try refreshing." |

---

## 4. Customer Detail — `/customers/:id`

**Access:** All roles, scoped — a user who cannot see a customer is redirected to `/customers`.

### Layout

```
┌─────────────────────────────────────────────────┐
│  ← Back to Customers                            │
│  Customer Name                   [Delete]       │
│  Email · Phone · Assigned: Name                 │
│  Stage: [Stage Selector ▾]                      │
├───────────────────┬─────────────────────────────┤
│  ACTIVITY LOG     │  TASKS                      │
│  [Log Activity ▾] │  [+ Add Task]               │
│  ─────────────── │  ─────────────────────────  │
│  Entry…           │  □ Task title · Due date    │
│  Entry…           │  ✓ Done task                │
└───────────────────┴─────────────────────────────┘
```

### Customer Header Elements

| Element | Type | Behaviour |
|---|---|---|
| Back link | Link | "← Back to Customers" → navigates to `/customers` |
| Customer name | Static heading | Display name of the customer |
| Email / Phone | Static text | Contact details |
| Assigned To | Static text | Name of the assigned salesperson |
| Stage selector | Dropdown / select | Current stage shown. Selecting a new stage updates immediately (optimistic or with spinner). All visible roles can change stage. |
| Reassign button / field | Shown to ADMIN only | Changes `assigned_to`. Triggers notification to new assignee. |
| Delete button | Shown to ADMIN only | Deletes customer after confirmation prompt ("Delete this customer? This cannot be undone."). Redirects to `/customers` on success. |

### Activity Log (left panel)

| Element | Type | Behaviour |
|---|---|---|
| Log Activity form | Inline form (client component) | Type selector (Call / Visit / Note), free-text content field, optional follow-up date. Submit appends entry to the top of the list immediately. |
| Activity list | Chronological list, newest first | Each entry: type label, content text, follow-up date (if set), timestamp, and author name. Read-only once saved — no edit or delete. |
| Empty state | Static text | "No activity logged yet." |

### Task List (right panel)

| Element | Type | Behaviour |
|---|---|---|
| Add Task form | Inline form (client component) | Title text field, due date picker. Submit adds task to the open list immediately. |
| Open tasks | List sorted by due date ascending | Each task: checkbox (toggles done), title, due date. Checking marks as done — moves to done section, stays visible. |
| Done tasks | Separate sub-list | Completed tasks shown below open tasks, visually distinct. Preserved for history. |
| Empty state | Static text | "No tasks yet." |

### Role Differences

| | ADMIN | MANAGER | SALESPERSON |
|---|---|---|---|
| Change stage | Yes | Yes (team's customers) | Yes (own customers) |
| Reassign customer | Yes (field visible) | No | No |
| Delete customer | Yes (button visible) | No | No |
| Log activity | Yes | Yes | Yes |
| Add / complete task | Yes | Yes | Yes |

---

## 5. User Management — `/admin/users`

**Access:** ADMIN only. Non-admins redirected to `/customers`.

### Layout

```
┌─────────────────────────────────────────────────┐
│  Admin — Users                    [+ New User]  │
├─────────────────────────────────────────────────┤
│  TABLE                                          │
│  Name | Email | Role | Team | Status | Actions  │
│  ──────────────────────────────────────────── │
│  Row…                                           │
└─────────────────────────────────────────────────┘
```

### UI Elements

| Element | Type | Behaviour |
|---|---|---|
| Page heading | Static text | "Admin — Users" |
| New User button | Button (top right) | Opens create-user form (see §5.1) |
| User table | Data table | Columns: Name, Email, Role, Team, Status (ACTIVE / INACTIVE), Actions |
| Status badge | Coloured label | ACTIVE = green, INACTIVE = grey/red |
| Deactivate / Reactivate | Action button per row | Toggles `profiles.status`. Deactivated users cannot log in; existing sessions run until natural expiry. |

### 5.1 New User Form

Modal or inline form.

| Field | Type | Notes |
|---|---|---|
| Name | Text input | Required |
| Email | Email input | Required. Must be unique. |
| Role | Select | ADMIN / MANAGER / SALESPERSON |
| Team | Select (optional) | Lists existing teams. Can be left blank and set later. |
| Submit | Button | Creates `auth.users` + `profiles` row. Shows the temp password **once** in a confirmation dialog — Admin copies it to relay to the new user. |

### States

| State | What the user sees |
|---|---|
| Loading | Skeleton rows |
| Empty | "No users yet. Create the first one." |
| After create | New row appears; temp-password dialog shown once |
| Deactivate confirm | Inline confirmation ("Deactivate this user?") before action |

---

## 6. Team Management — `/admin/teams`

**Access:** ADMIN only. Non-admins redirected to `/customers`.

### Layout

```
┌─────────────────────────────────────────────────┐
│  Admin — Teams                    [+ New Team]  │
├─────────────────────────────────────────────────┤
│  TABLE                                          │
│  Team Name | Manager | Members | Actions        │
│  ──────────────────────────────────────────── │
│  Row…                                           │
└─────────────────────────────────────────────────┘
```

### UI Elements

| Element | Type | Behaviour |
|---|---|---|
| Page heading | Static text | "Admin — Teams" |
| New Team button | Button (top right) | Opens create-team form (see §6.1) |
| Team table | Data table | Columns: Team Name, Manager (name), Members (count), Actions |
| Edit | Action per row | Opens edit form — rename team, change manager |

### 6.1 New / Edit Team Form

| Field | Type | Notes |
|---|---|---|
| Team name | Text input | Required |
| Manager | Select | Lists users with role MANAGER. Optional — a team can exist without a manager initially. |
| Submit | Button | Creates / updates team. Changing the manager updates visibility scoping immediately. |

### Notes

- Member assignment is done from the **Users** page (`/admin/users`) by editing a user's `team_id` — not from this page directly.
- Member count shown in the table is derived from `profiles.team_id` count.

### States

| State | What the user sees |
|---|---|
| Empty | "No teams yet. Create one." |
| After create | New row appears immediately |

---

## 7. Pipeline Stages — `/admin/stages`

**Access:** ADMIN only. Non-admins redirected to `/customers`. Stage list is read-only for non-admins (used in customer stage selector).

### Layout

```
┌─────────────────────────────────────────────────┐
│  Admin — Pipeline Stages          [+ New Stage] │
├─────────────────────────────────────────────────┤
│  ORDERED LIST                                   │
│  ⠿ 1. New            [Edit] [Delete]            │
│  ⠿ 2. Contacted      [Edit] [Delete]            │
│  ⠿ 3. Qualified      [Edit] [Delete]            │
│  ⠿ 4. Won            [Edit]                     │
│  ⠿ 5. Lost           [Edit]                     │
└─────────────────────────────────────────────────┘
```

### UI Elements

| Element | Type | Behaviour |
|---|---|---|
| Page heading | Static text | "Admin — Pipeline Stages" |
| New Stage button | Button (top right) | Opens inline add form |
| Stage list | Ordered list with drag handles | Reordering changes `pipeline_stages.order`; reflected globally in all customer stage selectors immediately |
| Edit | Per-row action | Renames stage inline |
| Delete | Per-row action | Removes stage. Only available if no customers are currently on that stage (or requires reassigning them first — show count warning if any). |
| Default badge | Label on one row | Marks the `is_default` stage — new customers start here. |

### 7.1 New Stage Form (inline)

| Field | Type | Notes |
|---|---|---|
| Stage name | Text input | Required |
| Position | Auto-appended at end | Admin reorders via drag after creation |
| Set as default | Checkbox | Optional; only one stage can be default |

### States

| State | What the user sees |
|---|---|
| Empty | "No stages configured. Add the first one." |
| Delete with customers | Warning: "X customer(s) are on this stage. Move them first." Delete blocked until cleared. |

---

## 8. Settings — `/settings`

**Access:** All authenticated roles. Each user sees and edits only their own profile.

### Layout

```
┌─────────────────────────────────────────────────┐
│  Settings                                       │
├─────────────────────────────────────────────────┤
│  PROFILE                                        │
│  Display name: [__________]  [Save]             │
├─────────────────────────────────────────────────┤
│  CHANGE PASSWORD                                │
│  Current password: [__________]                 │
│  New password:     [__________]                 │
│  Confirm new:      [__________]  [Update]       │
└─────────────────────────────────────────────────┘
```

### Profile Section

| Element | Type | Behaviour |
|---|---|---|
| Display name | Text input | Pre-filled with current `profiles.name` |
| Save | Button | PATCHes `profiles.name`. Dashboard header updates immediately to show new name. |
| Success / error | Inline message | "Name updated." or specific error. |

### Change Password Section

| Element | Type | Behaviour |
|---|---|---|
| Current password | Password input | Verified via fresh Supabase sign-in before allowing update. Required. |
| New password | Password input | Required. |
| Confirm new password | Password input | Must match new password. Client-side check before submit. |
| Update | Button | Submits to Supabase Auth update-user. Existing session remains valid. |
| Error — wrong current password | Inline message | "Check your current password." Nothing changes. |
| Success | Inline message | "Password updated. Use it on your next login." |

### Role Differences

None — all roles see identical settings page, scoped to themselves.

### States

| State | What the user sees |
|---|---|
| Loading | Form pre-filled with current data (server-rendered, no loading state needed) |
| Saving name | Save button disabled/loading |
| Updating password | Update button disabled/loading |

---

## Cross-Page Patterns

These conventions apply across all pages:

| Pattern | Behaviour |
|---|---|
| **Auth guard** | Every `/(dashboard)/*` route checks session server-side before rendering. No flash of protected content. |
| **Role redirect** | `/admin/*` routes redirect non-ADMINs to `/customers` at the server-render layer — not just hidden in the UI. |
| **Optimistic updates** | Stage changes and task toggles reflect immediately in the UI; revert on error. |
| **Inline errors** | Form errors appear directly beneath the relevant field or at the top of the form, not in toasts or modals. |
| **Confirmation prompts** | Destructive actions (delete customer, deactivate user) require a confirmation before execution. |
| **No pagination spec** | Not defined in scope — implementation may add it when list size warrants. |
