import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { Ctx } from "../App";
import { PHASE_LABEL, PROJECT_PRESETS, type Message, type Phase, type PhaseStatus, type Project } from "../../shared/types";
import { api, type Actions } from "../api";
import { Card, Empty, Field, Modal, Toggle } from "../components/ui";
import { PhaseBar, currentPhase } from "../components/widgets";
import { Thread } from "../components/thread";
import { AddTask, TaskModal, TaskRow } from "../components/tasks";
import { fmtDay } from "../format";
import type { Task } from "../../shared/types";

export function ProjectsPage() {
  const { s, actions } = useOutletContext<Ctx>();
  const nav = useNavigate();
  const [form, setForm] = useState<{ name: string; client_name: string; client_email: string; kind: string; due_date: string } | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    const p = await actions.create("projects", form);
    setForm(null);
    nav(`/projects/${p.id}`);
  }
  const groups: [string, Project[]][] = [
    ["Active", s.projects.filter((p) => p.status === "active")],
    ["Paused", s.projects.filter((p) => p.status === "paused")],
    ["Done", s.projects.filter((p) => p.status === "done")],
  ];
  return (
    <div className="page">
      <div className="page-head">
        <h1>🗂️ Projects</h1>
        <button className="btn primary" onClick={() => setForm({ name: "", client_name: "", client_email: "", kind: "branding", due_date: "" })}>+ New project</button>
      </div>
      {s.projects.length === 0 && <Card><Empty>No projects yet. Create one to get a private client portal.</Empty></Card>}
      {groups.map(([label, ps]) => ps.length > 0 && (
        <Card key={label} title={label}>
          <div className="proj-grid">
            {ps.map((p) => {
              const ph = s.phases.filter((x) => x.project_id === p.id);
              const cur = currentPhase(ph);
              return (
                <Link key={p.id} to={`/projects/${p.id}`} className="proj-card">
                  <div className="proj-top"><strong>{p.name}</strong>{!!p.unread && <span className="badge">{p.unread}</span>}</div>
                  <small className="muted">{p.client_name || "No client name"}{p.due_date ? ` · due ${fmtDay(p.due_date)}` : ""}</small>
                  <PhaseBar phases={ph} />
                  <small>{cur ? `${cur.name} · ${PHASE_LABEL[cur.status]}` : "No phases"}</small>
                </Link>
              );
            })}
          </div>
        </Card>
      ))}
      {form && (
        <Modal title="New project" onClose={() => setForm(null)}>
          <form className="form" onSubmit={create}>
            <Field label="Project name"><input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Maya's Bakery brand" /></Field>
            <div className="row">
              <Field label="Client name"><input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /></Field>
              <Field label="Client email"><input type="email" value={form.client_email} onChange={(e) => setForm({ ...form, client_email: e.target.value })} /></Field>
            </div>
            <div className="row">
              <Field label="Phases from template">
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  {Object.entries(PROJECT_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}: {v.phases.join(" → ")}</option>)}
                </select>
              </Field>
              <Field label="Due"><input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
            </div>
            <div className="modal-foot"><span className="spacer" /><button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancel</button><button className="btn primary">Create</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function ProjectDetail() {
  const { id } = useParams();
  const pid = Number(id);
  const { s, today, actions } = useOutletContext<Ctx>();
  const project = s.projects.find((p) => p.id === pid);
  const phases = s.phases.filter((p) => p.project_id === pid);
  const nav = useNavigate();
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [info, setInfo] = useState("");

  const messages = useQuery({ queryKey: ["messages", pid], queryFn: () => api<Message[]>(`/projects/${pid}/messages`), refetchInterval: 15_000 });
  useEffect(() => {
    if (project?.unread) api(`/projects/${pid}/messages/read`, "POST", {}).then(() => actions.refresh());
  }, [pid, project?.unread, messages.data?.length]); // eslint-disable-line

  if (!project) return s.projects.length ? <Navigate to="/projects" replace /> : null;
  const link = `${location.origin}/p/${project.token}`;
  const tasks = s.tasks.filter((t) => t.project_id === pid);

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { prompt("Copy this link", link); }
  }
  async function sendLink() {
    const r = await api<{ sent: boolean }>(`/projects/${pid}/send-link`, "POST", {});
    setInfo(r.sent ? `Sent to ${project!.client_email}` : "Email isn't set up (or no client email), so copy the link instead.");
    setTimeout(() => setInfo(""), 4000);
  }

  return (
    <div className="page">
      <Link to="/projects" className="link-btn">‹ Projects</Link>
      <div className="page-head">
        <input className="title-input" defaultValue={project.name} key={project.name} aria-label="Project name"
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          onBlur={(e) => e.target.value.trim() && e.target.value !== project.name && actions.update("projects", pid, { name: e.target.value.trim() })} />
        <select value={project.status} onChange={(e) => actions.update("projects", pid, { status: e.target.value })} aria-label="Project status">
          <option value="active">Active</option><option value="paused">Paused</option><option value="done">Done</option>
        </select>
      </div>
      <div className="row meta-row">
        <Field label="Client"><input defaultValue={project.client_name} key={"c" + project.client_name} onBlur={(e) => e.target.value !== project.client_name && actions.update("projects", pid, { client_name: e.target.value })} /></Field>
        <Field label="Client email"><input type="email" defaultValue={project.client_email} key={"e" + project.client_email} onBlur={(e) => e.target.value !== project.client_email && actions.update("projects", pid, { client_email: e.target.value })} /></Field>
        <Field label="Due"><input type="date" value={project.due_date ?? ""} onChange={(e) => actions.update("projects", pid, { due_date: e.target.value })} /></Field>
      </div>

      <Card title="Client portal" right={<Toggle on={project.portal_enabled} onChange={(v) => actions.update("projects", pid, { portal_enabled: v })} label="On" />}>
        <p className="muted small">Your client opens this private link (no password). They can follow progress, message you, and approve each step.</p>
        <div className="link-row">
          <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Portal link" />
          <button className="btn" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
          <button className="btn" onClick={sendLink} disabled={!project.client_email}>Email it</button>
          <a className="btn ghost" href={link} target="_blank" rel="noreferrer">Preview ↗</a>
        </div>
        {info && <p className="small">{info}</p>}
        <button className="link-btn danger-text" onClick={() => confirm("Make a new link? The old one will stop working.") && actions.post(`/projects/${pid}/rotate-token`)}>Make a new link</button>
      </Card>

      <Card title="Phases" right={<PhaseBar phases={phases} />}>
        <PhaseEditor phases={phases} pid={pid} actions={actions} />
      </Card>

      <div className="two">
        <Card title="Messages">
          <Thread messages={messages.data ?? []} phases={phases} me="owner" placeholder="Message your client…"
            onSend={async (body, phase_id) => { await api(`/projects/${pid}/messages`, "POST", { body, phase_id }); await messages.refetch(); }} />
        </Card>
        <div className="col">
          <Card title="Project tasks">
            <AddTask actions={actions} area="business" projectId={pid} placeholder="Add a task for this project…" />
            {tasks.length === 0 ? <Empty>No tasks yet.</Empty> : <ul className="tasks">{tasks.map((t) => <TaskRow key={t.id} task={t} today={today} actions={actions} onEdit={setEditTask} />)}</ul>}
          </Card>
          <Card title="Private notes">
            <textarea rows={5} placeholder="Only you can see this" value={notes ?? project.notes}
              onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== null && notes !== project.notes && actions.update("projects", pid, { notes })} />
          </Card>
        </div>
      </div>

      <button className="btn danger ghost" onClick={async () => { if (confirm(`Delete "${project.name}" and its messages?`)) { await actions.remove("projects", pid); nav("/projects"); } }}>Delete project</button>
      {editTask && <TaskModal task={editTask} onClose={() => setEditTask(null)} actions={actions} projects={s.projects} />}
    </div>
  );
}

function PhaseEditor({ phases, pid, actions }: { phases: Phase[]; pid: number; actions: Actions }) {
  const [name, setName] = useState("");
  async function move(i: number, dir: -1 | 1) {
    const a = phases[i], b = phases[i + dir];
    if (!b) return;
    await Promise.all([actions.update("phases", a.id, { position: b.position }), actions.update("phases", b.id, { position: a.position })]);
  }
  return (
    <div>
      <ul className="phases">
        {phases.map((p, i) => (
          <li key={p.id} className={"phase-row " + p.status}>
            <div className="phase-top">
              <span className="phase-num">{i + 1}</span>
              <input className="phase-name" defaultValue={p.name} key={p.name} onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && actions.update("phases", p.id, { name: e.target.value.trim() })} />
              <select value={p.status} onChange={(e) => actions.update("phases", p.id, { status: e.target.value as PhaseStatus })} aria-label="Phase status">
                {Object.entries(PHASE_LABEL).map(([k, v]) => <option key={k} value={k}>{k === "awaiting_approval" ? "Awaiting client approval (emails them)" : v}</option>)}
              </select>
              <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
              <button className="icon-btn" disabled={i === phases.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
              <button className="icon-btn" onClick={() => confirm(`Delete "${p.name}"?`) && actions.remove("phases", p.id)} aria-label="Delete phase">✕</button>
            </div>
            <div className="phase-details">
              <textarea rows={2} placeholder="What your client sees for this step (optional)" defaultValue={p.description} key={p.description}
                onBlur={(e) => e.target.value !== p.description && actions.update("phases", p.id, { description: e.target.value })} />
              <input type="date" value={p.due_date ?? ""} onChange={(e) => actions.update("phases", p.id, { due_date: e.target.value })} aria-label="Phase due date" />
            </div>
          </li>
        ))}
      </ul>
      <form className="add-row" onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; await actions.post(`/projects/${pid}/phases`, { name: name.trim() }); setName(""); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a phase" />
        <button className="btn" disabled={!name.trim()}>Add</button>
      </form>
    </div>
  );
}
