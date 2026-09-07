# Mobile-friendly: global shell (Group 1 of 4)

## Context

"Mobile friendly" (the last of the four session/UI items requested
together) covers all 23 pages, entirely styled with inline `style={{}}`
objects and fixed pixel widths — no CSS framework, no existing breakpoints.
That's too large for one spec, so it's split into four sub-projects, each
its own spec → plan → implementation cycle:

1. **Global shell** (this spec) — `Header.tsx`, `MainNav.tsx`,
   `app/(dashboard)/layout.tsx`, `app/login/page.tsx`. Every page renders
   through this shell, so it's the highest-leverage fix and goes first.
2. List/table pages (~16 pages: customers, tasks, blasting, inactive
   listings, the various approvals/agent-log/admin pages) — share a
   filter-bar-plus-table structure, get one shared responsive pattern.
3. Form/detail pages (customer detail, settings) — many stacked fields,
   need to reflow to single-column on narrow screens.
4. Dashboard (charts) — different problem (chart sizing/legibility), on
   its own.

This spec is Group 1 only.

Already-responsive and needing no work in any group: `.modal-card` /
`.modal-overlay` / `.field-input` in
[app/globals.css](../../../app/globals.css) are already `width: 100%` with
a `max-width` cap and edge padding — every modal-based form in the app
inherits that for free.

## Scope

Make the header, nav tabs, dashboard shell, and login page usable on a
360–414px-wide phone viewport, with **zero visible change at desktop
widths** (every fix is either breakpoint-gated or small enough to be a
non-issue at desktop widths).

**Out of scope:** any page content below the nav (groups 2–4), any new
CSS framework or breakpoint system beyond what these four files need,
touch-gesture support beyond default browser scrolling.

## Design

**`components/MainNav.tsx`:** the tab row is a `display:flex` row with no
wrap and no scroll — on a phone, 5+ tabs (more for Admin/Manager) overflow
the viewport and get clipped today. Add `overflowX: "auto"` to the row and
`flexShrink: 0` to each tab `<Link>`, so it becomes a horizontally
scrollable strip instead of clipping — a no-op at desktop widths where
everything already fits, and the standard mobile pattern for tab bars.
Reduce the row's side padding from `28px` to `16px`.

**`components/Header.tsx`:** reduce side padding from `28px` to `16px`
(more room on a narrow screen, imperceptible on desktop). The profile
button's name+role text
(`{currentUser.name} ({currentUser.role})`) has no width limit today; a
long name at a squeezed mobile width could push the dropdown chevron off
the edge or wrap awkwardly. Add a `.header-username` class in
`app/globals.css`, unconstrained by default (matches current desktop
behavior exactly), truncated with an ellipsis only under
`@media (max-width: 480px)`:
```css
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

**`app/login/page.tsx`:** the form is a fixed `width: 380` — narrower than
that and it overflows the viewport (forces horizontal scroll/zoom on a
360px phone). Change to `width: "100%", maxWidth: 380` (already the
`.modal-card` pattern used elsewhere in the app) and add
`padding: "24px 16px"` to the outer centering wrapper so the form doesn't
touch the screen edges.

**`app/(dashboard)/layout.tsx`:** no changes — it has no fixed widths of
its own; it only composes `Header` + `MainNav` + page content.

## Testing

No automated test framework (repo convention — manual QA + `npx tsc --noEmit`).
Using the browser preview's device emulation (375×812, iPhone-class width):
- Nav tabs scroll horizontally without wrapping or clipping, for a role
  with many tabs (Admin).
- Header shows logo + profile button without the button's content wrapping
  or overflowing; a long test name truncates with `…` instead of breaking
  layout.
- Login form fits within the viewport width with visible padding on both
  sides, no horizontal scroll.
- At a desktop width (e.g. 1280px), re-check all three — pixel-identical
  to before this change except the (now unused) `overflowX`/`flexShrink`
  properties, which are inert when nothing overflows.
