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
  const { currentUser, users, teams, stages, dealClosures, activities, salesTargets, visibleCustomers, upsertSalesTarget, tasks } = useStore();
  const [yearMonth, setYearMonth] = useState(currentYearMonth);

  const scopedIds = useMemo(() => (currentUser ? scopedUserIds(users, currentUser) : new Set<string>()), [users, currentUser]);
  const scopedDealClosures = useMemo(() => dealClosures.filter((d) => scopedIds.has(d.userId)), [dealClosures, scopedIds]);
  const scopedTargets = useMemo(
    () => salesTargets.filter((t) => scopedIds.has(t.userId) && t.yearMonth === yearMonth),
    [salesTargets, scopedIds, yearMonth]
  );

  if (!currentUser) return null;

  const funnel = stageFunnel(visibleCustomers, stages, scopedIds);
  const won = wonAmountInMonth(scopedDealClosures, yearMonth);
  const lost = lostCount(visibleCustomers, stages, scopedIds);
  const targetTotal = scopedTargets.reduce((sum, t) => sum + t.amount, 0);
  const attainmentPct = targetTotal > 0 ? Math.round((won / targetTotal) * 100) : null;
  const maxFunnelCount = Math.max(1, ...funnel.map((f) => f.count));
  const conversionRate = conversionRatePct(scopedDealClosures, visibleCustomers, yearMonth);

  const myWon = wonAmountInMonth(dealClosures.filter((d) => d.userId === currentUser.id), yearMonth);
  const myTarget = salesTargets.find((t) => t.userId === currentUser.id && t.yearMonth === yearMonth)?.amount ?? null;
  const myAttainmentPct = myTarget && myTarget > 0 ? Math.round((myWon / myTarget) * 100) : null;
  const myActivityCount = activities.filter((a) => a.authorUserId === currentUser.id && a.createdAt.slice(0, 7) === yearMonth).length;
  const trend = monthlyTrend(visibleCustomers, scopedDealClosures, 6, new Date());
  const maxTrendWon = Math.max(1, ...trend.map((p) => p.won));
  const maxTrendLeads = Math.max(1, ...trend.map((p) => p.newLeads));
  const pace = pacePct(new Date(), yearMonth);
  const openTasks = openTaskCount(tasks, new Set(visibleCustomers.map((c) => c.id)));
  const leaderboardRows = leaderboard(
    users.filter((u) => scopedIds.has(u.id) && u.active),
    dealClosures,
    salesTargets,
    activities,
    yearMonth
  );

  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Dashboard</div>
        <input type="month" className="field-input" style={{ width: 160 }} value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} />
      </div>

      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Pipeline & 业绩 — {monthLabel(yearMonth)}</div>
      <div className="card" style={{ padding: 20, marginBottom: 24, display: "flex", gap: 32, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 10 }}>
            Stage funnel
          </div>
          {funnel.length === 0 && <div style={{ fontSize: 13, color: "#9aa0ab" }}>No pipeline stages configured.</div>}
          {funnel.map((f) => (
            <div key={f.stageId} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                <span>{f.stageName}</span>
                <span style={{ color: "#6b7280" }}>{f.count}</span>
              </div>
              <div style={{ background: "#eef0f4", borderRadius: 4, height: 8 }}>
                <div style={{ background: "#4046c9", borderRadius: 4, height: 8, width: `${(f.count / maxFunnelCount) * 100}%` }} />
              </div>
            </div>
          ))}
          <div style={{ fontSize: 12.5, color: "#a13a2b", marginTop: 6 }}>Lost: {lost}</div>
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 10 }}>
            Won this month
          </div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{formatMoney(won)}</div>
          {targetTotal > 0 ? (
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{attainmentPct}% of {formatMoney(targetTotal)} target</div>
          ) : (
            <div style={{ fontSize: 13, color: "#9aa0ab", marginTop: 4 }}>No target set</div>
          )}
          <div style={{ fontSize: 12.5, color: "#9aa0ab", marginTop: 4 }}>
            {conversionRate !== null ? `${conversionRate}% of new leads converted` : "No new leads this month"}
          </div>
        </div>
      </div>

      {(currentUser.role === "ADMIN" || currentUser.role === "MANAGER") && (
        <>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>团队表现</div>
          <div className="card" style={{ marginBottom: 24 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr 1fr",
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
              <div>Activities</div>
            </div>
            {leaderboardRows.length === 0 && <div style={{ padding: 20, fontSize: 13.5, color: "#9aa0ab" }}>No team members.</div>}
            {leaderboardRows.map((row) => {
              const rowTeamId = users.find((u) => u.id === row.userId)?.teamId ?? null;
              const rowTeamName = rowTeamId ? teams.find((t) => t.id === rowTeamId)?.name ?? "—" : "—";
              return (
                <div
                  key={row.userId}
                  style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr 1fr", padding: "12px 20px", alignItems: "center", fontSize: 13, borderBottom: "1px solid #eef0f2" }}
                >
                  <div>{row.name}</div>
                  <div>{rowTeamName}</div>
                  <div>{formatMoney(row.won)}</div>
                  <div>
                    <TargetCell userId={row.userId} yearMonth={yearMonth} target={row.target} onSave={upsertSalesTarget} />
                  </div>
                  <div>{row.attainmentPct !== null ? `${row.attainmentPct}%` : "—"}</div>
                  <div>{row.activityCount}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>预测</div>
      <div className="card" style={{ padding: 20, marginBottom: 24, display: "flex", gap: 32, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 10 }}>
            Pace vs target
          </div>
          {targetTotal > 0 ? (
            <>
              <div style={{ position: "relative", background: "#eef0f4", borderRadius: 4, height: 10 }}>
                <div
                  style={{
                    background: attainmentPct !== null && attainmentPct >= pace ? "#1e7a41" : "#4046c9",
                    borderRadius: 4,
                    height: 10,
                    width: `${Math.min(100, attainmentPct ?? 0)}%`,
                  }}
                />
                <div style={{ position: "absolute", left: `${Math.min(100, pace)}%`, top: -3, width: 2, height: 16, background: "#a13a2b" }} title={`${pace}% of month elapsed`} />
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>{attainmentPct}% achieved · {pace}% of the month elapsed</div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "#9aa0ab" }}>No target set for this scope.</div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Open tasks</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{openTasks}</div>
        </div>
      </div>

      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>我的数字</div>
      <div className="card" style={{ padding: 20, marginBottom: 24, display: "flex", gap: 32, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>My won this month</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{formatMoney(myWon)}</div>
          <div style={{ fontSize: 12.5, color: "#9aa0ab" }}>{myTarget ? `${myAttainmentPct}% of ${formatMoney(myTarget)} target` : "No target set"}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>My activities logged</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{myActivityCount}</div>
        </div>
      </div>

      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>趋势（近6个月）</div>
      <div className="card" style={{ padding: 20, marginBottom: 24, display: "flex", gap: 40, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 10 }}>
            Won $ by month
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 100 }}>
            {trend.map((p) => (
              <div key={p.yearMonth} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ background: "#4046c9", borderRadius: "3px 3px 0 0", height: `${(p.won / maxTrendWon) * 90 + (p.won > 0 ? 4 : 0)}px` }} title={formatMoney(p.won)} />
                <div style={{ fontSize: 10.5, color: "#9aa0ab", marginTop: 4 }}>{monthLabel(p.yearMonth)}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: "1 1 260px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 10 }}>
            New leads vs won
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 100 }}>
            {trend.map((p) => (
              <div key={p.yearMonth} style={{ flex: 1, display: "flex", gap: 3, justifyContent: "center", alignItems: "flex-end" }}>
                <div style={{ width: 8, background: "#9aa0ab", borderRadius: "3px 3px 0 0", height: `${(p.newLeads / maxTrendLeads) * 90 + (p.newLeads > 0 ? 4 : 0)}px` }} title={`${p.newLeads} new`} />
                <div style={{ width: 8, background: "#1e7a41", borderRadius: "3px 3px 0 0", height: `${(p.won / maxTrendWon) * 90 + (p.won > 0 ? 4 : 0)}px` }} title={formatMoney(p.won)} />
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: "#9aa0ab", marginTop: 6 }}>grey = new leads · green = won $</div>
        </div>
      </div>
    </div>
  );
}
