"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Role } from "@/lib/types";

export default function AdminUsersPage() {
  const { users, teams, currentUser, addUser, toggleUserActive, updateUserRole, deleteUser, resetUserPassword } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("SALESPERSON");
  const [teamId, setTeamId] = useState<string>("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function teamName(id: string | null) {
    return teams.find((t) => t.id === id)?.name ?? "—";
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete ${name}? This permanently removes their login and cannot be undone.`)) return;
    const result = await deleteUser(id);
    if (!result.ok) alert(result.error ?? "Could not delete user.");
  }

  async function handleResetPassword(id: string, name: string) {
    const manual = window.prompt(`Reset password for ${name}. Enter a new password, or leave blank to auto-generate one:`);
    if (manual === null) return;
    if (manual.trim() && manual.trim().length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }
    const result = await resetUserPassword(id, manual.trim() || undefined);
    if (result.error) {
      alert(result.error);
      return;
    }
    setTempPassword(result.tempPassword ?? manual.trim());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setSubmitting(true);
    setFormError("");
    const result = await addUser({ name: name.trim(), email: email.trim(), role, teamId: teamId || null, password: password.trim() || undefined });
    setSubmitting(false);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    setTempPassword(result.tempPassword ?? null);
    setName("");
    setEmail("");
    setRole("SALESPERSON");
    setTeamId("");
    setPassword("");
    setShowForm(false);
  }

  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Admin — Users</div>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>+ New User</button>
      </div>

      {tempPassword && (
        <div className="card" style={{ padding: 16, marginBottom: 20, borderColor: "#8a5a00" }}>
          <div style={{ fontSize: 13.5, marginBottom: 6 }}>
            User created. Temporary password (shown once — copy it to relay to the new user):
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14 }}>{tempPassword}</div>
          <button className="btn btn-outline" style={{ marginTop: 10 }} onClick={() => setTempPassword(null)}>
            Dismiss
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ padding: 20, marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 180px" }}>
            <label className="field-label">Name</label>
            <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div style={{ flex: "1 1 220px" }}>
            <label className="field-label">Email</label>
            <input className="field-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label className="field-label">Role</label>
            <select className="field-input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="ADMIN">ADMIN</option>
              <option value="MANAGER">MANAGER</option>
              <option value="SALESPERSON">SALESPERSON</option>
            </select>
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label className="field-label">Team</label>
            <select className="field-input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">—</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 180px" }}>
            <label className="field-label">Password (optional)</label>
            <input
              className="field-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank to auto-generate"
              minLength={6}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create"}</button>
          <button className="btn btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          {formError && <div className="error-text" style={{ flexBasis: "100%" }}>{formError}</div>}
        </form>
      )}

      <div className="card">
        <div style={{ display: "grid", gridTemplateColumns: "1.8fr 2.2fr 1.2fr 1.3fr 1fr 1fr", padding: "12px 20px", background: "#f7f7f8", borderBottom: "1px solid #e2e4e9", fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".03em" }}>
          <div>Name</div><div>Email</div><div>Role</div><div>Team</div><div>Status</div><div>Actions</div>
        </div>
        {users.length === 0 && <div style={{ padding: 20, fontSize: 13.5, color: "#9aa0ab" }}>No users yet. Create the first one.</div>}
        {users.map((u) => (
          <div key={u.id} style={{ display: "grid", gridTemplateColumns: "1.8fr 2.2fr 1.2fr 1.3fr 1fr 1fr", padding: "14px 20px", borderBottom: "1px solid #eef0f2", alignItems: "center", fontSize: 13.5 }}>
            <div style={{ fontWeight: 500 }}>{u.name}</div>
            <div style={{ color: "#6b7280" }}>{u.email}</div>
            <div>
              <select
                className="field-input"
                style={{ fontSize: 13, padding: "4px 8px" }}
                value={u.role}
                onChange={(e) => updateUserRole(u.id, e.target.value as Role)}
              >
                <option value="ADMIN">ADMIN</option>
                <option value="MANAGER">MANAGER</option>
                <option value="SALESPERSON">SALESPERSON</option>
              </select>
            </div>
            <div style={{ color: "#6b7280" }}>{teamName(u.teamId)}</div>
            <div>
              <span style={{ fontSize: 11.5, fontWeight: 700, padding: "4px 9px", borderRadius: 20, background: u.active ? "#e7f6ec" : "#eceef1", color: u.active ? "#1e7a41" : "#6b7280" }}>
                {u.active ? "ACTIVE" : "INACTIVE"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <span onClick={() => toggleUserActive(u.id)} style={{ color: "#4046c9", fontWeight: 500, fontSize: 13, cursor: "pointer" }}>
                {u.active ? "Deactivate" : "Reactivate"}
              </span>
              <span onClick={() => handleResetPassword(u.id, u.name)} style={{ color: "#4046c9", fontWeight: 500, fontSize: 13, cursor: "pointer" }}>
                Reset Password
              </span>
              {u.id !== currentUser?.id && (
                <span onClick={() => handleDelete(u.id, u.name)} style={{ color: "#d9483a", fontWeight: 500, fontSize: 13, cursor: "pointer" }}>
                  Delete
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
