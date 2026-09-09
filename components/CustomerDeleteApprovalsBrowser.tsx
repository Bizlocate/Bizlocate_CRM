"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Admin-only queue for pending customer-delete requests. No Approve button
 * here on purpose -- approval happens by opening the customer's profile and
 * using the existing Delete button (deleteCustomer in lib/store.tsx
 * resolves the matching request itself), so there's exactly one delete code
 * path. Reject is the only direct action on this page.
 */
export default function CustomerDeleteApprovalsBrowser() {
  const { customerDeleteRequests, users, rejectCustomerDeleteRequest } = useStore();
  const pending = customerDeleteRequests.filter((r) => r.status === "PENDING");

  function userName(id: string) {
    return users.find((u) => u.id === id)?.name ?? "Unknown";
  }

  return (
    <div className="card">
      {pending.length === 0 && <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>No pending delete requests.</div>}
      {pending.map((r) => (
        <div key={r.id} style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          {r.customerId ? (
            <Link href={`/customers/${r.customerId}`} style={{ color: "inherit" }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{userName(r.requestedBy)} — {r.customerName}{r.businessName ? ` (${r.businessName})` : ""}</div>
              <div style={{ fontSize: 12, color: "#9aa0ab", marginTop: 3 }}>{formatDate(r.createdAt)} · open the customer's profile to delete</div>
            </Link>
          ) : (
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{userName(r.requestedBy)} — {r.customerName}{r.businessName ? ` (${r.businessName})` : ""}</div>
              <div style={{ fontSize: 12, color: "#9aa0ab", marginTop: 3 }}>{formatDate(r.createdAt)} · customer no longer exists</div>
            </div>
          )}
          <button className="btn btn-outline" type="button" onClick={() => rejectCustomerDeleteRequest(r.id)}>Reject</button>
        </div>
      ))}
    </div>
  );
}
