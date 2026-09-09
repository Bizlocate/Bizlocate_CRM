// Self-check for dashboardMetrics. Run with:
//   node --experimental-strip-types lib/dashboardMetrics.check.ts
import assert from "node:assert";
import {
  appointmentMonthlyTrend,
  assignToAppointmentDuration,
  assignmentCounts,
  closedDurationBySource,
  conversionRatePct,
  createdToClosedBySource,
  leaderboard,
  leadsBySource,
  lostCount,
  monthlyTrend,
  openTaskCount,
  pacePct,
  removalCohortBreakdown,
  removalCounts,
  removalReasonBreakdown,
  removalSourceBreakdown,
  scopedUserIds,
  stageFunnel,
  wonAmountInMonth,
} from "./dashboardMetrics.ts";
import type { Activity, AssignmentEvent, Customer, DealClosure, LeadSource, RemovalReason, RemovalRequest, SalesTarget, Stage, StageEvent, Task, User } from "./types.ts";

function customer(overrides: Partial<Customer> & { id: string }): Customer {
  return {
    name: "C", email: "", phone: "",
    stage1Id: null, stage2Id: null, stage3Id: null,
    assignedToUserId: null, assignedToUserId2: null, assignedToUserId3: null,
    pool1: null, pool2: null, pool3: null,
    pool1Since: null, pool2Since: null, pool3Since: null,
    sourceId: null, areaId: null, subAreaId: null, propertyTypeId: null, purposeId: null,
    businessIndustryId: null, businessCategoryId: null, businessTypeId: null,
    raceId: null, languageId: null, businessName: "",
    firsttimeBranchId: null, targetRaceId: null, targetTypeId: null, budgetMin: null, budgetMax: null,
    optionalPhone: "",
    remark: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function stage(overrides: Partial<Stage> & { id: string; name: string; order: number }): Stage {
  return { isDefault: false, requiresAmount: false, excludeFromAutoAssign: false, ...overrides };
}

function dealClosure(overrides: Partial<DealClosure> & { id: string; customerId: string; userId: string; amount: number; createdAt: string }): DealClosure {
  return { slot: 1, stageId: "won-stage", ...overrides };
}

function user(overrides: Partial<User> & { id: string; name: string }): User {
  return { email: "", phone: null, ic: null, role: "SALESPERSON", teamId: null, active: true, activePoolLimit: null, inactivePoolLimit: null, autoAssignEnabled: true, ...overrides };
}

function activity(overrides: Partial<Activity> & { id: string; customerId: string; authorUserId: string; createdAt: string }): Activity {
  return { type: "CALL", content: "", followUp: "", author: "", time: "", ...overrides };
}

function task(overrides: Partial<Task> & { id: string; customerId: string; done: boolean }): Task {
  return { userId: "u1", title: "T", due: "", ...overrides };
}

function leadSource(overrides: { id: string; name: string }): LeadSource {
  return { ...overrides };
}

function removalReason(overrides: { id: string; name: string }): RemovalReason {
  return { ...overrides };
}

function removalRequest(
  overrides: Partial<RemovalRequest> & { id: string; customerId: string; requestedBy: string; reasonId: string }
): RemovalRequest {
  return { slot: 1, status: "PENDING", resolvedBy: null, resolvedAt: null, createdAt: "2026-01-01T00:00:00Z", ...overrides };
}

function assignmentEvent(overrides: Partial<AssignmentEvent> & { id: string; customerId: string; userId: string; createdAt: string }): AssignmentEvent {
  return { slot: 1, ...overrides };
}

function stageEvent(overrides: Partial<StageEvent> & { id: string; customerId: string; userId: string; stageId: string; createdAt: string }): StageEvent {
  return { slot: 1, ...overrides };
}

// --- stageFunnel: counts across all 3 slots, ordered by stage.order ---
const newStage = stage({ id: "new", name: "New", order: 1 });
const wonStage = stage({ id: "won", name: "Won", order: 2 });
const lostStage = stage({ id: "lost", name: "Lost", order: 3 });
const funnelCustomers = [
  customer({ id: "c1", stage1Id: "new" }),
  customer({ id: "c2", stage2Id: "won" }),
  customer({ id: "c3", stage1Id: "won", stage3Id: "new" }),
];
const funnel = stageFunnel(funnelCustomers, [wonStage, newStage, lostStage]);
assert.deepEqual(funnel.map((f) => f.stageId), ["new", "won", "lost"], "sorted by order regardless of input order");
assert.equal(funnel.find((f) => f.stageId === "new")!.count, 2);
assert.equal(funnel.find((f) => f.stageId === "won")!.count, 2);
assert.equal(funnel.find((f) => f.stageId === "lost")!.count, 0);

// --- lostCount: matches stage name "Lost" case-insensitively, across slots ---
const lostCustomers = [customer({ id: "c1", stage2Id: "lost" }), customer({ id: "c2", stage1Id: "new" })];
assert.equal(lostCount(lostCustomers, [newStage, lostStage]), 1);
assert.equal(lostCount(lostCustomers, [newStage]), 0, "no Lost stage configured -> 0, not a crash");

// --- stageFunnel/lostCount: scopedIds filters slots by assignee, not just by customer ---
// c4 has slot1 (user "in") and slot2 (user "out") both in the "won" stage.
const scopedCustomers = [customer({ id: "c4", stage1Id: "won", assignedToUserId: "in", stage2Id: "won", assignedToUserId2: "out" })];
const scopedFunnelIn = stageFunnel(scopedCustomers, [wonStage], new Set(["in"]));
assert.equal(scopedFunnelIn.find((f) => f.stageId === "won")!.count, 1, "only the in-scope slot counts when scopedIds is passed");
const scopedFunnelAll = stageFunnel(scopedCustomers, [wonStage]);
assert.equal(scopedFunnelAll.find((f) => f.stageId === "won")!.count, 2, "both slots count when scopedIds is omitted");

const scopedLostCustomers = [customer({ id: "c5", stage1Id: "lost", assignedToUserId: "in", stage2Id: "lost", assignedToUserId2: "out" })];
assert.equal(lostCount(scopedLostCustomers, [lostStage], new Set(["in"])), 1, "only the in-scope slot counts as lost");
assert.equal(lostCount(scopedLostCustomers, [lostStage]), 2, "both slots count as lost when scopedIds is omitted");

// --- wonAmountInMonth ---
const closures = [
  dealClosure({ id: "d1", customerId: "c1", userId: "u1", amount: 100, createdAt: "2026-08-05T00:00:00Z" }),
  dealClosure({ id: "d2", customerId: "c2", userId: "u1", amount: 50, createdAt: "2026-07-05T00:00:00Z" }),
];
assert.equal(wonAmountInMonth(closures, "2026-08"), 100);
assert.equal(wonAmountInMonth(closures, "2026-07"), 50);
assert.equal(wonAmountInMonth(closures, "2026-09"), 0);

// --- leaderboard: sorted desc by won, target/attainment/activity per user ---
const users = [user({ id: "u1", name: "Alice" }), user({ id: "u2", name: "Bob" })];
const targets: SalesTarget[] = [{ id: "t1", userId: "u1", yearMonth: "2026-08", amount: 200, setBy: "admin", createdAt: "", updatedAt: "" }];
const activities = [
  activity({ id: "a1", customerId: "c1", authorUserId: "u1", createdAt: "2026-08-01T00:00:00Z" }),
  activity({ id: "a2", customerId: "c1", authorUserId: "u1", createdAt: "2026-07-01T00:00:00Z" }),
];
const board = leaderboard(users, closures, targets, activities, "2026-08");
assert.equal(board[0].name, "Alice", "Alice has 100 won this month, Bob has 0 -> Alice first");
assert.equal(board[0].won, 100);
assert.equal(board[0].target, 200);
assert.equal(board[0].attainmentPct, 50);
assert.equal(board[0].activityCount, 1, "only the August activity counts");
assert.equal(board[1].name, "Bob");
assert.equal(board[1].target, null, "no target row for Bob");
assert.equal(board[1].attainmentPct, null);

// --- monthlyTrend: oldest to newest, monthsBack entries ending at `now` ---
const trendCustomers = [customer({ id: "c1", createdAt: "2026-06-10T00:00:00Z" }), customer({ id: "c2", createdAt: "2026-08-10T00:00:00Z" })];
const trend = monthlyTrend(trendCustomers, closures, 3, new Date(2026, 7, 15)); // August 2026 (month index 7)
assert.deepEqual(trend.map((p) => p.yearMonth), ["2026-06", "2026-07", "2026-08"]);
assert.equal(trend[0].newLeads, 1);
assert.equal(trend[0].won, 0);
assert.equal(trend[1].won, 50);
assert.equal(trend[2].won, 100);
assert.equal(trend[2].newLeads, 1);
// wonCount is the number of closures, not their summed amount — it shares a
// scale with newLeads, which `won` (money) never could.
assert.deepEqual(trend.map((p) => p.wonCount), [0, 1, 1], "Jun none, Jul d2, Aug d1");

// --- openTaskCount ---
const tasks = [task({ id: "t1", customerId: "c1", done: false }), task({ id: "t2", customerId: "c1", done: true }), task({ id: "t3", customerId: "c2", done: false })];
assert.equal(openTaskCount(tasks, new Set(["c1"])), 1, "c1 has 1 open + 1 done; only the open one counts");
assert.equal(openTaskCount(tasks, new Set(["c1", "c2"])), 2);

// --- pacePct ---
assert.equal(pacePct(new Date(2026, 7, 15), "2026-07"), 100, "past month reads as fully elapsed");
assert.equal(pacePct(new Date(2026, 7, 31), "2026-08"), 100, "Aug 31 of 31 days = 100%");
assert.equal(pacePct(new Date(2026, 7, 15), "2026-08"), 48, "Aug 15 of 31 days = round(15/31*100) = 48");

// --- conversionRatePct: trendCustomers has 1 lead in Aug (c2); closures'
// won customerId in Aug is c1, which isn't in trendCustomers -> 0 of 1 won ---
assert.equal(conversionRatePct(closures, trendCustomers, "2026-08"), 0, "1 lead (c2) created in Aug, 0 of them (c2) won -> 0%");
assert.equal(conversionRatePct(closures, trendCustomers, "2026-05"), null, "no leads created in May -> null, not divide-by-zero");

// --- scopedUserIds ---
const admin = user({ id: "admin1", name: "Admin", role: "ADMIN" });
const manager = user({ id: "mgr1", name: "Mgr", role: "MANAGER", teamId: "team1" });
const teammate = user({ id: "u3", name: "Teammate", teamId: "team1" });
const other = user({ id: "u4", name: "Other", teamId: "team2" });
const allUsers = [admin, manager, teammate, other];
assert.deepEqual([...scopedUserIds(allUsers, admin)].sort(), ["admin1", "mgr1", "u3", "u4"].sort());
assert.deepEqual([...scopedUserIds(allUsers, manager)].sort(), ["mgr1", "u3"].sort());
const sales = user({ id: "u5", name: "Sales", role: "SALESPERSON" });
assert.deepEqual([...scopedUserIds(allUsers, sales)], ["u5"]);

// --- leadsBySource: grouped by sourceId, null -> "No source" ---
const sources = [leadSource({ id: "s1", name: "Facebook" }), leadSource({ id: "s2", name: "Referral" })];
const sourceCustomers = [
  customer({ id: "c1", sourceId: "s1", createdAt: "2026-08-05T00:00:00Z" }),
  customer({ id: "c2", sourceId: "s1", createdAt: "2026-08-06T00:00:00Z" }),
  customer({ id: "c3", sourceId: "s2", createdAt: "2026-08-07T00:00:00Z" }),
  customer({ id: "c4", sourceId: null, createdAt: "2026-08-08T00:00:00Z" }),
  customer({ id: "c5", sourceId: "s1", createdAt: "2026-07-05T00:00:00Z" }), // outside month, excluded
];
const bySource = leadsBySource(sourceCustomers, sources, "2026-08");
assert.deepEqual(bySource.map((r) => r.name), ["Facebook", "Referral", "No source"], "sorted desc by count");
assert.equal(bySource.find((r) => r.name === "Facebook")!.count, 2);
assert.equal(bySource.find((r) => r.name === "No source")!.count, 1);
assert.equal(leadsBySource(sourceCustomers, sources, "2026-05").length, 0, "no leads that month -> empty, not a crash");

// --- assignmentCounts: one row per event, not deduped per customer ---
const assignEvents = [
  assignmentEvent({ id: "e1", customerId: "c1", userId: "u1", createdAt: "2026-08-01T00:00:00Z" }),
  assignmentEvent({ id: "e2", customerId: "c1", userId: "u1", createdAt: "2026-08-15T00:00:00Z" }), // same customer, same person, again -> still 2
  assignmentEvent({ id: "e3", customerId: "c2", userId: "u2", createdAt: "2026-08-02T00:00:00Z" }),
  assignmentEvent({ id: "e4", customerId: "c3", userId: "u1", createdAt: "2026-07-01T00:00:00Z" }), // outside month
];
const assignCounts = assignmentCounts(users, assignEvents, "2026-08");
assert.equal(assignCounts.find((r) => r.userId === "u1")!.count, 2, "u1 assigned twice in August, counted both times");
assert.equal(assignCounts.find((r) => r.userId === "u2")!.count, 1);

// --- removalCounts / removalReasonBreakdown: only APPROVED, by resolvedAt month ---
const reasons = [removalReason({ id: "r1", name: "No response" }), removalReason({ id: "r2", name: "Wrong number" })];
const removals = [
  removalRequest({ id: "rr1", customerId: "c1", requestedBy: "u1", reasonId: "r1", status: "APPROVED", resolvedAt: "2026-08-10T00:00:00Z" }),
  removalRequest({ id: "rr2", customerId: "c2", requestedBy: "u1", reasonId: "r1", status: "APPROVED", resolvedAt: "2026-08-12T00:00:00Z" }),
  removalRequest({ id: "rr3", customerId: "c3", requestedBy: "u2", reasonId: "r2", status: "APPROVED", resolvedAt: "2026-08-14T00:00:00Z" }),
  removalRequest({ id: "rr4", customerId: "c4", requestedBy: "u1", reasonId: "r1", status: "PENDING" }), // not approved -> excluded
  removalRequest({ id: "rr5", customerId: "c5", requestedBy: "u1", reasonId: "r1", status: "APPROVED", resolvedAt: "2026-07-01T00:00:00Z" }), // wrong month
];
const removedCounts = removalCounts(users, removals, "2026-08");
assert.equal(removedCounts.find((r) => r.userId === "u1")!.count, 2, "rr1 + rr2, not rr4 (pending) or rr5 (wrong month)");
assert.equal(removedCounts.find((r) => r.userId === "u2")!.count, 1);
const reasonRows = removalReasonBreakdown(removals, reasons, "2026-08");
assert.deepEqual(reasonRows.map((r) => r.name), ["No response", "Wrong number"], "sorted desc by count");
assert.equal(reasonRows.find((r) => r.name === "No response")!.count, 2);
assert.equal(reasonRows.find((r) => r.name === "Wrong number")!.count, 1);

// --- removalSourceBreakdown / removalCohortBreakdown ---
const removalCustomers = [
  customer({ id: "c1", sourceId: "s1", createdAt: "2026-06-01T00:00:00Z" }),
  customer({ id: "c2", sourceId: "s1", createdAt: "2026-06-15T00:00:00Z" }),
  customer({ id: "c3", sourceId: "s2", createdAt: "2026-07-01T00:00:00Z" }),
  customer({ id: "c4", sourceId: null, createdAt: "2026-08-01T00:00:00Z" }),
];
const removalsForSource = [
  removalRequest({ id: "rr1", customerId: "c1", requestedBy: "u1", reasonId: "r1", status: "APPROVED", resolvedAt: "2026-08-10T00:00:00Z" }),
  removalRequest({ id: "rr2", customerId: "c2", requestedBy: "u1", reasonId: "r1", status: "APPROVED", resolvedAt: "2026-08-12T00:00:00Z" }),
  removalRequest({ id: "rr3", customerId: "c3", requestedBy: "u2", reasonId: "r2", status: "APPROVED", resolvedAt: "2026-08-14T00:00:00Z" }),
  removalRequest({ id: "rr4", customerId: "c4", requestedBy: "u1", reasonId: "r1", status: "PENDING" }), // excluded
];
const bySourceRemovals = removalSourceBreakdown(removalsForSource, removalCustomers, sources, "2026-08");
assert.equal(bySourceRemovals.find((r) => r.name === "Facebook")!.count, 2, "c1 + c2, both sourceId s1 (Facebook)");
assert.equal(bySourceRemovals.find((r) => r.name === "Referral")!.count, 1, "c3");
const byCohort = removalCohortBreakdown(removalsForSource, removalCustomers, "2026-08");
assert.deepEqual(byCohort.map((r) => r.id), ["2026-06", "2026-07"], "sorted chronologically; c1+c2 created June, c3 created July");
assert.equal(byCohort.find((r) => r.id === "2026-06")!.count, 2);

// --- assignToAppointmentDuration / appointmentMonthlyTrend ---
const apptStage = stage({ id: "appt", name: "Appointment", order: 2 });
const apptCustomers = [
  customer({ id: "c1", assignedToUserId: "u1", stage1Id: "appt" }),
  customer({ id: "c2", assignedToUserId: "u1", stage1Id: "new" }), // not in Appointment -> excluded
];
const apptAssignEvents = [
  assignmentEvent({ id: "e1", customerId: "c1", userId: "u1", slot: 1, createdAt: "2026-08-01T00:00:00Z" }),
];
const apptStageEvents = [
  stageEvent({ id: "se1", customerId: "c1", userId: "u1", slot: 1, stageId: "appt", createdAt: "2026-08-06T00:00:00Z" }), // 5 days after assign
];
const durationRows = assignToAppointmentDuration(users, apptCustomers, apptAssignEvents, apptStageEvents, [newStage, apptStage]);
assert.equal(durationRows.length, 1, "only u1 has a customer currently in Appointment with a logged transition");
assert.equal(durationRows[0].userId, "u1");
assert.equal(durationRows[0].count, 1);
assert.equal(durationRows[0].avgDays, 5);
assert.deepEqual(
  assignToAppointmentDuration(users, apptCustomers, apptAssignEvents, apptStageEvents, [newStage]),
  [],
  "no stage configured as Appointment -> empty, not a crash"
);
const apptTrend = appointmentMonthlyTrend(apptStageEvents, [newStage, apptStage], 3, new Date(2026, 7, 15));
assert.deepEqual(apptTrend.map((p) => p.yearMonth), ["2026-06", "2026-07", "2026-08"]);
assert.equal(apptTrend[2].count, 1, "the one Appointment stage_event landed in August");
assert.equal(apptTrend[0].count, 0);

// --- closedDurationBySource / createdToClosedBySource ---
const durCustomers = [
  customer({ id: "c1", sourceId: "s1", createdAt: "2026-08-01T00:00:00Z" }),
  customer({ id: "c2", sourceId: "s2", createdAt: "2026-08-01T00:00:00Z" }),
];
const durClosures = [
  dealClosure({ id: "d1", customerId: "c1", userId: "u1", slot: 1, amount: 100, createdAt: "2026-08-11T00:00:00Z" }), // 10 days after created
  dealClosure({ id: "d2", customerId: "c2", userId: "u1", slot: 1, amount: 50, createdAt: "2026-08-21T00:00:00Z" }), // 20 days after created
];
const durAssignEvents = [assignmentEvent({ id: "e1", customerId: "c1", userId: "u1", slot: 1, createdAt: "2026-08-06T00:00:00Z" })]; // c1 only, 5 days before close
const closedBySource = closedDurationBySource(durClosures, durCustomers, durAssignEvents, sources, "2026-08");
assert.equal(closedBySource.length, 1, "c2's deal has no assignment_events row -> excluded, not guessed at");
assert.equal(closedBySource[0].name, "Facebook");
assert.equal(closedBySource[0].avgDays, 5);
const createdToClosed = createdToClosedBySource(durClosures, durCustomers, sources, "2026-08");
assert.equal(createdToClosed.find((r) => r.name === "Facebook")!.avgDays, 10);
assert.equal(createdToClosed.find((r) => r.name === "Referral")!.avgDays, 20);

console.log("dashboardMetrics: all checks passed");
