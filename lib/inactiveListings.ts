import type { Activity, Customer, PoolStatus, Role, User } from "./types";

export interface SlotAge {
  customerId: string;
  slot: 1 | 2 | 3;
  userId: string;
  pool: PoolStatus;
  daysStale: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const ACTIVE_WARN_DAYS = 25;
export const ACTIVE_PULL_DAYS = 30;
export const POTENTIAL_WARN_DAYS = 50;
export const POTENTIAL_PULL_DAYS = 60;

function lastOwnActivityMs(customerId: string, userId: string, activities: Activity[]): number {
  return activities
    .filter((a) => a.customerId === customerId && a.authorUserId === userId)
    .reduce((max, a) => Math.max(max, new Date(a.createdAt).getTime()), 0);
}

// A slot's "last touched" timestamp. ACTIVE has no pool*Since (only set on
// the transition to INACTIVE -- see togglePool in store.tsx), so its
// anchor is last-log-only (falling back to when the customer was created);
// INACTIVE anchors on when it entered the pool. Whichever activity/anchor
// is more recent wins, same rule the original 60-day sweep used.
function slotLastTouchedMs(pool: PoolStatus, since: string | null, createdAt: string, lastActivityMs: number): number {
  const anchor = pool === "INACTIVE" && since ? new Date(since).getTime() : new Date(createdAt).getTime();
  return Math.max(anchor, lastActivityMs);
}

/** One entry per non-empty, pooled assignee slot across all three slots of every customer. */
export function computeSlotAges(customers: Customer[], activities: Activity[], now: number = Date.now()): SlotAge[] {
  const ages: SlotAge[] = [];
  for (const c of customers) {
    (
      [
        { slot: 1 as const, pool: c.pool1, since: c.pool1Since, userId: c.assignedToUserId },
        { slot: 2 as const, pool: c.pool2, since: c.pool2Since, userId: c.assignedToUserId2 },
        { slot: 3 as const, pool: c.pool3, since: c.pool3Since, userId: c.assignedToUserId3 },
      ] as const
    ).forEach(({ slot, pool, since, userId }) => {
      if (!pool || !userId) return;
      const lastActivityMs = lastOwnActivityMs(c.id, userId, activities);
      const lastTouchedMs = slotLastTouchedMs(pool, since, c.createdAt, lastActivityMs);
      ages.push({ customerId: c.id, slot, userId, pool, daysStale: (now - lastTouchedMs) / DAY_MS });
    });
  }
  return ages;
}

function pullDaysFor(pool: PoolStatus): number {
  return pool === "ACTIVE" ? ACTIVE_PULL_DAYS : POTENTIAL_PULL_DAYS;
}

function warnDaysFor(pool: PoolStatus): number {
  return pool === "ACTIVE" ? ACTIVE_WARN_DAYS : POTENTIAL_WARN_DAYS;
}

/** Past the auto-pull threshold -- sweepStalePool clears these. */
export function isStalePastPull(age: SlotAge): boolean {
  return age.daysStale >= pullDaysFor(age.pool);
}

/** In the warning window: past the warn threshold, not yet pulled. */
export function isWarnZone(age: SlotAge): boolean {
  return age.daysStale >= warnDaysFor(age.pool) && age.daysStale < pullDaysFor(age.pool);
}

/**
 * Same scoping visibleCustomers already applies in store.tsx: ADMIN sees
 * everything, MANAGER sees only their own team's assignees, everyone else
 * (SALESPERSON) sees only their own slots.
 */
export function scopeSlotAgesToViewer(
  ages: SlotAge[],
  users: Pick<User, "id" | "teamId">[],
  viewer: Pick<User, "id" | "role" | "teamId">
): SlotAge[] {
  if (viewer.role === "ADMIN") return ages;
  if (viewer.role === "MANAGER") {
    const teamUserIds = new Set(users.filter((u) => u.teamId === viewer.teamId).map((u) => u.id));
    return ages.filter((a) => teamUserIds.has(a.userId));
  }
  return ages.filter((a) => a.userId === viewer.id);
}
