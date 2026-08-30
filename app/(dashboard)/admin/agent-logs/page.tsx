"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { ACTIVITY_STYLES } from "@/lib/types";
import AdminTabs from "@/components/AdminTabs";

export default function AdminAgentLogsPage() {
  const { users, activities, customers } = useStore();
  const agents = users.filter((u) => u.role === "SALESPERSON" || u.role === "MANAGER");
  const [agentId, setAgentId] = useState<string>("");
  // users load asynchronously from the store, so `agents` is empty on first render —
  // fall back to the first loaded agent until the person picks one explicitly.
  const effectiveAgentId = agentId || agents[0]?.id || "";

  const agentActivities = activities.filter((a) => a.authorUserId === effectiveAgentId);

  function customerName(customerId: string) {
    return customers.find((c) => c.id === customerId)?.name ?? "Unknown customer";
  }

  return (
    <div style={{ padding: "28px 32px" }}>
      <AdminTabs />
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Agent Logs</div>
      <div style={{ marginBottom: 16 }}>
        <select className="field-input" style={{ width: 260 }} value={effectiveAgentId} onChange={(e) => setAgentId(e.target.value)}>
          {agents.length === 0 && <option value="">No agents</option>}
          {agents.map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
          ))}
        </select>
      </div>
      <div className="card">
        {agentActivities.length === 0 && (
          <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>No activity logged by this agent yet.</div>
        )}
        {agentActivities.map((a) => {
          const style = ACTIVITY_STYLES[a.type];
          return (
            <div key={a.id} style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: style.bg, color: style.color }}>
                  {style.label}
                </span>
                <span style={{ fontSize: 12, color: "#9aa0ab" }}>{a.time}</span>
                <Link href={`/customers/${a.customerId}`} style={{ fontSize: 12, fontWeight: 600, color: "#4046c9" }}>
                  {customerName(a.customerId)}
                </Link>
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{a.content}</div>
              {a.followUp && <div style={{ fontSize: 12, color: "#8a5a00", fontWeight: 500 }}>{a.followUp}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
