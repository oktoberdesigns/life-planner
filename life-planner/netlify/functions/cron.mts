import type { Config } from "@netlify/functions";
import { runReminders } from "../lib/reminders";

// Every 5 minutes (UTC). Sends appointment, bill, reminder and check-in pushes.
export default async () => {
  const sent = await runReminders();
  console.log("reminders sent:", sent);
};

export const config: Config = { schedule: "*/5 * * * *" };
