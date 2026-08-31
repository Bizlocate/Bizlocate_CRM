"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import {
  conversionRatePct,
  leaderboard,
  lostCount,
  monthlyTrend,
  openTaskCount,
  pacePct,
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

function StatTile({
  label,
  value,
  valueColor,
  grow,
  children,
}: {
  label: string;
  value: string;
  valueColor?: string;
  grow?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="card" style={{ padding: "14px 16px", flex: grow ? "2 1 300px" : "1 1 170px" }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: "#9aa0ab", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 0", color: valueColor ?? "#20222b" }}>{value}</div>
      {children}
    </div>
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
  const { currentUser, users, teams, areas, stages, dealClosures, activities, salesTargets, visibleCustomers, upsertSalesTarget, tasks } = useStore();
  const [yearMonth, setYearMonth] = useState(currentYearMonth);
  const [areaId, setAreaId] = useState("");

  const scopedIds = useMemo(() => (currentUser ? scopedUserIds(users, currentUser) : new Set<string>()), [users, currentUser]);
  const scopedDealClosures = useMemo(() => dealClosures.filter((d) => scopedIds.has(d.userId)), [dealClosures, scopedIds]);
  const scopedTargets = useMemo(
    () => salesTargets.filter((t) => scopedIds.has(t.userId) && t.yearMonth === yearMonth),
    [salesTargets, scopedIds, yearMonth]
  );

  if (!currentUser) return null;

  const canManage = currentUser.role === "ADMIN" || currentUser.role === "MANAGER";

  // Area filter (ADMIN/MANAGER only) narrows every section below to one
  // area's customers — "" means all areas, no filtering.
  const areaCustomers = areaId ? visibleCustomers.filter((c) => c.areaId === areaId) : visibleCustomers;
  const customerAreaMap = new Map(visibleCustomers.map((c) => [c.id, c.areaId]));
  const inAreaScope = (customerId: string) => !areaId || customerAreaMap.get(customerId) === areaId;
  const areaDealClosures = scopedDealClosures.filter((d) => inAreaScope(d.customerId));
  const areaLeaderboardDealClosures = dealClosures.filter((d) => inAreaScope(d.customerId));
  const areaActivities = activities.filter((a) => inAreaScope(a.customerId));

  const funnel = stageFunnel(areaCustomers, stages, scopedIds);
  const won = wonAmountInMonth(areaDealClosures, yearMonth);
  const lost = lostCount(areaCustomers, stages, scopedIds);
  const targetTotal = scopedTargets.reduce((sum, t) => sum + t.amount, 0);
  const attainmentPct = targetTotal > 0 ? Math.round((won / targetTotal) * 100) : null;
  const maxFunnelCount = Math.max(1, ...funnel.map((f) => f.count));
  const conversionRate = conversionRatePct(areaDealClosures, areaCustomers, yearMonth);
  const pace = pacePct(new Date(), yearMonth);
  const openTasks = openTaskCount(tasks, new Set(areaCustomers.map((c) => c.id)));

  const myWon = wonAmountInMonth(dealClosures.filter((d) => d.userId === currentUser.id), yearMonth);
  const myTarget = salesTargets.find((t) => t.userId === currentUser.id && t.yearMonth === yearMonth)?.amount ?? null;
  const myAttainmentPct = myTarget && myTarget > 0 ? Math.round((myWon / myTarget) * 100) : null;
  const myActivityCount = activities.filter((a) => a.authorUserId === currentUser.id && a.createdAt.slice(0, 7) === yearMonth).length;

  const trend = monthlyTrend(areaCustomers, areaDealClosures, 6, new Date());
  const maxTrendWon = Math.max(1, ...trend.map((p) => p.won));
  // One shared scale — newLeads and wonCount are both deal counts, so their
  // bars are directly comparable (won *amount* never was).
  const maxTrendCount = Math.max(1, ...trend.map((p) => Math.max(p.newLeads, p.wonCount)));

  const leaderboardRows = leaderboard(
    users.filter((u) => scopedIds.has(u.id) && u.active && u.role !== "ADMIN"),
    areaLeaderboardDealClosures,
    salesTargets,
    areaActivities,
    yearMonth
  );

  const leaderCols = "1.3fr .8fr .9fr .9fr 1.3fr .5fr";

  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Dashboard — {monthLabel(yearMonth)}</div>
        <div style={{ display: "flex", gap: 8 }}>
          {canManage && (
            <select className="field-input" style={{ width: 180 }} value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              <option value="">All areas</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
          <input type="month" className="field-input" style={{ width: 160 }} value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <StatTile label="Won this month" value={formatMoney(won)} grow>
          {targetTotal > 0 ? (
            <div style={{ marginTop: 10 }}>
              <ProgressBar pct={attainmentPct} pace={pace} />
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 7 }}>
                {attainmentPct}% of {formatMoney(targetTotal)} target · {pace}% of the month elapsed
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#9aa0ab", marginTop: 8 }}>
              {canManage ? "No target set — set one in 团队表现 below" : "No target set for you this month"}
            </div>
          )}
        </StatTile>
        <StatTile label="Conversion" value={conversionRate !== null ? `${conversionRate}%` : "—"}>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            {conversionRate !== null ? "of new leads won" : "no new leads this month"}
          </div>
        </StatTile>
        <StatTile label="Lost" value={String(lost)} valueColor={lost > 0 ? DANGER : undefined}>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>deals lost</div>
        </StatTile>
        <StatTile label="Open tasks" value={String(openTasks)}>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>not yet done</div>
        </StatTile>
      </div>

      {canManage && (
        <>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>团队表现</div>
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
                    <TargetCell userId={row.userId} yearMonth={yearMonth} target={row.target} onSave={upsertSalesTarget} />
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
        </>
      )}

      {currentUser.role !== "ADMIN" && (
        <>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>我的数字</div>
          <div className="card" style={{ padding: 20, marginBottom: 24, display: "flex", gap: 40, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 280px" }}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>My won this month</div>
              <div style={{ fontSize: 22, fontWeight: 700, margin: "2px 0 10px" }}>{formatMoney(myWon)}</div>
              {myTarget && myTarget > 0 ? (
                <>
                  <ProgressBar pct={myAttainmentPct} pace={pace} />
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 7 }}>
                    {myAttainmentPct}% of {formatMoney(myTarget)} target · {pace}% of the month elapsed
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

      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Pipeline & 趋势</div>
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
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 100 }}>
            {trend.map((p) => (
              <div key={p.yearMonth} style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "flex-end" }} title={`${monthLabel(p.yearMonth)}: ${formatMoney(p.won)}`}>
                <div style={{ width: "100%", maxWidth: 34, background: BRAND, borderRadius: "4px 4px 0 0", height: `${(p.won / maxTrendWon) * 92 + (p.won > 0 ? 4 : 0)}px` }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {trend.map((p) => (
              <div key={p.yearMonth} style={{ flex: 1, textAlign: "center", fontSize: 10.5, color: "#9aa0ab" }}>{shortMonthLabel(p.yearMonth)}</div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: "14px 16px" }}>
          <CardLabel>New leads vs deals won</CardLabel>
          <div style={{ display: "flex", gap: 14, marginTop: -6, marginBottom: 12, fontSize: 11.5, color: "#6b7280" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: BRAND, display: "inline-block" }} />New leads
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: GREEN, display: "inline-block" }} />Deals won
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 100 }}>
            {trend.map((p) => (
              <div
                key={p.yearMonth}
                style={{ flex: 1, display: "flex", gap: 2, justifyContent: "center", alignItems: "flex-end" }}
                title={`${monthLabel(p.yearMonth)}: ${p.newLeads} new leads, ${p.wonCount} won`}
              >
                <div style={{ width: 12, background: BRAND, borderRadius: "4px 4px 0 0", height: `${(p.newLeads / maxTrendCount) * 92 + (p.newLeads > 0 ? 4 : 0)}px` }} />
                <div style={{ width: 12, background: GREEN, borderRadius: "4px 4px 0 0", height: `${(p.wonCount / maxTrendCount) * 92 + (p.wonCount > 0 ? 4 : 0)}px` }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {trend.map((p) => (
              <div key={p.yearMonth} style={{ flex: 1, textAlign: "center", fontSize: 10.5, color: "#9aa0ab" }}>{shortMonthLabel(p.yearMonth)}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
