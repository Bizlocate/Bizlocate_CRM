// Self-check for autoSecondAssign. Run with:
//   node --experimental-strip-types lib/autoSecondAssign.check.ts
import assert from "node:assert";
import { FOURTEEN_DAYS_MS, SEVEN_DAYS_MS, isSecondAssignDue, secondAssignDueAt } from "./autoSecondAssign.ts";
import type { Activity, Customer, Stage } from "./types.ts";

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

function isoDaysAgo(days: number): string {
  return new Date(NOW - days * DAY_MS).toISOString();
}

// --- secondAssignDueAt: plain 7-day path (no excludeFromAutoAssign stage) ---
{
  const c = customer({ id: "c1", createdAt: isoDaysAgo(10) });
  const dueAt = secondAssignDueAt(c, [], undefined);
  assert.strictEqual(dueAt, new Date(c.createdAt).getTime() + SEVEN_DAYS_MS);
}

// --- secondAssignDueAt: 14-day-idle path, no activity logged -> falls back to pool1Since ---
{
  const stage: Pick<Stage, "excludeFromAutoAssign"> = { excludeFromAutoAssign: true };
  const c = customer({ id: "c2", createdAt: isoDaysAgo(30), pool1Since: isoDaysAgo(20), assignedToUserId: "sp-1" });
  const dueAt = secondAssignDueAt(c, [], stage);
  assert.strictEqual(dueAt, new Date(c.pool1Since!).getTime() + FOURTEEN_DAYS_MS);
}

// --- secondAssignDueAt: 14-day-idle path, activity resets the clock forward ---
{
  const stage: Pick<Stage, "excludeFromAutoAssign"> = { excludeFromAutoAssign: true };
  const c = customer({ id: "c3", createdAt: isoDaysAgo(30), pool1Since: isoDaysAgo(20), assignedToUserId: "sp-1" });
  const acts = [activity({ id: "a1", customerId: "c3", authorUserId: "sp-1", createdAt: isoDaysAgo(5) })];
  const dueAt = secondAssignDueAt(c, acts, stage);
  assert.strictEqual(dueAt, new Date(acts[0].createdAt).getTime() + FOURTEEN_DAYS_MS);
}

// --- secondAssignDueAt: activity from someone else (not the slot-1 assignee) doesn't count ---
{
  const stage: Pick<Stage, "excludeFromAutoAssign"> = { excludeFromAutoAssign: true };
  const c = customer({ id: "c4", createdAt: isoDaysAgo(30), pool1Since: isoDaysAgo(20), assignedToUserId: "sp-1" });
  const acts = [activity({ id: "a2", customerId: "c4", authorUserId: "someone-else", createdAt: isoDaysAgo(1) })];
  const dueAt = secondAssignDueAt(c, acts, stage);
  assert.strictEqual(dueAt, new Date(c.pool1Since!).getTime() + FOURTEEN_DAYS_MS);
}

// --- isSecondAssignDue: not yet due ---
{
  const dueAt = NOW + 1 * DAY_MS;
  assert.strictEqual(isSecondAssignDue(dueAt, new Date(NOW - 365 * DAY_MS).toISOString(), NOW), false);
}

// --- isSecondAssignDue: due, and area has been on well before the due date -> eligible ---
{
  const dueAt = NOW - 1 * DAY_MS;
  assert.strictEqual(isSecondAssignDue(dueAt, new Date(NOW - 365 * DAY_MS).toISOString(), NOW), true);
}

// --- isSecondAssignDue: due date fell before the area's last resume -> permanently missed ---
{
  const dueAt = NOW - 90 * DAY_MS; // became due 3 months ago
  const areaResumedAt = new Date(NOW - 1 * DAY_MS).toISOString(); // area only reopened yesterday
  assert.strictEqual(isSecondAssignDue(dueAt, areaResumedAt, NOW), false);
}

// --- isSecondAssignDue: due date exactly at the area's resume moment -> eligible (boundary, not excluded) ---
{
  const resumedAt = new Date(NOW - 50 * DAY_MS).toISOString();
  assert.strictEqual(isSecondAssignDue(new Date(resumedAt).getTime(), resumedAt, NOW), true);
}

console.log("autoSecondAssign.check.ts: all assertions passed");
