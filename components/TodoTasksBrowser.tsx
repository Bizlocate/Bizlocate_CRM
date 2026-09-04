"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";

function daysLeftLabel(due: string): { text: string; overdue: boolean } {
  const dueDate = new Date(`${due}T00:00:00`);
  if (isNaN(dueDate.getTime())) return { text: due, overdue: false };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { text: `Overdue by ${-days} day${-days === 1 ? "" : "s"}`, overdue: true };
  if (days === 0) return { text: "Due today", overdue: false };
  return { text: `${days} day${days === 1 ? "" : "s"} left`, overdue: false };
}

/**
 * Own pending tasks only, across every customer -- `tasks` from the store is
 * already RLS-scoped to the current user (private per creator, see
 * lib/store.tsx's loadTasks), so no user filter is needed here. Same
 * shared-route-for-every-role pattern as InactiveListingsBrowser, minus its
 * filters (nothing to scope by when it's always just "mine").
 */
export default function TodoTasksBrowser() {
  const { tasks, customers, toggleTaskDone } = useStore();

  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  const openTasks = useMemo(
    () =>
      tasks
        .filter((t) => !t.done)
        .sort((a, b) => a.due.localeCompare(b.due)),
    [tasks]
  );

  return (
    <div className="card">
      {openTasks.length === 0 && (
        <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>No pending tasks.</div>
      )}
      {openTasks.map((t) => {
        const c = customerById.get(t.customerId);
        const { text, overdue } = daysLeftLabel(t.due);
        return (
          <div key={t.id} style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2", display: "flex", alignItems: "center", gap: 12 }}>
            <input type="checkbox" checked={false} onChange={() => toggleTaskDone(t.id)} style={{ width: 16, height: 16, flexShrink: 0 }} />
            <Link href={c ? `/customers/${c.id}` : "#"} style={{ flex: 1, color: "inherit", textDecoration: "none" }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t.title}</div>
              <div style={{ fontSize: 12, color: "#9aa0ab", marginTop: 2 }}>
                {c ? `${c.name} · ${c.phone} · ${c.businessName || "—"}` : "Unknown customer"}
              </div>
            </Link>
            <div style={{ fontSize: 13, fontWeight: 700, color: overdue ? "#a13a2b" : "#4b5566" }}>{text}</div>
          </div>
        );
      })}
    </div>
  );
}
