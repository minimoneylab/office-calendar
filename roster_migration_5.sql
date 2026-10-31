-- =====================================================================
-- Desk Roster — migration 5: Central banks
-- Run ONCE in Supabase SQL Editor, after migrations 1–4.
--   * cb_banks   : which central banks to show, their policy-rate name,
--                  and an optional manual "next meeting" date
--   * cb_events  : rate decisions kept long-term (filled daily by GitHub Action)
--   * trmnl_cb() : screen-ready JSON for the website and TRMNL
-- Safe to run again. Changes no existing data.
-- =====================================================================

create table if not exists cb_banks (
  code          text primary key,           -- FED, ECB, ...
  side          text not null check (side in ('G10', 'ASIA')),
  sort_order    int  not null default 0,
  short_name    text not null,              -- shown on screen: Fed, ECB ...
  rate_name     text not null,              -- Fed Funds, Deposit, Repo ...
  region        text not null,              -- matches econ_events.region
  event_name    text not null,              -- matches econ_events.std_name (TradingView)
  is_range      boolean not null default false,   -- Fed: show 3.75–4.00
  show          boolean not null default true,
  next_override date,                        -- manual next meeting (HK date), optional
  updated_at    timestamptz not null default now()
);

insert into cb_banks (code, side, sort_order, short_name, rate_name, region, event_name, is_range) values
  ('FED',  'G10',  1, 'Fed',  'Fed Funds',  'US', 'Fed Interest Rate Decision',  true),
  ('ECB',  'G10',  2, 'ECB',  'Deposit',    'EU', 'Deposit Facility Rate',       false),
  ('BOJ',  'G10',  3, 'BoJ',  'Policy',     'JP', 'BoJ Interest Rate Decision',  false),
  ('BOE',  'G10',  4, 'BoE',  'Bank Rate',  'UK', 'BoE Interest Rate Decision',  false),
  ('RBA',  'G10',  5, 'RBA',  'Cash Rate',  'AU', 'RBA Interest Rate Decision',  false),
  ('BOC',  'G10',  6, 'BoC',  'Overnight',  'CA', 'BoC Interest Rate Decision',  false),
  ('SNB',  'G10',  7, 'SNB',  'Policy',     'CH', 'SNB Interest Rate Decision',  false),
  ('RBNZ', 'G10',  8, 'RBNZ', 'OCR',        'NZ', 'RBNZ Interest Rate Decision', false),
  ('PBOC', 'ASIA', 1, 'PBoC', 'LPR 1Y',     'CN', 'Loan Prime Rate 1Y',          false),
  ('BOK',  'ASIA', 2, 'BoK',  'Base Rate',  'KR', 'Interest Rate Decision',      false),
  ('CBC',  'ASIA', 3, 'CBC',  'Discount',   'TW', 'Interest Rate Decision',      false),
  ('RBI',  'ASIA', 4, 'RBI',  'Repo',       'IN', 'RBI Interest Rate Decision',  false),
  ('BI',   'ASIA', 5, 'BI',   'BI-Rate',    'ID', 'Interest Rate Decision',      false),
  ('BSP',  'ASIA', 6, 'BSP',  'Target RRP', 'PH', 'Interest Rate Decision',      false),
  ('BNM',  'ASIA', 7, 'BNM',  'OPR',        'MY', 'Interest Rate Decision',      false),
  ('BCB',  'ASIA', 8, 'BCB',  'Selic',      'BR', 'Interest Rate Decision',      false)
on conflict (code) do nothing;

create table if not exists cb_events (
  id          text primary key,              -- TradingView event id
  code        text not null references cb_banks(code) on delete cascade,
  date        timestamptz not null,
  actual      double precision,
  forecast    double precision,
  previous    double precision,
  updated_at  timestamptz not null default now()
);
create index if not exists cb_events_code_date_idx on cb_events (code, date);

alter table cb_banks  enable row level security;
alter table cb_events enable row level security;
drop policy if exists cb_banks_read   on cb_banks;
drop policy if exists cb_banks_update on cb_banks;
drop policy if exists cb_events_read  on cb_events;
-- website: read banks, change show / next_override; read events (only the Action writes them)
create policy cb_banks_read   on cb_banks  for select to anon, authenticated using (true);
create policy cb_banks_update on cb_banks  for update to anon, authenticated using (true) with check (true);
create policy cb_events_read  on cb_events for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------
-- trmnl_cb(include_hidden) → { updated, g10:[...], asia:[...] }
-- Decisions come from cb_events (long history, daily) plus econ_events
-- (fresh, every 30 min) so a decision shows up within half an hour.
-- ---------------------------------------------------------------------
create or replace function cb_change(cur double precision, prev double precision)
returns text language sql immutable as $$
  select case
    when cur is null or prev is null then ''
    when round(((cur - prev) * 100)::numeric) = 0 then 'Hold'
    when cur > prev then '+' || round(((cur - prev) * 100)::numeric)::text
    else '−' || round(((prev - cur) * 100)::numeric)::text
  end
$$;

create or replace function cb_rate(v double precision, is_range boolean)
returns text language sql immutable as $$
  select case
    when v is null then '—'
    when is_range then to_char(v - 0.25, 'FM990.00') || '–' || to_char(v, 'FM990.00')
    else to_char(v, 'FM990.00')
  end
$$;

drop function if exists trmnl_cb(boolean);
create or replace function trmnl_cb(include_hidden boolean default false)
returns json language plpgsql stable as $$
declare
  now_utc timestamptz := now();
  today   date        := (now() at time zone 'Asia/Hong_Kong')::date;
  result  json;
begin
  with ev as (
    select b.code, e.id, e.date, e.actual, e.forecast, e.previous
    from cb_banks b
    join econ_events e on e.region = b.region and e.std_name = b.event_name
    union
    select c.code, c.id, c.date, c.actual, c.forecast, c.previous from cb_events c
  ),
  ev1 as (                                   -- one row per event id
    select distinct on (code, id) * from ev order by code, id, actual nulls last
  ),
  past as (
    select ev1.*, row_number() over (partition by code order by date desc) as rn
    from ev1 where date <= now_utc and actual is not null
  ),
  nxt as (
    select distinct on (code) code, date, forecast
    from ev1 where date > now_utc order by code, date
  ),
  rows as (
    select b.*,
           p1.actual as cur,
           n.date    as next_ts,
           n.forecast as next_fc,
           coalesce(case when b.next_override >= today then b.next_override end,
                    (n.date at time zone 'Asia/Hong_Kong')::date) as next_day,
           (select json_agg(json_build_object(
                      'd', to_char(p.date at time zone 'Asia/Hong_Kong', 'DD Mon'),
                      'c', cb_change(p.actual, coalesce(p.previous,
                              (select q.actual from past q where q.code = p.code and q.rn = p.rn + 1))),
                      'rate', cb_rate(p.actual, b.is_range))
                    order by p.rn)
              from past p where p.code = b.code and p.rn <= 3) as hist
    from cb_banks b
    left join past p1 on p1.code = b.code and p1.rn = 1
    left join nxt  n  on n.code  = b.code
    where b.show or include_hidden
  ),
  items as (
    select side, sort_order,
           json_build_object(
             'code',      code,
             'cb',        short_name,
             'rate_name', rate_name,
             'rate',      cb_rate(cur, is_range),
             'show',      show,
             'next',      coalesce(to_char(next_day, 'DD Mon'), '—'),
             'next_iso',  to_char(next_day, 'YYYY-MM-DD'),
             'days',      case when next_day is null then null else next_day - today end,
             'soon',      next_day is not null and next_day - today between 0 and 7,
             'manual',    next_override is not null and next_override >= today,
             'exp',       case when next_fc is null or cur is null then ''
                               when next_override is not null and next_override >= today
                                    and (next_ts at time zone 'Asia/Hong_Kong')::date <> next_override then ''
                               else cb_change(next_fc, cur) end,
             'hist',      coalesce(hist, '[]'::json)
           ) as j
    from rows
  )
  select json_build_object(
           'title',   'Central banks',
           'updated', to_char(now_utc at time zone 'Asia/Hong_Kong', 'DD Mon HH24:MI'),
           'g10',     coalesce((select json_agg(j order by sort_order) from items where side = 'G10'),  '[]'::json),
           'asia',    coalesce((select json_agg(j order by sort_order) from items where side = 'ASIA'), '[]'::json))
    into result;
  return result;
end
$$;

grant execute on function cb_change(double precision, double precision) to anon, authenticated;
grant execute on function cb_rate(double precision, boolean)            to anon, authenticated;
grant execute on function trmnl_cb(boolean)                             to anon, authenticated;
