create table settings (
  key text primary key,
  value jsonb not null
);

create table energy_log (
  day text primary key,
  level text not null check (level in ('green','yellow','red')),
  updated_at timestamptz not null default now()
);

create table projects (
  id serial primary key,
  name text not null,
  client_name text not null default '',
  client_email text not null default '',
  kind text not null default 'custom',
  status text not null default 'active' check (status in ('active','paused','done')),
  due_date text,
  notes text not null default '',
  token text not null unique,
  portal_enabled boolean not null default true,
  client_theme text,
  created_at timestamptz not null default now()
);

create table phases (
  id serial primary key,
  project_id int not null references projects(id) on delete cascade,
  name text not null,
  description text not null default '',
  position int not null default 0,
  status text not null default 'upcoming'
    check (status in ('upcoming','in_progress','awaiting_approval','changes_requested','approved')),
  due_date text,
  needs_approval boolean not null default true,
  created_at timestamptz not null default now()
);

create table tasks (
  id serial primary key,
  title text not null,
  notes text not null default '',
  area text not null default 'business' check (area in ('personal','business')),
  level text not null default 'yellow' check (level in ('green','yellow','red')),
  effort int not null default 30,
  level_source text not null default 'rule' check (level_source in ('ai','rule','user')),
  due_date text,
  hard_deadline boolean not null default false,
  status text not null default 'todo' check (status in ('todo','done')),
  done_at timestamptz,
  pulled_on text,
  recurrence text check (recurrence in ('daily','weekly','monthly')),
  project_id int references projects(id) on delete set null,
  phase_id int references phases(id) on delete set null,
  created_at timestamptz not null default now()
);

create table task_corrections (
  id serial primary key,
  title text not null,
  ai_level text not null,
  user_level text not null,
  created_at timestamptz not null default now()
);

create table habits (
  id serial primary key,
  name text not null,
  emoji text not null default '',
  category text not null default 'daily' check (category in ('daily','self_care')),
  days int[] not null default '{0,1,2,3,4,5,6}',
  archived boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table habit_logs (
  habit_id int not null references habits(id) on delete cascade,
  day text not null,
  status text not null check (status in ('done','rest')),
  primary key (habit_id, day)
);

create table appointments (
  id serial primary key,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text not null default '',
  notes text not null default '',
  remind_minutes int not null default 30,
  created_at timestamptz not null default now()
);

create table bills (
  id serial primary key,
  name text not null,
  next_due text not null,
  recurrence text not null default 'monthly' check (recurrence in ('once','weekly','monthly','yearly')),
  remind_days int not null default 3,
  last_paid_on text,
  created_at timestamptz not null default now()
);

create table reminders (
  id serial primary key,
  title text not null,
  remind_at timestamptz not null,
  fired_at timestamptz,
  created_at timestamptz not null default now()
);

create table goals (
  id serial primary key,
  area text not null,
  title text not null,
  done boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table messages (
  id serial primary key,
  project_id int not null references projects(id) on delete cascade,
  phase_id int references phases(id) on delete set null,
  sender text not null check (sender in ('owner','client')),
  kind text not null default 'message' check (kind in ('message','approval','changes')),
  body text not null,
  created_at timestamptz not null default now(),
  read_by_owner boolean not null default false,
  read_by_client boolean not null default false
);

create table push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  label text not null default '',
  created_at timestamptz not null default now()
);

create table notification_log (
  key text primary key,
  sent_at timestamptz not null default now()
);

create table login_attempts (
  id serial primary key,
  ip text not null,
  at timestamptz not null default now()
);

create index on tasks (status, due_date);
create index on messages (project_id, created_at);
create index on phases (project_id, position);
