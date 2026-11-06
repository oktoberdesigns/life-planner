import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PHASE_LABEL, type PortalData, type Phase } from "../../shared/types";
import { api } from "../api";
import { applyTheme, type Theme } from "../theme";
import { Thread } from "../components/thread";
import { fmtDay } from "../format";

export function PortalPage() {
  const { token } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["portal", token], queryFn: () => api<PortalData>(`/portal/${token}`), refetchInterval: 20_000, retry: false });
  const [theme, setTheme] = useState<Theme | null>(null);
  const data = q.data;

  // The client's choice is saved on their link, so it follows them across devices
  const saved = (data?.project.client_theme as Theme | null) ?? null;
  const active: Theme = theme ?? saved ?? "system";
  useEffect(() => { applyTheme(active); }, [active]);
  useEffect(() => {
    if (active !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [active]);

  async function choose(t: Theme) {
    setTheme(t);
    await api(`/portal/${token}/theme`, "POST", { theme: t });
    qc.invalidateQueries({ queryKey: ["portal", token] });
  }
  const reload = () => qc.invalidateQueries({ queryKey: ["portal", token] });

  if (q.isLoading) return <div className="splash"><div className="brand-dots big"><i className="dot green" /><i className="dot yellow" /><i className="dot red" /></div></div>;
  if (q.error || !data) return <div className="splash"><div className="login"><h1>Link not active</h1><p className="muted">This project link isn't active. Please ask for a fresh one.</p></div></div>;

  const approved = data.phases.filter((p) => p.status === "approved").length;
  const pct = data.phases.length ? Math.round((approved / data.phases.length) * 100) : 0;

  return (
    <div className="portal">
      <header className="portal-head">
        <div>
          <small className="muted">{data.owner_name}</small>
          <h1>{data.project.name}</h1>
          {data.project.client_name && <p className="muted">Hi {data.project.client_name}, here's where things stand.</p>}
        </div>
        <div className="seg-ctl small" role="radiogroup" aria-label="Theme">
          {(["light", "dark", "system"] as Theme[]).map((t) => (
            <button key={t} role="radio" aria-checked={active === t} className={active === t ? "on" : ""} onClick={() => choose(t)}>{t === "system" ? "Auto" : t[0].toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
      </header>

      <section className="card">
        <header className="card-head"><h2>Progress</h2><span className="muted small">{approved} of {data.phases.length} steps complete{data.project.due_date ? ` · due ${fmtDay(data.project.due_date)}` : ""}</span></header>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: pct + "%" }} /></div>
        <ol className="timeline">
          {data.phases.map((p) => <PhaseCard key={p.id} p={p} token={token!} onChange={reload} />)}
        </ol>
      </section>

      <section className="card">
        <header className="card-head"><h2>Messages</h2></header>
        <Thread messages={data.messages} phases={data.phases} me="client" placeholder={`Message ${data.owner_name}…`}
          onSend={async (body, phase_id) => { await api(`/portal/${token}/messages`, "POST", { body, phase_id }); reload(); }} />
      </section>

      {saved === null && theme === null && (
        <div className="overlay">
          <div className="modal">
            <div className="modal-head"><h3>How would you like this to look?</h3></div>
            <p className="muted">Pick a look for your project page. You can change it anytime from the top right.</p>
            <div className="theme-choices">
              <button className="btn" onClick={() => choose("light")}>☀️ Light</button>
              <button className="btn" onClick={() => choose("dark")}>🌙 Dark</button>
              <button className="btn" onClick={() => choose("system")}>💻 Match my device</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PhaseCard({ p, token, onChange }: { p: Phase; token: string; onChange: () => void }) {
  const [mode, setMode] = useState<"idle" | "changes">("idle");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const waiting = p.status === "awaiting_approval";

  async function act(kind: "approve" | "changes") {
    setBusy(true);
    try {
      await api(`/portal/${token}/phases/${p.id}/${kind}`, "POST", { body: text });
      setMode("idle"); setText(""); onChange();
    } finally { setBusy(false); }
  }

  return (
    <li className={"tl-item " + p.status}>
      <span className="tl-dot" />
      <div className="tl-body">
        <div className="tl-top">
          <strong>{p.name}</strong>
          <span className={"status " + p.status}>{PHASE_LABEL[p.status]}</span>
        </div>
        {p.description && <p className="muted">{p.description}</p>}
        {p.due_date && p.status !== "approved" && <small className="muted">Target: {fmtDay(p.due_date)}</small>}
        {waiting && mode === "idle" && (
          <div className="approve-row">
            <button className="btn primary" disabled={busy} onClick={() => act("approve")}>✓ Approve</button>
            <button className="btn" onClick={() => setMode("changes")}>Request changes</button>
          </div>
        )}
        {waiting && mode === "changes" && (
          <div className="form">
            <textarea rows={3} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="What would you like changed?" />
            <div className="approve-row">
              <button className="btn primary" disabled={busy || !text.trim()} onClick={() => act("changes")}>Send feedback</button>
              <button className="btn ghost" onClick={() => setMode("idle")}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
