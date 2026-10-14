"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { ACTIVE_WARN_DAYS, POTENTIAL_WARN_DAYS, SlotAge, warnZoneSlotsFor } from "@/lib/inactiveListings";

/**
 * Warns before the active-pool 30-day / potential-pool 60-day auto-pull
 * sweep (sweepStalePool in lib/store.tsx) reaches a slot: active pool from
 * day 25, potential pool from day 50. One shared component behind the
 * single /inactive-listings route for every role -- scoping and the
 * filters are computed client-side from currentUser: a manager filters by
 * Member, an admin by Team | Member, a salesperson sees no filter.
 */
export default function InactiveListingsBrowser() {
  const { customers, activities, assignmentEvents, removalRequests, users, teams, areas, currentUser, tasks } = useStore();
  const [filterTeamId, setFilterTeamId] = useState("");
  const [filterUserId, setFilterUserId] = useState("");

  const scoped = useMemo(
    () =>
      currentUser
        ? warnZoneSlotsFor(customers, activities, assignmentEvents, users, currentUser, removalRequests, tasks)
        : [],
    [customers, activities, assignmentEvents, users, currentUser, removalRequests, tasks]
  );

  const showFilters = currentUser?.role !== "SALESPERSON";
  const isAdmin = currentUser?.role === "ADMIN";

  // Id lookups: these run per row *and* per filter-dropdown option (see
  // countForTeam/countForMember), so a .find() each would compound badly.
  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);

  function teamIdOf(userId: string) {
    return userById.get(userId)?.teamId ?? null;
  }
  function userName(userId: string) {
    return userById.get(userId)?.name ?? "Unknown";
  }
  function areaName(customerId: string) {
    const areaId = customerById.get(customerId)?.areaId;
    return (areaId ? areaById.get(areaId)?.name : null) ?? "—";
  }
  function customerName(customerId: string) {
    return customerById.get(customerId)?.name ?? "Unknown customer";
  }
  function businessName(customerId: string) {
    return customerById.get(customerId)?.businessName || "—";
  }

  // A manager picks among their own team; an admin among everyone, narrowed
  // by the Team filter (admins never hold seats, so they are left out).
  const memberOptions = useMemo(() => {
    if (!currentUser) return [];
    const pool = currentUser.role === "MANAGER" ? users.filter((u) => u.teamId === currentUser.teamId) : users;
    return pool.filter((u) => u.role !== "ADMIN" && (!filterTeamId || u.teamId === filterTeamId));
  }, [users, currentUser, filterTeamId]);

  // Switching team can drop the previously-picked member out of the list:
  // fall back to "All members" instead of silently filtering by a hidden id.
  const selectedUserId = filterUserId && memberOptions.some((u) => u.id === filterUserId) ? filterUserId : "";

  const filtered = scoped.filter((age) => {
    if (filterTeamId && teamIdOf(age.userId) !== filterTeamId) return false;
    if (selectedUserId && age.userId !== selectedUserId) return false;
    return true;
  });

  const activeRows = filtered.filter((a) => a.pool === "ACTIVE").sort((a, b) => b.daysStale - a.daysStale);
  const potentialRows = filtered.filter((a) => a.pool === "INACTIVE").sort((a, b) => b.daysStale - a.daysStale);

  function countForTeam(teamId: string) {
    return scoped.filter((age) => teamIdOf(age.userId) === teamId && (!selectedUserId || age.userId === selectedUserId)).length;
  }
  function countForMember(userId: string) {
    return scoped.filter((age) => age.userId === userId).length;
  }
  const allTeamsCount = scoped.filter((age) => !selectedUserId || age.userId === selectedUserId).length;
  const allMembersCount = scoped.filter((age) => !filterTeamId || teamIdOf(age.userId) === filterTeamId).length;

  function Section({ title, rows }: { title: string; rows: SlotAge[] }) {
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>{title}</div>
        <div className="card">
          {rows.length === 0 && (
            <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>Nothing here.</div>
          )}
          {rows.map((r) => (
            <div key={`${r.customerId}-${r.userId}`} style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <Link href={`/customers/${r.customerId}`} style={{ color: "inherit" }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{customerName(r.customerId)} — {businessName(r.customerId)}</div>
                <div style={{ fontSize: 12, color: "#9aa0ab", marginTop: 3 }}>
                  {areaName(r.customerId)}
                  {showFilters ? ` · ${userName(r.userId)}` : ""}
                </div>
              </Link>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#a13a2b" }}>{Math.floor(r.daysStale)} days</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {showFilters && (
        <div style={{ marginBottom: 16, display: "flex", gap: 12 }}>
          {isAdmin && (
            <div style={{ maxWidth: 260, flex: 1 }}>
              <label className="field-label">Team</label>
              <select className="field-input" value={filterTeamId} onChange={(e) => setFilterTeamId(e.target.value)}>
                <option value="">All teams ({allTeamsCount})</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name} ({countForTeam(t.id)})</option>)}
              </select>
            </div>
          )}
          <div style={{ maxWidth: 260, flex: 1 }}>
            <label className="field-label">Member</label>
            <select className="field-input" value={selectedUserId} onChange={(e) => setFilterUserId(e.target.value)}>
              <option value="">All members ({allMembersCount})</option>
              {memberOptions.map((u) => <option key={u.id} value={u.id}>{u.name} ({countForMember(u.id)})</option>)}
            </select>
          </div>
        </div>
      )}
      <Section title={`Active Pool — ${ACTIVE_WARN_DAYS}+ days no update`} rows={activeRows} />
      <Section title={`Potential Pool — ${POTENTIAL_WARN_DAYS}+ days no update`} rows={potentialRows} />
    </div>
  );
}
