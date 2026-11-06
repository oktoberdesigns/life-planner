# Life Planner

Energy-aware life + business planner. One web app (PWA) that installs on phone, tablet and desktop, with private client portals.

## Deploy (about 10 minutes)

1. Push this folder to a GitHub repo.
2. Netlify → **Add new project → Import from Git** → pick the repo. Build settings are already in `netlify.toml`.
3. In **Project configuration → Environment variables**, add:
   | Name | Required | What it does |
   |---|---|---|
   | `OWNER_PASSCODE` | yes | Your sign-in passcode |
   | `ANTHROPIC_API_KEY` | no | Turns on AI task sorting (falls back to simple rules without it) |
   | `RESEND_API_KEY`, `EMAIL_FROM` | no | Emails portal links and message alerts to clients |
   | `OWNER_EMAIL` | no | Emails you when a client messages or approves (push works without it) |
4. Deploy. Netlify creates the database and tables automatically.
5. Open the site, sign in, then **Settings → Turn on notifications** on each device. On iPhone/iPad: Share → Add to Home Screen first.

## Run locally

```bash
npm install
npx netlify database migrations apply     # first time only
OWNER_PASSCODE=test npm run dev
```

## How it works

- **Energy:** a one-tap green/yellow/red check-in. Each task has the minimum energy it needs. Higher-energy tasks are hidden (soft lock, "Pull in" to override). Deadlines always break through; hard deadlines break through 3 days early.
- **Task sorting:** new tasks are leveled by Claude (or simple rules). Changing a level teaches it.
- **Streaks:** red days and "Rest" never break a streak.
- **Client portals:** one private link per project. No password. Clients see phases, message you, approve or request changes, and pick light/dark on first open.
- **Reminders:** a scheduled function runs every 5 minutes (appointments, bills, reminders, morning check-in, deadline digest).

## Layout

- `src/` React app · `shared/` logic used by both sides (energy lock, streaks) · `netlify/functions/` API + reminder job · `netlify/database/migrations/` schema
