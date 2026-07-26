export type Role = "ADMIN" | "MANAGER" | "SALESPERSON";

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
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
