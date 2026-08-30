"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import AdminTabs from "@/components/AdminTabs";
import { CsvPreview } from "@/lib/types";
import { removeCsvRow } from "@/lib/parseAreaCsv";

export default function AdminAreaPage() {
  const { areas, subAreas, teams, addArea, updateArea, updateAreaTeam, deleteArea, addSubArea, updateSubArea, deleteSubArea, previewAreaCsv, confirmAreaCsvImport } = useStore();

  const [showForm, setShowForm] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");

  const [expandedAreaId, setExpandedAreaId] = useState<string | null>(null);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editingAreaName, setEditingAreaName] = useState("");
  const [confirmDeleteAreaId, setConfirmDeleteAreaId] = useState<string | null>(null);

  const [editingSubAreaId, setEditingSubAreaId] = useState<string | null>(null);
  const [editingSubAreaName, setEditingSubAreaName] = useState("");
  const [newSubAreaName, setNewSubAreaName] = useState("");

  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  function subAreasFor(areaId: string) {
    return subAreas.filter((s) => s.areaId === areaId);
  }

  function handleCreateArea(e: React.FormEvent) {
    e.preventDefault();
    if (!newAreaName.trim()) return;
    addArea(newAreaName.trim());
    setNewAreaName("");
    setShowForm(false);
  }

  function startEditArea(id: string, name: string) {
    setEditingAreaId(id);
    setEditingAreaName(name);
  }

  function saveEditArea() {
    if (editingAreaId && editingAreaName.trim()) updateArea(editingAreaId, editingAreaName.trim());
    setEditingAreaId(null);
  }

  function handleDeleteArea(id: string) {
    if (confirmDeleteAreaId !== id) {
      setConfirmDeleteAreaId(id);
      return;
    }
    deleteArea(id);
    setConfirmDeleteAreaId(null);
    if (expandedAreaId === id) setExpandedAreaId(null);
  }

  function startEditSubArea(id: string, name: string) {
    setEditingSubAreaId(id);
    setEditingSubAreaName(name);
  }

  function saveEditSubArea() {
    if (editingSubAreaId && editingSubAreaName.trim()) updateSubArea(editingSubAreaId, editingSubAreaName.trim());
    setEditingSubAreaId(null);
  }

  function handleAddSubArea(areaId: string) {
    if (!newSubAreaName.trim()) return;
    addSubArea(areaId, newSubAreaName.trim());
    setNewSubAreaName("");
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    setImportResult(null);
    setPreview(previewAreaCsv(text));
  }

  async function handleConfirmImport() {
    if (!preview) return;
    setImporting(true);
    const result = await confirmAreaCsvImport(preview);
    setImporting(false);
    setPreview(null);
    setImportResult(
      result.ok
        ? `${result.areasCreated} area(s), ${result.subAreasCreated} sub-area(s) added.`
        : result.error ?? "Import failed."
    );
  }

  return (
    <div style={{ padding: "28px 32px" }}>
      <AdminTabs />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Admin â€” Area</div>
        <div style={{ display: "flex", gap: 10 }}>
          <label className="btn btn-outline" style={{ cursor: "pointer" }}>
            Upload CSV
            <input type="file" accept=".csv" onChange={handleFileChange} style={{ display: "none" }} />
          </label>
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>+ New Area</button>
        </div>
      </div>

      {importResult && (
        <div className="card" style={{ padding: "12px 20px", marginBottom: 20, fontSize: 13.5 }}>
          {importResult}
        </div>
      )}

      {preview && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>
            {preview.approvedAreas.length} area(s) approved, {preview.approvedCount} sub-area row(s) to add, {preview.rejectedCount} rejected
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto", fontSize: 12.5, marginBottom: 14, border: "1px solid #eef0f2", borderRadius: 6 }}>
            {preview.rows.map((r, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  padding: "5px 10px",
                  borderBottom: "1px solid #f2f3f5",
                  background: r.approved ? "transparent" : "#fbe9e7",
                }}
              >
                <span style={{ color: r.approved ? "#1e7a41" : "#a13a2b", fontWeight: 700, width: 14 }}>
                  {r.approved ? "âœ”" : "âœ—"}
                </span>
                <span style={{ color: "#6b7280", width: 40 }}>row {r.row}</span>
                <span>{r.area || "(no area)"} / {r.subArea || "(blank)"}</span>
                <span
                  style={{ color: "#9aa0ab", cursor: "pointer", fontWeight: 600 }}
                  onClick={() => setPreview(removeCsvRow(preview, r.row))}
                >
                  âœ•
                </span>
                {!r.approved && <span style={{ color: "#a13a2b" }}>{r.reason}</span>}
                <span style={{ flex: 1 }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" disabled={preview.approvedCount === 0 || importing} onClick={handleConfirmImport}>
              {importing ? "Uploadingâ€¦" : "Confirm Upload"}
            </button>
            <button className="btn btn-outline" type="button" onClick={() => setPreview(null)}>Cancel</button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreateArea} className="card" style={{ padding: 20, marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label className="field-label">Area name</label>
            <input className="field-input" value={newAreaName} onChange={(e) => setNewAreaName(e.target.value)} required />
          </div>
          <button className="btn btn-primary" type="submit">Create</button>
          <button className="btn btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
        </form>
      )}

      <div className="card">
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", padding: "12px 20px", background: "#f7f7f8", borderBottom: "1px solid #e2e4e9", fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".03em" }}>
          <div>Area</div><div>Sub-Areas</div><div>Team</div>
        </div>
        {areas.length === 0 && <div style={{ padding: 20, fontSize: 13.5, color: "#9aa0ab" }}>No areas yet. Create one or upload a CSV.</div>}
        {areas.map((a) => {
          const rows = subAreasFor(a.id);
          const expanded = expandedAreaId === a.id;
          return (
            <div key={a.id} style={{ borderBottom: "1px solid #eef0f2" }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", padding: "14px 20px", alignItems: "center", fontSize: 13.5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  {editingAreaId === a.id ? (
                    <input className="field-input" style={{ flex: "1 1 200px" }} value={editingAreaName} onChange={(e) => setEditingAreaName(e.target.value)} onBlur={saveEditArea} autoFocus />
                  ) : (
                    <span style={{ fontWeight: 500, cursor: "pointer" }} onClick={() => setExpandedAreaId(expanded ? null : a.id)}>
                      {expanded ? "â–¾" : "â–¸"} {a.name}
                    </span>
                  )}
                  <span style={{ color: "#4046c9", fontWeight: 500, cursor: "pointer" }} onClick={() => startEditArea(a.id, a.name)}>Edit</span>
                  <span style={{ color: confirmDeleteAreaId === a.id ? "#a13a2b" : "#4046c9", fontWeight: 500, cursor: "pointer" }} onClick={() => handleDeleteArea(a.id)}>
                    {confirmDeleteAreaId === a.id ? "Confirm delete?" : "Delete"}
                  </span>
                </div>
                <div style={{ color: "#6b7280" }}>{rows.length}</div>
                <div>
                  <select
                    className="field-input"
                    style={{ width: "auto" }}
                    value={a.teamId ?? ""}
                    onChange={(e) => updateAreaTeam(a.id, e.target.value || null)}
                  >
                    <option value="">—</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>

              {expanded && (
                <div style={{ padding: "0 20px 16px 40px" }}>
                  {rows.map((s) => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "6px 0", fontSize: 13 }}>
                      {editingSubAreaId === s.id ? (
                        <input className="field-input" style={{ flex: "1 1 240px" }} value={editingSubAreaName} onChange={(e) => setEditingSubAreaName(e.target.value)} onBlur={saveEditSubArea} autoFocus />
                      ) : (
                        <span style={{ color: "#374151" }}>{s.name}</span>
                      )}
                      <span style={{ color: "#4046c9", cursor: "pointer" }} onClick={() => startEditSubArea(s.id, s.name)}>Edit</span>
                      <span style={{ color: "#a13a2b", cursor: "pointer" }} onClick={() => deleteSubArea(s.id)}>Delete</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <input
                      className="field-input"
                      style={{ flex: "1 1 240px" }}
                      placeholder="New sub-area name"
                      value={newSubAreaName}
                      onChange={(e) => setNewSubAreaName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddSubArea(a.id)}
                    />
                    <button className="btn btn-outline" type="button" onClick={() => handleAddSubArea(a.id)}>+ Add</button>
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


