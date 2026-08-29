"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { STAGE_STYLES } from "@/lib/types";

export default function CustomersPage() {
  const router = useRouter();
  const { currentUser, visibleCustomers, users, stages, activities } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [searchEmail, setSearchEmail] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const [searchStageId, setSearchStageId] = useState("");
  const [searchAssignedTo, setSearchAssignedTo] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");

  const canCreate = currentUser?.role === "ADMIN" || currentUser?.role === "MANAGER";
  const showAssignedTo = currentUser?.role !== "SALESPERSON";

  const filteredCustomers = useMemo(() => {
    const name = searchName.trim().toLowerCase();
    const email = searchEmail.trim().toLowerCase();
    const phone = searchPhone.trim().toLowerCase();
    const keyword = searchKeyword.trim().toLowerCase();
    return visibleCustomers.filter((c) => {
      if (name && !c.name.toLowerCase().includes(name)) return false;
      if (email && !c.email.toLowerCase().includes(email)) return false;
      if (phone && !c.phone.toLowerCase().includes(phone)) return false;
      if (searchStageId && c.stageId !== searchStageId) return false;
      if (showAssignedTo && searchAssignedTo && c.assignedToUserId !== searchAssignedTo) return false;
      if (keyword) {
        const hit = activities.some(
          (a) => a.customerId === c.id && (a.content.toLowerCase().includes(keyword) || a.followUp.toLowerCase().includes(keyword))
        );
        if (!hit) return false;
      }
      return true;
    });
  }, [visibleCustomers, activities, searchName, searchEmail, searchPhone, searchStageId, searchAssignedTo, searchKeyword, showAssignedTo]);

  if (!currentUser) return null;

  function stageName(stageId: string) {
    return stages.find((s) => s.id === stageId)?.name ?? "";
  }

  function userName(userId: string) {
    return users.find((u) => u.id === userId)?.name ?? "";
  }

  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Customers</div>
        {canCreate && (
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            + New Customer
          </button>
        )}
      </div>

      {showForm && canCreate && (
        <NewCustomerForm onClose={() => setShowForm(false)} />
      )}

      <div className="card" style={{ padding: 20, marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 160px" }}>
          <label className="field-label">Name</label>
          <input className="field-input" value={searchName} onChange={(e) => setSearchName(e.target.value)} placeholder="Search name" />
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <label className="field-label">Email</label>
          <input className="field-input" value={searchEmail} onChange={(e) => setSearchEmail(e.target.value)} placeholder="Search email" />
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
        <button
          className="btn btn-outline"
          type="button"
          onClick={() => {
            setSearchName("");
            setSearchEmail("");
            setSearchPhone("");
            setSearchStageId("");
            setSearchAssignedTo("");
            setSearchKeyword("");
          }}
        >
          Clear
        </button>
      </div>

      <div className="card">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: showAssignedTo ? "2.2fr 2fr 1.3fr 1fr 1.3fr 0.4fr" : "2.2fr 2fr 1.3fr 1fr 0.4fr",
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
          <div>Name</div>
          <div>Email</div>
          <div>Phone</div>
          <div>Stage</div>
          {showAssignedTo && <div>Assigned To</div>}
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
                gridTemplateColumns: showAssignedTo ? "2.2fr 2fr 1.3fr 1fr 1.3fr 0.4fr" : "2.2fr 2fr 1.3fr 1fr 0.4fr",
                padding: "14px 20px",
                borderBottom: "1px solid #eef0f2",
                alignItems: "center",
                fontSize: 13.5,
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 500 }}>{c.name}</div>
              <div style={{ color: "#6b7280" }}>{c.email}</div>
              <div style={{ color: "#6b7280" }}>{c.phone}</div>
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
              {showAssignedTo && <div style={{ color: "#6b7280" }}>{userName(c.assignedToUserId)}</div>}
              <div style={{ color: "#c5c8cf", fontSize: 16, textAlign: "right" }}>›</div>
            </div>
          );
        })}
      </div>
    </div>
  );
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
  } = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState(users[0]?.id ?? "");
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
  const [remark, setRemark] = useState("");

  const filteredSubAreas = subAreas.filter((s) => s.areaId === areaId);
  const filteredCategories = businessTagCategories.filter((c) => c.industryId === businessIndustryId);
  const filteredTypes = businessTagTypes.filter((t) => t.categoryId === businessCategoryId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !assignedToUserId) return;
    const result = await addCustomer({
      name,
      email,
      phone,
      assignedToUserId,
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
      remark,
    });
    if (!result.ok) {
      alert(result.error ?? "Could not add customer.");
      return;
    }
    onClose();
  }

  return (
    <div className="card" style={{ padding: 20, marginBottom: 20 }}>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 200px" }}>
          <label className="field-label">Name</label>
          <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <label className="field-label">Email</label>
          <input className="field-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div style={{ flex: "1 1 150px" }}>
          <label className="field-label">Phone</label>
          <input className="field-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <label className="field-label">Assigned To</label>
          <select className="field-input" value={assignedToUserId} onChange={(e) => setAssignedToUserId(e.target.value)}>
            {users.filter((u) => u.active).map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div style={{ flexBasis: "100%", height: 0 }} />
        <div style={{ fontSize: 13, fontWeight: 700, flexBasis: "100%", marginTop: 4 }}>Business Profile</div>

        <div style={{ flex: "1 1 180px" }}>
          <label className="field-label">Source</label>
          <select className="field-input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="">—</option>
            {leadSources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <label className="field-label">Area</label>
          <select className="field-input" value={areaId} onChange={(e) => { setAreaId(e.target.value); setSubAreaId(""); }}>
            <option value="">—</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <label className="field-label">Subarea</label>
          <select className="field-input" value={subAreaId} onChange={(e) => setSubAreaId(e.target.value)} disabled={!areaId}>
            <option value="">—</option>
            {filteredSubAreas.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <label className="field-label">Property Type</label>
          <select className="field-input" value={propertyTypeId} onChange={(e) => setPropertyTypeId(e.target.value)}>
            <option value="">—</option>
            {propertyTypes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <label className="field-label">Purpose</label>
          <select className="field-input" value={purposeId} onChange={(e) => setPurposeId(e.target.value)}>
            <option value="">—</option>
            {purposes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <label className="field-label">Business Industry</label>
          <select className="field-input" value={businessIndustryId} onChange={(e) => { setBusinessIndustryId(e.target.value); setBusinessCategoryId(""); setBusinessTypeId(""); }}>
            <option value="">—</option>
            {businessTagIndustries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <label className="field-label">Business Category</label>
          <select className="field-input" value={businessCategoryId} onChange={(e) => { setBusinessCategoryId(e.target.value); setBusinessTypeId(""); }} disabled={!businessIndustryId}>
            <option value="">—</option>
            {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <label className="field-label">Business Type</label>
          <select className="field-input" value={businessTypeId} onChange={(e) => setBusinessTypeId(e.target.value)} disabled={!businessCategoryId}>
            <option value="">—</option>
            {filteredTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <label className="field-label">Race</label>
          <select className="field-input" value={raceId} onChange={(e) => setRaceId(e.target.value)}>
            <option value="">—</option>
            {races.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <label className="field-label">Language</label>
          <select className="field-input" value={languageId} onChange={(e) => setLanguageId(e.target.value)}>
            <option value="">—</option>
            {languages.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <label className="field-label">Business Name</label>
          <input className="field-input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <label className="field-label">Firsttime / Branch</label>
          <select className="field-input" value={firsttimeBranchId} onChange={(e) => setFirsttimeBranchId(e.target.value)}>
            <option value="">—</option>
            {firsttimeBranchTypes.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <label className="field-label">Target Race</label>
          <select className="field-input" value={targetRaceId} onChange={(e) => setTargetRaceId(e.target.value)}>
            <option value="">—</option>
            {targetRaces.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <label className="field-label">Target Type</label>
          <select className="field-input" value={targetTypeId} onChange={(e) => setTargetTypeId(e.target.value)}>
            <option value="">—</option>
            {targetTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 100%" }}>
          <label className="field-label">Remark</label>
          <input className="field-input" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Note for the assigned salesperson" />
        </div>
        <button className="btn btn-primary" type="submit">Create</button>
        <button className="btn btn-outline" type="button" onClick={onClose}>Cancel</button>
      </form>
    </div>
  );
}
