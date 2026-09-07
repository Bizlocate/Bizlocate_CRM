"use client";

import BlastingListBrowser from "@/components/BlastingListBrowser";

export default function BlastingPage() {
  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Blasting</div>
      <BlastingListBrowser />
    </div>
  );
}
