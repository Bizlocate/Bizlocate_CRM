"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Manager's claim-approval queue: pending "assign these back to me"
 * batches from their own team's salespeople -- deliberately NOT filtered
 * by the customers' own area, since blasting can legitimately cross into
 * areas outside this manager's team (see the design spec).
 */
export default function BlastClaimsBrowser() {
  const { blastClaimRequests, customers, users, currentUser, resolveBlastClaim } = useStore();

  const teamUserIds = new Set(currentUser ? users.filter((u) => u.teamId === currentUser.teamId).map((u) => u.id) : []);
  const pending = blastClaimRequests.filter((r) => r.status === "PENDING" && teamUserIds.has(r.requestedBy));

  function userName(id: string) {
    return users.find((u) => u.id === id)?.name ?? "Unknown";
  }
  function customerName(id: string) {
    return customers.find((c) => c.id === id)?.name ?? "Unknown customer";
  }

  return (
    <div className="card">
      {pending.length === 0 && <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>No pending claim requests.</div>}
      {pending.map((r) => (
        <div key={r.id} style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2" }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{userName(r.requestedBy)} — {r.customerIds.length} customer(s)</div>
          <div style={{ fontSize: 13, color: "#3d4250", marginTop: 6, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {r.customerIds.map((customerId) => (
              <Link key={customerId} href={`/customers/${customerId}`} style={{ color: "inherit", textDecoration: "underline" }}>
                {customerName(customerId)}
              </Link>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "#9aa0ab", marginTop: 6 }}>{formatDate(r.createdAt)}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary" type="button" onClick={() => resolveBlastClaim(r.id, true)}>Approve</button>
            <button className="btn btn-outline" type="button" onClick={() => resolveBlastClaim(r.id, false)}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}
