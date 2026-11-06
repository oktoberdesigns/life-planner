import { query, getSettings } from "./db";
import { sendPush, sendPushOnce } from "./push";
import { todayIn, timeIn, diffDays } from "../../shared/dates";
import { isBreakthrough } from "../../shared/energy";
import type { Task } from "../../shared/types";

const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Runs every 5 minutes. Every notification is sent at most once. */
export async function runReminders(now = new Date()) {
  const s = await getSettings();
  const tz = s.timezone;
  const today = todayIn(tz, now);
  const nowMin = mins(timeIn(tz, now));
  const sent: string[] = [];
  const once = async (key: string, p: Parameters<typeof sendPush>[0]) => {
    if (await sendPushOnce(key, p)) sent.push(key);
  };

  // Appointments
  const appts = await query<{ id: number; title: string; starts_at: Date; location: string }>(
    `select id, title, starts_at, location from appointments
     where starts_at > $1::timestamptz and starts_at - make_interval(mins => remind_minutes) <= $1::timestamptz`,
    [now.toISOString()],
  );
  for (const a of appts) {
    const t = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(a.starts_at));
    await once(`appt:${a.id}:${new Date(a.starts_at).toISOString()}`, {
      title: a.title, body: `Starts at ${t}${a.location ? " · " + a.location : ""}`, tag: `appt-${a.id}`,
    });
  }

  // Custom reminders
  const due = await query<{ id: number; title: string }>(
    "select id, title from reminders where fired_at is null and remind_at <= $1::timestamptz",
    [now.toISOString()],
  );
  for (const r of due) {
    await query("update reminders set fired_at = now() where id = $1", [r.id]);
    await sendPush({ title: "Reminder", body: r.title, tag: `rem-${r.id}` });
    sent.push(`reminder:${r.id}`);
  }

  // Bills: 9am local, once per due date
  if (nowMin >= 9 * 60) {
    const bills = await query<{ id: number; name: string; next_due: string; remind_days: number }>("select id, name, next_due, remind_days from bills");
    for (const b of bills) {
      const d = diffDays(b.next_due, today);
      if (d <= b.remind_days) {
        const body = d < 0 ? `Overdue by ${-d} day${d === -1 ? "" : "s"}` : d === 0 ? "Due today" : `Due in ${d} day${d === 1 ? "" : "s"}`;
        await once(`bill:${b.id}:${b.next_due}`, { title: `Bill: ${b.name}`, body, tag: `bill-${b.id}` });
      }
    }
  }

  // Morning check-in nudge (within 3h of check-in time) and deadline digest
  const checkIn = mins(s.check_in_time);
  if (nowMin >= checkIn && nowMin < checkIn + 180) {
    const logged = await query("select 1 from energy_log where day = $1", [today]);
    if (!logged.length) await once(`checkin:${today}`, { title: "Good morning", body: "How's your energy today? Tap to check in.", tag: "checkin" });
  }
  if (nowMin >= checkIn) {
    const tasks = await query<Task>("select * from tasks where status = 'todo' and due_date is not null");
    const urgent = tasks.filter((t) => isBreakthrough(t, today));
    if (urgent.length) {
      const overdue = urgent.filter((t) => diffDays(t.due_date!, today) < 0).length;
      await once(`digest:${today}`, {
        title: `${urgent.length} deadline${urgent.length === 1 ? "" : "s"} on your radar`,
        body: (overdue ? `${overdue} overdue. ` : "") + urgent.slice(0, 3).map((t) => t.title).join(" · "),
        tag: "digest",
      });
    }
  }
  await query("delete from notification_log where sent_at < now() - interval '30 days'");
  return sent;
}
