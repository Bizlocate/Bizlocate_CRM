"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { ACTIVITY_STYLES, ActivityType } from "@/lib/types";
import { buildAssignmentMessage, buildWhatsAppLink } from "@/lib/whatsapp";

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const {
    currentUser,
    visibleCustomers,
    users,
    stages,
    activities,
    tasks,
    updateCustomerStage,
    updateCustomerProfile,
    updateCustomerRemark,
    reassignCustomer,
    deleteCustomer,
    addActivity,
    addTask,
    toggleTaskDone,
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

  const customer = visibleCustomers.find((c) => c.id === id);

  useEffect(() => {
    if (currentUser && !customer) router.replace("/customers");
  }, [currentUser, customer, router]);

  const [activityType, setActivityType] = useState<ActivityType>("NOTE");
  const [activityContent, setActivityContent] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [reassignTo1, setReassignTo1] = useState<string | null>(null);
  const [reassignTo2, setReassignTo2] = useState<string | null>(null);
  const [reassignTo3, setReassignTo3] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [businessNameDraft, setBusinessNameDraft] = useState(customer?.businessName ?? "");
  const [remarkDraft, setRemarkDraft] = useState(customer?.remark ?? "");

  useEffect(() => {
    setBusinessNameDraft(customer?.businessName ?? "");
    setRemarkDraft(customer?.remark ?? "");
  }, [customer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentUser || !customer) return null;

  const assignedSlots: { slot: 1 | 2 | 3; userId: string | null }[] = [
    { slot: 1, userId: customer.assignedToUserId },
    { slot: 2, userId: customer.assignedToUserId2 },
    { slot: 3, userId: customer.assignedToUserId3 },
  ];
  const assignedUsers = assignedSlots
    .map(({ slot, userId }) => ({ slot, user: userId ? users.find((u) => u.id === userId) : undefined }))
    .filter((a): a is { slot: 1 | 2 | 3; user: NonNullable<typeof a.user> } => !!a.user);
  const canSendWhatsApp = currentUser.role === "ADMIN" || currentUser.role === "MANAGER";
  const assignmentMessage = buildAssignmentMessage({
    customerName: customer.name,
    customerPhone: customer.phone,
    sourceName: leadSources.find((s) => s.id === customer.sourceId)?.name ?? "—",
    areaName: areas.find((a) => a.id === customer.areaId)?.name ?? "—",
    subAreaName: subAreas.find((s) => s.id === customer.subAreaId)?.name ?? "—",
    businessTypeName: businessTagTypes.find((t) => t.id === customer.businessTypeId)?.name ?? "—",
    raceName: races.find((r) => r.id === customer.raceId)?.name ?? "—",
    languageName: languages.find((l) => l.id === customer.languageId)?.name ?? "—",
    budgetName: budgets.find((b) => b.id === customer.budgetId)?.name ?? "—",
  });
  const whatsAppTargets = canSendWhatsApp
    ? assignedUsers
        .filter(({ user }) => !!user.phone)
        .map(({ user }) => ({ user, link: buildWhatsAppLink(user.phone!, assignmentMessage) }))
    : [];
  const canEditProfile =
    currentUser.role === "ADMIN" || currentUser.role === "MANAGER" || assignedUsers.some(({ user }) => user.id === currentUser.id);
  const canEditRemark = currentUser.role === "ADMIN" || currentUser.role === "MANAGER";
  const filteredSubAreas = subAreas.filter((s) => s.areaId === customer.areaId);
  const filteredCategories = businessTagCategories.filter((c) => c.industryId === customer.businessIndustryId);
  const filteredTypes = businessTagTypes.filter((t) => t.categoryId === customer.businessCategoryId);
  const customerActivities = activities.filter((a) => a.customerId === customer.id);
  const customerTasks = tasks.filter((t) => t.customerId === customer.id);
  const openTasks = customerTasks.filter((t) => !t.done);
  const doneTasks = customerTasks.filter((t) => t.done);

  function handleLogActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!activityContent.trim()) return;
    addActivity(customer!.id, activityType, activityContent.trim(), followUp.trim() ? `Follow-up: ${followUp.trim()}` : "");
    setActivityContent("");
    setFollowUp("");
  }

  function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    addTask(customer!.id, taskTitle.trim(), taskDue.trim());
    setTaskTitle("");
    setTaskDue("");
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteCustomer(customer!.id);
    router.push("/customers");
  }

  function profileSelect(
    label: string,
    value: string | null,
    options: { id: string; name: string }[],
    onChange: (value: string) => void,
    disabled = false
  ) {
    return (
      <div>
        <div style={{ fontSize: 11.5, color: "#9aa0ab", marginBottom: 4 }}>{label}</div>
        {canEditProfile ? (
          <select className="field-input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
            <option value="">—</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        ) : (
          <div style={{ fontSize: 13.5 }}>{options.find((o) => o.id === value)?.name ?? "—"}</div>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: "28px 32px" }}>
      <a href="#" onClick={(e) => { e.preventDefault(); router.push("/customers"); }} style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>
        ← Back to Customers
      </a>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: 14 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{customer.name}</div>
          <div style={{ fontSize: 13.5, color: "#6b7280", marginTop: 6, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <span>
              {customer.email} · {customer.phone} · Assigned: {assignedUsers.length > 0 ? assignedUsers.map(({ user }) => user.name).join(", ") : "—"}
            </span>
            {whatsAppTargets.map(({ user, link }) => (
              <a
                key={user.id}
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#1e7a41",
                  background: "#e7f6ec",
                  padding: "3px 10px",
                  borderRadius: 20,
                  textDecoration: "none",
                }}
              >
                WhatsApp{whatsAppTargets.length > 1 ? ` — ${user.name}` : ""}
              </a>
            ))}
          </div>
        </div>
        {currentUser.role === "ADMIN" && (
          <button className="btn btn-danger" onClick={handleDelete}>
            {confirmDelete ? "Confirm delete?" : "Delete"}
          </button>
        )}
      </div>

      {currentUser.role === "ADMIN" && (
        <div style={{ marginTop: 14, display: "flex", gap: 20, flexWrap: "wrap" }}>
          {(() => {
            const rows = [
              { slot: 1 as const, value: reassignTo1, setValue: setReassignTo1, current: customer.assignedToUserId, clearable: false },
              { slot: 2 as const, value: reassignTo2, setValue: setReassignTo2, current: customer.assignedToUserId2, clearable: true },
              { slot: 3 as const, value: reassignTo3, setValue: setReassignTo3, current: customer.assignedToUserId3, clearable: true },
            ];
            return rows.map(({ slot, value, setValue, current, clearable }) => {
              const otherCurrent = rows.filter((r) => r.slot !== slot).map((r) => r.current);
              const options = users.filter((u) => u.active && !otherCurrent.includes(u.id));
              return (
                <div key={slot} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#9aa0ab", fontWeight: 500 }}>Assigned {slot}:</span>
                  <select
                    className="field-input"
                    style={{ width: "auto" }}
                    value={value ?? current ?? ""}
                    onChange={(e) => setValue(e.target.value)}
                  >
                    {clearable && <option value="">—</option>}
                    {options.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  {value !== null && value !== (current ?? "") && (
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        const result = reassignCustomer(customer.id, slot, value || null);
                        if (!result.ok) {
                          alert(result.error ?? "Could not reassign customer.");
                          return;
                        }
                        setValue(null);
                      }}
                    >
                      Confirm
                    </button>
                  )}
                </div>
              );
            });
          })()}
        </div>
      )}

      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>Stage:</span>
        <select
          className="field-input"
          style={{ width: "auto" }}
          value={customer.stageId}
          onChange={(e) => updateCustomerStage(customer.id, e.target.value)}
        >
          {[...stages].sort((a, b) => a.order - b.order).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="card" style={{ marginTop: 20, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Business Profile</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {profileSelect("Source", customer.sourceId, leadSources, (v) => updateCustomerProfile(customer.id, { sourceId: v || null }))}
          {profileSelect("Area", customer.areaId, areas, (v) => updateCustomerProfile(customer.id, { areaId: v || null, subAreaId: null }))}
          {profileSelect("Subarea", customer.subAreaId, filteredSubAreas, (v) => updateCustomerProfile(customer.id, { subAreaId: v || null }), !customer.areaId)}
          {profileSelect("Property Type", customer.propertyTypeId, propertyTypes, (v) => updateCustomerProfile(customer.id, { propertyTypeId: v || null }))}
          {profileSelect("Purpose", customer.purposeId, purposes, (v) => updateCustomerProfile(customer.id, { purposeId: v || null }))}
          {profileSelect("Business Industry", customer.businessIndustryId, businessTagIndustries, (v) => updateCustomerProfile(customer.id, { businessIndustryId: v || null, businessCategoryId: null, businessTypeId: null }))}
          {profileSelect("Business Category", customer.businessCategoryId, filteredCategories, (v) => updateCustomerProfile(customer.id, { businessCategoryId: v || null, businessTypeId: null }), !customer.businessIndustryId)}
          {profileSelect("Business Type", customer.businessTypeId, filteredTypes, (v) => updateCustomerProfile(customer.id, { businessTypeId: v || null }), !customer.businessCategoryId)}
          {profileSelect("Race", customer.raceId, races, (v) => updateCustomerProfile(customer.id, { raceId: v || null }))}
          {profileSelect("Language", customer.languageId, languages, (v) => updateCustomerProfile(customer.id, { languageId: v || null }))}
          <div>
            <div style={{ fontSize: 11.5, color: "#9aa0ab", marginBottom: 4 }}>Business Name</div>
            {canEditProfile ? (
              <input
                className="field-input"
                value={businessNameDraft}
                onChange={(e) => setBusinessNameDraft(e.target.value)}
                onBlur={() => {
                  if (businessNameDraft !== customer.businessName) {
                    updateCustomerProfile(customer.id, { businessName: businessNameDraft });
                  }
                }}
              />
            ) : (
              <div style={{ fontSize: 13.5 }}>{customer.businessName || "—"}</div>
            )}
          </div>
          {profileSelect("Firsttime / Branch", customer.firsttimeBranchId, firsttimeBranchTypes, (v) => updateCustomerProfile(customer.id, { firsttimeBranchId: v || null }))}
          {profileSelect("Target Race", customer.targetRaceId, targetRaces, (v) => updateCustomerProfile(customer.id, { targetRaceId: v || null }))}
          {profileSelect("Target Type", customer.targetTypeId, targetTypes, (v) => updateCustomerProfile(customer.id, { targetTypeId: v || null }))}
          {profileSelect("Budget", customer.budgetId, budgets, (v) => updateCustomerProfile(customer.id, { budgetId: v || null }))}
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11.5, color: "#9aa0ab", marginBottom: 4 }}>Remark</div>
          {canEditRemark ? (
            <input
              className="field-input"
              value={remarkDraft}
              onChange={(e) => setRemarkDraft(e.target.value)}
              onBlur={() => {
                if (remarkDraft !== customer.remark) {
                  updateCustomerRemark(customer.id, remarkDraft);
                }
              }}
              placeholder="Note for the assigned salesperson"
            />
          ) : (
            <div style={{ fontSize: 13.5 }}>{customer.remark || "—"}</div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 28, marginTop: 28 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Activity Log</div>
          <form onSubmit={handleLogActivity} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <select
                className="field-input"
                style={{ width: 120 }}
                value={activityType}
                onChange={(e) => setActivityType(e.target.value as ActivityType)}
              >
                <option value="NOTE">Note</option>
                <option value="CALL">Call</option>
                <option value="VISIT">Visit</option>
              </select>
              <input
                className="field-input"
                style={{ flex: 1 }}
                placeholder="What happened?"
                value={activityContent}
                onChange={(e) => setActivityContent(e.target.value)}
              />
              <button className="btn btn-primary" type="submit">Log</button>
            </div>
            <input
              className="field-input"
              placeholder="Follow-up date (optional)"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
            />
          </form>
          <div className="card">
            {customerActivities.length === 0 && (
              <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>No activity logged yet.</div>
            )}
            {customerActivities.map((a) => {
              const style = ACTIVITY_STYLES[a.type];
              return (
                <div key={a.id} style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: style.bg, color: style.color }}>
                      {style.label}
                    </span>
                    <span style={{ fontSize: 12, color: "#9aa0ab" }}>{a.time} · {a.author}</span>
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{a.content}</div>
                  {a.followUp && <div style={{ fontSize: 12, color: "#8a5a00", fontWeight: 500 }}>{a.followUp}</div>}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Tasks</div>
          <form onSubmit={handleAddTask} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input
              className="field-input"
              style={{ flex: 1 }}
              placeholder="Task title"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
            />
            <input
              className="field-input"
              style={{ width: 130 }}
              placeholder="Due date"
              value={taskDue}
              onChange={(e) => setTaskDue(e.target.value)}
            />
            <button className="btn btn-primary" type="submit">+ Add</button>
          </form>
          <div className="card">
            {customerTasks.length === 0 && (
              <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>No tasks yet.</div>
            )}
            {openTasks.map((t) => (
              <div key={t.id} style={{ padding: "12px 16px", borderBottom: "1px solid #eef0f2", display: "flex", alignItems: "center", gap: 10 }}>
                <input type="checkbox" checked={false} onChange={() => toggleTaskDone(t.id)} style={{ width: 16, height: 16 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{t.title}</div>
                  <div style={{ fontSize: 11.5, color: "#9aa0ab", marginTop: 2 }}>Due {t.due}</div>
                </div>
              </div>
            ))}
            {doneTasks.length > 0 && (
              <div style={{ padding: "8px 16px", fontSize: 11, fontWeight: 600, color: "#9aa0ab", background: "#f7f7f8", textTransform: "uppercase", letterSpacing: ".03em" }}>
                Done
              </div>
            )}
            {doneTasks.map((t) => (
              <div key={t.id} style={{ padding: "12px 16px", borderBottom: "1px solid #eef0f2", display: "flex", alignItems: "center", gap: 10, opacity: 0.6 }}>
                <input type="checkbox" checked={true} onChange={() => toggleTaskDone(t.id)} style={{ width: 16, height: 16 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, textDecoration: "line-through" }}>{t.title}</div>
                  <div style={{ fontSize: 11.5, color: "#9aa0ab", marginTop: 2 }}>{t.due}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
