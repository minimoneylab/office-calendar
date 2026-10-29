-- =====================================================================
-- Desk Roster — migration 2
-- Run ONCE in Supabase SQL Editor, after migration 1.
-- Adds a colour per team member (e.g. 'teal', 'rose'). Empty = automatic.
-- Bank holiday names are now optional — no change needed, the column
-- already defaults to ''.
-- =====================================================================
alter table roster_members add column if not exists color text;
