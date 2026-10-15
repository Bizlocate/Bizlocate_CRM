"use client";

import { useState } from "react";
import Link from "next/link";
import { STAGE_STYLES, type Customer, type Team, type User } from "@/lib/types";
import { useStore } from "@/lib/store";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

function assigneeIds(c: Customer): string[] {
  return c.assignments.map((s) => s.userId);
}

function agentStageId(c: Customer, agentId: string): string | null {
  return c.assignments.find((s) => s.userId === agentId)?.stageId ?? null;
}

interface AgentEntry {
  customer: Customer;
  agentId: string;
  stageId: string | null;
}

/**
 * Member + Stage filtered drill-down. Shared by the Admin
 * (`/admin/agent-logs`, company-wide) and Manager (`/team/agent-logs`,
 * own team) pages — only which `agents`/`customers` are passed in differs.
 * The admin page also passes `teams`, which adds a Team filter in front
 * (Team | Member | Stage); a manager only has their own team, so they get
 * Member | Stage.
 *
 * The Member filter defaults to "All Members": one entry per matching
 * seat (a customer with two in-scope assignees contributes one entry per
 * assignee, same as the rest of the app treats seats as independent
 * engagements). Picking a specific member narrows to just their seat.
 */
export default function AgentLogBrowser({ agents, customers, teams }: { agents: User[]; customers: Customer[]; teams?: Team[] }) {
  const { areas: allAreas, stages } = useStore();
  const [teamId, setTeamId] = useState("");
  const [stageId, setStageId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [pool, setPool] = useState<"" | "ACTIVE" | "INACTIVE">("");

  // The Member dropdown narrows to the picked team (admin only).
  const visibleAgents = teamId ? agents.filter((a) => a.teamId === teamId) : agents;
  // If switching team drops the previously-picked member out of scope, fall
  // back to "All Members" instead of silently filtering by a hidden id.
  const selectedAgentId = agentId && visibleAgents.some((a) => a.id === agentId) ? agentId : "";

  // Scoped by Team + Member only (not Stage) -- this is what the stage
  // summary table counts, and what the list further narrows by Stage.
  const scopedEntries: AgentEntry[] = [];
  const scopedAgentIds = selectedAgentId ? [selectedAgentId] : visibleAgents.map((a) => a.id);
  for (const c of customers) {
    for (const aid of scopedAgentIds) {
      if (!assigneeIds(c).includes(aid)) continue;
      if (pool && c.assignments.find((s) => s.userId === aid)?.pool !== pool) continue;
      scopedEntries.push({ customer: c, agentId: aid, stageId: agentStageId(c, aid) });
    }
  }

  const stageCounts = new Map(stages.map((s) => [s.id, 0]));
  for (const entry of scopedEntries) {
    if (entry.stageId && stageCounts.has(entry.stageId)) {
      stageCounts.set(entry.stageId, (stageCounts.get(entry.stageId) ?? 0) + 1);
    }
  }

  const listEntries = scopedEntries
    .filter((entry) => !stageId || entry.stageId === stageId)
    .sort((a, b) => new Date(b.customer.updatedAt).getTime() - new Date(a.customer.updatedAt).getTime());

  function stageName(id: string) {
    return stages.find((s) => s.id === id)?.name ?? "";
  }
  function areaName(id: string | null) {
    return allAreas.find((a) => a.id === id)?.name ?? "—";
  }
  function agentName(id: string) {
    return agents.find((a) => a.id === id)?.name ?? "Unknown";
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {teams && (
          <select className="field-input" style={{ width: 180 }} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">All Teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
        <select className="field-input" style={{ width: 220 }} value={selectedAgentId} onChange={(e) => setAgentId(e.target.value)}>
          <option value="">All Members</option>
          {visibleAgents.map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
          ))}
        </select>
        <select className="field-input" style={{ width: 180 }} value={pool} onChange={(e) => setPool(e.target.value as "" | "ACTIVE" | "INACTIVE")}>
          <option value="">All Pools</option>
          <option value="ACTIVE">Active Pool</option>
          <option value="INACTIVE">Potential Pool</option>
        </select>
        <select className="field-input" style={{ width: 180 }} value={stageId} onChange={(e) => setStageId(e.target.value)}>
          <option value="">All Stages</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="card" style={{ marginBottom: 16, overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: (stages.length + 1) * 110 }}>
          <thead>
            <tr>
              {stages.map((s) => (
                <th key={s.id} style={{ padding: "10px 16px", borderBottom: "1px solid #eef0f2", borderRight: "1px solid #eef0f2", fontSize: 13, fontWeight: 600, color: "#6b7280", textAlign: "center" }}>
                  {s.name}
                </th>
              ))}
              <th style={{ padding: "10px 16px", borderBottom: "1px solid #eef0f2", fontSize: 13, fontWeight: 600, color: "#6b7280", textAlign: "center" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {stages.map((s) => (
                <td key={s.id} style={{ padding: "10px 16px", borderRight: "1px solid #eef0f2", fontSize: 14, fontWeight: 700, textAlign: "center" }}>
                  {stageCounts.get(s.id) ?? 0}
                </td>
              ))}
              <td style={{ padding: "10px 16px", fontSize: 14, fontWeight: 700, textAlign: "center" }}>{scopedEntries.length}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        {listEntries.length === 0 && (
          <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>No customers match.</div>
        )}
        {listEntries.map((entry) => {
          const c = entry.customer;
          const style = STAGE_STYLES[stageName(entry.stageId ?? "")] ?? { bg: "#eef0f4", color: "#4b5566" };
          return (
            <Link
              key={`${c.id}-${entry.agentId}`}
              href={`/customers/${c.id}`}
              style={{
                padding: "14px 16px",
                borderBottom: "1px solid #eef0f2",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.businessName || c.name}</div>
                <div style={{ fontSize: 12, color: "#9aa0ab", marginTop: 2 }}>
                  {areaName(c.areaId)}
                  {!selectedAgentId && ` · ${agentName(entry.agentId)}`}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: style.bg, color: style.color }}>
                  {stageName(entry.stageId ?? "")}
                </span>
                <span style={{ fontSize: 12, color: "#9aa0ab" }}>{formatDate(c.updatedAt)}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
