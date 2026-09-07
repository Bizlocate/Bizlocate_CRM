"use client";

import BlastApprovalsBrowser from "@/components/BlastApprovalsBrowser";

export default function AdminBlastRequestsPage() {
  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Blast Approvals</div>
      <BlastApprovalsBrowser />
    </div>
  );
}
