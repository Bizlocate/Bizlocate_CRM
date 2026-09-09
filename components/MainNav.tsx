"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { warnZoneSlotsFor } from "@/lib/inactiveListings";
import { visibleBlastItemsFor } from "@/lib/blasting";

export default function MainNav() {
  const { currentUser, removalRequests, customers, activities, assignmentEvents, users, tasks, blastItems, blastRequests, blastClaimRequests, stages } = useStore();
  const pathname = usePathname();

  // SP's own badge: how many of their customers sit in the default ("New")
  // stage -- same stage-slot logic as myStageId in customers/page.tsx (own
  // assignee slot, whichever of the 3 is theirs).
  const newStageCustomerCount = useMemo(() => {
    if (!currentUser || currentUser.role !== "SALESPERSON") return 0;
    const defaultStage = stages.find((s) => s.isDefault);
    if (!defaultStage) return 0;
    return customers.filter((c) => {
      const stageId =
        c.assignedToUserId === currentUser.id ? c.stage1Id :
        c.assignedToUserId2 === currentUser.id ? c.stage2Id :
        c.assignedToUserId3 === currentUser.id ? c.stage3Id :
        null;
      return stageId === defaultStage.id;
    }).length;
  }, [customers, currentUser, stages]);

  // tasks is already RLS-scoped to "mine" (private per creator), so this is
  // just the current user's own open-task count -- same list TodoTasksBrowser
  // renders. See lib/store.tsx's loadTasks / tasks_select RLS policy.
  const openTaskCount = useMemo(() => tasks.filter((t) => !t.done).length, [tasks]);

  // Same list InactiveListingsBrowser renders -- one shared composition so
  // the badge and the tab can't disagree. See lib/inactiveListings.ts.
  const inactiveListingsCount = useMemo(
    () =>
      currentUser
        ? warnZoneSlotsFor(customers, activities, assignmentEvents, users, currentUser, removalRequests, tasks).length
        : 0,
    [customers, activities, assignmentEvents, users, currentUser, removalRequests, tasks]
  );

  // Own badge: how many batches on the current viewer's own currently
  // visible (unlocked, unexpired) blasting list still have at least one
  // not-done customer -- a batch count, not a customer count, so the
  // badge reads as "N batches left to blast". A manager can be a blast
  // target too (they can request a list for themselves), not just
  // salespeople.
  const myOpenBlastBatchCount = useMemo(() => {
    if (!currentUser) return 0;
    const openItems = visibleBlastItemsFor(blastItems, blastRequests, currentUser.id).filter((i) => i.status === "PENDING");
    return new Set(openItems.map((i) => `${i.blastRequestId}:${i.batchIndex}`)).size;
  }, [blastItems, blastRequests, currentUser]);

  // Manager's badge: pending claim requests from their own team.
  const pendingBlastClaimCount = useMemo(() => {
    if (!currentUser || currentUser.role !== "MANAGER") return 0;
    const teamUserIds = new Set(users.filter((u) => u.teamId === currentUser.teamId).map((u) => u.id));
    return blastClaimRequests.filter((r) => r.status === "PENDING" && teamUserIds.has(r.requestedBy)).length;
  }, [blastClaimRequests, users, currentUser]);

  // Admin's badge: every pending blast request awaiting approval --
  // matches the existing Remove Approvals badge convention.
  const pendingBlastRequestCount = useMemo(() => {
    if (!currentUser || currentUser.role !== "ADMIN") return 0;
    return blastRequests.filter((r) => r.status === "PENDING").length;
  }, [blastRequests, currentUser]);

  if (!currentUser) return null;

  // removalRequests is already RLS-scoped per session (admin sees every
  // pending request, a manager sees only their own team's) -- see
  // RemovalApprovalsBrowser's own note on the same array.
  const pendingRemovalCount = removalRequests.filter((r) => r.status === "PENDING").length;

  const tabs: { href: string; label: string; active: boolean; badge?: number }[] = [
    { href: "/dashboard", label: "Dashboard", active: pathname.startsWith("/dashboard") },
    { href: "/customers", label: "Customers", active: pathname.startsWith("/customers"), badge: newStageCustomerCount },
    { href: "/tasks", label: "To Do", active: pathname.startsWith("/tasks"), badge: openTaskCount },
    { href: "/inactive-listings", label: "Inactive Listings", active: pathname.startsWith("/inactive-listings"), badge: inactiveListingsCount },
  ];
  if (currentUser.role === "SALESPERSON" || currentUser.role === "MANAGER") {
    tabs.push({ href: "/blasting", label: "Blasting", active: pathname.startsWith("/blasting"), badge: myOpenBlastBatchCount });
  }
  if (currentUser.role !== "SALESPERSON") {
    const agentLogHref = currentUser.role === "ADMIN" ? "/admin/agent-logs" : "/team/agent-logs";
    const removeApprovalsHref = currentUser.role === "ADMIN" ? "/admin/remove-approvals" : "/team/remove-approvals";
    tabs.push(
      { href: agentLogHref, label: "Agent Log", active: pathname.startsWith(agentLogHref) },
      { href: removeApprovalsHref, label: "Remove Approvals", active: pathname.startsWith(removeApprovalsHref), badge: pendingRemovalCount }
    );
  }
  if (currentUser.role === "MANAGER") {
    tabs.push(
      { href: "/blast-requests", label: "Blast Requests", active: pathname.startsWith("/blast-requests") },
      { href: "/team/blast-claims", label: "Blast Claims", active: pathname.startsWith("/team/blast-claims"), badge: pendingBlastClaimCount }
    );
  }
  if (currentUser.role === "ADMIN") {
    tabs.push({ href: "/admin/blast-requests", label: "Blast Approvals", active: pathname.startsWith("/admin/blast-requests"), badge: pendingBlastRequestCount });
  }

  return (
    <div style={{ display: "flex", gap: 8, padding: "12px 16px 0", background: "#ffffff", borderBottom: "1px solid #e2e4e9", overflowX: "auto" }}>
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
            flexShrink: 0,
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
