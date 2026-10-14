// Self-check for assignments. Run with:
//   node --experimental-strip-types lib/assignments.check.ts
import assert from "node:assert";
import { seatsFromSlots, withSeats } from "./assignments.ts";
import type { Customer } from "./types.ts";

function slots(overrides: Partial<Customer> = {}) {
  return {
    id: "c1",
    assignedToUserId: null, assignedToUserId2: null, assignedToUserId3: null,
    pool1: null, pool2: null, pool3: null,
    pool1Since: null, pool2Since: null, pool3Since: null,
    stage1Id: null, stage2Id: null, stage3Id: null,
    ...overrides,
  };
}

// --- only populated slots become seats, in slot order, carrying pool/since/stage ---
{
  const seats = seatsFromSlots(
    slots({ assignedToUserId: "u1", pool1: "ACTIVE", stage1Id: "s1", assignedToUserId3: "u3", pool3: "INACTIVE", pool3Since: "2026-01-01T00:00:00Z", stage3Id: "s3" }),
    (id) => (id === "u1" ? "t1" : null)
  );
  assert.deepStrictEqual(seats.map((s) => s.slot), [1, 3], "empty slot 2 is skipped");
  assert.deepStrictEqual(seats[0], { id: "c1:1", customerId: "c1", teamId: "t1", slot: 1, userId: "u1", pool: "ACTIVE", poolSince: null, stageId: "s1" });
  assert.strictEqual(seats[1].teamId, null, "assignee with no team -> null teamId, seat is still kept");
  assert.strictEqual(seats[1].poolSince, "2026-01-01T00:00:00Z");
  assert.deepStrictEqual(seatsFromSlots(slots(), () => null), [], "no assignees -> no seats");
}

// --- a seat is kept even if its pool/stage are null (assigned but unpooled) ---
{
  const seats = seatsFromSlots(slots({ assignedToUserId2: "u2" }), () => "t");
  assert.strictEqual(seats.length, 1);
  assert.strictEqual(seats[0].pool, null);
  assert.strictEqual(seats[0].stageId, null);
}

// --- withSeats: derives per customer using each user's CURRENT team; does not mutate input ---
{
  const raw = [{ ...fullCustomer("c1"), assignedToUserId: "u1", assignedToUserId2: "u2" }, fullCustomer("c2")];
  const out = withSeats(raw, [{ id: "u1", teamId: "tA" }, { id: "u2", teamId: "tB" }]);
  assert.deepStrictEqual(out[0].assignments.map((s) => [s.userId, s.teamId]), [["u1", "tA"], ["u2", "tB"]]);
  assert.deepStrictEqual(out[1].assignments, []);
  assert.deepStrictEqual(raw[0].assignments, [], "input customers are not mutated");
}

function fullCustomer(id: string): Customer {
  return {
    id, name: "C", email: "", phone: "", assignments: [],
    stage1Id: null, stage2Id: null, stage3Id: null,
    assignedToUserId: null, assignedToUserId2: null, assignedToUserId3: null,
    pool1: null, pool2: null, pool3: null,
    pool1Since: null, pool2Since: null, pool3Since: null,
    sourceId: null, areaId: null, subAreaId: null, propertyTypeId: null, purposeId: null,
    businessIndustryId: null, businessCategoryId: null, businessTypeId: null,
    raceId: null, languageId: null, businessName: "",
    firsttimeBranchId: null, targetRaceId: null, targetTypeId: null, budgetMin: null, budgetMax: null,
    optionalPhone: "", remark: "", createdBy: null, createdByTeamId: null,
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  };
}

console.log("assignments.check.ts: all assertions passed");
