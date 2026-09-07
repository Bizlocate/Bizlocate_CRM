"use client";

import BlastClaimsBrowser from "@/components/BlastClaimsBrowser";

export default function TeamBlastClaimsPage() {
  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Blast Claims</div>
      <BlastClaimsBrowser />
    </div>
  );
}
