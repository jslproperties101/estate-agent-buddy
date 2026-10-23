-- AdminBatch009 — Listings & market for Admin EAB (features 102, 103, 104, 105, 107, 108, 109, 110).
-- Plan: /Admin EAB/JoyChange004-Admin-Part10-AdminBatch009.txt (approved by Joe 23 Oct 2026; stuck = 30 days).
-- Builds on AdminBatch001-008 (uses the AdminBatch005 helpers eab_dash_*). TEST project first; never production
-- without Joe's approval. Rollback: supabase/rollback/20261027000000_admin_batch_009_market_rollback.sql
-- Additive only: NEW FUNCTIONS ONLY, all read-only. No table is created or changed. Nothing in the main app changes.
--
-- In plain words:
--   * Listings, deals and enquiries come from eab_records (collections properties / deals / inquiries); news and
--     projects from eab_feed_items, eab_feed_reads, eab_feed_code_grants and the audience groups.
--   * The main app does NOT record old prices, a separate final price, buyer requirements, the date a Booked stage
--     started, or project enquiries. So: days on market uses the listing date; asking vs final uses deals linked to a
--     listing; demand = enquiries; "stuck" = no change to the listing for N days; projects show opens and codes only.
--   * Viewer gets totals and charts only. Lists that name agents are for Owner / Admin / Compliance, and every list
--     returned is written to the admin access log. Exports use the existing eab_admin_export (Owner + Compliance).
do $chk$
begin
  if to_regprocedure('public.eab_dash_check_range(date, date)') is null or to_regclass('public.eab_feed_items') is null then
    raise exception 'apply AdminBatch005 and the main-app feed tables (MainForAdmin-D) first';
  end if;
end $chk$;

-- =====================================================================================================
-- internal helpers (not callable by apps)
-- =====================================================================================================
-- A number stored as a JSON number or a numeric string; anything else is null.
create or replace function public.eab_mkt_num(p jsonb) returns numeric
language sql immutable set search_path = pg_catalog as $$
  select case jsonb_typeof(p)
    when 'number' then (p #>> '{}')::numeric
    when 'string' then case when btrim(p #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$' then btrim(p #>> '{}')::numeric end
  end
$$;

-- A time stored as milliseconds since 1970 (the main app's created / updated).
create or replace function public.eab_mkt_ms(p jsonb) returns timestamptz
language sql immutable set search_path = pg_catalog as $$
  select case when public.eab_mkt_num(p) > 0 then to_timestamp(public.eab_mkt_num(p) / 1000) end
$$;

-- Listing quality score out of 100 and what is missing. The app has the same rule (src/admin/market.ts).
--   photos 30 (5 or more = 30, 1-4 = 15) · price 15 · title type 10 · tenure 10 · size 10
--   rooms 10 (land and commercial lots get it free) · location 15 (state + city 10, map pin 5)
create or replace function public.eab_mkt_score(d jsonb) returns jsonb
language sql immutable set search_path = public, pg_catalog as $$
  with f as (select
      case when jsonb_typeof(d->'photos') = 'array' then jsonb_array_length(d->'photos') else 0 end photos,
      coalesce(public.eab_mkt_num(d->'askingPrice'), 0) > 0 or coalesce(public.eab_mkt_num(d->'monthlyRent'), 0) > 0 price,
      coalesce(btrim(d->>'titleType'), '') <> '' title,
      coalesce(btrim(d->>'tenure'), '') <> '' tenure,
      coalesce(public.eab_mkt_num(d->'landSqft'), 0) > 0 or coalesce(public.eab_mkt_num(d->'builtUpSqft'), 0) > 0 size,
      coalesce(public.eab_mkt_num(d->'bedrooms'), 0) > 0 or coalesce(public.eab_mkt_num(d->'bathrooms'), 0) > 0
        or coalesce(d->>'type', '') ~* '(land|commercial|industrial|agricultur|factory|warehouse|shop|office)' rooms,
      coalesce(btrim(d->>'state'), '') <> '' and coalesce(btrim(d->>'city'), '') <> '' place,
      public.eab_mkt_num(d->'lat') is not null and public.eab_mkt_num(d->'lng') is not null pin)
  select jsonb_build_object(
    'score', (case when photos >= 5 then 30 when photos >= 1 then 15 else 0 end)
           + (case when price then 15 else 0 end) + (case when title then 10 else 0 end) + (case when tenure then 10 else 0 end)
           + (case when size then 10 else 0 end) + (case when rooms then 10 else 0 end)
           + (case when place then 10 else 0 end) + (case when pin then 5 else 0 end),
    'photos', photos,
    'missing', to_jsonb(array_remove(array[
        case when photos = 0 then 'photos' when photos < 5 then 'more_photos' end,
        case when not price then 'price' end, case when not title then 'title_type' end, case when not tenure then 'tenure' end,
        case when not size then 'size' end, case when not rooms then 'rooms' end,
        case when not place then 'location' end, case when not pin then 'map_pin' end], null)))
  from f
$$;

-- Where a listing is: state and city, "Not set" when empty.
create or replace function public.eab_mkt_state(d jsonb) returns text
language sql immutable set search_path = pg_catalog as $$ select coalesce(nullif(btrim(d->>'state'), ''), 'Not set') $$;
create or replace function public.eab_mkt_city(d jsonb) returns text
language sql immutable set search_path = pg_catalog as $$ select coalesce(nullif(btrim(d->>'city'), ''), 'Not set') $$;

-- Is the listing on the market (not sold, rented or withdrawn)?
create or replace function public.eab_mkt_open(d jsonb) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select coalesce(d->>'status', '') not in ('sold', 'rented', 'rented_pending_ta', 'off_market')
$$;

-- A deal's commission (typed, or price × rate) and the agent's share of it — the same rule as the main app.
create or replace function public.eab_mkt_commission(d jsonb) returns numeric
language sql immutable set search_path = public, pg_catalog as $$
  select round(coalesce(nullif(public.eab_mkt_num(d->'commission'), 0),
                        public.eab_mkt_num(d->'value') * public.eab_mkt_num(d->'commissionPct') / 100, 0), 2)
$$;

-- Malaysia date from an enquiry ('at' is a local "YYYY-MM-DDTHH:MM"; older ones only have 'created').
create or replace function public.eab_mkt_inq_day(d jsonb) returns date
language sql immutable set search_path = public, pg_catalog as $$
  select case when coalesce(d->>'at', '') ~ '^\d{4}-\d{2}-\d{2}' then left(d->>'at', 10)::date
              else (public.eab_mkt_ms(d->'created') at time zone 'Asia/Kuala_Lumpur')::date end
$$;

-- Days between two times, whole days.
create or replace function public.eab_mkt_days(a timestamptz, b timestamptz) returns integer
language sql immutable set search_path = pg_catalog as $$ select floor(extract(epoch from b - a) / 86400)::int $$;

-- Median of a set of numbers (null when empty).
create or replace function public.eab_mkt_median(p numeric[]) returns numeric
language sql immutable set search_path = pg_catalog as $$
  select percentile_cont(0.5) within group (order by x)::numeric from unnest(p) x where x is not null
$$;

-- =====================================================================================================
-- 102 — Listing quality score. Counts for everyone; the "needs work" LIST for owner / admin / compliance.
-- =====================================================================================================
create or replace function public.eab_admin_market_quality(p_below integer default 80, p_limit integer default 500, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare names boolean; b integer := coalesce(p_below, 80); out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  if b < 1 or b > 100 then raise exception 'below must be 1 to 100' using errcode = '22023'; end if;
  names := public.eab_dash_names();
  with l as (select r.user_id, r.id, r.data, r.updated, public.eab_mkt_score(r.data) q
               from public.eab_records r
              where r.collection = 'properties' and not r.deleted and public.eab_mkt_open(r.data)),
  m as (select x.k, count(*) n from l, jsonb_array_elements_text(l.q->'missing') x(k) group by x.k),
  weak as (select * from l where (l.q->>'score')::int < b)
  select jsonb_build_object(
    'listings', (select count(*) from l),
    'average', (select round(avg((l.q->>'score')::int), 1) from l),
    'bands', jsonb_build_object(
      'good', (select count(*) from l where (l.q->>'score')::int >= 80),
      'fair', (select count(*) from l where (l.q->>'score')::int between 50 and 79),
      'poor', (select count(*) from l where (l.q->>'score')::int < 50)),
    'missing', coalesce((select jsonb_object_agg(m.k, m.n) from m), '{}'::jsonb),
    'by_state', (select coalesce(jsonb_agg(jsonb_build_object('state', s.k, 'listings', s.n, 'average', s.a) order by s.n desc, s.k), '[]'::jsonb)
      from (select public.eab_mkt_state(l.data) k, count(*) n, round(avg((l.q->>'score')::int), 1) a from l group by 1) s),
    'below', b, 'weak_count', (select count(*) from weak), 'names_hidden', not names,
    'weak', case when names then (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', w.user_id, 'email', u.email, 'name', public.eab_admin_name(u), 'id', w.id,
        'ref', coalesce(w.data->>'ref', w.data->>'refNo'), 'headline', w.data->>'headline', 'type', w.data->>'type',
        'state', w.data->>'state', 'city', w.data->>'city', 'status', public.eab_dash_status_key(w.data),
        'score', (w.q->>'score')::int, 'photos', (w.q->>'photos')::int, 'missing', w.q->'missing',
        'updated_at', to_timestamp(w.updated / 1000.0)) order by (w.q->>'score')::int, w.updated), '[]'::jsonb)
      from (select * from weak order by (weak.q->>'score')::int, weak.updated
             limit least(greatest(coalesce(p_limit, 500), 1), 2000)) w left join auth.users u on u.id = w.user_id) else null end
  ) into out;
  if names then
    perform public.eab_admin_write_access('search', null, 'market: listings needing work (score below ' || b || ')',
              jsonb_build_object('results', jsonb_array_length(out->'weak')), p_device);
  end if;
  return out;
end $$;

-- =====================================================================================================
-- 103 — Days on market by area (counts only).
--   On the market now: days since the listing was created. Closed in the period (Sold / Rented, last change in the
--   period): days from created to that last change — an estimate, because the app does not record the sale date.
-- =====================================================================================================
create or replace function public.eab_admin_market_dom(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare today date := public.eab_dash_today(); f date := coalesce(p_from, today - 364); t date := coalesce(p_to, today);
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  perform public.eab_dash_check_range(f, t);
  return (
    with p as (select r.data d, public.eab_mkt_ms(r.data->'created') c, to_timestamp(r.updated / 1000.0) u
                 from public.eab_records r where r.collection = 'properties' and not r.deleted),
    onm as (select p.*, public.eab_mkt_days(p.c, now()) days from p
             where p.c is not null and coalesce(p.d->>'status', '') in ('', 'available', 'needs_check')),
    closed as (select p.*, greatest(public.eab_mkt_days(p.c, p.u), 0) days from p
                where p.c is not null and p.d->>'status' in ('sold', 'rented', 'rented_pending_ta')
                  and p.u >= public.eab_dash_ts(f) and p.u < public.eab_dash_ts(t + 1)),
    grp as (select 'state' lvl, public.eab_mkt_state(d) k, null::text parent, days, 'open' w from onm
            union all select 'city', public.eab_mkt_city(d), public.eab_mkt_state(d), days, 'open' from onm
            union all select 'type', coalesce(nullif(btrim(d->>'type'), ''), 'Not set'), null, days, 'open' from onm
            union all select 'state', public.eab_mkt_state(d), null, days, 'closed' from closed
            union all select 'city', public.eab_mkt_city(d), public.eab_mkt_state(d), days, 'closed' from closed
            union all select 'type', coalesce(nullif(btrim(d->>'type'), ''), 'Not set'), null, days, 'closed' from closed),
    agg as (select lvl, k, parent,
                   count(*) filter (where w = 'open') open_n,
                   public.eab_mkt_median(array_agg(days::numeric) filter (where w = 'open')) open_median,
                   round(avg(days) filter (where w = 'open'), 1) open_avg,
                   max(days) filter (where w = 'open') open_max,
                   count(*) filter (where w = 'closed') closed_n,
                   public.eab_mkt_median(array_agg(days::numeric) filter (where w = 'closed')) closed_median
              from grp group by lvl, k, parent)
    select jsonb_build_object(
      'from', f, 'to', t,
      'open', jsonb_build_object('listings', (select count(*) from onm),
                'median', (select public.eab_mkt_median(array_agg(days::numeric)) from onm), 'average', (select round(avg(days), 1) from onm),
                'buckets', jsonb_build_object(
                   'under_30', (select count(*) from onm where days < 30), 'd30_89', (select count(*) from onm where days between 30 and 89),
                   'd90_179', (select count(*) from onm where days between 90 and 179), 'd180_plus', (select count(*) from onm where days >= 180))),
      'closed', jsonb_build_object('listings', (select count(*) from closed), 'median', (select public.eab_mkt_median(array_agg(days::numeric)) from closed)),
      'no_date', (select count(*) from p where p.c is null),
      'by_state', (select coalesce(jsonb_agg(jsonb_build_object('state', a.k, 'open', a.open_n, 'median', a.open_median, 'average', a.open_avg,
                     'oldest', a.open_max, 'closed', a.closed_n, 'closed_median', a.closed_median) order by a.open_n desc, a.k), '[]'::jsonb) from agg a where a.lvl = 'state'),
      'by_city', (select coalesce(jsonb_agg(jsonb_build_object('state', a.parent, 'city', a.k, 'open', a.open_n, 'median', a.open_median, 'average', a.open_avg,
                     'oldest', a.open_max, 'closed', a.closed_n, 'closed_median', a.closed_median) order by a.open_n desc, a.k), '[]'::jsonb) from agg a where a.lvl = 'city'),
      'by_type', (select coalesce(jsonb_agg(jsonb_build_object('type', a.k, 'open', a.open_n, 'median', a.open_median, 'average', a.open_avg,
                     'oldest', a.open_max, 'closed', a.closed_n, 'closed_median', a.closed_median) order by a.open_n desc, a.k), '[]'::jsonb) from agg a where a.lvl = 'type')));
end $$;

-- =====================================================================================================
-- 104 — Asking vs final price: deals linked to a listing (deal value vs the listing's asking price or rent).
--   Counts for everyone; the deal LIST for owner / admin / compliance.
-- =====================================================================================================
create or replace function public.eab_admin_market_price(p_from date default null, p_to date default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare today date := public.eab_dash_today(); f date := coalesce(p_from, today - 364); t date := coalesce(p_to, today);
        names boolean; out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  perform public.eab_dash_check_range(f, t);
  names := public.eab_dash_names();
  with dl as (select r.user_id, r.id, r.data d from public.eab_records r
               where r.collection = 'deals' and not r.deleted and coalesce(r.data->>'date', '') ~ '^\d{4}-\d{2}-\d{2}'
                 and left(r.data->>'date', 10)::date between f and t),
  j as (select dl.user_id, dl.id, dl.d, p.data pd,
               coalesce(dl.d->>'side', 'sale') side,
               public.eab_mkt_num(dl.d->'value') final,
               case when coalesce(dl.d->>'side', 'sale') = 'rent' then public.eab_mkt_num(p.data->'monthlyRent')
                    else public.eab_mkt_num(p.data->'askingPrice') end asking
          from dl left join public.eab_records p
            on p.collection = 'properties' and p.user_id = dl.user_id and p.id = dl.d->>'propertyId'),
  ok as (select j.*, round(100 * (j.final - j.asking) / j.asking, 2) pct from j where j.pd is not null and j.asking > 0 and j.final > 0)
  select jsonb_build_object(
    'from', f, 'to', t,
    'deals', (select count(*) from j), 'compared', (select count(*) from ok),
    'not_linked', (select count(*) from j where j.pd is null),
    'no_price', (select count(*) from j where j.pd is not null and not (coalesce(j.asking, 0) > 0 and coalesce(j.final, 0) > 0)),
    'average_pct', (select round(avg(ok.pct), 2) from ok), 'median_pct', (select round(public.eab_mkt_median(array_agg(ok.pct)), 2) from ok),
    'below', (select count(*) from ok where ok.pct < 0), 'at', (select count(*) from ok where ok.pct = 0), 'above', (select count(*) from ok where ok.pct > 0),
    'by_side', (select coalesce(jsonb_agg(jsonb_build_object('side', x.side, 'deals', x.n, 'average_pct', x.a, 'median_pct', x.m) order by x.side), '[]'::jsonb)
      from (select ok.side, count(*) n, round(avg(ok.pct), 2) a, round(public.eab_mkt_median(array_agg(ok.pct)), 2) m from ok group by 1) x),
    'by_state', (select coalesce(jsonb_agg(jsonb_build_object('state', x.k, 'deals', x.n, 'average_pct', x.a, 'median_pct', x.m) order by x.n desc, x.k), '[]'::jsonb)
      from (select public.eab_mkt_state(ok.pd) k, count(*) n, round(avg(ok.pct), 2) a, round(public.eab_mkt_median(array_agg(ok.pct)), 2) m from ok group by 1) x),
    'by_type', (select coalesce(jsonb_agg(jsonb_build_object('type', x.k, 'deals', x.n, 'average_pct', x.a, 'median_pct', x.m) order by x.n desc, x.k), '[]'::jsonb)
      from (select coalesce(nullif(btrim(ok.pd->>'type'), ''), 'Not set') k, count(*) n, round(avg(ok.pct), 2) a, round(public.eab_mkt_median(array_agg(ok.pct)), 2) m from ok group by 1) x),
    'names_hidden', not names,
    'list', case when names then (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', ok.user_id, 'email', u.email, 'name', public.eab_admin_name(u), 'deal_id', ok.id, 'date', left(ok.d->>'date', 10),
        'side', ok.side, 'ref', coalesce(ok.pd->>'ref', ok.pd->>'refNo'), 'headline', ok.pd->>'headline', 'type', ok.pd->>'type',
        'state', ok.pd->>'state', 'city', ok.pd->>'city', 'asking', ok.asking, 'final', ok.final, 'pct', ok.pct)
        order by left(ok.d->>'date', 10) desc, ok.id), '[]'::jsonb)
      from (select * from ok order by left(ok.d->>'date', 10) desc limit 1000) ok left join auth.users u on u.id = ok.user_id) else null end
  ) into out;
  if names then
    perform public.eab_admin_write_access('search', null, 'market: asking vs final price ' || f || ' to ' || t,
              jsonb_build_object('results', jsonb_array_length(out->'list')), p_device);
  end if;
  return out;
end $$;

-- =====================================================================================================
-- 105 — Hot areas: supply (listings on the market, new listings) and demand (enquiries) per state and city.
--   Counts only. Enquiries not linked to a listing are counted apart.
-- =====================================================================================================
create or replace function public.eab_admin_market_areas(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare today date := public.eab_dash_today(); f date := coalesce(p_from, today - 89); t date := coalesce(p_to, today);
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  perform public.eab_dash_check_range(f, t);
  return (
    with p as (select r.user_id, r.id, r.data d, public.eab_mkt_ms(r.data->'created') c, to_timestamp(r.updated / 1000.0) u
                 from public.eab_records r where r.collection = 'properties' and not r.deleted),
    q as (select i.user_id, i.data d, public.eab_mkt_inq_day(i.data) as day from public.eab_records i
           where i.collection = 'inquiries' and not i.deleted),
    qin as (select q.*, p.d pd from q left join p on p.user_id = q.user_id and p.id = q.d->>'propertyId'
             where q.day between f and t),
    rw as (
      select public.eab_mkt_state(d) st, public.eab_mkt_city(d) ci,
             (public.eab_mkt_open(d))::int on_market,
             (p.c >= public.eab_dash_ts(f) and p.c < public.eab_dash_ts(t + 1))::int new_l,
             (d->>'status' in ('sold', 'rented', 'rented_pending_ta') and p.u >= public.eab_dash_ts(f) and p.u < public.eab_dash_ts(t + 1))::int closed,
             0 enq
        from p
      union all
      select public.eab_mkt_state(qin.pd), public.eab_mkt_city(qin.pd), 0, 0, 0, 1 from qin where qin.pd is not null),
    city as (select st, ci, sum(on_market) on_market, coalesce(sum(new_l), 0) new_l, coalesce(sum(closed), 0) closed, sum(enq) enq
               from rw group by st, ci),
    sta as (select st, sum(on_market) on_market, sum(new_l) new_l, sum(closed) closed, sum(enq) enq from city group by st),
    mx as (select greatest(max(on_market), 1) s, greatest(max(enq), 1) e from city)
    select jsonb_build_object(
      'from', f, 'to', t,
      'on_market', (select coalesce(sum(on_market), 0) from sta), 'new', (select coalesce(sum(new_l), 0) from sta),
      'closed', (select coalesce(sum(closed), 0) from sta), 'enquiries', (select count(*) from qin),
      'enquiries_unlinked', (select count(*) from qin where qin.pd is null),
      'by_state', (select coalesce(jsonb_agg(jsonb_build_object('state', s.st, 'on_market', s.on_market, 'new', s.new_l, 'closed', s.closed,
                     'enquiries', s.enq, 'per_listing', round(s.enq::numeric / nullif(s.on_market, 0), 2)) order by s.enq desc, s.on_market desc, s.st), '[]'::jsonb) from sta s),
      'by_city', (select coalesce(jsonb_agg(jsonb_build_object('state', c.st, 'city', c.ci, 'on_market', c.on_market, 'new', c.new_l, 'closed', c.closed,
                     'enquiries', c.enq, 'per_listing', round(c.enq::numeric / nullif(c.on_market, 0), 2),
                     'supply_level', round(c.on_market::numeric / mx.s, 2), 'demand_level', round(c.enq::numeric / mx.e, 2))
                     order by c.enq desc, c.on_market desc, c.st, c.ci), '[]'::jsonb) from city c, mx)));
end $$;

-- =====================================================================================================
-- 107 — Stuck deals: Booked listings (every stage before SPA signed) with no change for N days (Joe: 30).
--   Counts for everyone; the LIST for owner / admin / compliance.
-- =====================================================================================================
create or replace function public.eab_admin_market_stuck(p_days integer default 30, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare d integer := coalesce(p_days, 30); names boolean; out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  if d < 7 or d > 365 then raise exception 'days must be 7 to 365' using errcode = '22023'; end if;
  names := public.eab_dash_names();
  with b as (select r.user_id, r.id, r.data, r.updated, public.eab_dash_status_key(r.data) k,
                    public.eab_mkt_days(to_timestamp(r.updated / 1000.0), now()) idle
               from public.eab_records r
              where r.collection = 'properties' and not r.deleted and r.data->>'status' = 'in_progress'
                and coalesce(r.data->>'bookedStage', '') <> 'spa_signed'),
  s as (select * from b where b.idle >= d)
  select jsonb_build_object(
    'days', d, 'booked', (select count(*) from b), 'stuck_count', (select count(*) from s),
    'by_stage', (select coalesce(jsonb_agg(jsonb_build_object('stage', x.k, 'booked', x.n, 'stuck', x.st, 'oldest', x.mx) order by x.k), '[]'::jsonb)
      from (select b.k, count(*) n, count(*) filter (where b.idle >= d) st, max(b.idle) mx from b group by b.k) x),
    'names_hidden', not names,
    'list', case when names then (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', s.user_id, 'email', u.email, 'name', public.eab_admin_name(u), 'id', s.id,
        'ref', coalesce(s.data->>'ref', s.data->>'refNo'), 'headline', s.data->>'headline', 'type', s.data->>'type',
        'state', s.data->>'state', 'city', s.data->>'city', 'stage', s.k, 'asking', public.eab_mkt_num(s.data->'askingPrice'),
        'updated_at', to_timestamp(s.updated / 1000.0), 'days', s.idle) order by s.idle desc, s.id), '[]'::jsonb)
      from (select * from s order by s.idle desc limit 1000) s left join auth.users u on u.id = s.user_id) else null end
  ) into out;
  if names then
    perform public.eab_admin_write_access('search', null, 'market: stuck deals ' || d || ' days',
              jsonb_build_object('results', jsonb_array_length(out->'list')), p_device);
  end if;
  return out;
end $$;

-- =====================================================================================================
-- 108 — Commission forecast. Open deals (Estimated, Confirmed) by month of the deal date and by stage; Received in the
--   period. Commission = typed amount, or price × rate. "Agents' share" = commission × the agent's share %.
--   Totals for everyone; the per-agent LIST for owner / admin / compliance.
-- =====================================================================================================
create or replace function public.eab_admin_market_commission(p_from date default null, p_to date default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare today date := public.eab_dash_today(); f date := coalesce(p_from, today - 364); t date := coalesce(p_to, today);
        names boolean; out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  perform public.eab_dash_check_range(f, t);
  names := public.eab_dash_names();
  with dl as (select r.user_id, r.id, r.data d, coalesce(r.data->>'status', 'estimated') st, coalesce(r.data->>'side', 'sale') side,
                     case when coalesce(r.data->>'date', '') ~ '^\d{4}-\d{2}-\d{2}' then left(r.data->>'date', 10)::date end as day,
                     public.eab_mkt_commission(r.data) com,
                     round(public.eab_mkt_commission(r.data) * coalesce(public.eab_mkt_num(r.data->'sharePct'), 100) / 100, 2) mine,
                     coalesce(public.eab_mkt_num(r.data->'value'), 0) val
                from public.eab_records r where r.collection = 'deals' and not r.deleted),
  j as (select dl.*, case when p.data is null then 'not_linked' else public.eab_dash_status_key(p.data) end stage
          from dl left join public.eab_records p on p.collection = 'properties' and p.user_id = dl.user_id and p.id = dl.d->>'propertyId'),
  op as (select * from j where j.st in ('estimated', 'confirmed')),
  rc as (select * from j where j.st = 'received' and j.day between f and t)
  select jsonb_build_object(
    'from', f, 'to', t,
    'open', jsonb_build_object('deals', (select count(*) from op), 'value', (select coalesce(sum(val), 0) from op),
              'commission', (select coalesce(sum(com), 0) from op), 'agents_share', (select coalesce(sum(mine), 0) from op),
              'estimated', (select coalesce(sum(com), 0) from op where st = 'estimated'), 'confirmed', (select coalesce(sum(com), 0) from op where st = 'confirmed'),
              'overdue', (select count(*) from op where day < today), 'no_date', (select count(*) from op where day is null)),
    'received', jsonb_build_object('deals', (select count(*) from rc), 'commission', (select coalesce(sum(com), 0) from rc),
              'agents_share', (select coalesce(sum(mine), 0) from rc)),
    'by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', x.m, 'deals', x.n, 'estimated', x.e, 'confirmed', x.c, 'commission', x.s) order by x.m), '[]'::jsonb)
      from (select to_char(day, 'YYYY-MM') m, count(*) n, coalesce(sum(com) filter (where st = 'estimated'), 0) e,
                   coalesce(sum(com) filter (where st = 'confirmed'), 0) c, sum(com) s from op where day is not null group by 1) x),
    'by_side', (select coalesce(jsonb_agg(jsonb_build_object('side', x.side, 'deals', x.n, 'value', x.v, 'commission', x.s) order by x.side), '[]'::jsonb)
      from (select side, count(*) n, sum(val) v, sum(com) s from op group by 1) x),
    'by_stage', (select coalesce(jsonb_agg(jsonb_build_object('stage', x.stage, 'deals', x.n, 'commission', x.s) order by x.s desc, x.stage), '[]'::jsonb)
      from (select stage, count(*) n, sum(com) s from op group by 1) x),
    'names_hidden', not names,
    'agents', case when names then (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', a.user_id, 'email', u.email, 'name', public.eab_admin_name(u), 'deals', a.n, 'commission', a.s, 'agents_share', a.mine,
        'next_date', a.nd) order by a.s desc, a.user_id), '[]'::jsonb)
      from (select op.user_id, count(*) n, sum(com) s, sum(mine) mine, min(day) filter (where day >= today) nd from op group by 1 order by 3 desc limit 500) a
      left join auth.users u on u.id = a.user_id) else null end
  ) into out;
  if names then
    perform public.eab_admin_write_access('search', null, 'market: commission forecast by agent',
              jsonb_build_object('results', jsonb_array_length(out->'agents')), p_device);
  end if;
  return out;
end $$;

-- =====================================================================================================
-- reach: which agents could see a news post or project (audience "all", one of its groups, or an invitation code).
-- Uses each agent's CURRENT groups, so a post's reach is today's audience (the app does not keep who saw it when).
-- =====================================================================================================
create or replace function public.eab_mkt_reach(p_items uuid[])
returns table (item_id uuid, user_id uuid)
language sql stable security definer set search_path = public, auth as $$
  with mg as (select u.id user_id, g.group_id from auth.users u cross join lateral public.eab_my_groups(u.id) g)
  select i.id, u.id from public.eab_feed_items i cross join auth.users u
   where i.id = any (p_items) and i.audience = 'all'
  union
  select t.item_id, mg.user_id from public.eab_feed_targets t join mg on mg.group_id = t.group_id
   join public.eab_feed_items i on i.id = t.item_id where t.item_id = any (p_items) and i.audience = 'groups'
  union
  select c.item_id, c.user_id from public.eab_feed_code_grants c where c.item_id = any (p_items)
$$;

-- =====================================================================================================
-- 109 — Project performance: opens and invitation-code redemptions per pushed project (counts only).
-- =====================================================================================================
create or replace function public.eab_admin_market_projects(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare today date := public.eab_dash_today(); f date := coalesce(p_from, today - 89); t date := coalesce(p_to, today);
        ids uuid[];
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  perform public.eab_dash_check_range(f, t);
  select coalesce(array_agg(i.id), '{}') into ids from (select i.id from public.eab_feed_items i
    where i.kind = 'project' and i.status <> 'draft' and coalesce(i.published_at, i.created_at) < public.eab_dash_ts(t + 1)
      and (i.expires_at is null or i.expires_at >= public.eab_dash_ts(f))
    order by coalesce(i.published_at, i.created_at) desc limit 300) i;
  return (
    with reach as (select * from public.eab_mkt_reach(ids)),
    rd as (select r.item_id, r.user_id, r.opened_at from public.eab_feed_reads r
            where r.item_id = any (ids) and r.opened_at >= public.eab_dash_ts(f) and r.opened_at < public.eab_dash_ts(t + 1)),
    gr as (select g.item_id, g.user_id, g.code from public.eab_feed_code_grants g
            where g.item_id = any (ids) and g.granted_at >= public.eab_dash_ts(f) and g.granted_at < public.eab_dash_ts(t + 1)),
    per as (select i.id, i.title_en, i.status, coalesce(i.published_at, i.created_at) as pub_at, i.expires_at, i.audience,
                   i.project->>'developer' developer,
                   (select count(*) from reach where reach.item_id = i.id) reached,
                   (select count(distinct rd.user_id) from rd where rd.item_id = i.id) opened,
                   (select count(*) from gr where gr.item_id = i.id) redeemed,
                   (select count(distinct gr.code) from gr where gr.item_id = i.id) codes
              from public.eab_feed_items i where i.id = any (ids))
    select jsonb_build_object(
      'from', f, 'to', t, 'projects', (select count(*) from per),
      'reached', (select coalesce(sum(reached), 0) from per), 'opened', (select coalesce(sum(opened), 0) from per),
      'redeemed', (select coalesce(sum(redeemed), 0) from per),
      'list', (select coalesce(jsonb_agg(jsonb_build_object('id', per.id, 'title', per.title_en, 'developer', per.developer, 'status', per.status,
                 'published_at', per.pub_at, 'expires_at', per.expires_at, 'audience', per.audience, 'reached', per.reached, 'opened', per.opened,
                 'open_pct', round(100.0 * per.opened / nullif(per.reached, 0), 1), 'redeemed', per.redeemed, 'codes', per.codes)
                 order by per.opened desc, per.pub_at desc), '[]'::jsonb) from per),
      'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', x.d, 'opened', x.o, 'redeemed', x.g) order by x.d), '[]'::jsonb)
        from (select d, sum(o) o, sum(g) g from (
                select (rd.opened_at at time zone 'Asia/Kuala_Lumpur')::date d, 1 o, 0 g from rd
                union all select (g.granted_at at time zone 'Asia/Kuala_Lumpur')::date, 0, 1 from public.eab_feed_code_grants g
                 where g.item_id = any (ids) and g.granted_at >= public.eab_dash_ts(f) and g.granted_at < public.eab_dash_ts(t + 1)) z group by d) x)));
end $$;

-- =====================================================================================================
-- 110 — Market News engagement: open rate per post, by audience group and by language; day × hour of opens
--   (Malaysia time) and the best times to post. Counts only. Posts published in the period.
-- =====================================================================================================
create or replace function public.eab_admin_market_news(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare today date := public.eab_dash_today(); f date := coalesce(p_from, today - 89); t date := coalesce(p_to, today);
        ids uuid[];
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  perform public.eab_dash_check_range(f, t);
  select coalesce(array_agg(i.id), '{}') into ids from (select i.id from public.eab_feed_items i
    where i.kind = 'news' and i.status <> 'draft' and coalesce(i.published_at, i.created_at) >= public.eab_dash_ts(f)
      and coalesce(i.published_at, i.created_at) < public.eab_dash_ts(t + 1)
    order by coalesce(i.published_at, i.created_at) desc limit 300) i;
  return (
    with reach as (select * from public.eab_mkt_reach(ids)),
    rd as (select r.item_id, r.user_id, r.opened_at from public.eab_feed_reads r where r.item_id = any (ids) and r.opened_at is not null),
    lang as (select u.id user_id, coalesce(nullif(public.eab_agent_facts(u.id)->>'language', ''), 'unknown') lang
               from auth.users u where u.id in (select reach.user_id from reach)),
    mg as (select l.user_id, g.group_id from lang l cross join lateral public.eab_my_groups(l.user_id) g),
    per as (select i.id, i.title_en, coalesce(i.published_at, i.created_at) as pub_at, i.audience, i.push_alert,
                   (select count(*) from reach where reach.item_id = i.id) reached,
                   (select count(distinct rd.user_id) from rd where rd.item_id = i.id) opened,
                   (select round(extract(epoch from percentile_cont(0.5) within group (order by rd.opened_at - coalesce(i.published_at, i.created_at))) / 3600, 1)
                      from rd where rd.item_id = i.id) median_hours
              from public.eab_feed_items i where i.id = any (ids)),
    ro as (select reach.item_id, reach.user_id, exists (select 1 from rd where rd.item_id = reach.item_id and rd.user_id = reach.user_id) op from reach),
    hm as (select extract(isodow from rd.opened_at at time zone 'Asia/Kuala_Lumpur')::int dow,
                  extract(hour from rd.opened_at at time zone 'Asia/Kuala_Lumpur')::int hr, count(*) n from rd group by 1, 2)
    select jsonb_build_object(
      'from', f, 'to', t, 'posts', (select count(*) from per),
      'reached', (select coalesce(sum(reached), 0) from per), 'opened', (select coalesce(sum(opened), 0) from per),
      'open_pct', (select round(100.0 * sum(opened) / nullif(sum(reached), 0), 1) from per),
      'with_alert', (select jsonb_build_object('posts', count(*), 'open_pct', round(100.0 * sum(opened) / nullif(sum(reached), 0), 1)) from per where push_alert),
      'without_alert', (select jsonb_build_object('posts', count(*), 'open_pct', round(100.0 * sum(opened) / nullif(sum(reached), 0), 1)) from per where not push_alert),
      'list', (select coalesce(jsonb_agg(jsonb_build_object('id', per.id, 'title', per.title_en, 'published_at', per.pub_at, 'audience', per.audience,
                 'push_alert', per.push_alert, 'reached', per.reached, 'opened', per.opened,
                 'open_pct', round(100.0 * per.opened / nullif(per.reached, 0), 1), 'median_hours', per.median_hours) order by per.pub_at desc), '[]'::jsonb) from per),
      'by_language', (select coalesce(jsonb_agg(jsonb_build_object('language', x.lang, 'reached', x.r, 'opened', x.o,
                 'open_pct', round(100.0 * x.o / nullif(x.r, 0), 1)) order by x.r desc, x.lang), '[]'::jsonb)
        from (select l.lang, count(*) r, count(*) filter (where ro.op) o from ro join lang l on l.user_id = ro.user_id group by 1) x),
      'by_group', (select coalesce(jsonb_agg(jsonb_build_object('group_id', x.gid, 'group', x.gname, 'priority', x.pr, 'reached', x.r, 'opened', x.o,
                 'open_pct', round(100.0 * x.o / nullif(x.r, 0), 1)) order by x.pr, x.gname), '[]'::jsonb)
        from (select g.id gid, g.name gname, g.priority pr, count(*) r, count(*) filter (where ro.op) o
                from ro join mg on mg.user_id = ro.user_id join public.eab_audience_groups g on g.id = mg.group_id group by 1, 2, 3) x),
      'heatmap', (select coalesce(jsonb_agg(jsonb_build_object('dow', hm.dow, 'hour', hm.hr, 'events', hm.n) order by hm.dow, hm.hr), '[]'::jsonb) from hm),
      'best', (select coalesce(jsonb_agg(jsonb_build_object('dow', b.dow, 'hour', b.hr, 'opens', b.n) order by b.n desc, b.dow, b.hr), '[]'::jsonb)
        from (select * from hm order by hm.n desc, hm.dow, hm.hr limit 3) b)));
end $$;

-- =====================================================================================================
-- permissions
-- =====================================================================================================
revoke all on function public.eab_mkt_num(jsonb), public.eab_mkt_ms(jsonb), public.eab_mkt_score(jsonb), public.eab_mkt_state(jsonb),
  public.eab_mkt_city(jsonb), public.eab_mkt_open(jsonb), public.eab_mkt_commission(jsonb), public.eab_mkt_inq_day(jsonb),
  public.eab_mkt_days(timestamptz, timestamptz), public.eab_mkt_median(numeric[]), public.eab_mkt_reach(uuid[])
  from public, anon, authenticated;
revoke all on function public.eab_admin_market_quality(integer, integer, text), public.eab_admin_market_dom(date, date),
  public.eab_admin_market_price(date, date, text), public.eab_admin_market_areas(date, date), public.eab_admin_market_stuck(integer, text),
  public.eab_admin_market_commission(date, date, text), public.eab_admin_market_projects(date, date), public.eab_admin_market_news(date, date)
  from public, anon;
grant execute on function public.eab_admin_market_quality(integer, integer, text), public.eab_admin_market_dom(date, date),
  public.eab_admin_market_price(date, date, text), public.eab_admin_market_areas(date, date), public.eab_admin_market_stuck(integer, text),
  public.eab_admin_market_commission(date, date, text), public.eab_admin_market_projects(date, date), public.eab_admin_market_news(date, date)
  to authenticated;

-- NOTE (23 Oct 2026): applied to EAB-QA-Test in 6 parts (admin_batch_009_p1_helpers_quality, p2_dom_price, p3_areas,
-- p4_stuck_commission, p5_reach_projects, p6_news_permissions). Production untouched.
-- Tests: supabase/tests/admin_batch_009_test.sql — 31 passed, 0 failed (rolled back).
