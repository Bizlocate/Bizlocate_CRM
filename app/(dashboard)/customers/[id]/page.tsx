"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { ACTIVITY_STYLES, Activity, ActivityType, PROFILE_FIELD_LABELS, STAGE_STYLES } from "@/lib/types";
import { buildAssignmentMessage, buildWhatsAppLink } from "@/lib/whatsapp";

interface ProfileDraft {
  sourceId: string | null;
  areaId: string | null;
  subAreaId: string | null;
  propertyTypeId: string | null;
  purposeId: string | null;
  businessIndustryId: string | null;
  businessCategoryId: string | null;
  businessTypeId: string | null;
  raceId: string | null;
  languageId: string | null;
  businessName: string;
  firsttimeBranchId: string | null;
  targetRaceId: string | null;
  targetTypeId: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  optionalPhone: string;
}

function formatDueDate(due: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due);
  if (!m) return due;
  const [, yyyy, mm, dd] = m;
  return `${dd}-${mm}-${yyyy.slice(2)}`;
}

function draftFromCustomer(c: { sourceId: string | null; areaId: string | null; subAreaId: string | null; propertyTypeId: string | null; purposeId: string | null; businessIndustryId: string | null; businessCategoryId: string | null; businessTypeId: string | null; raceId: string | null; languageId: string | null; businessName: string; firsttimeBranchId: string | null; targetRaceId: string | null; targetTypeId: string | null; budgetMin: number | null; budgetMax: number | null; optionalPhone: string } | undefined): ProfileDraft {
  return {
    sourceId: c?.sourceId ?? null,
    areaId: c?.areaId ?? null,
    subAreaId: c?.subAreaId ?? null,
    propertyTypeId: c?.propertyTypeId ?? null,
    purposeId: c?.purposeId ?? null,
    businessIndustryId: c?.businessIndustryId ?? null,
    businessCategoryId: c?.businessCategoryId ?? null,
    businessTypeId: c?.businessTypeId ?? null,
    raceId: c?.raceId ?? null,
    languageId: c?.languageId ?? null,
    businessName: c?.businessName ?? "",
    firsttimeBranchId: c?.firsttimeBranchId ?? null,
    targetRaceId: c?.targetRaceId ?? null,
    targetTypeId: c?.targetTypeId ?? null,
    budgetMin: c?.budgetMin ?? null,
    budgetMax: c?.budgetMax ?? null,
    optionalPhone: c?.optionalPhone ?? "",
  };
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const {
    currentUser,
    visibleCustomers,
    users,
    stages,
    activities,
    changeLog,
    tasks,
    logActivityAndStage,
    removalReasons,
    removalRequests,
    requestClientRemoval,
    updateCustomerProfile,
    updateCustomerIdentity,
    updateCustomerRemark,
    reassignCustomer,
    logAssignmentRemoval,
    deleteAssigneeActivities,
    togglePool,
    deleteCustomer,
    addActivity,
    updateActivity,
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
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(draftFromCustomer(customer));
  const [remarkDraft, setRemarkDraft] = useState(customer?.remark ?? "");
  const [nameDraft, setNameDraft] = useState(customer?.name ?? "");
  const [phoneDraft, setPhoneDraft] = useState(customer?.phone ?? "");
  const [logStageId, setLogStageId] = useState("");
  const [showClosedAmountModal, setShowClosedAmountModal] = useState(false);
  const [closedAmountDraft, setClosedAmountDraft] = useState("");
  const [showRemoveReasonModal, setShowRemoveReasonModal] = useState(false);
  const [removeReasonId, setRemoveReasonId] = useState("");
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [editActivityDraft, setEditActivityDraft] = useState("");

  useEffect(() => {
    setProfileDraft(draftFromCustomer(customer));
    setRemarkDraft(customer?.remark ?? "");
    setNameDraft(customer?.name ?? "");
    setPhoneDraft(customer?.phone ?? "");
    setLogStageId("");
  }, [customer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentUser || !customer) return null;
  const currentRole = currentUser.role;

  const assignedSlots: { slot: 1 | 2 | 3; userId: string | null }[] = [
    { slot: 1, userId: customer.assignedToUserId },
    { slot: 2, userId: customer.assignedToUserId2 },
    { slot: 3, userId: customer.assignedToUserId3 },
  ];
  const assignedUsers = assignedSlots
    .map(({ slot, userId }) => ({ slot, user: userId ? users.find((u) => u.id === userId) : undefined }))
    .filter((a): a is { slot: 1 | 2 | 3; user: NonNullable<typeof a.user> } => !!a.user);
  const myAssignedSlot = assignedUsers.find(({ user }) => user.id === currentUser.id)?.slot ?? null;
  // salesperson only sees their own slot up top — teammates' names/stage stay hidden
  const visibleAssignedUsers = currentUser.role === "SALESPERSON"
    ? assignedUsers.filter(({ user }) => user.id === currentUser.id)
    : assignedUsers;

  function poolOf(slot: 1 | 2 | 3) {
    return slot === 1 ? customer!.pool1 : slot === 2 ? customer!.pool2 : customer!.pool3;
  }

  function stageOf(slot: 1 | 2 | 3) {
    return slot === 1 ? customer!.stage1Id : slot === 2 ? customer!.stage2Id : customer!.stage3Id;
  }

  function pendingRemovalForSlot(slot: 1 | 2 | 3, occupantUserId: string) {
    return removalRequests.some(
      (r) => r.customerId === customer!.id && r.slot === slot && r.requestedBy === occupantUserId && r.status === "PENDING"
    );
  }

  function handleTogglePool(slot: 1 | 2 | 3, pool: "ACTIVE" | "INACTIVE") {
    const next = pool === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const result = togglePool(customer!.id, slot, next);
    if (!result.ok) alert(result.error ?? "Could not change pool status.");
  }
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
    budgetMin: customer.budgetMin,
  });
  const whatsAppTargets = canSendWhatsApp
    ? assignedUsers
        .filter(({ user }) => !!user.phone)
        .map(({ user }) => ({ user, link: buildWhatsAppLink(user.phone!, assignmentMessage) }))
    : [];
  // Locks out someone who has requested their own removal from this customer
  // (any slot) until an admin/manager resolves it -- picking "Remove Client"
  // is an exit action, not an ongoing position, so nothing else about the
  // customer should be touched while it's pending.
  const myPendingRemoval = removalRequests.some(
    (r) => r.customerId === customer.id && r.requestedBy === currentUser.id && r.status === "PENDING"
  );
  const canEditProfile =
    currentUser.role === "ADMIN" || currentUser.role === "MANAGER" || (assignedUsers.some(({ user }) => user.id === currentUser.id) && !myPendingRemoval);
  const canEditRemark = currentUser.role === "ADMIN" || currentUser.role === "MANAGER";
  const canEditIdentity = currentUser.role === "ADMIN" || currentUser.role === "MANAGER";
  const filteredSubAreas = subAreas.filter((s) => s.areaId === profileDraft.areaId);
  const filteredCategories = businessTagCategories.filter((c) => c.industryId === profileDraft.businessIndustryId);
  const filteredTypes = businessTagTypes.filter((t) => t.categoryId === profileDraft.businessCategoryId);
  const savedProfileDraft = draftFromCustomer(customer);
  const profileDirty = (Object.keys(profileDraft) as (keyof ProfileDraft)[]).some((k) => profileDraft[k] !== savedProfileDraft[k]);
  const remarkDirty = remarkDraft !== (customer.remark ?? "");
  const nameDirty = nameDraft.trim() !== "" && nameDraft !== customer.name;
  const phoneDirty = phoneDraft !== customer.phone;
  const isDirty = profileDirty || remarkDirty || nameDirty || phoneDirty;

  function handleUpdate() {
    if (profileDirty) {
      const changedProfile = Object.fromEntries(
        (Object.keys(profileDraft) as (keyof ProfileDraft)[])
          .filter((k) => profileDraft[k] !== savedProfileDraft[k])
          .map((k) => [k, profileDraft[k]])
      );
      updateCustomerProfile(customer!.id, changedProfile);
    }
    if (remarkDirty) updateCustomerRemark(customer!.id, remarkDraft);
    const identityPatch: { name?: string; phone?: string } = {};
    if (nameDirty && nameDraft.trim()) identityPatch.name = nameDraft.trim();
    if (phoneDirty) identityPatch.phone = phoneDraft.trim();
    if (Object.keys(identityPatch).length > 0) updateCustomerIdentity(customer!.id, identityPatch);
  }

  function startEditActivity(a: Activity) {
    setEditingActivityId(a.id);
    setEditActivityDraft(a.content);
  }

  function cancelEditActivity() {
    setEditingActivityId(null);
    setEditActivityDraft("");
  }

  function saveEditActivity() {
    if (!editingActivityId || !editActivityDraft.trim()) return;
    updateActivity(editingActivityId, editActivityDraft.trim());
    cancelEditActivity();
  }

  function handleCancel() {
    setProfileDraft(draftFromCustomer(customer));
    setRemarkDraft(customer!.remark ?? "");
    setNameDraft(customer!.name ?? "");
    setPhoneDraft(customer!.phone ?? "");
  }
  const customerActivities = activities.filter((a) => a.customerId === customer.id);

  // admin doesn't do followups, so no log-entry form for them (history still visible below)
  const canLogActivity = currentUser.role !== "ADMIN"
    && (currentUser.role !== "MANAGER" || assignedUsers.some(({ user }) => user.id === currentUser.id))
    && !myPendingRemoval;

  function roleLabel(role: string) {
    return role === "SALESPERSON" ? "Sales Person" : role === "MANAGER" ? "Manager" : "Admin";
  }

  const logGroups: { key: string; name: string; slot?: 1 | 2 | 3; roleLabel: string; entries: Activity[] }[] = [];
  const groupedAuthorIds = new Set<string>();

  assignedUsers.forEach(({ slot, user }) => {
    groupedAuthorIds.add(user.id);
    logGroups.push({
      key: user.id,
      name: user.name,
      slot,
      roleLabel: roleLabel(user.role),
      entries: customerActivities.filter((a) => a.authorUserId === user.id),
    });
  });

  const otherAuthorIds = Array.from(new Set(customerActivities.map((a) => a.authorUserId).filter((id) => !groupedAuthorIds.has(id))));
  otherAuthorIds
    .map((authorId) => ({ authorId, latest: customerActivities.find((a) => a.authorUserId === authorId)! }))
    .sort((a, b) => new Date(b.latest.createdAt).getTime() - new Date(a.latest.createdAt).getTime())
    .forEach(({ authorId }) => {
      const entries = customerActivities.filter((a) => a.authorUserId === authorId);
      const author = users.find((u) => u.id === authorId);
      logGroups.push({
        key: authorId,
        name: author?.name ?? entries[0]?.author ?? "Unknown",
        roleLabel: author ? roleLabel(author.role) : "",
        entries,
      });
    });

  const visibleLogGroups = currentUser.role === "SALESPERSON"
    ? logGroups.filter((g) => g.key === currentUser.id)
    : logGroups;

  // admin/manager card header carries the slot + current stage; salesperson's
  // own card (the only one they see) keeps the plain name label
  function logGroupLabel(group: (typeof logGroups)[number]): string {
    if (group.slot && currentRole !== "SALESPERSON") {
      const stageName = pendingRemovalForSlot(group.slot, group.key)
        ? "Removal Pending"
        : stages.find((s) => s.id === stageOf(group.slot!))?.name;
      return [`Assigned ${group.slot}`, group.name, group.roleLabel, stageName].filter(Boolean).join(" · ");
    }
    const base = group.slot && assignedUsers.length > 1 ? `${group.name} (Assigned ${group.slot})` : group.name;
    return group.roleLabel ? `${base} · ${group.roleLabel}` : base;
  }

  const customerTasks = tasks.filter((t) => t.customerId === customer.id);
  const openTasks = customerTasks.filter((t) => !t.done);
  const doneTasks = customerTasks.filter((t) => t.done);

  const selectedLogStage = stages.find((s) => s.id === logStageId);

  function handleLogActivity(e: React.FormEvent) {
    e.preventDefault();
    if (myAssignedSlot) {
      if (!logStageId) return;
      if (logStageId === "__REMOVE_CLIENT__") {
        setShowRemoveReasonModal(true);
        return;
      }
      if (selectedLogStage?.requiresAmount) {
        setShowClosedAmountModal(true);
        return;
      }
      logActivityAndStage(customer!.id, myAssignedSlot, logStageId, activityType, activityContent, followUp.trim() ? `Follow-up: ${followUp.trim()}` : "");
      setActivityContent("");
      setFollowUp("");
      setLogStageId("");
    } else {
      if (!activityContent.trim()) return;
      addActivity(customer!.id, activityType, activityContent.trim(), followUp.trim() ? `Follow-up: ${followUp.trim()}` : "");
      setActivityContent("");
      setFollowUp("");
    }
  }

  function handleConfirmClosedAmount() {
    const amount = Number(closedAmountDraft);
    if (!closedAmountDraft.trim() || Number.isNaN(amount) || amount <= 0) return;
    logActivityAndStage(customer!.id, myAssignedSlot!, logStageId, activityType, activityContent, followUp.trim() ? `Follow-up: ${followUp.trim()}` : "", amount);
    setActivityContent("");
    setFollowUp("");
    setLogStageId("");
    setClosedAmountDraft("");
    setShowClosedAmountModal(false);
  }

  function handleConfirmRemoveReason() {
    if (!removeReasonId || !myAssignedSlot) return;
    const result = requestClientRemoval(customer!.id, myAssignedSlot, removeReasonId);
    if (!result.ok) {
      alert(result.error ?? "Could not submit the removal request.");
      return;
    }
    setLogStageId("");
    setRemoveReasonId("");
    setShowRemoveReasonModal(false);
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
          {canEditIdentity ? (
            <input
              className="field-input"
              style={{ fontSize: 22, fontWeight: 700, padding: "2px 8px", width: "auto", minWidth: 220 }}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
            />
          ) : (
            <div style={{ fontSize: 22, fontWeight: 700 }}>{customer.name}</div>
          )}
          <div style={{ fontSize: 13.5, color: "#6b7280", marginTop: 6, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <span>
              {canEditIdentity ? (
                <input
                  className="field-input"
                  style={{ width: 130, display: "inline-block", padding: "2px 6px", fontSize: 13.5 }}
                  value={phoneDraft}
                  onChange={(e) => setPhoneDraft(e.target.value)}
                />
              ) : (
                customer.phone
              )}
              {" "}· Assigned:{" "}
              {visibleAssignedUsers.length > 0 ? (
                visibleAssignedUsers.map(({ slot, user }, i) => {
                  const pool = poolOf(slot);
                  const canToggle = currentUser.role === "ADMIN" || currentUser.id === user.id;
                  const badgeStyle: React.CSSProperties = {
                    marginLeft: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    padding: "4px 12px",
                    borderRadius: 20,
                    border: "none",
                    background: pool === "ACTIVE" ? "#e7f6ec" : "#eceef1",
                    color: pool === "ACTIVE" ? "#1e7a41" : "#6b7280",
                  };
                  return (
                    <span key={user.id}>
                      {i > 0 && ", "}
                      {user.name}
                      {pool && (
                        canToggle ? (
                          <button type="button" onClick={() => handleTogglePool(slot, pool)} style={{ ...badgeStyle, cursor: "pointer" }}>
                            {pool === "ACTIVE" ? "Active" : "Potential"}
                          </button>
                        ) : (
                          <span style={badgeStyle}>{pool === "ACTIVE" ? "Active" : "Potential"}</span>
                        )
                      )}
                      {pendingRemovalForSlot(slot, user.id) ? (
                        <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "#fff4e0", color: "#8a5a00" }}>
                          Removal Pending
                        </span>
                      ) : currentUser.role === "SALESPERSON" ? (() => {
                        // stage badge for admin/manager moved down into each log card's header instead
                        const stage = stages.find((s) => s.id === stageOf(slot));
                        if (!stage) return null;
                        const stageStyle = STAGE_STYLES[stage.name] ?? { bg: "#eef0f4", color: "#4b5566" };
                        return (
                          <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: stageStyle.bg, color: stageStyle.color }}>
                            {stage.name}
                          </span>
                        );
                      })() : null}
                    </span>
                  );
                })
              ) : "—"}
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

      {(currentUser.role === "ADMIN" || currentUser.role === "MANAGER") && (
        <div style={{ marginTop: 14, display: "flex", gap: 20, flexWrap: "wrap" }}>
          {(() => {
            const rows = [
              { slot: 1 as const, value: reassignTo1, setValue: setReassignTo1, current: customer.assignedToUserId, clearable: true },
              { slot: 2 as const, value: reassignTo2, setValue: setReassignTo2, current: customer.assignedToUserId2, clearable: true },
              { slot: 3 as const, value: reassignTo3, setValue: setReassignTo3, current: customer.assignedToUserId3, clearable: true },
            ];
            return rows.map(({ slot, value, setValue, current, clearable }) => {
              const otherCurrent = rows.filter((r) => r.slot !== slot).map((r) => r.current);
              // scoped to the team that owns the customer's area — ADMIN excluded (doesn't
              // do sales), applies the same way whether an ADMIN or a MANAGER is reassigning.
              // No team on the area yet? No candidates — set it on /admin/area first.
              const areaTeamId = areas.find((a) => a.id === customer.areaId)?.teamId;
              const scopedOptions = users.filter((u) =>
                u.active
                && !otherCurrent.includes(u.id)
                && u.role !== "ADMIN"
                && !!areaTeamId
                && u.teamId === areaTeamId
              );
              // keep the current occupant selectable/visible even if out of a manager's scope
              const currentUserObj = current ? users.find((u) => u.id === current) : undefined;
              const options = currentUserObj && !scopedOptions.some((u) => u.id === currentUserObj.id)
                ? [currentUserObj, ...scopedOptions]
                : scopedOptions;
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
                        const isRemoval = value === "" && !!current;
                        const removedName = currentUserObj?.name ?? "this assignee";
                        if (isRemoval && !window.confirm(`Remove ${removedName} from Assigned ${slot}? This permanently deletes their activity log for this customer — it can't be undone. (A "Removed" entry stays in Change History.)`)) return;
                        // log + delete before clearing: both RLS checks need this slot
                        // (or another) to still tie the caller to the row
                        if (isRemoval) {
                          logAssignmentRemoval(customer.id, slot, removedName);
                          deleteAssigneeActivities(customer.id, current!);
                        }
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

      <div className="card" style={{ marginTop: 20, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Business Profile</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {profileSelect("Source", profileDraft.sourceId, leadSources, (v) => setProfileDraft((d) => ({ ...d, sourceId: v || null })))}
          {profileSelect("Area", profileDraft.areaId, areas, (v) => setProfileDraft((d) => ({ ...d, areaId: v || null, subAreaId: null })))}
          {profileSelect("Subarea", profileDraft.subAreaId, filteredSubAreas, (v) => setProfileDraft((d) => ({ ...d, subAreaId: v || null })), !profileDraft.areaId)}
          {profileSelect("Property Type", profileDraft.propertyTypeId, propertyTypes, (v) => setProfileDraft((d) => ({ ...d, propertyTypeId: v || null })))}
          {profileSelect("Purpose", profileDraft.purposeId, purposes, (v) => setProfileDraft((d) => ({ ...d, purposeId: v || null })))}
          {profileSelect("Business Industry", profileDraft.businessIndustryId, businessTagIndustries, (v) => setProfileDraft((d) => ({ ...d, businessIndustryId: v || null, businessCategoryId: null, businessTypeId: null })))}
          {profileSelect("Business Category", profileDraft.businessCategoryId, filteredCategories, (v) => setProfileDraft((d) => ({ ...d, businessCategoryId: v || null, businessTypeId: null })), !profileDraft.businessIndustryId)}
          {profileSelect("Business Type", profileDraft.businessTypeId, filteredTypes, (v) => setProfileDraft((d) => ({ ...d, businessTypeId: v || null })), !profileDraft.businessCategoryId)}
          {profileSelect("Race", profileDraft.raceId, races, (v) => setProfileDraft((d) => ({ ...d, raceId: v || null })))}
          {profileSelect("Language", profileDraft.languageId, languages, (v) => setProfileDraft((d) => ({ ...d, languageId: v || null })))}
          <div>
            <div style={{ fontSize: 11.5, color: "#9aa0ab", marginBottom: 4 }}>Business Name</div>
            {canEditProfile ? (
              <input
                className="field-input"
                value={profileDraft.businessName}
                onChange={(e) => setProfileDraft((d) => ({ ...d, businessName: e.target.value }))}
              />
            ) : (
              <div style={{ fontSize: 13.5 }}>{customer.businessName || "—"}</div>
            )}
          </div>
          {profileSelect("Firsttime / Branch", profileDraft.firsttimeBranchId, firsttimeBranchTypes, (v) => setProfileDraft((d) => ({ ...d, firsttimeBranchId: v || null })))}
          {profileSelect("Target Race", profileDraft.targetRaceId, targetRaces, (v) => setProfileDraft((d) => ({ ...d, targetRaceId: v || null })))}
          {profileSelect("Target Type", profileDraft.targetTypeId, targetTypes, (v) => setProfileDraft((d) => ({ ...d, targetTypeId: v || null })))}
          <div>
            <div style={{ fontSize: 11.5, color: "#9aa0ab", marginBottom: 4 }}>Budget Min</div>
            {canEditProfile ? (
              <input
                type="number"
                className="field-input"
                value={profileDraft.budgetMin ?? ""}
                onChange={(e) => setProfileDraft((d) => ({ ...d, budgetMin: e.target.value === "" ? null : Number(e.target.value) }))}
              />
            ) : (
              <div style={{ fontSize: 13.5 }}>{customer.budgetMin ?? "—"}</div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: "#9aa0ab", marginBottom: 4 }}>Budget Max</div>
            {canEditProfile ? (
              <input
                type="number"
                className="field-input"
                value={profileDraft.budgetMax ?? ""}
                onChange={(e) => setProfileDraft((d) => ({ ...d, budgetMax: e.target.value === "" ? null : Number(e.target.value) }))}
              />
            ) : (
              <div style={{ fontSize: 13.5 }}>{customer.budgetMax ?? "—"}</div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: "#9aa0ab", marginBottom: 4 }}>Optional Phone</div>
            {canEditProfile ? (
              <input
                type="tel"
                className="field-input"
                value={profileDraft.optionalPhone}
                onChange={(e) => setProfileDraft((d) => ({ ...d, optionalPhone: e.target.value }))}
              />
            ) : (
              <div style={{ fontSize: 13.5 }}>{customer.optionalPhone || "—"}</div>
            )}
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11.5, color: "#9aa0ab", marginBottom: 4 }}>Remark</div>
          {canEditRemark ? (
            <input
              className="field-input"
              value={remarkDraft}
              onChange={(e) => setRemarkDraft(e.target.value)}
              placeholder="Note for the assigned salesperson"
            />
          ) : (
            <div style={{ fontSize: 13.5 }}>{customer.remark || "—"}</div>
          )}
        </div>
        {isDirty && (
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <button className="btn btn-primary" type="button" onClick={handleUpdate}>Update</button>
            <button className="btn btn-outline" type="button" onClick={handleCancel}>Cancel</button>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 28, marginTop: 28 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Activity Log</div>
          {canLogActivity && (
            <form onSubmit={handleLogActivity} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {myAssignedSlot && (
                <div>
                  <div style={{ fontSize: 11.5, color: "#9aa0ab", marginBottom: 4 }}>Stage</div>
                  <select
                    className="field-input"
                    style={{ width: "auto" }}
                    value={logStageId}
                    onChange={(e) => setLogStageId(e.target.value)}
                  >
                    <option value="">— Select stage —</option>
                    {[...stages].sort((a, b) => a.order - b.order).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                    <option value="__REMOVE_CLIENT__">Remove Client</option>
                  </select>
                </div>
              )}
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
                  placeholder="What happened? (optional)"
                  value={activityContent}
                  onChange={(e) => setActivityContent(e.target.value)}
                />
                <button className="btn btn-primary" type="submit" disabled={!!myAssignedSlot && !logStageId}>Log</button>
              </div>
              <input
                className="field-input"
                placeholder="Follow-up date (optional)"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
              />
            </form>
          )}
          {showClosedAmountModal && (
            <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowClosedAmountModal(false); }}>
              <div className="card modal-card" style={{ maxWidth: 360 }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Closed amount</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
                  {selectedLogStage?.name} requires a closed amount.
                </div>
                <input
                  className="field-input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Amount"
                  value={closedAmountDraft}
                  onChange={(e) => setClosedAmountDraft(e.target.value)}
                  autoFocus
                />
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button className="btn btn-primary" type="button" onClick={handleConfirmClosedAmount}>Confirm</button>
                  <button className="btn btn-outline" type="button" onClick={() => setShowClosedAmountModal(false)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
          {showRemoveReasonModal && (
            <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowRemoveReasonModal(false); }}>
              <div className="card modal-card" style={{ maxWidth: 360 }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Remove client</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
                  This sends a removal request to admin/manager for approval — the customer isn't deleted, only your assignment.
                </div>
                <select className="field-input" value={removeReasonId} onChange={(e) => setRemoveReasonId(e.target.value)}>
                  <option value="">— Select reason —</option>
                  {removalReasons.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button className="btn btn-primary" type="button" disabled={!removeReasonId} onClick={handleConfirmRemoveReason}>Confirm</button>
                  <button className="btn btn-outline" type="button" onClick={() => setShowRemoveReasonModal(false)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
          {visibleLogGroups.length === 0 && (
            <div className="card" style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>No activity logged yet.</div>
          )}
          {visibleLogGroups.map((group) => (
            <div key={group.key} className="card" style={{ marginBottom: 16 }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid #eef0f2", background: "#f7f7f8", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>
                  {logGroupLabel(group)}
                </span>
                <span style={{ fontSize: 11.5, color: "#9aa0ab" }}>
                  {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}
                </span>
              </div>
              {group.entries.length === 0 ? (
                <div style={{ padding: 16, fontSize: 13.5, color: "#9aa0ab" }}>No activity logged yet.</div>
              ) : (
                group.entries.map((a) => {
                  const style = ACTIVITY_STYLES[a.type];
                  const isMine = a.authorUserId === currentUser.id;
                  const isEditing = editingActivityId === a.id;
                  return (
                    <div key={a.id} style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f2", display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: style.bg, color: style.color }}>
                          {style.label}
                        </span>
                        <span style={{ fontSize: 12, color: "#9aa0ab" }}>{a.time}</span>
                        {isMine && !isEditing && !myPendingRemoval && (
                          <button
                            type="button"
                            onClick={() => startEditActivity(a)}
                            style={{ marginLeft: "auto", fontSize: 11.5, color: "#4046c9", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                          >
                            Edit
                          </button>
                        )}
                      </div>
                      {isEditing ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <input
                            className="field-input"
                            value={editActivityDraft}
                            onChange={(e) => setEditActivityDraft(e.target.value)}
                            autoFocus
                          />
                          <div style={{ display: "flex", gap: 8 }}>
                            <button className="btn btn-primary" type="button" onClick={saveEditActivity} disabled={!editActivityDraft.trim()}>Save</button>
                            <button className="btn btn-outline" type="button" onClick={cancelEditActivity}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{a.content}</div>
                      )}
                      {a.followUp && <div style={{ fontSize: 12, color: "#8a5a00", fontWeight: 500 }}>{a.followUp}</div>}
                    </div>
                  );
                })
              )}
            </div>
          ))}
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
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              className="field-input"
              style={{ width: 150 }}
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
                  <div style={{ fontSize: 11.5, color: "#9aa0ab", marginTop: 2 }}>Due {formatDueDate(t.due)}</div>
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
                  <div style={{ fontSize: 11.5, color: "#9aa0ab", marginTop: 2 }}>{formatDueDate(t.due)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {canEditIdentity && (
        <div className="card" style={{ marginTop: 20, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Change History</div>
          {(() => {
            const entries = changeLog.filter((l) => l.customerId === customer.id);
            if (entries.length === 0) {
              return <div style={{ fontSize: 13.5, color: "#9aa0ab" }}>No changes logged yet.</div>;
            }
            return entries.map((l) => (
              <div key={l.id} style={{ padding: "10px 0", borderBottom: "1px solid #eef0f2", fontSize: 13 }}>
                <span style={{ color: "#9aa0ab" }}>{l.time}</span>
                {" · "}
                <span style={{ fontWeight: 600 }}>{l.changedByName}</span>
                {" · "}
                <span>{PROFILE_FIELD_LABELS[l.fieldKey] ?? l.fieldKey}</span>
                {": "}
                <span style={{ color: "#6b7280" }}>{l.oldValue || "—"}</span>
                {" → "}
                <span>{l.newValue || "—"}</span>
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}
