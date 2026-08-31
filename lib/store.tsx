"use client";

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { createClient } from "./supabase/client";
import { parseAreaCsv } from "./parseAreaCsv";
import { parseBusinessTagCsv } from "./parseBusinessTagCsv";
import {
  Activity,
  ActivityType,
  Area,
  Budget,
  BusinessTagCategory,
  BusinessTagIndustry,
  BusinessTagType,
  Customer,
  CustomerChangeLogEntry,
  CsvBusinessTagPreview,
  CsvPreview,
  DealClosure,
  FieldRequirement,
  FirsttimeBranchType,
  Language,
  LeadSource,
  Notification,
  PoolStatus,
  PropertyType,
  Purpose,
  Race,
  RemovalReason,
  RemovalRequest,
  RemovalRequestStatus,
  Role,
  Stage,
  SubArea,
  TargetRace,
  TargetType,
  Task,
  Team,
  User,
} from "./types";

function mapProfile(row: { id: string; name: string; email: string; phone: string | null; ic: string | null; role: Role; team_id: string | null; status: string; active_pool_limit: number | null; inactive_pool_limit: number | null }): User {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone, ic: row.ic, role: row.role, teamId: row.team_id, active: row.status === "ACTIVE", activePoolLimit: row.active_pool_limit, inactivePoolLimit: row.inactive_pool_limit };
}

function mapTeam(row: { id: string; name: string; manager_id: string | null; last_auto_assigned_user_id: string | null }): Team {
  return { id: row.id, name: row.name, managerId: row.manager_id, lastAutoAssignedUserId: row.last_auto_assigned_user_id };
}

function mapArea(row: { id: string; name: string; team_id: string | null }): Area {
  return { id: row.id, name: row.name, teamId: row.team_id };
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

function mapFieldRequirement(row: { field_key: string; required: boolean }): FieldRequirement {
  return { fieldKey: row.field_key, required: row.required };
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

function mapBudget(row: { id: string; name: string }): Budget {
  return { id: row.id, name: row.name };
}

function mapRemovalReason(row: { id: string; name: string }): RemovalReason {
  return { id: row.id, name: row.name };
}

function assigneeSlots(c: Customer): string[] {
  return [c.assignedToUserId, c.assignedToUserId2, c.assignedToUserId3].filter((id): id is string => !!id);
}

function mapStage(row: { id: string; name: string; order: number; is_default: boolean; requires_amount: boolean }): Stage {
  return { id: row.id, name: row.name, order: row.order, isDefault: row.is_default, requiresAmount: row.requires_amount };
}

function mapCustomer(row: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  assigned_to: string | null;
  assigned_to_2: string | null;
  assigned_to_3: string | null;
  pool_1: PoolStatus | null;
  pool_2: PoolStatus | null;
  pool_3: PoolStatus | null;
  pool_1_since: string | null;
  pool_2_since: string | null;
  pool_3_since: string | null;
  stage_1: string | null;
  stage_2: string | null;
  stage_3: string | null;
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
  budget_id: string | null;
  remark: string | null;
  created_at: string;
  updated_at: string;
}): Customer {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? "",
    phone: row.phone ?? "",
    assignedToUserId: row.assigned_to,
    assignedToUserId2: row.assigned_to_2,
    assignedToUserId3: row.assigned_to_3,
    pool1: row.pool_1,
    pool2: row.pool_2,
    pool3: row.pool_3,
    pool1Since: row.pool_1_since,
    pool2Since: row.pool_2_since,
    pool3Since: row.pool_3_since,
    stage1Id: row.stage_1,
    stage2Id: row.stage_2,
    stage3Id: row.stage_3,
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
    budgetId: row.budget_id,
    remark: row.remark ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
  budgetId: string | null;
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
  budgetId: null,
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
    authorUserId: row.user_id,
    time: formatTimestamp(row.created_at),
    createdAt: row.created_at,
  };
}

function mapChangeLog(row: {
  id: string;
  customer_id: string;
  field_key: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  created_at: string;
}, usersById: Map<string, User>): CustomerChangeLogEntry {
  return {
    id: row.id,
    customerId: row.customer_id,
    fieldKey: row.field_key,
    oldValue: row.old_value,
    newValue: row.new_value,
    changedByName: usersById.get(row.changed_by)?.name ?? "",
    changedByUserId: row.changed_by,
    time: formatTimestamp(row.created_at),
    createdAt: row.created_at,
  };
}

function mapDealClosure(row: {
  id: string;
  customer_id: string;
  user_id: string;
  slot: number;
  stage_id: string;
  amount: number;
  created_at: string;
}): DealClosure {
  return {
    id: row.id,
    customerId: row.customer_id,
    userId: row.user_id,
    slot: row.slot as 1 | 2 | 3,
    stageId: row.stage_id,
    amount: row.amount,
    createdAt: row.created_at,
  };
}

function mapRemovalRequest(row: {
  id: string;
  customer_id: string;
  slot: number;
  requested_by: string;
  reason_id: string;
  status: string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}): RemovalRequest {
  return {
    id: row.id,
    customerId: row.customer_id,
    slot: row.slot as 1 | 2 | 3,
    requestedBy: row.requested_by,
    reasonId: row.reason_id,
    status: row.status as RemovalRequestStatus,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
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
  budgets: Budget[];
  fieldRequirements: FieldRequirement[];
  stages: Stage[];
  customers: Customer[];
  activities: Activity[];
  changeLog: CustomerChangeLogEntry[];
  dealClosures: DealClosure[];
  removalReasons: RemovalReason[];
  removalRequests: RemovalRequest[];
  tasks: Task[];
  notifications: Notification[];
  currentUser: User | null;
  initialized: boolean;

  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;

  visibleCustomers: Customer[];

  addUser: (input: { name: string; email: string; phone: string; ic: string | null; role: User["role"]; teamId: string | null; activePoolLimit: number | null; inactivePoolLimit: number | null; password?: string }) => Promise<{ tempPassword?: string; error?: string }>;
  updateUser: (id: string, input: { name: string; email: string; phone: string; ic: string | null; role: User["role"]; teamId: string | null; activePoolLimit: number | null; inactivePoolLimit: number | null; active: boolean }) => Promise<{ ok?: boolean; error?: string }>;
  updateUserRole: (id: string, role: Role) => void;
  updateUserTeam: (id: string, teamId: string | null) => void;
  updateUserPoolLimit: (id: string, pool: PoolStatus, limit: number | null) => void;
  deleteUser: (id: string) => Promise<{ ok: boolean; error?: string }>;
  resetUserPassword: (id: string, password?: string) => Promise<{ tempPassword?: string; error?: string }>;

  addTeam: (name: string, managerId: string | null) => void;
  updateTeam: (id: string, name: string, managerId: string | null) => void;
  deleteTeam: (id: string) => { ok: boolean; error?: string };

  addArea: (name: string) => void;
  updateArea: (id: string, name: string) => void;
  updateAreaTeam: (id: string, teamId: string | null) => void;
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
  addBudget: (name: string) => void;
  updateBudget: (id: string, name: string) => void;
  deleteBudget: (id: string) => void;
  addRemovalReason: (name: string) => void;
  updateRemovalReason: (id: string, name: string) => void;
  deleteRemovalReason: (id: string) => void;
  updateFieldRequirement: (fieldKey: string, required: boolean) => void;

  previewBusinessTagCsv: (csvText: string) => CsvBusinessTagPreview;
  confirmBusinessTagCsvImport: (
    preview: CsvBusinessTagPreview
  ) => Promise<{ ok: boolean; industriesCreated: number; categoriesCreated: number; typesCreated: number; error?: string }>;

  addStage: (name: string, isDefault: boolean) => void;
  renameStage: (id: string, name: string) => void;
  moveStage: (id: string, direction: -1 | 1) => void;
  deleteStage: (id: string) => { ok: boolean; error?: string };
  updateStageRequiresAmount: (id: string, requiresAmount: boolean) => void;

  addCustomer: (input: { name: string; email: string; phone: string; assignedToUserId?: string | null; assignedToUserId2?: string | null; assignedToUserId3?: string | null } & Partial<CustomerProfileInput>) => Promise<{ ok: boolean; error?: string }>;
  reassignCustomer: (customerId: string, slot: 1 | 2 | 3, userId: string | null) => { ok: boolean; error?: string };
  logAssignmentRemoval: (customerId: string, slot: 1 | 2 | 3, removedUserName: string, note?: string) => void;
  togglePool: (customerId: string, slot: 1 | 2 | 3, pool: PoolStatus) => { ok: boolean; error?: string };
  deleteCustomer: (customerId: string) => void;
  updateCustomerProfile: (customerId: string, patch: Partial<Omit<CustomerProfileInput, "remark">>) => void;
  updateCustomerIdentity: (customerId: string, patch: { name?: string; phone?: string }) => void;
  updateCustomerRemark: (customerId: string, remark: string) => void;

  addActivity: (customerId: string, type: ActivityType, content: string, followUp: string) => void;
  logActivityAndStage: (customerId: string, slot: 1 | 2 | 3, stageId: string, type: ActivityType, content: string, followUp: string, closedAmount?: number) => void;
  requestClientRemoval: (customerId: string, slot: 1 | 2 | 3, reasonId: string) => { ok: boolean; error?: string };
  resolveClientRemoval: (requestId: string, approve: boolean) => void;
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
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [fieldRequirements, setFieldRequirements] = useState<FieldRequirement[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [changeLog, setChangeLog] = useState<CustomerChangeLogEntry[]>([]);
  const [dealClosures, setDealClosures] = useState<DealClosure[]>([]);
  const [removalReasons, setRemovalReasons] = useState<RemovalReason[]>([]);
  const [removalRequests, setRemovalRequests] = useState<RemovalRequest[]>([]);
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

  async function loadBudgets(): Promise<Budget[]> {
    const supabase = createClient();
    const { data } = await supabase.from("budgets").select("*").order("name");
    const mapped = (data ?? []).map(mapBudget);
    setBudgets(mapped);
    return mapped;
  }

  async function loadRemovalReasons(): Promise<RemovalReason[]> {
    const supabase = createClient();
    const { data } = await supabase.from("removal_reasons").select("*").order("name");
    const mapped = (data ?? []).map(mapRemovalReason);
    setRemovalReasons(mapped);
    return mapped;
  }

  async function loadFieldRequirements(): Promise<FieldRequirement[]> {
    const supabase = createClient();
    const { data } = await supabase.from("mandatory_field_settings").select("*");
    const mapped = (data ?? []).map(mapFieldRequirement);
    setFieldRequirements(mapped);
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

  async function loadChangeLog(usersList: User[]): Promise<CustomerChangeLogEntry[]> {
    const supabase = createClient();
    const { data } = await supabase.from("customer_change_log").select("*").order("created_at", { ascending: false });
    const usersById = new Map(usersList.map((u) => [u.id, u]));
    const mapped = (data ?? []).map((row) => mapChangeLog(row, usersById));
    setChangeLog(mapped);
    return mapped;
  }

  async function loadDealClosures(): Promise<DealClosure[]> {
    const supabase = createClient();
    const { data } = await supabase.from("deal_closures").select("*").order("created_at", { ascending: false });
    const mapped = (data ?? []).map(mapDealClosure);
    setDealClosures(mapped);
    return mapped;
  }

  async function loadRemovalRequests(): Promise<RemovalRequest[]> {
    const supabase = createClient();
    const { data } = await supabase.from("removal_requests").select("*").order("created_at", { ascending: false });
    const mapped = (data ?? []).map(mapRemovalRequest);
    setRemovalRequests(mapped);
    return mapped;
  }

  // Auto-removal for the inactive pool: any assignee slot (1, 2, or 3 — all
  // three are nullable now that a customer can go unassigned) sitting in
  // the inactive pool for 60+ days with no activity logged by that
  // assignee gets cleared. No cron infra exists, so this runs as a
  // compute-on-load sweep scoped to what the current session is allowed to
  // touch: their own slots, or (for an admin) every slot.
  // ponytail: compute-on-load sweep, not real-time. Upgrade to a cron/edge
  // function sweep if sub-day precision ever matters.
  function sweepStalePool(customersList: Customer[], activitiesList: Activity[], forUserId: string, isAdmin: boolean) {
    const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const stale: { customerId: string; slot: 1 | 2 | 3 }[] = [];
    for (const c of customersList) {
      ([
        { slot: 1 as const, pool: c.pool1, since: c.pool1Since, userId: c.assignedToUserId },
        { slot: 2 as const, pool: c.pool2, since: c.pool2Since, userId: c.assignedToUserId2 },
        { slot: 3 as const, pool: c.pool3, since: c.pool3Since, userId: c.assignedToUserId3 },
      ]).forEach(({ slot, pool, since, userId }) => {
        if (pool !== "INACTIVE" || !userId || !since) return;
        if (!isAdmin && userId !== forUserId) return;
        const lastOwnActivity = activitiesList
          .filter((a) => a.customerId === c.id && a.authorUserId === userId)
          .reduce((max, a) => Math.max(max, new Date(a.createdAt).getTime()), 0);
        const lastTouched = Math.max(new Date(since).getTime(), lastOwnActivity);
        if (now - lastTouched > SIXTY_DAYS_MS) stale.push({ customerId: c.id, slot });
      });
    }
    if (stale.length === 0) return;
    setCustomers((prev) =>
      prev.map((c) => {
        const hit1 = stale.some((s) => s.customerId === c.id && s.slot === 1);
        const hit2 = stale.some((s) => s.customerId === c.id && s.slot === 2);
        const hit3 = stale.some((s) => s.customerId === c.id && s.slot === 3);
        if (!hit1 && !hit2 && !hit3) return c;
        return {
          ...c,
          ...(hit1 ? { assignedToUserId: null, pool1: null, pool1Since: null, stage1Id: null } : {}),
          ...(hit2 ? { assignedToUserId2: null, pool2: null, pool2Since: null, stage2Id: null } : {}),
          ...(hit3 ? { assignedToUserId3: null, pool3: null, pool3Since: null, stage3Id: null } : {}),
        };
      })
    );
    const supabase = createClient();
    for (const { customerId, slot } of stale) {
      const update = slot === 1
        ? { assigned_to: null, pool_1: null, pool_1_since: null, stage_1: null }
        : slot === 2
        ? { assigned_to_2: null, pool_2: null, pool_2_since: null, stage_2: null }
        : { assigned_to_3: null, pool_3: null, pool_3_since: null, stage_3: null };
      supabase.from("customers").update(update).eq("id", customerId).then(() => {});
    }
  }

  // Auto second-assignment: 3 days after a customer is created (slot 1
  // already assigned), if slot 2 is still empty, round-robin the next
  // active SALESPERSON from the team that owns the customer's area into
  // slot 2. Deliberately does NOT call reassignCustomer/assignmentError —
  // both read `customers` from closure, which is still stale at the exact
  // point in the initial-load effect (and in login()) where this sweep
  // runs, before React has re-rendered with the freshly-loaded data.
  // Operates only on the snapshot arrays passed in and functional setState
  // updaters, same discipline sweepStalePool already follows.
  // Admin-only: teams' RLS only allows ADMIN to update
  // last_auto_assigned_user_id, so a non-admin session never attempts
  // this (mirrors sweepStalePool's own isAdmin branch).
  // ponytail: compute-on-load sweep, not real-time — same accepted
  // imprecision as the pool sweep. Upgrade to a cron/edge function sweep
  // if sub-day precision ever matters.
  function sweepAutoSecondAssign(customersList: Customer[], areasList: Area[], teamsList: Team[], usersList: User[], stagesList: Stage[], isAdmin: boolean) {
    if (!isAdmin) return;
    const defaultStage = stagesList.find((s) => s.isDefault) ?? stagesList[0];
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const supabase = createClient();
    // The `teamsList`/`customersList` params are a frozen snapshot, but a
    // single sweep call can assign multiple customers off the same team in
    // one pass (this is a batch catch-up sweep, not a one-at-a-time
    // trigger). Track this call's own round-robin pointer and each
    // candidate's in-progress assignment count locally so the second
    // customer processed in the same sweep sees the first one's pick,
    // instead of both re-reading the same stale pointer/pool-count and
    // colliding on the same winner.
    const pointerByTeam = new Map<string, string | null>();
    const extraAssignedCount = new Map<string, number>();
    for (const c of customersList) {
      if (c.assignedToUserId2 || !c.assignedToUserId || !c.areaId) continue;
      if (now - new Date(c.createdAt).getTime() < THREE_DAYS_MS) continue;
      const area = areasList.find((a) => a.id === c.areaId);
      if (!area?.teamId) continue;
      const team = teamsList.find((t) => t.id === area.teamId);
      if (!team) continue;
      const excluded = [c.assignedToUserId, c.assignedToUserId3].filter((id): id is string => !!id);
      const candidates = usersList
        .filter((u) => u.active && u.role === "SALESPERSON" && u.teamId === team.id && !excluded.includes(u.id))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      if (candidates.length === 0) continue;
      const currentPointer = pointerByTeam.has(team.id) ? pointerByTeam.get(team.id)! : team.lastAutoAssignedUserId;
      const lastIndex = candidates.findIndex((u) => u.id === currentPointer);
      const startIndex = lastIndex === -1 ? 0 : (lastIndex + 1) % candidates.length;
      let winner: User | undefined;
      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[(startIndex + i) % candidates.length];
        const limit = candidate.activePoolLimit;
        if (limit !== null && limit !== undefined) {
          const activeCount = customersList.filter((other) =>
            (other.assignedToUserId === candidate.id && other.pool1 === "ACTIVE") ||
            (other.assignedToUserId2 === candidate.id && other.pool2 === "ACTIVE") ||
            (other.assignedToUserId3 === candidate.id && other.pool3 === "ACTIVE")
          ).length + (extraAssignedCount.get(candidate.id) ?? 0);
          if (activeCount >= limit) continue;
        }
        winner = candidate;
        break;
      }
      if (!winner) continue;
      const winnerId = winner.id;
      const winnerName = winner.name;
      pointerByTeam.set(team.id, winnerId);
      extraAssignedCount.set(winnerId, (extraAssignedCount.get(winnerId) ?? 0) + 1);
      setCustomers((prev) =>
        prev.map((row) => (row.id === c.id ? { ...row, assignedToUserId2: winnerId, pool2: "ACTIVE", pool2Since: null, stage2Id: defaultStage?.id ?? null } : row))
      );
      supabase.from("customers").update({ assigned_to_2: winnerId, pool_2: "ACTIVE", pool_2_since: null, stage_2: defaultStage?.id ?? null }).eq("id", c.id).then(() => {});
      setTeams((prev) => prev.map((t) => (t.id === team.id ? { ...t, lastAutoAssignedUserId: winnerId } : t)));
      supabase.from("teams").update({ last_auto_assigned_user_id: winnerId }).eq("id", team.id).then(() => {});
      createNotification(winnerId, `${winnerName} was assigned ${c.name}.`);
    }
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
        const loadResults = await Promise.all([
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
          loadBudgets(),
          loadFieldRequirements(),
          loadStages(),
          loadCustomers(),
          loadTasks(),
        ]);
        const loadedUsers = loadResults[1];
        const loadedCustomers = loadResults[18];
        const loadedActivities = await loadActivities(loadedUsers);
        await loadChangeLog(loadedUsers);
        await loadDealClosures();
        await loadRemovalReasons();
        await loadRemovalRequests();
        const profile = loadedUsers.find((u) => u.id === data.user!.id);
        if (profile) {
          setCurrentUserId(profile.id);
          loadNotifications(profile.id);
          sweepStalePool(loadedCustomers, loadedActivities, profile.id, profile.role === "ADMIN");
          sweepAutoSecondAssign(loadedCustomers, loadResults[2], loadResults[0], loadedUsers, loadResults[17], profile.role === "ADMIN");
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
    const loadResults = await Promise.all([
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
      loadBudgets(),
      loadFieldRequirements(),
      loadStages(),
      loadCustomers(),
      loadTasks(),
    ]);
    const loadedUsers = loadResults[1];
    const loadedCustomers = loadResults[18];
    const loadedActivities = await loadActivities(loadedUsers);
    await loadChangeLog(loadedUsers);
    await loadDealClosures();
    await loadRemovalReasons();
    await loadRemovalRequests();
    const profile = loadedUsers.find((u) => u.id === data.user.id);
    if (!profile || !profile.active) {
      await supabase.auth.signOut();
      return { ok: false, error: "This account has no CRM profile set up. Contact your administrator." };
    }
    setCurrentUserId(profile.id);
    await loadNotifications(profile.id);
    sweepStalePool(loadedCustomers, loadedActivities, profile.id, profile.role === "ADMIN");
    sweepAutoSecondAssign(loadedCustomers, loadResults[2], loadResults[0], loadedUsers, loadResults[17], profile.role === "ADMIN");
    return { ok: true };
  }

  function logout() {
    const supabase = createClient();
    supabase.auth.signOut();
    setCurrentUserId(null);
    setCustomers([]);
    setNotifications([]);
  }

  const visibleCustomers = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === "ADMIN") return customers;
    if (currentUser.role === "MANAGER") {
      const teamUserIds = new Set(users.filter((u) => u.teamId === currentUser.teamId).map((u) => u.id));
      return customers.filter((c) => assigneeSlots(c).some((id) => teamUserIds.has(id)));
    }
    return customers.filter((c) => assigneeSlots(c).includes(currentUser.id));
  }, [customers, users, currentUser]);

  async function addUser(input: { name: string; email: string; phone: string; ic: string | null; role: User["role"]; teamId: string | null; activePoolLimit: number | null; inactivePoolLimit: number | null; password?: string }) {
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

  async function updateUser(id: string, input: { name: string; email: string; phone: string; ic: string | null; role: Role; teamId: string | null; activePoolLimit: number | null; inactivePoolLimit: number | null; active: boolean }) {
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

  function updateUserPoolLimit(id: string, pool: PoolStatus, limit: number | null) {
    const target = users.find((u) => u.id === id);
    if (!target) return;
    const field = pool === "ACTIVE" ? "activePoolLimit" : "inactivePoolLimit";
    const column = pool === "ACTIVE" ? "active_pool_limit" : "inactive_pool_limit";
    const prevLimit = target[field];
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, [field]: limit } : u)));
    const supabase = createClient();
    supabase
      .from("profiles")
      .update({ [column]: limit })
      .eq("id", id)
      .then(({ error }) => {
        if (error) setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, [field]: prevLimit } : u)));
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

  function updateAreaTeam(id: string, teamId: string | null) {
    const target = areas.find((a) => a.id === id);
    if (!target) return;
    const prevTeamId = target.teamId;
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, teamId } : a)));
    const supabase = createClient();
    supabase
      .from("areas")
      .update({ team_id: teamId })
      .eq("id", id)
      .then(({ error }) => {
        if (error) setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, teamId: prevTeamId } : a)));
      });
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

  function addBudget(name: string) {
    const supabase = createClient();
    supabase.from("budgets").insert({ name }).select().single().then(({ data, error }) => {
      if (!error && data) setBudgets((prev) => [...prev, mapBudget(data)]);
    });
  }
  function updateBudget(id: string, name: string) {
    setBudgets((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
    const supabase = createClient();
    supabase.from("budgets").update({ name }).eq("id", id).then(() => {});
  }
  function deleteBudget(id: string) {
    setBudgets((prev) => prev.filter((i) => i.id !== id));
    const supabase = createClient();
    supabase.from("budgets").delete().eq("id", id).then(() => {});
  }
  function addRemovalReason(name: string) {
    const supabase = createClient();
    supabase.from("removal_reasons").insert({ name }).select().single().then(({ data, error }) => {
      if (!error && data) setRemovalReasons((prev) => [...prev, mapRemovalReason(data)]);
    });
  }
  function updateRemovalReason(id: string, name: string) {
    setRemovalReasons((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
    const supabase = createClient();
    supabase.from("removal_reasons").update({ name }).eq("id", id).then(() => {});
  }
  function deleteRemovalReason(id: string) {
    setRemovalReasons((prev) => prev.filter((i) => i.id !== id));
    const supabase = createClient();
    supabase.from("removal_reasons").delete().eq("id", id).then(() => {});
  }

  function updateFieldRequirement(fieldKey: string, required: boolean) {
    setFieldRequirements((prev) => prev.map((f) => (f.fieldKey === fieldKey ? { ...f, required } : f)));
    const supabase = createClient();
    supabase.from("mandatory_field_settings").upsert({ field_key: fieldKey, required }).then(() => {});
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
    const order = Math.max(0, ...stages.map((s) => s.order)) + 1;
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

  function updateStageRequiresAmount(id: string, requiresAmount: boolean) {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, requiresAmount } : s)));
    const supabase = createClient();
    supabase.from("pipeline_stages").update({ requires_amount: requiresAmount }).eq("id", id).then(() => {});
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
    const count = customers.filter((c) => c.stage1Id === id || c.stage2Id === id || c.stage3Id === id).length;
    if (count > 0) {
      return { ok: false, error: `${count} customer(s) are on this stage. Move them first.` };
    }
    setStages((prev) => prev.filter((s) => s.id !== id));
    const supabase = createClient();
    supabase.from("pipeline_stages").delete().eq("id", id).then(() => {});
    return { ok: true };
  }

  function assignmentError(userId: string, pool: PoolStatus, excludeCustomerId?: string) {
    const user = users.find((u) => u.id === userId);
    const limit = pool === "ACTIVE" ? user?.activePoolLimit : user?.inactivePoolLimit;
    if (!user || limit === null || limit === undefined) return undefined;
    const count = customers.filter((c) => {
      if (c.id === excludeCustomerId) return false;
      return (
        (c.assignedToUserId === userId && c.pool1 === pool) ||
        (c.assignedToUserId2 === userId && c.pool2 === pool) ||
        (c.assignedToUserId3 === userId && c.pool3 === pool)
      );
    }).length;
    if (count >= limit) {
      const poolLabel = pool === "ACTIVE" ? "active" : "potential";
      return `${user.name} is at their ${poolLabel} pool limit (${limit}).`;
    }
    return undefined;
  }

  async function addCustomer(input: { name: string; email: string; phone: string; assignedToUserId?: string | null; assignedToUserId2?: string | null; assignedToUserId3?: string | null } & Partial<CustomerProfileInput>) {
    const assigneeIds = [input.assignedToUserId, input.assignedToUserId2, input.assignedToUserId3].filter((id): id is string => !!id);
    if (new Set(assigneeIds).size !== assigneeIds.length) return { ok: false, error: "The same person can't be assigned twice." };
    for (const id of assigneeIds) {
      const error = assignmentError(id, "ACTIVE");
      if (error) return { ok: false, error };
    }
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
        assigned_to: input.assignedToUserId || null,
        assigned_to_2: input.assignedToUserId2 || null,
        assigned_to_3: input.assignedToUserId3 || null,
        pool_1: input.assignedToUserId ? "ACTIVE" : null,
        pool_2: input.assignedToUserId2 ? "ACTIVE" : null,
        pool_3: input.assignedToUserId3 ? "ACTIVE" : null,
        stage_1: input.assignedToUserId ? defaultStage.id : null,
        stage_2: input.assignedToUserId2 ? defaultStage.id : null,
        stage_3: input.assignedToUserId3 ? defaultStage.id : null,
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
        budget_id: profile.budgetId,
        remark: profile.remark || null,
      })
      .select()
      .single();
    if (dbError || !data) return { ok: false, error: dbError?.message ?? "Could not create customer." };
    setCustomers((prev) => [...prev, mapCustomer(data)]);
    return { ok: true };
  }

  function reassignCustomer(customerId: string, slot: 1 | 2 | 3, userId: string | null) {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return { ok: false, error: "Customer not found." };
    const slotKey = slot === 1 ? "assignedToUserId" : slot === 2 ? "assignedToUserId2" : "assignedToUserId3";
    const columnKey = slot === 1 ? "assigned_to" : slot === 2 ? "assigned_to_2" : "assigned_to_3";
    const poolKey = slot === 1 ? "pool1" : slot === 2 ? "pool2" : "pool3";
    const poolColumn = slot === 1 ? "pool_1" : slot === 2 ? "pool_2" : "pool_3";
    const sinceKey = slot === 1 ? "pool1Since" : slot === 2 ? "pool2Since" : "pool3Since";
    const sinceColumn = slot === 1 ? "pool_1_since" : slot === 2 ? "pool_2_since" : "pool_3_since";
    const stageKey = slot === 1 ? "stage1Id" : slot === 2 ? "stage2Id" : "stage3Id";
    const stageColumn = slot === 1 ? "stage_1" : slot === 2 ? "stage_2" : "stage_3";
    const otherSlotKeys = (["assignedToUserId", "assignedToUserId2", "assignedToUserId3"] as const).filter((k) => k !== slotKey);
    const otherSlots = otherSlotKeys.map((k) => customer[k]).filter((id): id is string => !!id);
    if (userId && otherSlots.includes(userId)) return { ok: false, error: "The same person can't be assigned twice." };
    const changing = customer[slotKey] !== userId;
    if (userId && changing) {
      const error = assignmentError(userId, "ACTIVE", customerId);
      if (error) return { ok: false, error };
    }
    // a newly (re)assigned slot always starts in the active pool at the default stage; clearing a slot clears both
    const newPool: PoolStatus | null = userId ? "ACTIVE" : null;
    const defaultStage = stages.find((s) => s.isDefault) ?? stages[0];
    const newStageId: string | null = userId ? (defaultStage?.id ?? null) : null;
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === customerId
          ? { ...c, [slotKey]: userId, ...(changing ? { [poolKey]: newPool, [sinceKey]: null, [stageKey]: newStageId } : {}) }
          : c
      )
    );
    const supabase = createClient();
    const update: Record<string, string | null> = { [columnKey]: userId };
    if (changing) {
      update[poolColumn] = newPool;
      update[sinceColumn] = null;
      update[stageColumn] = newStageId;
    }
    supabase.from("customers").update(update).eq("id", customerId).then(() => {});
    const assignee = userId ? users.find((u) => u.id === userId) : undefined;
    if (assignee) {
      createNotification(userId!, `${assignee.name} was assigned ${customer.name}.`);
    }
    return { ok: true };
  }

  function togglePool(customerId: string, slot: 1 | 2 | 3, pool: PoolStatus) {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return { ok: false, error: "Customer not found." };
    const userId = slot === 1 ? customer.assignedToUserId : slot === 2 ? customer.assignedToUserId2 : customer.assignedToUserId3;
    if (!userId) return { ok: false, error: "This slot has no assignee." };
    if (currentUser?.role !== "ADMIN" && currentUser?.id !== userId) {
      return { ok: false, error: "Only the assignee or an admin can change this pool status." };
    }
    if (pool === "INACTIVE") {
      const error = assignmentError(userId, "INACTIVE", customerId);
      if (error) return { ok: false, error };
    }
    const poolKey = slot === 1 ? "pool1" : slot === 2 ? "pool2" : "pool3";
    const poolColumn = slot === 1 ? "pool_1" : slot === 2 ? "pool_2" : "pool_3";
    const sinceKey = slot === 1 ? "pool1Since" : slot === 2 ? "pool2Since" : "pool3Since";
    const sinceColumn = slot === 1 ? "pool_1_since" : slot === 2 ? "pool_2_since" : "pool_3_since";
    const since = pool === "INACTIVE" ? new Date().toISOString() : null;
    setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, [poolKey]: pool, [sinceKey]: since } : c)));
    const supabase = createClient();
    supabase.from("customers").update({ [poolColumn]: pool, [sinceColumn]: since }).eq("id", customerId).then(() => {});
    return { ok: true };
  }

  function deleteCustomer(customerId: string) {
    setCustomers((prev) => prev.filter((c) => c.id !== customerId));
    const supabase = createClient();
    supabase.from("customers").delete().eq("id", customerId).then(() => {});
  }

  // Business-profile field change log: resolves a raw stored value (a
  // lookup id, or a plain string for name/phone/businessName/remark) to
  // the human-readable text that gets written to customer_change_log, so
  // the log stays readable even if a lookup entry is later renamed.
  function resolveProfileFieldDisplay(key: string, value: unknown): string {
    if (value === null || value === undefined || value === "") return "";
    const str = String(value);
    const lookupByCamelKey: Record<string, { id: string; name: string }[]> = {
      sourceId: leadSources,
      areaId: areas,
      subAreaId: subAreas,
      propertyTypeId: propertyTypes,
      purposeId: purposes,
      businessIndustryId: businessTagIndustries,
      businessCategoryId: businessTagCategories,
      businessTypeId: businessTagTypes,
      raceId: races,
      languageId: languages,
      firsttimeBranchId: firsttimeBranchTypes,
      targetRaceId: targetRaces,
      targetTypeId: targetTypes,
      budgetId: budgets,
    };
    const list = lookupByCamelKey[key];
    if (list) return list.find((x) => x.id === str)?.name ?? str;
    return str;
  }

  // Shared by updateCustomerProfile / updateCustomerRemark / updateCustomerIdentity:
  // diffs `patch` (camelCase keys) against `before` (the pre-update Customer),
  // resolves each changed field to display text, and inserts one
  // customer_change_log row per field that actually changed.
  // `columnMap` maps each patch key to its DB column name (used as field_key).
  function logProfileChanges(
    customerId: string,
    columnMap: Record<string, string>,
    before: Record<string, unknown>,
    patch: Record<string, unknown>
  ) {
    if (!currentUser) return;
    const rows: { customer_id: string; changed_by: string; field_key: string; old_value: string | null; new_value: string | null }[] = [];
    for (const [key, newRaw] of Object.entries(patch)) {
      const column = columnMap[key];
      if (!column) continue;
      const oldDisplay = resolveProfileFieldDisplay(key, before[key]);
      const newDisplay = resolveProfileFieldDisplay(key, newRaw === "" ? null : newRaw);
      if (oldDisplay === newDisplay) continue;
      rows.push({
        customer_id: customerId,
        changed_by: currentUser.id,
        field_key: column,
        old_value: oldDisplay || null,
        new_value: newDisplay || null,
      });
    }
    if (rows.length === 0) return;
    const supabase = createClient();
    supabase.from("customer_change_log").insert(rows).then(() => {});
    const now = new Date().toISOString();
    setChangeLog((prev) => [
      ...rows.map((r) => ({
        id: crypto.randomUUID(),
        customerId: r.customer_id,
        fieldKey: r.field_key,
        oldValue: r.old_value,
        newValue: r.new_value,
        changedByName: currentUser.name,
        changedByUserId: r.changed_by,
        time: formatTimestamp(now),
        createdAt: now,
      })),
      ...prev,
    ]);
  }

  // Records a slot being cleared out (direct admin/manager removal, or an
  // approved removal request) as its own customer_change_log row, so it
  // shows up in Change History same as any other profile edit.
  function logAssignmentRemoval(customerId: string, slot: 1 | 2 | 3, removedUserName: string, note?: string) {
    if (!currentUser) return;
    const column = slot === 1 ? "assigned_to" : slot === 2 ? "assigned_to_2" : "assigned_to_3";
    const row = {
      customer_id: customerId,
      changed_by: currentUser.id,
      field_key: column,
      old_value: removedUserName,
      new_value: note ? `Removed — ${note}` : "Removed",
    };
    const supabase = createClient();
    supabase.from("customer_change_log").insert(row).then(() => {});
    const now = new Date().toISOString();
    setChangeLog((prev) => [
      {
        id: crypto.randomUUID(),
        customerId: row.customer_id,
        fieldKey: row.field_key,
        oldValue: row.old_value,
        newValue: row.new_value,
        changedByName: currentUser.name,
        changedByUserId: row.changed_by,
        time: formatTimestamp(now),
        createdAt: now,
      },
      ...prev,
    ]);
  }

  function updateCustomerProfile(customerId: string, patch: Partial<Omit<CustomerProfileInput, "remark">>) {
    const before = customers.find((c) => c.id === customerId);
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
      budgetId: "budget_id",
    };
    const dbPatch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      const column = columnMap[key];
      if (column) dbPatch[column] = value === "" ? null : value;
    }
    const supabase = createClient();
    supabase.from("customers").update(dbPatch).eq("id", customerId).then(() => {});
    if (before) logProfileChanges(customerId, columnMap, before as unknown as Record<string, unknown>, patch as Record<string, unknown>);
  }

  function updateCustomerRemark(customerId: string, remark: string) {
    const before = customers.find((c) => c.id === customerId);
    setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, remark } : c)));
    const supabase = createClient();
    supabase.from("customers").update({ remark: remark || null }).eq("id", customerId).then(() => {});
    if (before) logProfileChanges(customerId, { remark: "remark" }, before as unknown as Record<string, unknown>, { remark });
  }

  function updateCustomerIdentity(customerId: string, patch: { name?: string; phone?: string }) {
    const before = customers.find((c) => c.id === customerId);
    setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, ...patch } : c)));
    const dbPatch: Record<string, unknown> = {};
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.phone !== undefined) dbPatch.phone = patch.phone || null;
    const supabase = createClient();
    supabase.from("customers").update(dbPatch).eq("id", customerId).then(() => {});
    if (before) logProfileChanges(customerId, { name: "name", phone: "phone" }, before as unknown as Record<string, unknown>, patch as Record<string, unknown>);
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

  // Combined "Log" action for a Log-form submission by someone who occupies
  // a slot on this customer: always writes that slot's stage (the Log form
  // requires a stage pick before this can be called — see the detail
  // page), optionally logs an activity if content was entered, and
  // optionally records a deal_closures row if the picked stage needed an
  // amount. Reuses addActivity for the activity-insert half instead of
  // duplicating it.
  function logActivityAndStage(
    customerId: string,
    slot: 1 | 2 | 3,
    stageId: string,
    type: ActivityType,
    content: string,
    followUp: string,
    closedAmount?: number
  ) {
    if (!currentUser) return;
    const stageKey = slot === 1 ? "stage1Id" : slot === 2 ? "stage2Id" : "stage3Id";
    const stageColumn = slot === 1 ? "stage_1" : slot === 2 ? "stage_2" : "stage_3";
    setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, [stageKey]: stageId } : c)));
    const supabase = createClient();
    supabase.from("customers").update({ [stageColumn]: stageId }).eq("id", customerId).then(() => {});
    if (content.trim()) {
      addActivity(customerId, type, content.trim(), followUp);
    }
    if (closedAmount !== undefined) {
      supabase
        .from("deal_closures")
        .insert({ customer_id: customerId, user_id: currentUser.id, slot, stage_id: stageId, amount: closedAmount })
        .select()
        .single()
        .then(({ data, error }) => {
          if (!error && data) {
            setDealClosures((prev) => [mapDealClosure(data), ...prev]);
          } else if (error) {
            alert("The closed amount could not be saved. Please re-enter it.");
          }
        });
    }
  }

  // Whoever occupies a slot requests their own removal from a customer —
  // does not touch the slot itself; only inserts a PENDING request an
  // ADMIN/MANAGER must approve (see resolveClientRemoval). Blocks a
  // second request while one is already pending for the same slot.
  function requestClientRemoval(customerId: string, slot: 1 | 2 | 3, reasonId: string): { ok: boolean; error?: string } {
    if (!currentUser) return { ok: false, error: "Not signed in." };
    const alreadyPending = removalRequests.some(
      (r) => r.customerId === customerId && r.slot === slot && r.status === "PENDING"
    );
    if (alreadyPending) return { ok: false, error: "A removal request for this slot is already pending." };
    const supabase = createClient();
    supabase
      .from("removal_requests")
      .insert({ customer_id: customerId, slot, requested_by: currentUser.id, reason_id: reasonId, status: "PENDING" })
      .select()
      .single()
      .then(({ data, error }) => {
        if (!error && data) setRemovalRequests((prev) => [mapRemovalRequest(data), ...prev]);
      });
    return { ok: true };
  }

  // ADMIN/MANAGER approves or rejects a pending removal request. Approval
  // reuses the existing reassignCustomer(customerId, slot, null) to clear
  // the slot (assignee, pool, stage) — the customer record itself is
  // never touched or deleted. Rejection only updates the request's status.
  function resolveClientRemoval(requestId: string, approve: boolean) {
    if (!currentUser) return;
    const request = removalRequests.find((r) => r.id === requestId);
    if (!request) return;
    const status: RemovalRequestStatus = approve ? "APPROVED" : "REJECTED";
    const now = new Date().toISOString();
    setRemovalRequests((prev) =>
      prev.map((r) => (r.id === requestId ? { ...r, status, resolvedBy: currentUser.id, resolvedAt: now } : r))
    );
    const supabase = createClient();
    supabase
      .from("removal_requests")
      .update({ status, resolved_by: currentUser.id, resolved_at: now })
      .eq("id", requestId)
      .then(() => {});
    if (approve) {
      const c = customers.find((x) => x.id === request.customerId);
      const occupant =
        request.slot === 1 ? c?.assignedToUserId : request.slot === 2 ? c?.assignedToUserId2 : c?.assignedToUserId3;
      if (occupant === request.requestedBy) {
        // log before clearing: the change-log insert's RLS check needs this
        // slot (or another) to still tie the manager to the row
        const removedUser = users.find((u) => u.id === request.requestedBy);
        const reasonName = removalReasons.find((r) => r.id === request.reasonId)?.name;
        logAssignmentRemoval(request.customerId, request.slot, removedUser?.name ?? "Unknown", reasonName);
        reassignCustomer(request.customerId, request.slot, null);
      }
    }
    createNotification(
      request.requestedBy,
      approve ? "Your client removal request was approved." : "Your client removal request was rejected."
    );
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
    budgets,
    fieldRequirements,
    stages,
    customers,
    activities,
    changeLog,
    dealClosures,
    removalReasons,
    removalRequests,
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
    updateUserPoolLimit,
    deleteUser,
    resetUserPassword,
    addTeam,
    updateTeam,
    deleteTeam,
    addArea,
    updateArea,
    updateAreaTeam,
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
    addBudget,
    updateBudget,
    deleteBudget,
    addRemovalReason,
    updateRemovalReason,
    deleteRemovalReason,
    updateFieldRequirement,
    previewBusinessTagCsv,
    confirmBusinessTagCsvImport,
    addStage,
    renameStage,
    moveStage,
    deleteStage,
    updateStageRequiresAmount,
    reassignCustomer,
    logAssignmentRemoval,
    togglePool,
    deleteCustomer,
    updateCustomerProfile,
    updateCustomerIdentity,
    updateCustomerRemark,
    addActivity,
    logActivityAndStage,
    requestClientRemoval,
    resolveClientRemoval,
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
