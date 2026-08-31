"use client";

import RemovalApprovalsBrowser from "@/components/RemovalApprovalsBrowser";

export default function TeamRemoveApprovalsPage() {
  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Remove Approvals</div>
      <RemovalApprovalsBrowser />
    </div>
  );
}
