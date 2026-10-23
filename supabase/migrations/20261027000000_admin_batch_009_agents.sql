-- AdminBatch009 "Agent insight" — Admin EAB features 92, 93, 95, 97, 98, plus MainForAdmin-G (the main app signs out a
-- phone the company removed). Runs AFTER 20261026000000_admin_batch_008_reports.sql (needs 005, 007 and 008 Comms).
-- TEST project first; never production without Joe's approval. No DROP of anything with data; safe to run twice.
-- Rollback: supabase/rollback/20261027000000_admin_batch_009_agents_rollback.sql
--
-- Joe's decisions (23 Oct 2026): bulk "message" goes through the 008 broadcasts (a draft for just the ticked agents);
-- "remove this device" signs that one phone out at its next open or sync (MainForAdmin-G); the score is
-- Listings 40 + Activity 30 + Compliance 30 = 100.
--
-- In plain words:
--   * SCORECARD (92): one score out of 100 per agent.
--       Listings 40   average completeness of the agent's listings. Each listing is checked for 9 main details: type,
--                     street, tenure, area (township or city), price (asking price for sale, monthly rent for rent, both
--                     for sale-or-rent), a size (built-up or land), vendor / owner, map pin, at least one photo.
--                     No listings = 0, with the reason "no listings yet".
--       Activity 30   days the agent used the app in the last 30 days (20 days or more = full marks).
--       Compliance 30 licence verified 15, licence expiry date entered and not passed 5, no open complaint 5, not on legal hold 5.
--     Owner / Admin / Compliance see each agent with the parts and the reasons; a Viewer sees only how scores are spread.
--   * ONBOARDING FUNNEL (93): for agents who signed up in a date range — signed up, opened the app, accepted Terms,
--     licence entered, licence verified, first listing, first deal (a listing Sold / Rented, or a confirmed / received deal).
--     Counts for everyone; "who is stuck at this step" for Owner / Admin / Compliance only.
--   * BULK ACTIONS (95): Owner / Admin. Up to 50 agents at once: suspend, re-activate, sign out, add or remove a tag, one
--     reason. All or nothing. One batch reference (BULK-YYYY-####) plus one Master Audit Log line per agent.
--     "Message" = an 008 broadcast draft whose audience is exactly the ticked agents (new audience "agents").
--   * DUPLICATE ACCOUNTS (97): Owner / Admin / Compliance. Accounts sharing a phone number, a phone (device) or a licence number.
--   * DEVICES (98): every phone an agent has used (from the sign-in log). Owner / Admin can "remove" one phone: it is signed
--     out at its next open or sync (the main app asks eab_my_device). Removals are kept for good.

do $$ begin
  if to_regclass('public.eab_pdpa_requests') is null or to_regclass('public.eab_broadcasts') is null
     or to_regprocedure('public.eab_dash_activity(date, date)') is null then
    raise exception 'Apply AdminBatch005, AdminBatch007 and AdminBatch008 Comms first. Nothing was changed.';
  end if;
end $$;

-- =====================================================================================================
-- Scorecard (92)
-- =====================================================================================================
-- Completeness of one listing: 0..9 main details present.
create or replace function public.eab_listing_details(d jsonb) returns integer
language sql immutable set search_path = pg_catalog as $$
  select coalesce((nullif(btrim(d->>'type'), '') is not null), false)::int
       + coalesce((nullif(btrim(d->>'street'), '') is not null), false)::int
       + coalesce((nullif(btrim(d->>'tenure'), '') is not null), false)::int
       + coalesce((coalesce(nullif(btrim(d->>'township'), ''), nullif(btrim(d->>'city'), '')) is not null), false)::int
       + coalesce((case coalesce(d->>'purpose', 'sale')
            when 'rent' then nullif(btrim(d->>'monthlyRent'), '') is not null
            when 'sale_or_rent' then nullif(btrim(d->>'askingPrice'), '') is not null and nullif(btrim(d->>'monthlyRent'), '') is not null
            else nullif(btrim(d->>'askingPrice'), '') is not null end), false)::int
       + coalesce((coalesce(nullif(btrim(d->>'builtUpSqft'), ''), nullif(btrim(d->>'landSqft'), '')) is not null), false)::int
       + coalesce((coalesce(nullif(btrim(d->>'vendorId'), ''), nullif(btrim(d->>'ownerName'), '')) is not null), false)::int
       + coalesce((jsonb_typeof(d->'lat') = 'number' and jsonb_typeof(d->'lng') = 'number'), false)::int
       + coalesce((jsonb_typeof(d->'photos') = 'array' and jsonb_array_length(d->'photos') > 0), false)::int
$$;

-- Every agent's score parts (one row per agent). Internal: only called by the eab_admin_* functions below.
create or replace function public.eab_scores()
returns table (user_id uuid, email text, name text, joined date, status text, listings integer, incomplete integer,
               completeness numeric, active_days integer, licence boolean, verified boolean, expires_on date,
               open_complaints integer, on_hold boolean, p_listings integer, p_activity integer, p_compliance integer, score integer)
language sql stable security definer set search_path = public, auth as $$
  with t as (select public.eab_dash_today() d),
  li as (select r.user_id, count(*)::int n, count(*) filter (where public.eab_listing_details(r.data) < 9)::int bad,
                avg(public.eab_listing_details(r.data)::numeric / 9) avgc
           from public.eab_records r where r.collection = 'properties' and not r.deleted group by r.user_id),
  act as (select a.user_id, count(distinct a.day)::int n from t, public.eab_dash_activity(t.d - 29, t.d) a group by a.user_id),
  base as (
    select u.id, u.email::text email, public.eab_admin_name(u) nm, (u.created_at at time zone 'Asia/Kuala_Lumpur')::date joined,
           coalesce((select s.status from public.eab_account_status s where s.user_id = u.id), 'active') st,
           coalesce(li.n, 0) n, coalesce(li.bad, 0) bad, coalesce(li.avgc, 0) avgc, coalesce(act.n, 0) ad,
           l.user_id is not null has_l, coalesce(l.verified, false) ver, l.expires_on exp,
           (select count(*)::int from public.eab_complaints c where c.agent_user = u.id and c.status in ('open', 'investigating')) oc,
           public.eab_agent_on_hold(u.id) hold, t.d today
      from auth.users u cross join t
      left join li on li.user_id = u.id left join act on act.user_id = u.id left join public.eab_licences l on l.user_id = u.id
     where u.deleted_at is null and not exists (select 1 from public.eab_admins a where a.user_id = u.id))
  select b.id, b.email, b.nm, b.joined, b.st, b.n, b.bad, round(b.avgc, 3), b.ad, b.has_l, b.ver, b.exp, b.oc, b.hold,
         round(b.avgc * 40)::int, round(least(b.ad, 20) / 20.0 * 30)::int,
         (case when b.ver then 15 else 0 end + case when b.exp is not null and b.exp >= b.today then 5 else 0 end
          + case when b.oc = 0 then 5 else 0 end + case when not b.hold then 5 else 0 end),
         round(b.avgc * 40)::int + round(least(b.ad, 20) / 20.0 * 30)::int
          + (case when b.ver then 15 else 0 end + case when b.exp is not null and b.exp >= b.today then 5 else 0 end
             + case when b.oc = 0 then 5 else 0 end + case when not b.hold then 5 else 0 end)
    from base b
$$;

-- What pulls a score down, in plain words.
create or replace function public.eab_score_reasons(s record) returns jsonb
language plpgsql stable set search_path = public as $$
declare out text[] := '{}';
begin
  if s.listings = 0 then out := out || 'no listings yet'::text;
  elsif s.incomplete > 0 then out := out || format('%s of %s listings are missing details', s.incomplete, s.listings); end if;
  if s.active_days < 20 then out := out || format('used the app %s of the last 30 days', s.active_days); end if;
  if not s.licence then out := out || 'no licence entered'::text;
  elsif not s.verified then out := out || 'licence not verified'::text; end if;
  if s.expires_on is null then out := out || 'no licence expiry date'::text;
  elsif s.expires_on < public.eab_dash_today() then out := out || format('licence expired on %s', s.expires_on); end if;
  if s.open_complaints > 0 then out := out || format('%s open complaint(s)', s.open_complaints); end if;
  if s.on_hold then out := out || 'on legal hold'::text; end if;
  return to_jsonb(out);
end $$;

-- The scorecard list (staff: every agent, lowest first) or, for a Viewer, only how the scores are spread.
create or replace function public.eab_admin_scorecard(p_limit integer default 500, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r text := public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']); out jsonb;
begin
  select jsonb_build_object(
    'agents_count', count(*), 'average', round(avg(s.score)),
    'bands', jsonb_build_array(
      jsonb_build_object('band', '0-19', 'agents', count(*) filter (where s.score < 20)),
      jsonb_build_object('band', '20-39', 'agents', count(*) filter (where s.score between 20 and 39)),
      jsonb_build_object('band', '40-59', 'agents', count(*) filter (where s.score between 40 and 59)),
      jsonb_build_object('band', '60-79', 'agents', count(*) filter (where s.score between 60 and 79)),
      jsonb_build_object('band', '80-100', 'agents', count(*) filter (where s.score >= 80))),
    'parts_average', jsonb_build_object('listings', round(avg(s.p_listings)), 'activity', round(avg(s.p_activity)), 'compliance', round(avg(s.p_compliance))),
    'names_hidden', r = 'viewer')
    into out from public.eab_scores() s;
  if r <> 'viewer' then
    out := out || jsonb_build_object('agents', (select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object('reasons', public.eab_score_reasons(x))
                                                                      order by x.score, x.email), '[]'::jsonb)
                                                  from (select * from public.eab_scores() s order by s.score, s.email
                                                         limit least(greatest(coalesce(p_limit, 500), 1), 2000)) x));
    perform public.eab_admin_write_access('search', null, 'scorecard', jsonb_build_object('results', out->'agents_count'), p_device);
  end if;
  return out;
end $$;

-- One agent's score card (Agent Profile).
create or replace function public.eab_admin_agent_score(p_user uuid, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  select to_jsonb(x) || jsonb_build_object('reasons', public.eab_score_reasons(x)) into out from public.eab_scores() x where x.user_id = p_user;
  if out is null then raise exception 'agent not found' using errcode = 'P0002'; end if;
  perform public.eab_admin_write_access('view_agent', p_user, 'scorecard', null, p_device);
  return out;
end $$;

-- =====================================================================================================
-- Onboarding funnel (93)
-- =====================================================================================================
-- For each agent who signed up between p_from and p_to (Malaysia dates): which steps they reached.
create or replace function public.eab_funnel_rows(p_from date, p_to date)
returns table (user_id uuid, email text, name text, joined date, opened boolean, terms boolean, licence boolean, verified boolean,
               listing boolean, deal boolean)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text, public.eab_admin_name(u), (u.created_at at time zone 'Asia/Kuala_Lumpur')::date,
         exists (select 1 from public.eab_login_log g where g.user_id = u.id and g.event in ('sign_in', 'app_open'))
           or exists (select 1 from public.eab_usage_events e where e.user_id = u.id)
           or exists (select 1 from public.eab_usage_daily d where d.user_id = u.id),
         exists (select 1 from public.eab_terms_acceptance t where t.user_id = u.id and t.kind = 'terms' and t.accepted),
         exists (select 1 from public.eab_licences l where l.user_id = u.id),
         exists (select 1 from public.eab_licences l where l.user_id = u.id and l.verified),
         exists (select 1 from public.eab_records r where r.user_id = u.id and r.collection = 'properties'),
         exists (select 1 from public.eab_records r where r.user_id = u.id and not r.deleted
                   and ((r.collection = 'properties' and public.eab_dash_status_key(r.data) in ('sold', 'rented'))
                     or (r.collection = 'deals' and r.data->>'status' in ('confirmed', 'received'))))
    from auth.users u
   where u.deleted_at is null and not exists (select 1 from public.eab_admins a where a.user_id = u.id)
     and u.created_at >= public.eab_dash_ts(p_from) and u.created_at < public.eab_dash_ts(p_to + 1)
$$;

create or replace function public.eab_funnel_step(f record, p_step integer) returns boolean
language plpgsql immutable set search_path = pg_catalog as $$
begin
  return case p_step when 1 then true when 2 then f.opened when 3 then f.terms when 4 then f.licence when 5 then f.verified
                     when 6 then f.listing when 7 then f.deal end;
end $$;

create or replace function public.eab_admin_funnel(p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r text := public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 730 then raise exception 'choose a date range of up to 2 years' using errcode = '22023'; end if;
  return (select jsonb_build_object('from', p_from, 'to', p_to, 'names_hidden', r = 'viewer', 'steps', jsonb_build_array(
      jsonb_build_object('step', 1, 'key', 'signed_up', 'agents', count(*)),
      jsonb_build_object('step', 2, 'key', 'opened', 'agents', count(*) filter (where f.opened)),
      jsonb_build_object('step', 3, 'key', 'terms', 'agents', count(*) filter (where f.terms)),
      jsonb_build_object('step', 4, 'key', 'licence', 'agents', count(*) filter (where f.licence)),
      jsonb_build_object('step', 5, 'key', 'verified', 'agents', count(*) filter (where f.verified)),
      jsonb_build_object('step', 6, 'key', 'listing', 'agents', count(*) filter (where f.listing)),
      jsonb_build_object('step', 7, 'key', 'deal', 'agents', count(*) filter (where f.deal))))
    from public.eab_funnel_rows(p_from, p_to) f);
end $$;

-- Who reached the step before but not this one (staff only; logged).
create or replace function public.eab_admin_funnel_stuck(p_from date, p_to date, p_step integer, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  if p_step is null or p_step < 2 or p_step > 7 then raise exception 'step 2 to 7' using errcode = '22023'; end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 730 then raise exception 'choose a date range of up to 2 years' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('user_id', f.user_id, 'email', f.email, 'name', f.name, 'joined', f.joined,
           'days_since_joined', public.eab_dash_today() - f.joined) order by f.joined), '[]'::jsonb)
    into out from public.eab_funnel_rows(p_from, p_to) f
   where public.eab_funnel_step(f, p_step - 1) and not public.eab_funnel_step(f, p_step);
  perform public.eab_admin_write_access('search', null, 'funnel stuck at step ' || p_step, jsonb_build_object('results', jsonb_array_length(out)), p_device);
  return out;
end $$;

-- =====================================================================================================
-- Bulk actions (95)
-- =====================================================================================================
create sequence if not exists public.eab_bulk_no;
revoke all on sequence public.eab_bulk_no from anon, authenticated, public;

create or replace function public.eab_admin_bulk_action(p_action text, p_users uuid[], p_reason text, p_tag text default null,
                                                        p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare ref text; why text; u uuid; n int := 0;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if p_action not in ('suspend', 'reactivate', 'sign_out', 'tag_add', 'tag_remove') then raise exception 'unknown bulk action' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null or char_length(btrim(p_reason)) < 5 then raise exception 'a reason of at least 5 characters is required' using errcode = '22023'; end if;
  p_users := array(select distinct x from unnest(coalesce(p_users, '{}')) x where x is not null);
  if cardinality(p_users) = 0 then raise exception 'tick at least one agent' using errcode = '22023'; end if;
  if cardinality(p_users) > 50 then raise exception 'at most 50 agents at a time' using errcode = '22023'; end if;
  if p_action in ('tag_add', 'tag_remove') and nullif(btrim(coalesce(p_tag, '')), '') is null then raise exception 'choose a tag' using errcode = '22023'; end if;
  if exists (select 1 from unnest(p_users) x where not exists (select 1 from auth.users a where a.id = x and a.deleted_at is null)) then
    raise exception 'an agent in the list was not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from unnest(p_users) x where exists (select 1 from public.eab_admins a where a.user_id = x)) then
    raise exception 'bulk actions are for agents, not admins' using errcode = '22023';
  end if;
  ref := 'BULK-' || to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY') || '-' || lpad(nextval('public.eab_bulk_no')::text, 4, '0');
  why := left('[' || ref || '] ' || btrim(p_reason), 1000);
  foreach u in array p_users loop
    case p_action
      when 'suspend' then perform public.eab_admin_set_account_status(u, 'suspended', why, true, p_device);
      when 'reactivate' then perform public.eab_admin_set_account_status(u, 'active', why, false, p_device);
      when 'sign_out' then perform public.eab_admin_force_logout(u, why, p_device);
      when 'tag_add' then perform public.eab_admin_agent_tag(u, p_tag, true, p_device);
      when 'tag_remove' then perform public.eab_admin_agent_tag(u, p_tag, false, p_device);
    end case;
    n := n + 1;
  end loop;
  perform public.eab_admin_write_action('bulk_action', null, ref, btrim(p_reason), null,
            jsonb_build_object('action', p_action, 'tag', lower(btrim(p_tag)), 'agents', to_jsonb(p_users), 'count', n), p_device);
  return jsonb_build_object('ref', ref, 'action', p_action, 'count', n);
end $$;

-- "Message" for ticked agents: 008 broadcasts get a new audience "agents" (exactly these people).
alter table public.eab_broadcasts add column if not exists user_ids uuid[] not null default '{}';
alter table public.eab_broadcasts drop constraint if exists eab_broadcasts_audience_check;
alter table public.eab_broadcasts add constraint eab_broadcasts_audience_check check (audience in ('all', 'groups', 'agents'));

create or replace function public.eab_bc_in_audience(b public.eab_broadcasts, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case b.audience
    when 'all' then true
    when 'agents' then p_user = any (b.user_ids)
    else exists (select 1 from public.eab_my_groups(p_user) g where g.group_id = any (b.group_ids)) end
$$;

-- Same as 008 Comms, plus audience "agents" with user_ids (1-500 agents).
create or replace function public.eab_admin_broadcast_save(p jsonb, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare bid uuid := nullif(p->>'id', '')::uuid; cur public.eab_broadcasts; gids uuid[]; uids uuid[]; before jsonb; after jsonb;
        t text := nullif(btrim(coalesce(p->>'body_en', '')), ''); aud text := coalesce(p->>'audience', 'all');
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if coalesce(p->>'channel', '') not in ('email', 'whatsapp') then raise exception 'choose email or WhatsApp' using errcode = '22023'; end if;
  if coalesce(p->>'kind', '') not in ('service', 'news') then raise exception 'choose service notice or news & offers' using errcode = '22023'; end if;
  if t is null then raise exception 'the English text is required' using errcode = '22023'; end if;
  if p->>'channel' = 'email' and nullif(btrim(coalesce(p->>'subject_en', '')), '') is null then raise exception 'the English subject is required' using errcode = '22023'; end if;
  if aud not in ('all', 'groups', 'agents') then raise exception 'audience must be all, groups or chosen agents' using errcode = '22023'; end if;
  select coalesce(array_agg(x::uuid), '{}') into gids from jsonb_array_elements_text(coalesce(p->'group_ids', '[]'::jsonb)) x;
  select coalesce(array_agg(distinct x::uuid), '{}') into uids from jsonb_array_elements_text(coalesce(p->'user_ids', '[]'::jsonb)) x;
  if aud = 'groups' and cardinality(gids) = 0 then raise exception 'choose at least one group, or everyone' using errcode = '22023'; end if;
  if aud = 'agents' and (cardinality(uids) = 0 or cardinality(uids) > 500) then raise exception 'choose 1 to 500 agents' using errcode = '22023'; end if;
  if aud <> 'groups' then gids := '{}'; end if;
  if aud <> 'agents' then uids := '{}'; end if;
  if exists (select 1 from unnest(gids) g where not exists (select 1 from public.eab_audience_groups a where a.id = g)) then
    raise exception 'unknown audience group' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(uids) x where not exists (select 1 from auth.users a where a.id = x)) then
    raise exception 'an agent in the list was not found' using errcode = '22023';
  end if;
  if bid is not null then
    select * into cur from public.eab_broadcasts where id = bid for update;
    if cur.id is null then raise exception 'broadcast not found' using errcode = 'P0002'; end if;
    if cur.status <> 'draft' then raise exception 'only a draft can be changed' using errcode = '22023'; end if;
    before := to_jsonb(cur);
    update public.eab_broadcasts set channel = p->>'channel', kind = p->>'kind',
      subject_en = nullif(btrim(coalesce(p->>'subject_en', '')), ''), subject_bm = nullif(btrim(coalesce(p->>'subject_bm', '')), ''),
      subject_zh = nullif(btrim(coalesce(p->>'subject_zh', '')), ''), body_en = t,
      body_bm = nullif(btrim(coalesce(p->>'body_bm', '')), ''), body_zh = nullif(btrim(coalesce(p->>'body_zh', '')), ''),
      audience = aud, group_ids = gids, user_ids = uids, updated_at = now()
     where id = bid;
  else
    insert into public.eab_broadcasts (ref, channel, kind, subject_en, subject_bm, subject_zh, body_en, body_bm, body_zh, audience, group_ids, user_ids, created_by)
    values ('BC-' || to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY') || '-' || lpad(nextval('public.eab_broadcast_no')::text, 4, '0'),
            p->>'channel', p->>'kind', nullif(btrim(coalesce(p->>'subject_en', '')), ''), nullif(btrim(coalesce(p->>'subject_bm', '')), ''),
            nullif(btrim(coalesce(p->>'subject_zh', '')), ''), t, nullif(btrim(coalesce(p->>'body_bm', '')), ''),
            nullif(btrim(coalesce(p->>'body_zh', '')), ''), aud, gids, uids, auth.uid())
    returning id into bid;
  end if;
  after := public.eab_bc_json(bid);
  perform public.eab_admin_write_action('broadcast_saved', null, after->>'ref', null, before, after - 'counts', p_device);
  return after;
end $$;

-- =====================================================================================================
-- Duplicate accounts (97)
-- =====================================================================================================
create or replace function public.eab_admin_duplicates(p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  with agents as (
    select u.id, u.email::text email, public.eab_admin_name(u) name, (u.created_at at time zone 'Asia/Kuala_Lumpur')::date joined,
           coalesce((select s.status from public.eab_account_status s where s.user_id = u.id), 'active') status
      from auth.users u where u.deleted_at is null and not exists (select 1 from public.eab_admins a where a.user_id = u.id)),
  keys as (
    select 'phone' kind, c.phone val, c.phone label, c.user_id from public.eab_agent_contacts c where c.phone is not null
    union
    select 'device', g.device_id, coalesce(max(g.device), 'phone') || ' · ' || coalesce(max(g.platform), ''), g.user_id
      from public.eab_login_log g where g.device_id is not null group by g.device_id, g.user_id
    union
    select 'licence', upper(regexp_replace(l.number, '[^A-Za-z0-9]', '', 'g')), l.number, l.user_id
      from public.eab_licences l where nullif(btrim(l.number), '') is not null),
  grp as (
    select k.kind, k.val, min(k.label) label, array_agg(distinct k.user_id) users
      from keys k join agents a on a.id = k.user_id
     group by k.kind, k.val having count(distinct k.user_id) > 1)
  select coalesce(jsonb_agg(jsonb_build_object('kind', g.kind, 'value', g.label,
           'agents', (select jsonb_agg(jsonb_build_object('user_id', a.id, 'email', a.email, 'name', a.name, 'joined', a.joined, 'status', a.status) order by a.joined)
                        from agents a where a.id = any (g.users))) order by g.kind, cardinality(g.users) desc), '[]'::jsonb)
    into out from (select * from grp limit 300) g;
  perform public.eab_admin_write_access('search', null, 'duplicate accounts', jsonb_build_object('results', jsonb_array_length(out)), p_device);
  return out;
end $$;

-- =====================================================================================================
-- Devices per agent (98) and MainForAdmin-G
-- =====================================================================================================
create table if not exists public.eab_device_removals (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete restrict,
  device_id   text not null check (char_length(device_id) between 1 and 80),
  reason      text not null check (char_length(reason) between 5 and 1000),
  removed_by  uuid not null,
  removed_by_email text,
  removed_at  timestamptz not null default now()
);
create index if not exists eab_device_removals_user on public.eab_device_removals (user_id, device_id, removed_at desc);
alter table public.eab_device_removals enable row level security;
revoke all on public.eab_device_removals from anon, authenticated, public;
create or replace function public.eab_device_removal_keep() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'device removals are kept for good and never changed' using errcode = '42501';
end $$;
create or replace trigger eab_device_removals_keep before delete or update on public.eab_device_removals for each row execute function public.eab_device_removal_keep();
create or replace trigger eab_device_removals_notrunc before truncate on public.eab_device_removals for each statement execute function public.eab_device_removal_keep();

create or replace function public.eab_admin_agent_devices(p_user uuid, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'regulator']);
  if not public.eab_admin_can_see(p_user) then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(x order by x->>'last_seen' desc), '[]'::jsonb) into out from (
    select jsonb_build_object('device_id', g.device_id,
             'device', (array_agg(g.device order by g.seq desc) filter (where g.device is not null))[1],
             'platform', (array_agg(g.platform order by g.seq desc) filter (where g.platform is not null))[1],
             'app_version', (array_agg(g.app_version order by g.seq desc) filter (where g.app_version is not null))[1],
             'first_seen', min(g.happened_at), 'last_seen', max(g.happened_at),
             'sign_ins', count(*) filter (where g.event = 'sign_in'), 'opens', count(*) filter (where g.event = 'app_open'),
             'failed', count(*) filter (where g.event in ('sign_in_failed', 'locked_out')),
             'last_lat', (array_agg(g.lat order by g.seq desc) filter (where g.lat is not null))[1],
             'last_lng', (array_agg(g.lng order by g.seq desc) filter (where g.lng is not null))[1],
             'removed', (select jsonb_build_object('at', r.removed_at, 'by', r.removed_by_email, 'reason', r.reason)
                           from public.eab_device_removals r where r.user_id = p_user and r.device_id = g.device_id order by r.removed_at desc limit 1),
             'signed_in_after_removal', exists (select 1 from public.eab_login_log g2 where g2.user_id = p_user and g2.device_id = g.device_id
                           and g2.event = 'sign_in' and g2.happened_at > (select max(r.removed_at) from public.eab_device_removals r
                                                                          where r.user_id = p_user and r.device_id = g.device_id))) x
      from public.eab_login_log g where g.user_id = p_user and g.device_id is not null group by g.device_id) d;
  perform public.eab_admin_write_access('view_login_log', p_user, 'devices', null, p_device);
  return out;
end $$;

create or replace function public.eab_admin_device_remove(p_user uuid, p_device_id text, p_reason text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare r public.eab_device_removals;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if nullif(btrim(coalesce(p_reason, '')), '') is null or char_length(btrim(p_reason)) < 5 then raise exception 'a reason of at least 5 characters is required' using errcode = '22023'; end if;
  if not exists (select 1 from public.eab_login_log g where g.user_id = p_user and g.device_id = p_device_id) then
    raise exception 'this phone was never used by this agent' using errcode = 'P0002';
  end if;
  insert into public.eab_device_removals (user_id, device_id, reason, removed_by, removed_by_email)
  values (p_user, p_device_id, left(btrim(p_reason), 1000), auth.uid(), (select email from auth.users where id = auth.uid()))
  returning * into r;
  perform public.eab_admin_write_action('device_removed', p_user, p_device_id, btrim(p_reason), null, to_jsonb(r), p_device);
  return to_jsonb(r);
end $$;

-- MAIN APP (MainForAdmin-G): "was this phone removed?" The app signs out when the answer is later than its own sign-in.
create or replace function public.eab_my_device(p_device_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  return jsonb_build_object('removed_at', (select max(r.removed_at) from public.eab_device_removals r where r.user_id = uid and r.device_id = p_device_id));
end $$;

-- =====================================================================================================
-- permissions
-- =====================================================================================================
revoke all on function public.eab_listing_details(jsonb), public.eab_scores(), public.eab_score_reasons(record),
  public.eab_funnel_rows(date, date), public.eab_funnel_step(record, integer) from public, anon, authenticated;
revoke all on function public.eab_admin_scorecard(integer, text), public.eab_admin_agent_score(uuid, text), public.eab_admin_funnel(date, date),
  public.eab_admin_funnel_stuck(date, date, integer, text), public.eab_admin_bulk_action(text, uuid[], text, text, text),
  public.eab_admin_duplicates(text), public.eab_admin_agent_devices(uuid, text), public.eab_admin_device_remove(uuid, text, text, text),
  public.eab_my_device(text), public.eab_bc_in_audience(public.eab_broadcasts, uuid), public.eab_admin_broadcast_save(jsonb, text) from public, anon;
revoke all on function public.eab_bc_in_audience(public.eab_broadcasts, uuid) from authenticated;
grant execute on function public.eab_admin_scorecard(integer, text), public.eab_admin_agent_score(uuid, text), public.eab_admin_funnel(date, date),
  public.eab_admin_funnel_stuck(date, date, integer, text), public.eab_admin_bulk_action(text, uuid[], text, text, text),
  public.eab_admin_duplicates(text), public.eab_admin_agent_devices(uuid, text), public.eab_admin_device_remove(uuid, text, text, text),
  public.eab_my_device(text), public.eab_admin_broadcast_save(jsonb, text) to authenticated;
