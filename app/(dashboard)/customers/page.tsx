"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import type { Customer } from "@/lib/types";
import CustomerListView from "@/components/CustomerListView";

type LookupItem = { id: string; name: string };

function nameOf(list: LookupItem[], id: string | null): string {
  return list.find((x) => x.id === id)?.name ?? "";
}

export default function CustomersPage() {
  const { currentUser } = useStore();
  const [showForm, setShowForm] = useState(false);

  const canCreate = currentUser?.role === "ADMIN" || currentUser?.role === "MANAGER";

  if (!currentUser) return null;

  // SALESPERSON's own follow-up queue (own slot only, pool tabs);
  // ADMIN/MANAGER's unified team/company-wide list (no pool tabs, all
  // assignees shown). See CustomerListView for what each scope does.
  const scope: "own" | "all" = currentUser.role === "SALESPERSON" ? "own" : "all";

  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Customers</div>
        <div style={{ display: "flex", gap: 10 }}>
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

      <CustomerListView scope={scope} />
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
  const router = useRouter();
  const {
    currentUser,
    customers,
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
    fieldRequirements,
    teams,
    reassignCustomer,
  } = useStore();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [optionalPhone, setOptionalPhone] = useState("");
  const activeUsers = users.filter((u) => u.active);
  const [assignedToUserId, setAssignedToUserId] = useState("");
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
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [remark, setRemark] = useState("");
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dupes, setDupes] = useState<Customer[] | null>(null);
  const [dupeAssignee, setDupeAssignee] = useState<Record<string, string>>({});
  const [assigning, setAssigning] = useState(false);

  const filteredSubAreas = subAreas.filter((s) => s.areaId === areaId);
  const filteredCategories = businessTagCategories.filter((c) => c.industryId === businessIndustryId);
  const filteredTypes = businessTagTypes.filter((t) => t.categoryId === businessCategoryId);

  function isFieldRequired(fieldKey: string): boolean {
    return fieldRequirements.find((f) => f.fieldKey === fieldKey)?.required ?? false;
  }

  function Asterisk({ fieldKey }: { fieldKey: string }) {
    return isFieldRequired(fieldKey) ? <span style={{ color: "#a13a2b" }}> *</span> : null;
  }

  // each assignee dropdown excludes whoever is already picked in the other two
  // slots (ADMIN excluded — doesn't do sales). A MANAGER picks from their own
  // team; an ADMIN may pick any member of any team (the member's team decides
  // which team's seat they take).
  function assigneeOptions(excluding: string[]) {
    return activeUsers.filter((u) =>
      u.role !== "ADMIN"
      && !!u.teamId
      && !excluding.includes(u.id)
      && (currentUser?.role === "ADMIN" || u.teamId === currentUser?.teamId)
    );
  }

  // members who could take a seat on an existing customer: a manager's own team (not already holding a seat on it); an admin: anyone
  function dupeCandidates(c: Customer) {
    return activeUsers.filter((u) =>
      u.role !== "ADMIN"
      && !!u.teamId
      && (currentUser?.role === "ADMIN" || u.teamId === currentUser?.teamId)
      && !c.assignments.some((s) => s.userId === u.id)
    );
  }

  function assignExisting(c: Customer) {
    if (assigning) return;
    const userId = dupeAssignee[c.id];
    const user = users.find((u) => u.id === userId);
    if (!user?.teamId) return;
    const taken = new Set(c.assignments.filter((s) => s.teamId === user.teamId).map((s) => s.slot));
    const slot = ([1, 2, 3] as const).find((n) => !taken.has(n));
    if (!slot) {
      alert(`${user.name}'s team already has all 3 seats on this customer.`);
      return;
    }
    setAssigning(true);
    const result = reassignCustomer(c.id, user.teamId, slot, userId);
    if (!result.ok) {
      setAssigning(false);
      alert(result.error ?? "Could not assign this customer.");
      return;
    }
    router.push(`/customers/${c.id}`);
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

    const enteredPhones = [phone.trim(), optionalPhone.trim()].filter(Boolean);
    const found = customers.filter((c) => enteredPhones.some((p) => c.phone === p || c.optionalPhone === p));
    if (found.length > 0) {
      setDupeAssignee({});
      setDupes(found);
      return;
    }
    await createCustomer();
  }

  async function createCustomer() {
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
      budgetMin: budgetMin === "" ? null : Number(budgetMin),
      budgetMax: budgetMax === "" ? null : Number(budgetMax),
      optionalPhone,
      remark,
    });
    setSubmitting(false);
    if (!result.ok && result.customerId) {
      // created but seats failed: go to the customer (re-submitting would duplicate it)
      router.push(`/customers/${result.customerId}`);
      return;
    }
    if (!result.ok) {
      setFormError(result.error ?? "Could not add customer.");
      return;
    }
    // Land straight on the new customer's profile -- Admin/Manager
    // creating one almost always wants to assign it right away, not
    // re-find it in the list. onClose() unmounts this form as part of
    // navigating away.
    if (result.customerId) {
      router.push(`/customers/${result.customerId}`);
    } else {
      onClose();
    }
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
    <>
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
            <label className="field-label">Optional Phone</label>
            <input type="tel" className="field-input" value={optionalPhone} onChange={(e) => setOptionalPhone(e.target.value)} />
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
            <label className="field-label">Budget Min</label>
            <input type="number" className="field-input" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
          </FormField>
          <FormField>
            <label className="field-label">Budget Max</label>
            <input type="number" className="field-input" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
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
                <option key={u.id} value={u.id}>{u.name}{currentUser?.role === "ADMIN" ? ` (${teams.find((t) => t.id === u.teamId)?.name ?? "—"})` : ""}</option>
              ))}
            </select>
          </FormField>
          <FormField>
            <label className="field-label">Assigned To 2</label>
            <select className="field-input" value={assignedToUserId2} onChange={(e) => setAssignedToUserId2(e.target.value)}>
              <option value="">—</option>
              {assigneeOptions([assignedToUserId, assignedToUserId3]).map((u) => (
                <option key={u.id} value={u.id}>{u.name}{currentUser?.role === "ADMIN" ? ` (${teams.find((t) => t.id === u.teamId)?.name ?? "—"})` : ""}</option>
              ))}
            </select>
          </FormField>
          <FormField>
            <label className="field-label">Assigned To 3</label>
            <select className="field-input" value={assignedToUserId3} onChange={(e) => setAssignedToUserId3(e.target.value)}>
              <option value="">—</option>
              {assigneeOptions([assignedToUserId, assignedToUserId2]).map((u) => (
                <option key={u.id} value={u.id}>{u.name}{currentUser?.role === "ADMIN" ? ` (${teams.find((t) => t.id === u.teamId)?.name ?? "—"})` : ""}</option>
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

      {dupes && (
        <div className="modal-overlay" style={{ zIndex: 1001 }} onClick={(e) => { if (e.target === e.currentTarget) { setDupes(null); setDupeAssignee({}); } }}>
          <div className="card modal-card" style={{ maxWidth: 720 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>This phone number is already in the system</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 14 }}>
              You don't need to create it again — open it, or assign it to a member of your team.
            </div>
            {dupes.map((c) => {
              const candidates = dupeCandidates(c);
              return (
                <div key={c.id} style={{ padding: "12px 0", borderTop: "1px solid #eef0f2" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                    {c.name} — {c.businessName || "—"} — {nameOf(businessTagTypes, c.businessTypeId) || "—"}
                  </div>
                  <div style={{ fontSize: 12, color: "#9aa0ab", margin: "2px 0 8px" }}>
                    Created by {teams.find((t) => t.id === c.createdByTeamId)?.name ?? "—"}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button className="btn btn-outline" type="button" onClick={() => router.push(`/customers/${c.id}`)}>Open</button>
                    {candidates.length > 0 ? (
                      <>
                        <select
                          className="field-input"
                          style={{ width: "auto" }}
                          value={dupeAssignee[c.id] ?? ""}
                          onChange={(e) => setDupeAssignee((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        >
                          <option value="">— assign to —</option>
                          {candidates.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}{currentUser?.role === "ADMIN" ? ` (${teams.find((t) => t.id === u.teamId)?.name ?? "—"})` : ""}
                            </option>
                          ))}
                        </select>
                        <button className="btn btn-primary" type="button" disabled={assigning || !candidates.some((u) => u.id === dupeAssignee[c.id])} onClick={() => assignExisting(c)}>
                          Assign
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: 12.5, color: "#9aa0ab" }}>No free member to assign.</span>
                    )}
                  </div>
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
              <button className="btn btn-outline" type="button" onClick={() => { setDupes(null); setDupeAssignee({}); }}>Cancel</button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={async () => {
                  setDupes(null);
                  setDupeAssignee({});
                  await createCustomer();
                }}
              >
                Create anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
