// Day strings are always "YYYY-MM-DD" in the user's timezone.
const DAY = 86_400_000;
const toDate = (s: string) => new Date(s + "T00:00:00Z");
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (s: string, n: number) => fmt(new Date(toDate(s).getTime() + n * DAY));
export const diffDays = (a: string, b: string) => Math.round((toDate(a).getTime() - toDate(b).getTime()) / DAY);
export const weekday = (s: string) => toDate(s).getUTCDay();

export function todayIn(tz?: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "HH:MM" 24h in the given timezone */
export function timeIn(tz?: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}

export function addMonths(s: string, n: number): string {
  const d = toDate(s);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return fmt(d);
}

export function nextOccurrence(day: string, recurrence: "daily" | "weekly" | "monthly" | "yearly"): string {
  if (recurrence === "daily") return addDays(day, 1);
  if (recurrence === "weekly") return addDays(day, 7);
  if (recurrence === "monthly") return addMonths(day, 1);
  return addMonths(day, 12);
}
