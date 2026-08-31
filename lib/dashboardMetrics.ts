import type { Activity, Customer, DealClosure, SalesTarget, Stage, Task, User } from "./types";

export function yearMonthOf(iso: string): string {
  return iso.slice(0, 7);
}

export interface FunnelRow {
  stageId: string;
  stageName: string;
  count: number;
}

// Slots (stage + assignee) for a customer, optionally filtered to only those
// whose assignee is in scope. Pass no scopedIds for unscoped (e.g. ADMIN).
function slotsInScope(c: Customer, scopedIds?: Set<string>): { stageId: string | null; userId: string | null }[] {
  const slots = [
    { stageId: c.stage1Id, userId: c.assignedToUserId },
    { stageId: c.stage2Id, userId: c.assignedToUserId2 },
    { stageId: c.stage3Id, userId: c.assignedToUserId3 },
  ];
  if (!scopedIds) return slots;
  return slots.filter((s) => s.userId !== null && scopedIds.has(s.userId));
}

// Counts each in-scope slot independently — a customer with two slots in the
// same stage (or two different people's slots) counts twice, once per slot.
export function stageFunnel(customers: Customer[], stages: Stage[], scopedIds?: Set<string>): FunnelRow[] {
  const sorted = [...stages].sort((a, b) => a.order - b.order);
  return sorted.map((s) => {
    const count = customers.reduce((sum, c) => sum + slotsInScope(c, scopedIds).filter((slot) => slot.stageId === s.id).length, 0);
    return { stageId: s.id, stageName: s.name, count };
  });
}

// "Lost" isn't a schema flag — it's a naming convention the rest of the
// app already relies on (see STAGE_STYLES in lib/types.ts).
export function lostCount(customers: Customer[], stages: Stage[], scopedIds?: Set<string>): number {
  const lostStageIds = new Set(stages.filter((s) => s.name.trim().toLowerCase() === "lost").map((s) => s.id));
  if (lostStageIds.size === 0) return 0;
  return customers.reduce(
    (sum, c) => sum + slotsInScope(c, scopedIds).filter((slot) => slot.stageId !== null && lostStageIds.has(slot.stageId)).length,
    0
  );
}

export function wonAmountInMonth(dealClosures: DealClosure[], yearMonth: string): number {
  return dealClosures.filter((d) => yearMonthOf(d.createdAt) === yearMonth).reduce((sum, d) => sum + d.amount, 0);
}

export interface LeaderboardRow {
  userId: string;
  name: string;
  won: number;
  target: number | null;
  attainmentPct: number | null;
  activityCount: number;
}

export function leaderboard(
  users: User[],
  dealClosures: DealClosure[],
  salesTargets: SalesTarget[],
  activities: Activity[],
  yearMonth: string
): LeaderboardRow[] {
  const rows = users.map((u) => {
    const won = dealClosures
      .filter((d) => d.userId === u.id && yearMonthOf(d.createdAt) === yearMonth)
      .reduce((sum, d) => sum + d.amount, 0);
    const target = salesTargets.find((t) => t.userId === u.id && t.yearMonth === yearMonth)?.amount ?? null;
    const attainmentPct = target !== null && target > 0 ? Math.round((won / target) * 100) : null;
    const activityCount = activities.filter((a) => a.authorUserId === u.id && yearMonthOf(a.createdAt) === yearMonth).length;
    return { userId: u.id, name: u.name, won, target, attainmentPct, activityCount };
  });
  return rows.sort((a, b) => b.won - a.won);
}

export interface MonthPoint {
  yearMonth: string;
  won: number;
  // Deal count, not amount — `won` (money) and `newLeads` (count) are
  // different units and can't share a chart scale, so the leads-vs-won
  // chart plots this against newLeads instead.
  wonCount: number;
  newLeads: number;
}

// Oldest to newest, always `monthsBack` entries ending at `now`'s month.
export function monthlyTrend(customers: Customer[], dealClosures: DealClosure[], monthsBack: number, now: Date): MonthPoint[] {
  const points: MonthPoint[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthClosures = dealClosures.filter((c) => yearMonthOf(c.createdAt) === yearMonth);
    const won = monthClosures.reduce((sum, c) => sum + c.amount, 0);
    const newLeads = customers.filter((c) => yearMonthOf(c.createdAt) === yearMonth).length;
    points.push({ yearMonth, won, wonCount: monthClosures.length, newLeads });
  }
  return points;
}

export function openTaskCount(tasks: Task[], customerIds: Set<string>): number {
  return tasks.filter((t) => !t.done && customerIds.has(t.customerId)).length;
}

// % of the given month elapsed as of `now`. A month that isn't the current
// one reads as 100% ("fully elapsed") — there's no partial pace to show for
// a past or future month.
export function pacePct(now: Date, yearMonth: string): number {
  const [y, m] = yearMonth.split("-").map(Number);
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (yearMonth !== currentYearMonth) return 100;
  const daysInMonth = new Date(y, m, 0).getDate();
  return Math.round((now.getDate() / daysInMonth) * 100);
}

// Cohort conversion rate: (# of leads created this month who also won this month) /
// (# leads created this month). Measures what % of new leads in a month converted to deals.
export function conversionRatePct(dealClosures: DealClosure[], customers: Customer[], yearMonth: string): number | null {
  const newLeadIds = new Set(customers.filter((c) => yearMonthOf(c.createdAt) === yearMonth).map((c) => c.id));
  if (newLeadIds.size === 0) return null;
  const wonCustomerIds = new Set(dealClosures.filter((d) => yearMonthOf(d.createdAt) === yearMonth && newLeadIds.has(d.customerId)).map((d) => d.customerId));
  return Math.round((wonCustomerIds.size / newLeadIds.size) * 100);
}

export function scopedUserIds(users: User[], currentUser: User): Set<string> {
  if (currentUser.role === "ADMIN") return new Set(users.map((u) => u.id));
  if (currentUser.role === "MANAGER") return new Set(users.filter((u) => u.teamId === currentUser.teamId).map((u) => u.id));
  return new Set([currentUser.id]);
}
