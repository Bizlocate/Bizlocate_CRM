// Self-check for blasting. Run with:
//   node --experimental-strip-types lib/blasting.check.ts
import assert from "node:assert";
import { seatsFromSlots } from "./assignments.ts";
import { matchesBlastCriteria, hasOpenBlastItem } from "./blasting.ts";
import type { BlastItem, BlastRequest, Customer } from "./types.ts";

function customer(overrides: Partial<Customer> & { id: string; createdAt: string }): Customer {
  const base: Customer = {
    name: "C", email: "", phone: "",
    stage1Id: null, stage2Id: null, stage3Id: null,
    assignedToUserId: null, assignedToUserId2: null, assignedToUserId3: null,
    pool1: null, pool2: null, pool3: null,
    pool1Since: null, pool2Since: null, pool3Since: null,
    sourceId: null, areaId: null, subAreaId: null, propertyTypeId: null, purposeId: null,
    businessIndustryId: null, businessCategoryId: null, businessTypeId: null,
    raceId: null, languageId: null, businessName: "",
    firsttimeBranchId: null, targetRaceId: null, targetTypeId: null, budgetMin: null, budgetMax: null,
    optionalPhone: "", remark: "", createdBy: null, createdByTeamId: null,
    updatedAt: overrides.createdAt,
    assignments: [],
    ...overrides,
  };
  return { ...base, assignments: overrides.assignments ?? seatsFromSlots(base, () => null) };
}

const noRangeCriteria = { businessNameKeyword: null, areaId: null, subAreaId: null, businessIndustryId: null, businessCategoryId: null, businessTypeId: null, createdFrom: null, createdTo: null };

// --- createdFrom/createdTo: both ends inclusive, blank end means unbounded ---
// Boundaries built the same way matchesBlastCriteria parses them (bare
// "YYYY-MM-DDT..." -> local time) so this check doesn't depend on the
// runner's timezone matching a hardcoded UTC offset.
{
  const inside = customer({ id: "c1", createdAt: new Date("2026-05-15T10:00:00").toISOString() });
  const before = customer({ id: "c2", createdAt: new Date(new Date("2026-01-01T00:00:00").getTime() - 1000).toISOString() });
  const after = customer({ id: "c3", createdAt: new Date(new Date("2026-08-31T23:59:59.999").getTime() + 1000).toISOString() });
  const onFromEdge = customer({ id: "c4", createdAt: new Date("2026-01-01T00:00:00").toISOString() });
  const onToEdge = customer({ id: "c5", createdAt: new Date("2026-08-31T23:59:00").toISOString() });
  const range = { ...noRangeCriteria, createdFrom: "2026-01-01", createdTo: "2026-08-31" };

  assert.strictEqual(matchesBlastCriteria(inside, range), true);
  assert.strictEqual(matchesBlastCriteria(before, range), false, "before createdFrom -> excluded");
  assert.strictEqual(matchesBlastCriteria(after, range), false, "after createdTo -> excluded");
  assert.strictEqual(matchesBlastCriteria(onFromEdge, range), true, "createdFrom is inclusive");
  assert.strictEqual(matchesBlastCriteria(onToEdge, range), true, "createdTo is inclusive (whole day)");

  // Only one end set -> the other side is unbounded.
  const fromOnly = { ...noRangeCriteria, createdFrom: "2026-06-01" };
  assert.strictEqual(matchesBlastCriteria(after, fromOnly), true, "well after createdFrom, no createdTo -> included");
  assert.strictEqual(matchesBlastCriteria(before, fromOnly), false, "well before createdFrom -> excluded");
  const toOnly = { ...noRangeCriteria, createdTo: "2026-01-15" };
  assert.strictEqual(matchesBlastCriteria(before, toOnly), true, "well before createdTo, no createdFrom -> included");
  assert.strictEqual(matchesBlastCriteria(after, toOnly), false, "well after createdTo -> excluded");

  // Neither set -> matches everything, same as before this feature existed.
  assert.strictEqual(matchesBlastCriteria(before, noRangeCriteria), true);
  assert.strictEqual(matchesBlastCriteria(after, noRangeCriteria), true);
}

// --- hasOpenBlastItem: approved request + unlocked + not expired, for the right user + customer ---
{
  const req = (overrides: Partial<BlastRequest> = {}): BlastRequest => ({
    id: "r1", requestedBy: "mgr", salespersonId: "sp1",
    businessNameKeyword: null, areaId: null, subAreaId: null,
    businessIndustryId: null, businessCategoryId: null, businessTypeId: null,
    createdFrom: null, createdTo: null,
    status: "APPROVED", approvedTotal: 10, lockedExpiryDays: 7,
    resolvedBy: "admin", resolvedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  });
  const item = (overrides: Partial<BlastItem> = {}): BlastItem => ({
    id: "i1", blastRequestId: "r1", customerId: "c1", batchIndex: 1,
    unlockedAt: "2026-01-02T00:00:00Z", status: "PENDING", remark: null, doneAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  });

  assert.strictEqual(hasOpenBlastItem([item()], [req()], "sp1", "c1"), true, "unlocked pending item -> access");
  assert.strictEqual(hasOpenBlastItem([item({ status: "DONE" })], [req()], "sp1", "c1"), true, "DONE item still accessible until batch expires");
  assert.strictEqual(hasOpenBlastItem([item({ unlockedAt: null })], [req()], "sp1", "c1"), false, "locked batch -> no access");
  assert.strictEqual(hasOpenBlastItem([item({ status: "EXPIRED" })], [req()], "sp1", "c1"), false, "expired item -> no access");
  assert.strictEqual(hasOpenBlastItem([item()], [req({ status: "REJECTED" })], "sp1", "c1"), false, "request not APPROVED -> no access");
  assert.strictEqual(hasOpenBlastItem([item()], [req({ status: "EXPIRED" })], "sp1", "c1"), false, "request EXPIRED -> no access");
  assert.strictEqual(hasOpenBlastItem([item()], [req()], "sp2", "c1"), false, "other salesperson -> no access");
  assert.strictEqual(hasOpenBlastItem([item()], [req()], "sp1", "c2"), false, "other customer -> no access");
}

console.log("blasting.check.ts: all assertions passed");
