"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import Header from "@/components/Header";
import MainNav from "@/components/MainNav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { currentUser, initialized } = useStore();

  useEffect(() => {
    if (initialized && !currentUser) router.replace("/login");
  }, [initialized, currentUser, router]);

  if (!initialized || !currentUser) return null;

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header />
      <MainNav />
      {children}
    </div>
  );
}
