import { env } from "./env";

export function emailEnabled() {
  return !!env("RESEND_API_KEY") && !!env("EMAIL_FROM");
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function sendEmail(to: string, subject: string, text: string, button?: { label: string; url: string }) {
  if (!emailEnabled() || !to) return false;
  const html =
    `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:480px;margin:auto;color:#37352f;line-height:1.5">` +
    `<p>${esc(text).replace(/\n/g, "<br>")}</p>` +
    (button ? `<p><a href="${esc(button.url)}" style="display:inline-block;background:#37352f;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${esc(button.label)}</a></p>` : "") +
    `</div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("EMAIL_FROM"), to, subject, text: button ? `${text}\n\n${button.url}` : text, html }),
  });
  if (!res.ok) console.error("email failed", res.status, await res.text());
  return res.ok;
}
