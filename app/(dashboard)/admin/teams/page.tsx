"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import AdminTabs from "@/components/AdminTabs";

export default function AdminTeamsPage() {
  const { teams, users, addTeam, updateTeam } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [managerId, setManagerId] = useState("");

  const managers = users.filter((u) => u.role === "MANAGER");

  function memberCount(teamId: string) {
    return users.filter((u) => u.teamId === teamId).length;
  }

  function managerName(id: string | null) {
    return users.find((u) => u.id === id)?.name ?? "—";
  }

  function openCreate() {
    setEditingId(null);
    setName("");
    setManagerId("");
    setShowForm(true);
  }

  function openEdit(id: string) {
    const team = teams.find((t) => t.id === id);
    if (!team) return;
    setEditingId(id);
    setName(team.name);
    setManagerId(team.managerId ?? "");
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (editingId) updateTeam(editingId, name.trim(), managerId || null);
    else addTeam(name.trim(), managerId || null);
    setShowForm(false);
  }

  return (
    <div style={{ padding: "28px 32px" }}>
      <AdminTabs />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Admin — Teams</div>
        <button className="btn btn-primary" onClick={openCreate}>+ New Team</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ padding: 20, marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label className="field-label">Team name</label>
            <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <label className="field-label">Manager</label>
            <select className="field-input" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">—</option>
              {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" type="submit">{editingId ? "Save" : "Create"}</button>
          <button className="btn btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
        </form>
      )}

      <div className="card">
        <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1.2fr 1fr", padding: "12px 20px", background: "#f7f7f8", borderBottom: "1px solid #e2e4e9", fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".03em" }}>
          <div>Team Name</div><div>Manager</div><div>Members</div><div>Actions</div>
        </div>
        {teams.length === 0 && <div style={{ padding: 20, fontSize: 13.5, color: "#9aa0ab" }}>No teams yet. Create one.</div>}
        {teams.map((t) => (
          <div key={t.id} style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1.2fr 1fr", padding: "14px 20px", borderBottom: "1px solid #eef0f2", alignItems: "center", fontSize: 13.5 }}>
            <div style={{ fontWeight: 500 }}>{t.name}</div>
            <div style={{ color: "#6b7280" }}>{managerName(t.managerId)}</div>
            <div style={{ color: "#6b7280" }}>{memberCount(t.id)}</div>
            <div onClick={() => openEdit(t.id)} style={{ color: "#4046c9", fontWeight: 500, fontSize: 13, cursor: "pointer" }}>Edit</div>
          </div>
        ))}
      </div>
    </div>
  );
}
