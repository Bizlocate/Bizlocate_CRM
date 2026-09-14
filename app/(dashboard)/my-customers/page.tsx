"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import CustomerListView from "@/components/CustomerListView";

export default function MyCustomersPage() {
  const router = useRouter();
  const { currentUser, initialized } = useStore();

  useEffect(() => {
    if (initialized && currentUser && currentUser.role !== "MANAGER") router.replace("/dashboard");
  }, [initialized, currentUser, router]);

  if (!initialized || !currentUser || currentUser.role !== "MANAGER") return null;

  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>My Customers</div>
      </div>

      <CustomerListView scope="own" />
    </div>
  );
}
