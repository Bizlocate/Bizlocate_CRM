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
  const { users, addCustomer } = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState(users[0]?.id ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !assignedToUserId) return;
    const result = await addCustomer({ name, email, phone, assignedToUserId });
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
        <button className="btn btn-primary" type="submit">Create</button>
        <button className="btn btn-outline" type="button" onClick={onClose}>Cancel</button>
      </form>
    </div>
  );
}
