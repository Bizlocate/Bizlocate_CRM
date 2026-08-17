"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import AdminTabs from "@/components/AdminTabs";
import { CsvBusinessTagPreview } from "@/lib/types";
import { removeBusinessTagCsvRow } from "@/lib/parseBusinessTagCsv";

export default function AdminBusinessTagsPage() {
  const {
    businessTagIndustries,
    businessTagCategories,
    businessTagTypes,
    addBusinessTagIndustry,
    updateBusinessTagIndustry,
    deleteBusinessTagIndustry,
    addBusinessTagCategory,
    updateBusinessTagCategory,
    deleteBusinessTagCategory,
    addBusinessTagType,
    updateBusinessTagType,
    deleteBusinessTagType,
    previewBusinessTagCsv,
    confirmBusinessTagCsvImport,
  } = useStore();

  const [showForm, setShowForm] = useState(false);
  const [newIndustryName, setNewIndustryName] = useState("");

  const [expandedIndustryId, setExpandedIndustryId] = useState<string | null>(null);
  const [editingIndustryId, setEditingIndustryId] = useState<string | null>(null);
  const [editingIndustryName, setEditingIndustryName] = useState("");
  const [confirmDeleteIndustryId, setConfirmDeleteIndustryId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");

  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [newTypeName, setNewTypeName] = useState("");

  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editingTypeName, setEditingTypeName] = useState("");

  const [preview, setPreview] = useState<CsvBusinessTagPreview | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  function categoriesFor(industryId: string) {
    return businessTagCategories.filter((c) => c.industryId === industryId);
  }

  function typesFor(categoryId: string) {
    return businessTagTypes.filter((t) => t.categoryId === categoryId);
  }

  function handleCreateIndustry(e: React.FormEvent) {
    e.preventDefault();
    if (!newIndustryName.trim()) return;
    addBusinessTagIndustry(newIndustryName.trim());
    setNewIndustryName("");
    setShowForm(false);
  }

  function startEditIndustry(id: string, name: string) {
    setEditingIndustryId(id);
    setEditingIndustryName(name);
  }

  function saveEditIndustry() {
    if (editingIndustryId && editingIndustryName.trim()) updateBusinessTagIndustry(editingIndustryId, editingIndustryName.trim());
    setEditingIndustryId(null);
  }

  function handleDeleteIndustry(id: string) {
    if (confirmDeleteIndustryId !== id) {
      setConfirmDeleteIndustryId(id);
      return;
    }
    deleteBusinessTagIndustry(id);
    setConfirmDeleteIndustryId(null);
    if (expandedIndustryId === id) setExpandedIndustryId(null);
  }

  function handleAddCategory(industryId: string) {
    if (!newCategoryName.trim()) return;
    addBusinessTagCategory(industryId, newCategoryName.trim());
    setNewCategoryName("");
  }

  function startEditCategory(id: string, name: string) {
    setEditingCategoryId(id);
    setEditingCategoryName(name);
  }

  function saveEditCategory() {
    if (editingCategoryId && editingCategoryName.trim()) updateBusinessTagCategory(editingCategoryId, editingCategoryName.trim());
    setEditingCategoryId(null);
  }

  function handleDeleteCategory(id: string) {
    deleteBusinessTagCategory(id);
    if (expandedCategoryId === id) setExpandedCategoryId(null);
  }

  function handleAddType(categoryId: string) {
    if (!newTypeName.trim()) return;
    addBusinessTagType(categoryId, newTypeName.trim());
    setNewTypeName("");
  }

  function startEditType(id: string, name: string) {
    setEditingTypeId(id);
    setEditingTypeName(name);
  }

  function saveEditType() {
    if (editingTypeId && editingTypeName.trim()) updateBusinessTagType(editingTypeId, editingTypeName.trim());
    setEditingTypeId(null);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    setImportResult(null);
    setPreview(previewBusinessTagCsv(text));
  }

  async function handleConfirmImport() {
    if (!preview) return;
    setImporting(true);
    const result = await confirmBusinessTagCsvImport(preview);
    setImporting(false);
    setPreview(null);
    setImportResult(
      result.ok
        ? `${result.industriesCreated} industry(ies), ${result.categoriesCreated} categor(ies), ${result.typesCreated} type(s) added.`
        : result.error ?? "Import failed."
    );
  }

  return (
    <div style={{ padding: "28px 32px" }}>
      <AdminTabs />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Admin — Business Tag</div>
        <div style={{ display: "flex", gap: 10 }}>
          <label className="btn btn-outline" style={{ cursor: "pointer" }}>
            Upload CSV
            <input type="file" accept=".csv" onChange={handleFileChange} style={{ display: "none" }} />
          </label>
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>+ New Industry</button>
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
            {preview.approvedIndustries.length} industry(ies) approved, {preview.approvedCount} type row(s) to add, {preview.rejectedCount} rejected
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
                  {r.approved ? "✔" : "✗"}
                </span>
                <span style={{ color: "#6b7280", width: 40 }}>row {r.row}</span>
                <span>{r.industry || "(no industry)"} / {r.category || "(no category)"} / {r.type || "(blank)"}</span>
                <span
                  style={{ color: "#9aa0ab", cursor: "pointer", fontWeight: 600 }}
                  onClick={() => setPreview(removeBusinessTagCsvRow(preview, r.row))}
                >
                  ✕
                </span>
                {!r.approved && <span style={{ color: "#a13a2b" }}>{r.reason}</span>}
                <span style={{ flex: 1 }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" disabled={preview.approvedCount === 0 || importing} onClick={handleConfirmImport}>
              {importing ? "Uploading…" : "Confirm Upload"}
            </button>
            <button className="btn btn-outline" type="button" onClick={() => setPreview(null)}>Cancel</button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreateIndustry} className="card" style={{ padding: 20, marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label className="field-label">Industry name</label>
            <input className="field-input" value={newIndustryName} onChange={(e) => setNewIndustryName(e.target.value)} required />
          </div>
          <button className="btn btn-primary" type="submit">Create</button>
          <button className="btn btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
        </form>
      )}

      <div className="card">
        <div style={{ display: "grid", gridTemplateColumns: "2.6fr 1fr", padding: "12px 20px", background: "#f7f7f8", borderBottom: "1px solid #e2e4e9", fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".03em" }}>
          <div>Industry</div><div>Categories</div>
        </div>
        {businessTagIndustries.length === 0 && <div style={{ padding: 20, fontSize: 13.5, color: "#9aa0ab" }}>No business tags yet. Create one or upload a CSV.</div>}
        {businessTagIndustries.map((ind) => {
          const categories = categoriesFor(ind.id);
          const industryExpanded = expandedIndustryId === ind.id;
          return (
            <div key={ind.id} style={{ borderBottom: "1px solid #eef0f2" }}>
              <div style={{ display: "grid", gridTemplateColumns: "2.6fr 1fr", padding: "14px 20px", alignItems: "center", fontSize: 13.5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  {editingIndustryId === ind.id ? (
                    <input className="field-input" style={{ flex: "1 1 200px" }} value={editingIndustryName} onChange={(e) => setEditingIndustryName(e.target.value)} onBlur={saveEditIndustry} autoFocus />
                  ) : (
                    <span style={{ fontWeight: 500, cursor: "pointer" }} onClick={() => setExpandedIndustryId(industryExpanded ? null : ind.id)}>
                      {industryExpanded ? "▾" : "▸"} {ind.name}
                    </span>
                  )}
                  <span style={{ color: "#4046c9", fontWeight: 500, cursor: "pointer" }} onClick={() => startEditIndustry(ind.id, ind.name)}>Edit</span>
                  <span style={{ color: confirmDeleteIndustryId === ind.id ? "#a13a2b" : "#4046c9", fontWeight: 500, cursor: "pointer" }} onClick={() => handleDeleteIndustry(ind.id)}>
                    {confirmDeleteIndustryId === ind.id ? "Confirm delete?" : "Delete"}
                  </span>
                </div>
                <div style={{ color: "#6b7280" }}>{categories.length}</div>
              </div>

              {industryExpanded && (
                <div style={{ padding: "0 20px 16px 40px" }}>
                  {categories.map((cat) => {
                    const types = typesFor(cat.id);
                    const categoryExpanded = expandedCategoryId === cat.id;
                    return (
                      <div key={cat.id} style={{ borderTop: "1px solid #f2f3f5", padding: "8px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 13 }}>
                          {editingCategoryId === cat.id ? (
                            <input className="field-input" style={{ flex: "1 1 220px" }} value={editingCategoryName} onChange={(e) => setEditingCategoryName(e.target.value)} onBlur={saveEditCategory} autoFocus />
                          ) : (
                            <span style={{ color: "#374151", cursor: "pointer" }} onClick={() => setExpandedCategoryId(categoryExpanded ? null : cat.id)}>
                              {categoryExpanded ? "▾" : "▸"} {cat.name}
                            </span>
                          )}
                          <span style={{ color: "#6b7280" }}>({types.length})</span>
                          <span style={{ color: "#4046c9", cursor: "pointer" }} onClick={() => startEditCategory(cat.id, cat.name)}>Edit</span>
                          <span style={{ color: "#a13a2b", cursor: "pointer" }} onClick={() => handleDeleteCategory(cat.id)}>Delete</span>
                        </div>

                        {categoryExpanded && (
                          <div style={{ padding: "8px 0 0 26px" }}>
                            {types.map((t) => (
                              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "5px 0", fontSize: 12.5 }}>
                                {editingTypeId === t.id ? (
                                  <input className="field-input" style={{ flex: "1 1 240px" }} value={editingTypeName} onChange={(e) => setEditingTypeName(e.target.value)} onBlur={saveEditType} autoFocus />
                                ) : (
                                  <span style={{ color: "#4b5566" }}>{t.name}</span>
                                )}
                                <span style={{ color: "#4046c9", cursor: "pointer" }} onClick={() => startEditType(t.id, t.name)}>Edit</span>
                                <span style={{ color: "#a13a2b", cursor: "pointer" }} onClick={() => deleteBusinessTagType(t.id)}>Delete</span>
                              </div>
                            ))}
                            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                              <input
                                className="field-input"
                                style={{ flex: "1 1 240px" }}
                                placeholder="New type name"
                                value={newTypeName}
                                onChange={(e) => setNewTypeName(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleAddType(cat.id)}
                              />
                              <button className="btn btn-outline" type="button" onClick={() => handleAddType(cat.id)}>+ Add</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <input
                      className="field-input"
                      style={{ flex: "1 1 240px" }}
                      placeholder="New category name"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddCategory(ind.id)}
                    />
                    <button className="btn btn-outline" type="button" onClick={() => handleAddCategory(ind.id)}>+ Add</button>
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
