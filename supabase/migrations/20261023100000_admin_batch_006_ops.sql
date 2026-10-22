-- AdminBatch006 — Admin EAB: News & Announcements, Support & operations, Overview
--   (features 63, 15, N, 44 · 65, 68, 66, 67 · 71, 58, 22).
-- Builds on MainForAdmin-D (20261021200000_mainforadmin_d_feed.sql) and the push counts (20261021210000_push_broadcast_counts.sql),
-- which already hold posts, audience groups, order, invitation codes, minimum version and maintenance mode.
-- This file adds only what Admin EAB still needed. TEST project first; never production without Joe's approval.
-- Rollback: supabase/rollback/20261023100000_admin_batch_006_ops_rollback.sql
--
-- In plain words:
--   * NEWS: read the order of a group, preview how many agents a filter matches before saving a group, list who got a
--     project through an invitation code. Pictures and PDFs for posts go in a new PUBLIC folder "eab-feed-media"
--     (Owner / Admin upload; nobody can change or delete a file through the API).
--   * SUPPORT TICKETS: the main app's problem reports get a status history and internal notes (eab_ticket_notes, kept
--     for good, never changed). Owner / Admin change status and write notes; Compliance reads. The screenshot can be
--     opened by Owner / Admin / Compliance.
--   * FEATURE FLAGS: one switch per feature for everyone or chosen audience groups (eab_feature_flags). The main app
--     can read its own switches with eab_my_flags(); until it does, the switches change nothing on phones.
--   * OVERVIEW: Master Dashboard numbers and red alerts, Top Agents, Live Users Now.
--   Maintenance mode and the minimum app version already use eab_admin_set_settings (MainForAdmin-D).

-- =====================================================================================================
-- tables
-- =====================================================================================================
create table if not exists public.eab_ticket_notes (
  id          bigint generated always as identity primary key,
  report_id   uuid not null references public.eab_bug_reports (id) on delete restrict,
  kind        text not null check (kind in ('note', 'status')),
  body        text check (body is null or char_length(body) between 1 and 4000),
  from_status text check (from_status is null or from_status in ('new', 'seen', 'fixed', 'closed')),
  to_status   text check (to_status is null or to_status in ('new', 'seen', 'fixed', 'closed')),
  by_user     uuid not null,
  by_email    text,
  at          timestamptz not null default now(),
  check (kind = 'note' and body is not null or kind = 'status' and to_status is not null)
);
create index if not exists eab_ticket_notes_report on public.eab_ticket_notes (report_id, at);

create or replace function public.eab_ticket_notes_fixed() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'ticket notes cannot be changed or deleted' using errcode = '42501';
end $$;
create or replace trigger eab_ticket_notes_fixed before update or delete on public.eab_ticket_notes for each row execute function public.eab_ticket_notes_fixed();
create or replace trigger eab_ticket_notes_notrunc before truncate on public.eab_ticket_notes for each statement execute function public.eab_ticket_notes_fixed();

create table if not exists public.eab_feature_flags (
  key         text primary key check (key ~ '^[a-z0-9][a-z0-9_.-]{1,59}$'),
  label       text not null check (char_length(label) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  enabled     boolean not null default false,
  audience    text not null default 'all' check (audience in ('all', 'groups')),
  group_ids   uuid[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

alter table public.eab_ticket_notes enable row level security;
alter table public.eab_feature_flags enable row level security;
revoke all on public.eab_ticket_notes, public.eab_feature_flags from anon, authenticated, public;

-- Public folder for post pictures and PDFs (the main app shows them by link, so they must be readable without sign-in).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('eab-feed-media', 'eab-feed-media', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create or replace function public.eab_feed_media_can_upload(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.eab_admin_role() in ('owner', 'admin'), false)
     and p_name ~ '^[0-9]{4}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$'
$$;
create or replace function public.eab_ticket_can_read(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.eab_admin_role() in ('owner', 'admin', 'compliance'), false)
     and exists (select 1 from public.eab_bug_reports r where r.screenshot_path = p_name)
$$;
drop policy if exists "eab feed media upload" on storage.objects;
create policy "eab feed media upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'eab-feed-media' and public.eab_feed_media_can_upload(name));
drop policy if exists "eab admin read bug screenshots" on storage.objects;
create policy "eab admin read bug screenshots" on storage.objects for select to authenticated
  using (bucket_id = 'bug-reports' and public.eab_ticket_can_read(name));
-- no update or delete policy: uploaded post files and screenshots cannot be replaced or removed through the API.

-- =====================================================================================================
-- Part A — News & Announcements helpers
-- =====================================================================================================
-- The saved order of one group (position 1 = first).
create or replace function public.eab_admin_feed_order_get(p_group uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  return coalesce((select jsonb_agg(jsonb_build_object('item_id', o.item_id, 'position', o.position) order by o.position)
    from public.eab_feed_order o where o.group_id = p_group), '[]'::jsonb);
end $$;

-- How many agents a group's filters match now — shown BEFORE saving a group (counts only, no names).
create or replace function public.eab_admin_group_preview(p_filters jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare f jsonb := coalesce(p_filters, '{}'::jsonb);
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  if jsonb_typeof(f) <> 'object' then raise exception 'filters must be an object' using errcode = '22023'; end if;
  return jsonb_build_object(
    'agents', (select count(*) from auth.users u where u.deleted_at is null and public.eab_filters_match(f, public.eab_agent_facts(u.id), u.id)),
    'of', (select count(*) from auth.users u where u.deleted_at is null));
end $$;

-- Who got projects through an invitation code (names: owner / admin / compliance; written to the access log).
create or replace function public.eab_admin_code_grants(p_code text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  select coalesce(jsonb_agg(jsonb_build_object('user_id', g.user_id, 'email', u.email, 'name', public.eab_admin_name(u),
           'item_id', g.item_id, 'title', f.title_en, 'granted_at', g.granted_at) order by g.granted_at desc), '[]'::jsonb)
    into out
    from public.eab_feed_code_grants g join auth.users u on u.id = g.user_id left join public.eab_feed_items f on f.id = g.item_id
   where g.code = p_code;
  perform public.eab_admin_write_access('search', null, 'invitation code: ' || left(coalesce(p_code, ''), 20),
            jsonb_build_object('results', jsonb_array_length(out)), p_device);
  return out;
end $$;

-- =====================================================================================================
-- Part B — Support tickets (feature 65)
-- =====================================================================================================
create or replace function public.eab_admin_tickets(p_status text default null, p_q text default null, p_limit integer default 200,
                                                    p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare q text := nullif(btrim(coalesce(p_q, '')), ''); out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  if p_status is not null and p_status not in ('new', 'seen', 'fixed', 'closed', 'open') then raise exception 'unknown status' using errcode = '22023'; end if;
  select jsonb_build_object(
    'counts', (select coalesce(jsonb_object_agg(x.status, x.n), '{}'::jsonb) from (select r.status, count(*) n from public.eab_bug_reports r group by 1) x),
    'tickets', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'user_id', r.user_id, 'email', u.email, 'name', public.eab_admin_name(u), 'description', r.description,
        'has_screenshot', r.screenshot_path is not null, 'app_version', r.app_version, 'platform', r.platform, 'language', r.language,
        'screen', r.screen, 'status', r.status, 'created_at', r.created_at,
        'notes', (select count(*) from public.eab_ticket_notes n where n.report_id = r.id and n.kind = 'note'),
        'last_activity', greatest(r.created_at, (select max(n.at) from public.eab_ticket_notes n where n.report_id = r.id)))
        order by r.created_at desc), '[]'::jsonb)
      from (select * from public.eab_bug_reports b
             where (p_status is null or b.status = p_status or (p_status = 'open' and b.status in ('new', 'seen')))
               and (q is null or b.description ilike '%' || q || '%' or exists (select 1 from auth.users x where x.id = b.user_id and x.email ilike '%' || q || '%'))
             order by b.created_at desc limit least(greatest(coalesce(p_limit, 200), 1), 1000)) r
      left join auth.users u on u.id = r.user_id)
  ) into out;
  perform public.eab_admin_write_access('search', null, 'tickets' || coalesce(': ' || p_status, '') || coalesce(' "' || left(q, 60) || '"', ''),
            jsonb_build_object('results', jsonb_array_length(out->'tickets')), p_device);
  return out;
end $$;

create or replace function public.eab_admin_ticket(p_id uuid, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  select to_jsonb(r) || jsonb_build_object('email', u.email, 'name', public.eab_admin_name(u),
           'history', (select coalesce(jsonb_agg(to_jsonb(n) order by n.at, n.id), '[]'::jsonb) from public.eab_ticket_notes n where n.report_id = r.id))
    into out from public.eab_bug_reports r left join auth.users u on u.id = r.user_id where r.id = p_id;
  if out is null then raise exception 'ticket not found' using errcode = 'P0002'; end if;
  perform public.eab_admin_write_access('search', (out->>'user_id')::uuid, 'ticket: ' || p_id, null, p_device);
  return out;
end $$;

-- Status change with a note (the note is the reason; both are kept for good and go to the Master Audit Log).
create or replace function public.eab_admin_ticket_set_status(p_id uuid, p_status text, p_note text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare cur text; uid uuid;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if p_status not in ('new', 'seen', 'fixed', 'closed') then raise exception 'unknown status' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'a note is required' using errcode = '22023'; end if;
  select r.status, r.user_id into cur, uid from public.eab_bug_reports r where r.id = p_id for update;
  if cur is null then raise exception 'ticket not found' using errcode = 'P0002'; end if;
  if cur = p_status then raise exception 'the ticket already has this status' using errcode = '22023'; end if;
  update public.eab_bug_reports set status = p_status where id = p_id;
  insert into public.eab_ticket_notes (report_id, kind, body, from_status, to_status, by_user, by_email)
    values (p_id, 'status', left(btrim(p_note), 4000), cur, p_status, auth.uid(), (select email from auth.users where id = auth.uid()));
  perform public.eab_admin_write_action('ticket_status', uid, 'eab_bug_reports:' || p_id, btrim(p_note),
            jsonb_build_object('status', cur), jsonb_build_object('status', p_status), p_device);
  return public.eab_admin_ticket(p_id, p_device);
end $$;

create or replace function public.eab_admin_ticket_note(p_id uuid, p_note text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'the note is empty' using errcode = '22023'; end if;
  select r.user_id into uid from public.eab_bug_reports r where r.id = p_id;
  if not found then raise exception 'ticket not found' using errcode = 'P0002'; end if;
  insert into public.eab_ticket_notes (report_id, kind, body, by_user, by_email)
    values (p_id, 'note', left(btrim(p_note), 4000), auth.uid(), (select email from auth.users where id = auth.uid()));
  perform public.eab_admin_write_action('ticket_note', uid, 'eab_bug_reports:' || p_id, 'internal note', null,
            jsonb_build_object('note', left(btrim(p_note), 4000)), p_device);
  return public.eab_admin_ticket(p_id, p_device);
end $$;

-- =====================================================================================================
-- Part B — Feature flags (feature 67)
-- =====================================================================================================
create or replace function public.eab_admin_flags() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  return coalesce((select jsonb_agg(to_jsonb(f) order by f.label) from public.eab_feature_flags f), '[]'::jsonb);
end $$;

create or replace function public.eab_admin_flag_save(p_flag jsonb, p_reason text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text := lower(btrim(coalesce(p_flag->>'key', ''))); before jsonb; after jsonb; gids uuid[];
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  if k !~ '^[a-z0-9][a-z0-9_.-]{1,59}$' then raise exception 'the key must be 2-60 small letters, digits, dot, dash or underscore' using errcode = '22023'; end if;
  if p_flag ? 'audience' and p_flag->>'audience' not in ('all', 'groups') then raise exception 'audience must be all or groups' using errcode = '22023'; end if;
  if p_flag ? 'group_ids' then
    select coalesce(array_agg(x::uuid), '{}') into gids from jsonb_array_elements_text(p_flag->'group_ids') x;
    if exists (select 1 from unnest(gids) g where not exists (select 1 from public.eab_audience_groups a where a.id = g)) then
      raise exception 'unknown audience group' using errcode = '22023';
    end if;
  end if;
  select to_jsonb(f) into before from public.eab_feature_flags f where f.key = k;
  if before is null then
    if nullif(btrim(coalesce(p_flag->>'label', '')), '') is null then raise exception 'a name is required' using errcode = '22023'; end if;
    insert into public.eab_feature_flags (key, label) values (k, btrim(p_flag->>'label'));
  end if;
  update public.eab_feature_flags set
    label = coalesce(nullif(btrim(p_flag->>'label'), ''), label),
    description = case when p_flag ? 'description' then nullif(btrim(p_flag->>'description'), '') else description end,
    enabled = case when p_flag ? 'enabled' then coalesce((p_flag->>'enabled')::boolean, false) else enabled end,
    audience = coalesce(p_flag->>'audience', audience),
    group_ids = coalesce(gids, group_ids),
    updated_at = now(), updated_by = auth.uid()
   where key = k;
  select to_jsonb(f) into after from public.eab_feature_flags f where f.key = k;
  if after->>'audience' = 'groups' and cardinality(coalesce((select group_ids from public.eab_feature_flags where key = k), '{}')) = 0 then
    raise exception 'choose at least one group, or set the audience to everyone' using errcode = '22023';
  end if;
  perform public.eab_admin_write_action('flag_saved', null, 'eab_feature_flags:' || k, p_reason, before, after, p_device);
  return after;
end $$;

-- For the main app (signed-in agent): which switches are on for me. {"key": true, ...}; unknown keys = off.
create or replace function public.eab_my_flags() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(f.key, f.enabled and (f.audience = 'all'
           or exists (select 1 from public.eab_my_groups(auth.uid()) g where g.group_id = any (f.group_ids)))), '{}'::jsonb)
    from public.eab_feature_flags f where auth.uid() is not null
$$;

-- =====================================================================================================
-- Part C — Overview: Master Dashboard (71), Top Agents (58), Live Users Now (22)
-- =====================================================================================================
create or replace function public.eab_admin_dash_master() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare today date := public.eab_dash_today(); lim public.eab_health_limits; s public.eab_settings;
        dbb bigint; sb bigint; last_pass date; out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  select * into lim from public.eab_health_limits where id;
  select * into s from public.eab_settings where id;
  dbb := pg_database_size(current_database());
  select coalesce(sum((o.metadata->>'size')::bigint), 0) into sb from storage.objects o;
  select max(t.tested_on) into last_pass from public.eab_backup_tests t where t.kind = 'restore_test' and t.result = 'pass';
  with a as (select * from public.eab_dash_activity(today - 89, today)),
  per as (select a.user_id, max(a.day) last_day, count(*) filter (where a.day > today - 30) recent,
                 count(*) filter (where a.day between today - 59 and today - 30) prev from a group by a.user_id)
  select jsonb_build_object(
    'checked_at', now(), 'today', today,
    'agents', (select count(*) from auth.users u where u.deleted_at is null),
    'new_7d', (select count(*) from auth.users u where (u.created_at at time zone 'Asia/Kuala_Lumpur')::date > today - 7),
    'active_today', (select count(distinct a.user_id) from a where a.day = today),
    'active_7d', (select count(distinct a.user_id) from a where a.day > today - 7),
    'active_30d', (select count(distinct a.user_id) from a where a.day > today - 30),
    'at_risk', (select count(*) from per p where p.last_day <= today - 14 or (p.prev >= 2 and p.recent < p.prev / 2.0)),
    'live_now', (select count(distinct e.user_id) from public.eab_usage_events e where e.at > now() - interval '5 minutes'),
    'listings', (select count(*) from public.eab_records r where r.collection = 'properties' and not r.deleted),
    'stale', (select count(*) from public.eab_records r where r.collection = 'properties' and not r.deleted
               and public.eab_dash_status_key(r.data) = 'available' and r.updated < (extract(epoch from now() - interval '60 days') * 1000)::bigint),
    'closed_30d', (select count(*) from public.eab_records r where r.collection = 'properties' and not r.deleted
               and public.eab_dash_status_key(r.data) in ('sold', 'rented') and r.updated >= (extract(epoch from now() - interval '30 days') * 1000)::bigint),
    'db_bytes', dbb, 'db_limit_bytes', lim.db_limit_mb::bigint * 1048576,
    'files_bytes', sb, 'files_limit_bytes', lim.storage_limit_mb::bigint * 1048576,
    'aws_backup', lim.aws_backup, 'last_restore_pass', last_pass,
    'sync_runs_7d', (select count(*) from public.eab_usage_events e where e.kind = 'sync' and e.name = 'sync.run' and e.at > now() - interval '7 days'),
    'sync_fails_7d', (select count(*) from public.eab_usage_events e where e.kind = 'sync' and e.name = 'sync.run' and not e.ok and e.at > now() - interval '7 days'),
    'tickets_new', (select count(*) from public.eab_bug_reports r where r.status = 'new'),
    'tickets_open', (select count(*) from public.eab_bug_reports r where r.status in ('new', 'seen')),
    'pushes_waiting', (select count(*) from public.eab_push_broadcasts b where b.status = 'queued'),
    'posts_live', (select count(*) from public.eab_feed_items i where i.status = 'published' and (i.expires_at is null or i.expires_at > now())),
    'maintenance_on', coalesce(s.maintenance_on, false), 'maintenance_back_at', s.maintenance_back_at,
    'min_version', s.min_version, 'min_version_mode', s.min_version_mode,
    'flags_on', (select count(*) from public.eab_feature_flags f where f.enabled),
    'licences_unverified', (select count(*) from public.eab_licences l where not coalesce(l.verified, false)),
    'accounts_not_active', (select count(*) from public.eab_account_status st where st.status <> 'active'),
    'active_by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'agents', d.n) order by d.day), '[]'::jsonb)
       from (select g::date as day, (select count(distinct a.user_id) from a where a.day = g::date) n
               from generate_series(today - 13, today, interval '1 day') g) d)
  ) into out;
  return out;
end $$;

-- Top agents for a period (names, so owner / admin / compliance; written to the access log).
--   closed = listings that became Sold or Rented in the period (first saved version with that status, or the last change
--   of a listing that is Sold / Rented now when no version history exists).
create or replace function public.eab_admin_dash_top_agents(p_from date default null, p_to date default null, p_limit integer default 50,
                                                            p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare today date := public.eab_dash_today(); f date := coalesce(p_from, today - 29); t date := coalesce(p_to, today);
        lo timestamptz; hi timestamptz; out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  perform public.eab_dash_check_range(f, t);
  lo := public.eab_dash_ts(f); hi := public.eab_dash_ts(t + 1);
  with props as (select r.* from public.eab_records r where r.collection = 'properties'),
  closed as (
    select p.user_id, p.id,
           coalesce((select min(v.saved_at) from public.eab_record_revisions v
                      where v.workspace_id = p.workspace_id and v.collection = 'properties' and v.record_id = p.id
                        and public.eab_dash_status_key(v.data) in ('sold', 'rented')),
                    case when public.eab_dash_status_key(p.data) in ('sold', 'rented') then to_timestamp(p.updated / 1000.0) end) at
      from props p where not p.deleted),
  act as (select x.user_id, count(*) days from public.eab_dash_activity(f, t) x group by x.user_id),
  ev as (select e.user_id, count(*) n from public.eab_usage_events e
          where e.at >= lo and e.at < hi and e.kind in ('screen', 'feature') group by e.user_id),
  agg as (
    select u.id user_id, u.email, public.eab_admin_name(u) name,
           (select count(*) from props p where p.user_id = u.id and not p.deleted) listings,
           (select count(*) from props p where p.user_id = u.id and (p.data->>'created') ~ '^[0-9]+(\.[0-9]+)?$'
               and to_timestamp((p.data->>'created')::double precision / 1000) >= lo
               and to_timestamp((p.data->>'created')::double precision / 1000) < hi) new_listings,
           (select count(*) from closed c join props p on p.user_id = c.user_id and p.id = c.id
             where c.user_id = u.id and c.at >= lo and c.at < hi and public.eab_dash_status_key(p.data) = 'sold') sold,
           (select count(*) from closed c join props p on p.user_id = c.user_id and p.id = c.id
             where c.user_id = u.id and c.at >= lo and c.at < hi and public.eab_dash_status_key(p.data) = 'rented') rented,
           coalesce((select act.days from act where act.user_id = u.id), 0) active_days,
           coalesce((select ev.n from ev where ev.user_id = u.id), 0) actions
      from auth.users u where u.deleted_at is null)
  select jsonb_build_object('from', f, 'to', t,
    'agents', coalesce(jsonb_agg(to_jsonb(agg) || jsonb_build_object('closed', agg.sold + agg.rented)
                order by agg.sold + agg.rented desc, agg.new_listings desc, agg.active_days desc, agg.actions desc, agg.email), '[]'::jsonb))
    into out
    from (select * from agg where agg.listings + agg.active_days + agg.actions > 0
           order by agg.sold + agg.rented desc, agg.new_listings desc, agg.active_days desc, agg.actions desc, agg.email
           limit least(greatest(coalesce(p_limit, 50), 1), 500)) agg;
  perform public.eab_admin_write_access('search', null, 'dashboard: top agents ' || f || '..' || t,
            jsonb_build_object('results', jsonb_array_length(out->'agents')), p_device);
  return out;
end $$;

-- Who used the app in the last few minutes, and on which screen. Counts for everyone; names for owner / admin / compliance.
create or replace function public.eab_admin_live_users(p_minutes integer default 5, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare m integer := coalesce(p_minutes, 5); names boolean; out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  if m < 1 or m > 60 then raise exception 'minutes must be 1 to 60' using errcode = '22023'; end if;
  names := public.eab_dash_names();
  with ev as (select * from public.eab_usage_events e where e.at > now() - make_interval(mins => m) and e.user_id is not null),
  l as (select distinct on (ev.user_id) ev.user_id, ev.at, ev.app_version, ev.platform, ev.device from ev order by ev.user_id, ev.at desc),
  sc as (select distinct on (ev.user_id) ev.user_id, coalesce(ev.screen, ev.name) screen from ev where ev.kind = 'screen' order by ev.user_id, ev.at desc)
  select jsonb_build_object('minutes', m, 'checked_at', now(), 'count', (select count(*) from l), 'names_hidden', not names,
    'by_screen', (select coalesce(jsonb_agg(jsonb_build_object('screen', x.s, 'agents', x.n) order by x.n desc), '[]'::jsonb)
       from (select coalesce(sc.screen, 'unknown') s, count(*) n from l left join sc on sc.user_id = l.user_id group by 1) x),
    'agents', case when names then (select coalesce(jsonb_agg(jsonb_build_object('user_id', l.user_id, 'email', u.email,
        'name', public.eab_admin_name(u), 'last_at', l.at, 'screen', sc.screen, 'app_version', l.app_version, 'platform', l.platform,
        'device', l.device) order by l.at desc), '[]'::jsonb) from l join auth.users u on u.id = l.user_id left join sc on sc.user_id = l.user_id) end)
    into out;
  if names then
    perform public.eab_admin_write_access('search', null, 'dashboard: live users ' || m || ' min',
              jsonb_build_object('results', (out->>'count')::int), p_device);
  end if;
  return out;
end $$;

-- =====================================================================================================
-- permissions
-- =====================================================================================================
revoke all on function public.eab_ticket_notes_fixed() from public, anon, authenticated;
-- the storage-policy helpers run as the signed-in user, so authenticated keeps execute (as eab_vault_can_*)
revoke all on function public.eab_feed_media_can_upload(text), public.eab_ticket_can_read(text) from public, anon;
grant execute on function public.eab_feed_media_can_upload(text), public.eab_ticket_can_read(text) to authenticated;
revoke all on function public.eab_admin_feed_order_get(uuid), public.eab_admin_group_preview(jsonb), public.eab_admin_code_grants(text, text),
  public.eab_admin_tickets(text, text, integer, text), public.eab_admin_ticket(uuid, text), public.eab_admin_ticket_set_status(uuid, text, text, text),
  public.eab_admin_ticket_note(uuid, text, text), public.eab_admin_flags(), public.eab_admin_flag_save(jsonb, text, text), public.eab_my_flags(),
  public.eab_admin_dash_master(), public.eab_admin_dash_top_agents(date, date, integer, text), public.eab_admin_live_users(integer, text) from public, anon;
grant execute on function public.eab_admin_feed_order_get(uuid), public.eab_admin_group_preview(jsonb), public.eab_admin_code_grants(text, text),
  public.eab_admin_tickets(text, text, integer, text), public.eab_admin_ticket(uuid, text), public.eab_admin_ticket_set_status(uuid, text, text, text),
  public.eab_admin_ticket_note(uuid, text, text), public.eab_admin_flags(), public.eab_admin_flag_save(jsonb, text, text), public.eab_my_flags(),
  public.eab_admin_dash_master(), public.eab_admin_dash_top_agents(date, date, integer, text), public.eab_admin_live_users(integer, text) to authenticated;
