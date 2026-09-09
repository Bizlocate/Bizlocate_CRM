"use client";

import CustomerDeleteApprovalsBrowser from "@/components/CustomerDeleteApprovalsBrowser";

export default function AdminDeleteApprovalsPage() {
  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Delete Approvals</div>
      <CustomerDeleteApprovalsBrowser />
    </div>
  );
}
