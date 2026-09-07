"use client";

import BlastRequestForm from "@/components/BlastRequestForm";

export default function BlastRequestsPage() {
  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Blast Requests</div>
      <BlastRequestForm />
    </div>
  );
}
