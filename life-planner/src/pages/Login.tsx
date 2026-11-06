import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, useMe } from "../api";
import { applyTheme, ownerTheme } from "../theme";
import { useEffect } from "react";

export function Login() {
  const me = useMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { applyTheme(ownerTheme()); }, []);

  if (me.data?.owner) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await api("/auth/login", "POST", { passcode: code });
      await qc.invalidateQueries({ queryKey: ["me"] });
      nav("/", { replace: true });
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }

  return (
    <div className="splash">
      <form className="login" onSubmit={submit}>
        <div className="brand-dots big"><i className="dot green" /><i className="dot yellow" /><i className="dot red" /></div>
        <h1>Life Planner</h1>
        {me.data && !me.data.configured ? (
          <p className="banner warn">Almost there: add an <code>OWNER_PASSCODE</code> environment variable in Netlify (Project configuration → Environment variables), then redeploy.</p>
        ) : (
          <>
            <input type="password" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="Passcode" autoComplete="current-password" aria-label="Passcode" />
            {err && <p className="error">{err}</p>}
            <button className="btn primary" disabled={!code || busy}>{busy ? "…" : "Enter"}</button>
          </>
        )}
      </form>
    </div>
  );
}
