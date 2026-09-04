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
 * Area/Member filters are computed client-side from currentUser, same
 * pattern RemovalApprovalsBrowser uses for its Area filter.
 */
export default function InactiveListingsBrowser() {
  const { customers, activities, assignmentEvents, removalRequests, users, areas, currentUser } = useStore();
  const [filterAreaId, setFilterAreaId] = useState("");
  const [filterUserId, setFilterUserId] = useState("");

  const scoped = useMemo(
    () =>
      currentUser
        ? warnZoneSlotsFor(customers, activities, assignmentEvents, users, currentUser, removalRequests)
        : [],
    [customers, activities, assignmentEvents, users, currentUser, removalRequests]
  );

  const showFilters = currentUser?.role !== "SALESPERSON";

  // Id lookups: these run per row *and* per filter-dropdown option (see
  // countForArea/countForMember), so a .find() each would compound badly.
  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);

  function areaIdOf(customerId: string) {
    return customerById.get(customerId)?.areaId ?? null;
  }
  function userName(userId: string) {
    return userById.get(userId)?.name ?? "Unknown";
  }
  function areaName(customerId: string) {
    const areaId = areaIdOf(customerId);
    return (areaId ? areaById.get(areaId)?.name : null) ?? "—";
  }
  function customerName(customerId: string) {
    return customerById.get(customerId)?.name ?? "Unknown customer";
  }
  function businessName(customerId: string) {
    return customerById.get(customerId)?.businessName || "—";
  }

  // Manager's dropdowns are scoped to their own team, same as
  // RemovalApprovalsBrowser's Area filter.
  const areaOptions = currentUser?.role === "MANAGER" ? areas.filter((a) => a.teamId === currentUser.teamId) : areas;
  const memberOptions = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === "MANAGER") return users.filter((u) => u.teamId === currentUser.teamId && u.role === "SALESPERSON");
    return users.filter((u) => u.role === "SALESPERSON");
  }, [users, currentUser]);

  const filtered = scoped.filter((age) => {
    if (filterAreaId && areaIdOf(age.customerId) !== filterAreaId) return false;
    if (filterUserId && age.userId !== filterUserId) return false;
    return true;
  });

  const activeRows = filtered.filter((a) => a.pool === "ACTIVE").sort((a, b) => b.daysStale - a.daysStale);
  const potentialRows = filtered.filter((a) => a.pool === "INACTIVE").sort((a, b) => b.daysStale - a.daysStale);

  function countForArea(areaId: string) {
    return scoped.filter((age) => areaIdOf(age.customerId) === areaId && (!filterUserId || age.userId === filterUserId)).length;
  }
  function countForMember(userId: string) {
    return scoped.filter((age) => age.userId === userId && (!filterAreaId || areaIdOf(age.customerId) === filterAreaId)).length;
  }
  const allAreasCount = scoped.filter((age) => !filterUserId || age.userId === filterUserId).length;
  const allMembersCount = scoped.filter((age) => !filterAreaId || areaIdOf(age.customerId) === filterAreaId).length;

  function Section({ title, rows }: { title: string; rows: SlotAge[] }) {
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>{title}</div>
        <div className="card">
          {rows.length === 0 && (
            <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>Nothing here.</div>
          )}
          {rows.map((r) => (
            <div key={`${r.customerId}-${r.slot}`} style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
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
          <div style={{ maxWidth: 260, flex: 1 }}>
            <label className="field-label">Area</label>
            <select className="field-input" value={filterAreaId} onChange={(e) => setFilterAreaId(e.target.value)}>
              <option value="">All areas ({allAreasCount})</option>
              {areaOptions.map((a) => <option key={a.id} value={a.id}>{a.name} ({countForArea(a.id)})</option>)}
            </select>
          </div>
          <div style={{ maxWidth: 260, flex: 1 }}>
            <label className="field-label">Member</label>
            <select className="field-input" value={filterUserId} onChange={(e) => setFilterUserId(e.target.value)}>
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
