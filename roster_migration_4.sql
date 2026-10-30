-- =====================================================================
-- Desk Roster — migration 4: TRMNL feeds
-- Run ONCE in Supabase SQL Editor, after migrations 1–3.
--
-- Adds two read-only functions that return screen-ready JSON. TRMNL polls:
--   https://<project>.supabase.co/rest/v1/rpc/trmnl_roster              (this month)
--   https://<project>.supabase.co/rest/v1/rpc/trmnl_roster?month_offset=1  (next month)
--   https://<project>.supabase.co/rest/v1/rpc/trmnl_econ                (recent + upcoming)
-- with one header:  apikey=<your publishable key>
--
-- Safe to run again (create or replace). Changes no data.
-- =====================================================================

-- Number formatting used by the econ feed (same rules as the website)
create or replace function trmnl_fmt(v double precision, unit text, scale text)
returns text language sql immutable as $$
  select case
    when v is null then ''
    else
      (case
         when abs(v) >= 1000 then
           trim(trailing '.' from trim(trailing '0' from to_char(round(v::numeric, 1), 'FM999,999,999,990.0')))
         else
           trim(trailing '.' from trim(trailing '0' from to_char(round(v::numeric, 3), 'FM999999990.000')))
       end)
      || coalesce(scale, '')
      || case when unit = '%' then '%' else '' end
  end
$$;

-- ---------------------------------------------------------------------
-- Team leave calendar for one month (Mon–Fri grid, Hong Kong time)
-- ---------------------------------------------------------------------
create or replace function trmnl_roster(month_offset int default 0)
returns json language plpgsql stable as $$
declare
  now_hk      timestamp := now() at time zone 'Asia/Hong_Kong';
  today       date      := (now() at time zone 'Asia/Hong_Kong')::date;
  m_start     date      := (date_trunc('month', now() at time zone 'Asia/Hong_Kong') + make_interval(months => month_offset))::date;
  m_end       date      := (m_start + interval '1 month' - interval '1 day')::date;
  first_wd    date;
  last_wd     date;
  grid_start  date;
  grid_end    date;
  visible     text[];
  weeks       json;
  n_out_today int;
begin
  first_wd := m_start;
  while extract(isodow from first_wd) > 5 loop first_wd := first_wd + 1; end loop;
  last_wd := m_end;
  while extract(isodow from last_wd) > 5 loop last_wd := last_wd - 1; end loop;
  grid_start := first_wd - (extract(isodow from first_wd)::int - 1);
  grid_end   := last_wd + (5 - extract(isodow from last_wd)::int);

  select coalesce(array(select json_array_elements_text(value::json)), array[]::text[])
    into visible
    from roster_settings where key = 'visible_countries';
  if visible is null then
    visible := array['HK','TW','KR','JP','PH','IN','ID','VN','MY','US','UK','BR'];
  end if;

  with days as (
    select d::date as d
    from generate_series(grid_start, grid_end, interval '1 day') d
    where extract(isodow from d) <= 5
  ),
  day_json as (
    select
      d,
      date_trunc('week', d)::date as wk,
      json_build_object(
        'd',     extract(day from d)::int,
        'date',  to_char(d, 'YYYY-MM-DD'),
        'out',   d < m_start or d > m_end,
        'today', d = today,
        'past',  d < today,
        'hols',  coalesce((
                   select json_agg(h.country order by array_position(visible, h.country))
                   from roster_holidays h
                   where h.date = days.d and h.country = any(visible)), '[]'::json),
        'items', coalesce((
                   select json_agg(m.short_name || ' ' || e.code order by m.sort_order, m.id)
                   from roster_entries e join roster_members m on m.id = e.member_id
                   where e.date = days.d), '[]'::json),
        'n',     (select count(*) from roster_entries e where e.date = days.d)
      ) as j
    from days
  )
  select json_agg(json_build_object('days', w.days) order by w.wk)
    into weeks
    from (select wk, json_agg(j order by d) as days from day_json group by wk) w;

  select count(*) into n_out_today from roster_entries where date = today;

  return json_build_object(
    'title',        to_char(m_start, 'FMMonth YYYY'),
    'month_offset', month_offset,
    'updated',      to_char(now_hk, 'DD Mon HH24:MI'),
    'today',        to_char(today, 'Dy DD Mon'),
    'out_today',    n_out_today,
    'n_weeks',      json_array_length(weeks),
    'weeks',        weeks
  );
end
$$;

-- ---------------------------------------------------------------------
-- Watched economic releases around "now" (Hong Kong time):
-- the most recent releases (with their actuals) followed by what's next.
--   recent    : how many already-released items to keep on top (default 5)
--   days      : how far ahead to look, in days (default 7)
--   max_lines : screen lines available, day headers included (default 16)
-- ---------------------------------------------------------------------
drop function if exists trmnl_econ(int, int);
create or replace function trmnl_econ(recent int default 5, days int default 7, max_lines int default 16)
returns json language plpgsql stable as $$
declare
  now_utc   timestamptz := now();
  today     date        := (now() at time zone 'Asia/Hong_Kong')::date;
  to_ts     timestamptz := ((today + days)::timestamp) at time zone 'Asia/Hong_Kong';
  lines     json;
  total     int;
  shown     int;
  last_upd  timestamptz;
begin
  with fam_watch as (
    select distinct region,
           regexp_replace(std_name, '\s+(Adv|Prel|Flash|Final|2nd Est|3rd Est)$', '', 'i') as fam
    from econ_catalog where watch
  ),
  watched as (
    select e.*,
           (e.date at time zone 'Asia/Hong_Kong') as hk,
           (e.date at time zone 'Asia/Hong_Kong')::date as hk_day,
           coalesce(c.display_name, e.title) as label
    from econ_events e
    join fam_watch f
      on f.region = e.region
     and f.fam = regexp_replace(e.std_name, '\s+(Adv|Prel|Flash|Final|2nd Est|3rd Est)$', '', 'i')
    left join econ_catalog c on c.region = e.region and c.std_name = e.std_name
    where e.date > now_utc - interval '4 days' and e.date < to_ts
  ),
  ev as (
    (select * from watched where date <= now_utc order by date desc, region desc, id desc limit greatest(recent, 0))
    union all
    (select * from watched where date > now_utc)
  ),
  numbered as (
    select ev.*,
           row_number() over (order by date, region, id)                    as rn,
           row_number() over (partition by hk_day order by date, region, id) as rn_in_day,
           dense_rank() over (order by hk_day)                               as day_no
    from ev
  ),
  -- each event costs 1 line, plus 1 line for its day header
  costed as (
    select n.*, rn + day_no as line_no from numbered n
  ),
  first_upcoming as (
    select min(rn) as rn from numbered where date > now_utc
  ),
  kept as (
    select * from costed where line_no <= max_lines
  ),
  out_lines as (
    select line_no - 0.5 as sort_key,
           json_build_object(
             'kind',  'day',
             'label', to_char(hk_day, 'Dy DD Mon'),
             'today', hk_day = today) as j
    from kept where rn_in_day = 1
    union all
    select line_no,
           json_build_object(
             'kind',     'ev',
             'time',     to_char(hk, 'HH24:MI'),
             'region',   region,
             'event',    label,
             'period',   coalesce(period, ''),
             'actual',   trmnl_fmt(actual,   unit, scale),
             'forecast', trmnl_fmt(forecast, unit, scale),
             'previous', trmnl_fmt(previous, unit, scale),
             'dir',      case when actual is null or forecast is null or actual = forecast then ''
                              when actual > forecast then 'up' else 'down' end,
             'past',     date <= now_utc,
             'next',     rn = (select rn from first_upcoming))
    from kept
  )
  select json_agg(j order by sort_key), (select count(*) from numbered), (select count(*) from kept)
    into lines, total, shown
    from out_lines;

  select max(updated_at) into last_upd from econ_events;

  return json_build_object(
    'title',   'Economic calendar',
    'now',     to_char(now_utc at time zone 'Asia/Hong_Kong', 'HH24:MI'),
    'updated', coalesce(to_char(last_upd at time zone 'Asia/Hong_Kong', 'DD Mon HH24:MI'), '—'),
    'total',   coalesce(total, 0),
    'shown',   coalesce(shown, 0),
    'more',    coalesce(total, 0) - coalesce(shown, 0),
    'lines',   coalesce(lines, '[]'::json)
  );
end
$$;

grant execute on function trmnl_fmt(double precision, text, text) to anon, authenticated;
grant execute on function trmnl_roster(int)    to anon, authenticated;
grant execute on function trmnl_econ(int, int, int) to anon, authenticated;
