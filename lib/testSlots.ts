// TEST SUPPORT for the *.check.ts fixture builders. Fixtures are still written
// with the old flat slot fields (assignedToUserId, pool1, stage1Id, ...);
// seatsFromSlots turns them into seats. Production code never imports this.
import type { CustomerAssignment, PoolStatus } from "./types";

export interface SlotFields {
  id: string;
  assignedToUserId: string | null;
  assignedToUserId2: string | null;
  assignedToUserId3: string | null;
  pool1: PoolStatus | null;
  pool2: PoolStatus | null;
  pool3: PoolStatus | null;
  pool1Since: string | null;
  pool2Since: string | null;
  pool3Since: string | null;
  stage1Id: string | null;
  stage2Id: string | null;
  stage3Id: string | null;
}

/** One seat per populated flat slot, slot ascending. */
export function seatsFromSlots(c: SlotFields, teamIdOf: (userId: string) => string): CustomerAssignment[] {
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
