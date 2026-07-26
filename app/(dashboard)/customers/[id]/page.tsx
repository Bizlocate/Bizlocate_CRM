"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { ACTIVITY_STYLES, ActivityType } from "@/lib/types";

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
    reassignCustomer,
    deleteCustomer,
    addActivity,
    addTask,
    toggleTaskDone,
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
  const [reassignTo, setReassignTo] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!currentUser || !customer) return null;

  const assignedUser = users.find((u) => u.id === customer.assignedToUserId);
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
    addTask(customer!.id, taskTitle.trim(), taskDue.trim() || "No due date");
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

  return (
    <div style={{ padding: "28px 32px" }}>
      <a href="#" onClick={(e) => { e.preventDefault(); router.push("/customers"); }} style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>
        ← Back to Customers
      </a>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: 14 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{customer.name}</div>
          <div style={{ fontSize: 13.5, color: "#6b7280", marginTop: 6 }}>
            {customer.email} · {customer.phone} · Assigned: {assignedUser?.name ?? "—"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {currentUser.role === "ADMIN" && (
            <select
              className="field-input"
              style={{ width: "auto" }}
              value={reassignTo || customer.assignedToUserId}
              onChange={(e) => {
                const result = reassignCustomer(customer.id, e.target.value);
                if (!result.ok) {
                  alert(result.error ?? "Could not reassign customer.");
                  return;
                }
                setReassignTo(e.target.value);
              }}
            >
              {users.filter((u) => u.active).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          )}
          {currentUser.role === "ADMIN" && (
            <button className="btn btn-danger" onClick={handleDelete}>
              {confirmDelete ? "Confirm delete?" : "Delete"}
            </button>
          )}
        </div>
      </div>

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
