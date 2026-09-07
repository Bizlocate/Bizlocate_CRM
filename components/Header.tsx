"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";

export default function Header() {
  const router = useRouter();
  const { currentUser, logout } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

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
              {currentUser.role === "ADMIN" && (
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  style={{ display: "block", padding: "10px 14px", fontSize: 13.5, color: "#20222b" }}
                >
                  Settings
                </Link>
              )}
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
