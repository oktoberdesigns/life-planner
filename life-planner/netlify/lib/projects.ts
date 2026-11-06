import { query, getSettings, getKV } from "./db";
import { sendPush } from "./push";
import { sendEmail } from "./email";
import { env } from "./env";

export async function notifyOwner(title: string, body: string, projectId?: number) {
  await sendPush({ title, body, url: projectId ? `/projects/${projectId}` : "/", tag: `proj-${projectId ?? "x"}` });
  const to = env("OWNER_EMAIL");
  if (to) await sendEmail(to, title, body);
}

export async function siteUrl(req?: Request): Promise<string> {
  if (req) return new URL(req.url).origin;
  return (await getKV<string>("site_url")) ?? env("URL") ?? "";
}

export async function emailClient(projectId: number, subject: string, text: string, origin: string, buttonLabel = "Open your project") {
  const [p] = await query<{ client_email: string; token: string; portal_enabled: boolean }>(
    "select client_email, token, portal_enabled from projects where id = $1", [projectId]);
  if (!p?.client_email || !p.portal_enabled) return false;
  const s = await getSettings();
  return sendEmail(p.client_email, subject.replace("{studio}", s.portal_from_name), text, { label: buttonLabel, url: `${origin}/p/${p.token}` });
}
