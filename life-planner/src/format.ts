import { diffDays } from "../shared/dates";

export function fmtDay(day: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(new Date(day + "T00:00:00Z"));
}
export function fmtTime(iso: string, tz?: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(new Date(iso));
}
export function dayOfIso(iso: string, tz?: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
export function relDay(day: string, today: string) {
  const d = diffDays(day, today);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  if (d < 0) return `${-d} days overdue`;
  if (d < 7) return fmtDay(day, { weekday: "long" });
  return fmtDay(day);
}
export const effortLabel = (m: number) => (m < 60 ? `${m}m` : `${m / 60}h`);

/** datetime-local value <-> ISO, in the user's timezone */
export function isoToLocalInput(iso: string, tz?: string) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}
export function localInputToIso(v: string, tz?: string) {
  // Interpret the typed wall-clock time in `tz`
  const [date, time] = v.split("T");
  const guess = new Date(`${date}T${time}:00Z`);
  const shown = isoToLocalInput(guess.toISOString(), tz);
  const diff = new Date(`${shown}:00Z`).getTime() - guess.getTime();
  return new Date(guess.getTime() - diff).toISOString();
}

export function spotifyEmbed(url: string): string | null {
  const m = url.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|track|artist|show|episode)\/([A-Za-z0-9]+)/);
  return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}?theme=0` : null;
}

/** "Today" / "Tomorrow" for the near term, otherwise a short date. */
export function whenLabel(day: string, today: string) {
  const d = diffDays(day, today);
  return d >= -1 && d <= 1 ? relDay(day, today) : d < -1 ? relDay(day, today) : fmtDay(day);
}
