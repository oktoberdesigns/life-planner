import { diffDays } from "./dates";
import { LEVEL_RANK, type Level, type Task } from "./types";

export const DEFAULT_CAPS: Record<Level, number> = { red: 3, yellow: 5, green: 8 };

/** Days before a hard deadline when it pushes through the energy lock. */
export const HARD_WINDOW = 3;

export function isBreakthrough(t: Task, today: string): boolean {
  if (!t.due_date) return false;
  const d = diffDays(t.due_date, today);
  return t.hard_deadline ? d <= HARD_WINDOW : d <= 0;
}

export interface Plan {
  focus: Task[];   // what to show today
  later: Task[];   // eligible but over today's cap
  hidden: Task[];  // above your energy level (soft-locked)
  deadlines: Task[]; // anything pushing through the lock
}

function urgency(t: Task, today: string): number {
  if (!t.due_date) return 1000;
  return diffDays(t.due_date, today);
}

export function planTasks(tasks: Task[], energy: Level, today: string, caps = DEFAULT_CAPS): Plan {
  const open = tasks.filter((t) => t.status === "todo");
  const rank = LEVEL_RANK[energy];
  const cmp = (a: Task, b: Task) =>
    urgency(a, today) - urgency(b, today) ||
    LEVEL_RANK[b.level] - LEVEL_RANK[a.level] ||
    a.id - b.id;

  const must: Task[] = [];
  const fits: Task[] = [];
  const hidden: Task[] = [];
  for (const t of open) {
    if (isBreakthrough(t, today) || t.pulled_on === today) must.push(t);
    else if (LEVEL_RANK[t.level] <= rank) fits.push(t);
    else hidden.push(t);
  }
  must.sort(cmp); fits.sort(cmp); hidden.sort(cmp);

  const cap = caps[energy];
  const room = Math.max(0, cap - must.length);
  return {
    focus: [...must, ...fits.slice(0, room)],
    later: fits.slice(room),
    hidden,
    deadlines: open.filter((t) => isBreakthrough(t, today)).sort(cmp),
  };
}
