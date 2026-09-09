"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import {
  assignToAppointmentDuration,
  assignmentCounts,
  closedDurationBySource,
  createdToClosedBySource,
  leaderboard,
  leadsBySource,
  monthlyTrend,
  pacePct,
  removalCohortBreakdown,
  removalCounts,
  removalReasonBreakdown,
  removalSourceBreakdown,
  scopedUserIds,
  stageFunnel,
  wonAmountInMonth,
} from "@/lib/dashboardMetrics";

// Two data-series colours, both already in the app's palette (brand indigo and
// the Won badge green). Validated as a categorical pair: deutan ΔE 24.8,
// normal-vision ΔE 28.6 — safe to tell apart, unlike the grey/green it replaced
// (grey reads as "disabled" everywhere else in this app).
const BRAND = "#4046c9";
const GREEN = "#1e7a41";
const DANGER = "#a13a2b";
const TRACK = "#eef0f4";

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function yearMonthToDate(yearMonth: string): Date {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

// Each of the 4 sections below (团队表现 / Pipeline & 趋势 / 运营报表 / Sales Performance Tracker)
// owns its own area+month filter so picking one doesn't move another —
// this is the shared control pair they each render in their header.
function AreaFilter({ value, onChange, areas }: { value: string; onChange: (v: string) => void; areas: { id: string; name: string }[] }) {
  if (areas.length === 0) return null;
  return (
    <select className="field-input" style={{ width: 160 }} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">All areas</option>
      {areas.map((a) => (
        <option key={a.id} value={a.id}>{a.name}</option>
      ))}
    </select>
  );
}

function formatMoney(n: number): string {
  return "RM " + n.toLocaleString("en-MY", { maximumFractionDigits: 0 });
}

function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-MY", { month: "short", year: "numeric" });
}

function shortMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-MY", { month: "short" });
}

// Fill turns green once attainment reaches the goal — or, when a pace marker is
// shown, once it's ahead of where the month says it should be.
function ProgressBar({ pct, pace, height = 8 }: { pct: number | null; pace?: number; height?: number }) {
  const filled = Math.min(100, Math.max(0, pct ?? 0));
  const onTrack = pace === undefined ? filled >= 100 : filled >= pace;
  return (
    <div style={{ position: "relative", background: TRACK, borderRadius: 4, height }}>
      <div style={{ background: onTrack ? GREEN : BRAND, borderRadius: 4, height, width: `${filled}%` }} />
      {pace !== undefined && (
        <div
          title={`${pace}% of the month elapsed`}
          style={{ position: "absolute", left: `${Math.min(100, pace)}%`, top: -3, width: 2, height: height + 6, background: DANGER }}
        />
      )}
    </div>
  );
}

// 3-tick y-axis (max / half / 0) for the two trend charts below.
function AxisLabels({ max, format, height }: { max: number; format: (n: number) => string; height: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height, width: 44, flexShrink: 0, textAlign: "right", paddingRight: 8, fontSize: 10, color: "#9aa0ab" }}>
      <span>{format(max)}</span>
      <span>{format(max / 2)}</span>
      <span>0</span>
    </div>
  );
}

function GridLines() {
  return (
    <>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, borderTop: "1px solid #eef0f4" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: "50%", borderTop: "1px dashed #eef0f4" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, borderTop: "1px solid #d7d9de" }} />
    </>
  );
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11.5, fontWeight: 600, color: "#9aa0ab", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 12 }}>
      {children}
    </div>
  );
}

function TargetCell({
  userId,
  yearMonth,
  target,
  onSave,
}: {
  userId: string;
  yearMonth: string;
  target: number | null;
  onSave: (userId: string, yearMonth: string, amount: number) => void;
}) {
  const [value, setValue] = useState(target !== null ? String(target) : "");
  useEffect(() => setValue(target !== null ? String(target) : ""), [target]);
  return (
    <input
      className="field-input"
      style={{ width: 110, padding: "6px 8px", fontSize: 12.5 }}
      type="number"
      min={0}
      placeholder="Set target"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const n = Number(value);
        if (value.trim() !== "" && !Number.isNaN(n) && n >= 0) onSave(userId, yearMonth, n);
      }}
    />
  );
}

export default function DashboardPage() {
  const {
    currentUser,
    users,
    teams,
    areas,
    stages,
    dealClosures,
    activities,
    salesTargets,
    visibleCustomers,
    upsertSalesTarget,
    leadSources,
    removalReasons,
    removalRequests,
    assignmentEvents,
    stageEvents,
  } = useStore();
  // Each section below owns its own area+month (independent filters, per
  // section — picking one doesn't move another).
  const [teamAreaId, setTeamAreaId] = useState("");
  const [teamMonth, setTeamMonth] = useState(currentYearMonth);
  const [pipelineAreaId, setPipelineAreaId] = useState("");
  const [pipelineMonth, setPipelineMonth] = useState(currentYearMonth);
  // Member filter — ADMIN/MANAGER only, "Pipeline & 趋势" only.
  const [memberId, setMemberId] = useState("");
  const [opsAreaId, setOpsAreaId] = useState("");
  const [opsMonth, setOpsMonth] = useState(currentYearMonth);
  const [spAreaId, setSpAreaId] = useState("");
  const [spMonth, setSpMonth] = useState(currentYearMonth);
  // Which trend-chart bar (by yearMonth) is pinned open, showing its exact
  // value above the bar — click/tap toggles, independent per chart.
  const [activeWonMonth, setActiveWonMonth] = useState<string | null>(null);

  const scopedIds = useMemo(() => (currentUser ? scopedUserIds(users, currentUser) : new Set<string>()), [users, currentUser]);
  const scopedDealClosures = useMemo(() => dealClosures.filter((d) => scopedIds.has(d.userId)), [dealClosures, scopedIds]);

  if (!currentUser) return null;

  const canManage = currentUser.role === "ADMIN" || currentUser.role === "MANAGER";
  // ADMIN picks from every area; MANAGER only from areas admin has assigned
  // to their team (Area.teamId) — zero assigned areas means no dropdown at
  // all, since there's nothing to narrow down to. SP never gets one — they
  // only ever see their own scope regardless of area.
  const availableAreas = currentUser.role === "ADMIN" ? areas : areas.filter((a) => a.teamId === currentUser.teamId);
  const customerAreaMap = new Map(visibleCustomers.map((c) => [c.id, c.areaId]));

  // Narrows every list this section reads to one area's customers — ""
  // means all areas, no filtering. Called once per section with that
  // section's own areaId so each has an independent slice of the data.
  function scopeByArea(areaId: string) {
    const inScope = (customerId: string) => !areaId || customerAreaMap.get(customerId) === areaId;
    return {
      customers: areaId ? visibleCustomers.filter((c) => c.areaId === areaId) : visibleCustomers,
      dealClosures: scopedDealClosures.filter((d) => inScope(d.customerId)),
      leaderboardDealClosures: dealClosures.filter((d) => inScope(d.customerId)),
      activities: activities.filter((a) => inScope(a.customerId)),
      assignmentEvents: assignmentEvents.filter((e) => inScope(e.customerId)),
      stageEvents: stageEvents.filter((e) => inScope(e.customerId)),
      removalRequests: removalRequests.filter((r) => inScope(r.customerId)),
    };
  }

  // Reused by 团队表现 and the three ops reports below — active, in-scope,
  // never ADMIN (admins don't carry deals or get assigned customers).
  const teamMembers = users.filter((u) => scopedIds.has(u.id) && u.active && u.role !== "ADMIN");

  const team = scopeByArea(teamAreaId);
  const leaderboardRows = leaderboard(teamMembers, team.leaderboardDealClosures, salesTargets, team.activities, teamMonth);
  const teamWonTotal = leaderboardRows.reduce((sum, r) => sum + r.won, 0);
  const teamTargetTotal = leaderboardRows.reduce((sum, r) => sum + (r.target ?? 0), 0);
  const teamAttainmentPct = teamTargetTotal > 0 ? Math.round((teamWonTotal / teamTargetTotal) * 100) : null;
  const teamPace = pacePct(new Date(), teamMonth);

  // Own-numbers card is a personal snapshot, always the real current month —
  // no filter of its own to keep.
  const thisMonth = currentYearMonth();
  const myWon = wonAmountInMonth(dealClosures.filter((d) => d.userId === currentUser.id), thisMonth);
  const myTarget = salesTargets.find((t) => t.userId === currentUser.id && t.yearMonth === thisMonth)?.amount ?? null;
  const myAttainmentPct = myTarget && myTarget > 0 ? Math.round((myWon / myTarget) * 100) : null;
  const myActivityCount = activities.filter((a) => a.authorUserId === currentUser.id && a.createdAt.slice(0, 7) === thisMonth).length;
  const myPace = pacePct(new Date(), thisMonth);

  // Pipeline & 趋势 filters down further to one member on top of the area
  // filter — "" (All members) leaves the area-level scope untouched. Its
  // month picks which month the 6-month trend windows end at.
  const memberOptions = users.filter((u) => scopedIds.has(u.id) && u.active && u.role !== "ADMIN").sort((a, b) => a.name.localeCompare(b.name));
  const pipeline = scopeByArea(pipelineAreaId);
  const pipelineScopedIds = memberId ? new Set([memberId]) : scopedIds;
  const pipelineCustomers = memberId
    ? pipeline.customers.filter((c) => [c.assignedToUserId, c.assignedToUserId2, c.assignedToUserId3].includes(memberId))
    : pipeline.customers;
  const pipelineDealClosures = memberId ? pipeline.dealClosures.filter((d) => d.userId === memberId) : pipeline.dealClosures;

  const funnel = stageFunnel(pipelineCustomers, stages, pipelineScopedIds);
  const maxFunnelCount = Math.max(1, ...funnel.map((f) => f.count));
  const trend = monthlyTrend(pipelineCustomers, pipelineDealClosures, 6, yearMonthToDate(pipelineMonth));
  const maxTrendWon = Math.max(1, ...trend.map((p) => p.won));

  const ops = scopeByArea(opsAreaId);
  const sourceRows = leadsBySource(ops.customers, leadSources, opsMonth);
  const assignRows = assignmentCounts(teamMembers, ops.assignmentEvents, opsMonth);
  const removedRows = removalCounts(teamMembers, ops.removalRequests, opsMonth);
  const reasonRows = removalReasonBreakdown(ops.removalRequests, removalReasons, opsMonth);
  const removalSourceRows = removalSourceBreakdown(ops.removalRequests, ops.customers, leadSources, opsMonth);
  const removalCohortRows = removalCohortBreakdown(ops.removalRequests, ops.customers, opsMonth);
  const maxSourceCount = Math.max(1, ...sourceRows.map((r) => r.count));

  // Sales Performance Tracker — visible to everyone, not just canManage
  // (teamMembers is just [self] for a SALESPERSON, so this naturally shows
  // their own numbers only; the area filter itself stays canManage-only
  // since a SALESPERSON has no area of their own to narrow by). See
  // dashboardMetrics.ts for why these only have data from whenever
  // stage_events was migrated in, not before.
  const sp = scopeByArea(spAreaId);
  const apptDurationRows = assignToAppointmentDuration(teamMembers, sp.customers, sp.assignmentEvents, sp.stageEvents, stages);
  const closedBySourceRows = closedDurationBySource(sp.dealClosures, sp.customers, sp.assignmentEvents, leadSources, spMonth);
  const createdToClosedRows = createdToClosedBySource(sp.dealClosures, sp.customers, leadSources, spMonth);

  const leaderCols = "1.3fr .8fr .9fr .9fr 1.3fr .5fr";

  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Dashboard</div>

      {canManage && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>团队表现</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <AreaFilter value={teamAreaId} onChange={setTeamAreaId} areas={availableAreas} />
              <input type="month" className="field-input" style={{ width: 150 }} value={teamMonth} onChange={(e) => setTeamMonth(e.target.value)} />
            </div>
          </div>
          <div className="card" style={{ marginBottom: 24 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: leaderCols,
                gap: 10,
                padding: "12px 20px",
                background: "#f7f7f8",
                borderBottom: "1px solid #e2e4e9",
                fontSize: 12,
                fontWeight: 600,
                color: "#6b7280",
                textTransform: "uppercase",
                letterSpacing: ".03em",
              }}
            >
              <div>Name</div>
              <div>Team</div>
              <div>Won</div>
              <div>Target</div>
              <div>Attainment</div>
              <div>Acts</div>
            </div>
            {leaderboardRows.length === 0 && <div style={{ padding: 20, fontSize: 13.5, color: "#9aa0ab" }}>No team members in this scope.</div>}
            {leaderboardRows.map((row) => {
              const rowTeamId = users.find((u) => u.id === row.userId)?.teamId ?? null;
              const rowTeamName = rowTeamId ? teams.find((t) => t.id === rowTeamId)?.name ?? "—" : "—";
              const hit = row.attainmentPct !== null && row.attainmentPct >= 100;
              return (
                <div
                  key={row.userId}
                  style={{ display: "grid", gridTemplateColumns: leaderCols, gap: 10, padding: "12px 20px", alignItems: "center", fontSize: 13, borderBottom: "1px solid #eef0f2" }}
                >
                  <div>{row.name}</div>
                  <div style={{ color: "#6b7280" }}>{rowTeamName}</div>
                  <div>{formatMoney(row.won)}</div>
                  <div>
                    <TargetCell userId={row.userId} yearMonth={teamMonth} target={row.target} onSave={upsertSalesTarget} />
                  </div>
                  {row.attainmentPct !== null ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <div style={{ flex: 1 }}>
                        <ProgressBar pct={row.attainmentPct} />
                      </div>
                      <span style={{ fontSize: 12.5, minWidth: 34, color: hit ? GREEN : "#20222b", fontWeight: hit ? 600 : 400 }}>{row.attainmentPct}%</span>
                    </div>
                  ) : (
                    <div style={{ color: "#9aa0ab", fontSize: 12.5 }}>—</div>
                  )}
                  <div style={{ color: "#6b7280" }}>{row.activityCount}</div>
                </div>
              );
            })}
          </div>

          <div className="card" style={{ padding: "14px 16px 16px", marginBottom: 24 }}>
            <CardLabel>Team total</CardLabel>
            {teamTargetTotal > 0 ? (
              <>
                <ProgressBar pct={teamAttainmentPct} pace={teamPace} />
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 7 }}>
                  {formatMoney(teamWonTotal)} won · {teamAttainmentPct}% of {formatMoney(teamTargetTotal)} target · {teamPace}% of the month elapsed
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: "#9aa0ab" }}>No targets set for this team yet</div>
            )}
          </div>
        </>
      )}

      {currentUser.role !== "ADMIN" && (
        <>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Won this month</div>
          <div className="card" style={{ padding: 20, marginBottom: 24, display: "flex", gap: 40, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 280px" }}>
              <div style={{ fontSize: 22, fontWeight: 700, margin: "2px 0 10px" }}>{formatMoney(myWon)}</div>
              {myTarget && myTarget > 0 ? (
                <>
                  <ProgressBar pct={myAttainmentPct} pace={myPace} />
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 7 }}>
                    {myAttainmentPct}% of {formatMoney(myTarget)} target · {myPace}% of the month elapsed
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: "#9aa0ab" }}>No target set for you this month</div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>My activities logged</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{myActivityCount}</div>
            </div>
          </div>
        </>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Pipeline & 趋势</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canManage && <AreaFilter value={pipelineAreaId} onChange={setPipelineAreaId} areas={availableAreas} />}
          {canManage && (
            <select className="field-input" style={{ width: 200 }} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              <option value="">All members</option>
              {memberOptions.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          )}
          <input
            type="month"
            className="field-input"
            style={{ width: 150 }}
            value={pipelineMonth}
            onChange={(e) => setPipelineMonth(e.target.value)}
            title="6-month trend window ends at this month"
          />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginBottom: 24 }}>
        <div className="card" style={{ padding: "14px 16px" }}>
          <CardLabel>Stage funnel</CardLabel>
          {funnel.length === 0 && <div style={{ fontSize: 13, color: "#9aa0ab" }}>No pipeline stages configured.</div>}
          {funnel.map((f) => {
            const isWon = f.stageName.trim().toLowerCase() === "won";
            const isLost = f.stageName.trim().toLowerCase() === "lost";
            return (
              <div key={f.stageId} style={{ marginBottom: 9 }} title={`${f.stageName}: ${f.count}`}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                  <span>{f.stageName}</span>
                  <span style={{ color: "#6b7280" }}>{f.count}</span>
                </div>
                <div style={{ background: TRACK, borderRadius: 4, height: 8 }}>
                  <div
                    style={{
                      background: isWon ? GREEN : isLost ? DANGER : BRAND,
                      borderRadius: 4,
                      height: 8,
                      width: `${(f.count / maxFunnelCount) * 100}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="card" style={{ padding: "14px 16px" }}>
          <CardLabel>Won $ by month</CardLabel>
          <div style={{ display: "flex", gap: 4 }}>
            <AxisLabels max={maxTrendWon} format={formatMoney} height={100} />
            <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "flex-end", gap: 8, height: 100 }}>
              <GridLines />
              {trend.map((p) => {
                const active = activeWonMonth === p.yearMonth;
                return (
                  <div
                    key={p.yearMonth}
                    role="button"
                    tabIndex={0}
                    aria-label={`${monthLabel(p.yearMonth)}: ${formatMoney(p.won)}`}
                    title={`${monthLabel(p.yearMonth)}: ${formatMoney(p.won)}`}
                    onClick={() => setActiveWonMonth(active ? null : p.yearMonth)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setActiveWonMonth(active ? null : p.yearMonth)}
                    style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", height: "100%", cursor: "pointer", outline: "none" }}
                  >
                    {active && (
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#20222b", marginBottom: 3, whiteSpace: "nowrap" }}>{formatMoney(p.won)}</div>
                    )}
                    <div
                      style={{
                        width: "100%",
                        maxWidth: 34,
                        background: BRAND,
                        opacity: active ? 1 : 0.9,
                        outline: active ? `2px solid ${BRAND}` : "none",
                        outlineOffset: 1,
                        borderRadius: "4px 4px 0 0",
                        height: `${(p.won / maxTrendWon) * 92 + (p.won > 0 ? 4 : 0)}px`,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 6, paddingLeft: 48 }}>
            {trend.map((p) => (
              <div key={p.yearMonth} style={{ flex: 1, textAlign: "center", fontSize: 10.5, color: "#9aa0ab" }}>{shortMonthLabel(p.yearMonth)}</div>
            ))}
          </div>
        </div>
      </div>

      {canManage && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>运营报表</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <AreaFilter value={opsAreaId} onChange={setOpsAreaId} areas={availableAreas} />
              <input type="month" className="field-input" style={{ width: 150 }} value={opsMonth} onChange={(e) => setOpsMonth(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginBottom: 24 }}>
            <div className="card" style={{ padding: "14px 16px" }}>
              <CardLabel>New leads by source</CardLabel>
              {sourceRows.length === 0 && <div style={{ fontSize: 13, color: "#9aa0ab" }}>No new leads this month.</div>}
              {sourceRows.map((r) => (
                <div key={r.id ?? "none"} style={{ marginBottom: 9 }} title={`${r.name}: ${r.count}`}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                    <span>{r.name}</span>
                    <span style={{ color: "#6b7280" }}>{r.count}</span>
                  </div>
                  <div style={{ background: TRACK, borderRadius: 4, height: 8 }}>
                    <div style={{ background: BRAND, borderRadius: 4, height: 8, width: `${(r.count / maxSourceCount) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="card" style={{ padding: "14px 16px" }}>
              <CardLabel>Assigned this month</CardLabel>
              {assignRows.every((r) => r.count === 0) && <div style={{ fontSize: 13, color: "#9aa0ab" }}>No assignments logged this month.</div>}
              {assignRows
                .filter((r) => r.count > 0)
                .map((r) => (
                  <div key={r.userId} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #eef0f2" }}>
                    <span>{r.name}</span>
                    <span style={{ fontWeight: 600 }}>{r.count}</span>
                  </div>
                ))}
            </div>

            <div className="card" style={{ padding: "14px 16px" }}>
              <CardLabel>Removed this month</CardLabel>
              {removedRows.every((r) => r.count === 0) && <div style={{ fontSize: 13, color: "#9aa0ab" }}>No removals this month.</div>}
              {removedRows
                .filter((r) => r.count > 0)
                .map((r) => (
                  <div key={r.userId} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #eef0f2" }}>
                    <span>{r.name}</span>
                    <span style={{ fontWeight: 600, color: DANGER }}>{r.count}</span>
                  </div>
                ))}
              {reasonRows.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2e4e9", display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {reasonRows.map((r) => (
                    <span key={r.id} style={{ fontSize: 11.5, color: "#6b7280", background: TRACK, borderRadius: 4, padding: "3px 8px" }}>
                      {r.name}: {r.count}
                    </span>
                  ))}
                </div>
              )}
              {removalSourceRows.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2e4e9" }}>
                  <div style={{ fontSize: 11, color: "#9aa0ab", marginBottom: 6 }}>By source</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {removalSourceRows.map((r) => (
                      <span key={r.id ?? "none"} style={{ fontSize: 11.5, color: "#6b7280", background: TRACK, borderRadius: 4, padding: "3px 8px" }}>
                        {r.name}: {r.count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {removalCohortRows.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2e4e9" }}>
                  <div style={{ fontSize: 11, color: "#9aa0ab", marginBottom: 6 }} title="Which lead-intake month these removed customers came from — a stand-in for which ad run brought them in">
                    By lead's intake month
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {removalCohortRows.map((r) => (
                      <span key={r.id} style={{ fontSize: 11.5, color: "#6b7280", background: TRACK, borderRadius: 4, padding: "3px 8px" }}>
                        {monthLabel(r.id!)}: {r.count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 700 }} title="Only counts data from whenever the stage-tracking migration was run — no historical backfill">
          Sales Performance Tracker
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canManage && <AreaFilter value={spAreaId} onChange={setSpAreaId} areas={availableAreas} />}
          <input type="month" className="field-input" style={{ width: 150 }} value={spMonth} onChange={(e) => setSpMonth(e.target.value)} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginBottom: 24 }}>
        <div className="card" style={{ padding: "14px 16px" }}>
          <CardLabel>Assign → Appointment (currently there)</CardLabel>
          {apptDurationRows.length === 0 && <div style={{ fontSize: 13, color: "#9aa0ab" }}>No data yet — needs an "Appointment" stage and time to accumulate.</div>}
          {apptDurationRows.map((r) => (
            <div key={r.userId} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #eef0f2" }}>
              <span>{r.name}</span>
              <span><strong>{r.avgDays}</strong> days avg · {r.count} customer{r.count === 1 ? "" : "s"}</span>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: "14px 16px" }}>
          <CardLabel>Assign → Closed Case, by source</CardLabel>
          {closedBySourceRows.length === 0 && <div style={{ fontSize: 13, color: "#9aa0ab" }}>No deals closed this month with assignment data.</div>}
          {closedBySourceRows.map((r) => (
            <div key={r.id ?? "none"} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #eef0f2" }}>
              <span>{r.name}</span>
              <span><strong>{r.avgDays}</strong> days avg · {r.count} deal{r.count === 1 ? "" : "s"}</span>
            </div>
          ))}
        </div>

        {canManage && (
          <div className="card" style={{ padding: "14px 16px" }}>
            <CardLabel>Created → Closed Case, by source</CardLabel>
            {createdToClosedRows.length === 0 && <div style={{ fontSize: 13, color: "#9aa0ab" }}>No deals closed this month.</div>}
            {createdToClosedRows.map((r) => (
              <div key={r.id ?? "none"} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #eef0f2" }}>
                <span>{r.name}</span>
                <span><strong>{r.avgDays}</strong> days avg · {r.count} deal{r.count === 1 ? "" : "s"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
