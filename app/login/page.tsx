"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "Invalid email or password.");
      return;
    }
    router.push("/customers");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{ width: 380, display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "#4046c9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 700,
              fontSize: 18,
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            B
          </div>
          <div style={{ fontSize: 19, fontWeight: 700 }}>BizLocate CRM</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>Internal sales CRM — sign in to continue</div>
        </div>
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label className="field-label" htmlFor="email">Email</label>
            <input
              id="email"
              className="field-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nurul.izzati@bizlocate.com.my"
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label className="field-label" htmlFor="password">Password</label>
            <input
              id="password"
              className="field-input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <div className="error-text">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ marginTop: 6 }}>
            {submitting ? "Signing in…" : "Log in"}
          </button>
          <div style={{ textAlign: "center", fontSize: 12, color: "#9aa0ab", marginTop: 2 }}>
            No self-signup — contact your administrator for access.
          </div>
        </div>
      </form>
    </div>
  );
}
