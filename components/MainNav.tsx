"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";

export default function MainNav() {
  const { currentUser, removalRequests } = useStore();
  const pathname = usePathname();
  if (!currentUser) return null;

  // removalRequests is already RLS-scoped per session (admin sees every
  // pending request, a manager sees only their own team's) -- see
  // RemovalApprovalsBrowser's own note on the same array.
  const pendingRemovalCount = removalRequests.filter((r) => r.status === "PENDING").length;

  const tabs: { href: string; label: string; active: boolean; badge?: number }[] = [
    { href: "/dashboard", label: "Dashboard", active: pathname.startsWith("/dashboard") },
    { href: "/customers", label: "Customers", active: pathname.startsWith("/customers") },
  ];
  if (currentUser.role !== "SALESPERSON") {
    const agentLogHref = currentUser.role === "ADMIN" ? "/admin/agent-logs" : "/team/agent-logs";
    const removeApprovalsHref = currentUser.role === "ADMIN" ? "/admin/remove-approvals" : "/team/remove-approvals";
    tabs.push(
      { href: agentLogHref, label: "Agent Log", active: pathname.startsWith(agentLogHref) },
      { href: removeApprovalsHref, label: "Remove Approvals", active: pathname.startsWith(removeApprovalsHref), badge: pendingRemovalCount }
    );
  }

  return (
    <div style={{ display: "flex", gap: 8, padding: "12px 28px 0", background: "#ffffff", borderBottom: "1px solid #e2e4e9" }}>
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 16px",
            fontSize: 13.5,
            fontWeight: 600,
            color: tab.active ? "#4046c9" : "#6b7280",
            textDecoration: "none",
            borderBottom: tab.active ? "2px solid #4046c9" : "2px solid transparent",
          }}
        >
          {tab.label}
          {!!tab.badge && (
            <span style={{ background: "#a13a2b", color: "#fff", fontSize: 11, fontWeight: 700, borderRadius: 10, padding: "1px 7px", lineHeight: "16px" }}>
              {tab.badge}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
