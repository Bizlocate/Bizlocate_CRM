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
 * only requests from their own team), so both callers read the exact
 * same store state and this component only filters to PENDING. A manager
 * filters by Member (the person who asked to be removed), an admin by
 * Team | Member.
 */
export default function RemovalApprovalsBrowser() {
  const { removalRequests, removalReasons, customers, users, teams, currentUser, resolveClientRemoval } = useStore();
  const [filterTeamId, setFilterTeamId] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const pending = removalRequests.filter((r) => r.status === "PENDING");
  const isAdmin = currentUser?.role === "ADMIN";

  function customerName(customerId: string) {
    return customers.find((c) => c.id === customerId)?.name ?? "Unknown customer";
  }
  function userName(userId: string) {
    return users.find((u) => u.id === userId)?.name ?? "Unknown";
  }
  function teamIdOf(userId: string) {
    return users.find((u) => u.id === userId)?.teamId ?? null;
  }
  function reasonName(reasonId: string) {
    return removalReasons.find((r) => r.id === reasonId)?.name ?? "Unknown reason";
  }

  // A manager picks among their own team; an admin among everyone, narrowed
  // by the Team filter (admins never hold seats, so they are left out).
  const memberPool = currentUser?.role === "MANAGER" ? users.filter((u) => u.teamId === currentUser.teamId) : users;
  const memberOptions = memberPool.filter((u) => u.role !== "ADMIN" && (!filterTeamId || u.teamId === filterTeamId));
  // Switching team can drop the previously-picked member out of the list:
  // fall back to "All members" instead of silently filtering by a hidden id.
  const selectedUserId = filterUserId && memberOptions.some((u) => u.id === filterUserId) ? filterUserId : "";

  const filtered = pending.filter(
    (r) => (!filterTeamId || teamIdOf(r.requestedBy) === filterTeamId) && (!selectedUserId || r.requestedBy === selectedUserId)
  );

  // A native <select>'s <option> can't carry a colored badge -- append the
  // count as plain text instead (matches how counts already read elsewhere
  // in this app, e.g. "Total Customer : N").
  function pendingCountForTeam(teamId: string) {
    return pending.filter((r) => teamIdOf(r.requestedBy) === teamId && (!selectedUserId || r.requestedBy === selectedUserId)).length;
  }
  function pendingCountForMember(userId: string) {
    return pending.filter((r) => r.requestedBy === userId).length;
  }
  const allTeamsCount = pending.filter((r) => !selectedUserId || r.requestedBy === selectedUserId).length;
  const allMembersCount = pending.filter((r) => !filterTeamId || teamIdOf(r.requestedBy) === filterTeamId).length;

  return (
    <div>
      <div style={{ marginBottom: 12, display: "flex", gap: 12 }}>
        {isAdmin && (
          <div style={{ maxWidth: 260, flex: 1 }}>
            <label className="field-label">Team</label>
            <select className="field-input" value={filterTeamId} onChange={(e) => setFilterTeamId(e.target.value)}>
              <option value="">All teams ({allTeamsCount})</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name} ({pendingCountForTeam(t.id)})</option>)}
            </select>
          </div>
        )}
        <div style={{ maxWidth: 260, flex: 1 }}>
          <label className="field-label">Member</label>
          <select className="field-input" value={selectedUserId} onChange={(e) => setFilterUserId(e.target.value)}>
            <option value="">All members ({allMembersCount})</option>
            {memberOptions.map((u) => <option key={u.id} value={u.id}>{u.name} ({pendingCountForMember(u.id)})</option>)}
          </select>
        </div>
      </div>
      <div className="card">
        {filtered.length === 0 && (
          <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>
            {pending.length === 0 ? "No pending removal requests." : "No pending removal requests for this filter."}
          </div>
        )}
        {filtered.map((r) => (
          <div key={r.id} style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <Link href={`/customers/${r.customerId}`} style={{ color: "inherit" }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{userName(r.requestedBy)} — {customerName(r.customerId)}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#3d4250", marginTop: 3 }}>{reasonName(r.reasonId)}</div>
              {r.note && <div style={{ fontSize: 13, color: "#3d4250", marginTop: 3, whiteSpace: "pre-wrap" }}>{r.note}</div>}
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
