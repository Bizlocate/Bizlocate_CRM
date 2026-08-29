"use client";

import { useState } from "react";

interface LookupItem {
  id: string;
  name: string;
}

export default function LookupListEditor({
  title,
  items,
  onAdd,
  onUpdate,
  onDelete,
}: {
  title: string;
  items: LookupItem[];
  onAdd: (name: string) => void;
  onUpdate: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function handleAdd() {
    if (!newName.trim()) return;
    onAdd(newName.trim());
    setNewName("");
  }

  function startEdit(id: string, name: string) {
    setEditingId(id);
    setEditingName(name);
  }

  function saveEdit() {
    if (editingId && editingName.trim()) onUpdate(editingId, editingName.trim());
    setEditingId(null);
  }

  function handleDelete(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    onDelete(id);
    setConfirmDeleteId(null);
  }

  return (
    <div className="card">
      <div
        style={{
          padding: "12px 20px",
          background: "#f7f7f8",
          borderBottom: "1px solid #e2e4e9",
          fontSize: 12,
          fontWeight: 600,
          color: "#6b7280",
          textTransform: "uppercase",
          letterSpacing: ".03em",
        }}
      >
        {title}
      </div>
      {items.length === 0 && <div style={{ padding: 20, fontSize: 13.5, color: "#9aa0ab" }}>No items yet. Add one below.</div>}
      {items.map((item) => (
        <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderBottom: "1px solid #eef0f2", fontSize: 13.5 }}>
          {editingId === item.id ? (
            <input
              className="field-input"
              style={{ flex: 1 }}
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={saveEdit}
              onKeyDown={(e) => e.key === "Enter" && saveEdit()}
              autoFocus
            />
          ) : (
            <div style={{ flex: 1, fontWeight: 500 }}>{item.name}</div>
          )}
          <span style={{ color: "#4046c9", fontWeight: 500, cursor: "pointer" }} onClick={() => startEdit(item.id, item.name)}>
            Edit
          </span>
          <span
            style={{ color: confirmDeleteId === item.id ? "#a13a2b" : "#4046c9", fontWeight: 500, cursor: "pointer" }}
            onClick={() => handleDelete(item.id)}
          >
            {confirmDeleteId === item.id ? "Confirm delete?" : "Delete"}
          </span>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, padding: 16 }}>
        <input
          className="field-input"
          style={{ flex: 1 }}
          placeholder="New item name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <button className="btn btn-outline" type="button" onClick={handleAdd}>
          + Add
        </button>
      </div>
    </div>
  );
}
