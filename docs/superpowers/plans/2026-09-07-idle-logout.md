# 30-minute idle logout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tab with no mouse/keyboard/touch/scroll activity for 30 minutes logs the user out automatically.

**Architecture:** One `useEffect` in the existing dashboard layout, using the store's already-existing `logout()`.

**Tech Stack:** No new dependency — native DOM events + `setTimeout`.

## Global Constraints

- No automated test framework — verification is `npx tsc --noEmit` plus a manual check with a temporarily shortened timeout (see Task 1).

---

## Task 1: Idle timer in the dashboard layout

**Files:**
- Modify: `app/(dashboard)/layout.tsx`

- [ ] **Step 1: Add the idle timer**

Find:

```tsx
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { currentUser, initialized } = useStore();

  useEffect(() => {
    if (initialized && !currentUser) router.replace("/login");
  }, [initialized, currentUser, router]);

  if (!initialized || !currentUser) return null;
```

Replace with:

```tsx
const IDLE_LOGOUT_MS = 30 * 60 * 1000;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { currentUser, initialized, logout } = useStore();

  useEffect(() => {
    if (initialized && !currentUser) router.replace("/login");
  }, [initialized, currentUser, router]);

  // Auto-logout after 30 minutes with no activity in this tab. logout()
  // clears currentUser, which the redirect effect above then sends to
  // /login -- no router call needed here.
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

  if (!initialized || !currentUser) return null;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification with a shortened timeout**

Temporarily change `const IDLE_LOGOUT_MS = 30 * 60 * 1000;` to `const IDLE_LOGOUT_MS = 5000;`, then `npm run dev`:
1. Log in, stop touching mouse/keyboard — confirm redirect to `/login` within ~5 seconds.
2. Log in again, move the mouse every ~3 seconds for 15+ seconds — confirm no logout happens.
3. Confirm the existing manual "Log out" button in the header still works.

Then change `IDLE_LOGOUT_MS` back to `30 * 60 * 1000` before committing.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/layout.tsx"
git commit -m "$(cat <<'EOF'
Add 30-minute idle auto-logout

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
