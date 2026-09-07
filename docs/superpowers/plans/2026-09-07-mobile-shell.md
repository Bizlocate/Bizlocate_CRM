# Mobile-friendly: global shell (Group 1 of 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Header, nav tabs, dashboard shell, and login page are usable on a 360–414px phone viewport, with no visible change at desktop widths.

**Architecture:** Small, targeted inline-style tweaks in three components plus one small breakpoint-gated CSS class — no new dependency, no CSS framework.

**Tech Stack:** No changes.

## Global Constraints

- No automated test framework — verification is `npx tsc --noEmit` plus a manual check using the browser preview's device-emulation (375×812) and a desktop-width regression check.
- Every change must be a no-op (or imperceptible) at desktop widths — this is Group 1 of 4; groups 2–4 (page content, forms, dashboard) are separate follow-up specs, not part of this plan.

---

## Task 1: Scrollable nav tabs

**Files:**
- Modify: `components/MainNav.tsx`

- [ ] **Step 1: Make the tab row horizontally scrollable and stop tabs from shrinking**

Find:

```tsx
  return (
    <div style={{ display: "flex", gap: 8, padding: "12px 28px 0", background: "#ffffff", borderBottom: "1px solid #e2e4e9" }}>
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 16px",
            fontSize: 13.5,
            fontWeight: 600,
            color: tab.active ? "#4046c9" : "#6b7280",
            textDecoration: "none",
            borderBottom: tab.active ? "2px solid #4046c9" : "2px solid transparent",
          }}
        >
```

Replace with:

```tsx
  return (
    <div style={{ display: "flex", gap: 8, padding: "12px 16px 0", background: "#ffffff", borderBottom: "1px solid #e2e4e9", overflowX: "auto" }}>
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 16px",
            fontSize: 13.5,
            fontWeight: 600,
            color: tab.active ? "#4046c9" : "#6b7280",
            textDecoration: "none",
            borderBottom: tab.active ? "2px solid #4046c9" : "2px solid transparent",
            flexShrink: 0,
          }}
        >
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/MainNav.tsx
git commit -m "$(cat <<'EOF'
Make nav tabs horizontally scrollable on narrow screens

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Header padding and username truncation

**Files:**
- Modify: `components/Header.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Reduce header side padding**

Find:

```tsx
        height: 64,
        padding: "0 28px",
```

Replace with:

```tsx
        height: 64,
        padding: "0 16px",
```

- [ ] **Step 2: Give the name+role text a class for the mobile truncation rule**

Find:

```tsx
            <span style={{ fontSize: 13.5, color: "#20222b", fontWeight: 500 }}>
              {currentUser.name} ({currentUser.role})
            </span>
```

Replace with:

```tsx
            <span className="header-username" style={{ fontSize: 13.5, color: "#20222b", fontWeight: 500 }}>
              {currentUser.name} ({currentUser.role})
            </span>
```

- [ ] **Step 3: Add the breakpoint-gated truncation rule**

In `app/globals.css`, find:

```css
.error-text {
  color: #c0392b;
  font-size: 12.5px;
}
```

Replace with:

```css
.error-text {
  color: #c0392b;
  font-size: 12.5px;
}

.header-username {
  overflow: hidden;
}

@media (max-width: 480px) {
  .header-username {
    max-width: 120px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/Header.tsx app/globals.css
git commit -m "$(cat <<'EOF'
Reduce header padding, truncate long usernames on narrow screens

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Login form fits narrow viewports

**Files:**
- Modify: `app/login/page.tsx`

- [ ] **Step 1: Let the form shrink below its 380px cap and pad the outer wrapper**

Find:

```tsx
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{ width: 380, display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}
      >
```

Replace with:

```tsx
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{ width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}
      >
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification (all three tasks together)**

Using the browser preview's `resize_window` to a 375×812 (mobile) viewport:
1. Nav tabs (log in as Admin, who has the most tabs) scroll horizontally with a swipe/drag instead of wrapping or clipping.
2. Header shows the logo and profile button without wrapping; temporarily rename the test user to something long (e.g. "Muhammad Firdaus Bin Abdullah Al-Hakim") and confirm it truncates with `…` at this width, then revert the name.
3. Login form (log out first) fits the viewport width with visible side padding, no horizontal scroll.

Then resize back to a desktop width (1280×800) and re-check all three look exactly as they did before this plan (name shows in full since 1280px is well above the 480px breakpoint, tabs don't scroll since they all fit, login form is capped at 380px centered).

- [ ] **Step 4: Commit**

```bash
git add app/login/page.tsx
git commit -m "$(cat <<'EOF'
Let the login form fit narrow viewports

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
