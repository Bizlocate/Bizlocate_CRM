// Self-check for autoSecondAssign. Run with:
//   node --experimental-strip-types lib/autoSecondAssign.check.ts
import assert from "node:assert";
import { FOURTEEN_DAYS_MS, SEVEN_DAYS_MS, computeAutoSecondAssignPlan, isSecondAssignDue, secondAssignDueAt } from "./autoSecondAssign.ts";
import type { Activity, Area, Customer, Stage, User } from "./types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-21T06:00:00Z").getTime();

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
    optionalPhone: "", remark: "", createdBy: "admin-1",
    createdAt: new Date(NOW - 100 * DAY_MS).toISOString(),
    updatedAt: new Date(NOW - 100 * DAY_MS).toISOString(),
    ...overrides,
  };
}

function activity(overrides: Partial<Activity> & { id: string; customerId: string; authorUserId: string; createdAt: string }): Activity {
  return { type: "CALL", content: "", followUp: "", author: "", time: "", ...overrides };
}

function area(overrides: Partial<Area> & { id: string }): Area {
  return { name: "Area", teamIds: [], autoAssignEnabled: true, autoAssignResumedAt: new Date(0).toISOString(), lastAutoAssignedUserId: null, ...overrides };
}

function user(overrides: Partial<User> & { id: string; name: string }): User {
  return { email: "", phone: null, ic: null, role: "SALESPERSON", teamId: null, active: true, activePoolLimit: null, inactivePoolLimit: null, autoAssignEnabled: true, ...overrides };
}

function isoDaysAgo(days: number): string {
  return new Date(NOW - days * DAY_MS).toISOString();
}

const IDLE_STAGE: Pick<Stage, "excludeFromAutoAssign"> = { excludeFromAutoAssign: true };

// --- secondAssignDueAt: plain 7-day path (no excludeFromAutoAssign stage) ---
{
  const c = customer({ id: "c1", createdAt: isoDaysAgo(10) });
  const dueAt = secondAssignDueAt(c, [], undefined);
  assert.strictEqual(dueAt, new Date(c.createdAt).getTime() + SEVEN_DAYS_MS);
}

// --- secondAssignDueAt: 14-day-idle path, no activity logged -> falls back to pool1Since ---
{
  const c = customer({ id: "c2", createdAt: isoDaysAgo(30), pool1Since: isoDaysAgo(20), assignedToUserId: "sp-1" });
  const dueAt = secondAssignDueAt(c, [], IDLE_STAGE);
  assert.strictEqual(dueAt, new Date(c.pool1Since!).getTime() + FOURTEEN_DAYS_MS);
}

// --- secondAssignDueAt: 14-day-idle path, activity resets the clock forward ---
{
  const c = customer({ id: "c3", createdAt: isoDaysAgo(30), pool1Since: isoDaysAgo(20), assignedToUserId: "sp-1" });
  const acts = [activity({ id: "a1", customerId: "c3", authorUserId: "sp-1", createdAt: isoDaysAgo(5) })];
  const dueAt = secondAssignDueAt(c, acts, IDLE_STAGE);
  assert.strictEqual(dueAt, new Date(acts[0].createdAt).getTime() + FOURTEEN_DAYS_MS);
}

// --- secondAssignDueAt: activity from someone else (not the slot-1 assignee) doesn't count ---
{
  const c = customer({ id: "c4", createdAt: isoDaysAgo(30), pool1Since: isoDaysAgo(20), assignedToUserId: "sp-1" });
  const acts = [activity({ id: "a2", customerId: "c4", authorUserId: "someone-else", createdAt: isoDaysAgo(1) })];
  const dueAt = secondAssignDueAt(c, acts, IDLE_STAGE);
  assert.strictEqual(dueAt, new Date(c.pool1Since!).getTime() + FOURTEEN_DAYS_MS);
}

// --- secondAssignDueAt: 14-day-idle path, TWO own activities -> picks the later (max) one, not just "an" activity ---
{
  const c = customer({ id: "c5", createdAt: isoDaysAgo(30), pool1Since: isoDaysAgo(20), assignedToUserId: "sp-1" });
  // Deliberately out of chronological order (later one first) so a bug that
  // just takes the last array element instead of Math.max would be caught.
  const acts = [
    activity({ id: "a3", customerId: "c5", authorUserId: "sp-1", createdAt: isoDaysAgo(3) }),
    activity({ id: "a4", customerId: "c5", authorUserId: "sp-1", createdAt: isoDaysAgo(15) }),
  ];
  const dueAt = secondAssignDueAt(c, acts, IDLE_STAGE);
  assert.strictEqual(dueAt, new Date(isoDaysAgo(3)).getTime() + FOURTEEN_DAYS_MS);
}

// --- isSecondAssignDue: not yet due (plain 7-day path) ---
{
  const c = customer({ id: "d1", createdAt: isoDaysAgo(6) }); // dueAt = NOW + 1 day
  assert.strictEqual(isSecondAssignDue(c, [], undefined, isoDaysAgo(365), NOW), false);
}

// --- isSecondAssignDue: due, and area has been on well before the due date -> eligible ---
{
  const c = customer({ id: "d2", createdAt: isoDaysAgo(8) }); // dueAt = NOW - 1 day
  assert.strictEqual(isSecondAssignDue(c, [], undefined, isoDaysAgo(365), NOW), true);
}

// --- isSecondAssignDue: due date fell before the area's last resume -> permanently missed ---
{
  const c = customer({ id: "d3", createdAt: isoDaysAgo(97) }); // dueAt = NOW - 90 days
  const areaResumedAt = isoDaysAgo(1); // area only reopened yesterday
  assert.strictEqual(isSecondAssignDue(c, [], undefined, areaResumedAt, NOW), false);
}

// --- isSecondAssignDue: due date exactly at the area's resume moment -> eligible (boundary, not excluded) ---
{
  const resumedAt = isoDaysAgo(50);
  const c = customer({ id: "d4", createdAt: isoDaysAgo(57) }); // dueAt = resumedAt exactly
  assert.strictEqual(isSecondAssignDue(c, [], undefined, resumedAt, NOW), true);
}

// --- isSecondAssignDue: pre-migration fallback. areaResumedAt is undefined (column doesn't
// exist in DB yet) -> NaN comparison is always false -> falls through to normal due-date
// check (matches pre-fix behavior), rather than permanently skipping everything. ---
{
  const c = customer({ id: "d5", createdAt: isoDaysAgo(10) }); // overdue on the plain 7-day path
  const areaResumedAt = undefined as unknown as string;
  assert.strictEqual(isSecondAssignDue(c, [], undefined, areaResumedAt, NOW), true);
}

// --- isSecondAssignDue: 14-day-idle path, missed its window before the area reopened ->
// a NEW activity logged AFTER the area reopens must NOT resurrect it (regression test for
// the "recomputed lastTouched dodges the missed-window check" bug). ---
{
  const c = customer({ id: "e1", createdAt: isoDaysAgo(40), pool1Since: isoDaysAgo(30), assignedToUserId: "sp-1" });
  const areaResumedAt = isoDaysAgo(10); // area reopened 10 days ago
  // As of resume: dueAt = pool1Since(-30d) + 14d = -16d, which is before resume(-10d) -> already missed.
  const postReopenActivity = [activity({ id: "a5", customerId: "e1", authorUserId: "sp-1", createdAt: isoDaysAgo(2) })];
  assert.strictEqual(isSecondAssignDue(c, postReopenActivity, IDLE_STAGE, areaResumedAt, NOW), false);
}

// --- isSecondAssignDue: 14-day-idle path, NOT yet overdue at the moment the area reopened
// (still within its window through the toggle) -> evaluated normally afterward, once its
// due date actually arrives. ---
{
  const c = customer({ id: "e2", createdAt: isoDaysAgo(20), pool1Since: isoDaysAgo(15), assignedToUserId: "sp-1" });
  const areaResumedAt = isoDaysAgo(10); // area reopened 10 days ago
  // As of resume: dueAt = pool1Since(-15d) + 14d = -1d, which is AFTER resume(-10d) -> not missed.
  // Live dueAt (no further activity) is the same -1d, which is now <= NOW -> due.
  assert.strictEqual(isSecondAssignDue(c, [], IDLE_STAGE, areaResumedAt, NOW), true);
}

// --- computeAutoSecondAssignPlan: two eligible candidates, two due customers in one
// pass -> round-robins between them, not both landing on the same person (regression
// check for the pointerByArea/extraAssignedCount same-pass collision handling). ---
{
  const a = area({ id: "area-1", teamIds: ["team-1"], autoAssignResumedAt: isoDaysAgo(365) });
  const u1 = user({ id: "sp-1", name: "Alice", teamId: "team-1" });
  const u2 = user({ id: "sp-2", name: "Bob", teamId: "team-1" });
  const c1 = customer({ id: "cust-1", areaId: "area-1", assignedToUserId: "owner-1", createdAt: isoDaysAgo(10) });
  const c2 = customer({ id: "cust-2", areaId: "area-1", assignedToUserId: "owner-1", createdAt: isoDaysAgo(10) });
  const actions = computeAutoSecondAssignPlan([c1, c2], [a], [u1, u2], [], [], NOW);
  assert.strictEqual(actions.length, 2);
  assert.strictEqual(actions[0].winnerId, "sp-1");
  assert.strictEqual(actions[1].winnerId, "sp-2");
}

// --- computeAutoSecondAssignPlan: a candidate already at their activePoolLimit is
// skipped in favor of the next candidate. ---
{
  const a = area({ id: "area-2", teamIds: ["team-2"], autoAssignResumedAt: isoDaysAgo(365) });
  const u1 = user({ id: "sp-3", name: "Alice", teamId: "team-2", activePoolLimit: 1 });
  const u2 = user({ id: "sp-4", name: "Bob", teamId: "team-2" });
  const existing = customer({ id: "existing", areaId: "area-2", assignedToUserId: "sp-3", pool1: "ACTIVE", createdAt: isoDaysAgo(1) });
  const target = customer({ id: "target", areaId: "area-2", assignedToUserId: "owner-2", createdAt: isoDaysAgo(10) });
  const actions = computeAutoSecondAssignPlan([existing, target], [a], [u1, u2], [], [], NOW);
  assert.strictEqual(actions.length, 1);
  assert.strictEqual(actions[0].winnerId, "sp-4");
}

// --- computeAutoSecondAssignPlan: a legacy customer (createdBy: null) never produces
// an action, no matter how overdue. ---
{
  const a = area({ id: "area-3", teamIds: ["team-3"], autoAssignResumedAt: isoDaysAgo(365) });
  const u1 = user({ id: "sp-5", name: "Alice", teamId: "team-3" });
  const c = customer({ id: "legacy-1", areaId: "area-3", assignedToUserId: "owner-3", createdAt: isoDaysAgo(10), createdBy: null });
  const actions = computeAutoSecondAssignPlan([c], [a], [u1], [], [], NOW);
  assert.strictEqual(actions.length, 0);
}

// --- computeAutoSecondAssignPlan: a customer whose due date fell before the area's
// autoAssignResumedAt never produces an action (missed-window rule). ---
{
  const a = area({ id: "area-4", teamIds: ["team-4"], autoAssignResumedAt: isoDaysAgo(5) });
  const u1 = user({ id: "sp-6", name: "Alice", teamId: "team-4" });
  const c = customer({ id: "missed-1", areaId: "area-4", assignedToUserId: "owner-4", createdAt: isoDaysAgo(20) });
  const actions = computeAutoSecondAssignPlan([c], [a], [u1], [], [], NOW);
  assert.strictEqual(actions.length, 0);
}

// --- computeAutoSecondAssignPlan: no candidates available (empty team) -> no action,
// no throw. ---
{
  const a = area({ id: "area-5", teamIds: ["team-5"], autoAssignResumedAt: isoDaysAgo(365) });
  const c = customer({ id: "orphan-1", areaId: "area-5", assignedToUserId: "owner-5", createdAt: isoDaysAgo(10) });
  const actions = computeAutoSecondAssignPlan([c], [a], [], [], [], NOW);
  assert.strictEqual(actions.length, 0);
}

console.log("autoSecondAssign.check.ts: all assertions passed");
