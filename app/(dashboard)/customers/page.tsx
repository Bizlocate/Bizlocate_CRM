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
      if (showAssignedTo && searchAssignedTo && !assigneeIds(c).includes(searchAssignedTo)) return false;
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

  function assigneeIds(c: { assignedToUserId: string; assignedToUserId2: string | null; assignedToUserId3: string | null }): string[] {
    return [c.assignedToUserId, c.assignedToUserId2, c.assignedToUserId3].filter((id): id is string => !!id);
  }

  function assigneeNames(c: { assignedToUserId: string; assignedToUserId2: string | null; assignedToUserId3: string | null }): string {
    return assigneeIds(c)
      .map((id) => users.find((u) => u.id === id)?.name ?? "")
      .filter(Boolean)
      .join(", ");
  }

  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Customers</div>
        {canCreate && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
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
            gridTemplateColumns: showAssignedTo ? "2.2fr 2fr 1.3fr 1fr 1.6fr 0.4fr" : "2.2fr 2fr 1.3fr 1fr 0.4fr",
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
                gridTemplateColumns: showAssignedTo ? "2.2fr 2fr 1.3fr 1fr 1.6fr 0.4fr" : "2.2fr 2fr 1.3fr 1fr 0.4fr",
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
              {showAssignedTo && <div style={{ color: "#6b7280" }}>{assigneeNames(c)}</div>}
              <div style={{ color: "#c5c8cf", fontSize: 16, textAlign: "right" }}>›</div>
            </div>
          );
        })}
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
  const [email, setEmail] = useState("");
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
      email,
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
          <FormField>
            <label className="field-label">Email</label>
            <input className="field-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
