"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Role, User } from "@/lib/types";
import AdminTabs from "@/components/AdminTabs";

export default function AdminUsersPage() {
  const { users, teams, currentUser, addUser, updateUser, updateUserRole, updateUserPoolLimit, deleteUser, resetUserPassword } = useStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [name, setName] = useState("");
  const [ic, setIc] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("SALESPERSON");
  const [teamId, setTeamId] = useState<string>("");
  const [activePoolLimit, setActivePoolLimit] = useState("");
  const [inactivePoolLimit, setInactivePoolLimit] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editName, setEditName] = useState("");
  const [editIc, setEditIc] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<Role>("SALESPERSON");
  const [editTeamId, setEditTeamId] = useState("");
  const [editActivePoolLimit, setEditActivePoolLimit] = useState("");
  const [editInactivePoolLimit, setEditInactivePoolLimit] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editError, setEditError] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetting, setResetting] = useState(false);

  const [filterRole, setFilterRole] = useState<Role | "">("");
  const [filterTeamId, setFilterTeamId] = useState<string>("");
  const filteredUsers = users.filter(
    (u) => (!filterRole || u.role === filterRole) && (!filterTeamId || u.teamId === filterTeamId)
  );

  function teamName(id: string | null) {
    return teams.find((t) => t.id === id)?.name ?? "—";
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete ${name}? This permanently removes their login and cannot be undone.`)) return;
    const result = await deleteUser(id);
    if (!result.ok) {
      alert(result.error ?? "Could not delete user.");
      return;
    }
    setEditTarget(null);
  }

  function openEdit(u: User) {
    setEditTarget(u);
    setEditName(u.name);
    setEditIc(u.ic ?? "");
    setEditPhone(u.phone ?? "");
    setEditEmail(u.email);
    setEditRole(u.role);
    setEditTeamId(u.teamId ?? "");
    setEditActivePoolLimit(u.activePoolLimit != null ? String(u.activePoolLimit) : "");
    setEditInactivePoolLimit(u.inactivePoolLimit != null ? String(u.inactivePoolLimit) : "");
    setEditActive(u.active);
    setEditError("");
    setResetPassword("");
    setResetError("");
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    if (!editName.trim() || !editEmail.trim() || !editPhone.trim()) return;
    const activeLimit = editActivePoolLimit.trim() ? Number(editActivePoolLimit) : null;
    const inactiveLimit = editInactivePoolLimit.trim() ? Number(editInactivePoolLimit) : null;
    if ([activeLimit, inactiveLimit].some((l) => l !== null && (!Number.isInteger(l) || l < 0))) {
      setEditError("Pool limits must be non-negative whole numbers.");
      return;
    }
    setEditSubmitting(true);
    setEditError("");
    const result = await updateUser(editTarget.id, {
      name: editName.trim(),
      email: editEmail.trim(),
      phone: editPhone.trim(),
      ic: editIc.trim() || null,
      role: editRole,
      teamId: editTeamId || null,
      activePoolLimit: activeLimit,
      inactivePoolLimit: inactiveLimit,
      active: editActive,
    });
    setEditSubmitting(false);
    if (result.error) {
      setEditError(result.error);
      return;
    }
    setEditTarget(null);
  }

  async function handleResetSubmit() {
    if (!editTarget) return;
    const manual = resetPassword.trim();
    if (manual && manual.length < 6) {
      setResetError("Password must be at least 6 characters.");
      return;
    }
    setResetting(true);
    setResetError("");
    const result = await resetUserPassword(editTarget.id, manual || undefined);
    setResetting(false);
    if (result.error) {
      setResetError(result.error);
      return;
    }
    setTempPassword(result.tempPassword ?? manual);
    setResetPassword("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !phone.trim()) return;
    const activeLimit = activePoolLimit.trim() ? Number(activePoolLimit) : null;
    const inactiveLimit = inactivePoolLimit.trim() ? Number(inactivePoolLimit) : null;
    if ([activeLimit, inactiveLimit].some((l) => l !== null && (!Number.isInteger(l) || l < 0))) {
      setFormError("Pool limits must be non-negative whole numbers.");
      return;
    }
    if (password.trim() !== confirmPassword.trim()) {
      setFormError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    const result = await addUser({ name: name.trim(), email: email.trim(), phone: phone.trim(), ic: ic.trim() || null, role, teamId: teamId || null, activePoolLimit: activeLimit, inactivePoolLimit: inactiveLimit, password: password.trim() || undefined });
    setSubmitting(false);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    setTempPassword(result.tempPassword ?? null);
    setName("");
    setIc("");
    setEmail("");
    setPhone("");
    setRole("SALESPERSON");
    setTeamId("");
    setActivePoolLimit("");
    setInactivePoolLimit("");
    setPassword("");
    setConfirmPassword("");
    setShowAddModal(false);
  }

  return (
    <div style={{ padding: "28px 32px" }}>
      <AdminTabs />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Admin — Users</div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>+ New User</button>
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

      {editTarget && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditTarget(null); }}>
          <form onSubmit={handleEditSubmit} className="card modal-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Edit User</div>
              <button className="btn btn-outline" type="button" onClick={() => setEditTarget(null)}>×</button>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 180px" }}>
                <label className="field-label">Name</label>
                <input className="field-input" value={editName} onChange={(e) => setEditName(e.target.value)} required />
              </div>
              <div style={{ flex: "1 1 180px" }}>
                <label className="field-label">IC</label>
                <input className="field-input" value={editIc} onChange={(e) => setEditIc(e.target.value)} />
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <label className="field-label">Tel. No</label>
                <input className="field-input" type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} required />
              </div>
              <div style={{ flex: "1 1 220px" }}>
                <label className="field-label">Email</label>
                <input className="field-input" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} required />
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <label className="field-label">Role</label>
                <select className="field-input" value={editRole} onChange={(e) => setEditRole(e.target.value as Role)}>
                  <option value="ADMIN">ADMIN</option>
                  <option value="MANAGER">MANAGER</option>
                  <option value="SALESPERSON">SALESPERSON</option>
                </select>
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <label className="field-label">Team</label>
                <select className="field-input" value={editTeamId} onChange={(e) => setEditTeamId(e.target.value)}>
                  <option value="">—</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <label className="field-label">Active pool limit</label>
                <input
                  className="field-input"
                  type="number"
                  min={0}
                  step={1}
                  value={editActivePoolLimit}
                  onChange={(e) => setEditActivePoolLimit(e.target.value)}
                  placeholder="Unlimited"
                />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <label className="field-label">Potential pool limit</label>
                <input
                  className="field-input"
                  type="number"
                  min={0}
                  step={1}
                  value={editInactivePoolLimit}
                  onChange={(e) => setEditInactivePoolLimit(e.target.value)}
                  placeholder="Unlimited"
                />
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <label className="field-label">Status</label>
                <select className="field-input" value={editActive ? "ACTIVE" : "INACTIVE"} onChange={(e) => setEditActive(e.target.value === "ACTIVE")}>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" type="submit" disabled={editSubmitting}>{editSubmitting ? "Saving…" : "Save"}</button>
              <button className="btn btn-outline" type="button" onClick={() => setEditTarget(null)}>Cancel</button>
            </div>
            {editError && <div className="error-text" style={{ marginTop: 10 }}>{editError}</div>}

            <div style={{ borderTop: "1px solid #eef0f2", marginTop: 20, paddingTop: 16 }}>
              <label className="field-label">Reset password</label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 6 }}>
                <div style={{ flex: "1 1 220px" }}>
                  <input
                    className="field-input"
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="Leave blank to auto-generate"
                    minLength={6}
                  />
                </div>
                <button className="btn btn-outline" type="button" disabled={resetting} onClick={handleResetSubmit}>
                  {resetting ? "Resetting…" : "Reset Password"}
                </button>
              </div>
              {resetError && <div className="error-text" style={{ marginTop: 6 }}>{resetError}</div>}
            </div>

            {editTarget.id !== currentUser?.id && (
              <div style={{ borderTop: "1px solid #eef0f2", marginTop: 20, paddingTop: 16 }}>
                <span onClick={() => handleDelete(editTarget.id, editTarget.name)} style={{ color: "#d9483a", fontWeight: 500, fontSize: 13, cursor: "pointer" }}>
                  Delete this user
                </span>
              </div>
            )}
          </form>
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}>
          <form onSubmit={handleSubmit} className="card modal-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>New User</div>
              <button className="btn btn-outline" type="button" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 180px" }}>
                <label className="field-label">Name</label>
                <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div style={{ flex: "1 1 180px" }}>
                <label className="field-label">IC</label>
                <input className="field-input" value={ic} onChange={(e) => setIc(e.target.value)} />
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <label className="field-label">Tel. No</label>
                <input className="field-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
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
              <div style={{ flex: "1 1 180px" }}>
                <label className="field-label">Confirm Password</label>
                <input
                  className="field-input"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  minLength={6}
                />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <label className="field-label">Active pool limit</label>
                <input
                  className="field-input"
                  type="number"
                  min={0}
                  step={1}
                  value={activePoolLimit}
                  onChange={(e) => setActivePoolLimit(e.target.value)}
                  placeholder="Unlimited"
                />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <label className="field-label">Potential pool limit</label>
                <input
                  className="field-input"
                  type="number"
                  min={0}
                  step={1}
                  value={inactivePoolLimit}
                  onChange={(e) => setInactivePoolLimit(e.target.value)}
                  placeholder="Unlimited"
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create"}</button>
              <button className="btn btn-outline" type="button" onClick={() => setShowAddModal(false)}>Cancel</button>
            </div>
            {formError && <div className="error-text" style={{ marginTop: 10 }}>{formError}</div>}
          </form>
        </div>
      )}

      <div className="card" style={{ padding: 14, marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: "0 1 180px" }}>
          <label className="field-label">Role</label>
          <select className="field-input" value={filterRole} onChange={(e) => setFilterRole(e.target.value as Role | "")}>
            <option value="">All Roles</option>
            <option value="ADMIN">ADMIN</option>
            <option value="MANAGER">MANAGER</option>
            <option value="SALESPERSON">SALESPERSON</option>
          </select>
        </div>
        <div style={{ flex: "0 1 180px" }}>
          <label className="field-label">Team</label>
          <select className="field-input" value={filterTeamId} onChange={(e) => setFilterTeamId(e.target.value)}>
            <option value="">All Teams</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {(filterRole || filterTeamId) && (
          <button className="btn btn-outline" type="button" onClick={() => { setFilterRole(""); setFilterTeamId(""); }}>
            Clear filters
          </button>
        )}
      </div>

      <div className="card">
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1.7fr 1fr 0.9fr 1fr 0.8fr 0.8fr 0.9fr 1fr", padding: "12px 20px", background: "#f7f7f8", borderBottom: "1px solid #e2e4e9", fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".03em" }}>
          <div>Name</div><div>Email</div><div>Phone</div><div>Role</div><div>Team</div><div>Active limit</div><div>Potential limit</div><div>Status</div><div>Actions</div>
        </div>
        {filteredUsers.length === 0 && (
          <div style={{ padding: 20, fontSize: 13.5, color: "#9aa0ab" }}>
            {users.length === 0 ? "No users yet. Create the first one." : "No users match this filter."}
          </div>
        )}
        {filteredUsers.map((u) => (
          <div key={u.id} style={{ display: "grid", gridTemplateColumns: "1.3fr 1.7fr 1fr 0.9fr 1fr 0.8fr 0.8fr 0.9fr 1fr", padding: "14px 20px", borderBottom: "1px solid #eef0f2", alignItems: "center", fontSize: 13.5 }}>
            <div style={{ fontWeight: 500 }}>{u.name}</div>
            <div style={{ color: "#6b7280" }}>{u.email}</div>
            <div style={{ color: "#6b7280" }}>{u.phone ?? "—"}</div>
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
              <input
                key={u.activePoolLimit ?? "unlimited"}
                className="field-input"
                style={{ fontSize: 13, padding: "4px 8px", width: 60 }}
                type="number"
                min={0}
                step={1}
                defaultValue={u.activePoolLimit ?? ""}
                placeholder="∞"
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  const next = raw ? Number(raw) : null;
                  if (next !== null && (!Number.isInteger(next) || next < 0)) return;
                  if (next !== u.activePoolLimit) updateUserPoolLimit(u.id, "ACTIVE", next);
                }}
              />
            </div>
            <div>
              <input
                key={u.inactivePoolLimit ?? "unlimited"}
                className="field-input"
                style={{ fontSize: 13, padding: "4px 8px", width: 60 }}
                type="number"
                min={0}
                step={1}
                defaultValue={u.inactivePoolLimit ?? ""}
                placeholder="∞"
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  const next = raw ? Number(raw) : null;
                  if (next !== null && (!Number.isInteger(next) || next < 0)) return;
                  if (next !== u.inactivePoolLimit) updateUserPoolLimit(u.id, "INACTIVE", next);
                }}
              />
            </div>
            <div>
              <span style={{ fontSize: 11.5, fontWeight: 700, padding: "4px 9px", borderRadius: 20, background: u.active ? "#e7f6ec" : "#eceef1", color: u.active ? "#1e7a41" : "#6b7280" }}>
                {u.active ? "ACTIVE" : "INACTIVE"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <span onClick={() => openEdit(u)} style={{ color: "#4046c9", fontWeight: 500, fontSize: 13, cursor: "pointer" }}>
                Edit
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
