import type { SupabaseClient } from "@supabase/supabase-js";
import type { Customer, CustomerAssignment } from "./types";

/** Every customer_assignments row, fetched in pages (an API response is capped, seats can outnumber it). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAllSeatRows(supabase: SupabaseClient): Promise<{ rows: Record<string, any>[]; error: { message: string } | null }> {
  const pageSize = 1000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: Record<string, any>[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from("customer_assignments").select("*").order("id").range(from, from + pageSize - 1);
    if (error) return { rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return { rows, error: null };
  }
}

type SlotFields = Pick<
  Customer,
  | "id"
  | "assignedToUserId" | "assignedToUserId2" | "assignedToUserId3"
  | "pool1" | "pool2" | "pool3"
  | "pool1Since" | "pool2Since" | "pool3Since"
  | "stage1Id" | "stage2Id" | "stage3Id"
>;

/**
 * TEST SUPPORT (the *.check.ts fixture builders): one seat per populated
 * flat slot, slot ascending, so fixtures can still be written with the old
 * slot fields. Production code never calls this -- seats come from the
 * customer_assignments table. Removed together with the flat fields in Phase 4.
 */
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

/** Copies of `customers` whose `assignments` are that customer's seat rows (slot, then team, ascending). */
export function attachSeats(customers: Customer[], seats: CustomerAssignment[]): Customer[] {
  const byCustomer = new Map<string, CustomerAssignment[]>();
  for (const s of seats) {
    const list = byCustomer.get(s.customerId) ?? [];
    list.push(s);
    byCustomer.set(s.customerId, list);
  }
  return customers.map((c) => ({
    ...c,
    assignments: (byCustomer.get(c.id) ?? []).slice().sort((a, b) => a.slot - b.slot || a.teamId.localeCompare(b.teamId)),
  }));
}
