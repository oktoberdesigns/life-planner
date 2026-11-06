import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import type { Ctx } from "../App";
import { api } from "../api";
import { LEVELS, type Level } from "../../shared/types";
import { Card, Field } from "../components/ui";
import { ownerTheme, setOwnerTheme, type Theme } from "../theme";
import { deviceLabel, disablePush, enablePush, pushStatus } from "../push";

export function SettingsPage() {
  const { s, actions } = useOutletContext<Ctx>();
  const st = s.settings;
  const nav = useNavigate();
  const [f, setF] = useState({
    name: st.name, timezone: st.timezone, check_in_time: st.check_in_time, spotify_url: st.spotify_url,
    quotes: st.quotes.join("\n"), goal_areas: st.goal_areas.join(", "), portal_from_name: st.portal_from_name, caps: st.caps,
  });
  const [saved, setSaved] = useState(false);
  const [theme, setTheme] = useState<Theme>(ownerTheme());
  const [push, setPush] = useState<Awaited<ReturnType<typeof pushStatus>> | "loading">("loading");
  const [pushMsg, setPushMsg] = useState("");
  const swReady = import.meta.env.PROD;

  useEffect(() => { if (swReady) pushStatus().then(setPush); else setPush("unsupported"); }, [swReady]);

  async function save() {
    await actions.saveSettings({
      ...f,
      quotes: f.quotes.split("\n").map((x) => x.trim()).filter(Boolean),
      goal_areas: f.goal_areas.split(",").map((x) => x.trim()).filter(Boolean),
    });
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  }
  async function togglePush() {
    setPushMsg("");
    try {
      if (push === "on") await disablePush(); else await enablePush(deviceLabel());
      setPush(await pushStatus()); actions.refresh();
    } catch (e: any) { setPushMsg(e.message); }
  }

  return (
    <div className="page narrow">
      <h1>⚙️ Settings</h1>

      <Card title="Appearance">
        <div className="seg-ctl" role="radiogroup" aria-label="Theme">
          {(["dark", "light", "system"] as Theme[]).map((t) => (
            <button key={t} role="radio" aria-checked={theme === t} className={theme === t ? "on" : ""} onClick={() => { setTheme(t); setOwnerTheme(t); }}>
              {t === "dark" ? "Dark" : t === "light" ? "Light" : "Match device"}
            </button>
          ))}
        </div>
        <p className="muted small">Saved on this device. Your clients choose their own the first time they open their portal.</p>
      </Card>

      <Card title="Notifications">
        {push === "unsupported" && <p className="muted small">Push notifications work in the installed app. On iPhone/iPad: Share → Add to Home Screen first, then come back here.</p>}
        {push === "denied" && <p className="muted small">Notifications are blocked for this site. Allow them in your browser settings, then reload.</p>}
        {(push === "on" || push === "off") && (
          <div className="row">
            <button className="btn" onClick={togglePush}>{push === "on" ? "Turn off on this device" : "Turn on for this device"}</button>
            {push === "on" && <button className="btn ghost" onClick={() => api("/push/test", "POST", {}).then(() => setPushMsg("Sent. Check your devices."))}>Send a test</button>}
          </div>
        )}
        {pushMsg && <p className="small">{pushMsg}</p>}
        <p className="muted small">{s.integrations.push} device{s.integrations.push === 1 ? "" : "s"} registered. Enable it on each device you want reminders on.</p>
      </Card>

      <Card title="You">
        <div className="form">
          <div className="row">
            <Field label="Your name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Studio name (shown to clients)"><input value={f.portal_from_name} onChange={(e) => setF({ ...f, portal_from_name: e.target.value })} /></Field>
          </div>
          <div className="row">
            <Field label="Timezone">
              <input list="tzs" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} />
              <datalist id="tzs">{(Intl as any).supportedValuesOf?.("timeZone").map((z: string) => <option key={z} value={z} />)}</datalist>
            </Field>
            <Field label="Morning check-in time"><input type="time" value={f.check_in_time} onChange={(e) => setF({ ...f, check_in_time: e.target.value })} /></Field>
          </div>
          <Field label="Spotify playlist link"><input value={f.spotify_url} onChange={(e) => setF({ ...f, spotify_url: e.target.value })} placeholder="https://open.spotify.com/playlist/…" /></Field>
        </div>
      </Card>

      <Card title="Daily task limits">
        <p className="muted small">The most tasks your focus list shows on each kind of day (deadlines can exceed this).</p>
        <div className="row">
          {([...LEVELS].reverse() as Level[]).map((l) => (
            <Field key={l} label={l === "red" ? "🔴 Gentle" : l === "yellow" ? "🟡 Steady" : "🟢 Above & beyond"}>
              <input type="number" min={1} max={30} value={f.caps[l]} onChange={(e) => setF({ ...f, caps: { ...f.caps, [l]: Number(e.target.value) } })} />
            </Field>
          ))}
        </div>
      </Card>

      <Card title="Quotes & goals">
        <div className="form">
          <Field label="Quotes (one per line, one shows each day)"><textarea rows={5} value={f.quotes} onChange={(e) => setF({ ...f, quotes: e.target.value })} /></Field>
          <Field label="Goal areas (comma separated)"><input value={f.goal_areas} onChange={(e) => setF({ ...f, goal_areas: e.target.value })} /></Field>
        </div>
      </Card>

      <div className="save-bar"><button className="btn primary" onClick={save}>{saved ? "Saved ✓" : "Save settings"}</button></div>

      <Card title="Connections">
        <ul className="list">
          <li><span className="list-main static"><strong>AI task sorting</strong><span className="muted small">{s.integrations.ai ? "On. New tasks are sorted by Claude, and it learns from your corrections." : "Off, using simple rules. Add ANTHROPIC_API_KEY in Netlify to turn it on."}</span></span><span className={"chip " + (s.integrations.ai ? "lv-green" : "")}>{s.integrations.ai ? "On" : "Off"}</span></li>
          <li><span className="list-main static"><strong>Email to clients</strong><span className="muted small">{s.integrations.email ? "On. Portal links and message alerts get emailed." : "Off. Add RESEND_API_KEY and EMAIL_FROM in Netlify. Until then, copy portal links manually."}</span></span><span className={"chip " + (s.integrations.email ? "lv-green" : "")}>{s.integrations.email ? "On" : "Off"}</span></li>
        </ul>
      </Card>

      <button className="btn ghost" onClick={async () => { await api("/auth/logout", "POST", {}); nav("/login"); location.reload(); }}>Sign out</button>
    </div>
  );
}
