"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";

export default function SettingsPage() {
  const { currentUser, updateProfileName, updatePassword } = useStore();
  const [name, setName] = useState(currentUser?.name ?? "");
  const [nameMsg, setNameMsg] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwError, setPwError] = useState("");

  if (!currentUser) return null;

  function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    updateProfileName(name.trim());
    setNameMsg("Name updated.");
  }

  async function updatePw(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    setPwMsg("");
    if (next !== confirm) {
      setPwError("New password and confirmation do not match.");
      return;
    }
    const result = await updatePassword(current, next);
    if (!result.ok) {
      setPwError(result.error ?? "Could not update password.");
      return;
    }
    setPwMsg("Password updated. Use it on your next login.");
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  return (
    <div style={{ padding: "40px 0 56px", display: "flex", justifyContent: "center" }}>
      <div style={{ width: 560, display: "flex", flexDirection: "column", gap: 32 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 18 }}>Settings</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Profile</div>
          <form onSubmit={saveName} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <label className="field-label">Display name</label>
              <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <button className="btn btn-primary" type="submit">Save</button>
          </form>
          {nameMsg && <div style={{ fontSize: 12.5, color: "#1e7a41", marginTop: 8 }}>{nameMsg}</div>}
        </div>

        <div style={{ borderTop: "1px solid #e2e4e9", paddingTop: 28 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Change Password</div>
          <form onSubmit={updatePw} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label className="field-label">Current password</label>
              <input className="field-input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label className="field-label">New password</label>
              <input className="field-input" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label className="field-label">Confirm new password</label>
              <input className="field-input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {pwError && <div className="error-text">{pwError}</div>}
            {pwMsg && <div style={{ fontSize: 12.5, color: "#1e7a41" }}>{pwMsg}</div>}
            <button className="btn btn-primary" type="submit" style={{ alignSelf: "flex-start", marginTop: 4 }}>Update</button>
          </form>
        </div>
      </div>
    </div>
  );
}
