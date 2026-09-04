"use client";

import InactiveListingsBrowser from "@/components/InactiveListingsBrowser";

export default function InactiveListingsPage() {
  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Inactive Listings</div>
      <InactiveListingsBrowser />
    </div>
  );
}
