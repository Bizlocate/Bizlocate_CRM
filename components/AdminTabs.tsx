"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/agent-logs", label: "Agent Logs" },
  { href: "/admin/teams", label: "Teams" },
  { href: "/admin/area", label: "Area" },
  { href: "/admin/business-tags", label: "Business Tag" },
  { href: "/admin/stages", label: "Pipeline Stages" },
  { href: "/admin/profile-lists", label: "Profile Lists" },
  { href: "/admin/field-settings", label: "Required Fields" },
];

export default function AdminTabs() {
  const pathname = usePathname();
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              background: active ? "#eef0ff" : "transparent",
              color: active ? "#4046c9" : "#6b7280",
              textDecoration: "none",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
