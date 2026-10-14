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
