export type Level = "green" | "yellow" | "red";
export const LEVELS: Level[] = ["green", "yellow", "red"];
export const LEVEL_RANK: Record<Level, number> = { red: 1, yellow: 2, green: 3 };
export const LEVEL_LABEL: Record<Level, string> = { green: "Above & beyond", yellow: "Steady", red: "Gentle day" };

export type Area = "personal" | "business";
export type PhaseStatus = "upcoming" | "in_progress" | "awaiting_approval" | "changes_requested" | "approved";

export const PHASE_LABEL: Record<PhaseStatus, string> = {
  upcoming: "Upcoming",
  in_progress: "In progress",
  awaiting_approval: "Needs your approval",
  changes_requested: "Changes requested",
  approved: "Approved",
};

export interface Task {
  id: number;
  title: string;
  notes: string;
  area: Area;
  level: Level;
  effort: number;
  level_source: "ai" | "rule" | "user";
  due_date: string | null;
  hard_deadline: boolean;
  status: "todo" | "done";
  done_at: string | null;
  pulled_on: string | null;
  recurrence: "daily" | "weekly" | "monthly" | null;
  project_id: number | null;
  phase_id: number | null;
  created_at: string;
}

export interface Habit {
  id: number;
  name: string;
  emoji: string;
  category: "daily" | "self_care";
  days: number[];
  archived: boolean;
  position: number;
  created_at: string;
}
export interface HabitLog { habit_id: number; day: string; status: "done" | "rest" }

export interface Appointment {
  id: number; title: string; starts_at: string; ends_at: string | null;
  location: string; notes: string; remind_minutes: number;
}
export interface Bill {
  id: number; name: string; next_due: string;
  recurrence: "once" | "weekly" | "monthly" | "yearly";
  remind_days: number; last_paid_on: string | null;
}
export interface Reminder { id: number; title: string; remind_at: string; fired_at: string | null }
export interface Goal { id: number; area: string; title: string; done: boolean; position: number }

export interface Phase {
  id: number; project_id: number; name: string; description: string; position: number;
  status: PhaseStatus; due_date: string | null; needs_approval: boolean;
}
export interface Project {
  id: number; name: string; client_name: string; client_email: string; kind: string;
  status: "active" | "paused" | "done"; due_date: string | null; notes: string;
  token: string; portal_enabled: boolean; client_theme: string | null; created_at: string;
  unread?: number;
}
export interface Message {
  id: number; project_id: number; phase_id: number | null; sender: "owner" | "client";
  kind: "message" | "approval" | "changes"; body: string; created_at: string;
}

export interface Settings {
  name: string;
  timezone: string;
  check_in_time: string;
  spotify_url: string;
  quotes: string[];
  goal_areas: string[];
  caps: Record<Level, number>;
  portal_from_name: string;
}

export interface AppState {
  today: string;
  settings: Settings;
  energy: Record<string, Level>;
  tasks: Task[];
  habits: Habit[];
  habit_logs: HabitLog[];
  appointments: Appointment[];
  bills: Bill[];
  reminders: Reminder[];
  goals: Goal[];
  projects: Project[];
  phases: Phase[];
  integrations: { ai: boolean; email: boolean; push: number };
}

export interface PortalData {
  project: { id: number; name: string; client_name: string; client_theme: string | null; status: string; due_date: string | null };
  owner_name: string;
  phases: Phase[];
  messages: Message[];
}

export const PROJECT_PRESETS: Record<string, { label: string; phases: string[] }> = {
  branding: { label: "Branding", phases: ["Onboarding", "Research & mood board", "Concepts", "Revisions", "Final delivery"] },
  website: { label: "Website", phases: ["Onboarding", "Content & sitemap", "Design", "Build", "Review & revisions", "Launch"] },
  social: { label: "Instagram strategy", phases: ["Onboarding", "Audit", "Strategy", "Content plan", "Handoff"] },
  custom: { label: "Blank", phases: ["Kickoff", "In progress", "Review", "Delivery"] },
};
