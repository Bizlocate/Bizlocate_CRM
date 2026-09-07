"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { matchingCustomers } from "@/lib/blasting";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

/** Admin's approval queue for pending blast requests -- one live matching count per row, computed client-side against the already-loaded customers array (same approach the rest of this app already uses, no new server aggregation). */
export default function BlastApprovalsBrowser() {
  const { blastRequests, customers, users, areas, subAreas, businessTagIndustries, businessTagCategories, businessTagTypes, resolveBlastRequest } = useStore();
  const pending = blastRequests.filter((r) => r.status === "PENDING");
  const [approvedTotalDrafts, setApprovedTotalDrafts] = useState<Record<string, number>>({});
  const [lockedExpiryDrafts, setLockedExpiryDrafts] = useState<Record<string, number>>({});

  function userName(id: string) {
    return users.find((u) => u.id === id)?.name ?? "Unknown";
  }
  function lookupName(list: { id: string; name: string }[], id: string | null) {
    return id ? list.find((x) => x.id === id)?.name ?? "Unknown" : "All";
  }

  function criteriaSummary(r: (typeof pending)[number]) {
    const parts = [
      r.businessNameKeyword ? `"${r.businessNameKeyword}"` : null,
      r.areaId ? `Area: ${lookupName(areas, r.areaId)}` : null,
      r.subAreaId ? `Sub-area: ${lookupName(subAreas, r.subAreaId)}` : null,
      r.businessIndustryId ? `Industry: ${lookupName(businessTagIndustries, r.businessIndustryId)}` : null,
      r.businessCategoryId ? `Category: ${lookupName(businessTagCategories, r.businessCategoryId)}` : null,
      r.businessTypeId ? `Type: ${lookupName(businessTagTypes, r.businessTypeId)}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "All customers";
  }

  return (
    <div className="card">
      {pending.length === 0 && <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>No pending blast requests.</div>}
      {pending.map((r) => {
        const matchCount = matchingCustomers(customers, r).length;
        const approvedTotal = approvedTotalDrafts[r.id] ?? matchCount;
        const lockedExpiryDays = lockedExpiryDrafts[r.id] ?? 7;
        return (
          <div key={r.id} style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2" }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{userName(r.requestedBy)} → {userName(r.salespersonId)}</div>
            <div style={{ fontSize: 13, color: "#3d4250", marginTop: 3 }}>{criteriaSummary(r)}</div>
            <div style={{ fontSize: 12, color: "#9aa0ab", marginTop: 3 }}>{matchCount} matching customers · {formatDate(r.createdAt)}</div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginTop: 10, flexWrap: "wrap" }}>
              <div>
                <label className="field-label">Approve how many</label>
                <input
                  className="field-input"
                  type="number"
                  min={0}
                  max={matchCount}
                  value={approvedTotal}
                  onChange={(e) => setApprovedTotalDrafts((prev) => ({ ...prev, [r.id]: Number(e.target.value) }))}
                  style={{ width: 100 }}
                />
              </div>
              <div>
                <label className="field-label">Locked batch expiry (days)</label>
                <input
                  className="field-input"
                  type="number"
                  min={1}
                  value={lockedExpiryDays}
                  onChange={(e) => setLockedExpiryDrafts((prev) => ({ ...prev, [r.id]: Number(e.target.value) }))}
                  style={{ width: 100 }}
                />
              </div>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  if (!window.confirm(`Approve blasting ${approvedTotal} customers to ${userName(r.salespersonId)}?`)) return;
                  resolveBlastRequest(r.id, { approve: true, approvedTotal, lockedExpiryDays });
                }}
              >
                Approve
              </button>
              <button className="btn btn-outline" type="button" onClick={() => resolveBlastRequest(r.id, { approve: false })}>Reject</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
