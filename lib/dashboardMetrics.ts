import type { Activity, AssignmentEvent, Customer, DealClosure, LeadSource, RemovalReason, RemovalRequest, SalesTarget, Stage, StageEvent, Task, User } from "./types";

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

export interface NamedCount {
  id: string | null;
  name: string;
  count: number;
}

// Customers created in yearMonth, grouped by lead source. `customers` is
// caller-scoped (area/team already filtered in) — no source recorded lands
// in a "No source" bucket rather than being dropped.
export function leadsBySource(customers: Customer[], leadSources: LeadSource[], yearMonth: string): NamedCount[] {
  const counts = new Map<string | null, number>();
  for (const c of customers) {
    if (yearMonthOf(c.createdAt) !== yearMonth) continue;
    counts.set(c.sourceId, (counts.get(c.sourceId) ?? 0) + 1);
  }
  const rows: NamedCount[] = [...counts.entries()].map(([id, count]) => ({
    id,
    name: id ? leadSources.find((s) => s.id === id)?.name ?? "Unknown source" : "No source",
    count,
  }));
  return rows.sort((a, b) => b.count - a.count);
}

export interface SourceYearRow {
  id: string | null;
  name: string;
  monthlyCounts: number[]; // 12 entries, index 0 = January
  total: number;
}

// Same grouping rule as leadsBySource (no sourceId -> "No source" bucket),
// bucketed by month-of-year across the whole `year` instead of one
// yearMonth -- the source-by-month comparison table on the dashboard reads
// this to let an admin/manager flip the year and see the year's shape, or
// compare against a prior year by changing it. Only sources with at least
// one lead somewhere in the year are included.
export function leadsBySourceByYear(customers: Customer[], leadSources: LeadSource[], year: number): SourceYearRow[] {
  const counts = new Map<string | null, number[]>();
  const yearPrefix = String(year);
  for (const c of customers) {
    if (c.createdAt.slice(0, 4) !== yearPrefix) continue;
    const monthIndex = Number(c.createdAt.slice(5, 7)) - 1;
    const row = counts.get(c.sourceId) ?? new Array(12).fill(0);
    row[monthIndex] += 1;
    counts.set(c.sourceId, row);
  }
  const rows: SourceYearRow[] = [...counts.entries()].map(([id, monthlyCounts]) => ({
    id,
    name: id ? leadSources.find((s) => s.id === id)?.name ?? "Unknown source" : "No source",
    monthlyCounts,
    total: monthlyCounts.reduce((sum, n) => sum + n, 0),
  }));
  return rows.sort((a, b) => b.total - a.total);
}

export interface CountRow {
  userId: string;
  name: string;
  count: number;
}

// One row per assignment event this month, not deduped per customer — a
// customer reassigned to the same person twice in one month counts twice.
export function assignmentCounts(users: User[], assignmentEvents: AssignmentEvent[], yearMonth: string): CountRow[] {
  return users
    .map((u) => ({
      userId: u.id,
      name: u.name,
      count: assignmentEvents.filter((e) => e.userId === u.id && yearMonthOf(e.createdAt) === yearMonth).length,
    }))
    .sort((a, b) => b.count - a.count);
}

// Approved removal requests this month, by who was removed (requestedBy —
// whoever occupied the slot requests their own removal). Counted by
// resolution month, not request month, since that's when it actually took
// effect. Only the self-request+approval flow has a structured reason, so
// this deliberately excludes a direct admin/manager slot-clear (no reason
// recorded for those).
export function removalCounts(users: User[], removalRequests: RemovalRequest[], yearMonth: string): CountRow[] {
  return users
    .map((u) => ({
      userId: u.id,
      name: u.name,
      count: removalRequests.filter(
        (r) => r.requestedBy === u.id && r.status === "APPROVED" && r.resolvedAt !== null && yearMonthOf(r.resolvedAt) === yearMonth
      ).length,
    }))
    .sort((a, b) => b.count - a.count);
}

// `removalRequests` is caller-scoped (pre-filtered to the relevant users,
// same convention as wonAmountInMonth/monthlyTrend's dealClosures param).
export function removalReasonBreakdown(removalRequests: RemovalRequest[], removalReasons: RemovalReason[], yearMonth: string): NamedCount[] {
  const counts = new Map<string, number>();
  for (const r of removalRequests) {
    if (r.status !== "APPROVED" || r.resolvedAt === null || yearMonthOf(r.resolvedAt) !== yearMonth) continue;
    counts.set(r.reasonId, (counts.get(r.reasonId) ?? 0) + 1);
  }
  const rows: NamedCount[] = [...counts.entries()].map(([id, count]) => ({
    id,
    name: removalReasons.find((rr) => rr.id === id)?.name ?? "Unknown reason",
    count,
  }));
  return rows.sort((a, b) => b.count - a.count);
}

// Which lead source's customers get removed most — same APPROVED-this-month
// scope as removalReasonBreakdown, grouped by the removed customer's source
// instead of by reason.
export function removalSourceBreakdown(
  removalRequests: RemovalRequest[],
  customers: Customer[],
  leadSources: LeadSource[],
  yearMonth: string
): NamedCount[] {
  const customersById = new Map(customers.map((c) => [c.id, c]));
  const counts = new Map<string | null, number>();
  for (const r of removalRequests) {
    if (r.status !== "APPROVED" || r.resolvedAt === null || yearMonthOf(r.resolvedAt) !== yearMonth) continue;
    const sourceId = customersById.get(r.customerId)?.sourceId ?? null;
    counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1);
  }
  const rows: NamedCount[] = [...counts.entries()].map(([id, count]) => ({
    id,
    name: id ? leadSources.find((s) => s.id === id)?.name ?? "Unknown source" : "No source",
    count,
  }));
  return rows.sort((a, b) => b.count - a.count);
}

// Which intake cohort (the removed customer's created month — a stand-in
// for "which ad run brought these in") ends up getting removed most. `id`
// and `name` are both the yearMonth string; the caller formats it for
// display (see monthLabel in the dashboard page).
export function removalCohortBreakdown(removalRequests: RemovalRequest[], customers: Customer[], yearMonth: string): NamedCount[] {
  const customersById = new Map(customers.map((c) => [c.id, c]));
  const counts = new Map<string, number>();
  for (const r of removalRequests) {
    if (r.status !== "APPROVED" || r.resolvedAt === null || yearMonthOf(r.resolvedAt) !== yearMonth) continue;
    const customer = customersById.get(r.customerId);
    if (!customer) continue;
    const cohort = yearMonthOf(customer.createdAt);
    counts.set(cohort, (counts.get(cohort) ?? 0) + 1);
  }
  const rows: NamedCount[] = [...counts.entries()].map(([id, count]) => ({ id, name: id, count }));
  return rows.sort((a, b) => (a.id! < b.id! ? -1 : 1));
}

function avgDays(durationsMs: number[]): number | null {
  if (durationsMs.length === 0) return null;
  const avgMs = durationsMs.reduce((sum, ms) => sum + ms, 0) / durationsMs.length;
  return Math.round((avgMs / 86_400_000) * 10) / 10;
}

// Latest assignment of `customerId`'s `slot` at or before `beforeIso` — the
// hand-off that produced whatever we're measuring duration from.
function latestAssignmentBefore(assignmentEvents: AssignmentEvent[], customerId: string, slot: 1 | 2 | 3, beforeIso: string): AssignmentEvent | null {
  const candidates = assignmentEvents.filter((e) => e.customerId === customerId && e.slot === slot && e.createdAt <= beforeIso);
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, e) => (e.createdAt > latest.createdAt ? e : latest));
}

export interface DurationRow {
  userId: string;
  name: string;
  count: number;
  avgDays: number | null;
}

// Assign -> Appointment duration for every slot currently sitting in the
// "Appointment" stage (matched by name, same convention as lostCount),
// averaged per assignee. Needs both an assignment_events row (who/when) and
// a stage_events row for that slot's move into Appointment — data only
// exists from whenever the stage_events migration was run, so older
// Appointment customers with no logged transition are silently excluded
// rather than guessed at.
export function assignToAppointmentDuration(
  users: User[],
  customers: Customer[],
  assignmentEvents: AssignmentEvent[],
  stageEvents: StageEvent[],
  stages: Stage[]
): DurationRow[] {
  const appointmentStageIds = new Set(stages.filter((s) => s.name.trim().toLowerCase() === "appointment").map((s) => s.id));
  if (appointmentStageIds.size === 0) return [];
  const durationsByUser = new Map<string, number[]>();
  for (const c of customers) {
    const slots: { stageId: string | null; userId: string | null; slot: 1 | 2 | 3 }[] = [
      { stageId: c.stage1Id, userId: c.assignedToUserId, slot: 1 },
      { stageId: c.stage2Id, userId: c.assignedToUserId2, slot: 2 },
      { stageId: c.stage3Id, userId: c.assignedToUserId3, slot: 3 },
    ];
    for (const s of slots) {
      if (!s.userId || !s.stageId || !appointmentStageIds.has(s.stageId)) continue;
      const enteredEvents = stageEvents
        .filter((e) => e.customerId === c.id && e.slot === s.slot && appointmentStageIds.has(e.stageId))
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      const enteredAppointment = enteredEvents[0];
      if (!enteredAppointment) continue;
      const assignedAt = latestAssignmentBefore(assignmentEvents, c.id, s.slot, enteredAppointment.createdAt);
      if (!assignedAt) continue;
      const ms = new Date(enteredAppointment.createdAt).getTime() - new Date(assignedAt.createdAt).getTime();
      if (ms < 0) continue;
      const list = durationsByUser.get(s.userId) ?? [];
      list.push(ms);
      durationsByUser.set(s.userId, list);
    }
  }
  return users
    .map((u) => {
      const durations = durationsByUser.get(u.id) ?? [];
      return { userId: u.id, name: u.name, count: durations.length, avgDays: avgDays(durations) };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => (a.avgDays ?? 0) - (b.avgDays ?? 0));
}

export interface MonthCount {
  yearMonth: string;
  count: number;
}

// How many slots newly entered the "Appointment" stage each month — same
// forward-looking limitation as assignToAppointmentDuration.
export function appointmentMonthlyTrend(stageEvents: StageEvent[], stages: Stage[], monthsBack: number, now: Date): MonthCount[] {
  const appointmentStageIds = new Set(stages.filter((s) => s.name.trim().toLowerCase() === "appointment").map((s) => s.id));
  const points: MonthCount[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const count = stageEvents.filter((e) => appointmentStageIds.has(e.stageId) && yearMonthOf(e.createdAt) === yearMonth).length;
    points.push({ yearMonth, count });
  }
  return points;
}

export interface SourceDurationRow {
  id: string | null;
  name: string;
  count: number;
  avgDays: number | null;
}

// Assign -> Closed Case duration for deals closed in `yearMonth`, grouped
// by the customer's lead source. Only deals with a matching assignment_event
// (see latestAssignmentBefore) contribute — a deal closed on a slot assigned
// before assignment_events existed just doesn't have a start time to measure from.
export function closedDurationBySource(
  dealClosures: DealClosure[],
  customers: Customer[],
  assignmentEvents: AssignmentEvent[],
  leadSources: LeadSource[],
  yearMonth: string
): SourceDurationRow[] {
  const customersById = new Map(customers.map((c) => [c.id, c]));
  const bySource = new Map<string | null, number[]>();
  for (const d of dealClosures) {
    if (yearMonthOf(d.createdAt) !== yearMonth) continue;
    const assignedAt = latestAssignmentBefore(assignmentEvents, d.customerId, d.slot, d.createdAt);
    if (!assignedAt) continue;
    const ms = new Date(d.createdAt).getTime() - new Date(assignedAt.createdAt).getTime();
    if (ms < 0) continue;
    const sourceId = customersById.get(d.customerId)?.sourceId ?? null;
    const list = bySource.get(sourceId) ?? [];
    list.push(ms);
    bySource.set(sourceId, list);
  }
  const rows: SourceDurationRow[] = [...bySource.entries()].map(([id, durations]) => ({
    id,
    name: id ? leadSources.find((s) => s.id === id)?.name ?? "Unknown source" : "No source",
    count: durations.length,
    avgDays: avgDays(durations),
  }));
  return rows.sort((a, b) => b.count - a.count);
}

// Created -> Closed Case duration for deals closed in `yearMonth`, grouped
// by lead source. Unlike closedDurationBySource this never needs
// assignment_events — customers.createdAt has always been there.
export function createdToClosedBySource(
  dealClosures: DealClosure[],
  customers: Customer[],
  leadSources: LeadSource[],
  yearMonth: string
): SourceDurationRow[] {
  const customersById = new Map(customers.map((c) => [c.id, c]));
  const bySource = new Map<string | null, number[]>();
  for (const d of dealClosures) {
    if (yearMonthOf(d.createdAt) !== yearMonth) continue;
    const customer = customersById.get(d.customerId);
    if (!customer) continue;
    const ms = new Date(d.createdAt).getTime() - new Date(customer.createdAt).getTime();
    if (ms < 0) continue;
    const sourceId = customer.sourceId;
    const list = bySource.get(sourceId) ?? [];
    list.push(ms);
    bySource.set(sourceId, list);
  }
  const rows: SourceDurationRow[] = [...bySource.entries()].map(([id, durations]) => ({
    id,
    name: id ? leadSources.find((s) => s.id === id)?.name ?? "Unknown source" : "No source",
    count: durations.length,
    avgDays: avgDays(durations),
  }));
  return rows.sort((a, b) => b.count - a.count);
}
