import type { BlastItem, BlastRequest, Customer } from "./types";

export const BLAST_BATCH_SIZE = 50;
export const BLAST_UNLOCK_DONE_RATIO = 0.2;
export const BLAST_UNLOCKED_EXPIRY_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type BlastCriteria = Pick<
  BlastRequest,
  "businessNameKeyword" | "areaId" | "subAreaId" | "businessIndustryId" | "businessCategoryId" | "businessTypeId"
>;

/** AND-match across whichever criteria fields are filled; a blank field means "match all" for that dimension. */
export function matchesBlastCriteria(customer: Customer, criteria: BlastCriteria): boolean {
  if (criteria.businessNameKeyword && !customer.businessName.toLowerCase().includes(criteria.businessNameKeyword.toLowerCase())) {
    return false;
  }
  if (criteria.areaId && customer.areaId !== criteria.areaId) return false;
  if (criteria.subAreaId && customer.subAreaId !== criteria.subAreaId) return false;
  if (criteria.businessIndustryId && customer.businessIndustryId !== criteria.businessIndustryId) return false;
  if (criteria.businessCategoryId && customer.businessCategoryId !== criteria.businessCategoryId) return false;
  if (criteria.businessTypeId && customer.businessTypeId !== criteria.businessTypeId) return false;
  return true;
}

export function matchingCustomers(customers: Customer[], criteria: BlastCriteria): Customer[] {
  return customers.filter((c) => matchesBlastCriteria(c, criteria));
}

/** Newest-customer-first sample of up to `count` matching customers, drawn once at approve time. */
export function sampleForApproval(customers: Customer[], criteria: BlastCriteria, count: number): Customer[] {
  return matchingCustomers(customers, criteria)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, count);
}

/** Splits a drawn sample into 1-indexed batches of BLAST_BATCH_SIZE, in the order given. */
export function splitIntoBatches(customerIds: string[]): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < customerIds.length; i += BLAST_BATCH_SIZE) {
    batches.push(customerIds.slice(i, i + BLAST_BATCH_SIZE));
  }
  return batches;
}

export interface BlastSweepResult {
  toUnlock: string[]; // blast_items ids whose batch should unlock now
  toExpireItems: string[]; // blast_items ids to flip to EXPIRED
  toExpireRequests: string[]; // blast_requests ids to flip to EXPIRED
}

/**
 * Compute-on-load sweep, same shape as sweepStalePool in lib/store.tsx: a
 * pure computation over a snapshot -- the caller does the actual setState +
 * Supabase writes. Three rules per request, evaluated per batch in
 * ascending batch_index order (see the design spec's "Unlock / expiry
 * mechanics" section):
 *  1. If a locked-queue deadline has passed (now - resolved_at >=
 *     locked_expiry_days) while any batch is still locked, the WHOLE
 *     request expires -- every still-locked item across every batch is
 *     flipped, and no unlock/7-day check runs for this request at all.
 *  2. Otherwise, an already-unlocked batch expires 7 days after its own
 *     unlocked_at, regardless of done status.
 *  3. Otherwise, an unlocked batch at >=20% done unlocks the next batch
 *     (only if that next batch is still locked).
 */
export function computeBlastSweep(requests: BlastRequest[], items: BlastItem[], now: number = Date.now()): BlastSweepResult {
  const toUnlock: string[] = [];
  const toExpireItems: string[] = [];
  const toExpireRequests: string[] = [];

  for (const req of requests) {
    if (req.status !== "APPROVED") continue;
    const reqItems = items.filter((i) => i.blastRequestId === req.id);
    const batchIndexes = Array.from(new Set(reqItems.map((i) => i.batchIndex))).sort((a, b) => a - b);

    const hasLockedBatch = batchIndexes.some((bi) => !reqItems.find((i) => i.batchIndex === bi)!.unlockedAt);
    if (hasLockedBatch && req.lockedExpiryDays != null && req.resolvedAt) {
      const deadline = new Date(req.resolvedAt).getTime() + req.lockedExpiryDays * DAY_MS;
      if (now >= deadline) {
        toExpireRequests.push(req.id);
        for (const item of reqItems) {
          if (!item.unlockedAt && item.status !== "EXPIRED") toExpireItems.push(item.id);
        }
        continue; // whole request expired -- skip unlock/7-day checks below
      }
    }

    for (const batchIndex of batchIndexes) {
      const batchItems = reqItems.filter((i) => i.batchIndex === batchIndex);
      const unlockedAt = batchItems[0]?.unlockedAt;
      if (!unlockedAt) continue; // still locked, deadline not reached above

      if (now - new Date(unlockedAt).getTime() >= BLAST_UNLOCKED_EXPIRY_DAYS * DAY_MS) {
        for (const item of batchItems) {
          if (item.status !== "EXPIRED") toExpireItems.push(item.id);
        }
        continue;
      }

      const doneCount = batchItems.filter((i) => i.status === "DONE").length;
      if (doneCount / batchItems.length >= BLAST_UNLOCK_DONE_RATIO) {
        const nextBatch = reqItems.filter((i) => i.batchIndex === batchIndex + 1);
        if (nextBatch.length > 0 && !nextBatch[0].unlockedAt) {
          toUnlock.push(...nextBatch.map((i) => i.id));
        }
      }
    }
  }
  return { toUnlock, toExpireItems, toExpireRequests };
}

/** Items a salesperson currently sees on their own /blasting list: their own request, unlocked, not expired. */
export function visibleBlastItemsFor(items: BlastItem[], requests: BlastRequest[], userId: string): BlastItem[] {
  const ownRequestIds = new Set(
    requests.filter((r) => r.salespersonId === userId && r.status === "APPROVED").map((r) => r.id)
  );
  return items.filter((i) => ownRequestIds.has(i.blastRequestId) && i.unlockedAt && i.status !== "EXPIRED");
}
