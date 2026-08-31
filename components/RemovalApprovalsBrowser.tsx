"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Pending removal-request queue, shared by the Admin
 * (`/admin/remove-approvals`) and Manager (`/team/remove-approvals`)
 * pages. No props needed: `removalRequests` is already fully scoped by
 * its own RLS per session (admin sees every request, a manager sees
 * only requests tied to customers they're already scoped to see), so
 * both callers read the exact same store state and this component only
 * filters to PENDING.
 */
export default function RemovalApprovalsBrowser() {
  const { removalRequests, removalReasons, customers, users, resolveClientRemoval } = useStore();
  const pending = removalRequests.filter((r) => r.status === "PENDING");

  function customerName(customerId: string) {
    return customers.find((c) => c.id === customerId)?.name ?? "Unknown customer";
  }
  function userName(userId: string) {
    return users.find((u) => u.id === userId)?.name ?? "Unknown";
  }
  function reasonName(reasonId: string) {
    return removalReasons.find((r) => r.id === reasonId)?.name ?? "Unknown reason";
  }

  return (
    <div className="card">
      {pending.length === 0 && (
        <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>No pending removal requests.</div>
      )}
      {pending.map((r) => (
        <div key={r.id} style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Link href={`/customers/${r.customerId}`} style={{ color: "inherit" }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{customerName(r.customerId)} — Assigned {r.slot}</div>
            <div style={{ fontSize: 12, color: "#9aa0ab", marginTop: 2 }}>
              {userName(r.requestedBy)} · {reasonName(r.reasonId)} · {formatDate(r.createdAt)}
            </div>
          </Link>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                if (!window.confirm(`Approve removing ${userName(r.requestedBy)} from ${customerName(r.customerId)}? This permanently deletes their activity log for this customer — it can't be undone. (A "Removed" entry stays in Change History.)`)) return;
                resolveClientRemoval(r.id, true);
              }}
            >
              Approve
            </button>
            <button className="btn btn-outline" type="button" onClick={() => resolveClientRemoval(r.id, false)}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}
