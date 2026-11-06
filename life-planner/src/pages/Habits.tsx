import { useState, type FormEvent } from "react";
import { useOutletContext } from "react-router-dom";
import type { Ctx } from "../App";
import type { Habit } from "../../shared/types";
import { addDays, weekday } from "../../shared/dates";
import { computeStreak, habitStart, logMap } from "../../shared/streaks";
import { Card, Empty, Field, Modal } from "../components/ui";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

export function HabitsPage() {
  const { s, today, actions } = useOutletContext<Ctx>();
  const [edit, setEdit] = useState<Partial<Habit> | null>(null);

  const section = (category: Habit["category"], title: string) => {
    const hs = s.habits.filter((h) => h.category === category);
    return (
      <Card title={title} right={<button className="btn small" onClick={() => setEdit({ name: "", emoji: "", category, days: [0, 1, 2, 3, 4, 5, 6] })}>+ Add</button>}>
        {hs.length === 0 ? <Empty>Nothing here yet.</Empty> : (
          <ul className="habits">
            {hs.map((h) => {
              const logs = logMap(s.habit_logs, h.id);
              const streak = computeStreak(h, logs, s.energy, today);
              const st = logs.get(today);
              const scheduled = h.days.includes(weekday(today));
              const strip = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
              return (
                <li key={h.id} className="habit">
                  <div className="habit-top">
                    <input type="checkbox" checked={st === "done"} disabled={!scheduled} aria-label={h.name}
                      onChange={() => actions.logHabit(h.id, today, st === "done" ? null : "done")} />
                    <button className="habit-name" onClick={() => setEdit(h)}>{h.emoji} {h.name}</button>
                    <span className="streak" title="Current streak">🔥 {streak}</span>
                    {scheduled && st !== "done" && (
                      <button className="btn ghost small" onClick={() => actions.logHabit(h.id, today, st === "rest" ? null : "rest")}>{st === "rest" ? "Resting ✓" : "Rest"}</button>
                    )}
                  </div>
                  <div className="strip" aria-label="Last 14 days">
                    {strip.map((d) => {
                      const sched = h.days.includes(weekday(d));
                      const v = logs.get(d);
                      const red = s.energy[d] === "red";
                      const cls = !sched || (d < habitStart(h) && !v) ? "off" : v === "done" ? "done" : v === "rest" || (red && !v) ? "rest" : d === today ? "today" : "miss";
                      return <i key={d} className={"sq " + cls} title={d} />;
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    );
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!edit?.name) return;
    const body = { name: edit.name, emoji: edit.emoji ?? "", category: edit.category, days: edit.days };
    await (edit.id ? actions.update("habits", edit.id, body) : actions.create("habits", body));
    setEdit(null);
  }

  return (
    <div className="page">
      <h1>🔥 Habits</h1>
      <p className="muted">Red days and "Rest" never break a streak.</p>
      {section("self_care", "Self-care")}
      {section("daily", "Habits")}
      {edit && (
        <Modal title={edit.id ? "Edit habit" : "New habit"} onClose={() => setEdit(null)}>
          <form className="form" onSubmit={save}>
            <div className="row">
              <Field label="Emoji"><input className="narrow" maxLength={4} value={edit.emoji ?? ""} onChange={(e) => setEdit({ ...edit, emoji: e.target.value })} /></Field>
              <Field label="Name"><input required autoFocus value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            </div>
            <Field label="Type">
              <select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value as Habit["category"] })}>
                <option value="self_care">Self-care (shown on every day, including red days)</option>
                <option value="daily">Habit (rests automatically on red days)</option>
              </select>
            </Field>
            <Field label="Days">
              <div className="days">
                {DOW.map((d, i) => (
                  <button type="button" key={i} className={"day-btn" + (edit.days?.includes(i) ? " on" : "")}
                    onClick={() => setEdit({ ...edit, days: edit.days?.includes(i) ? edit.days.filter((x) => x !== i) : [...(edit.days ?? []), i].sort() })}>{d}</button>
                ))}
              </div>
            </Field>
            <div className="modal-foot">
              {edit.id && <button type="button" className="btn danger ghost" onClick={async () => { await actions.update("habits", edit.id!, { archived: true }); setEdit(null); }}>Archive</button>}
              <span className="spacer" />
              <button type="button" className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn primary">Save</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
