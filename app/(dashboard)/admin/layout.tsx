"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { currentUser, initialized } = useStore();

  useEffect(() => {
    if (initialized && currentUser && currentUser.role !== "ADMIN") router.replace("/customers");
  }, [initialized, currentUser, router]);

  if (!initialized || !currentUser || currentUser.role !== "ADMIN") return null;

  return <>{children}</>;
}
