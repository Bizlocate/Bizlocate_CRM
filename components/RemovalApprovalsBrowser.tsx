"use client";

import { useState } from "react";
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
  const { removalRequests, removalReasons, customers, users, areas, currentUser, resolveClientRemoval } = useStore();
  const [filterAreaId, setFilterAreaId] = useState("");
  const pending = removalRequests.filter((r) => r.status === "PENDING");

  // Admin picks from every area; a manager's dropdown is scoped to only the
  // areas their own team owns (same area<->team link the assignee-scoping
  // sweep uses), since that's the slice of the company they're responsible for.
  const areaOptions = currentUser?.role === "MANAGER" ? areas.filter((a) => a.teamId === currentUser.teamId) : areas;

  function customerName(customerId: string) {
    return customers.find((c) => c.id === customerId)?.name ?? "Unknown customer";
  }
  function customerAreaId(customerId: string) {
    return customers.find((c) => c.id === customerId)?.areaId ?? null;
  }
  function userName(userId: string) {
    return users.find((u) => u.id === userId)?.name ?? "Unknown";
  }
  function reasonName(reasonId: string) {
    return removalReasons.find((r) => r.id === reasonId)?.name ?? "Unknown reason";
  }

  const filtered = filterAreaId ? pending.filter((r) => customerAreaId(r.customerId) === filterAreaId) : pending;

  // A native <select>'s <option> can't carry a colored badge -- append the
  // count as plain text instead (matches how counts already read elsewhere
  // in this app, e.g. "Total Customer : N").
  function pendingCountForArea(areaId: string) {
    return pending.filter((r) => customerAreaId(r.customerId) === areaId).length;
  }

  return (
    <div>
      <div style={{ marginBottom: 12, maxWidth: 260 }}>
        <label className="field-label">Area</label>
        <select className="field-input" value={filterAreaId} onChange={(e) => setFilterAreaId(e.target.value)}>
          <option value="">All areas ({pending.length})</option>
          {areaOptions.map((a) => <option key={a.id} value={a.id}>{a.name} ({pendingCountForArea(a.id)})</option>)}
        </select>
      </div>
      <div className="card">
        {filtered.length === 0 && (
          <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>
            {pending.length === 0 ? "No pending removal requests." : "No pending removal requests in this area."}
          </div>
        )}
        {filtered.map((r) => (
          <div key={r.id} style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <Link href={`/customers/${r.customerId}`} style={{ color: "inherit" }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{userName(r.requestedBy)} — {customerName(r.customerId)}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#3d4250", marginTop: 3 }}>{reasonName(r.reasonId)}</div>
              <div style={{ fontSize: 12, color: "#9aa0ab", marginTop: 3 }}>{formatDate(r.createdAt)}</div>
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
    </div>
  );
}
