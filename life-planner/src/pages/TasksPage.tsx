import { useMemo, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router-dom";
import type { Ctx } from "../App";
import type { Appointment, Area, Bill, Level, Task } from "../../shared/types";
import { DEFAULT_CAPS, planTasks } from "../../shared/energy";
import { Card, Empty, Field, Modal } from "../components/ui";
import { AddTask, DeadlineBanner, PlanList, TaskModal, TaskRow } from "../components/tasks";
import { ProjectsStrip } from "../components/widgets";
import { dayOfIso, fmtTime, isoToLocalInput, localInputToIso, relDay, whenLabel } from "../format";

export function TasksPage({ area }: { area: Area }) {
  const { s, today, actions } = useOutletContext<Ctx>();
  const energy: Level = s.energy[today] ?? "yellow";
  const [editing, setEditing] = useState<Task | null>(null);
  const [showAll, setShowAll] = useState(false);
  const tasks = useMemo(() => s.tasks.filter((t) => t.area === area), [s.tasks, area]);
  const plan = useMemo(() => planTasks(tasks, energy, today, { ...DEFAULT_CAPS, ...s.settings.caps }), [tasks, energy, today, s.settings.caps]);
  const done = tasks.filter((t) => t.status === "done");
  const open = tasks.filter((t) => t.status === "todo");

  return (
    <div className="page">
      <h1>{area === "personal" ? "🌿 Personal" : "💼 Business"}</h1>
      <DeadlineBanner tasks={plan.deadlines} today={today} />

      <Card title="Tasks" right={
        <button className="link-btn" onClick={() => setShowAll(!showAll)}>{showAll ? "Back to today's view" : "Show everything"}</button>
      }>
        <AddTask actions={actions} area={area} />
        {showAll
          ? (open.length ? <ul className="tasks">{open.map((t) => <TaskRow key={t.id} task={t} today={today} actions={actions} onEdit={setEditing} projects={s.projects} />)}</ul> : <Empty>No open tasks.</Empty>)
          : <PlanList plan={plan} energy={energy} today={today} actions={actions} onEdit={setEditing} projects={s.projects} />}
        {done.length > 0 && (
          <>
            <h4 className="sub">Done recently</h4>
            <ul className="tasks">{done.map((t) => <TaskRow key={t.id} task={t} today={today} actions={actions} onEdit={setEditing} projects={s.projects} />)}</ul>
          </>
        )}
      </Card>

      {area === "business" && <ProjectsStrip projects={s.projects} phases={s.phases} />}
      {area === "personal" && <PersonalExtras />}
      {editing && <TaskModal task={editing} onClose={() => setEditing(null)} actions={actions} projects={s.projects} />}
    </div>
  );
}

function PersonalExtras() {
  const { s, today, actions } = useOutletContext<Ctx>();
  const tz = s.settings.timezone;
  const [appt, setAppt] = useState<Partial<Appointment> | null>(null);
  const [bill, setBill] = useState<Partial<Bill> | null>(null);
  const [rem, setRem] = useState<{ title: string; at: string } | null>(null);
  const upcoming = s.appointments.filter((a) => dayOfIso(a.starts_at, tz) >= today);

  return (
    <>
      <Card title="Appointments" right={<button className="btn small" onClick={() => setAppt({ title: "", remind_minutes: 30, starts_at: new Date().toISOString() })}>+ Add</button>}>
        {upcoming.length === 0 ? <Empty>No upcoming appointments.</Empty> : (
          <ul className="list">
            {upcoming.map((a) => (
              <li key={a.id}>
                <button className="list-main" onClick={() => setAppt(a)}>
                  <strong>{a.title}</strong>
                  <span className="muted small">{whenLabel(dayOfIso(a.starts_at, tz), today)} · {fmtTime(a.starts_at, tz)}{a.location ? ` · ${a.location}` : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Bills due" right={<button className="btn small" onClick={() => setBill({ name: "", next_due: today, recurrence: "monthly", remind_days: 3 })}>+ Add</button>}>
        {s.bills.length === 0 ? <Empty>No bills tracked.</Empty> : (
          <ul className="list">
            {s.bills.map((b) => (
              <li key={b.id}>
                <button className="list-main" onClick={() => setBill(b)}>
                  <strong>{b.name}</strong>
                  <span className="muted small">{whenLabel(b.next_due, today)} · {b.recurrence}</span>
                </button>
                <button className="btn ghost small" onClick={() => actions.post(`/bills/${b.id}/paid`)}>Paid ✓</button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Reminders" right={<button className="btn small" onClick={() => setRem({ title: "", at: isoToLocalInput(new Date(Date.now() + 3600e3).toISOString(), tz) })}>+ Add</button>}>
        {s.reminders.length === 0 ? <Empty>No reminders set.</Empty> : (
          <ul className="list">
            {s.reminders.map((r) => (
              <li key={r.id}>
                <span className="list-main static"><strong>{r.title}</strong><span className="muted small">{whenLabel(dayOfIso(r.remind_at, tz), today)} · {fmtTime(r.remind_at, tz)}</span></span>
                <button className="icon-btn" aria-label="Delete reminder" onClick={() => actions.remove("reminders", r.id)}>✕</button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {appt && (
        <Modal title={appt.id ? "Appointment" : "New appointment"} onClose={() => setAppt(null)}>
          <form className="form" onSubmit={async (e: FormEvent) => {
            e.preventDefault();
            const body = { title: appt.title, starts_at: appt.starts_at, location: appt.location ?? "", notes: appt.notes ?? "", remind_minutes: appt.remind_minutes ?? 30 };
            await (appt.id ? actions.update("appointments", appt.id, body) : actions.create("appointments", body));
            setAppt(null);
          }}>
            <Field label="What"><input required autoFocus value={appt.title ?? ""} onChange={(e) => setAppt({ ...appt, title: e.target.value })} /></Field>
            <div className="row">
              <Field label="When"><input type="datetime-local" required value={appt.starts_at ? isoToLocalInput(appt.starts_at, tz) : ""} onChange={(e) => e.target.value && setAppt({ ...appt, starts_at: localInputToIso(e.target.value, tz) })} /></Field>
              <Field label="Remind me">
                <select value={appt.remind_minutes ?? 30} onChange={(e) => setAppt({ ...appt, remind_minutes: Number(e.target.value) })}>
                  {[[10, "10 min before"], [30, "30 min before"], [60, "1 hour before"], [120, "2 hours before"], [1440, "1 day before"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Where"><input value={appt.location ?? ""} onChange={(e) => setAppt({ ...appt, location: e.target.value })} /></Field>
            <div className="modal-foot">
              {appt.id && <button type="button" className="btn danger ghost" onClick={async () => { await actions.remove("appointments", appt.id!); setAppt(null); }}>Delete</button>}
              <span className="spacer" />
              <button type="button" className="btn ghost" onClick={() => setAppt(null)}>Cancel</button>
              <button className="btn primary">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {bill && (
        <Modal title={bill.id ? "Bill" : "New bill"} onClose={() => setBill(null)}>
          <form className="form" onSubmit={async (e: FormEvent) => {
            e.preventDefault();
            const body = { name: bill.name, next_due: bill.next_due, recurrence: bill.recurrence, remind_days: bill.remind_days };
            await (bill.id ? actions.update("bills", bill.id, body) : actions.create("bills", body));
            setBill(null);
          }}>
            <Field label="Bill"><input required autoFocus value={bill.name ?? ""} onChange={(e) => setBill({ ...bill, name: e.target.value })} /></Field>
            <div className="row">
              <Field label="Next due"><input type="date" required value={bill.next_due ?? ""} onChange={(e) => setBill({ ...bill, next_due: e.target.value })} /></Field>
              <Field label="Repeats">
                <select value={bill.recurrence} onChange={(e) => setBill({ ...bill, recurrence: e.target.value as Bill["recurrence"] })}>
                  <option value="once">Once</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>
                </select>
              </Field>
              <Field label="Remind">
                <select value={bill.remind_days} onChange={(e) => setBill({ ...bill, remind_days: Number(e.target.value) })}>
                  {[0, 1, 3, 5, 7].map((d) => <option key={d} value={d}>{d === 0 ? "On the day" : `${d} day${d === 1 ? "" : "s"} before`}</option>)}
                </select>
              </Field>
            </div>
            <div className="modal-foot">
              {bill.id && <button type="button" className="btn danger ghost" onClick={async () => { await actions.remove("bills", bill.id!); setBill(null); }}>Delete</button>}
              <span className="spacer" />
              <button type="button" className="btn ghost" onClick={() => setBill(null)}>Cancel</button>
              <button className="btn primary">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {rem && (
        <Modal title="New reminder" onClose={() => setRem(null)}>
          <form className="form" onSubmit={async (e: FormEvent) => {
            e.preventDefault();
            await actions.create("reminders", { title: rem.title, remind_at: localInputToIso(rem.at, tz) });
            setRem(null);
          }}>
            <Field label="Remind me to"><input required autoFocus value={rem.title} onChange={(e) => setRem({ ...rem, title: e.target.value })} /></Field>
            <Field label="When"><input type="datetime-local" required value={rem.at} onChange={(e) => setRem({ ...rem, at: e.target.value })} /></Field>
            <div className="modal-foot"><span className="spacer" /><button type="button" className="btn ghost" onClick={() => setRem(null)}>Cancel</button><button className="btn primary">Save</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
