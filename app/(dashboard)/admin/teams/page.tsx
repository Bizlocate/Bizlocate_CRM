"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import AdminTabs from "@/components/AdminTabs";

export default function AdminTeamsPage() {
  const { teams, users, areas, addTeam, updateTeam, deleteTeam, updateUserTeam } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [managerId, setManagerId] = useState("");

  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [newMemberId, setNewMemberId] = useState("");
  const [teamError, setTeamError] = useState<string | null>(null);

  const managers = users.filter((u) => u.role === "MANAGER");

  function members(teamId: string) {
    return users.filter((u) => u.teamId === teamId);
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

  function handleDeleteTeam(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    const result = deleteTeam(id);
    setConfirmDeleteId(null);
    if (!result.ok) {
      setTeamError(result.error ?? "Could not delete team.");
      return;
    }
    setTeamError(null);
    if (expandedTeamId === id) setExpandedTeamId(null);
  }

  function handleAddMember(teamId: string) {
    if (!newMemberId) return;
    updateUserTeam(newMemberId, teamId);
    setNewMemberId("");
  }

  return (
    <div style={{ padding: "28px 32px" }}>
      <AdminTabs />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Admin — Teams</div>
        <button className="btn btn-primary" onClick={openCreate}>+ New Team</button>
      </div>

      {teamError && (
        <div className="card" style={{ padding: "12px 20px", marginBottom: 20, fontSize: 13.5, color: "#a13a2b" }}>
          {teamError}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ padding: 20, marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label className="field-label">Team name (Area)</label>
            <select className="field-input" value={name} onChange={(e) => setName(e.target.value)} required>
              <option value="">— Select area —</option>
              {name && !areas.some((a) => a.name === name) && <option value={name}>{name}</option>}
              {areas.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <label className="field-label">Manager</label>
            <select className="field-input" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">— No manager —</option>
              {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" type="submit">{editingId ? "Save" : "Create"}</button>
          <button className="btn btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
        </form>
      )}

      <div className="card">
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr", padding: "12px 20px", background: "#f7f7f8", borderBottom: "1px solid #e2e4e9", fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".03em" }}>
          <div>Team Name</div><div>Manager</div><div>Actions</div>
        </div>
        {teams.length === 0 && <div style={{ padding: 20, fontSize: 13.5, color: "#9aa0ab" }}>No teams yet. Create one.</div>}
        {teams.map((t) => {
          const teamMembers = members(t.id);
          const expanded = expandedTeamId === t.id;
          const availableUsers = users.filter((u) => u.teamId !== t.id);
          return (
            <div key={t.id} style={{ borderBottom: "1px solid #eef0f2" }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr", padding: "14px 20px", alignItems: "center", fontSize: 13.5 }}>
                <span style={{ fontWeight: 500, cursor: "pointer" }} onClick={() => setExpandedTeamId(expanded ? null : t.id)}>
                  {expanded ? "▾" : "▸"} {t.name} <span style={{ color: "#9aa0ab", fontWeight: 400 }}>({teamMembers.length})</span>
                </span>
                <div style={{ color: "#6b7280" }}>{managerName(t.managerId)}</div>
                <div style={{ display: "flex", gap: 14 }}>
                  <span style={{ color: "#4046c9", fontWeight: 500, cursor: "pointer" }} onClick={() => openEdit(t.id)}>Edit</span>
                  <span
                    style={{ color: confirmDeleteId === t.id ? "#a13a2b" : "#4046c9", fontWeight: 500, cursor: "pointer" }}
                    onClick={() => handleDeleteTeam(t.id)}
                  >
                    {confirmDeleteId === t.id ? "Confirm delete?" : "Delete"}
                  </span>
                </div>
              </div>

              {expanded && (
                <div style={{ padding: "0 20px 16px 40px" }}>
                  {teamMembers.length === 0 && <div style={{ fontSize: 13, color: "#9aa0ab", padding: "6px 0" }}>No members.</div>}
                  {teamMembers.map((m) => (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "6px 0", fontSize: 13 }}>
                      <span style={{ color: "#374151" }}>{m.name}</span>
                      <span style={{ color: "#9aa0ab" }}>{m.role}</span>
                      <span style={{ color: "#a13a2b", cursor: "pointer" }} onClick={() => updateUserTeam(m.id, null)}>Remove</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <select
                      className="field-input"
                      style={{ flex: "1 1 240px" }}
                      value={newMemberId}
                      onChange={(e) => setNewMemberId(e.target.value)}
                    >
                      <option value="">— Select user —</option>
                      {availableUsers.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                    </select>
                    <button className="btn btn-outline" type="button" onClick={() => handleAddMember(t.id)}>+ Add member</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
