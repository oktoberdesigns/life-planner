import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { LEVEL_LABEL, PHASE_LABEL, type AppState, type Level, type Phase, type Project } from "../../shared/types";
import { addDays, diffDays, weekday } from "../../shared/dates";
import { computeStreak, logMap } from "../../shared/streaks";
import { useNow, type Actions } from "../api";
import { Card, Empty } from "./ui";
import { dayOfIso, fmtDay, fmtTime, spotifyEmbed, whenLabel } from "../format";

/* ---------- Energy check-in ---------- */
export function EnergyPicker({ value, onPick }: { value: Level | null; onPick: (l: Level) => void }) {
  const opts: { l: Level; emoji: string; hint: string }[] = [
    { l: "green", emoji: "🟢", hint: "Above & beyond" },
    { l: "yellow", emoji: "🟡", hint: "Steady" },
    { l: "red", emoji: "🔴", hint: "Gentle day" },
  ];
  return (
    <div className="energy" role="radiogroup" aria-label="Today's energy">
      {opts.map((o) => (
        <button key={o.l} role="radio" aria-checked={value === o.l} className={"energy-opt lv-" + o.l + (value === o.l ? " on" : "")} onClick={() => onPick(o.l)}>
          <span className="energy-emoji">{o.emoji}</span>
          <span>{o.hint}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Clock ---------- */
export function ClockWidget({ tz }: { tz: string }) {
  const now = useNow(5_000);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(now);
  const h = parts.find((p) => p.type === "hour")!.value.padStart(2, "0");
  const m = parts.find((p) => p.type === "minute")!.value;
  const ap = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
  const date = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(now);
  return (
    <div className="card clock" aria-label="Clock">
      <div className="clock-digits"><span>{h}</span><span>{m}</span></div>
      <div className="clock-meta"><span>{date}</span><span>{ap}</span></div>
    </div>
  );
}

/* ---------- Quote ---------- */
export function QuoteWidget({ quotes, today }: { quotes: string[]; today: string }) {
  if (!quotes.length) return null;
  const n = [...today].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <figure className="card quote">
      <blockquote>“{quotes[n % quotes.length]}”</blockquote>
    </figure>
  );
}

/* ---------- Spotify ---------- */
export function SpotifyWidget({ url }: { url: string }) {
  const src = url ? spotifyEmbed(url) : null;
  if (!src) return <div className="card spotify-empty"><span>🎧</span><p>Paste a Spotify playlist link in Settings to play it here.</p></div>;
  return (
    <div className="card spotify">
      <iframe title="Spotify" src={src} width="100%" height="152" frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" />
    </div>
  );
}

/* ---------- Navigation tiles ---------- */
export function NavTiles({ s, today }: { s: AppState; today: string }) {
  const open = s.tasks.filter((t) => t.status === "todo");
  const tiles = [
    { to: "/personal", emoji: "🌿", label: "Personal", sub: `${open.filter((t) => t.area === "personal").length} tasks` },
    { to: "/business", emoji: "💼", label: "Business", sub: `${open.filter((t) => t.area === "business").length} tasks` },
    { to: "/habits", emoji: "🔥", label: "Habits", sub: `${s.habits.length} tracked` },
    { to: "/projects", emoji: "🗂️", label: "Projects", sub: `${s.projects.filter((p) => p.status === "active").length} active` },
  ];
  void today;
  return (
    <div className="tiles">
      {tiles.map((t) => (
        <Link key={t.to} to={t.to} className="tile">
          <span className="tile-emoji">{t.emoji}</span>
          <strong>{t.label}</strong>
          <small>{t.sub}</small>
        </Link>
      ))}
    </div>
  );
}

/* ---------- Calendar ---------- */
export function CalendarWidget({ s, today }: { s: AppState; today: string }) {
  const [cursor, setCursor] = useState(today.slice(0, 7)); // YYYY-MM
  const [sel, setSel] = useState(today);
  const tz = s.settings.timezone;

  const marks = useMemo(() => {
    const m = new Map<string, { a: number; b: number; t: number }>();
    const bump = (d: string, k: "a" | "b" | "t") => m.set(d, { a: 0, b: 0, t: 0, ...m.get(d), [k]: (m.get(d)?.[k] ?? 0) + 1 });
    s.appointments.forEach((a) => bump(dayOfIso(a.starts_at, tz), "a"));
    s.bills.forEach((b) => bump(b.next_due, "b"));
    s.tasks.forEach((t) => t.status === "todo" && t.due_date && bump(t.due_date, "t"));
    return m;
  }, [s, tz]);

  const first = `${cursor}-01`;
  const lead = weekday(first);
  const daysInMonth = new Date(Date.UTC(Number(cursor.slice(0, 4)), Number(cursor.slice(5, 7)), 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${cursor}-${String(i + 1).padStart(2, "0")}`)];
  const shift = (n: number) => {
    const d = new Date(Date.UTC(Number(cursor.slice(0, 4)), Number(cursor.slice(5, 7)) - 1 + n, 1));
    setCursor(d.toISOString().slice(0, 7));
  };

  const dayAppts = s.appointments.filter((a) => dayOfIso(a.starts_at, tz) === sel);
  const dayBills = s.bills.filter((b) => b.next_due === sel);
  const dayTasks = s.tasks.filter((t) => t.status === "todo" && t.due_date === sel);

  return (
    <Card className="cal" title={fmtDay(first, { month: "long", year: "numeric" })} right={
      <span className="cal-nav">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
        <button className="icon-btn" onClick={() => { setCursor(today.slice(0, 7)); setSel(today); }} aria-label="Today">•</button>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="Next month">›</button>
      </span>
    }>
      <div className="cal-grid">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={i} className="cal-dow">{d}</span>)}
        {cells.map((d, i) => d === null ? <span key={i} /> : (
          <button key={d} className={"cal-day" + (d === today ? " today" : "") + (d === sel ? " sel" : "")} onClick={() => setSel(d)}>
            {Number(d.slice(8))}
            <span className="cal-dots">
              {marks.get(d)?.a ? <i className="dot a" /> : null}
              {marks.get(d)?.b ? <i className="dot b" /> : null}
              {marks.get(d)?.t ? <i className="dot t" /> : null}
            </span>
          </button>
        ))}
      </div>
      <div className="cal-sel">
        <strong>{whenLabel(sel, today) === fmtDay(sel) ? fmtDay(sel) : `${whenLabel(sel, today)} · ${fmtDay(sel)}`}</strong>
        {!dayAppts.length && !dayBills.length && !dayTasks.length && <p className="muted small">Nothing scheduled.</p>}
        {dayAppts.map((a) => <p key={a.id} className="small"><i className="dot a" /> {fmtTime(a.starts_at, tz)} · {a.title}</p>)}
        {dayBills.map((b) => <p key={b.id} className="small"><i className="dot b" /> Bill: {b.name}</p>)}
        {dayTasks.map((t) => <p key={t.id} className="small"><i className="dot t" /> Due: {t.title}</p>)}
      </div>
      <div className="cal-legend small muted"><i className="dot a" /> appointment <i className="dot b" /> bill <i className="dot t" /> task due</div>
    </Card>
  );
}

/* ---------- Daily checklist (self-care + habits) ---------- */
export function Checklist({ s, today, energy, actions, selfCareOnly }: {
  s: AppState; today: string; energy: Level; actions: Actions; selfCareOnly?: boolean;
}) {
  const dow = weekday(today);
  const todays = s.habits.filter((h) => h.days.includes(dow));
  const selfCare = todays.filter((h) => h.category === "self_care");
  const daily = todays.filter((h) => h.category === "daily");
  const status = (id: number) => s.habit_logs.find((l) => l.habit_id === id && l.day === today)?.status;

  const Row = ({ id }: { id: number }) => {
    const h = s.habits.find((x) => x.id === id)!;
    const st = status(id);
    const streak = computeStreak(h, logMap(s.habit_logs, id), s.energy, today);
    return (
      <li className={"check" + (st === "done" ? " done" : "")}>
        <input type="checkbox" checked={st === "done"} aria-label={h.name} onChange={() => actions.logHabit(id, today, st === "done" ? null : "done")} />
        <span className="check-name">{h.emoji} {h.name}</span>
        {streak > 0 && <span className="streak" title="Current streak">🔥 {streak}</span>}
      </li>
    );
  };

  return (
    <Card title={energy === "red" ? "Take care of you" : "Today's checklist"}>
      {selfCare.length > 0 && (
        <>
          {!selfCareOnly && daily.length > 0 && <h4 className="sub">Self-care</h4>}
          <ul className="checks">{selfCare.map((h) => <Row key={h.id} id={h.id} />)}</ul>
        </>
      )}
      {!selfCareOnly && daily.length > 0 && (
        <>
          <h4 className="sub">Habits</h4>
          <ul className="checks">{daily.map((h) => <Row key={h.id} id={h.id} />)}</ul>
        </>
      )}
      {selfCareOnly && daily.length > 0 && (
        <p className="muted small">🔥 {daily.length} habit{daily.length === 1 ? "" : "s"} resting today. Your streaks are safe.</p>
      )}
      {todays.length === 0 && <Empty>No habits yet. Add some on the Habits page.</Empty>}
    </Card>
  );
}

/* ---------- Upcoming ---------- */
export function UpcomingWidget({ s, today, days = 7, onlyToday }: { s: AppState; today: string; days?: number; onlyToday?: boolean }) {
  const tz = s.settings.timezone;
  const limit = onlyToday ? 0 : days;
  type Item = { key: string; day: string; when: string; label: string; kind: "a" | "b" | "r" };
  const items: Item[] = [
    ...s.appointments.map((a) => ({ key: "a" + a.id, day: dayOfIso(a.starts_at, tz), when: fmtTime(a.starts_at, tz), label: a.title + (a.location ? ` · ${a.location}` : ""), kind: "a" as const })),
    ...s.bills.map((b) => ({ key: "b" + b.id, day: b.next_due, when: "Bill", label: b.name, kind: "b" as const })),
    ...s.reminders.map((r) => ({ key: "r" + r.id, day: dayOfIso(r.remind_at, tz), when: fmtTime(r.remind_at, tz), label: r.title, kind: "r" as const })),
  ]
    .filter((i) => diffDays(i.day, today) <= limit && (i.kind === "b" ? diffDays(i.day, today) <= Math.max(limit, 0) : diffDays(i.day, today) >= 0))
    .sort((x, y) => x.day.localeCompare(y.day) || x.when.localeCompare(y.when));
  return (
    <Card title={onlyToday ? "Today's appointments" : "Coming up"} right={<Link className="link-btn" to="/personal">Manage</Link>}>
      {items.length === 0 ? <Empty>{onlyToday ? "Nothing scheduled today." : "Nothing in the next week."}</Empty> : (
        <ul className="upcoming">
          {items.map((i) => (
            <li key={i.key}>
              <i className={"dot " + i.kind} />
              <span className="up-label">{i.label}</span>
              <span className="muted small">{onlyToday ? i.when : `${whenLabel(i.day, today)} · ${i.when}`}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------- Projects strip ---------- */
export function PhaseBar({ phases }: { phases: Phase[] }) {
  return (
    <div className="phase-bar" aria-hidden>
      {phases.map((p) => <i key={p.id} className={"seg " + p.status} title={`${p.name}: ${PHASE_LABEL[p.status]}`} />)}
    </div>
  );
}
export function currentPhase(phases: Phase[]): Phase | undefined {
  return phases.find((p) => p.status !== "approved" && p.status !== "upcoming") ?? phases.find((p) => p.status === "upcoming");
}

export function ProjectsStrip({ projects, phases, compact }: { projects: Project[]; phases: Phase[]; compact?: boolean }) {
  const active = projects.filter((p) => p.status === "active");
  return (
    <Card title="Projects" right={<Link className="link-btn" to="/projects">All projects</Link>}>
      {active.length === 0 ? <Empty>No active projects.</Empty> : (
        <div className={"proj-grid" + (compact ? " compact" : "")}>
          {active.map((p) => {
            const ph = phases.filter((x) => x.project_id === p.id);
            const cur = currentPhase(ph);
            return (
              <Link key={p.id} to={`/projects/${p.id}`} className="proj-card">
                <div className="proj-top"><strong>{p.name}</strong>{!!p.unread && <span className="badge">{p.unread}</span>}</div>
                <small className="muted">{p.client_name || "No client name"}</small>
                <PhaseBar phases={ph} />
                <small>{cur ? `${cur.name} · ${PHASE_LABEL[cur.status]}` : "No phases"}</small>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ---------- Goals ---------- */
export function GoalsWidget({ s, actions }: { s: AppState; actions: Actions }) {
  const [adding, setAdding] = useState<string | null>(null);
  const [text, setText] = useState("");
  async function add(e: FormEvent, area: string) {
    e.preventDefault();
    if (!text.trim()) return;
    await actions.create("goals", { area, title: text.trim() });
    setText(""); setAdding(null);
  }
  return (
    <Card title="Goals">
      <div className="goal-cols">
        {s.settings.goal_areas.map((area) => {
          const goals = s.goals.filter((g) => g.area === area);
          return (
            <div key={area} className="goal-col">
              <h4 className="sub">{area}</h4>
              <ul className="checks">
                {goals.map((g) => (
                  <li key={g.id} className={"check" + (g.done ? " done" : "")}>
                    <input type="checkbox" checked={g.done} aria-label={g.title} onChange={() => actions.update("goals", g.id, { done: !g.done })} />
                    <span className="check-name">{g.title}</span>
                    <button className="icon-btn faint" aria-label="Remove goal" onClick={() => actions.remove("goals", g.id)}>✕</button>
                  </li>
                ))}
              </ul>
              {adding === area
                ? <form onSubmit={(e) => add(e, area)}><input autoFocus value={text} onChange={(e) => setText(e.target.value)} onBlur={() => !text && setAdding(null)} placeholder="New goal" /></form>
                : <button className="link-btn" onClick={() => { setAdding(area); setText(""); }}>+ Add goal</button>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export { LEVEL_LABEL, addDays };
