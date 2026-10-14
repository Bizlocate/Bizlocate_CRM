import type { Activity, Area, Customer, Stage, User } from "./types";

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * When a customer's slot-2 auto-assignment becomes due: 7 days after slot-1
 * was created, or — if slot-1's stage is flagged excludeFromAutoAssign
 * (e.g. Appointment/Nego) — 14 days after the last activity logged by the
 * slot-1 assignee (falling back to slot 1's pool-since/createdAt if there's none).
 * Same "last touched" formula sweepStalePool already uses.
 */
export function secondAssignDueAt(
  customer: Pick<Customer, "id" | "createdAt" | "assignments">,
  activities: Pick<Activity, "customerId" | "authorUserId" | "createdAt">[],
  slot1Stage: Pick<Stage, "excludeFromAutoAssign"> | undefined
): number {
  if (slot1Stage?.excludeFromAutoAssign) {
    const slot1 = customer.assignments.find((s) => s.slot === 1);
    const lastOwnActivity = activities
      .filter((a) => a.customerId === customer.id && a.authorUserId === slot1?.userId)
      .reduce((max, a) => Math.max(max, new Date(a.createdAt).getTime()), 0);
    const lastTouched = Math.max(new Date(slot1?.poolSince ?? customer.createdAt).getTime(), lastOwnActivity);
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
  customer: Pick<Customer, "id" | "createdAt" | "assignments">,
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

export interface SecondAssignAction {
  customerId: string;
  areaId: string;
  teamId: string;
  winnerId: string;
  stageId: string | null;
}

/**
 * The full second-seat auto-assign decision for one sweep pass: which
 * customers are due, who wins each one via round-robin, honoring each
 * candidate's activePoolLimit. Pure -- returns the plan as data, does not
 * write anything.
 *
 * The second person always comes from the team that CREATED the customer
 * (`createdByTeamId`): that team's seat 1 decides when it is due, only that
 * team's active auto-assign salespeople can win, and the round-robin pointer
 * is per team (`teams[].lastAutoAssignedUserId`). Nobody who already holds
 * any seat on the customer can win (a person holds one seat per customer).
 * pointerByTeam/extraAssignedCount track this call's own in-progress picks so
 * the second customer processed for a team sees the first one's winner,
 * instead of both reading the same stale pointer and colliding.
 */
export function computeAutoSecondAssignPlan(
  customers: Customer[],
  areas: Area[],
  users: User[],
  stages: Stage[],
  activities: Activity[],
  now: number,
  teams: { id: string; lastAutoAssignedUserId: string | null }[] = []
): SecondAssignAction[] {
  const defaultStage = stages.find((s) => s.isDefault) ?? stages[0];
  const actions: SecondAssignAction[] = [];
  const pointerByTeam = new Map<string, string | null>();
  const extraAssignedCount = new Map<string, number>();
  for (const c of customers) {
    if (!c.areaId || !c.createdBy || !c.createdByTeamId) continue; // legacy/imported or admin-created: never eligible
    const teamId = c.createdByTeamId;
    const area = areas.find((a) => a.id === c.areaId);
    if (!area || !area.autoAssignEnabled) continue;
    const teamSeats = c.assignments.filter((s) => s.teamId === teamId);
    const slot1 = teamSeats.find((s) => s.slot === 1);
    if (!slot1 || teamSeats.some((s) => s.slot === 2)) continue;
    const slot1Stage = slot1.stageId ? stages.find((s) => s.id === slot1.stageId) : undefined;
    if (!isSecondAssignDue({ id: c.id, createdAt: c.createdAt, assignments: teamSeats }, activities, slot1Stage, area.autoAssignResumedAt, now)) continue;
    const excluded = c.assignments.map((s) => s.userId);
    const candidates = users
      .filter((u) => u.active && u.autoAssignEnabled && u.role === "SALESPERSON" && u.teamId === teamId && !excluded.includes(u.id))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    if (candidates.length === 0) continue;
    const currentPointer = pointerByTeam.has(teamId) ? pointerByTeam.get(teamId)! : teams.find((t) => t.id === teamId)?.lastAutoAssignedUserId ?? null;
    const lastIndex = candidates.findIndex((u) => u.id === currentPointer);
    const startIndex = lastIndex === -1 ? 0 : (lastIndex + 1) % candidates.length;
    let winner: User | undefined;
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[(startIndex + i) % candidates.length];
      const limit = candidate.activePoolLimit;
      if (limit !== null && limit !== undefined) {
        const activeCount = customers.filter((other) =>
          other.assignments.some((s) => s.userId === candidate.id && s.pool === "ACTIVE")
        ).length + (extraAssignedCount.get(candidate.id) ?? 0);
        if (activeCount >= limit) continue;
      }
      winner = candidate;
      break;
    }
    if (!winner) continue;
    const winnerId = winner.id;
    pointerByTeam.set(teamId, winnerId);
    extraAssignedCount.set(winnerId, (extraAssignedCount.get(winnerId) ?? 0) + 1);
    actions.push({ customerId: c.id, areaId: area.id, teamId, winnerId, stageId: defaultStage?.id ?? null });
  }
  return actions;
}
