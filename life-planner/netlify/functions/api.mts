import type { Config, Context } from "@netlify/functions";
import { Router, type Ctx } from "../lib/router";
import { HttpError, isOwner, makeSessionCookie, clearSessionCookie, checkPasscode, checkRateLimit, recordFailure, newToken } from "../lib/auth";
import { query, getSettings, saveSettings, ensureSeed, setKV } from "../lib/db";
import { levelTask, aiEnabled } from "../lib/ai";
import { vapid, sendPush } from "../lib/push";
import { emailEnabled } from "../lib/email";
import { notifyOwner, emailClient, siteUrl } from "../lib/projects";
import { runReminders } from "../lib/reminders";
import { env } from "../lib/env";
import { todayIn, addDays, nextOccurrence } from "../../shared/dates";
import { PROJECT_PRESETS, type Level, type Settings } from "../../shared/types";

const r = new Router();

/* ---------- helpers ---------- */
const LEVELS = ["green", "yellow", "red"];
async function today() { return todayIn((await getSettings()).timezone); }

const RESOURCES: Record<string, { table: string; cols: string[]; nullable: string[] }> = {
  tasks: {
    table: "tasks",
    cols: ["title", "notes", "area", "level", "effort", "level_source", "due_date", "hard_deadline", "status", "done_at", "pulled_on", "recurrence", "project_id", "phase_id"],
    nullable: ["due_date", "recurrence", "project_id", "phase_id", "pulled_on", "done_at"],
  },
  habits: { table: "habits", cols: ["name", "emoji", "category", "days", "archived", "position"], nullable: [] },
  appointments: { table: "appointments", cols: ["title", "starts_at", "ends_at", "location", "notes", "remind_minutes"], nullable: ["ends_at"] },
  bills: { table: "bills", cols: ["name", "next_due", "recurrence", "remind_days"], nullable: [] },
  reminders: { table: "reminders", cols: ["title", "remind_at"], nullable: [] },
  goals: { table: "goals", cols: ["area", "title", "done", "position"], nullable: [] },
  phases: { table: "phases", cols: ["project_id", "name", "description", "position", "status", "due_date", "needs_approval"], nullable: ["due_date"] },
  projects: { table: "projects", cols: ["name", "client_name", "client_email", "status", "due_date", "notes", "portal_enabled"], nullable: ["due_date"] },
};

function pick(res: (typeof RESOURCES)[string], body: any) {
  const keys = res.cols.filter((c) => body[c] !== undefined);
  const vals = keys.map((c) => (body[c] === "" && res.nullable.includes(c) ? null : body[c]));
  return { keys, vals };
}

async function insertRow(name: string, body: any) {
  const res = RESOURCES[name];
  const { keys, vals } = pick(res, body);
  const sql = keys.length
    ? `insert into ${res.table} (${keys.join(",")}) values (${keys.map((_, i) => "$" + (i + 1)).join(",")}) returning *`
    : `insert into ${res.table} default values returning *`;
  return (await query(sql, vals))[0];
}

async function updateRow(name: string, id: string, body: any) {
  const res = RESOURCES[name];
  const { keys, vals } = pick(res, body);
  if (!keys.length) return (await query(`select * from ${res.table} where id = $1`, [id]))[0];
  const sql = `update ${res.table} set ${keys.map((k, i) => `${k} = $${i + 1}`).join(", ")} where id = $${keys.length + 1} returning *`;
  const row = (await query(sql, [...vals, id]))[0];
  if (!row) throw new HttpError(404, "Not found");
  return row;
}

/* ---------- auth ---------- */
const ipOf = (req: Request) => req.headers.get("x-nf-client-connection-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";

r.get("/auth/me", ({ owner }) => ({ owner, configured: !!env("OWNER_PASSCODE") }), false);
r.post("/auth/login", async (c) => {
  const { passcode } = await c.json();
  const ip = ipOf(c.req);
  await checkRateLimit(ip);
  if (typeof passcode !== "string" || !checkPasscode(passcode)) {
    await recordFailure(ip);
    throw new HttpError(401, "That passcode isn't right");
  }
  await setKV("site_url", c.url.origin);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json", "set-cookie": makeSessionCookie(c.url.protocol === "https:") },
  });
}, false);
r.post("/auth/logout", (c) =>
  new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json", "set-cookie": clearSessionCookie(c.url.protocol === "https:") },
  }), false);

/* ---------- whole-app state ---------- */
r.get("/state", async () => {
  await ensureSeed();
  const settings = await getSettings();
  const td = todayIn(settings.timezone);
  const [tasks, habits, habit_logs, appointments, bills, reminders, goals, projects, phases, energyRows, push] = await Promise.all([
    query("select * from tasks where status = 'todo' or done_at > now() - interval '2 days' order by id"),
    query("select * from habits where not archived order by position, id"),
    query("select * from habit_logs where day >= $1", [addDays(td, -400)]),
    query("select * from appointments where starts_at > now() - interval '40 days' order by starts_at"),
    query("select * from bills order by next_due"),
    query("select * from reminders where fired_at is null order by remind_at"),
    query("select * from goals order by position, id"),
    query(`select p.*, (select count(*)::int from messages m where m.project_id = p.id and m.sender = 'client' and not m.read_by_owner) as unread
           from projects p order by (p.status = 'done'), p.created_at desc`),
    query("select * from phases order by project_id, position, id"),
    query("select day, level from energy_log where day >= $1", [addDays(td, -60)]),
    query("select count(*)::int as n from push_subscriptions"),
  ]);
  const energy: Record<string, Level> = {};
  for (const e of energyRows as any[]) energy[e.day] = e.level;
  return {
    today: td, settings, energy, tasks, habits, habit_logs, appointments, bills, reminders, goals, projects, phases,
    integrations: { ai: aiEnabled(), email: emailEnabled(), push: (push as any[])[0].n },
  };
});

r.put("/energy", async (c) => {
  const { level, day } = await c.json();
  if (!LEVELS.includes(level)) throw new HttpError(400, "Bad level");
  const d = typeof day === "string" ? day : await today();
  await query("insert into energy_log (day, level) values ($1, $2) on conflict (day) do update set level = excluded.level, updated_at = now()", [d, level]);
});

r.put("/settings", async (c) => {
  const b = await c.json();
  const patch: Partial<Settings> = {};
  if (typeof b.name === "string") patch.name = b.name.slice(0, 60);
  if (typeof b.timezone === "string") {
    try { new Intl.DateTimeFormat("en", { timeZone: b.timezone }); patch.timezone = b.timezone; } catch { /* ignore bad tz */ }
  }
  if (typeof b.check_in_time === "string" && /^\d{2}:\d{2}$/.test(b.check_in_time)) patch.check_in_time = b.check_in_time;
  if (typeof b.spotify_url === "string") patch.spotify_url = b.spotify_url.trim();
  if (Array.isArray(b.quotes)) patch.quotes = b.quotes.map(String).filter(Boolean).slice(0, 200);
  if (Array.isArray(b.goal_areas)) patch.goal_areas = b.goal_areas.map(String).filter(Boolean).slice(0, 12);
  if (typeof b.portal_from_name === "string") patch.portal_from_name = b.portal_from_name.slice(0, 80);
  if (b.caps && typeof b.caps === "object") {
    const caps = { ...(await getSettings()).caps };
    for (const l of LEVELS) if (Number.isInteger(b.caps[l]) && b.caps[l] > 0 && b.caps[l] < 50) caps[l as Level] = b.caps[l];
    patch.caps = caps;
  }
  return saveSettings(patch);
});

/* ---------- tasks ---------- */
r.post("/tasks", async (c) => {
  const b = await c.json();
  if (!b.title || typeof b.title !== "string") throw new HttpError(400, "Title required");
  const td = await today();
  const hasLevel = LEVELS.includes(b.level);
  const body: any = { ...b, title: b.title.trim() };
  if (!hasLevel) {
    const l = await levelTask(body.title, body.notes ?? "", td, { area: b.area });
    body.level = l.level; body.effort = b.effort ?? l.effort; body.area = b.area ?? l.area;
    body.level_source = l.source;
    if (!b.due_date && l.due_date) body.due_date = l.due_date;
  } else body.level_source = "user";
  return insertRow("tasks", body);
});

r.patch("/tasks/:id", async (c) => {
  const b = await c.json();
  const [old] = await query<any>("select * from tasks where id = $1", [c.params.id]);
  if (!old) throw new HttpError(404, "Not found");
  if (b.level && LEVELS.includes(b.level) && b.level !== old.level) {
    b.level_source = "user";
    if (old.level_source !== "user") await query("insert into task_corrections (title, ai_level, user_level) values ($1,$2,$3)", [old.title, old.level, b.level]);
  }
  if (b.status === "done" && old.status !== "done") {
    b.done_at = new Date().toISOString();
    if (old.recurrence) {
      const base = old.due_date ?? (await today());
      await query(
        `insert into tasks (title, notes, area, level, effort, level_source, due_date, hard_deadline, recurrence, project_id, phase_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [old.title, old.notes, old.area, old.level, old.effort, old.level_source, nextOccurrence(base, old.recurrence), old.hard_deadline, old.recurrence, old.project_id, old.phase_id],
      );
    }
  }
  if (b.status === "todo") b.done_at = null;
  return updateRow("tasks", c.params.id, b);
});

// Soft lock: pull one hidden task into today's list
r.post("/tasks/:id/pull", async (c) => {
  await query("update tasks set pulled_on = $1 where id = $2", [await today(), c.params.id]);
});

/* ---------- generic CRUD ---------- */
for (const name of ["habits", "appointments", "bills", "reminders", "goals"]) {
  r.post(`/${name}`, async (c) => insertRow(name, await c.json()));
  r.patch(`/${name}/:id`, async (c) => updateRow(name, c.params.id, await c.json()));
  r.del(`/${name}/:id`, async (c) => { await query(`delete from ${RESOURCES[name].table} where id = $1`, [c.params.id]); });
}
r.del("/tasks/:id", async (c) => { await query("delete from tasks where id = $1", [c.params.id]); });

r.put("/habits/:id/log", async (c) => {
  const { day, status } = await c.json();
  if (typeof day !== "string") throw new HttpError(400, "day required");
  if (status === "done" || status === "rest") {
    await query("insert into habit_logs (habit_id, day, status) values ($1,$2,$3) on conflict (habit_id, day) do update set status = excluded.status", [c.params.id, day, status]);
  } else await query("delete from habit_logs where habit_id = $1 and day = $2", [c.params.id, day]);
});

r.post("/bills/:id/paid", async (c) => {
  const [b] = await query<any>("select * from bills where id = $1", [c.params.id]);
  if (!b) throw new HttpError(404, "Not found");
  if (b.recurrence === "once") await query("delete from bills where id = $1", [b.id]);
  else await query("update bills set next_due = $1, last_paid_on = $2 where id = $3", [nextOccurrence(b.next_due, b.recurrence), await today(), b.id]);
});

/* ---------- projects & portal management ---------- */
r.post("/projects", async (c) => {
  const b = await c.json();
  if (!b.name) throw new HttpError(400, "Name required");
  const preset = PROJECT_PRESETS[b.kind] ?? PROJECT_PRESETS.custom;
  const body = { ...b, kind: PROJECT_PRESETS[b.kind] ? b.kind : "custom" };
  const [p] = await query<any>(
    "insert into projects (name, client_name, client_email, kind, due_date, notes, token) values ($1,$2,$3,$4,$5,$6,$7) returning *",
    [body.name, body.client_name ?? "", body.client_email ?? "", body.kind, body.due_date || null, body.notes ?? "", newToken()],
  );
  for (let i = 0; i < preset.phases.length; i++) {
    await query("insert into phases (project_id, name, position, status) values ($1,$2,$3,$4)", [p.id, preset.phases[i], i, i === 0 ? "in_progress" : "upcoming"]);
  }
  return p;
});
r.patch("/projects/:id", async (c) => updateRow("projects", c.params.id, await c.json()));
r.del("/projects/:id", async (c) => { await query("delete from projects where id = $1", [c.params.id]); });
r.post("/projects/:id/rotate-token", async (c) => (await query("update projects set token = $1 where id = $2 returning token", [newToken(), c.params.id]))[0]);

r.post("/projects/:id/phases", async (c) => {
  const b = await c.json();
  const [{ n }] = await query<{ n: number }>("select coalesce(max(position), -1) + 1 as n from phases where project_id = $1", [c.params.id]);
  return insertRow("phases", { ...b, project_id: Number(c.params.id), position: n });
});
r.patch("/phases/:id", async (c) => {
  const b = await c.json();
  const phase = await updateRow("phases", c.params.id, b);
  if (b.status === "awaiting_approval") {
    await emailClient(phase.project_id, "{studio}: ready for your review", `"${phase.name}" is ready for your review. Take a look and approve it or request changes.`, await siteUrl(c.req), "Review now");
  }
  return phase;
});
r.del("/phases/:id", async (c) => { await query("delete from phases where id = $1", [c.params.id]); });

r.get("/projects/:id/messages", async (c) =>
  query("select id, project_id, phase_id, sender, kind, body, created_at from messages where project_id = $1 order by created_at, id", [c.params.id]));
r.post("/projects/:id/messages/read", async (c) => { await query("update messages set read_by_owner = true where project_id = $1", [c.params.id]); });
r.post("/projects/:id/messages", async (c) => {
  const b = await c.json();
  const text = String(b.body ?? "").trim().slice(0, 4000);
  if (!text) throw new HttpError(400, "Message is empty");
  const [m] = await query("insert into messages (project_id, phase_id, sender, body, read_by_owner) values ($1,$2,'owner',$3,true) returning *", [c.params.id, b.phase_id || null, text]);
  await emailClient(Number(c.params.id), "{studio}: new message", text, await siteUrl(c.req), "Reply in your portal");
  return m;
});
r.post("/projects/:id/send-link", async (c) => {
  const origin = await siteUrl(c.req);
  const [p] = await query<any>("select * from projects where id = $1", [c.params.id]);
  if (!p) throw new HttpError(404, "Not found");
  const s = await getSettings();
  const sent = await emailClient(p.id, "{studio}: your project portal", `Hi ${p.client_name || "there"},\n\nHere's your private link to follow along with "${p.name}", see where we are, message me, and approve each step.`, origin, "Open your portal");
  return { sent, link: `${origin}/p/${p.token}`, from: s.portal_from_name };
});

/* ---------- push ---------- */
r.get("/push/key", async () => ({ key: (await vapid()).publicKey }));
r.post("/push/subscribe", async (c) => {
  const b = await c.json();
  if (!b.endpoint || !b.keys?.p256dh || !b.keys?.auth) throw new HttpError(400, "Bad subscription");
  await query(
    "insert into push_subscriptions (endpoint, p256dh, auth, label) values ($1,$2,$3,$4) on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label",
    [b.endpoint, b.keys.p256dh, b.keys.auth, String(b.label ?? "").slice(0, 80)],
  );
});
r.post("/push/unsubscribe", async (c) => { const b = await c.json(); await query("delete from push_subscriptions where endpoint = $1", [b.endpoint]); });
r.post("/push/test", async () => ({ devices: await sendPush({ title: "Life Planner", body: "Notifications are working 🎉" }) }));
r.post("/push/run", async () => ({ sent: await runReminders() }));

/* ---------- client portal (no login, link = access) ---------- */
async function portalProject(token: string) {
  const [p] = await query<any>("select * from projects where token = $1 and portal_enabled", [token]);
  if (!p) throw new HttpError(404, "This link isn't active");
  return p;
}
r.get("/portal/:token", async (c) => {
  const p = await portalProject(c.params.token);
  const [phases, messages, s] = await Promise.all([
    query("select id, project_id, name, description, position, status, due_date, needs_approval from phases where project_id = $1 order by position, id", [p.id]),
    query("select id, project_id, phase_id, sender, kind, body, created_at from messages where project_id = $1 order by created_at, id", [p.id]),
    getSettings(),
  ]);
  await query("update messages set read_by_client = true where project_id = $1 and sender = 'owner' and not read_by_client", [p.id]);
  return {
    project: { id: p.id, name: p.name, client_name: p.client_name, client_theme: p.client_theme, status: p.status, due_date: p.due_date },
    owner_name: s.portal_from_name, phases, messages,
  };
}, false);

r.post("/portal/:token/theme", async (c) => {
  const p = await portalProject(c.params.token);
  const { theme } = await c.json();
  if (!["light", "dark", "system"].includes(theme)) throw new HttpError(400, "Bad theme");
  await query("update projects set client_theme = $1 where id = $2", [theme, p.id]);
}, false);

r.post("/portal/:token/messages", async (c) => {
  const p = await portalProject(c.params.token);
  const b = await c.json();
  const text = String(b.body ?? "").trim().slice(0, 4000);
  if (!text) throw new HttpError(400, "Message is empty");
  await query("insert into messages (project_id, phase_id, sender, body, read_by_client) values ($1,$2,'client',$3,true)", [p.id, b.phase_id || null, text]);
  await notifyOwner(`${p.client_name || p.name}: new message`, text, p.id);
}, false);

r.post("/portal/:token/phases/:id/approve", async (c) => {
  const p = await portalProject(c.params.token);
  const [ph] = await query<any>("select * from phases where id = $1 and project_id = $2", [c.params.id, p.id]);
  if (!ph) throw new HttpError(404, "Not found");
  if (ph.status !== "awaiting_approval") throw new HttpError(409, "This step isn't waiting for approval");
  const b = await c.json();
  await query("update phases set status = 'approved' where id = $1", [ph.id]);
  await query("insert into messages (project_id, phase_id, sender, kind, body, read_by_client) values ($1,$2,'client','approval',$3,true)", [p.id, ph.id, String(b.body ?? "").trim().slice(0, 2000) || `Approved: ${ph.name}`]);
  await notifyOwner(`${p.client_name || p.name} approved "${ph.name}"`, "Ready to move on to the next phase.", p.id);
}, false);

r.post("/portal/:token/phases/:id/changes", async (c) => {
  const p = await portalProject(c.params.token);
  const [ph] = await query<any>("select * from phases where id = $1 and project_id = $2", [c.params.id, p.id]);
  if (!ph) throw new HttpError(404, "Not found");
  if (ph.status !== "awaiting_approval") throw new HttpError(409, "This step isn't waiting for approval");
  const b = await c.json();
  const text = String(b.body ?? "").trim().slice(0, 4000);
  if (!text) throw new HttpError(400, "Tell me what you'd like changed");
  await query("update phases set status = 'changes_requested' where id = $1", [ph.id]);
  await query("insert into messages (project_id, phase_id, sender, kind, body, read_by_client) values ($1,$2,'client','changes',$3,true)", [p.id, ph.id, text]);
  await notifyOwner(`${p.client_name || p.name} requested changes on "${ph.name}"`, text, p.id);
}, false);

/* ---------- entry ---------- */
export default async (req: Request, _ctx: Context) => {
  let owner = false;
  try { owner = isOwner(req); } catch { /* passcode not configured yet */ }
  return r.handle(req, owner);
};

export const config: Config = { path: "/api/*" };
