import { addDays, weekday } from "./dates";
import type { Habit, HabitLog, Level } from "./types";

/**
 * Streak rules (built so a bad day never punishes you):
 * - a scheduled day counts if done
 * - a day marked "rest" is skipped (neither adds nor breaks)
 * - a day you checked in as red is skipped automatically
 * - today never breaks the streak, you still have time
 */
/** First day a habit can count (one day of slack covers timezone differences). */
export const habitStart = (h: Habit) => addDays(h.created_at.slice(0, 10), -1);

export function computeStreak(
  habit: Habit,
  logs: Map<string, "done" | "rest">,
  energy: Record<string, Level>,
  today: string,
): number {
  const startedOn = habitStart(habit);
  let streak = 0;
  let d = today;
  for (let i = 0; i < 730; i++) {
    if (d < startedOn && !logs.has(d)) break;
    if (habit.days.includes(weekday(d))) {
      const s = logs.get(d);
      if (s === "done") streak++;
      else if (s === "rest") { /* skip */ }
      else if (energy[d] === "red") { /* auto rest */ }
      else if (d === today) { /* still time */ }
      else break;
    }
    d = addDays(d, -1);
  }
  return streak;
}

export function logMap(logs: HabitLog[], habitId: number): Map<string, "done" | "rest"> {
  const m = new Map<string, "done" | "rest">();
  for (const l of logs) if (l.habit_id === habitId) m.set(l.day, l.status);
  return m;
}
