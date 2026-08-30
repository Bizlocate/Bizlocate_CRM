"use client";

import { useStore } from "@/lib/store";
import AgentLogBrowser from "@/components/AgentLogBrowser";

export default function AdminAgentLogsPage() {
  const { users, customers } = useStore();
  const agents = users.filter((u) => u.role === "SALESPERSON" || u.role === "MANAGER");

  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Agent Log</div>
      <AgentLogBrowser agents={agents} customers={customers} />
    </div>
  );
}
