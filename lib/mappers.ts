import type { Activity, ActivityType, Area, Customer, PoolStatus, Role, Stage, User } from "./types";

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

export function mapProfile(row: { id: string; name: string; email: string; phone: string | null; ic: string | null; role: Role; team_id: string | null; status: string; active_pool_limit: number | null; inactive_pool_limit: number | null; auto_assign_enabled: boolean }): User {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone, ic: row.ic, role: row.role, teamId: row.team_id, active: row.status === "ACTIVE", activePoolLimit: row.active_pool_limit, inactivePoolLimit: row.inactive_pool_limit, autoAssignEnabled: row.auto_assign_enabled ?? true };
}

export function mapArea(row: { id: string; name: string; auto_assign_enabled: boolean; auto_assign_resumed_at: string; last_auto_assigned_user_id: string | null }, teamIds: string[]): Area {
  return { id: row.id, name: row.name, teamIds, autoAssignEnabled: row.auto_assign_enabled ?? true, autoAssignResumedAt: row.auto_assign_resumed_at, lastAutoAssignedUserId: row.last_auto_assigned_user_id };
}

export function mapStage(row: { id: string; name: string; order: number; is_default: boolean; requires_amount: boolean; exclude_from_auto_assign: boolean }): Stage {
  return { id: row.id, name: row.name, order: row.order, isDefault: row.is_default, requiresAmount: row.requires_amount, excludeFromAutoAssign: row.exclude_from_auto_assign ?? false };
}

export function mapCustomer(row: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  optional_phone: string | null;
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
  budget_min: number | null;
  budget_max: number | null;
  remark: string | null;
  created_by: string | null;
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
    budgetMin: row.budget_min,
    budgetMax: row.budget_max,
    optionalPhone: row.optional_phone ?? "",
    remark: row.remark ?? "",
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapActivity(row: {
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
