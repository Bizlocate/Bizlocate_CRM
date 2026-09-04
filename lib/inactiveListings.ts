import type { Activity, AssignmentEvent, Customer, PoolStatus, RemovalRequest, User } from "./types";

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

/** Latest ms per key, one pass. Keeps computeSlotAges O(n) instead of re-scanning per slot. */
function latestByKey<T>(rows: T[], key: (row: T) => string, at: (row: T) => string): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const k = key(row);
    const ms = new Date(at(row)).getTime();
    if (ms > (map.get(k) ?? 0)) map.set(k, ms);
  }
  return map;
}

/**
 * One entry per non-empty, pooled assignee slot across all three slots of every customer.
 *
 * A slot's "last touched" timestamp: ACTIVE has no pool*Since (only set on
 * the transition to INACTIVE -- see togglePool in store.tsx), so it anchors
 * on when this assignee got the slot (the most recent matching
 * AssignmentEvent), falling back to customer.createdAt when there is none --
 * a slot assigned at creation time by addCustomer, or legacy rows predating
 * assignment_events. Anchoring on createdAt alone would report a freshly
 * reassigned 90-day-old customer as 90 days stale and pull it immediately.
 * INACTIVE anchors on when it entered the pool. Whichever activity/anchor is
 * more recent wins, same rule the original 60-day sweep used.
 */
export function computeSlotAges(
  customers: Customer[],
  activities: Activity[],
  assignmentEvents: AssignmentEvent[],
  now: number = Date.now()
): SlotAge[] {
  const lastActivity = latestByKey(activities, (a) => `${a.customerId}|${a.authorUserId}`, (a) => a.createdAt);
  const lastAssignment = latestByKey(assignmentEvents, (e) => `${e.customerId}|${e.slot}|${e.userId}`, (e) => e.createdAt);

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
      const anchor =
        pool === "INACTIVE"
          ? new Date(since ?? c.createdAt).getTime()
          : lastAssignment.get(`${c.id}|${slot}|${userId}`) ?? new Date(c.createdAt).getTime();
      const lastTouchedMs = Math.max(anchor, lastActivity.get(`${c.id}|${userId}`) ?? 0);
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

/**
 * Past the warn threshold. Deliberately unbounded above: a viewer who can't
 * pull the slot themselves (the sweep only clears the session user's own
 * slots, or everything for an admin) must keep seeing it until it's actually
 * pulled -- at which point pool/userId go null and computeSlotAges drops it.
 * So isWarnZone and isStalePastPull can both be true at once; they answer
 * different questions (show it vs. pull it).
 */
export function isWarnZone(age: SlotAge): boolean {
  return age.daysStale >= warnDaysFor(age.pool);
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

/**
 * The warn-tab list: everything the nav badge counts and the browser lists.
 * Single source of truth so the two can't drift apart. Slots with a PENDING
 * removal request are dropped for every viewer -- removal is already in
 * flight, nagging about it (or counting it in the badge) is pointless, same
 * reasoning as the customers page hiding them from the requester's list.
 *
 * Not used by sweepStalePool, which composes isStalePastPull itself and
 * intentionally ignores removal-request status.
 */
export function warnZoneSlotsFor(
  customers: Customer[],
  activities: Activity[],
  assignmentEvents: AssignmentEvent[],
  users: Pick<User, "id" | "teamId">[],
  viewer: Pick<User, "id" | "role" | "teamId">,
  removalRequests: Pick<RemovalRequest, "customerId" | "slot" | "status">[],
  now: number = Date.now()
): SlotAge[] {
  const pending = new Set(
    removalRequests.filter((r) => r.status === "PENDING").map((r) => `${r.customerId}|${r.slot}`)
  );
  const ages = computeSlotAges(customers, activities, assignmentEvents, now).filter(isWarnZone);
  return scopeSlotAgesToViewer(ages, users, viewer).filter((a) => !pending.has(`${a.customerId}|${a.slot}`));
}
