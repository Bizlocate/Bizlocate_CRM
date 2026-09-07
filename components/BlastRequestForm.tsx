"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";

interface DraftRow {
  salespersonId: string;
  businessNameKeyword: string;
  areaId: string;
  subAreaId: string;
  businessIndustryId: string;
  businessCategoryId: string;
  businessTypeId: string;
}

const emptyRow: DraftRow = {
  salespersonId: "",
  businessNameKeyword: "",
  areaId: "",
  subAreaId: "",
  businessIndustryId: "",
  businessCategoryId: "",
  businessTypeId: "",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Manager's weekly "who wants blasting leads" submission -- one row per
 * team member who needs a list this week (members who don't need one are
 * simply left off, not given an empty row). Every criteria field is
 * optional; a blank field is "match all" for that dimension, resolved
 * against the whole customers table (not just this manager's own area) --
 * see the design spec.
 */
export default function BlastRequestForm() {
  const {
    currentUser,
    users,
    areas,
    subAreas,
    businessTagIndustries,
    businessTagCategories,
    businessTagTypes,
    blastRequests,
    submitBlastRequests,
  } = useStore();
  const [rows, setRows] = useState<DraftRow[]>([{ ...emptyRow }]);

  // A manager can request a blasting list for themselves too, not just
  // their salespeople -- so the dropdown offers the manager plus their
  // team's salespeople.
  const teamMembers = currentUser
    ? [currentUser, ...users.filter((u) => u.teamId === currentUser.teamId && u.role === "SALESPERSON")]
    : [];

  function updateRow(index: number, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { ...emptyRow }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit() {
    submitBlastRequests(
      rows
        .filter((r) => r.salespersonId)
        .map((r) => ({
          salespersonId: r.salespersonId,
          businessNameKeyword: r.businessNameKeyword,
          areaId: r.areaId || null,
          subAreaId: r.subAreaId || null,
          businessIndustryId: r.businessIndustryId || null,
          businessCategoryId: r.businessCategoryId || null,
          businessTypeId: r.businessTypeId || null,
        }))
    );
    setRows([{ ...emptyRow }]);
  }

  const myHistory = currentUser ? blastRequests.filter((r) => r.requestedBy === currentUser.id) : [];

  function salespersonName(id: string) {
    return users.find((u) => u.id === id)?.name ?? "Unknown";
  }

  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        {rows.map((row, index) => {
          const filteredSubAreas = subAreas.filter((s) => s.areaId === row.areaId);
          const filteredCategories = businessTagCategories.filter((c) => c.industryId === row.businessIndustryId);
          const filteredTypes = businessTagTypes.filter((t) => t.categoryId === row.businessCategoryId);
          return (
            <div key={index} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #eef0f2" }}>
              <div style={{ minWidth: 160 }}>
                <label className="field-label">Salesperson</label>
                <select className="field-input" value={row.salespersonId} onChange={(e) => updateRow(index, { salespersonId: e.target.value })}>
                  <option value="">Select…</option>
                  {teamMembers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div style={{ minWidth: 160 }}>
                <label className="field-label">Business name keyword</label>
                <input className="field-input" value={row.businessNameKeyword} onChange={(e) => updateRow(index, { businessNameKeyword: e.target.value })} placeholder="All" />
              </div>
              <div style={{ minWidth: 140 }}>
                <label className="field-label">Area</label>
                <select className="field-input" value={row.areaId} onChange={(e) => updateRow(index, { areaId: e.target.value, subAreaId: "" })}>
                  <option value="">All</option>
                  {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div style={{ minWidth: 140 }}>
                <label className="field-label">Sub-area</label>
                <select className="field-input" value={row.subAreaId} onChange={(e) => updateRow(index, { subAreaId: e.target.value })} disabled={!row.areaId}>
                  <option value="">All</option>
                  {filteredSubAreas.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div style={{ minWidth: 140 }}>
                <label className="field-label">Business industry</label>
                <select className="field-input" value={row.businessIndustryId} onChange={(e) => updateRow(index, { businessIndustryId: e.target.value, businessCategoryId: "", businessTypeId: "" })}>
                  <option value="">All</option>
                  {businessTagIndustries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div style={{ minWidth: 140 }}>
                <label className="field-label">Business category</label>
                <select className="field-input" value={row.businessCategoryId} onChange={(e) => updateRow(index, { businessCategoryId: e.target.value, businessTypeId: "" })} disabled={!row.businessIndustryId}>
                  <option value="">All</option>
                  {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ minWidth: 140 }}>
                <label className="field-label">Business type</label>
                <select className="field-input" value={row.businessTypeId} onChange={(e) => updateRow(index, { businessTypeId: e.target.value })} disabled={!row.businessCategoryId}>
                  <option value="">All</option>
                  {filteredTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              {rows.length > 1 && (
                <button className="btn btn-outline" type="button" onClick={() => removeRow(index)}>Remove</button>
              )}
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-outline" type="button" onClick={addRow}>+ Add Row</button>
          <button className="btn btn-primary" type="button" onClick={handleSubmit} disabled={!rows.some((r) => r.salespersonId)}>
            Submit
          </button>
        </div>
      </div>

      <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>Your submitted requests</div>
      <div className="card">
        {myHistory.length === 0 && <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>No requests submitted yet.</div>}
        {myHistory.map((r) => (
          <div key={r.id} style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2" }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{salespersonName(r.salespersonId)}</div>
            <div style={{ fontSize: 12, color: "#9aa0ab", marginTop: 3 }}>
              {r.status}
              {r.status === "APPROVED" && r.approvedTotal != null ? ` — ${r.approvedTotal} customers` : ""}
              {" · "}
              {formatDate(r.createdAt)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
