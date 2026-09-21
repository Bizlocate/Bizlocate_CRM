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
 * Whether a customer due at `dueAt` should actually be auto-assigned right
 * now. A due date that falls before the area's auto-assign was last turned
 * on means it became due while the area was off — that window is
 * permanently missed (needs a manual assign instead of ever being caught
 * up automatically), not just "not yet".
 */
export function isSecondAssignDue(dueAt: number, areaResumedAt: string, now: number): boolean {
  const resumedAtMs = new Date(areaResumedAt).getTime();
  if (dueAt < resumedAtMs) return false;
  return dueAt <= now;
}
