"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";

export default function Header() {
  const router = useRouter();
  const { currentUser, notifications, markNotificationsRead, logout } = useStore();
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => n.unread).length;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setNotifOpen(false);
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function toggleNotif() {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next) markNotificationsRead();
  }

  function handleLogout() {
    logout();
    router.push("/login");
  }

  if (!currentUser) return null;

  const initials = currentUser.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 64,
        padding: "0 28px",
        background: "#ffffff",
        borderBottom: "1px solid #e2e4e9",
        position: "relative",
        zIndex: 10,
      }}
    >
      <Link href="/customers" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/logo.jpg" alt="BizLocate" style={{ height: 30, width: "auto" }} />
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <div ref={notifRef} style={{ position: "relative" }}>
          <button
            onClick={toggleNotif}
            aria-label="Notifications"
            style={{
              position: "relative",
              width: 34,
              height: 34,
              borderRadius: 8,
              background: "#eef0ff",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 13,
                height: 13,
                border: "2px solid #4046c9",
                borderRadius: "50% 50% 12% 12%/60% 60% 18% 18%",
              }}
            />
            {unreadCount > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: 5,
                  right: 5,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#d9483a",
                  border: "2px solid #eef0ff",
                }}
              />
            )}
          </button>
          {notifOpen && (
            <div
              style={{
                position: "absolute",
                top: 44,
                right: 0,
                width: 360,
                background: "#fff",
                border: "1px solid #e2e4e9",
                borderRadius: 10,
                boxShadow: "0 16px 40px rgba(20,22,30,.16)",
                overflow: "hidden",
                zIndex: 5,
              }}
            >
              <div style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2", fontWeight: 600, fontSize: 13 }}>
                Notifications
              </div>
              {notifications.length === 0 ? (
                <div style={{ padding: "16px", fontSize: 13, color: "#9aa0ab" }}>No notifications</div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid #f3f4f6",
                      background: n.unread ? "#f4f5ff" : "#ffffff",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 13, lineHeight: 1.4 }}>{n.message}</span>
                    <span style={{ fontSize: 11.5, color: "#9aa0ab" }}>{n.time}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none" }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "#e8e9ef",
                color: "#4046c9",
                fontSize: 12,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {initials}
            </div>
            <span style={{ fontSize: 13.5, color: "#20222b", fontWeight: 500 }}>
              {currentUser.name} ({currentUser.role})
            </span>
            <div
              style={{
                width: 0,
                height: 0,
                borderLeft: "4px solid transparent",
                borderRight: "4px solid transparent",
                borderTop: "5px solid #9aa0ab",
              }}
            />
          </button>
          {menuOpen && (
            <div
              style={{
                position: "absolute",
                top: 40,
                right: 0,
                width: 160,
                background: "#fff",
                border: "1px solid #e2e4e9",
                borderRadius: 10,
                boxShadow: "0 16px 40px rgba(20,22,30,.16)",
                overflow: "hidden",
                zIndex: 5,
              }}
            >
              {currentUser.role === "ADMIN" && (
                <Link
                  href="/admin/users"
                  onClick={() => setMenuOpen(false)}
                  style={{ display: "block", padding: "10px 14px", fontSize: 13.5, color: "#20222b", borderBottom: "1px solid #eef0f2" }}
                >
                  User Control
                </Link>
              )}
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                style={{ display: "block", padding: "10px 14px", fontSize: 13.5, color: "#20222b" }}
              >
                Settings
              </Link>
              <button
                onClick={handleLogout}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  fontSize: 13.5,
                  color: "#20222b",
                  background: "none",
                  border: "none",
                  borderTop: "1px solid #eef0f2",
                }}
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
