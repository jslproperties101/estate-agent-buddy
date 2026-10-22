-- AdminBatch005 — Dashboards for Admin EAB (features 6, 7, 20, 23, 24, 25, 26, 27, 29, 59, 62).
-- Builds on AdminBatch001-004. TEST project first; never production without Joe's approval.
-- Rollback: supabase/rollback/20261023000000_admin_batch_005_dashboards_rollback.sql
-- Additive only: NEW FUNCTIONS ONLY. No table is created or changed. Nothing in the main app changes.
--
-- In plain words:
--   * Every number comes from what the main app already records: auth.users (sign-ups), eab_usage_events and
--     eab_usage_daily (activity, versions, phones, language, feature use) and eab_records (listings).
--   * "Active on a day" = the agent opened the app that day (any session, screen, feature or language event),
--     Malaysia date. Detail events are kept 365 days; older days come from the daily totals.
--   * Viewer gets totals and charts only. Lists that name agents are for Owner / Admin / Compliance, and every list
--     returned is written to the admin access log.
--   * Exports use the existing eab_admin_export (Owner + Compliance, reference number, access log).

-- =====================================================================================================
-- internal helpers (not callable by apps)
-- =====================================================================================================
create or replace function public.eab_dash_today() returns date
language sql stable set search_path = pg_catalog as $$
  select (now() at time zone 'Asia/Kuala_Lumpur')::date
$$;

-- Start of a Malaysia date as a timestamptz.
create or replace function public.eab_dash_ts(p_day date) returns timestamptz
language sql immutable set search_path = pg_catalog as $$
  select (p_day::timestamp at time zone 'Asia/Kuala_Lumpur')
$$;

create or replace function public.eab_dash_check_range(p_from date, p_to date) returns void
language plpgsql immutable set search_path = pg_catalog as $$
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 730 then
    raise exception 'date range must be 1 to 731 days' using errcode = '22023';
  end if;
end $$;

-- May this admin see lists that name agents?
create or replace function public.eab_dash_names() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.eab_admin_role() in ('owner', 'admin', 'compliance'), false)
$$;

-- One row per agent per Malaysia day on which the app was opened.
create or replace function public.eab_dash_activity(p_from date, p_to date)
returns table (user_id uuid, day date)
language sql stable security definer set search_path = public as $$
  select e.user_id, (e.at at time zone 'Asia/Kuala_Lumpur')::date
    from public.eab_usage_events e
   where e.at >= public.eab_dash_ts(p_from) and e.at < public.eab_dash_ts(p_to + 1)
     and e.user_id is not null and e.kind in ('session', 'screen', 'feature', 'language')
  union
  select d.user_id, d.day from public.eab_usage_daily d
   where d.day between p_from and p_to and d.kind in ('session', 'screen', 'feature', 'language')
$$;

-- First Malaysia day that still has detail events (older days only have daily totals).
create or replace function public.eab_dash_detail_from() returns date
language sql stable security definer set search_path = public as $$
  select coalesce((select (min(e.at) at time zone 'Asia/Kuala_Lumpur')::date from public.eab_usage_events e), public.eab_dash_today() + 1)
$$;

-- Listing status key, the same as the main app's statusKey(): each Booked stage separately, plain "booked" for old records.
create or replace function public.eab_dash_status_key(p_data jsonb) returns text
language sql immutable set search_path = pg_catalog as $$
  select case
    when coalesce(p_data->>'status', '') = '' then 'none'
    when p_data->>'status' = 'in_progress' then
      case when p_data->>'bookedStage' in ('pending_loan', 'pending_spa', 'spa_signed', 'other_agent', 'pending_consent')
           then 'booked_' || (p_data->>'bookedStage') else 'booked' end
    else p_data->>'status' end
$$;

-- =====================================================================================================
-- feature 23 — Sign-ups & Growth (owner, admin, compliance, viewer; counts only)
-- =====================================================================================================
create or replace function public.eab_admin_dash_growth(p_from date default null, p_to date default null, p_bucket text default 'day')
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare today date := public.eab_dash_today(); f date := coalesce(p_from, today - 29); t date := coalesce(p_to, today);
        b text := coalesce(p_bucket, 'day'); step interval;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  perform public.eab_dash_check_range(f, t);
  if b not in ('day', 'week', 'month') then raise exception 'unknown bucket' using errcode = '22023'; end if;
  step := ('1 ' || b)::interval;
  return (
    with u as (select (x.created_at at time zone 'Asia/Kuala_Lumpur')::date d from auth.users x),
    s as (select g::date st, (g + step)::date en from generate_series(date_trunc(b, f::timestamp), date_trunc(b, t::timestamp), step) g)
    select jsonb_build_object(
      'from', f, 'to', t, 'bucket', b,
      'total', (select count(*) from u where u.d <= t),
      'before', (select count(*) from u where u.d < f),
      'new', (select count(*) from u where u.d between f and t),
      'buckets', (select coalesce(jsonb_agg(jsonb_build_object(
          'start', s.st,
          'new', (select count(*) from u where u.d >= greatest(s.st, f) and u.d < least(s.en, t + 1)),
          'running', (select count(*) from u where u.d < least(s.en, t + 1))) order by s.st), '[]'::jsonb) from s)));
end $$;

-- =====================================================================================================
-- feature 24 — Active Users: daily / weekly / monthly active and stickiness (owner, admin, compliance, viewer)
-- =====================================================================================================
create or replace function public.eab_admin_dash_active(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare today date := public.eab_dash_today(); f date := coalesce(p_from, today - 29); t date := coalesce(p_to, today);
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  perform public.eab_dash_check_range(f, t);
  return (
    with a as (select * from public.eab_dash_activity(f - 29, t)),
    per as (select g::date d,
                   (select count(distinct a.user_id) from a where a.day = g::date) dau,
                   (select count(distinct a.user_id) from a where a.day between g::date - 6 and g::date) wau,
                   (select count(distinct a.user_id) from a where a.day between g::date - 29 and g::date) mau
              from generate_series(f, t, interval '1 day') g)
    select jsonb_build_object(
      'from', f, 'to', t,
      'agents', (select count(*) from auth.users),
      'active_in_range', (select count(distinct a.user_id) from a where a.day between f and t),
      'avg_dau', round(avg(per.dau)::numeric, 2),
      'avg_wau', round(avg(per.wau)::numeric, 2),
      'avg_mau', round(avg(per.mau)::numeric, 2),
      'stickiness_pct', round(100 * avg(per.dau)::numeric / nullif(avg(per.mau)::numeric, 0), 1),
      'last', (select jsonb_build_object('day', p.d, 'dau', p.dau, 'wau', p.wau, 'mau', p.mau) from per p order by p.d desc limit 1),
      'by_day', coalesce(jsonb_agg(jsonb_build_object('day', per.d, 'dau', per.dau, 'wau', per.wau, 'mau', per.mau) order by per.d), '[]'::jsonb))
    from per);
end $$;

-- =====================================================================================================
-- feature 25 — Retention & Churn. Cohorts for everyone; the at-risk LIST for owner / admin / compliance only.
--   Retained after N days = active on any day at least N days after the join day.
--   At risk = active in the last 90 days but nothing for 14+ days, OR active days in the last 30 days fewer than
--             half of the 30 days before (with at least 2 active days before).
-- =====================================================================================================
create or replace function public.eab_admin_dash_retention(p_from date default null, p_to date default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare today date := public.eab_dash_today(); f date := coalesce(p_from, today - 364); t date := coalesce(p_to, today);
        names boolean; out jsonb; risk jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  perform public.eab_dash_check_range(f, t);
  names := public.eab_dash_names();
  with j as (select x.id user_id, (x.created_at at time zone 'Asia/Kuala_Lumpur')::date jd from auth.users x),
  a as (select * from public.eab_dash_activity(least(f, today - 89), today)),
  c as (select j.user_id, j.jd,
               (select max(a.day) from a where a.user_id = j.user_id) last_day
          from j where j.jd between f and t),
  r as (select n.n,
               count(*) filter (where c.jd + n.n <= today) eligible,
               count(*) filter (where c.jd + n.n <= today and exists (select 1 from a where a.user_id = c.user_id and a.day >= c.jd + n.n))) kept
          from c cross join (values (7), (30), (90)) n(n) group by n.n)
  select jsonb_build_object(
    'from', f, 'to', t, 'joined', (select count(*) from c),
    'retention', (select coalesce(jsonb_agg(jsonb_build_object('days', r.n, 'eligible', r.eligible, 'kept', r.kept,
                    'pct', round(100.0 * r.kept / nullif(r.eligible, 0), 1)) order by r.n), '[]'::jsonb) from r),
    'cohorts', (select coalesce(jsonb_agg(jsonb_build_object('month', m.mon, 'joined', m.joined,
                    'kept7', m.k7, 'eligible7', m.e7, 'kept30', m.k30, 'eligible30', m.e30, 'kept90', m.k90, 'eligible90', m.e90) order by m.mon), '[]'::jsonb)
      from (select date_trunc('month', c.jd)::date as mon, count(*) joined,
                   count(*) filter (where c.jd + 7 <= today) e7,
                   count(*) filter (where c.jd + 7 <= today and exists (select 1 from a where a.user_id = c.user_id and a.day >= c.jd + 7)) k7,
                   count(*) filter (where c.jd + 30 <= today) e30,
                   count(*) filter (where c.jd + 30 <= today and exists (select 1 from a where a.user_id = c.user_id and a.day >= c.jd + 30)) k30,
                   count(*) filter (where c.jd + 90 <= today) e90,
                   count(*) filter (where c.jd + 90 <= today and exists (select 1 from a where a.user_id = c.user_id and a.day >= c.jd + 90)) k90
              from c group by 1) m)
  ) into out;

  with a as (select * from public.eab_dash_activity(today - 89, today)),
  per as (select a.user_id, max(a.day) last_day,
                 count(*) filter (where a.day > today - 30) recent,
                 count(*) filter (where a.day between today - 59 and today - 30) as prev
            from a group by a.user_id),
  risky as (select p.*, case when p.last_day <= today - 14 then 'no_activity_14d' else 'activity_halved' end reason
              from per p where p.last_day <= today - 14 or (p.prev >= 2 and p.recent < p.prev / 2.0))
  select jsonb_build_object(
    'count', (select count(*) from risky),
    'agents', case when names then (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', k.user_id, 'email', u.email, 'name', public.eab_admin_name(u), 'last_day', k.last_day,
        'days_since', today - k.last_day, 'recent_days', k.recent, 'prior_days', k.prev, 'reason', k.reason)
        order by k.last_day, k.recent), '[]'::jsonb) from risky k join auth.users u on u.id = k.user_id) else null end)
  into risk;
  out := out || jsonb_build_object('at_risk', risk, 'names_hidden', not names);
  if names then
    perform public.eab_admin_write_access('search', null, 'dashboard: at-risk agents',
              jsonb_build_object('results', risk->'count'), p_device);
  end if;
  return out;
end $$;

-- =====================================================================================================
-- feature 26 — Inactive Agents: no activity for 30 / 60 / 90 days. Counts for everyone; LIST for owner/admin/compliance.
--   Last seen = latest day the app was opened, or the latest Google sign-in, whichever is later.
-- =====================================================================================================
create or replace function public.eab_admin_dash_inactive(p_days integer default 30, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare today date := public.eab_dash_today(); d integer := coalesce(p_days, 30); names boolean; out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  if d not in (30, 60, 90) then raise exception 'days must be 30, 60 or 90' using errcode = '22023'; end if;
  names := public.eab_dash_names();
  with a as (select x.user_id, max(x.day) last_open from public.eab_dash_activity(today - 730, today) x group by x.user_id),
  s as (select u.id user_id, u.email, public.eab_admin_name(u) name, (u.created_at at time zone 'Asia/Kuala_Lumpur')::date joined,
               a.last_open, (u.last_sign_in_at at time zone 'Asia/Kuala_Lumpur')::date last_sign_in,
               greatest(a.last_open, (u.last_sign_in_at at time zone 'Asia/Kuala_Lumpur')::date) last_seen
          from auth.users u left join a on a.user_id = u.id where u.deleted_at is null),
  q as (select s.*, coalesce(s.last_seen, s.joined) since from s)
  select jsonb_build_object(
    'days', d, 'checked_at', now(), 'agents', (select count(*) from q),
    'counts', jsonb_build_object(
       '30', (select count(*) from q where q.since <= today - 30),
       '60', (select count(*) from q where q.since <= today - 60),
       '90', (select count(*) from q where q.since <= today - 90)),
    'never_opened', (select count(*) from q where q.last_open is null),
    'names_hidden', not names,
    'list', case when names then (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', q.user_id, 'email', q.email, 'name', q.name, 'joined', q.joined, 'last_open', q.last_open,
        'last_sign_in', q.last_sign_in, 'last_seen', q.last_seen, 'days_since', today - q.since,
        'app_version', (select e.app_version from public.eab_usage_events e where e.user_id = q.user_id order by e.at desc limit 1),
        'platform', (select e.platform from public.eab_usage_events e where e.user_id = q.user_id order by e.at desc limit 1),
        'status', (select st.status from public.eab_account_status st where st.user_id = q.user_id))
        order by q.since nulls first), '[]'::jsonb) from q where q.since <= today - d) else null end
  ) into out;
  if names then
    perform public.eab_admin_write_access('search', null, 'dashboard: inactive ' || d || ' days',
              jsonb_build_object('results', jsonb_array_length(out->'list'), 'days', d), p_device);
  end if;
  return out;
end $$;

-- =====================================================================================================
-- features 20, 27, 29 — App versions, phones / platforms and language (counts for everyone).
--   Each agent is counted once, by the latest event in the period. p_version lists that version's agents
--   (owner / admin / compliance only; written to the access log).
-- =====================================================================================================
create or replace function public.eab_admin_dash_devices(p_from date default null, p_to date default null,
                                                         p_version text default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare today date := public.eab_dash_today(); f date := coalesce(p_from, today - 29); t date := coalesce(p_to, today); out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  perform public.eab_dash_check_range(f, t);
  if p_version is not null and not public.eab_dash_names() then raise exception 'not allowed' using errcode = '42501'; end if;
  with ev as (select * from public.eab_usage_events e where e.at >= public.eab_dash_ts(f) and e.at < public.eab_dash_ts(t + 1) and e.user_id is not null),
  l as (select distinct on (ev.user_id) ev.user_id, coalesce(ev.app_version, '?') v, coalesce(ev.platform, 'unknown') p,
               coalesce(nullif(ev.device, ''), 'unknown') dv, ev.at
          from ev order by ev.user_id, ev.at desc),
  lang as (select distinct on (ev.user_id) ev.user_id, replace(ev.name, 'lang.', '') lg from ev where ev.kind = 'language' order by ev.user_id, ev.at desc)
  select jsonb_build_object(
    'from', f, 'to', t, 'agents', (select count(*) from l),
    'versions', (select coalesce(jsonb_agg(jsonb_build_object('app_version', x.v, 'agents', x.n, 'last_seen', x.ls)), '[]'::jsonb)
      from (select l.v, count(*) n, max(l.at) ls from l group by l.v) x),
    'platforms', (select coalesce(jsonb_agg(jsonb_build_object('platform', x.p, 'agents', x.n) order by x.n desc), '[]'::jsonb)
      from (select l.p, count(*) n from l group by l.p) x),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('device', x.dv, 'platform', x.p, 'agents', x.n) order by x.n desc, x.dv), '[]'::jsonb)
      from (select l.dv, l.p, count(*) n from l group by l.dv, l.p order by 3 desc limit 50) x),
    'languages', (select coalesce(jsonb_agg(jsonb_build_object('language', x.lg, 'agents', x.n) order by x.n desc), '[]'::jsonb)
      from (select coalesce(lang.lg, 'unknown') lg, count(*) n from l left join lang on lang.user_id = l.user_id group by 1) x),
    'language_events', (select coalesce(jsonb_object_agg(x.lg, x.n), '{}'::jsonb)
      from (select replace(ev.name, 'lang.', '') lg, count(*) n from ev where ev.kind = 'language' group by 1) x),
    'version_agents', case when p_version is null then null else (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', l.user_id, 'email', u.email, 'name', public.eab_admin_name(u), 'platform', l.p, 'device', l.dv, 'last_seen', l.at)
        order by l.at desc), '[]'::jsonb) from l join auth.users u on u.id = l.user_id where l.v = p_version) end
  ) into out;
  if p_version is not null then
    perform public.eab_admin_write_access('search', null, 'dashboard: version ' || left(p_version, 40),
              jsonb_build_object('results', jsonb_array_length(out->'version_agents')), p_device);
  end if;
  return out;
end $$;

-- =====================================================================================================
-- features 7, 59 — Listings Analytics and Deal Pipeline (counts for everyone; stale LIST for owner/admin/compliance)
--   Stale = status Available and no change for p_stale_days (Joe: 60).
--   Sale lane: Booked (plain, Pending SPA, Other Agent, Pending Consent) > Pending loan > SPA signed > Sold.
--   Rent lane: Rented - Pending TA Signing > Rented.
-- =====================================================================================================
create or replace function public.eab_admin_dash_listings(p_from date default null, p_to date default null,
                                                          p_stale_days integer default 60, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare today date := public.eab_dash_today(); f date := coalesce(p_from, today - 364); t date := coalesce(p_to, today);
        sd integer := coalesce(p_stale_days, 60); cut bigint; names boolean; out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  perform public.eab_dash_check_range(f, t);
  if sd < 1 or sd > 3650 then raise exception 'stale days must be 1 to 3650' using errcode = '22023'; end if;
  names := public.eab_dash_names();
  cut := (extract(epoch from now() - make_interval(days => sd)) * 1000)::bigint;
  with p as (select r.user_id, r.id, r.data, r.deleted, r.updated, public.eab_dash_status_key(r.data) k
               from public.eab_records r where r.collection = 'properties'),
  live as (select * from p where not p.deleted),
  stale as (select * from live where live.k = 'available' and live.updated < cut)
  select jsonb_build_object(
    'from', f, 'to', t, 'stale_days', sd, 'checked_at', now(),
    'total', (select count(*) from live),
    'deleted', (select count(*) from p where p.deleted),
    'agents_with_listings', (select count(distinct live.user_id) from live),
    'by_status', (select coalesce(jsonb_object_agg(x.k, x.n), '{}'::jsonb) from (select live.k, count(*) n from live group by 1) x),
    'by_purpose', (select coalesce(jsonb_object_agg(x.k, x.n), '{}'::jsonb)
      from (select coalesce(nullif(live.data->>'purpose', ''), 'none') k, count(*) n from live group by 1) x),
    'by_type', (select coalesce(jsonb_agg(jsonb_build_object('type', x.k, 'listings', x.n) order by x.n desc), '[]'::jsonb)
      from (select coalesce(nullif(live.data->>'type', ''), 'Not set') k, count(*) n from live group by 1) x),
    'by_state', (select coalesce(jsonb_agg(jsonb_build_object('state', x.k, 'listings', x.n) order by x.n desc), '[]'::jsonb)
      from (select coalesce(nullif(live.data->>'state', ''), 'Not set') k, count(*) n from live group by 1) x),
    'new_by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', x.m, 'new', x.n) order by x.m), '[]'::jsonb)
      from (select date_trunc('month', (to_timestamp((p.data->>'created')::double precision / 1000) at time zone 'Asia/Kuala_Lumpur'))::date m, count(*) n
              from p where (p.data->>'created') ~ '^[0-9]+(\.[0-9]+)?$'
               and (to_timestamp((p.data->>'created')::double precision / 1000) at time zone 'Asia/Kuala_Lumpur')::date between f and t
             group by 1) x),
    'pipeline', jsonb_build_object(
      'sale', jsonb_build_array(
        jsonb_build_object('stage', 'booked', 'listings', (select count(*) from live where live.k in ('booked', 'booked_pending_spa', 'booked_other_agent', 'booked_pending_consent')),
                           'parts', jsonb_build_object(
                              'booked', (select count(*) from live where live.k = 'booked'),
                              'booked_pending_spa', (select count(*) from live where live.k = 'booked_pending_spa'),
                              'booked_other_agent', (select count(*) from live where live.k = 'booked_other_agent'),
                              'booked_pending_consent', (select count(*) from live where live.k = 'booked_pending_consent'))),
        jsonb_build_object('stage', 'booked_pending_loan', 'listings', (select count(*) from live where live.k = 'booked_pending_loan')),
        jsonb_build_object('stage', 'booked_spa_signed', 'listings', (select count(*) from live where live.k = 'booked_spa_signed')),
        jsonb_build_object('stage', 'sold', 'listings', (select count(*) from live where live.k = 'sold'))),
      'rent', jsonb_build_array(
        jsonb_build_object('stage', 'rented_pending_ta', 'listings', (select count(*) from live where live.k = 'rented_pending_ta')),
        jsonb_build_object('stage', 'rented', 'listings', (select count(*) from live where live.k = 'rented')))),
    'stale_count', (select count(*) from stale),
    'names_hidden', not names,
    'stale', case when names then (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', s.user_id, 'email', u.email, 'name', public.eab_admin_name(u), 'id', s.id,
        'ref', coalesce(s.data->>'ref', s.data->>'refNo'), 'headline', s.data->>'headline', 'type', s.data->>'type',
        'state', s.data->>'state', 'city', s.data->>'city',
        'updated_at', to_timestamp(s.updated / 1000.0), 'days', floor(extract(epoch from now() - to_timestamp(s.updated / 1000.0)) / 86400))
        order by s.updated), '[]'::jsonb)
      from (select * from stale order by stale.updated limit 500) s left join auth.users u on u.id = s.user_id) else null end
  ) into out;
  if names then
    perform public.eab_admin_write_access('search', null, 'dashboard: stale listings ' || sd || ' days',
              jsonb_build_object('results', jsonb_array_length(out->'stale')), p_device);
  end if;
  return out;
end $$;

-- =====================================================================================================
-- features 6, 62 — Feature Usage & User Activity (counts for everyone)
--   Ranking of screens / features / Google calls in the period; "not used" = seen before but not in the period;
--   day x hour heatmap (Malaysia time; detail events only, so the last 365 days).
-- =====================================================================================================
create or replace function public.eab_admin_dash_usage(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare today date := public.eab_dash_today(); f date := coalesce(p_from, today - 29); t date := coalesce(p_to, today);
        df date := public.eab_dash_detail_from();
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  perform public.eab_dash_check_range(f, t);
  return (
    with raw as (select e.* from public.eab_usage_events e
                  where e.at >= public.eab_dash_ts(greatest(f, df)) and e.at < public.eab_dash_ts(t + 1) and e.kind <> 'metric'),
    src as (select raw.kind, raw.name, raw.user_id, 1::bigint n, (case when raw.ok then 0 else 1 end)::bigint fl from raw
            union all
            select d.kind, d.name, d.user_id, d.calls, d.failures from public.eab_usage_daily d
             where d.day between f and least(t, df - 1) and d.kind <> 'metric'),
    rank as (select src.kind, src.name, sum(src.n) events, count(distinct src.user_id) agents, sum(src.fl) failures from src group by 1, 2),
    seen as (select distinct e.kind, e.name from public.eab_usage_events e where e.kind in ('screen', 'feature')
             union select distinct d.kind, d.name from public.eab_usage_daily d where d.kind in ('screen', 'feature'))
    select jsonb_build_object(
      'from', f, 'to', t, 'detail_from', df,
      'ranking', (select coalesce(jsonb_agg(jsonb_build_object('kind', r.kind, 'name', r.name, 'events', r.events, 'agents', r.agents,
                    'failures', r.failures) order by r.events desc, r.name), '[]'::jsonb) from rank r),
      'not_used', (select coalesce(jsonb_agg(jsonb_build_object('kind', s.kind, 'name', s.name) order by s.kind, s.name), '[]'::jsonb)
        from seen s where not exists (select 1 from rank r where r.kind = s.kind and r.name = s.name)),
      'heatmap', (select coalesce(jsonb_agg(jsonb_build_object('dow', h.dow, 'hour', h.hr, 'events', h.n) order by h.dow, h.hr), '[]'::jsonb)
        from (select extract(isodow from raw.at at time zone 'Asia/Kuala_Lumpur')::int dow,
                     extract(hour from raw.at at time zone 'Asia/Kuala_Lumpur')::int hr, count(*) n
                from raw where raw.kind in ('screen', 'feature') group by 1, 2) h),
      'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', x.d, 'events', x.n, 'agents', x.a) order by x.d), '[]'::jsonb)
        from (select (raw.at at time zone 'Asia/Kuala_Lumpur')::date d, count(*) n, count(distinct raw.user_id) a
                from raw where raw.kind in ('screen', 'feature') group by 1) x)));
end $$;

-- Drill-down: the individual events behind one line of the ranking (owner, admin, compliance; access log).
create or replace function public.eab_admin_dash_events(p_kind text, p_name text, p_from date default null, p_to date default null,
                                                        p_limit integer default 200, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare today date := public.eab_dash_today(); f date := coalesce(p_from, today - 29); t date := coalesce(p_to, today); out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  perform public.eab_dash_check_range(f, t);
  if coalesce(btrim(p_kind), '') = '' or coalesce(btrim(p_name), '') = '' then raise exception 'kind and name needed' using errcode = '22023'; end if;
  select jsonb_build_object(
    'kind', p_kind, 'name', p_name, 'from', f, 'to', t,
    'total', (select count(*) from public.eab_usage_events e where e.kind = p_kind and e.name = p_name
               and e.at >= public.eab_dash_ts(f) and e.at < public.eab_dash_ts(t + 1)),
    'events', (select coalesce(jsonb_agg(jsonb_build_object(
        'at', x.at, 'user_id', x.user_id, 'email', u.email, 'name', public.eab_admin_name(u), 'screen', x.screen, 'ok', x.ok,
        'n', x.n, 'value', x.value, 'app_version', x.app_version, 'platform', x.platform, 'device', x.device) order by x.at desc), '[]'::jsonb)
      from (select * from public.eab_usage_events e where e.kind = p_kind and e.name = p_name
               and e.at >= public.eab_dash_ts(f) and e.at < public.eab_dash_ts(t + 1)
             order by e.at desc limit least(greatest(coalesce(p_limit, 200), 1), 1000)) x
      left join auth.users u on u.id = x.user_id)
  ) into out;
  perform public.eab_admin_write_access('search', null, 'dashboard: events ' || left(p_kind, 20) || ' / ' || left(p_name, 60),
            jsonb_build_object('results', jsonb_array_length(out->'events')), p_device);
  return out;
end $$;

-- =====================================================================================================
-- permissions
-- =====================================================================================================
revoke all on function public.eab_dash_today(), public.eab_dash_ts(date), public.eab_dash_check_range(date, date),
  public.eab_dash_names(), public.eab_dash_activity(date, date), public.eab_dash_detail_from(),
  public.eab_dash_status_key(jsonb) from public, anon, authenticated;
revoke all on function public.eab_admin_dash_growth(date, date, text), public.eab_admin_dash_active(date, date),
  public.eab_admin_dash_retention(date, date, text), public.eab_admin_dash_inactive(integer, text),
  public.eab_admin_dash_devices(date, date, text, text), public.eab_admin_dash_listings(date, date, integer, text),
  public.eab_admin_dash_usage(date, date), public.eab_admin_dash_events(text, text, date, date, integer, text) from public, anon;
grant execute on function public.eab_admin_dash_growth(date, date, text), public.eab_admin_dash_active(date, date),
  public.eab_admin_dash_retention(date, date, text), public.eab_admin_dash_inactive(integer, text),
  public.eab_admin_dash_devices(date, date, text, text), public.eab_admin_dash_listings(date, date, integer, text),
  public.eab_admin_dash_usage(date, date), public.eab_admin_dash_events(text, text, date, date, integer, text) to authenticated;

-- NOTE (22 Oct 2026): applied to EAB-QA-Test in 3 parts (admin_batch_005_p1_helpers_growth_active,
-- p2_retention_inactive_devices, p3_listings_usage_permissions). Production untouched.
-- Tests: supabase/tests/admin_batch_005_test.sql — 29 passed, 0 failed (rolled back).
