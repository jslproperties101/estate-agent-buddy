-- Estate Agent AI Buddy, Changes 19 and 20 (JoyChange001): Google call log and Developer Dashboard (database part).
-- PROPOSAL — NOT APPLIED to any live or test project. Apply it first to the TEST project (EAB-QA-Test) in
-- Supabase → SQL Editor; LIVE only later, together with Pending Task 10. Run after every file in supabase/migrations/,
-- Change 010 (20261016000000_change010_team_sharing_audit.sql) and its fix (20261017000000_change010_fix_pgcrypto_path.sql).
-- Undo: supabase/proposed/20261018000000_change019_020_rollback.sql. Rehearsed on local PostgreSQL 16 by
-- supabase/tests/change019-test.sh.
--
-- It only ADDS two tables and some functions. No existing table, row, policy or function is changed.
--
-- What it stores (privacy, enforced HERE, not only by the app):
--   eab_usage_events  one row per app event: when, which signed-in user, kind, a short code name (for example
--                     "geocoding.reverse"), the screen code, worked yes/no, a number (count, milliseconds or bytes),
--                     app version, platform and phone model. The name and screen columns accept only short codes
--                     (lower-case letters, digits and . _ : -), so free text such as an address, a client's name or a
--                     phone number cannot be stored. There is NO column for locations, record contents or notes.
--   eab_developers    who may read the dashboard. Nobody can add themselves through the app: there is no policy and no
--                     grant, so a row can only be added by the project owner in the SQL Editor (see "Setup" below).
--
-- Who can do what:
--   a signed-in user   adds events about THEMSELVES only, through eab_log_usage (the user id always comes from the
--                      sign-in; anything else in the request is ignored); cannot read, change or delete any event,
--                      not even their own.
--   anonymous          nothing.
--   developer          reads summaries and event lists through the eab_dev_* functions; each one checks
--                      eab_developers first and refuses everyone else ("not allowed").
--   nobody (API)       can update or delete events.
--
-- How long it is kept (owner, 18 Oct 2026: "1 year + totals forever"):
--   eab_usage_events  every single event, for 1 year (365 days); then deleted automatically.
--   eab_usage_daily   one row per user, day (Malaysian time), kind, name and screen with the totals (calls, failures,
--                     summed value). Kept forever. Refreshed from the events before any event is deleted, and again for
--                     any day that later receives events sent from a phone that was offline.
--   Deleting a user's account deletes both their events and their daily totals.
--
-- Limits against runaway cost or abuse: at most 200 events per call, at most 5,000 events per user per hour (more are
-- dropped), phone times are kept within the last 30 days and 5 minutes into the future.
--
-- Event kinds the app sends (Change 19 = google; Change 20 = the rest):
--   google   one call to a Google Maps Platform API. name = "<api>.<method>", e.g. geocoding.reverse, places.autocomplete,
--            places.details, routes.compute, directions.route, maps.load. ok = Google answered without error.
--   session  name = session.start (value = null) or session.active (value = active milliseconds since the last report).
--   screen   a screen was opened. name = the screen code.
--   feature  a feature was used, e.g. listing.create, photo.add, share.set, pdf.export, calculator.save.
--   ai       a paid AI call, e.g. smartcapture.extract, voice.transcribe. value = cost units if known.
--   sync     name = sync.push / sync.pull / drive.backup / drive.restore_point. ok = it worked.
--   error    name = the error code (never the message text). ok = false.
--   metric   a measurement, e.g. storage.local_bytes (value = bytes on the phone), records.pending (value = count).
--
-- Setup after applying (SQL Editor, replace the e-mail with the developer's own Google sign-in address):
--   insert into public.eab_developers (user_id) select id from auth.users where email = 'YOUR-EMAIL@gmail.com';

begin;

-- ---------- tables ----------
create table if not exists public.eab_developers (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  added_at  timestamptz not null default now()
);

create table if not exists public.eab_usage_events (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  at           timestamptz not null default now(),      -- when it happened on the phone (kept within limits)
  received_at  timestamptz not null default now(),      -- when the cloud received it
  kind         text not null check (kind in ('google', 'session', 'screen', 'feature', 'ai', 'sync', 'error', 'metric')),
  name         text not null check (name ~ '^[a-z0-9][a-z0-9_.:-]{0,59}$'),
  screen       text check (screen is null or screen ~ '^[a-z0-9][a-z0-9_.:-]{0,39}$'),
  ok           boolean,
  n            integer not null default 1 check (n between 1 and 1000),
  value        double precision check (value is null or (value between -1e15 and 1e15)),
  app_version  text check (app_version is null or app_version ~ '^[0-9A-Za-z._+-]{1,40}$'),
  platform     text check (platform is null or platform in ('android', 'ios', 'web')),
  device       text check (device is null or device ~ '^[0-9A-Za-z ._()+-]{1,60}$')
);
create index if not exists eab_usage_events_at on public.eab_usage_events (at);
create index if not exists eab_usage_events_user_at on public.eab_usage_events (user_id, at desc);
create index if not exists eab_usage_events_kind_at on public.eab_usage_events (kind, at);
create index if not exists eab_usage_events_user_received on public.eab_usage_events (user_id, received_at);   -- hourly limit check
create index if not exists eab_usage_events_received on public.eab_usage_events (received_at);                -- daily totals refresh

create table if not exists public.eab_usage_daily (
  user_id      uuid not null references auth.users (id) on delete cascade,
  day          date not null,                 -- Malaysian date
  kind         text not null,
  name         text not null,
  screen       text not null default '',      -- '' when the event had no screen
  calls        bigint not null,
  failures     bigint not null,
  total_value  double precision,
  primary key (user_id, day, kind, name, screen)
);
create index if not exists eab_usage_daily_day on public.eab_usage_daily (day);

-- When the daily totals were last refreshed (one row).
create table if not exists public.eab_usage_rollup_state (
  id        integer primary key default 1 check (id = 1),
  last_run  timestamptz
);

-- All tables: row-level security on, no policies, no grants. Unreadable and unwritable through the API; reached only
-- through the functions below.
alter table public.eab_developers enable row level security;
alter table public.eab_usage_events enable row level security;
alter table public.eab_usage_daily enable row level security;
alter table public.eab_usage_rollup_state enable row level security;
revoke all on public.eab_developers, public.eab_usage_events, public.eab_usage_daily, public.eab_usage_rollup_state
  from public, anon, authenticated;

-- ---------- helpers ----------
create or replace function public.eab_is_developer() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.eab_developers where user_id = auth.uid());
$$;

create or replace function public.eab_dev_guard() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eab_is_developer() then raise exception 'not allowed' using errcode = '42501'; end if;
end $$;

-- Refreshes the daily totals for every day that received events since the last refresh (with a 10-minute overlap, so
-- an event saved at the same moment is never missed; recounting a day twice gives the same result). A day is always
-- recounted from all its events, so late events from an offline phone are included.
create or replace function public.eab_usage_rollup() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_since timestamptz;
  v_now timestamptz := clock_timestamp();
  v_days date[];
begin
  insert into public.eab_usage_rollup_state (id, last_run) values (1, null) on conflict (id) do nothing;
  select last_run into v_since from public.eab_usage_rollup_state where id = 1 for update;
  select coalesce(array_agg(distinct (at at time zone 'Asia/Kuala_Lumpur')::date), '{}') into v_days
    from public.eab_usage_events
    where v_since is null or received_at > v_since - interval '10 minutes';
  if cardinality(v_days) > 0 then
    delete from public.eab_usage_daily where day = any (v_days);
    insert into public.eab_usage_daily (user_id, day, kind, name, screen, calls, failures, total_value)
    select user_id, (at at time zone 'Asia/Kuala_Lumpur')::date, kind, name, coalesce(screen, ''),
           sum(n), coalesce(sum(n) filter (where ok is false), 0), sum(value)
    from public.eab_usage_events
    where (at at time zone 'Asia/Kuala_Lumpur')::date = any (v_days)
    group by 1, 2, 3, 4, 5;
  end if;
  update public.eab_usage_rollup_state set last_run = v_now where id = 1;
  return cardinality(v_days);
end $$;

-- Refreshes the daily totals, then deletes events older than 1 year (at most 50,000 per run, so a run is always
-- short). Their totals stay in eab_usage_daily forever. Runs by itself now and then from eab_log_usage, and every
-- night when pg_cron is switched on (see the end of this file).
create or replace function public.eab_usage_cleanup() returns integer
language plpgsql security definer set search_path = public as $$
declare k integer;
begin
  perform public.eab_usage_rollup();
  with old as (select id from public.eab_usage_events where at < now() - interval '365 days' order by at limit 50000)
  delete from public.eab_usage_events e using old where e.id = old.id;
  get diagnostics k = row_count;
  return k;
end $$;

-- ---------- the app sends events here ----------
-- p_events: a JSON array of objects {kind, name, screen?, ok?, n?, value?, at?, app_version?, platform?, device?}.
-- Returns how many were stored. Rows that break a rule (wrong kind, free text in name, ...) are skipped, never the
-- whole batch, so the phone can always clear its queue. Any user id in the request is ignored.
create or replace function public.eab_log_usage(p_events jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  e jsonb;
  t timestamptz;
  stored integer := 0;
  room integer;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' then raise exception 'events must be a list'; end if;
  if jsonb_array_length(p_events) > 200 then raise exception 'too many events in one call (max 200)'; end if;
  select 5000 - count(*) into room from public.eab_usage_events where user_id = me and received_at > now() - interval '1 hour';
  for e in select value from jsonb_array_elements(p_events) loop
    exit when room <= 0;
    begin
      t := coalesce(nullif(e->>'at', '')::timestamptz, now());
      t := greatest(now() - interval '30 days', least(now() + interval '5 minutes', t));
      insert into public.eab_usage_events (user_id, at, kind, name, screen, ok, n, value, app_version, platform, device)
      values (me, t, e->>'kind', e->>'name', nullif(e->>'screen', ''), (e->>'ok')::boolean,
              coalesce((e->>'n')::integer, 1), (e->>'value')::double precision,
              nullif(e->>'app_version', ''), nullif(e->>'platform', ''), nullif(e->>'device', ''));
      stored := stored + 1; room := room - 1;
    exception when others then
      null;   -- one bad event is skipped; the rest are kept
    end;
  end loop;
  if random() < 0.02 then perform public.eab_usage_cleanup(); end if;
  return stored;
end $$;

-- ---------- developer dashboard (each function refuses non-developers) ----------

-- Whole-app numbers for a period.
create or replace function public.eab_dev_overview(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare r jsonb;
begin
  perform public.eab_dev_guard();
  with ev as (select * from public.eab_usage_events where at >= p_from and at < p_to)
  select jsonb_build_object(
    'users_total',        (select count(*) from auth.users),
    'users_new',          (select count(*) from auth.users where created_at >= p_from and created_at < p_to),
    'active_users',       (select count(distinct user_id) from ev),
    'returning_users',    (select count(distinct user_id) from ev where exists (
                             select 1 from public.eab_usage_events o where o.user_id = ev.user_id and o.at < p_from)),
    'active_1d',          (select count(distinct user_id) from public.eab_usage_events where at > now() - interval '1 day'),
    'active_7d',          (select count(distinct user_id) from public.eab_usage_events where at > now() - interval '7 days'),
    'active_30d',         (select count(distinct user_id) from public.eab_usage_events where at > now() - interval '30 days'),
    'sessions',           (select coalesce(sum(n), 0) from ev where kind = 'session' and name = 'session.start'),
    'active_minutes',     (select round((coalesce(sum(value), 0) / 60000.0)::numeric, 1) from ev where kind = 'session' and name = 'session.active'),
    'google_calls',       (select coalesce(sum(n), 0) from ev where kind = 'google'),
    'google_failures',    (select coalesce(sum(n), 0) from ev where kind = 'google' and ok is false),
    'ai_calls',           (select coalesce(sum(n), 0) from ev where kind = 'ai'),
    'errors',             (select coalesce(sum(n), 0) from ev where kind = 'error'),
    'sync_failures',      (select coalesce(sum(n), 0) from ev where kind = 'sync' and ok is false),
    'records_total',      (select count(*) from public.eab_records where not deleted),
    'records_by_kind',    (select coalesce(jsonb_object_agg(collection, c), '{}'::jsonb) from (
                             select collection, count(*) c from public.eab_records where not deleted group by collection) x),
    'files_count',        (select count(*) from public.eab_files where not deleted and status = 'uploaded'),
    'files_bytes',        (select coalesce(sum(bytes), 0) from public.eab_files where not deleted and status = 'uploaded'),
    'database_bytes',     pg_database_size(current_database()),
    'usage_log_bytes',    pg_total_relation_size('public.eab_usage_events'),
    'teams_active',       (select count(*) from public.eab_teams where ended_at is null),
    'invites',            (select coalesce(jsonb_object_agg(status, c), '{}'::jsonb) from (
                             select status, count(*) c from public.eab_team_invites where created_at >= p_from and created_at < p_to group by status) x),
    'bug_reports',        (select count(*) from public.eab_bug_reports where created_at >= p_from and created_at < p_to),
    'activation',         jsonb_build_object(
                            'with_listing', (select count(distinct user_id) from public.eab_records where collection = 'properties' and not deleted),
                            'with_photo',   (select count(distinct uploaded_by) from public.eab_files where kind = 'photo' and not deleted),
                            'with_share',   (select count(distinct owner_id) from public.eab_shares))
  ) into r;
  return r;
end $$;

-- One row per user (newest activity first). p_search matches part of the e-mail; p_app_version the exact version.
create or replace function public.eab_dev_users(p_from timestamptz, p_to timestamptz, p_search text default null, p_app_version text default null)
returns table (user_id uuid, email text, signed_up timestamptz, last_active timestamptz, app_version text, platform text, device text,
               sessions bigint, active_minutes numeric, google_calls bigint, google_failures bigint, ai_calls bigint, errors bigint,
               sync_failures bigint, last_sync timestamptz, last_drive_backup timestamptz, local_bytes double precision,
               records jsonb, records_total bigint, files_count bigint, files_bytes bigint, in_team boolean, bug_reports bigint)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.eab_dev_guard();
  return query
  with ev as (select * from public.eab_usage_events e where e.at >= p_from and e.at < p_to),
  per as (
    select ev.user_id u,
      coalesce(sum(ev.n) filter (where ev.kind = 'session' and ev.name = 'session.start'), 0)::bigint s,
      round(coalesce(sum(ev.value) filter (where ev.kind = 'session' and ev.name = 'session.active'), 0)::numeric / 60000, 1) am,
      coalesce(sum(ev.n) filter (where ev.kind = 'google'), 0)::bigint g,
      coalesce(sum(ev.n) filter (where ev.kind = 'google' and ev.ok is false), 0)::bigint gf,
      coalesce(sum(ev.n) filter (where ev.kind = 'ai'), 0)::bigint ai,
      coalesce(sum(ev.n) filter (where ev.kind = 'error'), 0)::bigint er,
      coalesce(sum(ev.n) filter (where ev.kind = 'sync' and ev.ok is false), 0)::bigint sf
    from ev group by ev.user_id)
  select au.id, au.email::text, au.created_at, la.at, lv.app_version, lv.platform,
    (select x.device from public.eab_usage_events x where x.user_id = au.id and x.device is not null order by x.at desc limit 1),
    coalesce(per.s, 0), coalesce(per.am, 0), coalesce(per.g, 0), coalesce(per.gf, 0), coalesce(per.ai, 0), coalesce(per.er, 0), coalesce(per.sf, 0),
    (select max(x.at) from public.eab_usage_events x where x.user_id = au.id and x.kind = 'sync' and x.name in ('sync.push', 'sync.pull') and x.ok),
    (select max(x.at) from public.eab_usage_events x where x.user_id = au.id and x.kind = 'sync' and x.name like 'drive.%' and x.ok),
    (select x.value from public.eab_usage_events x where x.user_id = au.id and x.kind = 'metric' and x.name = 'storage.local_bytes' order by x.at desc limit 1),
    (select coalesce(jsonb_object_agg(rc.collection, rc.c), '{}'::jsonb) from (
       select r.collection, count(*) c from public.eab_records r where r.user_id = au.id and not r.deleted group by r.collection) rc),
    (select count(*) from public.eab_records r where r.user_id = au.id and not r.deleted),
    (select count(*) from public.eab_files f where f.uploaded_by = au.id and not f.deleted and f.status = 'uploaded'),
    (select coalesce(sum(f.bytes), 0)::bigint from public.eab_files f where f.uploaded_by = au.id and not f.deleted and f.status = 'uploaded'),
    exists (select 1 from public.eab_team_members tm where tm.user_id = au.id and tm.left_at is null),
    (select count(*) from public.eab_bug_reports b where b.user_id = au.id)
  from auth.users au
  left join per on per.u = au.id
  left join lateral (select max(x.at) at from public.eab_usage_events x where x.user_id = au.id) la on true
  left join lateral (select x.app_version, x.platform from public.eab_usage_events x
                     where x.user_id = au.id and x.app_version is not null order by x.at desc limit 1) lv on true
  where (p_search is null or au.email ilike '%' || p_search || '%')
    and (p_app_version is null or lv.app_version = p_app_version)
  order by la.at desc nulls last, au.email
  limit 1000;
end $$;

-- Totals grouped by user, kind, name and screen (e.g. "which user called which Google API from which screen").
create or replace function public.eab_dev_breakdown(p_from timestamptz, p_to timestamptz, p_user uuid default null, p_kind text default null,
                                                    p_screen text default null, p_app_version text default null)
returns table (user_id uuid, email text, kind text, name text, screen text, calls bigint, failures bigint, total_value double precision, last_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.eab_dev_guard();
  return query
  select e.user_id, au.email::text, e.kind, e.name, e.screen, sum(e.n)::bigint, coalesce(sum(e.n) filter (where e.ok is false), 0)::bigint,
         sum(e.value), max(e.at)
  from public.eab_usage_events e join auth.users au on au.id = e.user_id
  where e.at >= p_from and e.at < p_to
    and (p_user is null or e.user_id = p_user) and (p_kind is null or e.kind = p_kind)
    and (p_screen is null or e.screen = p_screen) and (p_app_version is null or e.app_version = p_app_version)
  group by e.user_id, au.email, e.kind, e.name, e.screen
  order by 6 desc
  limit 2000;
end $$;

-- The latest events, newest first (at most 1,000).
create or replace function public.eab_dev_events(p_from timestamptz, p_to timestamptz, p_user uuid default null, p_kind text default null,
                                                 p_name text default null, p_screen text default null, p_app_version text default null,
                                                 p_limit integer default 200)
returns table (id bigint, at timestamptz, user_id uuid, email text, kind text, name text, screen text, ok boolean, n integer,
               value double precision, app_version text, platform text, device text)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.eab_dev_guard();
  return query
  select e.id, e.at, e.user_id, au.email::text, e.kind, e.name, e.screen, e.ok, e.n, e.value, e.app_version, e.platform, e.device
  from public.eab_usage_events e join auth.users au on au.id = e.user_id
  where e.at >= p_from and e.at < p_to
    and (p_user is null or e.user_id = p_user) and (p_kind is null or e.kind = p_kind) and (p_name is null or e.name = p_name)
    and (p_screen is null or e.screen = p_screen) and (p_app_version is null or e.app_version = p_app_version)
  order by e.at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end $$;

-- Per-day numbers for charts, from the daily totals (complete for ALL time, also beyond the 1-year event limit).
-- p_from and p_to are Malaysian dates, both included. Refreshes the totals first, so today is up to date.
create or replace function public.eab_dev_daily(p_from date, p_to date, p_user uuid default null)
returns table (day date, active_users bigint, sessions bigint, active_minutes numeric, google_calls bigint, ai_calls bigint, errors bigint)
language plpgsql security definer set search_path = public as $$
begin
  perform public.eab_dev_guard();
  perform public.eab_usage_rollup();
  return query
  select d.day, count(distinct d.user_id),
    coalesce(sum(d.calls) filter (where d.kind = 'session' and d.name = 'session.start'), 0)::bigint,
    round((coalesce(sum(d.total_value) filter (where d.kind = 'session' and d.name = 'session.active'), 0) / 60000.0)::numeric, 1),
    coalesce(sum(d.calls) filter (where d.kind = 'google'), 0)::bigint,
    coalesce(sum(d.calls) filter (where d.kind = 'ai'), 0)::bigint,
    coalesce(sum(d.calls) filter (where d.kind = 'error'), 0)::bigint
  from public.eab_usage_daily d
  where d.day between p_from and p_to and (p_user is null or d.user_id = p_user)
  group by d.day order by d.day;
end $$;

-- Long-term totals per user, kind, name and screen between two Malaysian dates (both included), from the daily
-- totals: works for any period, including more than a year back.
create or replace function public.eab_dev_history(p_from date, p_to date, p_user uuid default null, p_kind text default null,
                                                  p_name text default null, p_screen text default null)
returns table (user_id uuid, email text, kind text, name text, screen text, calls bigint, failures bigint, total_value double precision,
               first_day date, last_day date, days_used bigint)
language plpgsql security definer set search_path = public, auth as $$
begin
  perform public.eab_dev_guard();
  perform public.eab_usage_rollup();
  return query
  select d.user_id, au.email::text, d.kind, d.name, nullif(d.screen, ''), sum(d.calls)::bigint, sum(d.failures)::bigint,
         sum(d.total_value), min(d.day), max(d.day), count(distinct d.day)
  from public.eab_usage_daily d join auth.users au on au.id = d.user_id
  where d.day between p_from and p_to
    and (p_user is null or d.user_id = p_user) and (p_kind is null or d.kind = p_kind)
    and (p_name is null or d.name = p_name) and (p_screen is null or d.screen = p_screen)
  group by d.user_id, au.email, d.kind, d.name, d.screen
  order by 6 desc
  limit 5000;
end $$;

-- ---------- who may call what ----------
revoke all on function public.eab_is_developer(), public.eab_dev_guard(), public.eab_usage_rollup(), public.eab_usage_cleanup(), public.eab_log_usage(jsonb),
  public.eab_dev_overview(timestamptz, timestamptz), public.eab_dev_users(timestamptz, timestamptz, text, text),
  public.eab_dev_breakdown(timestamptz, timestamptz, uuid, text, text, text),
  public.eab_dev_events(timestamptz, timestamptz, uuid, text, text, text, text, integer),
  public.eab_dev_daily(date, date, uuid), public.eab_dev_history(date, date, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.eab_is_developer(), public.eab_log_usage(jsonb),
  public.eab_dev_overview(timestamptz, timestamptz), public.eab_dev_users(timestamptz, timestamptz, text, text),
  public.eab_dev_breakdown(timestamptz, timestamptz, uuid, text, text, text),
  public.eab_dev_events(timestamptz, timestamptz, uuid, text, text, text, text, integer),
  public.eab_dev_daily(date, date, uuid), public.eab_dev_history(date, date, uuid, text, text, text) to authenticated;
-- eab_dev_guard, eab_usage_rollup and eab_usage_cleanup are not callable through the API (used inside the functions above, and by pg_cron).

commit;

-- ---------- nightly clean-up (only if pg_cron is switched on: Supabase → Database → Extensions → pg_cron) ----------
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'eab-usage-cleanup';
    perform cron.schedule('eab-usage-cleanup', '17 19 * * *', 'select public.eab_usage_cleanup()');   -- 03:17 Malaysian time
  end if;
end $$;
