import { env } from "./env";
import { query } from "./db";
import type { Area, Level } from "../../shared/types";

export interface Leveled {
  level: Level;
  effort: number;
  area: Area;
  due_date: string | null;
  source: "ai" | "rule";
}

const GREEN = /\b(design|build|write|draft|launch|pitch|proposal|record|brand|website|strategy|present|plan|research|create|edit|film|shoot|develop|code|audit|concept)\b/i;
const RED = /\b(water|eat|meal|shower|meds|medication|vitamin|rest|nap|walk|stretch|tidy|text back|pay|reply|reminder|sign|download|order|refill|breathe|journal)\b/i;
const PERSONAL = /\b(dentist|doctor|groceries|laundry|clean|mom|dad|gym|pharmacy|therapy|haircut|vet|birthday|home|dinner)\b/i;

export function ruleLevel(title: string): Omit<Leveled, "due_date" | "source"> {
  const level: Level = RED.test(title) && !GREEN.test(title) ? "red" : GREEN.test(title) ? "green" : "yellow";
  const effort = level === "red" ? 5 : level === "green" ? 60 : 30;
  const area: Area = PERSONAL.test(title) ? "personal" : "business";
  return { level, effort, area };
}

export function aiEnabled() {
  return !!env("ANTHROPIC_API_KEY");
}

const EFFORTS = [5, 15, 30, 60, 120, 240];

export async function levelTask(
  title: string, notes: string, today: string, hint?: { area?: Area },
): Promise<Leveled> {
  const rules = ruleLevel(title);
  const fallback: Leveled = { ...rules, area: hint?.area ?? rules.area, due_date: null, source: "rule" };
  if (!aiEnabled()) return fallback;

  try {
    const corrections = await query<{ title: string; ai_level: string; user_level: string }>(
      "select title, ai_level, user_level from task_corrections order by id desc limit 25",
    );
    const examples = corrections.length
      ? "\n\nThe user has corrected you before. Learn from these (task → the level they chose):\n" +
        corrections.map((c) => `- "${c.title}" → ${c.user_level} (you said ${c.ai_level})`).join("\n")
      : "";

    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 200,
      system:
        "You sort tasks for a solo creative business owner who plans her day by energy colour. " +
        "level = the MINIMUM energy a task needs: " +
        "red = bare minimum or self-care, tiny, no decisions, no social pressure (about 15 min or less); " +
        "yellow = ordinary work for an average day; " +
        "green = demanding, creative, high-stakes, long or socially heavy work that needs peak energy. " +
        "effort = minutes, one of 5, 15, 30, 60, 120, 240. " +
        "area = business or personal. " +
        "due_date = YYYY-MM-DD only if the text clearly implies a date (e.g. tomorrow, Friday), otherwise null. " +
        `Today is ${today}. Reply with ONLY compact JSON: {"level":"","effort":0,"area":"","due_date":null}.` + examples,
      messages: [{ role: "user", content: `Task: ${title}${notes ? `\nNotes: ${notes}` : ""}` }],
    });
    const text = msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const level: Level = ["green", "yellow", "red"].includes(json.level) ? json.level : fallback.level;
    const effort = EFFORTS.includes(json.effort) ? json.effort : fallback.effort;
    const area: Area = hint?.area ?? (json.area === "personal" ? "personal" : "business");
    const due = typeof json.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(json.due_date) ? json.due_date : null;
    return { level, effort, area, due_date: due, source: "ai" };
  } catch (e) {
    console.error("AI leveling failed, using rules:", e);
    return fallback;
  }
}
