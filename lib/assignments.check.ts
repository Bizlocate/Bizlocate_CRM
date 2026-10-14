// Self-check for assignments. Run with:
//   node --experimental-strip-types lib/assignments.check.ts
import assert from "node:assert";
import { attachSeats, seatsFromSlots } from "./assignments.ts";
import type { Customer, CustomerAssignment } from "./types.ts";

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

function seat(overrides: Partial<CustomerAssignment> & { id: string; customerId: string }): CustomerAssignment {
  return { teamId: "t1", slot: 1, userId: "u1", pool: "ACTIVE", poolSince: null, stageId: null, ...overrides };
}

// --- seatsFromSlots (test support): only populated slots, in slot order ---
{
  const seats = seatsFromSlots(
    slots({ assignedToUserId: "u1", pool1: "ACTIVE", stage1Id: "s1", assignedToUserId3: "u3", pool3: "INACTIVE", pool3Since: "2026-01-01T00:00:00Z", stage3Id: "s3" }),
    () => "t1"
  );
  assert.deepStrictEqual(seats.map((s) => s.slot), [1, 3], "empty slot 2 is skipped");
  assert.deepStrictEqual(seats[0], { id: "c1:1", customerId: "c1", teamId: "t1", slot: 1, userId: "u1", pool: "ACTIVE", poolSince: null, stageId: "s1" });
  assert.strictEqual(seats[1].poolSince, "2026-01-01T00:00:00Z");
  assert.deepStrictEqual(seatsFromSlots(slots(), () => "t1"), [], "no assignees -> no seats");
}

// --- attachSeats: groups by customer, sorts by slot then team, leaves customers without seats empty, does not mutate input ---
{
  const raw = [fullCustomer("c1"), fullCustomer("c2"), fullCustomer("c3")];
  const out = attachSeats(raw, [
    seat({ id: "a", customerId: "c1", teamId: "tB", slot: 2, userId: "u2" }),
    seat({ id: "b", customerId: "c1", teamId: "tA", slot: 2, userId: "u3" }),
    seat({ id: "c", customerId: "c1", teamId: "tA", slot: 1, userId: "u1" }),
    seat({ id: "d", customerId: "c2", teamId: "tA", slot: 1, userId: "u4" }),
    seat({ id: "e", customerId: "ghost", teamId: "tA", slot: 1, userId: "u5" }),
  ]);
  assert.deepStrictEqual(out[0].assignments.map((s) => s.id), ["c", "b", "a"], "slot asc, then team id");
  assert.deepStrictEqual(out[1].assignments.map((s) => s.id), ["d"]);
  assert.deepStrictEqual(out[2].assignments, [], "customer with no seats");
  assert.deepStrictEqual(raw[0].assignments, [], "input customers are not mutated");
}

console.log("assignments.check.ts: all assertions passed");
