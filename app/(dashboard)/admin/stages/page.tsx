"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import AdminTabs from "@/components/AdminTabs";

export default function AdminStagesPage() {
  const { stages, addStage, renameStage, moveStage, deleteStage, updateStageRequiresAmount, updateStageExcludeFromAutoAssign } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<Record<string, string>>({});

  const sorted = [...stages].sort((a, b) => a.order - b.order);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    addStage(name.trim(), isDefault);
    setName("");
    setIsDefault(false);
    setShowForm(false);
  }

  function handleDelete(id: string) {
    const result = deleteStage(id);
    if (!result.ok) setError((prev) => ({ ...prev, [id]: result.error ?? "" }));
    else setError((prev) => { const { [id]: _, ...rest } = prev; return rest; });
  }

  function saveRename(id: string) {
    if (editName.trim()) renameStage(id, editName.trim());
    setEditingId(null);
  }

  return (
    <div style={{ padding: "28px 32px" }}>
      <AdminTabs />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Admin — Pipeline Stages</div>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>+ New Stage</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ padding: 20, marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label className="field-label">Stage name</label>
            <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            Set as default
          </label>
          <button className="btn btn-primary" type="submit">Create</button>
          <button className="btn btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
        </form>
      )}

      <div className="card" style={{ maxWidth: 720 }}>
        {sorted.length === 0 && <div style={{ padding: 20, fontSize: 13.5, color: "#9aa0ab" }}>No stages configured. Add the first one.</div>}
        {sorted.map((s, i) => (
          <div key={s.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: "1px solid #eef0f2" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <button
                  onClick={() => moveStage(s.id, -1)}
                  disabled={i === 0}
                  style={{ border: "none", background: "none", cursor: i === 0 ? "default" : "pointer", color: i === 0 ? "#d7d9de" : "#6b7280", fontSize: 10, lineHeight: 1 }}
                  aria-label="Move up"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveStage(s.id, 1)}
                  disabled={i === sorted.length - 1}
                  style={{ border: "none", background: "none", cursor: i === sorted.length - 1 ? "default" : "pointer", color: i === sorted.length - 1 ? "#d7d9de" : "#6b7280", fontSize: 10, lineHeight: 1 }}
                  aria-label="Move down"
                >
                  ▼
                </button>
              </div>
              <div style={{ fontSize: 12, color: "#9aa0ab", width: 16 }}>{i + 1}.</div>
              {editingId === s.id ? (
                <input
                  className="field-input"
                  style={{ flex: 1 }}
                  value={editName}
                  autoFocus
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => saveRename(s.id)}
                  onKeyDown={(e) => e.key === "Enter" && saveRename(s.id)}
                />
              ) : (
                <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{s.name}</div>
              )}
              {s.isDefault && (
                <span style={{ fontSize: 11, fontWeight: 700, color: "#1e7a41", background: "#e7f6ec", padding: "3px 8px", borderRadius: 20 }}>DEFAULT</span>
              )}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#6b7280", marginLeft: 8 }}>
                <input
                  type="checkbox"
                  checked={s.requiresAmount}
                  onChange={(e) => updateStageRequiresAmount(s.id, e.target.checked)}
                />
                Requires closed amount
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#6b7280" }}>
                <input
                  type="checkbox"
                  checked={s.excludeFromAutoAssign}
                  onChange={(e) => updateStageExcludeFromAutoAssign(s.id, e.target.checked)}
                />
                Skip auto-assign (e.g. Appointment/Nego)
              </label>
              <div
                onClick={() => { setEditingId(s.id); setEditName(s.name); }}
                style={{ color: "#4046c9", fontWeight: 500, fontSize: 13, marginLeft: 16, cursor: "pointer" }}
              >
                Edit
              </div>
              {!s.isDefault && (
                <div onClick={() => handleDelete(s.id)} style={{ color: "#c0392b", fontWeight: 500, fontSize: 13, marginLeft: 14, cursor: "pointer" }}>
                  Delete
                </div>
              )}
            </div>
            {error[s.id] && (
              <div style={{ padding: "0 20px 12px", fontSize: 12.5, color: "#c0392b" }}>{error[s.id]}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
