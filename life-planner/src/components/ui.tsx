import { useEffect, type ReactNode } from "react";
import { LEVEL_LABEL, type Level } from "../../shared/types";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"modal" + (wide ? " wide" : "")} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Card({ title, right, children, className = "" }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={"card " + className}>
      {(title || right) && (
        <header className="card-head">
          <h2>{title}</h2>
          <div>{right}</div>
        </header>
      )}
      {children}
    </section>
  );
}

export function LevelChip({ level, onClick, title }: { level: Level; onClick?: () => void; title?: string }) {
  const content = <><i className={"dot " + level} />{level === "green" ? "Stretch" : level === "yellow" ? "Steady" : "Minimum"}</>;
  return onClick
    ? <button type="button" className={"chip lv-" + level + " clickable"} onClick={onClick} title={title ?? "Change level"}>{content}</button>
    : <span className={"chip lv-" + level}>{content}</span>;
}

export const EnergyDot = ({ level }: { level: Level }) => <i className={"dot " + level} aria-label={LEVEL_LABEL[level]} />;

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
