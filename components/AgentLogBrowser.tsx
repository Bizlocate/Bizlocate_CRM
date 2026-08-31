"use client";

import { useState } from "react";
import Link from "next/link";
import { STAGE_STYLES, type Area, type Customer, type User } from "@/lib/types";
import { useStore } from "@/lib/store";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

function assigneeIds(c: Customer): string[] {
  return [c.assignedToUserId, c.assignedToUserId2, c.assignedToUserId3].filter((id): id is string => !!id);
}

function agentStageId(c: Customer, agentId: string): string | null {
  if (c.assignedToUserId === agentId) return c.stage1Id;
  if (c.assignedToUserId2 === agentId) return c.stage2Id;
  if (c.assignedToUserId3 === agentId) return c.stage3Id;
  return null;
}

/**
 * Area + Stage filtered drill-down: pick an agent, see every customer
 * currently assigned to them, newest-updated first. Shared by the Admin
 * (`/admin/agent-logs`, company-wide) and Manager (`/team/agent-logs`,
 * own team) pages — only which `agents`/`customers`/`areas` are passed in
 * differs; `areas` defaults to every area (admin) when not given.
 */
export default function AgentLogBrowser({ agents, customers, areas: areasProp }: { agents: User[]; customers: Customer[]; areas?: Area[] }) {
  const { areas: allAreas, stages } = useStore();
  // dropdown offers only the scoped set (manager: own team); name lookup
  // still resolves against every area so an out-of-scope area still renders
  const filterAreas = areasProp ?? allAreas;
  const [areaId, setAreaId] = useState("");
  const [stageId, setStageId] = useState("");
  const [agentId, setAgentId] = useState("");
  const effectiveAgentId = agentId || agents[0]?.id || "";

  const agentCustomers = customers
    .filter((c) => assigneeIds(c).includes(effectiveAgentId))
    .filter((c) => !areaId || c.areaId === areaId)
    .filter((c) => !stageId || agentStageId(c, effectiveAgentId) === stageId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  function stageName(id: string) {
    return stages.find((s) => s.id === id)?.name ?? "";
  }
  function areaName(id: string | null) {
    return allAreas.find((a) => a.id === id)?.name ?? "—";
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <select className="field-input" style={{ width: 180 }} value={areaId} onChange={(e) => setAreaId(e.target.value)}>
          <option value="">All Areas</option>
          {filterAreas.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select className="field-input" style={{ width: 180 }} value={stageId} onChange={(e) => setStageId(e.target.value)}>
          <option value="">All Stages</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select className="field-input" style={{ width: 220 }} value={effectiveAgentId} onChange={(e) => setAgentId(e.target.value)}>
          {agents.length === 0 && <option value="">No agents</option>}
          {agents.map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
          ))}
        </select>
      </div>
      <div className="card">
        {agentCustomers.length === 0 && (
          <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>No customers match.</div>
        )}
        {agentCustomers.map((c) => {
          const style = STAGE_STYLES[stageName(agentStageId(c, effectiveAgentId) ?? "")] ?? { bg: "#eef0f4", color: "#4b5566" };
          return (
            <Link
              key={c.id}
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
                <div style={{ fontSize: 12, color: "#9aa0ab", marginTop: 2 }}>{areaName(c.areaId)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: style.bg, color: style.color }}>
                  {stageName(agentStageId(c, effectiveAgentId) ?? "")}
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
