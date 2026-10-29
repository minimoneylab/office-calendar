-- =====================================================================
-- Desk Roster — migration 1
-- Run ONCE in Supabase SQL Editor (same project as FitLog).
-- All tables are prefixed "roster_" so nothing clashes with FitLog.
-- =====================================================================

-- 1) Team members --------------------------------------------------------
create table if not exists roster_members (
  id          bigint generated always as identity primary key,
  full_name   text    not null,
  short_name  text    not null,          -- what shows on the calendar / TRMNL
  active      boolean not null default true,
  sort_order  int     not null default 0,
  created_at  timestamptz not null default now()
);

-- 2) Leave / biz trip entries (one row per person per weekday) ----------
create table if not exists roster_entries (
  id          bigint generated always as identity primary key,
  member_id   bigint not null references roster_members(id) on delete cascade,
  date        date   not null,
  code        text   not null check (code in ('L', 'Biz', 'AM', 'PM')),
  created_at  timestamptz not null default now(),
  unique (member_id, date)
);
create index if not exists roster_entries_date_idx on roster_entries (date);

-- 3) Bank holidays (entered manually on the website) --------------------
create table if not exists roster_holidays (
  id          bigint generated always as identity primary key,
  date        date not null,
  country     text not null,              -- HK TW KR JP PH IN ID VN MY US UK BR
  name        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (date, country)
);
create index if not exists roster_holidays_date_idx on roster_holidays (date);

-- 4) Settings (e.g. which countries show on the calendar / TRMNL) ------
create table if not exists roster_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- 5) Row Level Security: open read/write for the publishable key --------
--    Same approach as FitLog (no login, small trusted team).
--    "for all" covers SELECT, INSERT, UPDATE and DELETE in one policy,
--    so edits won't silently fail like the FitLog UPDATE issue did.
alter table roster_members  enable row level security;
alter table roster_entries  enable row level security;
alter table roster_holidays enable row level security;
alter table roster_settings enable row level security;

drop policy if exists roster_members_all  on roster_members;
drop policy if exists roster_entries_all  on roster_entries;
drop policy if exists roster_holidays_all on roster_holidays;
drop policy if exists roster_settings_all on roster_settings;

create policy roster_members_all  on roster_members  for all to anon, authenticated using (true) with check (true);
create policy roster_entries_all  on roster_entries  for all to anon, authenticated using (true) with check (true);
create policy roster_holidays_all on roster_holidays for all to anon, authenticated using (true) with check (true);
create policy roster_settings_all on roster_settings for all to anon, authenticated using (true) with check (true);

-- 6) Default setting: show all 12 countries -----------------------------
insert into roster_settings (key, value)
values ('visible_countries', '["HK","TW","KR","JP","PH","IN","ID","VN","MY","US","UK","BR"]'::jsonb)
on conflict (key) do nothing;
