"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";

export default function MainNav() {
  const { currentUser } = useStore();
  const pathname = usePathname();
  if (!currentUser || currentUser.role === "SALESPERSON") return null;

  const agentLogHref = currentUser.role === "ADMIN" ? "/admin/agent-logs" : "/team/agent-logs";
  const tabs = [
    { href: "/customers", label: "Customers", active: pathname.startsWith("/customers") },
    { href: agentLogHref, label: "Agent Log", active: pathname.startsWith(agentLogHref) },
  ];

  return (
    <div style={{ display: "flex", gap: 8, padding: "12px 28px 0", background: "#ffffff", borderBottom: "1px solid #e2e4e9" }}>
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          style={{
            padding: "10px 16px",
            fontSize: 13.5,
            fontWeight: 600,
            color: tab.active ? "#4046c9" : "#6b7280",
            textDecoration: "none",
            borderBottom: tab.active ? "2px solid #4046c9" : "2px solid transparent",
          }}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
