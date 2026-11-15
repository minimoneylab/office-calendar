-- =====================================================================
-- Desk Roster — migration 7: notes on calendar days
-- Run ONCE in Supabase SQL Editor. Safe to run again.
-- e.g. "Compliance training 3:00pm", "Meeting customer and HH"
-- Holiday colours / whole-day shading need no migration: they are saved
-- in roster_settings (keys holiday_colors, holiday_shade).
-- =====================================================================
create table if not exists roster_notes (
  id          bigint generated always as identity primary key,
  date        date not null,
  text        text not null check (length(trim(text)) > 0 and length(text) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists roster_notes_date_idx on roster_notes (date);

alter table roster_notes enable row level security;
drop policy if exists roster_notes_all on roster_notes;
create policy roster_notes_all on roster_notes for all to anon, authenticated using (true) with check (true);
