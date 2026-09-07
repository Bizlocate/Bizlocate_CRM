"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import Header from "@/components/Header";
import MainNav from "@/components/MainNav";

const IDLE_LOGOUT_MS = 30 * 60 * 1000;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { currentUser, initialized, logout } = useStore();

  useEffect(() => {
    if (initialized && !currentUser) router.replace("/login");
  }, [initialized, currentUser, router]);

  // Auto-logout after 30 minutes with no activity in this tab. logout()
  // clears currentUser, which the redirect effect above then sends to
  // /login -- no router call needed here.
  useEffect(() => {
    if (!currentUser) return;
    let timer: ReturnType<typeof setTimeout>;
    function resetTimer() {
      clearTimeout(timer);
      timer = setTimeout(() => logout(), IDLE_LOGOUT_MS);
    }
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!initialized || !currentUser) return null;

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header />
      <MainNav />
      {children}
    </div>
  );
}
