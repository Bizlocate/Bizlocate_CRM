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
  warnZoneSlotsFor,
} from "./inactiveListings.ts";
import type { Activity, AssignmentEvent, Customer, RemovalRequest } from "./types.ts";

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

function assignmentEvent(overrides: Partial<AssignmentEvent> & { id: string; customerId: string; userId: string; slot: 1 | 2 | 3; createdAt: string }): AssignmentEvent {
  return { ...overrides };
}

function removalRequest(overrides: Partial<RemovalRequest> & { id: string; customerId: string; slot: 1 | 2 | 3 }): RemovalRequest {
  return {
    requestedBy: "u1", reasonId: "r1", status: "PENDING",
    resolvedBy: null, resolvedAt: null, createdAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

function daysAgo(n: number): string {
  return new Date(NOW - n * DAY_MS).toISOString();
}

// --- computeSlotAges: ACTIVE anchors on last own activity, else createdAt ---
{
  const c = customer({ id: "c1", assignedToUserId: "u1", pool1: "ACTIVE", createdAt: daysAgo(100) });
  const acts: Activity[] = [activity({ id: "a1", customerId: "c1", authorUserId: "u1", createdAt: daysAgo(27) })];
  const ages = computeSlotAges([c], acts, [], NOW);
  assert.strictEqual(ages.length, 1);
  assert.strictEqual(ages[0].pool, "ACTIVE");
  assert.ok(Math.abs(ages[0].daysStale - 27) < 0.01, `expected ~27 days stale, got ${ages[0].daysStale}`);
}

{
  // No activity and no assignment event -> falls back to customer.createdAt
  // (legacy rows, and slots assigned at creation time by addCustomer).
  const c = customer({ id: "c2", assignedToUserId: "u1", pool1: "ACTIVE", createdAt: daysAgo(40) });
  const ages = computeSlotAges([c], [], [], NOW);
  assert.ok(Math.abs(ages[0].daysStale - 40) < 0.01);
}

{
  // The bug this fix exists for: an old customer freshly reassigned. With no
  // activity yet, the anchor must be the assignment, not the customer record.
  const c = customer({ id: "c2b", assignedToUserId: "u1", pool1: "ACTIVE", createdAt: daysAgo(100) });
  const events = [assignmentEvent({ id: "e1", customerId: "c2b", userId: "u1", slot: 1, createdAt: daysAgo(2) })];
  const ages = computeSlotAges([c], [], events, NOW);
  assert.ok(Math.abs(ages[0].daysStale - 2) < 0.01, `expected ~2 days stale (assignment anchor), got ${ages[0].daysStale}`);

  // An assignment event for another slot/user must not be borrowed.
  const wrongSlot = [assignmentEvent({ id: "e2", customerId: "c2b", userId: "u1", slot: 2, createdAt: daysAgo(2) })];
  assert.ok(Math.abs(computeSlotAges([c], [], wrongSlot, NOW)[0].daysStale - 100) < 0.01);
  const wrongUser = [assignmentEvent({ id: "e3", customerId: "c2b", userId: "u9", slot: 1, createdAt: daysAgo(2) })];
  assert.ok(Math.abs(computeSlotAges([c], [], wrongUser, NOW)[0].daysStale - 100) < 0.01);

  // A more recent activity still wins over the assignment anchor.
  const older = [assignmentEvent({ id: "e4", customerId: "c2b", userId: "u1", slot: 1, createdAt: daysAgo(30) })];
  const acts: Activity[] = [activity({ id: "a3", customerId: "c2b", authorUserId: "u1", createdAt: daysAgo(5) })];
  assert.ok(Math.abs(computeSlotAges([c], acts, older, NOW)[0].daysStale - 5) < 0.01);
}

// --- computeSlotAges: INACTIVE anchors on pool*Since vs last activity, latest wins ---
{
  const c = customer({ id: "c3", assignedToUserId2: "u2", pool2: "INACTIVE", pool2Since: daysAgo(70) });
  const acts: Activity[] = [activity({ id: "a2", customerId: "c3", authorUserId: "u2", createdAt: daysAgo(55) })];
  const ages = computeSlotAges([c], acts, [], NOW);
  const slot2 = ages.find((a) => a.slot === 2)!;
  assert.ok(Math.abs(slot2.daysStale - 55) < 0.01, `activity is more recent than pool2Since, should win: got ${slot2.daysStale}`);

  // INACTIVE ignores assignment events -- pool2Since is the anchor.
  const events = [assignmentEvent({ id: "e5", customerId: "c3", userId: "u2", slot: 2, createdAt: daysAgo(1) })];
  const withEvent = computeSlotAges([c], [], events, NOW).find((a) => a.slot === 2)!;
  assert.ok(Math.abs(withEvent.daysStale - 70) < 0.01, `INACTIVE anchor unchanged: got ${withEvent.daysStale}`);
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
  // No upper bound: a slot the viewer can't pull themselves stays visible
  // past the pull threshold until it's actually pulled.
  assert.strictEqual(isWarnZone(activeAtPull), true, "past the pull threshold it's still warned until actually pulled");
  assert.strictEqual(isWarnZone({ ...activeJustUnder, daysStale: ACTIVE_PULL_DAYS + 40 }), true);

  const potentialInWarn = { customerId: "x", slot: 1 as const, userId: "u", pool: "INACTIVE" as const, daysStale: POTENTIAL_WARN_DAYS + 1 };
  const potentialAtPull = { ...potentialInWarn, daysStale: POTENTIAL_PULL_DAYS };
  assert.strictEqual(isWarnZone(potentialInWarn), true);
  assert.strictEqual(isStalePastPull(potentialAtPull), true);
  assert.strictEqual(isWarnZone(potentialAtPull), true);
  assert.strictEqual(isWarnZone({ ...potentialInWarn, daysStale: POTENTIAL_WARN_DAYS - 1 }), false);
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

// --- warnZoneSlotsFor: composes age + warn zone + scope, minus pending removals ---
{
  const stale = { assignedToUserId: "sales-a", pool1: "ACTIVE" as const, createdAt: daysAgo(40) };
  const c1 = customer({ id: "w1", ...stale });
  const c2 = customer({ id: "w2", ...stale });
  const users = [{ id: "sales-a", teamId: "team-1" }];
  const viewer = { id: "sales-a", role: "SALESPERSON" as const, teamId: "team-1" };

  const none = warnZoneSlotsFor([c1, c2], [], [], users, viewer, [], NOW);
  assert.deepStrictEqual(none.map((a) => a.customerId).sort(), ["w1", "w2"]);

  // A PENDING removal request on w1/slot 1 drops just that slot.
  const reqs = [removalRequest({ id: "rq1", customerId: "w1", slot: 1 })];
  assert.deepStrictEqual(warnZoneSlotsFor([c1, c2], [], [], users, viewer, reqs, NOW).map((a) => a.customerId), ["w2"]);

  // Resolved requests don't hide anything, nor does one on a different slot.
  const resolved = [removalRequest({ id: "rq2", customerId: "w1", slot: 1, status: "REJECTED" })];
  assert.strictEqual(warnZoneSlotsFor([c1, c2], [], [], users, viewer, resolved, NOW).length, 2);
  const otherSlot = [removalRequest({ id: "rq3", customerId: "w1", slot: 2 })];
  assert.strictEqual(warnZoneSlotsFor([c1, c2], [], [], users, viewer, otherSlot, NOW).length, 2);

  // Not stale enough -> not listed at all.
  const fresh = customer({ id: "w3", assignedToUserId: "sales-a", pool1: "ACTIVE", createdAt: daysAgo(1) });
  assert.strictEqual(warnZoneSlotsFor([fresh], [], [], users, viewer, [], NOW).length, 0);

  // Scoping still applies: another team's slot is invisible to this salesperson.
  const otherPerson = customer({ id: "w4", assignedToUserId: "sales-z", pool1: "ACTIVE", createdAt: daysAgo(40) });
  assert.strictEqual(warnZoneSlotsFor([otherPerson], [], [], users, viewer, [], NOW).length, 0);
}

console.log("inactiveListings.check.ts: all assertions passed");
