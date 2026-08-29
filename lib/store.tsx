"use client";

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { createClient } from "./supabase/client";
import { parseAreaCsv } from "./parseAreaCsv";
import { parseBusinessTagCsv } from "./parseBusinessTagCsv";
import {
  Activity,
  ActivityType,
  Area,
  BusinessTagCategory,
  BusinessTagIndustry,
  BusinessTagType,
  Customer,
  CsvBusinessTagPreview,
  CsvPreview,
  FirsttimeBranchType,
  Language,
  LeadSource,
  Notification,
  PropertyType,
  Purpose,
  Race,
  Role,
  Stage,
  SubArea,
  TargetRace,
  TargetType,
  Task,
  Team,
  User,
} from "./types";

function mapProfile(row: { id: string; name: string; email: string; phone: string | null; ic: string | null; role: Role; team_id: string | null; status: string; customer_limit: number | null }): User {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone, ic: row.ic, role: row.role, teamId: row.team_id, active: row.status === "ACTIVE", customerLimit: row.customer_limit };
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

function mapBusinessTagIndustry(row: { id: string; name: string }): BusinessTagIndustry {
  return { id: row.id, name: row.name };
}

function mapBusinessTagCategory(row: { id: string; industry_id: string; name: string }): BusinessTagCategory {
  return { id: row.id, industryId: row.industry_id, name: row.name };
}

function mapBusinessTagType(row: { id: string; category_id: string; name: string }): BusinessTagType {
  return { id: row.id, categoryId: row.category_id, name: row.name };
}

function mapLeadSource(row: { id: string; name: string }): LeadSource {
  return { id: row.id, name: row.name };
}

function mapPropertyType(row: { id: string; name: string }): PropertyType {
  return { id: row.id, name: row.name };
}

function mapPurpose(row: { id: string; name: string }): Purpose {
  return { id: row.id, name: row.name };
}

function mapLanguage(row: { id: string; name: string }): Language {
  return { id: row.id, name: row.name };
}

function mapFirsttimeBranchType(row: { id: string; name: string }): FirsttimeBranchType {
  return { id: row.id, name: row.name };
}

function mapRace(row: { id: string; name: string }): Race {
  return { id: row.id, name: row.name };
}

function mapTargetRace(row: { id: string; name: string }): TargetRace {
  return { id: row.id, name: row.name };
}

function mapTargetType(row: { id: string; name: string }): TargetType {
  return { id: row.id, name: row.name };
}

function mapStage(row: { id: string; name: string; order: number; is_default: boolean }): Stage {
  return { id: row.id, name: row.name, order: row.order, isDefault: row.is_default };
}

function mapCustomer(row: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  assigned_to: string;
  stage_id: string;
  source_id: string | null;
  area_id: string | null;
  sub_area_id: string | null;
  property_type_id: string | null;
  purpose_id: string | null;
  business_industry_id: string | null;
  business_category_id: string | null;
  business_type_id: string | null;
  race_id: string | null;
  language_id: string | null;
  business_name: string | null;
  firsttime_branch_id: string | null;
  target_race_id: string | null;
  target_type_id: string | null;
  remark: string | null;
}): Customer {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? "",
    phone: row.phone ?? "",
    assignedToUserId: row.assigned_to,
    stageId: row.stage_id,
    sourceId: row.source_id,
    areaId: row.area_id,
    subAreaId: row.sub_area_id,
    propertyTypeId: row.property_type_id,
    purposeId: row.purpose_id,
    businessIndustryId: row.business_industry_id,
    businessCategoryId: row.business_category_id,
    businessTypeId: row.business_type_id,
    raceId: row.race_id,
    languageId: row.language_id,
    businessName: row.business_name ?? "",
    firsttimeBranchId: row.firsttime_branch_id,
    targetRaceId: row.target_race_id,
    targetTypeId: row.target_type_id,
    remark: row.remark ?? "",
  };
}

export interface CustomerProfileInput {
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
  remark: string;
}

const emptyCustomerProfile: CustomerProfileInput = {
  sourceId: null,
  areaId: null,
  subAreaId: null,
  propertyTypeId: null,
  purposeId: null,
  businessIndustryId: null,
  businessCategoryId: null,
  businessTypeId: null,
  raceId: null,
  languageId: null,
  businessName: "",
  firsttimeBranchId: null,
  targetRaceId: null,
  targetTypeId: null,
  remark: "",
};

function mapActivity(row: {
  id: string;
  customer_id: string;
  type: ActivityType;
  content: string;
  follow_up: string | null;
  user_id: string;
  created_at: string;
}, usersById: Map<string, User>): Activity {
  return {
    id: row.id,
    customerId: row.customer_id,
    type: row.type,
    content: row.content,
    followUp: row.follow_up ?? "",
    author: usersById.get(row.user_id)?.name ?? "",
    time: formatTimestamp(row.created_at),
  };
}

function mapTask(row: { id: string; customer_id: string; title: string; due: string | null; done: boolean }): Task {
  return { id: row.id, customerId: row.customer_id, title: row.title, due: row.due ?? "No due date", done: row.done };
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

function mapNotification(row: { id: string; message: string; created_at: string; read: boolean }): Notification {
  return { id: row.id, message: row.message, time: formatTimestamp(row.created_at), unread: !row.read };
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
  businessTagIndustries: BusinessTagIndustry[];
  businessTagCategories: BusinessTagCategory[];
  businessTagTypes: BusinessTagType[];
  leadSources: LeadSource[];
  propertyTypes: PropertyType[];
  purposes: Purpose[];
  languages: Language[];
  firsttimeBranchTypes: FirsttimeBranchType[];
  races: Race[];
  targetRaces: TargetRace[];
  targetTypes: TargetType[];
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

  addUser: (input: { name: string; email: string; phone: string; ic: string | null; role: User["role"]; teamId: string | null; customerLimit: number | null; password?: string }) => Promise<{ tempPassword?: string; error?: string }>;
  updateUser: (id: string, input: { name: string; email: string; phone: string; ic: string | null; role: User["role"]; teamId: string | null; customerLimit: number | null; active: boolean }) => Promise<{ ok?: boolean; error?: string }>;
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

  addBusinessTagIndustry: (name: string) => void;
  updateBusinessTagIndustry: (id: string, name: string) => void;
  deleteBusinessTagIndustry: (id: string) => void;
  addBusinessTagCategory: (industryId: string, name: string) => void;
  updateBusinessTagCategory: (id: string, name: string) => void;
  deleteBusinessTagCategory: (id: string) => void;
  addBusinessTagType: (categoryId: string, name: string) => void;
  updateBusinessTagType: (id: string, name: string) => void;
  deleteBusinessTagType: (id: string) => void;

  addLeadSource: (name: string) => void;
  updateLeadSource: (id: string, name: string) => void;
  deleteLeadSource: (id: string) => void;
  addPropertyType: (name: string) => void;
  updatePropertyType: (id: string, name: string) => void;
  deletePropertyType: (id: string) => void;
  addPurpose: (name: string) => void;
  updatePurpose: (id: string, name: string) => void;
  deletePurpose: (id: string) => void;
  addLanguage: (name: string) => void;
  updateLanguage: (id: string, name: string) => void;
  deleteLanguage: (id: string) => void;
  addFirsttimeBranchType: (name: string) => void;
  updateFirsttimeBranchType: (id: string, name: string) => void;
  deleteFirsttimeBranchType: (id: string) => void;
  addRace: (name: string) => void;
  updateRace: (id: string, name: string) => void;
  deleteRace: (id: string) => void;
  addTargetRace: (name: string) => void;
  updateTargetRace: (id: string, name: string) => void;
  deleteTargetRace: (id: string) => void;
  addTargetType: (name: string) => void;
  updateTargetType: (id: string, name: string) => void;
  deleteTargetType: (id: string) => void;

  previewBusinessTagCsv: (csvText: string) => CsvBusinessTagPreview;
  confirmBusinessTagCsvImport: (
    preview: CsvBusinessTagPreview
  ) => Promise<{ ok: boolean; industriesCreated: number; categoriesCreated: number; typesCreated: number; error?: string }>;

  addStage: (name: string, isDefault: boolean) => void;
  renameStage: (id: string, name: string) => void;
  moveStage: (id: string, direction: -1 | 1) => void;
  deleteStage: (id: string) => { ok: boolean; error?: string };

  addCustomer: (input: { name: string; email: string; phone: string; assignedToUserId: string } & Partial<CustomerProfileInput>) => Promise<{ ok: boolean; error?: string }>;
  reassignCustomer: (customerId: string, newAssigneeId: string) => { ok: boolean; error?: string };
  deleteCustomer: (customerId: string) => void;
  updateCustomerStage: (customerId: string, stageId: string) => void;
  updateCustomerProfile: (customerId: string, patch: Partial<CustomerProfileInput>) => void;
  updateCustomerRemark: (customerId: string, remark: string) => void;

  addActivity: (customerId: string, type: ActivityType, content: string, followUp: string) => void;
  addTask: (customerId: string, title: string, due: string) => void;
  toggleTaskDone: (taskId: string) => void;

  markNotificationsRead: () => void;

  updateProfileName: (name: string) => void;
  updatePassword: (current: string, next: string) => Promise<{ ok: boolean; error?: string }>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [subAreas, setSubAreas] = useState<SubArea[]>([]);
  const [businessTagIndustries, setBusinessTagIndustries] = useState<BusinessTagIndustry[]>([]);
  const [businessTagCategories, setBusinessTagCategories] = useState<BusinessTagCategory[]>([]);
  const [businessTagTypes, setBusinessTagTypes] = useState<BusinessTagType[]>([]);
  const [leadSources, setLeadSources] = useState<LeadSource[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [firsttimeBranchTypes, setFirsttimeBranchTypes] = useState<FirsttimeBranchType[]>([]);
  const [races, setRaces] = useState<Race[]>([]);
  const [targetRaces, setTargetRaces] = useState<TargetRace[]>([]);
  const [targetTypes, setTargetTypes] = useState<TargetType[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
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

  async function loadBusinessTagIndustries(): Promise<BusinessTagIndustry[]> {
    const supabase = createClient();
    const { data } = await supabase.from("business_tag_industries").select("*").order("name");
    const mapped = (data ?? []).map(mapBusinessTagIndustry);
    setBusinessTagIndustries(mapped);
    return mapped;
  }

  async function loadBusinessTagCategories(): Promise<BusinessTagCategory[]> {
    const supabase = createClient();
    const { data } = await supabase.from("business_tag_categories").select("*").order("name");
    const mapped = (data ?? []).map(mapBusinessTagCategory);
    setBusinessTagCategories(mapped);
    return mapped;
  }

  async function loadBusinessTagTypes(): Promise<BusinessTagType[]> {
    const supabase = createClient();
    const { data } = await supabase.from("business_tag_types").select("*").order("name");
    const mapped = (data ?? []).map(mapBusinessTagType);
    setBusinessTagTypes(mapped);
    return mapped;
  }

  async function loadLeadSources(): Promise<LeadSource[]> {
    const supabase = createClient();
    const { data } = await supabase.from("lead_sources").select("*").order("name");
    const mapped = (data ?? []).map(mapLeadSource);
    setLeadSources(mapped);
    return mapped;
  }

  async function loadPropertyTypes(): Promise<PropertyType[]> {
    const supabase = createClient();
    const { data } = await supabase.from("property_types").select("*").order("name");
    const mapped = (data ?? []).map(mapPropertyType);
    setPropertyTypes(mapped);
    return mapped;
  }

  async function loadPurposes(): Promise<Purpose[]> {
    const supabase = createClient();
    const { data } = await supabase.from("purposes").select("*").order("name");
    const mapped = (data ?? []).map(mapPurpose);
    setPurposes(mapped);
    return mapped;
  }

  async function loadLanguages(): Promise<Language[]> {
    const supabase = createClient();
    const { data } = await supabase.from("languages").select("*").order("name");
    const mapped = (data ?? []).map(mapLanguage);
    setLanguages(mapped);
    return mapped;
  }

  async function loadFirsttimeBranchTypes(): Promise<FirsttimeBranchType[]> {
    const supabase = createClient();
    const { data } = await supabase.from("firsttime_branch_types").select("*").order("name");
    const mapped = (data ?? []).map(mapFirsttimeBranchType);
    setFirsttimeBranchTypes(mapped);
    return mapped;
  }

  async function loadRaces(): Promise<Race[]> {
    const supabase = createClient();
    const { data } = await supabase.from("races").select("*").order("name");
    const mapped = (data ?? []).map(mapRace);
    setRaces(mapped);
    return mapped;
  }

  async function loadTargetRaces(): Promise<TargetRace[]> {
    const supabase = createClient();
    const { data } = await supabase.from("target_races").select("*").order("name");
    const mapped = (data ?? []).map(mapTargetRace);
    setTargetRaces(mapped);
    return mapped;
  }

  async function loadTargetTypes(): Promise<TargetType[]> {
    const supabase = createClient();
    const { data } = await supabase.from("target_types").select("*").order("name");
    const mapped = (data ?? []).map(mapTargetType);
    setTargetTypes(mapped);
    return mapped;
  }

  async function loadStages(): Promise<Stage[]> {
    const supabase = createClient();
    const { data } = await supabase.from("pipeline_stages").select("*").order("order");
    const mapped = (data ?? []).map(mapStage);
    setStages(mapped);
    return mapped;
  }

  async function loadNotifications(userId: string): Promise<Notification[]> {
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    const mapped = (data ?? []).map(mapNotification);
    setNotifications(mapped);
    return mapped;
  }

  async function loadCustomers(): Promise<Customer[]> {
    const supabase = createClient();
    const { data } = await supabase.from("customers").select("*").order("name");
    const mapped = (data ?? []).map(mapCustomer);
    setCustomers(mapped);
    return mapped;
  }

  async function loadActivities(usersList: User[]): Promise<Activity[]> {
    const supabase = createClient();
    const { data } = await supabase.from("activities").select("*").order("created_at", { ascending: false });
    const usersById = new Map(usersList.map((u) => [u.id, u]));
    const mapped = (data ?? []).map((row) => mapActivity(row, usersById));
    setActivities(mapped);
    return mapped;
  }

  async function loadTasks(): Promise<Task[]> {
    const supabase = createClient();
    const { data } = await supabase.from("tasks").select("*").order("created_at");
    const mapped = (data ?? []).map(mapTask);
    setTasks(mapped);
    return mapped;
  }

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const [, loadedUsers] = await Promise.all([
          loadTeams(),
          loadUsers(),
          loadAreas(),
          loadSubAreas(),
          loadBusinessTagIndustries(),
          loadBusinessTagCategories(),
          loadBusinessTagTypes(),
          loadLeadSources(),
          loadPropertyTypes(),
          loadPurposes(),
          loadLanguages(),
          loadFirsttimeBranchTypes(),
          loadRaces(),
          loadTargetRaces(),
          loadTargetTypes(),
          loadStages(),
          loadCustomers(),
          loadTasks(),
        ]);
        await loadActivities(loadedUsers);
        const profile = loadedUsers.find((u) => u.id === data.user!.id);
        if (profile) {
          setCurrentUserId(profile.id);
          loadNotifications(profile.id);
        }
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
    const [, loadedUsers] = await Promise.all([
      loadTeams(),
      loadUsers(),
      loadAreas(),
      loadSubAreas(),
      loadBusinessTagIndustries(),
      loadBusinessTagCategories(),
      loadBusinessTagTypes(),
      loadLeadSources(),
      loadPropertyTypes(),
      loadPurposes(),
      loadLanguages(),
      loadFirsttimeBranchTypes(),
      loadRaces(),
      loadTargetRaces(),
      loadTargetTypes(),
      loadStages(),
      loadCustomers(),
      loadTasks(),
    ]);
    await loadActivities(loadedUsers);
    const profile = loadedUsers.find((u) => u.id === data.user.id);
    if (!profile || !profile.active) {
      await supabase.auth.signOut();
      return { ok: false, error: "This account has no CRM profile set up. Contact your administrator." };
    }
    setCurrentUserId(profile.id);
    await loadNotifications(profile.id);
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

  async function addUser(input: { name: string; email: string; phone: string; ic: string | null; role: User["role"]; teamId: string | null; customerLimit: number | null; password?: string }) {
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

  async function updateUser(id: string, input: { name: string; email: string; phone: string; ic: string | null; role: Role; teamId: string | null; customerLimit: number | null; active: boolean }) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = await res.json();
    if (!res.ok) {
      return { error: body.error ?? "Could not update user." };
    }
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...input } : u)));
    return { ok: true };
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

  function addBusinessTagIndustry(name: string) {
    const supabase = createClient();
    supabase
      .from("business_tag_industries")
      .insert({ name })
      .select()
      .single()
      .then(({ data, error }) => {
        if (!error && data) setBusinessTagIndustries((prev) => [...prev, mapBusinessTagIndustry(data)]);
      });
  }

  function updateBusinessTagIndustry(id: string, name: string) {
    setBusinessTagIndustries((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
    const supabase = createClient();
    supabase.from("business_tag_industries").update({ name }).eq("id", id).then(() => {});
  }

  function deleteBusinessTagIndustry(id: string) {
    setBusinessTagIndustries((prev) => prev.filter((i) => i.id !== id));
    const removedCategoryIds = businessTagCategories.filter((c) => c.industryId === id).map((c) => c.id);
    setBusinessTagCategories((prev) => prev.filter((c) => c.industryId !== id));
    setBusinessTagTypes((prev) => prev.filter((t) => !removedCategoryIds.includes(t.categoryId)));
    const supabase = createClient();
    supabase.from("business_tag_industries").delete().eq("id", id).then(() => {});
  }

  function addBusinessTagCategory(industryId: string, name: string) {
    const supabase = createClient();
    supabase
      .from("business_tag_categories")
      .insert({ industry_id: industryId, name })
      .select()
      .single()
      .then(({ data, error }) => {
        if (!error && data) setBusinessTagCategories((prev) => [...prev, mapBusinessTagCategory(data)]);
      });
  }

  function updateBusinessTagCategory(id: string, name: string) {
    setBusinessTagCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
    const supabase = createClient();
    supabase.from("business_tag_categories").update({ name }).eq("id", id).then(() => {});
  }

  function deleteBusinessTagCategory(id: string) {
    setBusinessTagCategories((prev) => prev.filter((c) => c.id !== id));
    setBusinessTagTypes((prev) => prev.filter((t) => t.categoryId !== id));
    const supabase = createClient();
    supabase.from("business_tag_categories").delete().eq("id", id).then(() => {});
  }

  function addBusinessTagType(categoryId: string, name: string) {
    const supabase = createClient();
    supabase
      .from("business_tag_types")
      .insert({ category_id: categoryId, name })
      .select()
      .single()
      .then(({ data, error }) => {
        if (!error && data) setBusinessTagTypes((prev) => [...prev, mapBusinessTagType(data)]);
      });
  }

  function updateBusinessTagType(id: string, name: string) {
    setBusinessTagTypes((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
    const supabase = createClient();
    supabase.from("business_tag_types").update({ name }).eq("id", id).then(() => {});
  }

  function deleteBusinessTagType(id: string) {
    setBusinessTagTypes((prev) => prev.filter((t) => t.id !== id));
    const supabase = createClient();
    supabase.from("business_tag_types").delete().eq("id", id).then(() => {});
  }

  function addLeadSource(name: string) {
    const supabase = createClient();
    supabase.from("lead_sources").insert({ name }).select().single().then(({ data, error }) => {
      if (!error && data) setLeadSources((prev) => [...prev, mapLeadSource(data)]);
    });
  }
  function updateLeadSource(id: string, name: string) {
    setLeadSources((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
    const supabase = createClient();
    supabase.from("lead_sources").update({ name }).eq("id", id).then(() => {});
  }
  function deleteLeadSource(id: string) {
    setLeadSources((prev) => prev.filter((i) => i.id !== id));
    const supabase = createClient();
    supabase.from("lead_sources").delete().eq("id", id).then(() => {});
  }

  function addPropertyType(name: string) {
    const supabase = createClient();
    supabase.from("property_types").insert({ name }).select().single().then(({ data, error }) => {
      if (!error && data) setPropertyTypes((prev) => [...prev, mapPropertyType(data)]);
    });
  }
  function updatePropertyType(id: string, name: string) {
    setPropertyTypes((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
    const supabase = createClient();
    supabase.from("property_types").update({ name }).eq("id", id).then(() => {});
  }
  function deletePropertyType(id: string) {
    setPropertyTypes((prev) => prev.filter((i) => i.id !== id));
    const supabase = createClient();
    supabase.from("property_types").delete().eq("id", id).then(() => {});
  }

  function addPurpose(name: string) {
    const supabase = createClient();
    supabase.from("purposes").insert({ name }).select().single().then(({ data, error }) => {
      if (!error && data) setPurposes((prev) => [...prev, mapPurpose(data)]);
    });
  }
  function updatePurpose(id: string, name: string) {
    setPurposes((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
    const supabase = createClient();
    supabase.from("purposes").update({ name }).eq("id", id).then(() => {});
  }
  function deletePurpose(id: string) {
    setPurposes((prev) => prev.filter((i) => i.id !== id));
    const supabase = createClient();
    supabase.from("purposes").delete().eq("id", id).then(() => {});
  }

  function addLanguage(name: string) {
    const supabase = createClient();
    supabase.from("languages").insert({ name }).select().single().then(({ data, error }) => {
      if (!error && data) setLanguages((prev) => [...prev, mapLanguage(data)]);
    });
  }
  function updateLanguage(id: string, name: string) {
    setLanguages((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
    const supabase = createClient();
    supabase.from("languages").update({ name }).eq("id", id).then(() => {});
  }
  function deleteLanguage(id: string) {
    setLanguages((prev) => prev.filter((i) => i.id !== id));
    const supabase = createClient();
    supabase.from("languages").delete().eq("id", id).then(() => {});
  }

  function addFirsttimeBranchType(name: string) {
    const supabase = createClient();
    supabase.from("firsttime_branch_types").insert({ name }).select().single().then(({ data, error }) => {
      if (!error && data) setFirsttimeBranchTypes((prev) => [...prev, mapFirsttimeBranchType(data)]);
    });
  }
  function updateFirsttimeBranchType(id: string, name: string) {
    setFirsttimeBranchTypes((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
    const supabase = createClient();
    supabase.from("firsttime_branch_types").update({ name }).eq("id", id).then(() => {});
  }
  function deleteFirsttimeBranchType(id: string) {
    setFirsttimeBranchTypes((prev) => prev.filter((i) => i.id !== id));
    const supabase = createClient();
    supabase.from("firsttime_branch_types").delete().eq("id", id).then(() => {});
  }

  function addRace(name: string) {
    const supabase = createClient();
    supabase.from("races").insert({ name }).select().single().then(({ data, error }) => {
      if (!error && data) setRaces((prev) => [...prev, mapRace(data)]);
    });
  }
  function updateRace(id: string, name: string) {
    setRaces((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
    const supabase = createClient();
    supabase.from("races").update({ name }).eq("id", id).then(() => {});
  }
  function deleteRace(id: string) {
    setRaces((prev) => prev.filter((i) => i.id !== id));
    const supabase = createClient();
    supabase.from("races").delete().eq("id", id).then(() => {});
  }

  function addTargetRace(name: string) {
    const supabase = createClient();
    supabase.from("target_races").insert({ name }).select().single().then(({ data, error }) => {
      if (!error && data) setTargetRaces((prev) => [...prev, mapTargetRace(data)]);
    });
  }
  function updateTargetRace(id: string, name: string) {
    setTargetRaces((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
    const supabase = createClient();
    supabase.from("target_races").update({ name }).eq("id", id).then(() => {});
  }
  function deleteTargetRace(id: string) {
    setTargetRaces((prev) => prev.filter((i) => i.id !== id));
    const supabase = createClient();
    supabase.from("target_races").delete().eq("id", id).then(() => {});
  }

  function addTargetType(name: string) {
    const supabase = createClient();
    supabase.from("target_types").insert({ name }).select().single().then(({ data, error }) => {
      if (!error && data) setTargetTypes((prev) => [...prev, mapTargetType(data)]);
    });
  }
  function updateTargetType(id: string, name: string) {
    setTargetTypes((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
    const supabase = createClient();
    supabase.from("target_types").update({ name }).eq("id", id).then(() => {});
  }
  function deleteTargetType(id: string) {
    setTargetTypes((prev) => prev.filter((i) => i.id !== id));
    const supabase = createClient();
    supabase.from("target_types").delete().eq("id", id).then(() => {});
  }

  function previewBusinessTagCsv(csvText: string): CsvBusinessTagPreview {
    return parseBusinessTagCsv(csvText, businessTagIndustries, businessTagCategories, businessTagTypes);
  }

  async function confirmBusinessTagCsvImport(preview: CsvBusinessTagPreview) {
    const supabase = createClient();
    try {
      let industriesCreated = 0;
      let categoriesCreated = 0;
      let typesCreated = 0;
      for (const industryEntry of preview.approvedIndustries) {
        let industryId: string;
        if (industryEntry.isNew) {
          const { data, error } = await supabase.from("business_tag_industries").insert({ name: industryEntry.name }).select().single();
          if (error || !data) throw new Error(error?.message ?? `Could not create industry "${industryEntry.name}".`);
          industryId = data.id;
          industriesCreated++;
        } else {
          const existing = businessTagIndustries.find((i) => i.name.toLowerCase() === industryEntry.name.toLowerCase());
          if (!existing) throw new Error(`Industry "${industryEntry.name}" not found.`);
          industryId = existing.id;
        }
        for (const categoryEntry of industryEntry.categories) {
          let categoryId: string;
          if (categoryEntry.isNew) {
            const { data, error } = await supabase
              .from("business_tag_categories")
              .insert({ industry_id: industryId, name: categoryEntry.name })
              .select()
              .single();
            if (error || !data) throw new Error(error?.message ?? `Could not create category "${categoryEntry.name}".`);
            categoryId = data.id;
            categoriesCreated++;
          } else {
            const existing = businessTagCategories.find(
              (c) => c.industryId === industryId && c.name.toLowerCase() === categoryEntry.name.toLowerCase()
            );
            if (!existing) throw new Error(`Category "${categoryEntry.name}" not found.`);
            categoryId = existing.id;
          }
          const { data: inserted, error: typeError } = await supabase
            .from("business_tag_types")
            .upsert(
              categoryEntry.typeNames.map((name) => ({ category_id: categoryId, name })),
              { onConflict: "category_id,name", ignoreDuplicates: true }
            )
            .select();
          if (typeError) throw new Error(typeError.message);
          typesCreated += inserted?.length ?? 0;
        }
      }
      await Promise.all([loadBusinessTagIndustries(), loadBusinessTagCategories(), loadBusinessTagTypes()]);
      return { ok: true, industriesCreated, categoriesCreated, typesCreated };
    } catch (err) {
      await Promise.all([loadBusinessTagIndustries(), loadBusinessTagCategories(), loadBusinessTagTypes()]);
      return {
        ok: false,
        industriesCreated: 0,
        categoriesCreated: 0,
        typesCreated: 0,
        error: err instanceof Error ? err.message : "Import failed.",
      };
    }
  }

  async function addStage(name: string, isDefault: boolean) {
    const supabase = createClient();
    if (isDefault) {
      await supabase.from("pipeline_stages").update({ is_default: false }).eq("is_default", true);
    }
    const order = stages.length + 1;
    const { data, error } = await supabase
      .from("pipeline_stages")
      .insert({ name, order, is_default: isDefault })
      .select()
      .single();
    if (!error && data) {
      setStages((prev) => [...(isDefault ? prev.map((s) => ({ ...s, isDefault: false })) : prev), mapStage(data)]);
    }
  }

  function renameStage(id: string, name: string) {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    const supabase = createClient();
    supabase.from("pipeline_stages").update({ name }).eq("id", id).then(() => {});
  }

  function moveStage(id: string, direction: -1 | 1) {
    const sorted = [...stages].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((s) => s.id === id);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swapIdx];
    setStages((prev) =>
      prev.map((s) => {
        if (s.id === a.id) return { ...s, order: b.order };
        if (s.id === b.id) return { ...s, order: a.order };
        return s;
      })
    );
    const supabase = createClient();
    supabase.from("pipeline_stages").update({ order: b.order }).eq("id", a.id).then(() => {});
    supabase.from("pipeline_stages").update({ order: a.order }).eq("id", b.id).then(() => {});
  }

  function deleteStage(id: string) {
    const count = customers.filter((c) => c.stageId === id).length;
    if (count > 0) {
      return { ok: false, error: `${count} customer(s) are on this stage. Move them first.` };
    }
    setStages((prev) => prev.filter((s) => s.id !== id));
    const supabase = createClient();
    supabase.from("pipeline_stages").delete().eq("id", id).then(() => {});
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

  async function addCustomer(input: { name: string; email: string; phone: string; assignedToUserId: string } & Partial<CustomerProfileInput>) {
    const error = assignmentError(input.assignedToUserId);
    if (error) return { ok: false, error };
    const defaultStage = stages.find((s) => s.isDefault) ?? stages[0];
    if (!defaultStage) return { ok: false, error: "No pipeline stage configured. Add one in Admin → Pipeline Stages first." };
    const profile = { ...emptyCustomerProfile, ...input };
    const supabase = createClient();
    const { data, error: dbError } = await supabase
      .from("customers")
      .insert({
        name: input.name,
        email: input.email || null,
        phone: input.phone || null,
        assigned_to: input.assignedToUserId,
        stage_id: defaultStage.id,
        created_by: currentUserId,
        source_id: profile.sourceId,
        area_id: profile.areaId,
        sub_area_id: profile.subAreaId,
        property_type_id: profile.propertyTypeId,
        purpose_id: profile.purposeId,
        business_industry_id: profile.businessIndustryId,
        business_category_id: profile.businessCategoryId,
        business_type_id: profile.businessTypeId,
        race_id: profile.raceId,
        language_id: profile.languageId,
        business_name: profile.businessName || null,
        firsttime_branch_id: profile.firsttimeBranchId,
        target_race_id: profile.targetRaceId,
        target_type_id: profile.targetTypeId,
        remark: profile.remark || null,
      })
      .select()
      .single();
    if (dbError || !data) return { ok: false, error: dbError?.message ?? "Could not create customer." };
    setCustomers((prev) => [...prev, mapCustomer(data)]);
    return { ok: true };
  }

  function reassignCustomer(customerId: string, newAssigneeId: string) {
    const customer = customers.find((c) => c.id === customerId);
    if (customer && customer.assignedToUserId !== newAssigneeId) {
      const error = assignmentError(newAssigneeId, customerId);
      if (error) return { ok: false, error };
    }
    setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, assignedToUserId: newAssigneeId } : c)));
    const supabase = createClient();
    supabase.from("customers").update({ assigned_to: newAssigneeId }).eq("id", customerId).then(() => {});
    const assignee = users.find((u) => u.id === newAssigneeId);
    if (assignee && customer) {
      createNotification(newAssigneeId, `${assignee.name} was assigned ${customer.name}.`);
    }
    return { ok: true };
  }

  function deleteCustomer(customerId: string) {
    setCustomers((prev) => prev.filter((c) => c.id !== customerId));
    const supabase = createClient();
    supabase.from("customers").delete().eq("id", customerId).then(() => {});
  }

  function updateCustomerStage(customerId: string, stageId: string) {
    setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, stageId } : c)));
    const supabase = createClient();
    supabase.from("customers").update({ stage_id: stageId }).eq("id", customerId).then(() => {});
  }

  function updateCustomerProfile(customerId: string, patch: Partial<CustomerProfileInput>) {
    setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, ...patch } : c)));
    const columnMap: Record<string, string> = {
      sourceId: "source_id",
      areaId: "area_id",
      subAreaId: "sub_area_id",
      propertyTypeId: "property_type_id",
      purposeId: "purpose_id",
      businessIndustryId: "business_industry_id",
      businessCategoryId: "business_category_id",
      businessTypeId: "business_type_id",
      raceId: "race_id",
      languageId: "language_id",
      businessName: "business_name",
      firsttimeBranchId: "firsttime_branch_id",
      targetRaceId: "target_race_id",
      targetTypeId: "target_type_id",
    };
    const dbPatch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      const column = columnMap[key];
      if (column) dbPatch[column] = value === "" ? null : value;
    }
    const supabase = createClient();
    supabase.from("customers").update(dbPatch).eq("id", customerId).then(() => {});
  }

  function updateCustomerRemark(customerId: string, remark: string) {
    setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, remark } : c)));
    const supabase = createClient();
    supabase.from("customers").update({ remark: remark || null }).eq("id", customerId).then(() => {});
  }

  function addActivity(customerId: string, type: ActivityType, content: string, followUp: string) {
    if (!currentUser) return;
    const supabase = createClient();
    supabase
      .from("activities")
      .insert({ customer_id: customerId, user_id: currentUser.id, type, content, follow_up: followUp || null })
      .select()
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          setActivities((prev) => [mapActivity(data, new Map(users.map((u) => [u.id, u]))), ...prev]);
        }
      });
  }

  function addTask(customerId: string, title: string, due: string) {
    if (!currentUser) return;
    const supabase = createClient();
    supabase
      .from("tasks")
      .insert({ customer_id: customerId, user_id: currentUser.id, title, due: due || null, done: false })
      .select()
      .single()
      .then(({ data, error }) => {
        if (!error && data) setTasks((prev) => [...prev, mapTask(data)]);
      });
  }

  function toggleTaskDone(taskId: string) {
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)));
    const supabase = createClient();
    supabase.from("tasks").update({ done: !target.done }).eq("id", taskId).then(() => {});
  }

  function markNotificationsRead() {
    const unreadIds = notifications.filter((n) => n.unread).map((n) => n.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    if (unreadIds.length === 0) return;
    const supabase = createClient();
    supabase.from("notifications").update({ read: true }).in("id", unreadIds).then(() => {});
  }

  function createNotification(userId: string, message: string) {
    const supabase = createClient();
    supabase
      .from("notifications")
      .insert({ user_id: userId, type: "ASSIGNMENT", message, read: false })
      .select()
      .single()
      .then(({ data, error }) => {
        if (!error && data && data.user_id === currentUserId) {
          setNotifications((prev) => [mapNotification(data), ...prev]);
        }
      });
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
    businessTagIndustries,
    businessTagCategories,
    businessTagTypes,
    leadSources,
    propertyTypes,
    purposes,
    languages,
    firsttimeBranchTypes,
    races,
    targetRaces,
    targetTypes,
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
    updateUser,
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
    addBusinessTagIndustry,
    updateBusinessTagIndustry,
    deleteBusinessTagIndustry,
    addBusinessTagCategory,
    updateBusinessTagCategory,
    deleteBusinessTagCategory,
    addBusinessTagType,
    updateBusinessTagType,
    deleteBusinessTagType,
    addLeadSource,
    updateLeadSource,
    deleteLeadSource,
    addPropertyType,
    updatePropertyType,
    deletePropertyType,
    addPurpose,
    updatePurpose,
    deletePurpose,
    addLanguage,
    updateLanguage,
    deleteLanguage,
    addFirsttimeBranchType,
    updateFirsttimeBranchType,
    deleteFirsttimeBranchType,
    addRace,
    updateRace,
    deleteRace,
    addTargetRace,
    updateTargetRace,
    deleteTargetRace,
    addTargetType,
    updateTargetType,
    deleteTargetType,
    previewBusinessTagCsv,
    confirmBusinessTagCsvImport,
    addStage,
    renameStage,
    moveStage,
    deleteStage,
    reassignCustomer,
    deleteCustomer,
    updateCustomerStage,
    updateCustomerProfile,
    updateCustomerRemark,
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
