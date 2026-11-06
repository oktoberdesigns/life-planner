import { createHmac, createHash, timingSafeEqual, randomBytes } from "node:crypto";
import { env } from "./env";
import { query } from "./db";

const COOKIE = "lp_session";
const MAX_AGE = 60 * 60 * 24 * 90;

function secret(): string {
  const p = env("OWNER_PASSCODE");
  if (!p) throw new HttpError(500, "OWNER_PASSCODE is not set. Add it in Netlify → Project configuration → Environment variables.");
  return createHash("sha256").update("lp-session:" + p).digest("hex");
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function makeSessionCookie(secure: boolean): string {
  const exp = Date.now() + MAX_AGE * 1000;
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure ? "; Secure" : ""}`;
}
export const clearSessionCookie = (secure: boolean) =>
  `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;

export function isOwner(req: Request): boolean {
  const header = req.headers.get("cookie") ?? "";
  const m = header.split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  if (!m) return false;
  const [payload, sig] = m.slice(COOKIE.length + 1).split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now();
  } catch { return false; }
}

export function checkPasscode(input: string): boolean {
  const real = env("OWNER_PASSCODE") ?? "";
  if (!real) throw new HttpError(500, "OWNER_PASSCODE is not set.");
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(real).digest();
  return timingSafeEqual(a, b);
}

/** Max 6 failed attempts per IP per 10 minutes. */
export async function checkRateLimit(ip: string) {
  const rows = await query<{ n: string }>("select count(*)::text as n from login_attempts where ip = $1 and at > now() - interval '10 minutes'", [ip]);
  if (Number(rows[0].n) >= 6) throw new HttpError(429, "Too many attempts. Try again in a few minutes.");
}
export async function recordFailure(ip: string) {
  await query("insert into login_attempts (ip) values ($1)", [ip]);
  await query("delete from login_attempts where at < now() - interval '1 day'");
}

export const newToken = () => randomBytes(24).toString("base64url");
