export type Role = "ADMIN" | "MANAGER" | "SALESPERSON";

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  ic: string | null;
  role: Role;
  teamId: string | null;
  active: boolean;
  customerLimit: number | null;
}

export interface Team {
  id: string;
  name: string;
  managerId: string | null;
}

export interface Area {
  id: string;
  name: string;
}

export interface SubArea {
  id: string;
  areaId: string;
  name: string;
}

export interface LeadSource {
  id: string;
  name: string;
}

export interface PropertyType {
  id: string;
  name: string;
}

export interface Purpose {
  id: string;
  name: string;
}

export interface Language {
  id: string;
  name: string;
}

export interface FirsttimeBranchType {
  id: string;
  name: string;
}

export interface Race {
  id: string;
  name: string;
}

export interface TargetRace {
  id: string;
  name: string;
}

export interface TargetType {
  id: string;
  name: string;
}

export interface FieldRequirement {
  fieldKey: string;
  required: boolean;
}

export const MANDATORY_FIELD_KEYS = [
  "phone",
  "assigned_to",
  "source",
  "area",
  "sub_area",
  "property_type",
  "purpose",
  "business_industry",
  "business_category",
  "business_type",
] as const;

export const MANDATORY_FIELD_LABELS: Record<string, string> = {
  phone: "Phone",
  assigned_to: "Assigned To",
  source: "Source",
  area: "Area",
  sub_area: "Subarea",
  property_type: "Property Type",
  purpose: "Purpose",
  business_industry: "Business Industry",
  business_category: "Business Category",
  business_type: "Business Type",
};

export interface CsvPreviewArea {
  name: string;
  isNew: boolean;
  subAreaNames: string[];
}

export interface CsvRejectedRow {
  row: number;
  area: string;
  subArea: string;
  reason: string;
}

export interface CsvPreviewRow {
  row: number;
  area: string;
  subArea: string;
  approved: boolean;
  reason?: string;
}

export interface CsvPreview {
  approvedAreas: CsvPreviewArea[];
  rejected: CsvRejectedRow[];
  rows: CsvPreviewRow[];
  approvedCount: number;
  rejectedCount: number;
}

export interface BusinessTagIndustry {
  id: string;
  name: string;
}

export interface BusinessTagCategory {
  id: string;
  industryId: string;
  name: string;
}

export interface BusinessTagType {
  id: string;
  categoryId: string;
  name: string;
}

export interface CsvPreviewBusinessTagCategory {
  name: string;
  isNew: boolean;
  typeNames: string[];
}

export interface CsvPreviewBusinessTagIndustry {
  name: string;
  isNew: boolean;
  categories: CsvPreviewBusinessTagCategory[];
}

export interface CsvRejectedBusinessTagRow {
  row: number;
  industry: string;
  category: string;
  type: string;
  reason: string;
}

export interface CsvBusinessTagPreviewRow {
  row: number;
  industry: string;
  category: string;
  type: string;
  approved: boolean;
  reason?: string;
}

export interface CsvBusinessTagPreview {
  approvedIndustries: CsvPreviewBusinessTagIndustry[];
  rejected: CsvRejectedBusinessTagRow[];
  rows: CsvBusinessTagPreviewRow[];
  approvedCount: number;
  rejectedCount: number;
}

export interface Stage {
  id: string;
  name: string;
  order: number;
  isDefault: boolean;
}

export const STAGE_STYLES: Record<string, { bg: string; color: string }> = {
  New: { bg: "#eef0f4", color: "#4b5566" },
  Contacted: { bg: "#e8f0fe", color: "#2149b0" },
  Qualified: { bg: "#fff4e0", color: "#8a5a00" },
  Won: { bg: "#e7f6ec", color: "#1e7a41" },
  Lost: { bg: "#fbe9e7", color: "#a13a2b" },
};

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  stageId: string;
  assignedToUserId: string;
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

export type ActivityType = "CALL" | "VISIT" | "NOTE";

export const ACTIVITY_STYLES: Record<ActivityType, { label: string; bg: string; color: string }> = {
  CALL: { label: "Call", bg: "#e8f0fe", color: "#2149b0" },
  NOTE: { label: "Note", bg: "#eef0f4", color: "#4b5566" },
  VISIT: { label: "Visit", bg: "#f1e9fb", color: "#6b3fa0" },
};

export interface Activity {
  id: string;
  customerId: string;
  type: ActivityType;
  content: string;
  followUp: string;
  author: string;
  time: string;
}

export interface Task {
  id: string;
  customerId: string;
  title: string;
  due: string;
  done: boolean;
}

export interface Notification {
  id: string;
  message: string;
  time: string;
  unread: boolean;
}
