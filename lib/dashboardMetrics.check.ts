// Self-check for dashboardMetrics. Run with:
//   node --experimental-strip-types lib/dashboardMetrics.check.ts
import assert from "node:assert";
import {
  conversionRatePct,
  leaderboard,
  lostCount,
  monthlyTrend,
  openTaskCount,
  pacePct,
  scopedUserIds,
  stageFunnel,
  wonAmountInMonth,
} from "./dashboardMetrics.ts";
import type { Activity, Customer, DealClosure, SalesTarget, Stage, Task, User } from "./types.ts";

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
    firsttimeBranchId: null, targetRaceId: null, targetTypeId: null, budgetId: null,
    remark: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function stage(overrides: Partial<Stage> & { id: string; name: string; order: number }): Stage {
  return { isDefault: false, requiresAmount: false, ...overrides };
}

function dealClosure(overrides: Partial<DealClosure> & { id: string; customerId: string; userId: string; amount: number; createdAt: string }): DealClosure {
  return { slot: 1, stageId: "won-stage", ...overrides };
}

function user(overrides: Partial<User> & { id: string; name: string }): User {
  return { email: "", phone: null, ic: null, role: "SALESPERSON", teamId: null, active: true, activePoolLimit: null, inactivePoolLimit: null, ...overrides };
}

function activity(overrides: Partial<Activity> & { id: string; customerId: string; authorUserId: string; createdAt: string }): Activity {
  return { type: "CALL", content: "", followUp: "", author: "", time: "", ...overrides };
}

function task(overrides: Partial<Task> & { id: string; customerId: string; done: boolean }): Task {
  return { title: "T", due: "", ...overrides };
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

console.log("dashboardMetrics: all checks passed");
