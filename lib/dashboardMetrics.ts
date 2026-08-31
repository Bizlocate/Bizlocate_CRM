import type { Activity, Customer, DealClosure, SalesTarget, Stage, Task, User } from "./types";

export function yearMonthOf(iso: string): string {
  return iso.slice(0, 7);
}

export interface FunnelRow {
  stageId: string;
  stageName: string;
  count: number;
}

// Counts across all 3 assignee slots — a customer with two slots in the
// same stage counts twice, matching how the pipeline actually works (each
// slot is its own independent deal).
export function stageFunnel(customers: Customer[], stages: Stage[]): FunnelRow[] {
  const sorted = [...stages].sort((a, b) => a.order - b.order);
  return sorted.map((s) => {
    const count = customers.filter((c) => c.stage1Id === s.id || c.stage2Id === s.id || c.stage3Id === s.id).length;
    return { stageId: s.id, stageName: s.name, count };
  });
}

// "Lost" isn't a schema flag — it's a naming convention the rest of the
// app already relies on (see STAGE_STYLES in lib/types.ts).
export function lostCount(customers: Customer[], stages: Stage[]): number {
  const lostStageIds = new Set(stages.filter((s) => s.name.trim().toLowerCase() === "lost").map((s) => s.id));
  if (lostStageIds.size === 0) return 0;
  return customers.filter(
    (c) =>
      (c.stage1Id !== null && lostStageIds.has(c.stage1Id)) ||
      (c.stage2Id !== null && lostStageIds.has(c.stage2Id)) ||
      (c.stage3Id !== null && lostStageIds.has(c.stage3Id))
  ).length;
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
  newLeads: number;
}

// Oldest to newest, always `monthsBack` entries ending at `now`'s month.
export function monthlyTrend(customers: Customer[], dealClosures: DealClosure[], monthsBack: number, now: Date): MonthPoint[] {
  const points: MonthPoint[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const won = wonAmountInMonth(dealClosures, yearMonth);
    const newLeads = customers.filter((c) => yearMonthOf(c.createdAt) === yearMonth).length;
    points.push({ yearMonth, won, newLeads });
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

// Rough approximation, not true cohort conversion: (# distinct customers
// with a won deal-closure this month) / (# customers created this month).
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
