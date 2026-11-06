import { useState, type FormEvent } from "react";
import { LEVELS, LEVEL_RANK, type Level, type Task, type Area, type Project } from "../../shared/types";
import { diffDays } from "../../shared/dates";
import { isBreakthrough, type Plan } from "../../shared/energy";
import type { Actions } from "../api";
import { LevelChip, Modal, Field, Toggle, Empty } from "./ui";
import { effortLabel, relDay } from "../format";

const nextLevel = (l: Level): Level => LEVELS[(LEVELS.indexOf(l) + 1) % 3]; // green → yellow → red → green

export function AddTask({ actions, area, projectId, placeholder }: { actions: Actions; area?: Area; projectId?: number; placeholder?: string }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    try { await actions.addTask({ title: t, area, project_id: projectId ?? null }); setTitle(""); }
    finally { setBusy(false); }
  }
  return (
    <form className="add-row" onSubmit={submit}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={placeholder ?? "Add a task… (it sorts itself)"} aria-label="New task" />
      <button className="btn" disabled={!title.trim() || busy}>{busy ? "Sorting…" : "Add"}</button>
    </form>
  );
}

export function TaskRow({ task, today, actions, onEdit, locked, projects }: {
  task: Task; today: string; actions: Actions; onEdit: (t: Task) => void; locked?: boolean; projects?: Project[];
}) {
  const done = task.status === "done";
  const urgent = !done && isBreakthrough(task, today);
  const project = projects?.find((p) => p.id === task.project_id);
  return (
    <li className={"task" + (done ? " done" : "")}>
      <input type="checkbox" checked={done} aria-label={`Complete ${task.title}`}
        onChange={() => actions.patchTask(task.id, { status: done ? "todo" : "done" })} />
      <button className="task-main" onClick={() => onEdit(task)}>
        <span className="task-title">{task.title}</span>
        <span className="task-meta">
          {project && <span className="meta-pill">{project.name}</span>}
          {task.due_date && <span className={"due" + (urgent ? " urgent" : "")}>{relDay(task.due_date, today)}</span>}
          {task.hard_deadline && !done && <span className="meta-pill hard">Hard deadline</span>}
          {task.recurrence && <span className="meta-pill">↻ {task.recurrence}</span>}
          <span className="effort">{effortLabel(task.effort)}</span>
        </span>
      </button>
      {locked
        ? <button className="btn ghost small" onClick={() => actions.pullTask(task.id)} title="Bring this into today">Pull in</button>
        : <LevelChip level={task.level} onClick={() => actions.patchTask(task.id, { level: nextLevel(task.level) })}
            title={task.level_source === "user" ? "Change level (set by you)" : `Change level (sorted by ${task.level_source === "ai" ? "AI" : "rules"})`} />}
    </li>
  );
}

/** Today's list with the soft lock: focus, over-cap, and hidden-for-today. */
export function PlanList({ plan, energy, today, actions, onEdit, projects, emptyText }: {
  plan: Plan; energy: Level; today: string; actions: Actions; onEdit: (t: Task) => void; projects?: Project[]; emptyText?: string;
}) {
  const [showLater, setShowLater] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  return (
    <div>
      {plan.focus.length === 0
        ? <Empty>{emptyText ?? (energy === "red" ? "Nothing needed today. Rest counts." : "Nothing on the list. Add something above.")}</Empty>
        : <ul className="tasks">{plan.focus.map((t) => <TaskRow key={t.id} task={t} today={today} actions={actions} onEdit={onEdit} projects={projects} />)}</ul>}

      {plan.later.length > 0 && (
        <>
          <button className="link-btn" onClick={() => setShowLater(!showLater)}>
            {showLater ? "▾" : "▸"} {plan.later.length} more that fit your energy, saved for another day
          </button>
          {showLater && <ul className="tasks">{plan.later.map((t) => <TaskRow key={t.id} task={t} today={today} actions={actions} onEdit={onEdit} projects={projects} />)}</ul>}
        </>
      )}

      {plan.hidden.length > 0 && (
        <>
          <button className="link-btn" onClick={() => setShowHidden(!showHidden)}>
            {showHidden ? "▾" : "▸"} {plan.hidden.length} hidden for today, waiting for more energy
          </button>
          {showHidden && (
            <ul className="tasks locked">
              {plan.hidden.map((t) => <TaskRow key={t.id} task={t} today={today} actions={actions} onEdit={onEdit} locked projects={projects} />)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export function DeadlineBanner({ tasks, today }: { tasks: Task[]; today: string }) {
  if (!tasks.length) return null;
  const overdue = tasks.filter((t) => diffDays(t.due_date!, today) < 0).length;
  return (
    <div className="banner warn" role="status">
      <strong>{tasks.length} deadline{tasks.length === 1 ? "" : "s"} on your radar</strong>
      {overdue > 0 && <span> · {overdue} overdue</span>}
      <span className="muted"> · always shown, whatever your energy</span>
    </div>
  );
}

export function TaskModal({ task, onClose, actions, projects }: {
  task: Task; onClose: () => void; actions: Actions; projects: Project[];
}) {
  const [f, setF] = useState({ ...task });
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    await actions.patchTask(task.id, {
      title: f.title.trim() || task.title, notes: f.notes, area: f.area, level: f.level, effort: f.effort,
      due_date: f.due_date || null, hard_deadline: f.hard_deadline, recurrence: f.recurrence || null,
      project_id: f.project_id || null,
    });
    onClose();
  }
  return (
    <Modal title="Task" onClose={onClose}>
      <div className="form">
        <Field label="Title"><input value={f.title} onChange={(e) => set("title", e.target.value)} autoFocus /></Field>
        <Field label="Notes"><textarea rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
        <div className="row">
          <Field label="Area">
            <select value={f.area} onChange={(e) => set("area", e.target.value as Area)}>
              <option value="business">Business</option><option value="personal">Personal</option>
            </select>
          </Field>
          <Field label="Energy needed">
            <select value={f.level} onChange={(e) => set("level", e.target.value as Level)}>
              {[...LEVELS].sort((a, b) => LEVEL_RANK[a] - LEVEL_RANK[b]).map((l) => <option key={l} value={l}>{l === "red" ? "Red · bare minimum" : l === "yellow" ? "Yellow · steady" : "Green · stretch"}</option>)}
            </select>
          </Field>
          <Field label="Effort">
            <select value={f.effort} onChange={(e) => set("effort", Number(e.target.value))}>
              {[5, 15, 30, 60, 120, 240].map((m) => <option key={m} value={m}>{effortLabel(m)}</option>)}
            </select>
          </Field>
        </div>
        <div className="row">
          <Field label="Due"><input type="date" value={f.due_date ?? ""} onChange={(e) => set("due_date", e.target.value || null)} /></Field>
          <Field label="Repeats">
            <select value={f.recurrence ?? ""} onChange={(e) => set("recurrence", (e.target.value || null) as Task["recurrence"])}>
              <option value="">Never</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
            </select>
          </Field>
          <Field label="Project">
            <select value={f.project_id ?? ""} onChange={(e) => set("project_id", e.target.value ? Number(e.target.value) : null)}>
              <option value="">None</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        </div>
        <Toggle on={f.hard_deadline} onChange={(v) => set("hard_deadline", v)} label="Hard deadline (breaks through the energy lock 3 days early)" />
        <div className="modal-foot">
          <button className="btn danger ghost" onClick={async () => { await actions.deleteTask(task.id); onClose(); }}>Delete</button>
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save</button>
        </div>
      </div>
    </Modal>
  );
}
