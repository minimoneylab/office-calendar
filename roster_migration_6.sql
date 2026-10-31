-- =====================================================================
-- Desk Roster — migration 6: central bank meeting schedules
-- Run ONCE in Supabase SQL Editor, after migration 5.
--   * cb_schedule : each bank's announced decision days (HK-relevant local date)
--   * trmnl_cb()  : next meeting = manual override → TradingView → schedule
-- Safe to run again (seed uses "do nothing" on duplicates).
--
-- Seed researched 31 Oct 2026 from official sources where available.
-- tentative = true → not officially confirmed (estimate / third-party / rule).
-- =====================================================================

create table if not exists cb_schedule (
  code       text not null references cb_banks(code) on delete cascade,
  date       date not null,               -- decision day (local date of the bank)
  tentative  boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (code, date)
);

alter table cb_schedule enable row level security;
drop policy if exists cb_schedule_all on cb_schedule;
create policy cb_schedule_all on cb_schedule for all to anon, authenticated using (true) with check (true);

insert into cb_schedule (code, date, tentative) values
  -- Fed (federalreserve.gov FOMC calendar)
  ('FED','2026-12-09',false),('FED','2027-01-27',false),('FED','2027-03-17',false),('FED','2027-04-28',false),
  ('FED','2027-06-09',false),('FED','2027-07-28',false),('FED','2027-09-15',false),('FED','2027-10-27',false),('FED','2027-12-08',false),
  -- ECB (ecb.europa.eu Governing Council calendar)
  ('ECB','2026-12-17',false),('ECB','2027-02-04',false),('ECB','2027-03-18',false),('ECB','2027-04-29',false),
  ('ECB','2027-06-10',false),('ECB','2027-07-22',false),('ECB','2027-09-09',false),('ECB','2027-10-28',false),('ECB','2027-12-16',false),
  -- BoJ (boj.or.jp 2027 schedule; Dec 2026 from financecalendar)
  ('BOJ','2026-12-18',false),('BOJ','2027-01-22',false),('BOJ','2027-03-18',false),('BOJ','2027-04-28',false),
  ('BOJ','2027-06-11',false),('BOJ','2027-07-22',false),('BOJ','2027-09-22',false),('BOJ','2027-10-29',false),('BOJ','2027-12-17',false),
  -- BoE (bankofengland.co.uk MPC dates 2026 / 2027)
  ('BOE','2026-11-05',false),('BOE','2026-12-17',false),('BOE','2027-02-04',false),('BOE','2027-03-18',false),('BOE','2027-04-29',false),
  ('BOE','2027-06-17',false),('BOE','2027-07-29',false),('BOE','2027-09-16',false),('BOE','2027-11-04',false),('BOE','2027-12-16',false),
  -- RBA (rba.gov.au calendar: Nov/Dec 2026, Nov/Dec 2027; Feb–Sep 2027 from rbaratewatch → tentative)
  ('RBA','2026-11-03',false),('RBA','2026-12-08',false),('RBA','2027-02-09',true),('RBA','2027-03-23',true),('RBA','2027-05-04',true),
  ('RBA','2027-06-22',true),('RBA','2027-08-10',true),('RBA','2027-09-21',true),('RBA','2027-11-02',false),('RBA','2027-12-14',false),
  -- BoC (bankofcanada.ca 2027 schedule; Dec 2026 not re-checked → tentative)
  ('BOC','2026-12-09',true),('BOC','2027-01-27',false),('BOC','2027-03-03',false),('BOC','2027-04-28',false),('BOC','2027-06-02',false),
  ('BOC','2027-07-21',false),('BOC','2027-09-08',false),('BOC','2027-10-27',false),('BOC','2027-12-08',false),
  -- SNB (financecalendar, marked confirmed; Dec 2027 not yet listed)
  ('SNB','2026-12-10',false),('SNB','2027-03-18',false),('SNB','2027-06-24',false),('SNB','2027-09-23',false),
  -- RBNZ (financecalendar; 8th 2027 meeting not yet listed)
  ('RBNZ','2026-12-09',false),('RBNZ','2027-02-10',false),('RBNZ','2027-03-17',false),('RBNZ','2027-05-05',false),
  ('RBNZ','2027-06-16',false),('RBNZ','2027-08-04',false),('RBNZ','2027-09-15',false),('RBNZ','2027-10-27',false),
  -- PBoC LPR: rule = 20th, next business day if weekend (holidays not checked) → tentative
  ('PBOC','2026-11-20',false),('PBOC','2026-12-21',true),('PBOC','2027-01-20',true),('PBOC','2027-02-22',true),('PBOC','2027-03-22',true),
  ('PBOC','2027-04-20',true),('PBOC','2027-05-20',true),('PBOC','2027-06-21',true),('PBOC','2027-07-20',true),('PBOC','2027-08-20',true),
  ('PBOC','2027-09-20',true),('PBOC','2027-10-20',true),('PBOC','2027-11-22',true),('PBOC','2027-12-20',true),
  -- BoK (TradingView; 2027 schedule not yet published)
  ('BOK','2026-11-26',false),
  -- CBC Taiwan (quarterly; Dec 2026 estimated from usual 3rd-Thursday pattern)
  ('CBC','2026-12-17',true),
  -- RBI (rbi.org.in MPC schedule 2026-27)
  ('RBI','2026-12-04',false),('RBI','2027-02-05',false),
  -- BI (bi.go.id 2026 calendar)
  ('BI','2026-11-18',false),('BI','2026-12-16',false),
  -- BSP (BusinessWorld, 2026 schedule)
  ('BSP','2026-12-17',false),
  -- BNM (bnm.gov.my)
  ('BNM','2026-11-05',false),
  -- BCB Copom (2026 / 2027 calendar)
  ('BCB','2026-11-04',false),('BCB','2026-12-09',false),('BCB','2027-01-27',false),('BCB','2027-03-17',false),('BCB','2027-04-28',false),
  ('BCB','2027-06-16',false),('BCB','2027-08-04',false),('BCB','2027-09-22',false),('BCB','2027-10-27',false),('BCB','2027-12-08',false)
on conflict (code, date) do nothing;

-- ---------------------------------------------------------------------
-- trmnl_cb: same output as before, plus 'tentative', 'next_src' and
-- 'sched' (upcoming schedule dates, for the website editor).
-- Next meeting priority: manual override (if today or later)
--   → TradingView's next event → first schedule date from today.
-- ---------------------------------------------------------------------
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
  ev1 as (
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
  sch as (
    select distinct on (code) code, date, tentative
    from cb_schedule where date >= today order by code, date
  ),
  rows as (
    select b.*,
           p1.actual as cur,
           n.forecast as next_fc,
           case when b.next_override >= today then 'manual'
                when n.date is not null      then 'tv'
                when s.date is not null      then 'schedule' end as next_src,
           case when b.next_override >= today then b.next_override
                when n.date is not null      then (n.date at time zone 'Asia/Hong_Kong')::date
                else s.date end as next_day,
           (b.next_override is null or b.next_override < today) and n.date is null and coalesce(s.tentative, false) as tent,
           (select json_agg(json_build_object(
                      'd', to_char(p.date at time zone 'Asia/Hong_Kong', 'DD Mon'),
                      'c', cb_change(p.actual, coalesce(p.previous,
                              (select q.actual from past q where q.code = p.code and q.rn = p.rn + 1))),
                      'rate', cb_rate(p.actual, b.is_range))
                    order by p.rn)
              from past p where p.code = b.code and p.rn <= 3) as hist,
           (select json_agg(json_build_object('date', to_char(x.date, 'YYYY-MM-DD'), 'tentative', x.tentative) order by x.date)
              from cb_schedule x where x.code = b.code and x.date >= today) as sched
    from cb_banks b
    left join past p1 on p1.code = b.code and p1.rn = 1
    left join nxt  n  on n.code  = b.code
    left join sch  s  on s.code  = b.code
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
             'next',      coalesce(to_char(next_day, 'DD Mon'), '—') || case when tent then '?' else '' end,
             'next_iso',  to_char(next_day, 'YYYY-MM-DD'),
             'next_src',  next_src,
             'tentative', tent,
             'days',      case when next_day is null then null else next_day - today end,
             'soon',      next_day is not null and next_day - today between 0 and 7,
             'manual',    next_src = 'manual',
             'exp',       case when next_src = 'tv' and next_fc is not null and cur is not null
                               then cb_change(next_fc, cur) else '' end,
             'hist',      coalesce(hist, '[]'::json),
             'sched',     coalesce(sched, '[]'::json)
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

grant execute on function trmnl_cb(boolean) to anon, authenticated;
