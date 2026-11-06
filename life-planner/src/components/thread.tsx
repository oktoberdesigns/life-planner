import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Message, Phase } from "../../shared/types";

export function Thread({ messages, phases, me, onSend, placeholder }: {
  messages: Message[]; phases: Phase[]; me: "owner" | "client"; onSend: (body: string, phaseId: number | null) => Promise<void>; placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try { await onSend(text.trim(), phase === "" ? null : phase); setText(""); } finally { setBusy(false); }
  }

  return (
    <div className="thread">
      <div className="thread-body">
        {messages.length === 0 && <p className="empty">No messages yet.</p>}
        {messages.map((m) => {
          const ph = phases.find((p) => p.id === m.phase_id);
          const mine = m.sender === me;
          return (
            <div key={m.id} className={"msg " + (mine ? "mine" : "theirs") + (m.kind !== "message" ? " " + m.kind : "")}>
              {m.kind === "approval" && <small className="msg-tag ok">✓ Approved{ph ? ` · ${ph.name}` : ""}</small>}
              {m.kind === "changes" && <small className="msg-tag warn">↺ Changes requested{ph ? ` · ${ph.name}` : ""}</small>}
              {m.kind === "message" && ph && <small className="msg-tag">{ph.name}</small>}
              <p>{m.body}</p>
              <small className="muted">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(m.created_at))}</small>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <form className="composer" onSubmit={submit}>
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder ?? "Write a message…"}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e as any); }} />
        <div className="composer-row">
          <select value={phase} onChange={(e) => setPhase(e.target.value ? Number(e.target.value) : "")} aria-label="About which step">
            <option value="">General</option>
            {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn primary" disabled={!text.trim() || busy}>Send</button>
        </div>
      </form>
    </div>
  );
}
