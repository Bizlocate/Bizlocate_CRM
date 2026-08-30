"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { currentUser, initialized } = useStore();

  useEffect(() => {
    if (initialized && currentUser && currentUser.role !== "MANAGER") router.replace("/customers");
  }, [initialized, currentUser, router]);

  if (!initialized || !currentUser || currentUser.role !== "MANAGER") return null;

  return <>{children}</>;
}
