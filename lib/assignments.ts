import type { Customer, CustomerAssignment, User } from "./types";

type SlotFields = Pick<
  Customer,
  | "id"
  | "assignedToUserId" | "assignedToUserId2" | "assignedToUserId3"
  | "pool1" | "pool2" | "pool3"
  | "pool1Since" | "pool2Since" | "pool3Since"
  | "stage1Id" | "stage2Id" | "stage3Id"
>;

/**
 * Seats of one customer, derived from its flat slot columns: one per
 * populated slot, slot ascending. `teamIdOf` resolves an assignee's team (null
 * when they have none). Same mapping the customer_assignments DB mirror uses
 * (seat number = slot number), minus its "no team => no row" rule.
 */
export function seatsFromSlots(c: SlotFields, teamIdOf: (userId: string) => string | null): CustomerAssignment[] {
  const slots = [
    { slot: 1 as const, userId: c.assignedToUserId, pool: c.pool1, poolSince: c.pool1Since, stageId: c.stage1Id },
    { slot: 2 as const, userId: c.assignedToUserId2, pool: c.pool2, poolSince: c.pool2Since, stageId: c.stage2Id },
    { slot: 3 as const, userId: c.assignedToUserId3, pool: c.pool3, poolSince: c.pool3Since, stageId: c.stage3Id },
  ];
  const seats: CustomerAssignment[] = [];
  for (const s of slots) {
    if (!s.userId) continue;
    seats.push({
      id: `${c.id}:${s.slot}`,
      customerId: c.id,
      teamId: teamIdOf(s.userId),
      slot: s.slot,
      userId: s.userId,
      pool: s.pool,
      poolSince: s.poolSince,
      stageId: s.stageId,
    });
  }
  return seats;
}

/** Copies of `customers` whose `assignments` are derived from the flat fields + each user's current team. */
export function withSeats(customers: Customer[], users: Pick<User, "id" | "teamId">[]): Customer[] {
  const teamOf = new Map(users.map((u) => [u.id, u.teamId]));
  return customers.map((c) => ({ ...c, assignments: seatsFromSlots(c, (id) => teamOf.get(id) ?? null) }));
}

export function seatUserIds(c: Pick<Customer, "assignments">): string[] {
  return c.assignments.map((s) => s.userId);
}

export function seatOfUser(c: Pick<Customer, "assignments">, userId: string): CustomerAssignment | undefined {
  return c.assignments.find((s) => s.userId === userId);
}

// ponytail: slot numbers become per-team in Phase 3c (several seats may share a
// number); callers that need "the" slot 1 are revisited in 3c/3d.
export function seatOfSlot(c: Pick<Customer, "assignments">, slot: 1 | 2 | 3): CustomerAssignment | undefined {
  return c.assignments.find((s) => s.slot === slot);
}
