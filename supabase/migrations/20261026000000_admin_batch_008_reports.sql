-- AdminBatch008 Reports — Admin EAB (features 90, 127, 129). Runs AFTER 20261025000000_admin_batch_008_comms.sql (no shared names).
-- Builds on AdminBatch001-007. TEST project first; never production without Joe's approval.
-- Rollback: supabase/rollback/20261026000000_admin_batch_008_reports_rollback.sql
--
-- In plain words:
--   * BOARD REPORT (90): fixed monthly numbers (agents, licences, listings, complaints, PDPA 21-day rule, tickets, cases,
--     admin actions) for a month and the month before. Owner + Compliance. The file is kept in the Document Vault.
--   * AUDIT BUNDLE (129): everything an auditor asks for one year (admin action and access logs, tamper check, backup
--     tests, case files and packs, PDPA, complaints, holds, retention reviews). Owner + Compliance. Kept in the Vault.
--   * REPORT BUILDER (127): reports from a FIXED list of sources and columns. Nothing typed by an admin ever becomes SQL:
--     column names come only from the catalogue below, and every value is passed as data. Personal columns (names,
--     emails) are for Owner / Admin / Compliance; a Viewer can only build grouped totals without personal columns.
--     Saved reports are shared with every admin allowed to run that source.
-- Additive only: one new table, the Vault accepts two new kinds, new functions.

do $$ begin
  if to_regclass('public.eab_pdpa_requests') is null or to_regclass('public.eab_complaints') is null or to_regclass('public.eab_ticket_notes') is null then
    raise exception 'Apply AdminBatch006 and AdminBatch007 (20261024000000_admin_batch_007_compliance.sql) first. Nothing was changed.';
  end if;
end $$;

-- =====================================================================================================
-- tables
-- =====================================================================================================
alter table public.eab_reg_packs drop constraint if exists eab_reg_packs_kind_check;
alter table public.eab_reg_packs add constraint eab_reg_packs_kind_check
  check (kind in ('case_pack', 'agent_profile', 'pdpa_access', 'board_report', 'audit_bundle'));

create table if not exists public.eab_saved_reports (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 1 and 120),
  source           text not null check (source ~ '^[a-z_]{2,30}$'),
  spec             jsonb not null check (jsonb_typeof(spec) = 'object'),
  created_by       uuid not null, created_by_email text, created_at timestamptz not null default now(),
  updated_by       uuid, updated_at timestamptz not null default now()
);
alter table public.eab_saved_reports enable row level security;
revoke all on public.eab_saved_reports from anon, authenticated, public;

-- =====================================================================================================
-- Report builder (127): the catalogue. Each source: who may run it, its date column, and its columns
-- (type text | num | date | bool; personal = names / emails). The SQL of each source is fixed text here.
-- =====================================================================================================
create or replace function public.eab_report_catalog() returns jsonb
language sql immutable set search_path = pg_catalog as $$
select '{
 "agents": {"label": "Agents", "roles": ["owner","admin","compliance","viewer"], "date": "joined",
   "columns": {"email": {"t":"text","p":true,"l":"Email"}, "name": {"t":"text","p":true,"l":"Name"}, "joined": {"t":"date","l":"Joined"},
     "status": {"t":"text","l":"Account status"}, "licence_type": {"t":"text","l":"Licence type"}, "licence_verified": {"t":"bool","l":"Licence verified"},
     "licence_expires_on": {"t":"date","l":"Licence expires"}, "platform": {"t":"text","l":"Platform"}, "app_version": {"t":"text","l":"App version"},
     "language": {"t":"text","l":"Language"}, "tags": {"t":"text","p":true,"l":"Internal tags"}, "listings": {"t":"num","l":"Listings"},
     "records": {"t":"num","l":"All records"}, "last_sign_in": {"t":"date","l":"Last sign-in"}}},
 "listings": {"label": "Listings", "roles": ["owner","admin","compliance","viewer"], "date": "created",
   "columns": {"agent_email": {"t":"text","p":true,"l":"Agent email"}, "agent_name": {"t":"text","p":true,"l":"Agent name"}, "ref": {"t":"text","l":"Reference"},
     "type": {"t":"text","l":"Property type"}, "state": {"t":"text","l":"State"}, "city": {"t":"text","l":"City"}, "status": {"t":"text","l":"Status"},
     "purpose": {"t":"text","l":"Sale / rent"}, "asking_price": {"t":"num","l":"Asking price (RM)"}, "monthly_rent": {"t":"num","l":"Monthly rent (RM)"}, "created": {"t":"date","l":"Created"},
     "updated": {"t":"date","l":"Last change"}, "deleted": {"t":"bool","l":"Deleted"}}},
 "activity": {"label": "App activity", "roles": ["owner","admin","compliance","viewer"], "date": "day",
   "columns": {"day": {"t":"date","l":"Day"}, "agent_email": {"t":"text","p":true,"l":"Agent email"}, "kind": {"t":"text","l":"Kind"}, "name": {"t":"text","l":"Screen / feature"},
     "ok": {"t":"bool","l":"Worked"}, "platform": {"t":"text","l":"Platform"}, "app_version": {"t":"text","l":"App version"}, "events": {"t":"num","l":"Times"}}},
 "sign_ins": {"label": "Sign-ins", "roles": ["owner","admin","compliance","viewer"], "date": "day",
   "columns": {"day": {"t":"date","l":"Day"}, "agent_email": {"t":"text","p":true,"l":"Agent email"}, "event": {"t":"text","l":"Event"},
     "platform": {"t":"text","l":"Platform"}, "device": {"t":"text","l":"Phone"}, "app_version": {"t":"text","l":"App version"}}},
 "complaints": {"label": "Complaints", "roles": ["owner","admin","compliance"], "date": "received_on",
   "columns": {"ref": {"t":"text","l":"Reference"}, "received_on": {"t":"date","l":"Received"}, "agent_email": {"t":"text","p":true,"l":"Agent email"},
     "category": {"t":"text","l":"About"}, "channel": {"t":"text","l":"Came in by"}, "status": {"t":"text","l":"Status"}, "listing_ref": {"t":"text","l":"Listing"}}},
 "pdpa": {"label": "PDPA requests", "roles": ["owner","compliance"], "date": "received_on",
   "columns": {"ref": {"t":"text","l":"Reference"}, "received_on": {"t":"date","l":"Received"}, "kind": {"t":"text","l":"Kind"}, "status": {"t":"text","l":"Status"},
     "agent_email": {"t":"text","p":true,"l":"Agent email"}, "days_to_answer": {"t":"num","l":"Days to answer"}, "late": {"t":"bool","l":"Over 21 days"}}},
 "tickets": {"label": "Problem reports", "roles": ["owner","admin","compliance"], "date": "created",
   "columns": {"created": {"t":"date","l":"Sent"}, "agent_email": {"t":"text","p":true,"l":"Agent email"}, "status": {"t":"text","l":"Status"},
     "screen": {"t":"text","l":"Screen"}, "platform": {"t":"text","l":"Platform"}, "app_version": {"t":"text","l":"App version"}}},
 "admin_actions": {"label": "Admin actions", "roles": ["owner","compliance"], "date": "day",
   "columns": {"day": {"t":"date","l":"Day"}, "admin_email": {"t":"text","p":true,"l":"Admin"}, "admin_role": {"t":"text","l":"Role"},
     "action": {"t":"text","l":"Action"}, "target_ref": {"t":"text","l":"About"}, "reason": {"t":"text","l":"Reason"}}}
}'::jsonb
$$;

-- The fixed SQL of each source (no input is ever placed in it).
create or replace function public.eab_report_base(p_source text) returns text
language sql immutable set search_path = pg_catalog as $$
select case p_source
 when 'agents' then $q$
  select u.id as uid, u.email::text as email, public.eab_admin_name(u) as name, (u.created_at at time zone 'Asia/Kuala_Lumpur')::date as joined,
         coalesce((select st.status from public.eab_account_status st where st.user_id = u.id), 'active') as status,
         l.type as licence_type, coalesce(l.verified, false) as licence_verified, l.expires_on as licence_expires_on,
         (select g.platform from public.eab_login_log g where g.user_id = u.id order by g.seq desc limit 1) as platform,
         (select g.app_version from public.eab_login_log g where g.user_id = u.id order by g.seq desc limit 1) as app_version,
         (select replace(e.name, 'lang.', '') from public.eab_usage_events e where e.user_id = u.id and e.kind = 'language' order by e.at desc limit 1) as language,
         (select string_agg(t.tag, ', ' order by t.tag) from public.eab_agent_tags t where t.user_id = u.id) as tags,
         (select count(*) from public.eab_records r where r.user_id = u.id and r.collection = 'properties' and not r.deleted)::numeric as listings,
         (select count(*) from public.eab_records r where r.user_id = u.id and not r.deleted)::numeric as records,
         (u.last_sign_in_at at time zone 'Asia/Kuala_Lumpur')::date as last_sign_in
    from auth.users u left join public.eab_licences l on l.user_id = u.id where u.deleted_at is null $q$
 when 'listings' then $q$
  select r.user_id as uid, u.email::text as agent_email, public.eab_admin_name(u) as agent_name, coalesce(r.data->>'ref', r.data->>'refNo') as ref,
         r.data->>'type' as type, r.data->>'state' as state, r.data->>'city' as city, public.eab_dash_status_key(r.data) as status,
         r.data->>'purpose' as purpose,
         case when (r.data->>'askingPrice') ~ '^[0-9]+(\.[0-9]+)?$' then (r.data->>'askingPrice')::numeric end as asking_price,
         case when (r.data->>'monthlyRent') ~ '^[0-9]+(\.[0-9]+)?$' then (r.data->>'monthlyRent')::numeric end as monthly_rent,
         case when (r.data->>'created') ~ '^[0-9]+(\.[0-9]+)?$' then (to_timestamp((r.data->>'created')::double precision / 1000) at time zone 'Asia/Kuala_Lumpur')::date end as created,
         (to_timestamp(r.updated / 1000.0) at time zone 'Asia/Kuala_Lumpur')::date as updated, r.deleted as deleted
    from public.eab_records r left join auth.users u on u.id = r.user_id where r.collection = 'properties' $q$
 when 'activity' then $q$
  select e.user_id as uid, (e.at at time zone 'Asia/Kuala_Lumpur')::date as day, u.email::text as agent_email, e.kind as kind, e.name as name,
         coalesce(e.ok, true) as ok, e.platform as platform, e.app_version as app_version, 1::numeric as events
    from public.eab_usage_events e left join auth.users u on u.id = e.user_id where e.kind <> 'metric' $q$
 when 'sign_ins' then $q$
  select g.user_id as uid, (g.happened_at at time zone 'Asia/Kuala_Lumpur')::date as day, u.email::text as agent_email, g.event as event,
         g.platform as platform, g.device as device, g.app_version as app_version
    from public.eab_login_log g left join auth.users u on u.id = g.user_id $q$
 when 'complaints' then $q$
  select c.agent_user as uid, c.ref as ref, c.received_on as received_on, u.email::text as agent_email, c.category as category,
         c.channel as channel, c.status as status, c.listing_ref as listing_ref
    from public.eab_complaints c left join auth.users u on u.id = c.agent_user $q$
 when 'pdpa' then $q$
  select p.agent_user as uid, p.ref as ref, p.received_on as received_on, p.kind as kind, p.status as status, u.email::text as agent_email,
         (coalesce(p.supplied_on, p.decided_on) - p.received_on)::numeric as days_to_answer,
         (p.kind in ('access', 'correction') and coalesce(p.supplied_on, p.decided_on, public.eab_dash_today()) - p.received_on > 21) as late
    from public.eab_pdpa_requests p left join auth.users u on u.id = p.agent_user $q$
 when 'tickets' then $q$
  select b.user_id as uid, (b.created_at at time zone 'Asia/Kuala_Lumpur')::date as created, u.email::text as agent_email, b.status as status,
         b.screen as screen, b.platform as platform, b.app_version as app_version
    from public.eab_bug_reports b left join auth.users u on u.id = b.user_id $q$
 when 'admin_actions' then $q$
  select a.target_user as uid, (a.at at time zone 'Asia/Kuala_Lumpur')::date as day, a.admin_email as admin_email, a.admin_role as admin_role,
         a.action as action, a.target_ref as target_ref, a.reason as reason
    from public.eab_admin_actions a $q$
end
$$;

-- Checks a report spec and returns the SQL to run (values stay in the spec, read as $1). Raises on anything unknown.
-- spec: {source, columns: [..], group_by: [..] (0-2), measure: "count" | "sum:<num col>" | "avg:<num col>",
--        from, to (dates on the source's date column), filters: [{col, op: in|eq|contains|min|max|is|before|after, value}] (0-10),
--        sort: {by: <col> | "value", dir: asc|desc}, limit (1-5000)}
create or replace function public.eab_report_sql(p_spec jsonb, p_role text) returns text
language plpgsql stable set search_path = pg_catalog as $$
declare
  cat jsonb := public.eab_report_catalog(); src text := p_spec->>'source'; s jsonb; cols jsonb; c text; i int; f jsonb; ct text;
  sel text[] := '{}'; grp text[] := '{}'; whr text[] := '{}'; measure text := coalesce(p_spec->>'measure', 'count'); mcol text;
  lim int := least(greatest(coalesce((p_spec->>'limit')::int, 1000), 1), 5000); sortby text := p_spec->'sort'->>'by';
  dir text := case when lower(coalesce(p_spec->'sort'->>'dir', 'desc')) = 'asc' then 'asc' else 'desc' end; grouped boolean;
  staff boolean := p_role in ('owner', 'admin', 'compliance');
begin
  s := cat->src;
  if s is null then raise exception 'unknown report source' using errcode = '22023'; end if;
  if not (s->'roles') ? p_role then raise exception 'not allowed' using errcode = '42501'; end if;
  cols := s->'columns';
  if coalesce(jsonb_typeof(p_spec->'columns'), 'array') <> 'array' or coalesce(jsonb_typeof(p_spec->'group_by'), 'array') <> 'array'
     or coalesce(jsonb_typeof(p_spec->'filters'), 'array') <> 'array' or coalesce(jsonb_typeof(p_spec->'sort'), 'object') <> 'object' then
    raise exception 'columns, group_by and filters must be lists' using errcode = '22023';
  end if;
  grouped := jsonb_array_length(coalesce(p_spec->'group_by', '[]')) > 0;
  if not staff and not grouped then raise exception 'your role can only build grouped totals' using errcode = '42501'; end if;
  if jsonb_array_length(coalesce(p_spec->'group_by', '[]')) > 2 then raise exception 'group by at most 2 columns' using errcode = '22023'; end if;
  if jsonb_array_length(coalesce(p_spec->'filters', '[]')) > 10 then raise exception 'at most 10 filters' using errcode = '22023'; end if;
  -- every column named anywhere must be in the catalogue; personal columns only for staff
  for c in select jsonb_array_elements_text(coalesce(p_spec->'columns', '[]') || coalesce(p_spec->'group_by', '[]')) loop
    if not cols ? c then raise exception 'unknown column %', c using errcode = '22023'; end if;
    if coalesce((cols->c->>'p')::boolean, false) and not staff then raise exception 'not allowed' using errcode = '42501'; end if;
  end loop;
  -- measure
  if measure <> 'count' then
    if measure !~ '^(sum|avg):[a-z_]+$' then raise exception 'unknown measure' using errcode = '22023'; end if;
    mcol := split_part(measure, ':', 2);
    if not cols ? mcol or cols->mcol->>'t' <> 'num' then raise exception 'sum / average needs a number column' using errcode = '22023'; end if;
  end if;
  -- where: date range on the source's date column, then filters (values read from $1 only)
  if nullif(p_spec->>'from', '') is not null then whr := whr || format('b.%I >= ($1->>%L)::date', s->>'date', 'from'); end if;
  if nullif(p_spec->>'to', '') is not null then whr := whr || format('b.%I <= ($1->>%L)::date', s->>'date', 'to'); end if;
  for i in 0 .. coalesce(jsonb_array_length(p_spec->'filters'), 0) - 1 loop
    f := p_spec->'filters'->i; c := f->>'col';
    if not cols ? c then raise exception 'unknown column %', c using errcode = '22023'; end if;
    if coalesce((cols->c->>'p')::boolean, false) and not staff then raise exception 'not allowed' using errcode = '42501'; end if;
    ct := cols->c->>'t';
    whr := whr || case
      when f->>'op' = 'in' and jsonb_typeof(f->'value') = 'array' then format('b.%I::text in (select jsonb_array_elements_text($1->''filters''->%s->''value''))', c, i)
      when f->>'op' = 'eq' and ct in ('text', 'num') then format('b.%I::text = ($1->''filters''->%s->>''value'')', c, i)
      when f->>'op' = 'contains' and ct = 'text' then format('b.%I ilike ''%%'' || ($1->''filters''->%s->>''value'') || ''%%''', c, i)
      when f->>'op' = 'min' and ct = 'num' then format('b.%I >= ($1->''filters''->%s->>''value'')::numeric', c, i)
      when f->>'op' = 'max' and ct = 'num' then format('b.%I <= ($1->''filters''->%s->>''value'')::numeric', c, i)
      when f->>'op' = 'after' and ct = 'date' then format('b.%I >= ($1->''filters''->%s->>''value'')::date', c, i)
      when f->>'op' = 'before' and ct = 'date' then format('b.%I <= ($1->''filters''->%s->>''value'')::date', c, i)
      when f->>'op' = 'is' and f->>'value' = 'empty' then format('b.%I is null', c)
      when f->>'op' = 'is' and f->>'value' = 'not_empty' then format('b.%I is not null', c)
      when f->>'op' = 'is' and ct = 'bool' and f->>'value' in ('true', 'false') then format('b.%I = ($1->''filters''->%s->>''value'')::boolean', c, i)
      else null end;
    if whr[array_length(whr, 1)] is null then raise exception 'filter % does not fit column %', f->>'op', c using errcode = '22023'; end if;
  end loop;
  if grouped then
    for c in select jsonb_array_elements_text(p_spec->'group_by') loop
      sel := sel || format('b.%I', c); grp := grp || format('b.%I', c);
    end loop;
    sel := sel || case when measure = 'count' then 'count(*)::numeric as value'
                       else format('round(%s(b.%I)::numeric, 2) as value', split_part(measure, ':', 1), mcol) end;
    if sortby is not null and sortby <> 'value' and not (p_spec->'group_by') ? sortby then raise exception 'sort by a grouped column or the value' using errcode = '22023'; end if;
  else
    if jsonb_array_length(coalesce(p_spec->'columns', '[]')) = 0 then raise exception 'choose at least one column' using errcode = '22023'; end if;
    for c in select jsonb_array_elements_text(p_spec->'columns') loop sel := sel || format('b.%I', c); end loop;
    if sortby is not null and not (p_spec->'columns') ? sortby then raise exception 'sort by one of the chosen columns' using errcode = '22023'; end if;
  end if;
  return format('select %s from (%s) b%s%s order by %s %s nulls last limit %s',
    array_to_string(sel, ', '), public.eab_report_base(src),
    case when array_length(whr, 1) > 0 then ' where ' || array_to_string(whr, ' and ') else '' end,
    case when grouped then ' group by ' || array_to_string(grp, ', ') else '' end,
    case when sortby is null then (case when grouped then 'value' else '1' end) when sortby = 'value' then 'value' else format('%I', sortby) end,
    dir, lim + 1);
end $$;

create or replace function public.eab_admin_report_catalog() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r text := public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
begin
  return (select coalesce(jsonb_object_agg(k, v - 'roles' || jsonb_build_object('allowed', true)), '{}'::jsonb)
            from jsonb_each(public.eab_report_catalog()) j(k, v) where (v->'roles') ? r);
end $$;

create or replace function public.eab_admin_report_run(p_spec jsonb, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare r text := public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']); q text; rows jsonb; n int;
        lim int := least(greatest(coalesce((p_spec->>'limit')::int, 1000), 1), 5000);
begin
  if p_spec is null or jsonb_typeof(p_spec) <> 'object' then raise exception 'spec must be an object' using errcode = '22023'; end if;
  q := public.eab_report_sql(p_spec, r);
  execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from (%s) x', q) into rows using p_spec;
  n := jsonb_array_length(rows);
  if n > lim then rows := rows - lim; end if;
  perform public.eab_admin_write_access('search', null, 'report: ' || (p_spec->>'source'),
            jsonb_build_object('results', least(n, lim), 'spec', p_spec), p_device);
  return jsonb_build_object('rows', rows, 'count', least(n, lim), 'truncated', n > lim, 'run_at', now());
end $$;

-- Saved reports: shared with every admin allowed to run the source. Anyone allowed may save; the maker or the Owner deletes.
create or replace function public.eab_admin_saved_reports() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r text := public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
begin
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from public.eab_saved_reports x
                    where (public.eab_report_catalog()->x.source->'roles') ? r
                      and (r <> 'viewer' or jsonb_array_length(coalesce(x.spec->'group_by', '[]')) > 0)), '[]'::jsonb);
end $$;

create or replace function public.eab_admin_saved_report_save(p jsonb, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r text := public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']); rid uuid := nullif(p->>'id', '')::uuid; b jsonb; a jsonb;
begin
  if nullif(btrim(coalesce(p->>'name', '')), '') is null then raise exception 'a name is required' using errcode = '22023'; end if;
  perform public.eab_report_sql(p->'spec', r);   -- the spec must be valid and allowed for this role
  if (p->'spec'->>'source') is distinct from (p->>'source') then raise exception 'source does not match' using errcode = '22023'; end if;
  if rid is not null then
    select to_jsonb(x) into b from public.eab_saved_reports x where x.id = rid;
    if b is null then raise exception 'report not found' using errcode = 'P0002'; end if;
    update public.eab_saved_reports set name = btrim(p->>'name'), spec = p->'spec', source = p->>'source', updated_by = auth.uid(), updated_at = now() where id = rid;
  else
    insert into public.eab_saved_reports (name, source, spec, created_by, created_by_email)
      values (btrim(p->>'name'), p->>'source', p->'spec', auth.uid(), (select email from auth.users where id = auth.uid())) returning id into rid;
  end if;
  select to_jsonb(x) into a from public.eab_saved_reports x where x.id = rid;
  perform public.eab_admin_write_action('report_saved', null, 'eab_saved_reports:' || rid, 'saved report', b, a, p_device);
  return a;
end $$;

create or replace function public.eab_admin_saved_report_delete(p_id uuid, p_device text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare r text := public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']); b public.eab_saved_reports;
begin
  select * into b from public.eab_saved_reports where id = p_id;
  if b.id is null then return false; end if;
  if b.created_by <> auth.uid() and r <> 'owner' then raise exception 'only the person who saved it or the Owner can remove it' using errcode = '42501'; end if;
  delete from public.eab_saved_reports where id = p_id;
  perform public.eab_admin_write_action('report_removed', null, 'eab_saved_reports:' || p_id, 'removed saved report', to_jsonb(b), null, p_device);
  return true;
end $$;

-- =====================================================================================================
-- Board report (90): the numbers for one period. Owner + Compliance.
-- =====================================================================================================
create or replace function public.eab_board_numbers(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public, auth as $$
  with lo as (select public.eab_dash_ts(p_from) ts), hi as (select public.eab_dash_ts(p_to + 1) ts),
  closed as (
    select p.user_id, public.eab_dash_status_key(p.data) k,
           coalesce((select min(v.saved_at) from public.eab_record_revisions v
                      where v.workspace_id = p.workspace_id and v.collection = 'properties' and v.record_id = p.id
                        and public.eab_dash_status_key(v.data) in ('sold', 'rented')),
                    case when public.eab_dash_status_key(p.data) in ('sold', 'rented') then to_timestamp(p.updated / 1000.0) end) at
      from public.eab_records p where p.collection = 'properties' and not p.deleted)
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'agents', jsonb_build_object(
      'total', (select count(*) from auth.users u, hi where u.created_at < hi.ts and u.deleted_at is null),
      'new', (select count(*) from auth.users u, lo, hi where u.created_at >= lo.ts and u.created_at < hi.ts),
      'active', (select count(distinct a.user_id) from public.eab_dash_activity(p_from, p_to) a),
      'not_active_now', (select count(*) from public.eab_account_status st where st.status <> 'active'),
      'status_changes', (select count(*) from public.eab_admin_actions x, lo, hi where x.at >= lo.ts and x.at < hi.ts and x.action like 'account_%')),
    'licences', jsonb_build_object(
      'total', (select count(*) from public.eab_licences),
      'verified', (select count(*) from public.eab_licences l where l.verified),
      'expired_at_end', (select count(*) from public.eab_licences l where l.expires_on <= p_to),
      'expiring_60_after', (select count(*) from public.eab_licences l where l.expires_on > p_to and l.expires_on <= p_to + 60),
      'no_expiry_date', (select count(*) from public.eab_licences l where l.expires_on is null)),
    'listings', jsonb_build_object(
      'new', (select count(*) from public.eab_records r, lo, hi where r.collection = 'properties' and (r.data->>'created') ~ '^[0-9]+(\.[0-9]+)?$'
               and to_timestamp((r.data->>'created')::double precision / 1000) >= lo.ts and to_timestamp((r.data->>'created')::double precision / 1000) < hi.ts),
      'live_now', (select count(*) from public.eab_records r where r.collection = 'properties' and not r.deleted),
      'sold', (select count(*) from closed c, lo, hi where c.k = 'sold' and c.at >= lo.ts and c.at < hi.ts),
      'rented', (select count(*) from closed c, lo, hi where c.k = 'rented' and c.at >= lo.ts and c.at < hi.ts),
      'by_status_now', (select coalesce(jsonb_object_agg(x.k, x.n), '{}'::jsonb) from (select public.eab_dash_status_key(r.data) k, count(*) n
               from public.eab_records r where r.collection = 'properties' and not r.deleted group by 1) x),
      'by_state_now', (select coalesce(jsonb_agg(jsonb_build_object('state', x.s, 'listings', x.n) order by x.n desc), '[]'::jsonb) from (
               select coalesce(nullif(r.data->>'state', ''), 'Not set') s, count(*) n from public.eab_records r
                where r.collection = 'properties' and not r.deleted group by 1 order by 2 desc limit 10) x)),
    'complaints', jsonb_build_object(
      'received', (select count(*) from public.eab_complaints c where c.received_on between p_from and p_to),
      'by_category', (select coalesce(jsonb_object_agg(x.c, x.n), '{}'::jsonb) from (select category c, count(*) n from public.eab_complaints
               where received_on between p_from and p_to group by 1) x),
      'resolved', (select count(*) from public.eab_complaint_events e, lo, hi where e.kind = 'status' and e.to_status in ('resolved', 'dismissed', 'referred') and e.at >= lo.ts and e.at < hi.ts),
      'open_at_end', (select count(*) from public.eab_complaints c where c.received_on <= p_to and (c.status in ('open', 'investigating')
               or exists (select 1 from public.eab_complaint_events e, hi where e.complaint_id = c.id and e.kind = 'status' and e.to_status in ('resolved', 'dismissed', 'referred') and e.at >= hi.ts)))),
    'pdpa', jsonb_build_object(
      'received', (select count(*) from public.eab_pdpa_requests p where p.received_on between p_from and p_to),
      'by_kind', (select coalesce(jsonb_object_agg(x.k, x.n), '{}'::jsonb) from (select kind k, count(*) n from public.eab_pdpa_requests
               where received_on between p_from and p_to group by 1) x),
      'with_deadline', (select count(*) from public.eab_pdpa_requests p where p.received_on between p_from and p_to and p.kind in ('access', 'correction')),
      'answered_in_21', (select count(*) from public.eab_pdpa_requests p where p.received_on between p_from and p_to and p.kind in ('access', 'correction')
               and coalesce(p.supplied_on, p.decided_on) is not null and coalesce(p.supplied_on, p.decided_on) - p.received_on <= 21),
      'late', (select count(*) from public.eab_pdpa_requests p where p.received_on between p_from and p_to and p.kind in ('access', 'correction')
               and coalesce(p.supplied_on, p.decided_on, public.eab_dash_today()) - p.received_on > 21)),
    'tickets', jsonb_build_object(
      'received', (select count(*) from public.eab_bug_reports b, lo, hi where b.created_at >= lo.ts and b.created_at < hi.ts),
      'fixed_or_closed', (select count(*) from public.eab_ticket_notes n, lo, hi where n.kind = 'status' and n.to_status in ('fixed', 'closed') and n.at >= lo.ts and n.at < hi.ts)),
    'cases', jsonb_build_object(
      'opened', (select count(*) from public.eab_reg_cases c where c.received_on between p_from and p_to),
      'closed', (select count(*) from public.eab_reg_cases c, lo, hi where c.closed_at >= lo.ts and c.closed_at < hi.ts),
      'by_requester', (select coalesce(jsonb_object_agg(x.t, x.n), '{}'::jsonb) from (select requester_type t, count(*) n from public.eab_reg_cases
               where received_on between p_from and p_to group by 1) x),
      'packs', (select count(*) from public.eab_reg_packs k, lo, hi where k.created_at >= lo.ts and k.created_at < hi.ts)),
    'admin', jsonb_build_object(
      'actions', (select count(*) from public.eab_admin_actions x, lo, hi where x.at >= lo.ts and x.at < hi.ts),
      'exports', (select count(*) from public.eab_admin_access x, lo, hi where x.kind = 'export' and x.at >= lo.ts and x.at < hi.ts),
      'top_actions', (select coalesce(jsonb_agg(jsonb_build_object('action', y.action, 'n', y.n) order by y.n desc), '[]'::jsonb) from (
               select x.action, count(*) n from public.eab_admin_actions x, lo, hi where x.at >= lo.ts and x.at < hi.ts group by 1 order by 2 desc limit 10) y))
  )
$$;

create or replace function public.eab_admin_board_report(p_month date, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m date; e date; pm date; out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  if p_month is null then raise exception 'choose a month' using errcode = '22023'; end if;
  m := date_trunc('month', p_month)::date; e := (m + interval '1 month' - interval '1 day')::date; pm := (m - interval '1 month')::date;
  if m > public.eab_dash_today() then raise exception 'the month has not started yet' using errcode = '22023'; end if;
  out := jsonb_build_object('month', m, 'month_end', e, 'complete', e < public.eab_dash_today(), 'made_at', now(),
    'current', public.eab_board_numbers(m, least(e, public.eab_dash_today())),
    'previous', public.eab_board_numbers(pm, (m - 1)));
  perform public.eab_admin_write_access('search', null, 'board report ' || to_char(m, 'YYYY-MM'), null, p_device);
  return out;
end $$;

-- =====================================================================================================
-- Annual audit bundle (129): one year of evidence. Owner + Compliance. Large lists are capped at 50,000 rows each
-- (the bundle says so when a list was cut).
-- =====================================================================================================
create or replace function public.eab_admin_audit_bundle(p_year integer, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare y int := p_year; lo timestamptz; hi timestamptz; d0 date; d1 date; cap int := 50000; out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  if y is null or y < 2026 or y > extract(year from now() at time zone 'Asia/Kuala_Lumpur') then raise exception 'choose a year from 2026 to this year' using errcode = '22023'; end if;
  d0 := make_date(y, 1, 1); d1 := make_date(y, 12, 31); lo := public.eab_dash_ts(d0); hi := public.eab_dash_ts(d1 + 1);
  select jsonb_build_object(
    'year', y, 'from', d0, 'to', d1, 'made_at', now(), 'cap', cap,
    'chain', jsonb_build_object('actions', public.eab_admin_check_chain('eab_admin_actions'), 'access', public.eab_admin_check_chain('eab_admin_access')),
    'counts', jsonb_build_object(
      'actions', (select count(*) from public.eab_admin_actions x where x.at >= lo and x.at < hi),
      'access', (select count(*) from public.eab_admin_access x where x.at >= lo and x.at < hi)),
    'actions', (select coalesce(jsonb_agg(to_jsonb(x) - 'prev_hash' - 'before' - 'after' order by x.seq), '[]'::jsonb)
       from (select * from public.eab_admin_actions where at >= lo and at < hi order by seq limit cap) x),
    'access', (select coalesce(jsonb_agg(to_jsonb(x) - 'prev_hash' - 'detail' order by x.seq), '[]'::jsonb)
       from (select * from public.eab_admin_access where at >= lo and at < hi order by seq limit cap) x),
    'backup_tests', (select coalesce(jsonb_agg(to_jsonb(t) order by t.tested_on), '[]'::jsonb) from public.eab_backup_tests t where t.tested_on between d0 and d1),
    'cases', (select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object(
         'agents', (select count(*) from public.eab_reg_case_agents a where a.case_id = c.id),
         'packs', (select coalesce(jsonb_agg(jsonb_build_object('reference', k.reference, 'kind', k.kind, 'format', k.format, 'sha256', k.sha256,
                      'content_sha256', k.content_sha256, 'created_at', k.created_at, 'stored', k.stored) order by k.created_at), '[]'::jsonb)
                   from public.eab_reg_packs k where k.case_id = c.id)) order by c.received_on), '[]'::jsonb)
       from public.eab_reg_cases c where c.received_on <= d1 and (c.closed_at is null or c.closed_at >= lo)),
    'vault', (select coalesce(jsonb_agg(jsonb_build_object('reference', k.reference, 'kind', k.kind, 'format', k.format, 'sha256', k.sha256,
         'created_at', k.created_at, 'stored', k.stored) order by k.created_at), '[]'::jsonb) from public.eab_reg_packs k where k.created_at >= lo and k.created_at < hi),
    'pdpa', (select coalesce(jsonb_agg(to_jsonb(p) - 'details' order by p.received_on), '[]'::jsonb) from public.eab_pdpa_requests p where p.received_on between d0 and d1),
    'complaints', (select coalesce(jsonb_agg(to_jsonb(c) - 'details' order by c.received_on), '[]'::jsonb) from public.eab_complaints c where c.received_on between d0 and d1),
    'holds', (select coalesce(jsonb_agg(to_jsonb(h) order by h.placed_at), '[]'::jsonb) from public.eab_legal_holds h
       where h.placed_at < hi and (h.released_at is null or h.released_at >= lo)),
    'retention_reviews', (select coalesce(jsonb_agg(to_jsonb(r) order by r.at), '[]'::jsonb) from public.eab_retention_reviews r where r.at >= lo and r.at < hi)
  ) into out;
  perform public.eab_admin_write_access('search', null, 'audit bundle ' || y,
            jsonb_build_object('actions', jsonb_array_length(out->'actions'), 'access', jsonb_array_length(out->'access')), p_device);
  return out;
end $$;

-- =====================================================================================================
-- permissions
-- =====================================================================================================
revoke all on function public.eab_report_catalog(), public.eab_report_base(text), public.eab_report_sql(jsonb, text),
  public.eab_board_numbers(date, date) from public, anon, authenticated;
revoke all on function public.eab_admin_report_catalog(), public.eab_admin_report_run(jsonb, text), public.eab_admin_saved_reports(),
  public.eab_admin_saved_report_save(jsonb, text), public.eab_admin_saved_report_delete(uuid, text),
  public.eab_admin_board_report(date, text), public.eab_admin_audit_bundle(integer, text) from public, anon;
grant execute on function public.eab_admin_report_catalog(), public.eab_admin_report_run(jsonb, text), public.eab_admin_saved_reports(),
  public.eab_admin_saved_report_save(jsonb, text), public.eab_admin_saved_report_delete(uuid, text),
  public.eab_admin_board_report(date, text), public.eab_admin_audit_bundle(integer, text) to authenticated;
