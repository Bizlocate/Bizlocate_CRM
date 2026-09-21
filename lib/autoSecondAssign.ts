import type { Activity, Customer, Stage } from "./types";

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * When a customer's slot-2 auto-assignment becomes due: 7 days after slot-1
 * was created, or — if slot-1's stage is flagged excludeFromAutoAssign
 * (e.g. Appointment/Nego) — 14 days after the last activity logged by the
 * slot-1 assignee (falling back to pool1Since/createdAt if there's none).
 * Same "last touched" formula sweepStalePool already uses.
 */
export function secondAssignDueAt(
  customer: Pick<Customer, "id" | "createdAt" | "pool1Since" | "assignedToUserId">,
  activities: Pick<Activity, "customerId" | "authorUserId" | "createdAt">[],
  slot1Stage: Pick<Stage, "excludeFromAutoAssign"> | undefined
): number {
  if (slot1Stage?.excludeFromAutoAssign) {
    const lastOwnActivity = activities
      .filter((a) => a.customerId === customer.id && a.authorUserId === customer.assignedToUserId)
      .reduce((max, a) => Math.max(max, new Date(a.createdAt).getTime()), 0);
    const lastTouched = Math.max(new Date(customer.pool1Since ?? customer.createdAt).getTime(), lastOwnActivity);
    return lastTouched + FOURTEEN_DAYS_MS;
  }
  return new Date(customer.createdAt).getTime() + SEVEN_DAYS_MS;
}

/**
 * Whether a customer is due for slot-2 auto-assignment right now, honoring
 * the area's last reopen line as a PERMANENT cutoff.
 *
 * The "missed the window" decision is made against a snapshot due date —
 * `dueAtAsOfResume`, computed using only activities that happened at or
 * before the area's resume moment — not the live due date. This matters
 * for the 14-day-idle path (Appointment/Nego stages): its due date moves
 * forward whenever the slot-1 assignee logs a new activity, so without the
 * snapshot, a customer that had already missed its window could become
 * "eligible again" simply because someone touched it after the area
 * reopened. That must never happen — once a customer misses its window, it
 * stays permanently skipped (manual-assign only), exactly like the plain
 * 7-day path (whose due date never moves post-creation, so this snapshot is
 * always a no-op for it: dueAtAsOfResume === dueAt).
 *
 * A customer that was NOT yet overdue at the moment the area reopened
 * (either still within its window through the toggle, or one that only
 * became due after reopening) is evaluated normally against its live due
 * date on every subsequent sweep.
 */
export function isSecondAssignDue(
  customer: Pick<Customer, "id" | "createdAt" | "pool1Since" | "assignedToUserId">,
  activities: Pick<Activity, "customerId" | "authorUserId" | "createdAt">[],
  slot1Stage: Pick<Stage, "excludeFromAutoAssign"> | undefined,
  areaResumedAt: string,
  now: number
): boolean {
  const resumedAtMs = new Date(areaResumedAt).getTime();
  const activitiesAsOfResume = activities.filter((a) => new Date(a.createdAt).getTime() <= resumedAtMs);
  const dueAtAsOfResume = secondAssignDueAt(customer, activitiesAsOfResume, slot1Stage);
  const dueAt = secondAssignDueAt(customer, activities, slot1Stage);
  // resumedAtMs is NaN when the area column doesn't exist yet (pre-migration) —
  // NaN comparisons are always false, so this correctly falls through to "not
  // missed" (evaluated below via the live due date) rather than skipping
  // everything.
  if (dueAtAsOfResume < resumedAtMs) return false;
  return dueAt <= now;
}
