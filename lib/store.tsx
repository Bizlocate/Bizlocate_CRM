"use client";

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import {
  seedActivities,
  seedCustomers,
  seedNotifications,
  seedStages,
  seedTasks,
} from "./mock-data";
import { createClient } from "./supabase/client";
import { parseAreaCsv } from "./parseAreaCsv";
import { Activity, ActivityType, Area, Customer, CsvPreview, Notification, Role, Stage, SubArea, Task, Team, User } from "./types";

function mapProfile(row: { id: string; name: string; email: string; phone: string | null; role: Role; team_id: string | null; status: string; customer_limit: number | null }): User {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone, role: row.role, teamId: row.team_id, active: row.status === "ACTIVE", customerLimit: row.customer_limit };
}

function mapTeam(row: { id: string; name: string; manager_id: string | null }): Team {
  return { id: row.id, name: row.name, managerId: row.manager_id };
}

function mapArea(row: { id: string; name: string }): Area {
  return { id: row.id, name: row.name };
}

function mapSubArea(row: { id: string; area_id: string; name: string }): SubArea {
  return { id: row.id, areaId: row.area_id, name: row.name };
}

interface LoginResult {
  ok: boolean;
  error?: string;
}

interface Store {
  users: User[];
  teams: Team[];
  areas: Area[];
  subAreas: SubArea[];
  stages: Stage[];
  customers: Customer[];
  activities: Activity[];
  tasks: Task[];
  notifications: Notification[];
  currentUser: User | null;
  initialized: boolean;

  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;

  visibleCustomers: Customer[];

  addUser: (input: { name: string; email: string; phone: string; role: User["role"]; teamId: string | null; customerLimit: number | null; password?: string }) => Promise<{ tempPassword?: string; error?: string }>;
  toggleUserActive: (id: string) => void;
  updateUserRole: (id: string, role: Role) => void;
  updateUserTeam: (id: string, teamId: string | null) => void;
  updateUserCustomerLimit: (id: string, customerLimit: number | null) => void;
  deleteUser: (id: string) => Promise<{ ok: boolean; error?: string }>;
  resetUserPassword: (id: string, password?: string) => Promise<{ tempPassword?: string; error?: string }>;

  addTeam: (name: string, managerId: string | null) => void;
  updateTeam: (id: string, name: string, managerId: string | null) => void;
  deleteTeam: (id: string) => { ok: boolean; error?: string };

  addArea: (name: string) => void;
  updateArea: (id: string, name: string) => void;
  deleteArea: (id: string) => void;
  addSubArea: (areaId: string, name: string) => void;
  updateSubArea: (id: string, name: string) => void;
  deleteSubArea: (id: string) => void;
  previewAreaCsv: (csvText: string) => CsvPreview;
  confirmAreaCsvImport: (preview: CsvPreview) => Promise<{ ok: boolean; areasCreated: number; subAreasCreated: number; error?: string }>;

  addStage: (name: string, isDefault: boolean) => void;
  renameStage: (id: string, name: string) => void;
  moveStage: (id: string, direction: -1 | 1) => void;
  deleteStage: (id: string) => { ok: boolean; error?: string };

  addCustomer: (input: { name: string; email: string; phone: string; assignedToUserId: string }) => { ok: boolean; error?: string };
  reassignCustomer: (customerId: string, newAssigneeId: string) => { ok: boolean; error?: string };
  deleteCustomer: (customerId: string) => void;
  updateCustomerStage: (customerId: string, stageId: string) => void;

  addActivity: (customerId: string, type: ActivityType, content: string, followUp: string) => void;
  addTask: (customerId: string, title: string, due: string) => void;
  toggleTaskDone: (taskId: string) => void;

  markNotificationsRead: () => void;

  updateProfileName: (name: string) => void;
  updatePassword: (current: string, next: string) => Promise<{ ok: boolean; error?: string }>;
}

const StoreContext = createContext<Store | null>(null);

function genId(prefix: string) {
  return prefix + Math.random().toString(36).slice(2, 8);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [subAreas, setSubAreas] = useState<SubArea[]>([]);
  const [stages, setStages] = useState<Stage[]>(seedStages);
  const [customers, setCustomers] = useState<Customer[]>(seedCustomers);
  const [activities, setActivities] = useState<Activity[]>(seedActivities);
  const [tasks, setTasks] = useState<Task[]>(seedTasks);
  const [notifications, setNotifications] = useState<Notification[]>(seedNotifications);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  async function loadUsers(): Promise<User[]> {
    const supabase = createClient();
    const { data } = await supabase.from("profiles").select("*").order("name");
    const mapped = (data ?? []).map(mapProfile);
    setUsers(mapped);
    return mapped;
  }

  async function loadTeams(): Promise<Team[]> {
    const supabase = createClient();
    const { data } = await supabase.from("teams").select("*").order("name");
    const mapped = (data ?? []).map(mapTeam);
    setTeams(mapped);
    return mapped;
  }

  async function loadAreas(): Promise<Area[]> {
    const supabase = createClient();
    const { data } = await supabase.from("areas").select("*").order("name");
    const mapped = (data ?? []).map(mapArea);
    setAreas(mapped);
    return mapped;
  }

  async function loadSubAreas(): Promise<SubArea[]> {
    const supabase = createClient();
    const { data } = await supabase.from("sub_areas").select("*").order("name");
    const mapped = (data ?? []).map(mapSubArea);
    setSubAreas(mapped);
    return mapped;
  }

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const [, loadedUsers] = await Promise.all([loadTeams(), loadUsers(), loadAreas(), loadSubAreas()]);
        const profile = loadedUsers.find((u) => u.id === data.user!.id);
        if (profile) setCurrentUserId(profile.id);
      }
      setInitialized(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentUser = useMemo(
    () => users.find((u) => u.id === currentUserId) ?? null,
    [users, currentUserId]
  );

  async function login(email: string, password: string): Promise<LoginResult> {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) {
      return { ok: false, error: "Invalid email or password." };
    }
    const [, loadedUsers] = await Promise.all([loadTeams(), loadUsers(), loadAreas(), loadSubAreas()]);
    const profile = loadedUsers.find((u) => u.id === data.user.id);
    if (!profile || !profile.active) {
      await supabase.auth.signOut();
      return { ok: false, error: "This account has no CRM profile set up. Contact your administrator." };
    }
    setCurrentUserId(profile.id);
    return { ok: true };
  }

  function logout() {
    const supabase = createClient();
    supabase.auth.signOut();
    setCurrentUserId(null);
  }

  const visibleCustomers = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === "ADMIN") return customers;
    if (currentUser.role === "MANAGER") {
      const teamUserIds = new Set(users.filter((u) => u.teamId === currentUser.teamId).map((u) => u.id));
      return customers.filter((c) => teamUserIds.has(c.assignedToUserId));
    }
    return customers.filter((c) => c.assignedToUserId === currentUser.id);
  }, [customers, users, currentUser]);

  async function addUser(input: { name: string; email: string; phone: string; role: User["role"]; teamId: string | null; customerLimit: number | null; password?: string }) {
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = await res.json();
    if (!res.ok) {
      return { error: body.error ?? "Could not create user." };
    }
    await loadUsers();
    return { tempPassword: body.tempPassword as string };
  }

  function toggleUserActive(id: string) {
    const target = users.find((u) => u.id === id);
    if (!target) return;
    const nextActive = !target.active;
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, active: nextActive } : u)));
    const supabase = createClient();
    supabase
      .from("profiles")
      .update({ status: nextActive ? "ACTIVE" : "INACTIVE" })
      .eq("id", id)
      .then(({ error }) => {
        if (error) setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, active: !nextActive } : u)));
      });
  }

  function updateUserRole(id: string, role: Role) {
    const target = users.find((u) => u.id === id);
    if (!target) return;
    const prevRole = target.role;
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
    const supabase = createClient();
    supabase
      .from("profiles")
      .update({ role })
      .eq("id", id)
      .then(({ error }) => {
        if (error) setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role: prevRole } : u)));
      });
  }

  function updateUserTeam(id: string, teamId: string | null) {
    const target = users.find((u) => u.id === id);
    if (!target) return;
    const prevTeamId = target.teamId;
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, teamId } : u)));
    const supabase = createClient();
    supabase
      .from("profiles")
      .update({ team_id: teamId })
      .eq("id", id)
      .then(({ error }) => {
        if (error) setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, teamId: prevTeamId } : u)));
      });
  }

  function updateUserCustomerLimit(id: string, customerLimit: number | null) {
    const target = users.find((u) => u.id === id);
    if (!target) return;
    const prevLimit = target.customerLimit;
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, customerLimit } : u)));
    const supabase = createClient();
    supabase
      .from("profiles")
      .update({ customer_limit: customerLimit })
      .eq("id", id)
      .then(({ error }) => {
        if (error) setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, customerLimit: prevLimit } : u)));
      });
  }

  async function deleteUser(id: string) {
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    const body = await res.json();
    if (!res.ok) {
      return { ok: false, error: body.error ?? "Could not delete user." };
    }
    setUsers((prev) => prev.filter((u) => u.id !== id));
    return { ok: true };
  }

  async function resetUserPassword(id: string, password?: string) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const body = await res.json();
    if (!res.ok) {
      return { error: body.error ?? "Could not reset password." };
    }
    return { tempPassword: body.tempPassword as string };
  }

  function addTeam(name: string, managerId: string | null) {
    const supabase = createClient();
    supabase
      .from("teams")
      .insert({ name, manager_id: managerId })
      .select()
      .single()
      .then(({ data, error }) => {
        if (!error && data) setTeams((prev) => [...prev, mapTeam(data)]);
      });
  }

  function updateTeam(id: string, name: string, managerId: string | null) {
    setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, name, managerId } : t)));
    const supabase = createClient();
    supabase.from("teams").update({ name, manager_id: managerId }).eq("id", id).then(() => {});
  }

  function deleteTeam(id: string) {
    const memberCount = users.filter((u) => u.teamId === id).length;
    if (memberCount > 0) {
      return { ok: false, error: `${memberCount} member(s) are in this team. Remove them first.` };
    }
    setTeams((prev) => prev.filter((t) => t.id !== id));
    const supabase = createClient();
    supabase.from("teams").delete().eq("id", id).then(() => {});
    return { ok: true };
  }

  function addArea(name: string) {
    const supabase = createClient();
    supabase
      .from("areas")
      .insert({ name })
      .select()
      .single()
      .then(({ data, error }) => {
        if (!error && data) setAreas((prev) => [...prev, mapArea(data)]);
      });
  }

  function updateArea(id: string, name: string) {
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, name } : a)));
    const supabase = createClient();
    supabase.from("areas").update({ name }).eq("id", id).then(() => {});
  }

  function deleteArea(id: string) {
    setAreas((prev) => prev.filter((a) => a.id !== id));
    setSubAreas((prev) => prev.filter((s) => s.areaId !== id));
    const supabase = createClient();
    supabase.from("areas").delete().eq("id", id).then(() => {});
  }

  function addSubArea(areaId: string, name: string) {
    const supabase = createClient();
    supabase
      .from("sub_areas")
      .insert({ area_id: areaId, name })
      .select()
      .single()
      .then(({ data, error }) => {
        if (!error && data) setSubAreas((prev) => [...prev, mapSubArea(data)]);
      });
  }

  function updateSubArea(id: string, name: string) {
    setSubAreas((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    const supabase = createClient();
    supabase.from("sub_areas").update({ name }).eq("id", id).then(() => {});
  }

  function deleteSubArea(id: string) {
    setSubAreas((prev) => prev.filter((s) => s.id !== id));
    const supabase = createClient();
    supabase.from("sub_areas").delete().eq("id", id).then(() => {});
  }

  function previewAreaCsv(csvText: string): CsvPreview {
    return parseAreaCsv(csvText, areas, subAreas);
  }

  async function confirmAreaCsvImport(preview: CsvPreview) {
    const supabase = createClient();
    try {
      let areasCreated = 0;
      let subAreasCreated = 0;
      for (const entry of preview.approvedAreas) {
        let areaId: string;
        if (entry.isNew) {
          const { data, error } = await supabase.from("areas").insert({ name: entry.name }).select().single();
          if (error || !data) throw new Error(error?.message ?? `Could not create area "${entry.name}".`);
          areaId = data.id;
          areasCreated++;
        } else {
          const existing = areas.find((a) => a.name.toLowerCase() === entry.name.toLowerCase());
          if (!existing) throw new Error(`Area "${entry.name}" not found.`);
          areaId = existing.id;
        }
        const { data: inserted, error: subError } = await supabase
          .from("sub_areas")
          .upsert(
            entry.subAreaNames.map((name) => ({ area_id: areaId, name })),
            { onConflict: "area_id,name", ignoreDuplicates: true }
          )
          .select();
        if (subError) throw new Error(subError.message);
        subAreasCreated += inserted?.length ?? 0;
      }
      await Promise.all([loadAreas(), loadSubAreas()]);
      return { ok: true, areasCreated, subAreasCreated };
    } catch (err) {
      await Promise.all([loadAreas(), loadSubAreas()]);
      return { ok: false, areasCreated: 0, subAreasCreated: 0, error: err instanceof Error ? err.message : "Import failed." };
    }
  }

  function addStage(name: string, isDefault: boolean) {
    setStages((prev) => {
      const order = prev.length + 1;
      const next = isDefault ? prev.map((s) => ({ ...s, isDefault: false })) : prev;
      return [...next, { id: genId("s"), name, order, isDefault }];
    });
  }

  function renameStage(id: string, name: string) {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  }

  function moveStage(id: string, direction: -1 | 1) {
    setStages((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((s) => s.id === id);
      const swapIdx = idx + direction;
      if (idx === -1 || swapIdx < 0 || swapIdx >= sorted.length) return prev;
      const a = sorted[idx];
      const b = sorted[swapIdx];
      return prev.map((s) => {
        if (s.id === a.id) return { ...s, order: b.order };
        if (s.id === b.id) return { ...s, order: a.order };
        return s;
      });
    });
  }

  function deleteStage(id: string) {
    const count = customers.filter((c) => c.stageId === id).length;
    if (count > 0) {
      return { ok: false, error: `${count} customer(s) are on this stage. Move them first.` };
    }
    setStages((prev) => prev.filter((s) => s.id !== id));
    return { ok: true };
  }

  function assignmentError(userId: string, excludeCustomerId?: string) {
    const user = users.find((u) => u.id === userId);
    if (!user || user.customerLimit === null) return undefined;
    const count = customers.filter((c) => c.assignedToUserId === userId && c.id !== excludeCustomerId).length;
    if (count >= user.customerLimit) {
      return `${user.name} is at their customer limit (${user.customerLimit}).`;
    }
    return undefined;
  }

  function addCustomer(input: { name: string; email: string; phone: string; assignedToUserId: string }) {
    const error = assignmentError(input.assignedToUserId);
    if (error) return { ok: false, error };
    const defaultStage = stages.find((s) => s.isDefault) ?? stages[0];
    setCustomers((prev) => [
      ...prev,
      {
        id: genId("c"),
        name: input.name,
        email: input.email,
        phone: input.phone,
        assignedToUserId: input.assignedToUserId,
        stageId: defaultStage?.id ?? "",
      },
    ]);
    return { ok: true };
  }

  function reassignCustomer(customerId: string, newAssigneeId: string) {
    const customer = customers.find((c) => c.id === customerId);
    if (customer && customer.assignedToUserId !== newAssigneeId) {
      const error = assignmentError(newAssigneeId, customerId);
      if (error) return { ok: false, error };
    }
    setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, assignedToUserId: newAssigneeId } : c)));
    const assignee = users.find((u) => u.id === newAssigneeId);
    if (assignee && customer) {
      setNotifications((prev) => [
        { id: genId("n"), message: `${assignee.name} was assigned ${customer.name}.`, time: "just now", unread: true },
        ...prev,
      ]);
    }
    return { ok: true };
  }

  function deleteCustomer(customerId: string) {
    setCustomers((prev) => prev.filter((c) => c.id !== customerId));
  }

  function updateCustomerStage(customerId: string, stageId: string) {
    setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, stageId } : c)));
  }

  function addActivity(customerId: string, type: ActivityType, content: string, followUp: string) {
    setActivities((prev) => [
      { id: genId("a"), customerId, type, content, followUp, author: currentUser?.name ?? "", time: "just now" },
      ...prev,
    ]);
  }

  function addTask(customerId: string, title: string, due: string) {
    setTasks((prev) => [...prev, { id: genId("t"), customerId, title, due, done: false }]);
  }

  function toggleTaskDone(taskId: string) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)));
  }

  function markNotificationsRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  }

  function updateProfileName(name: string) {
    if (!currentUserId) return;
    setUsers((prev) => prev.map((u) => (u.id === currentUserId ? { ...u, name } : u)));
    const supabase = createClient();
    supabase.from("profiles").update({ name }).eq("id", currentUserId).then(() => {});
  }

  async function updatePassword(current: string, next: string) {
    if (!currentUser) return { ok: false, error: "Not signed in." };
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: currentUser.email, password: current });
    if (verifyError) {
      return { ok: false, error: "Check your current password." };
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  }

  const value: Store = {
    users,
    teams,
    areas,
    subAreas,
    stages,
    customers,
    activities,
    tasks,
    notifications,
    currentUser,
    initialized,
    login,
    logout,
    visibleCustomers,
    addCustomer,
    addUser,
    toggleUserActive,
    updateUserRole,
    updateUserTeam,
    updateUserCustomerLimit,
    deleteUser,
    resetUserPassword,
    addTeam,
    updateTeam,
    deleteTeam,
    addArea,
    updateArea,
    deleteArea,
    addSubArea,
    updateSubArea,
    deleteSubArea,
    previewAreaCsv,
    confirmAreaCsvImport,
    addStage,
    renameStage,
    moveStage,
    deleteStage,
    reassignCustomer,
    deleteCustomer,
    updateCustomerStage,
    addActivity,
    addTask,
    toggleTaskDone,
    markNotificationsRead,
    updateProfileName,
    updatePassword,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
