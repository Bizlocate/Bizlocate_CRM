import { Activity, Customer, Notification, Stage, Task } from "./types";

// Users and teams now live in Supabase (see lib/store.tsx + supabase/schema.sql).
// Customers/stages/activities/tasks below are still local-only mock data.

export const seedStages: Stage[] = [
  { id: "s1", name: "New", order: 1, isDefault: true },
  { id: "s2", name: "Contacted", order: 2, isDefault: false },
  { id: "s3", name: "Qualified", order: 3, isDefault: false },
  { id: "s4", name: "Won", order: 4, isDefault: false },
  { id: "s5", name: "Lost", order: 5, isDefault: false },
];

export const seedCustomers: Customer[] = [
  { id: "c1", name: "Kedai Runcit Maju Jaya", email: "ahmad.zulkifli@majujaya.com.my", phone: "012-345 6789", stageId: "s3", assignedToUserId: "u4" },
  { id: "c2", name: "Restoran Selera Kampung", email: "siti@seleraskampung.my", phone: "013-221 8890", stageId: "s2", assignedToUserId: "u4" },
  { id: "c3", name: "Bengkel Auto Perkasa", email: "wei.liang@autoperkasa.com", phone: "016-777 2345", stageId: "s1", assignedToUserId: "u5" },
  { id: "c4", name: "Klinik Sihat Sejahtera", email: "priya.kumar@sihatsejahtera.my", phone: "019-888 1122", stageId: "s4", assignedToUserId: "u4" },
  { id: "c5", name: "Syarikat Perabot Warisan", email: "haziq@perabotwarisan.com.my", phone: "017-345 9988", stageId: "s3", assignedToUserId: "u5" },
  { id: "c6", name: "Butik Fesyen Anggun", email: "meiling@butikanggun.my", phone: "011-2345 6780", stageId: "s2", assignedToUserId: "u4" },
  { id: "c7", name: "Ladang Sayur Segar Bumi", email: "kamarul@segarbumi.com", phone: "014-556 7712", stageId: "s5", assignedToUserId: "u5" },
  { id: "c8", name: "Percetakan Cepat Rapi", email: "karyee@cepatrapi.my", phone: "018-909 8877", stageId: "s1", assignedToUserId: "u5" },
];

export const seedActivities: Activity[] = [
  { id: "a1", customerId: "c1", type: "CALL", content: "Called to confirm delivery schedule for Q3 stock.", followUp: "Follow-up: 2 Aug 2026", author: "Nurul Izzati", time: "Today, 10:14 AM" },
  { id: "a2", customerId: "c1", type: "NOTE", content: "Owner mentioned expanding to a second outlet in Shah Alam.", followUp: "", author: "Nurul Izzati", time: "20 Jul 2026" },
  { id: "a3", customerId: "c1", type: "VISIT", content: "Site visit — discussed POS terminal upgrade.", followUp: "Follow-up: 30 Jul 2026", author: "Nurul Izzati", time: "15 Jul 2026" },
  { id: "a4", customerId: "c1", type: "CALL", content: "Introductory call, sent product catalogue.", followUp: "", author: "Nurul Izzati", time: "8 Jul 2026" },
];

export const seedTasks: Task[] = [
  { id: "ot1", customerId: "c1", title: "Send updated quotation", due: "28 Jul 2026", done: false },
  { id: "ot2", customerId: "c1", title: "Follow up on POS upgrade decision", due: "2 Aug 2026", done: false },
  { id: "dt1", customerId: "c1", title: "Send product catalogue", due: "Completed", done: true },
  { id: "dt2", customerId: "c1", title: "Schedule site visit", due: "Completed", done: true },
];

export const seedNotifications: Notification[] = [
  { id: "n1", message: "You were assigned Kedai Runcit Maju Jaya.", time: "2 min ago", unread: true },
  { id: "n2", message: "New task due tomorrow: Follow up on POS upgrade decision.", time: "3 hr ago", unread: true },
  { id: "n3", message: "Bala Subramaniam was deactivated by Admin.", time: "1 hr ago", unread: false },
  { id: "n4", message: "Percetakan Cepat Rapi moved to New.", time: "1 day ago", unread: false },
];
