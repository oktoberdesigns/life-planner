import pg from "pg";
import type { Settings } from "../../shared/types";
import { DEFAULT_CAPS } from "../../shared/energy";
import { env } from "./env";

let pool: pg.Pool | null = null;
function getPool(): pg.Pool {
  if (!pool) {
    const url = env("DATABASE_URL");
    if (!url) throw new Error("DATABASE_URL is not set. Add your Neon connection string in Netlify environment variables.");
    pool = new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000 });
  }
  return pool;
}

/** Run a parameterized query and return rows. */
export async function query<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await getPool().query(text, params as any[]);
  return res.rows as T[];
}

export const DEFAULT_SETTINGS: Settings = {
  name: "Rachel",
  timezone: "America/New_York",
  check_in_time: "09:00",
  spotify_url: "",
  quotes: [
    "Small steps still count.",
    "Rest is productive.",
    "Done is better than perfect.",
    "You don't have to do it all today.",
    "Be as kind to yourself as you are to your clients.",
  ],
  goal_areas: ["Business", "Health", "Creative"],
  caps: DEFAULT_CAPS,
  portal_from_name: "Oktober Designs",
};

export async function getSettings(): Promise<Settings> {
  const rows = await query<{ key: string; value: unknown }>("select key, value from settings where key = 'app'");
  return { ...DEFAULT_SETTINGS, ...((rows[0]?.value as Partial<Settings>) ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await query(
    "insert into settings (key, value) values ('app', $1::jsonb) on conflict (key) do update set value = excluded.value",
    [JSON.stringify(next)],
  );
  return next;
}

export async function getKV<T>(key: string): Promise<T | null> {
  const rows = await query<{ value: T }>("select value from settings where key = $1", [key]);
  return rows[0]?.value ?? null;
}
export async function setKV(key: string, value: unknown) {
  await query(
    "insert into settings (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value",
    [key, JSON.stringify(value)],
  );
}

const SELF_CARE = [
  ["💧", "Drink water"],
  ["🍽️", "Eat something real"],
  ["💊", "Meds / vitamins"],
  ["🚿", "Wash up / get dressed"],
  ["🌤️", "Step outside or open a window"],
];

/** First run: default self-care list so red days aren't empty. */
export async function ensureSeed() {
  const seeded = await getKV<boolean>("seeded");
  if (seeded) return;
  await setKV("seeded", true);
  const existing = await query("select 1 from habits limit 1");
  if (existing.length) return;
  for (let i = 0; i < SELF_CARE.length; i++) {
    await query("insert into habits (name, emoji, category, position) values ($1, $2, 'self_care', $3)", [SELF_CARE[i][1], SELF_CARE[i][0], i]);
  }
}
