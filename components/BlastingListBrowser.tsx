"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";

/**
 * A salesperson's own blasting list -- grouped by batch (50 customers
 * each), only unlocked/unexpired items shown per batch, with a batch tab
 * row so the salesperson knows more is queued up. Locked batches' items
 * ARE fetched (RLS allows it -- they belong to this salesperson's own
 * request) but filtered out of what's rendered here.
 */
export default function BlastingListBrowser() {
  const { blastItems, blastRequests, customers, currentUser, markBlastItemDone, requestBlastClaim } = useStore();
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeBatch, setActiveBatch] = useState<number | null>(null);

  const myItems = useMemo(() => {
    if (!currentUser) return [];
    const ownRequestIds = new Set(
      blastRequests.filter((r) => r.salespersonId === currentUser.id && r.status === "APPROVED").map((r) => r.id)
    );
    return blastItems.filter((i) => ownRequestIds.has(i.blastRequestId));
  }, [blastItems, blastRequests, currentUser]);

  const totalBatches = Array.from(new Set(myItems.map((i) => i.batchIndex))).sort((a, b) => a - b);
  const unlockedBatches = totalBatches.filter((bi) => myItems.some((i) => i.batchIndex === bi && i.unlockedAt && i.status !== "EXPIRED"));
  const currentBatch = activeBatch ?? unlockedBatches[0] ?? null;

  const rows = myItems.filter((i) => i.batchIndex === currentBatch && i.unlockedAt && i.status !== "EXPIRED");

  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  function toggleSelected(itemId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function submitClaim() {
    const customerIds = rows.filter((r) => selected.has(r.id)).map((r) => r.customerId);
    if (customerIds.length === 0) return;
    requestBlastClaim(Array.from(new Set(customerIds)));
    setSelected(new Set());
  }

  async function copyPhone(phone: string) {
    try {
      await navigator.clipboard.writeText(phone);
    } catch {
      // clipboard permission denied -- nothing else to do, the number is still visible to copy by hand
    }
  }

  if (!currentUser) return null;

  if (unlockedBatches.length === 0) {
    return <div className="card" style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>No blasting list available right now.</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {totalBatches.map((bi) => {
          const isUnlocked = unlockedBatches.includes(bi);
          return (
            <button
              key={bi}
              type="button"
              className={bi === currentBatch ? "btn btn-primary" : "btn btn-outline"}
              disabled={!isUnlocked}
              onClick={() => setActiveBatch(bi)}
            >
              Batch {bi}{!isUnlocked ? " (locked)" : ""}
            </button>
          );
        })}
      </div>

      <div className="card">
        {rows.length === 0 && <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>Nothing in this batch.</div>}
        {rows.map((item) => {
          const customer = customerById.get(item.customerId);
          if (!customer) return null;
          const draft = remarkDrafts[item.id] ?? item.remark ?? "";
          return (
            <div key={item.id} style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2", display: "flex", alignItems: "center", gap: 12 }}>
              <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelected(item.id)} />
              <Link href={`/customers/${customer.id}`} style={{ color: "inherit", minWidth: 160 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{customer.name}</div>
                <div style={{ fontSize: 12, color: "#9aa0ab", marginTop: 2 }}>{item.status === "DONE" ? "Done" : "Pending"}</div>
              </Link>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{customer.phone}</div>
              <button className="btn btn-outline" type="button" onClick={() => copyPhone(customer.phone)}>Copy</button>
              <input
                className="field-input"
                style={{ flex: 1, minWidth: 160 }}
                placeholder="Remark…"
                value={draft}
                onChange={(e) => setRemarkDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
              />
              <button className="btn btn-outline" type="button" onClick={() => markBlastItemDone(item.id, draft)}>Save</button>
            </div>
          );
        })}
      </div>

      {rows.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button className="btn btn-primary" type="button" disabled={selected.size === 0} onClick={submitClaim}>
            Request Assign to Me ({selected.size})
          </button>
        </div>
      )}
    </div>
  );
}
