import { useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import type { Ctx } from "../App";
import { LEVEL_LABEL, type Level } from "../../shared/types";
import { DEFAULT_CAPS, planTasks } from "../../shared/energy";
import { Card } from "../components/ui";
import { AddTask, DeadlineBanner, PlanList, TaskModal } from "../components/tasks";
import { CalendarWidget, Checklist, ClockWidget, EnergyPicker, GoalsWidget, NavTiles, ProjectsStrip, QuoteWidget, SpotifyWidget, UpcomingWidget } from "../components/widgets";
import { useState } from "react";
import type { Task } from "../../shared/types";

function greeting(tz: string) {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const SUBTITLE: Record<Level, string> = {
  green: "Big energy. Go for the stretch stuff.",
  yellow: "A steady day. The usual is plenty.",
  red: "Gentle day. Only the essentials, and that's enough.",
};

export function Home() {
  const { s, today, actions } = useOutletContext<Ctx>();
  const checked = s.energy[today] ?? null;
  const energy: Level = checked ?? "yellow";
  const [editing, setEditing] = useState<Task | null>(null);
  const plan = useMemo(() => planTasks(s.tasks, energy, today, { ...DEFAULT_CAPS, ...s.settings.caps }), [s.tasks, energy, today, s.settings.caps]);
  const doneToday = s.tasks.filter((t) => t.status === "done" && t.done_at && new Date(t.done_at).toDateString() === new Date().toDateString()).length;

  return (
    <div className="home">
      {/* ===== TOP: same every day ===== */}
      <header className="home-head">
        <div>
          <h1>{greeting(s.settings.timezone)}, {s.settings.name}</h1>
          <p className="muted">{checked ? SUBTITLE[checked] : "How's your energy today? One tap and the rest of the page adjusts."}</p>
        </div>
        <EnergyPicker value={checked} onPick={(l) => actions.setEnergy(l)} />
      </header>

      <div className="top-grid">
        <div className="col"><CalendarWidget s={s} today={today} /></div>
        <div className="col">
          <NavTiles s={s} today={today} />
          <QuoteWidget quotes={s.settings.quotes} today={today} />
        </div>
        <div className="col">
          <ClockWidget tz={s.settings.timezone} />
          <SpotifyWidget url={s.settings.spotify_url} />
        </div>
      </div>

      {/* ===== BOTTOM: changes with your energy ===== */}
      <div className={"today-bar lv-" + energy}>
        <span><i className={"dot " + energy} /> <strong>{LEVEL_LABEL[energy]}</strong>{!checked && <span className="muted"> (not checked in yet, showing a steady day)</span>}</span>
        <span className="muted small">{doneToday > 0 ? `${doneToday} done today` : ""}</span>
      </div>

      {energy === "red" && (
        <div className="bottom red">
          <DeadlineBanner tasks={plan.deadlines} today={today} />
          <Checklist s={s} today={today} energy="red" actions={actions} selfCareOnly />
          <Card title="Bare minimum">
            <AddTask actions={actions} />
            <PlanList plan={plan} energy="red" today={today} actions={actions} onEdit={setEditing} projects={s.projects} />
          </Card>
          <UpcomingWidget s={s} today={today} onlyToday />
        </div>
      )}

      {energy === "yellow" && (
        <div className="bottom">
          <DeadlineBanner tasks={plan.deadlines} today={today} />
          <div className="two">
            <Card title="Today's focus"><AddTask actions={actions} />
              <PlanList plan={plan} energy="yellow" today={today} actions={actions} onEdit={setEditing} projects={s.projects} />
            </Card>
            <div className="col">
              <Checklist s={s} today={today} energy="yellow" actions={actions} />
              <UpcomingWidget s={s} today={today} />
            </div>
          </div>
          <ProjectsStrip projects={s.projects} phases={s.phases} compact />
        </div>
      )}

      {energy === "green" && (
        <div className="bottom">
          <DeadlineBanner tasks={plan.deadlines} today={today} />
          <div className="two">
            <Card title="Go big today"><AddTask actions={actions} />
              <PlanList plan={plan} energy="green" today={today} actions={actions} onEdit={setEditing} projects={s.projects} />
            </Card>
            <div className="col">
              <Checklist s={s} today={today} energy="green" actions={actions} />
              <UpcomingWidget s={s} today={today} days={10} />
            </div>
          </div>
          <ProjectsStrip projects={s.projects} phases={s.phases} />
          <GoalsWidget s={s} actions={actions} />
        </div>
      )}

      {editing && <TaskModal task={editing} onClose={() => setEditing(null)} actions={actions} projects={s.projects} />}
    </div>
  );
}
