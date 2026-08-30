"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { useStore } from "@/lib/store";
import { STAGE_STYLES, type Customer } from "@/lib/types";

type LookupItem = { id: string; name: string };

function nameOf(list: LookupItem[], id: string | null): string {
  return list.find((x) => x.id === id)?.name ?? "";
}

const EXPORT_FIELDS: { key: string; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "stage", label: "Stage" },
  { key: "assignedTo", label: "Assigned To" },
  { key: "source", label: "Source" },
  { key: "area", label: "Area" },
  { key: "subArea", label: "Subarea" },
  { key: "propertyType", label: "Property Type" },
  { key: "purpose", label: "Purpose" },
  { key: "businessIndustry", label: "Business Industry" },
  { key: "businessCategory", label: "Business Category" },
  { key: "businessType", label: "Business Type" },
  { key: "race", label: "Race" },
  { key: "language", label: "Language" },
  { key: "businessName", label: "Business Name" },
  { key: "firsttimeBranch", label: "Firsttime/Branch" },
  { key: "targetRace", label: "Target Race" },
  { key: "targetType", label: "Target Type" },
  { key: "budget", label: "Budget" },
  { key: "remark", label: "Remark" },
];

export default function CustomersPage() {
  const router = useRouter();
  const {
    currentUser,
    visibleCustomers,
    users,
    stages,
    activities,
    leadSources,
    areas,
    subAreas,
    propertyTypes,
    purposes,
    businessTagIndustries,
    businessTagCategories,
    businessTagTypes,
    races,
    languages,
    firsttimeBranchTypes,
    targetRaces,
    targetTypes,
    budgets,
  } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const [searchStageId, setSearchStageId] = useState("");
  const [searchAssignedTo, setSearchAssignedTo] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterSourceId, setFilterSourceId] = useState("");
  const [filterAreaId, setFilterAreaId] = useState("");
  const [filterSubAreaId, setFilterSubAreaId] = useState("");
  const [filterPropertyTypeId, setFilterPropertyTypeId] = useState("");
  const [filterBusinessIndustryId, setFilterBusinessIndustryId] = useState("");
  const [filterBusinessCategoryId, setFilterBusinessCategoryId] = useState("");
  const [filterBusinessTypeId, setFilterBusinessTypeId] = useState("");
  const [filterRaceId, setFilterRaceId] = useState("");
  const [filterFirsttimeBranchId, setFilterFirsttimeBranchId] = useState("");
  const [filterPurposeId, setFilterPurposeId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showExportModal, setShowExportModal] = useState(false);
  const [poolTab, setPoolTab] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");

  const canCreate = currentUser?.role === "ADMIN" || currentUser?.role === "MANAGER";
  const canExport = currentUser?.role === "ADMIN";
  const showAssignedTo = currentUser?.role !== "SALESPERSON";
  const isSalesperson = currentUser?.role === "SALESPERSON";

  const filteredCustomers = useMemo(() => {
    const name = searchName.trim().toLowerCase();
    const phone = searchPhone.trim().toLowerCase();
    const keyword = searchKeyword.trim().toLowerCase();
    return visibleCustomers.filter((c) => {
      if (name && !c.name.toLowerCase().includes(name)) return false;
      if (phone && !c.phone.toLowerCase().includes(phone)) return false;
      if (searchStageId && c.stageId !== searchStageId) return false;
      if (showAssignedTo && searchAssignedTo && !assigneeIds(c).includes(searchAssignedTo)) return false;
      if (filterSourceId && c.sourceId !== filterSourceId) return false;
      if (filterAreaId && c.areaId !== filterAreaId) return false;
      if (filterSubAreaId && c.subAreaId !== filterSubAreaId) return false;
      if (filterPropertyTypeId && c.propertyTypeId !== filterPropertyTypeId) return false;
      if (filterBusinessIndustryId && c.businessIndustryId !== filterBusinessIndustryId) return false;
      if (filterBusinessCategoryId && c.businessCategoryId !== filterBusinessCategoryId) return false;
      if (filterBusinessTypeId && c.businessTypeId !== filterBusinessTypeId) return false;
      if (filterRaceId && c.raceId !== filterRaceId) return false;
      if (filterFirsttimeBranchId && c.firsttimeBranchId !== filterFirsttimeBranchId) return false;
      if (filterPurposeId && c.purposeId !== filterPurposeId) return false;
      if (isSalesperson && currentUser) {
        const myPool =
          c.assignedToUserId === currentUser.id ? c.pool1 :
          c.assignedToUserId2 === currentUser.id ? c.pool2 :
          c.assignedToUserId3 === currentUser.id ? c.pool3 :
          null;
        if (myPool !== poolTab) return false;
      }
      if (keyword) {
        const hit = activities.some(
          (a) => a.customerId === c.id && (a.content.toLowerCase().includes(keyword) || a.followUp.toLowerCase().includes(keyword))
        );
        if (!hit) return false;
      }
      return true;
    });
  }, [
    visibleCustomers, activities, searchName, searchPhone, searchStageId, searchAssignedTo, searchKeyword, showAssignedTo,
    filterSourceId, filterAreaId, filterSubAreaId, filterPropertyTypeId, filterBusinessIndustryId, filterBusinessCategoryId,
    filterBusinessTypeId, filterRaceId, filterFirsttimeBranchId, filterPurposeId, isSalesperson, currentUser, poolTab,
  ]);

  if (!currentUser) return null;

  function stageName(stageId: string) {
    return stages.find((s) => s.id === stageId)?.name ?? "";
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
  }

  const filterSubAreaOptions = filterAreaId ? subAreas.filter((s) => s.areaId === filterAreaId) : subAreas;
  const filterCategoryOptions = filterBusinessIndustryId
    ? businessTagCategories.filter((c) => c.industryId === filterBusinessIndustryId)
    : businessTagCategories;
  const filterTypeOptions = filterBusinessCategoryId
    ? businessTagTypes.filter((t) => t.categoryId === filterBusinessCategoryId)
    : businessTagTypes;

  function assigneeIds(c: { assignedToUserId: string | null; assignedToUserId2: string | null; assignedToUserId3: string | null }): string[] {
    return [c.assignedToUserId, c.assignedToUserId2, c.assignedToUserId3].filter((id): id is string => !!id);
  }

  function assigneeNames(c: { assignedToUserId: string | null; assignedToUserId2: string | null; assignedToUserId3: string | null }): string {
    return assigneeIds(c)
      .map((id) => users.find((u) => u.id === id)?.name ?? "")
      .filter(Boolean)
      .join(", ");
  }

  const fieldResolvers: Record<string, (c: Customer) => string> = {
    name: (c) => c.name,
    phone: (c) => c.phone,
    stage: (c) => stageName(c.stageId),
    assignedTo: (c) => assigneeNames(c),
    source: (c) => nameOf(leadSources, c.sourceId),
    area: (c) => nameOf(areas, c.areaId),
    subArea: (c) => nameOf(subAreas, c.subAreaId),
    propertyType: (c) => nameOf(propertyTypes, c.propertyTypeId),
    purpose: (c) => nameOf(purposes, c.purposeId),
    businessIndustry: (c) => nameOf(businessTagIndustries, c.businessIndustryId),
    businessCategory: (c) => nameOf(businessTagCategories, c.businessCategoryId),
    businessType: (c) => nameOf(businessTagTypes, c.businessTypeId),
    race: (c) => nameOf(races, c.raceId),
    language: (c) => nameOf(languages, c.languageId),
    businessName: (c) => c.businessName,
    firsttimeBranch: (c) => nameOf(firsttimeBranchTypes, c.firsttimeBranchId),
    targetRace: (c) => nameOf(targetRaces, c.targetRaceId),
    targetType: (c) => nameOf(targetTypes, c.targetTypeId),
    budget: (c) => nameOf(budgets, c.budgetId),
    remark: (c) => c.remark,
  };

  function toggleAll() {
    setSelectedIds((prev) => {
      const allSelected = filteredCustomers.length > 0 && filteredCustomers.every((c) => prev.has(c.id));
      if (allSelected) return new Set();
      return new Set(filteredCustomers.map((c) => c.id));
    });
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runExport(format: "csv" | "xlsx", fieldKeys: string[]) {
    const rows = visibleCustomers.filter((c) => selectedIds.has(c.id));
    const data = rows.map((c) => {
      const row: Record<string, string> = {};
      for (const key of fieldKeys) {
        const label = EXPORT_FIELDS.find((f) => f.key === key)?.label ?? key;
        row[label] = fieldResolvers[key](c);
      }
      return row;
    });
    const sheet = XLSX.utils.json_to_sheet(data);
    const dateStr = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
      const csv = XLSX.utils.sheet_to_csv(sheet);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `customers-export-${dateStr}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Customers");
      XLSX.writeFile(book, `customers-export-${dateStr}.xlsx`);
    }
    setShowExportModal(false);
  }

  // Created Date, Business Type, Business Name, Tel No, Customer Name, Sub Area, Source, Stage, [Assigned Agent(s)], Purpose, Last Updated
  const LIST_COLS = [100, 130, 150, 110, 150, 140, 100, 100, ...(showAssignedTo ? [170] : []), 100, 100];
  const gridCols = `${canExport ? "32px " : ""}${LIST_COLS.map((w) => `${w}px`).join(" ")} 30px`;
  const gridMinWidth = (canExport ? 32 : 0) + LIST_COLS.reduce((a, b) => a + b, 0) + 30;
  const allFilteredSelected = filteredCustomers.length > 0 && filteredCustomers.every((c) => selectedIds.has(c.id));

  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Customers</div>
        <div style={{ display: "flex", gap: 10 }}>
          {canExport && selectedIds.size > 0 && (
            <button className="btn btn-outline" onClick={() => setShowExportModal(true)}>
              Export ({selectedIds.size})
            </button>
          )}
          {canCreate && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              + New Customer
            </button>
          )}
        </div>
      </div>

      {showForm && canCreate && (
        <NewCustomerForm onClose={() => setShowForm(false)} />
      )}

      {showExportModal && (
        <ExportModal onClose={() => setShowExportModal(false)} onExport={runExport} />
      )}

      {isSalesperson && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {(["ACTIVE", "INACTIVE"] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={poolTab === p ? "btn btn-primary" : "btn btn-outline"}
              onClick={() => setPoolTab(p)}
            >
              {p === "ACTIVE" ? "Active Pool" : "Potential Pool"}
            </button>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: 20, marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 160px" }}>
          <label className="field-label">Name</label>
          <input className="field-input" value={searchName} onChange={(e) => setSearchName(e.target.value)} placeholder="Search name" />
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <label className="field-label">Phone</label>
          <input className="field-input" value={searchPhone} onChange={(e) => setSearchPhone(e.target.value)} placeholder="Search phone" />
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <label className="field-label">Stage</label>
          <select className="field-input" value={searchStageId} onChange={(e) => setSearchStageId(e.target.value)}>
            <option value="">All</option>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {showAssignedTo && (
          <div style={{ flex: "1 1 160px" }}>
            <label className="field-label">Assigned To</label>
            <select className="field-input" value={searchAssignedTo} onChange={(e) => setSearchAssignedTo(e.target.value)}>
              <option value="">All</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}
        <div style={{ flex: "1 1 200px" }}>
          <label className="field-label">Keyword (in log)</label>
          <input className="field-input" value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} placeholder="Search notes, calls, visits" />
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <label className="field-label">Source</label>
          <select className="field-input" value={filterSourceId} onChange={(e) => setFilterSourceId(e.target.value)}>
            <option value="">All</option>
            {leadSources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <label className="field-label">Area</label>
          <select className="field-input" value={filterAreaId} onChange={(e) => { setFilterAreaId(e.target.value); setFilterSubAreaId(""); }}>
            <option value="">All</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <label className="field-label">Sub Area</label>
          <select className="field-input" value={filterSubAreaId} onChange={(e) => setFilterSubAreaId(e.target.value)}>
            <option value="">All</option>
            {filterSubAreaOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <label className="field-label">Property Type</label>
          <select className="field-input" value={filterPropertyTypeId} onChange={(e) => setFilterPropertyTypeId(e.target.value)}>
            <option value="">All</option>
            {propertyTypes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <label className="field-label">Business Industry</label>
          <select className="field-input" value={filterBusinessIndustryId} onChange={(e) => { setFilterBusinessIndustryId(e.target.value); setFilterBusinessCategoryId(""); setFilterBusinessTypeId(""); }}>
            <option value="">All</option>
            {businessTagIndustries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <label className="field-label">Business Category</label>
          <select className="field-input" value={filterBusinessCategoryId} onChange={(e) => { setFilterBusinessCategoryId(e.target.value); setFilterBusinessTypeId(""); }}>
            <option value="">All</option>
            {filterCategoryOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <label className="field-label">Business Type</label>
          <select className="field-input" value={filterBusinessTypeId} onChange={(e) => setFilterBusinessTypeId(e.target.value)}>
            <option value="">All</option>
            {filterTypeOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <label className="field-label">Race</label>
          <select className="field-input" value={filterRaceId} onChange={(e) => setFilterRaceId(e.target.value)}>
            <option value="">All</option>
            {races.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <label className="field-label">FirstTime / Branch</label>
          <select className="field-input" value={filterFirsttimeBranchId} onChange={(e) => setFilterFirsttimeBranchId(e.target.value)}>
            <option value="">All</option>
            {firsttimeBranchTypes.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <label className="field-label">Purpose</label>
          <select className="field-input" value={filterPurposeId} onChange={(e) => setFilterPurposeId(e.target.value)}>
            <option value="">All</option>
            {purposes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <button
          className="btn btn-outline"
          type="button"
          onClick={() => {
            setSearchName("");
            setSearchPhone("");
            setSearchStageId("");
            setSearchAssignedTo("");
            setSearchKeyword("");
            setFilterSourceId("");
            setFilterAreaId("");
            setFilterSubAreaId("");
            setFilterPropertyTypeId("");
            setFilterBusinessIndustryId("");
            setFilterBusinessCategoryId("");
            setFilterBusinessTypeId("");
            setFilterRaceId("");
            setFilterFirsttimeBranchId("");
            setFilterPurposeId("");
          }}
        >
          Clear
        </button>
      </div>

      <div className="card">
        <div style={{ padding: "14px 20px 0", fontSize: 13.5 }}>
          <span style={{ color: "#6b7280" }}>Total Customer</span>
          <span style={{ color: "#6b7280" }}> : </span>
          <span style={{ fontWeight: 700 }}>{filteredCustomers.length}</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: gridMinWidth }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: gridCols,
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
              {canExport && (
                <div>
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} />
                </div>
              )}
              <div>Created Date</div>
              <div>Business Type</div>
              <div>Business Name</div>
              <div>Tel No</div>
              <div>Customer Name</div>
              <div>Sub Area</div>
              <div>Source</div>
              <div>Stage</div>
              {showAssignedTo && <div>Assigned Agent(s)</div>}
              <div>Purpose</div>
              <div>Last Updated</div>
              <div></div>
            </div>
            {filteredCustomers.length === 0 && (
              <div style={{ padding: "20px", fontSize: 13.5, color: "#9aa0ab" }}>No customers match.</div>
            )}
            {filteredCustomers.map((c) => {
              const style = STAGE_STYLES[stageName(c.stageId)] ?? { bg: "#eef0f4", color: "#4b5566" };
              return (
                <div
                  key={c.id}
                  onClick={() => router.push(`/customers/${c.id}`)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: gridCols,
                    padding: "14px 20px",
                    borderBottom: "1px solid #eef0f2",
                    alignItems: "center",
                    fontSize: 13.5,
                    cursor: "pointer",
                  }}
                >
                  {canExport && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleOne(c.id)} />
                    </div>
                  )}
                  <div style={{ color: "#6b7280" }}>{formatDate(c.createdAt)}</div>
                  <div style={{ color: "#6b7280" }}>{nameOf(businessTagTypes, c.businessTypeId) || "—"}</div>
                  <div style={{ color: "#6b7280" }}>{c.businessName || "—"}</div>
                  <div style={{ color: "#6b7280" }}>{c.phone}</div>
                  <div style={{ fontWeight: 500 }}>{c.name}</div>
                  <div style={{ color: "#6b7280" }}>{nameOf(subAreas, c.subAreaId) || "—"}</div>
                  <div style={{ color: "#6b7280" }}>{nameOf(leadSources, c.sourceId) || "—"}</div>
                  <div>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "4px 10px",
                        borderRadius: 20,
                        background: style.bg,
                        color: style.color,
                      }}
                    >
                      {stageName(c.stageId)}
                    </span>
                  </div>
                  {showAssignedTo && <div style={{ color: "#6b7280" }}>{assigneeNames(c)}</div>}
                  <div style={{ color: "#6b7280" }}>{nameOf(purposes, c.purposeId) || "—"}</div>
                  <div style={{ color: "#6b7280" }}>{formatDate(c.updatedAt)}</div>
                  <div style={{ color: "#c5c8cf", fontSize: 16, textAlign: "right" }}>›</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExportModal({
  onClose,
  onExport,
}: {
  onClose: () => void;
  onExport: (format: "csv" | "xlsx", fieldKeys: string[]) => void;
}) {
  const [format, setFormat] = useState<"csv" | "xlsx">("csv");
  const [fieldKeys, setFieldKeys] = useState<Set<string>>(new Set(EXPORT_FIELDS.map((f) => f.key)));

  function toggleField(key: string) {
    setFieldKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card modal-card" style={{ maxWidth: 480 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Export Customers</div>
          <button className="btn btn-outline" type="button" onClick={onClose}>×</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="field-label">Format</label>
          <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5 }}>
              <input type="radio" checked={format === "csv"} onChange={() => setFormat("csv")} /> CSV
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5 }}>
              <input type="radio" checked={format === "xlsx"} onChange={() => setFormat("xlsx")} /> Excel (.xlsx)
            </label>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="field-label">Fields</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", marginTop: 4, maxHeight: 260, overflowY: "auto" }}>
            {EXPORT_FIELDS.map((f) => (
              <label key={f.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5 }}>
                <input type="checkbox" checked={fieldKeys.has(f.key)} onChange={() => toggleField(f.key)} /> {f.label}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="btn btn-primary"
            type="button"
            disabled={fieldKeys.size === 0}
            onClick={() => onExport(format, EXPORT_FIELDS.map((f) => f.key).filter((k) => fieldKeys.has(k)))}
          >
            Export
          </button>
          <button className="btn btn-outline" type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function FormRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>{children}</div>;
}

function FormField({ children }: { children: React.ReactNode }) {
  return <div style={{ flex: "1 1 0", minWidth: 150 }}>{children}</div>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, marginTop: 4 }}>{children}</div>;
}

function NewCustomerForm({ onClose }: { onClose: () => void }) {
  const {
    users,
    addCustomer,
    leadSources,
    areas,
    subAreas,
    propertyTypes,
    purposes,
    businessTagIndustries,
    businessTagCategories,
    businessTagTypes,
    races,
    languages,
    firsttimeBranchTypes,
    targetRaces,
    targetTypes,
    budgets,
    fieldRequirements,
  } = useStore();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const activeUsers = users.filter((u) => u.active);
  const [assignedToUserId, setAssignedToUserId] = useState(activeUsers[0]?.id ?? "");
  const [assignedToUserId2, setAssignedToUserId2] = useState("");
  const [assignedToUserId3, setAssignedToUserId3] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [subAreaId, setSubAreaId] = useState("");
  const [propertyTypeId, setPropertyTypeId] = useState("");
  const [purposeId, setPurposeId] = useState("");
  const [businessIndustryId, setBusinessIndustryId] = useState("");
  const [businessCategoryId, setBusinessCategoryId] = useState("");
  const [businessTypeId, setBusinessTypeId] = useState("");
  const [raceId, setRaceId] = useState("");
  const [languageId, setLanguageId] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [firsttimeBranchId, setFirsttimeBranchId] = useState("");
  const [targetRaceId, setTargetRaceId] = useState("");
  const [targetTypeId, setTargetTypeId] = useState("");
  const [budgetId, setBudgetId] = useState("");
  const [remark, setRemark] = useState("");
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const filteredSubAreas = subAreas.filter((s) => s.areaId === areaId);
  const filteredCategories = businessTagCategories.filter((c) => c.industryId === businessIndustryId);
  const filteredTypes = businessTagTypes.filter((t) => t.categoryId === businessCategoryId);

  function isFieldRequired(fieldKey: string): boolean {
    return fieldRequirements.find((f) => f.fieldKey === fieldKey)?.required ?? false;
  }

  function Asterisk({ fieldKey }: { fieldKey: string }) {
    return isFieldRequired(fieldKey) ? <span style={{ color: "#a13a2b" }}> *</span> : null;
  }

  // each assignee dropdown excludes whoever is already picked in the other two slots
  function assigneeOptions(excluding: string[]) {
    return activeUsers.filter((u) => !excluding.includes(u.id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const fieldValues: Record<string, string> = {
      phone,
      assigned_to: assignedToUserId,
      source: sourceId,
      area: areaId,
      sub_area: subAreaId,
      property_type: propertyTypeId,
      purpose: purposeId,
      business_industry: businessIndustryId,
      business_category: businessCategoryId,
      business_type: businessTypeId,
    };
    const failing = new Set<string>();
    for (const [fieldKey, value] of Object.entries(fieldValues)) {
      if (isFieldRequired(fieldKey) && !value) failing.add(fieldKey);
    }
    if (failing.size > 0) {
      setInvalidFields(failing);
      return;
    }

    setFormError("");
    setSubmitting(true);
    const result = await addCustomer({
      name,
      email: "",
      phone,
      assignedToUserId,
      assignedToUserId2: assignedToUserId2 || null,
      assignedToUserId3: assignedToUserId3 || null,
      sourceId: sourceId || null,
      areaId: areaId || null,
      subAreaId: subAreaId || null,
      propertyTypeId: propertyTypeId || null,
      purposeId: purposeId || null,
      businessIndustryId: businessIndustryId || null,
      businessCategoryId: businessCategoryId || null,
      businessTypeId: businessTypeId || null,
      raceId: raceId || null,
      languageId: languageId || null,
      businessName,
      firsttimeBranchId: firsttimeBranchId || null,
      targetRaceId: targetRaceId || null,
      targetTypeId: targetTypeId || null,
      budgetId: budgetId || null,
      remark,
    });
    setSubmitting(false);
    if (!result.ok) {
      setFormError(result.error ?? "Could not add customer.");
      return;
    }
    onClose();
  }

  function clearInvalid(fieldKey: string) {
    setInvalidFields((prev) => {
      if (!prev.has(fieldKey)) return prev;
      const next = new Set(prev);
      next.delete(fieldKey);
      return next;
    });
  }

  function fieldStyle(fieldKey: string): React.CSSProperties {
    return invalidFields.has(fieldKey) ? { borderColor: "#a13a2b" } : {};
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={handleSubmit} className="card modal-card" style={{ maxWidth: 900 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>New Customer</div>
          <button className="btn btn-outline" type="button" onClick={onClose}>×</button>
        </div>

        <FormRow>
          <FormField>
            <label className="field-label">Name</label>
            <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} required />
          </FormField>
          <FormField>
            <label className="field-label">Phone<Asterisk fieldKey="phone" /></label>
            <input className="field-input" style={fieldStyle("phone")} onFocus={() => clearInvalid("phone")} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </FormField>
        </FormRow>

        <SectionLabel>Business Profile</SectionLabel>

        <FormRow>
          <FormField>
            <label className="field-label">Source<Asterisk fieldKey="source" /></label>
            <select className="field-input" style={fieldStyle("source")} onFocus={() => clearInvalid("source")} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">—</option>
              {leadSources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </FormField>
          <FormField>
            <label className="field-label">Area<Asterisk fieldKey="area" /></label>
            <select className="field-input" style={fieldStyle("area")} onFocus={() => clearInvalid("area")} value={areaId} onChange={(e) => { setAreaId(e.target.value); setSubAreaId(""); }}>
              <option value="">—</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </FormField>
          <FormField>
            <label className="field-label">Subarea<Asterisk fieldKey="sub_area" /></label>
            <select className="field-input" style={fieldStyle("sub_area")} onFocus={() => clearInvalid("sub_area")} value={subAreaId} onChange={(e) => setSubAreaId(e.target.value)} disabled={!areaId}>
              <option value="">—</option>
              {filteredSubAreas.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </FormField>
        </FormRow>

        <FormRow>
          <FormField>
            <label className="field-label">Business Industry<Asterisk fieldKey="business_industry" /></label>
            <select className="field-input" style={fieldStyle("business_industry")} onFocus={() => clearInvalid("business_industry")} value={businessIndustryId} onChange={(e) => { setBusinessIndustryId(e.target.value); setBusinessCategoryId(""); setBusinessTypeId(""); }}>
              <option value="">—</option>
              {businessTagIndustries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </FormField>
          <FormField>
            <label className="field-label">Business Category<Asterisk fieldKey="business_category" /></label>
            <select className="field-input" style={fieldStyle("business_category")} onFocus={() => clearInvalid("business_category")} value={businessCategoryId} onChange={(e) => { setBusinessCategoryId(e.target.value); setBusinessTypeId(""); }} disabled={!businessIndustryId}>
              <option value="">—</option>
              {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField>
            <label className="field-label">Business Type<Asterisk fieldKey="business_type" /></label>
            <select className="field-input" style={fieldStyle("business_type")} onFocus={() => clearInvalid("business_type")} value={businessTypeId} onChange={(e) => setBusinessTypeId(e.target.value)} disabled={!businessCategoryId}>
              <option value="">—</option>
              {filteredTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </FormField>
        </FormRow>

        <FormRow>
          <FormField>
            <label className="field-label">Property Type<Asterisk fieldKey="property_type" /></label>
            <select className="field-input" style={fieldStyle("property_type")} onFocus={() => clearInvalid("property_type")} value={propertyTypeId} onChange={(e) => setPropertyTypeId(e.target.value)}>
              <option value="">—</option>
              {propertyTypes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </FormField>
          <FormField>
            <label className="field-label">Purpose<Asterisk fieldKey="purpose" /></label>
            <select className="field-input" style={fieldStyle("purpose")} onFocus={() => clearInvalid("purpose")} value={purposeId} onChange={(e) => setPurposeId(e.target.value)}>
              <option value="">—</option>
              {purposes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </FormField>
          <FormField>
            <label className="field-label">Race</label>
            <select className="field-input" value={raceId} onChange={(e) => setRaceId(e.target.value)}>
              <option value="">—</option>
              {races.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </FormField>
          <FormField>
            <label className="field-label">Language</label>
            <select className="field-input" value={languageId} onChange={(e) => setLanguageId(e.target.value)}>
              <option value="">—</option>
              {languages.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </FormField>
        </FormRow>

        <FormRow>
          <FormField>
            <label className="field-label">Business Name</label>
            <input className="field-input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </FormField>
          <FormField>
            <label className="field-label">Firsttime / Branch</label>
            <select className="field-input" value={firsttimeBranchId} onChange={(e) => setFirsttimeBranchId(e.target.value)}>
              <option value="">—</option>
              {firsttimeBranchTypes.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </FormField>
          <FormField>
            <label className="field-label">Target Race</label>
            <select className="field-input" value={targetRaceId} onChange={(e) => setTargetRaceId(e.target.value)}>
              <option value="">—</option>
              {targetRaces.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </FormField>
          <FormField>
            <label className="field-label">Target Type</label>
            <select className="field-input" value={targetTypeId} onChange={(e) => setTargetTypeId(e.target.value)}>
              <option value="">—</option>
              {targetTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </FormField>
          <FormField>
            <label className="field-label">Budget</label>
            <select className="field-input" value={budgetId} onChange={(e) => setBudgetId(e.target.value)}>
              <option value="">—</option>
              {budgets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </FormField>
        </FormRow>

        <SectionLabel>Assigned To</SectionLabel>

        <FormRow>
          <FormField>
            <label className="field-label">Assigned To 1<Asterisk fieldKey="assigned_to" /></label>
            <select
              className="field-input"
              style={fieldStyle("assigned_to")}
              onFocus={() => clearInvalid("assigned_to")}
              value={assignedToUserId}
              onChange={(e) => setAssignedToUserId(e.target.value)}
            >
              <option value="">—</option>
              {assigneeOptions([assignedToUserId2, assignedToUserId3]).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </FormField>
          <FormField>
            <label className="field-label">Assigned To 2</label>
            <select className="field-input" value={assignedToUserId2} onChange={(e) => setAssignedToUserId2(e.target.value)}>
              <option value="">—</option>
              {assigneeOptions([assignedToUserId, assignedToUserId3]).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </FormField>
          <FormField>
            <label className="field-label">Assigned To 3</label>
            <select className="field-input" value={assignedToUserId3} onChange={(e) => setAssignedToUserId3(e.target.value)}>
              <option value="">—</option>
              {assigneeOptions([assignedToUserId, assignedToUserId2]).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </FormField>
        </FormRow>

        <FormRow>
          <div style={{ flex: "1 1 100%" }}>
            <label className="field-label">Remark</label>
            <input className="field-input" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Note for the assigned salesperson" />
          </div>
        </FormRow>

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create"}</button>
          <button className="btn btn-outline" type="button" onClick={onClose}>Cancel</button>
        </div>
        {formError && <div className="error-text" style={{ marginTop: 10 }}>{formError}</div>}
      </form>
    </div>
  );
}
