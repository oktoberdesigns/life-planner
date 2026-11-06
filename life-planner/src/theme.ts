export type Theme = "dark" | "light" | "system";

export function applyTheme(t: Theme) {
  const eff = t === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : t;
  document.documentElement.dataset.theme = eff;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", eff === "dark" ? "#191919" : "#ffffff");
}
export function ownerTheme(): Theme {
  try { return (localStorage.getItem("lp_theme") as Theme) || "dark"; } catch { return "dark"; }
}
export function setOwnerTheme(t: Theme) {
  try { localStorage.setItem("lp_theme", t); } catch { /* private mode */ }
  applyTheme(t);
}
