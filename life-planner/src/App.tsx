import { useEffect, type ReactNode } from "react";
import { NavLink, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAppState, useMe, useToday, useActions } from "./api";
import { applyTheme, ownerTheme } from "./theme";
import { Login } from "./pages/Login";
import { Home } from "./pages/Home";
import { TasksPage } from "./pages/TasksPage";
import { HabitsPage } from "./pages/Habits";
import { ProjectsPage, ProjectDetail } from "./pages/Projects";
import { SettingsPage } from "./pages/Settings";
import { PortalPage } from "./pages/Portal";
import type { AppState } from "../shared/types";

const NAV = [
  { to: "/", label: "Home", emoji: "🏠", end: true },
  { to: "/personal", label: "Personal", emoji: "🌿" },
  { to: "/business", label: "Business", emoji: "💼" },
  { to: "/habits", label: "Habits", emoji: "🔥" },
  { to: "/projects", label: "Projects", emoji: "🗂️" },
];

export interface Ctx { s: AppState; today: string; actions: ReturnType<typeof useActions> }

function Shell() {
  const me = useMe();
  const state = useAppState();
  const loc = useLocation();
  const tz = state.data?.settings.timezone;
  const today = useToday(tz);
  const actions = useActions(today);

  useEffect(() => { applyTheme(ownerTheme()); }, [loc.pathname]);

  // Remember the device's timezone the first time, so reminders fire at the right hour
  useEffect(() => {
    if (!state.data) return;
    const dev = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (state.data.settings.timezone !== dev && !localStorage.getItem("lp_tz_asked") && state.data.habits.length >= 0) {
      localStorage.setItem("lp_tz_asked", "1");
      if (confirm(`Use ${dev} as your timezone for reminders and "today"?`)) actions.saveSettings({ timezone: dev });
    }
  }, [state.data?.settings.timezone]); // eslint-disable-line

  if (me.isLoading) return <Splash />;
  if (!me.data?.owner) return <Navigate to="/login" replace />;
  if (state.isLoading || !state.data) return <Splash />;
  if (state.error) return <Splash text="Couldn't load. Retrying…" />;

  const ctx: Ctx = { s: state.data, today, actions };
  const unread = state.data.projects.reduce((n, p) => n + (p.unread ?? 0), 0);

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand"><span className="brand-dots"><i className="dot green" /><i className="dot yellow" /><i className="dot red" /></span> Life Planner</div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="nav-item">
            <span>{n.emoji}</span>{n.label}
            {n.to === "/projects" && unread > 0 && <span className="badge">{unread}</span>}
          </NavLink>
        ))}
        <div className="spacer" />
        <NavLink to="/settings" className="nav-item"><span>⚙️</span>Settings</NavLink>
      </nav>
      <main className="main"><Outlet context={ctx} /></main>
      <nav className="tabbar" aria-label="Main">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="tab">
            <span>{n.emoji}</span><small>{n.label}</small>
            {n.to === "/projects" && unread > 0 && <span className="badge floating">{unread}</span>}
          </NavLink>
        ))}
        <NavLink to="/settings" className="tab"><span>⚙️</span><small>Settings</small></NavLink>
      </nav>
    </div>
  );
}

function Splash({ text }: { text?: string }): ReactNode {
  return <div className="splash"><div className="brand-dots big"><i className="dot green" /><i className="dot yellow" /><i className="dot red" /></div>{text && <p className="muted">{text}</p>}</div>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/p/:token" element={<PortalPage />} />
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="personal" element={<TasksPage area="personal" />} />
        <Route path="business" element={<TasksPage area="business" />} />
        <Route path="habits" element={<HabitsPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
