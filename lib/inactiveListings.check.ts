// Self-check for inactiveListings. Run with:
//   node --experimental-strip-types lib/inactiveListings.check.ts
import assert from "node:assert";
import {
  ACTIVE_PULL_DAYS,
  ACTIVE_WARN_DAYS,
  POTENTIAL_PULL_DAYS,
  POTENTIAL_WARN_DAYS,
  computeSlotAges,
  isStalePastPull,
  isWarnZone,
  scopeSlotAgesToViewer,
} from "./inactiveListings.ts";
import type { Activity, Customer } from "./types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-04T00:00:00Z").getTime();

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
    optionalPhone: "", remark: "",
    createdAt: new Date(NOW - 100 * DAY_MS).toISOString(),
    updatedAt: new Date(NOW - 100 * DAY_MS).toISOString(),
    ...overrides,
  };
}

function activity(overrides: Partial<Activity> & { id: string; customerId: string; authorUserId: string; createdAt: string }): Activity {
  return { type: "CALL", content: "", followUp: "", author: "", time: "", ...overrides };
}

function daysAgo(n: number): string {
  return new Date(NOW - n * DAY_MS).toISOString();
}

// --- computeSlotAges: ACTIVE anchors on last own activity, else createdAt ---
{
  const c = customer({ id: "c1", assignedToUserId: "u1", pool1: "ACTIVE", createdAt: daysAgo(100) });
  const acts: Activity[] = [activity({ id: "a1", customerId: "c1", authorUserId: "u1", createdAt: daysAgo(27) })];
  const ages = computeSlotAges([c], acts, NOW);
  assert.strictEqual(ages.length, 1);
  assert.strictEqual(ages[0].pool, "ACTIVE");
  assert.ok(Math.abs(ages[0].daysStale - 27) < 0.01, `expected ~27 days stale, got ${ages[0].daysStale}`);
}

{
  // No activity at all -> falls back to customer.createdAt
  const c = customer({ id: "c2", assignedToUserId: "u1", pool1: "ACTIVE", createdAt: daysAgo(40) });
  const ages = computeSlotAges([c], [], NOW);
  assert.ok(Math.abs(ages[0].daysStale - 40) < 0.01);
}

// --- computeSlotAges: INACTIVE anchors on pool*Since vs last activity, latest wins ---
{
  const c = customer({ id: "c3", assignedToUserId2: "u2", pool2: "INACTIVE", pool2Since: daysAgo(70) });
  const acts: Activity[] = [activity({ id: "a2", customerId: "c3", authorUserId: "u2", createdAt: daysAgo(55) })];
  const ages = computeSlotAges([c], acts, NOW);
  const slot2 = ages.find((a) => a.slot === 2)!;
  assert.ok(Math.abs(slot2.daysStale - 55) < 0.01, `activity is more recent than pool2Since, should win: got ${slot2.daysStale}`);
}

// --- isStalePastPull / isWarnZone thresholds ---
{
  const activeJustUnder = { customerId: "x", slot: 1 as const, userId: "u", pool: "ACTIVE" as const, daysStale: ACTIVE_PULL_DAYS - 0.1 };
  const activeAtPull = { ...activeJustUnder, daysStale: ACTIVE_PULL_DAYS };
  const activeInWarn = { ...activeJustUnder, daysStale: ACTIVE_WARN_DAYS + 1 };
  const activeBeforeWarn = { ...activeJustUnder, daysStale: ACTIVE_WARN_DAYS - 1 };
  assert.strictEqual(isStalePastPull(activeJustUnder), false);
  assert.strictEqual(isStalePastPull(activeAtPull), true);
  assert.strictEqual(isWarnZone(activeInWarn), true);
  assert.strictEqual(isWarnZone(activeBeforeWarn), false);
  assert.strictEqual(isWarnZone(activeAtPull), false, "at the pull threshold it's pulled, not warned");

  const potentialInWarn = { customerId: "x", slot: 1 as const, userId: "u", pool: "INACTIVE" as const, daysStale: POTENTIAL_WARN_DAYS + 1 };
  const potentialAtPull = { ...potentialInWarn, daysStale: POTENTIAL_PULL_DAYS };
  assert.strictEqual(isWarnZone(potentialInWarn), true);
  assert.strictEqual(isStalePastPull(potentialAtPull), true);
  assert.strictEqual(isWarnZone(potentialAtPull), false);
}

// --- scopeSlotAgesToViewer ---
{
  const ages = [
    { customerId: "c1", slot: 1 as const, userId: "sales-a", pool: "ACTIVE" as const, daysStale: 26 },
    { customerId: "c2", slot: 1 as const, userId: "sales-b", pool: "ACTIVE" as const, daysStale: 26 },
    { customerId: "c3", slot: 1 as const, userId: "sales-c", pool: "ACTIVE" as const, daysStale: 26 },
  ];
  const users = [
    { id: "sales-a", teamId: "team-1" },
    { id: "sales-b", teamId: "team-1" },
    { id: "sales-c", teamId: "team-2" },
  ];
  assert.strictEqual(scopeSlotAgesToViewer(ages, users, { id: "admin-1", role: "ADMIN", teamId: null }).length, 3);
  const managerScoped = scopeSlotAgesToViewer(ages, users, { id: "mgr-1", role: "MANAGER", teamId: "team-1" });
  assert.deepStrictEqual(managerScoped.map((a) => a.userId).sort(), ["sales-a", "sales-b"]);
  const salesScoped = scopeSlotAgesToViewer(ages, users, { id: "sales-a", role: "SALESPERSON", teamId: "team-1" });
  assert.deepStrictEqual(salesScoped.map((a) => a.userId), ["sales-a"]);
}

console.log("inactiveListings.check.ts: all assertions passed");
