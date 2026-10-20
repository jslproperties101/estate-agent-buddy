-- MainForAdmin-A — database foundation for Admin EAB (JoyChange009-Main.txt items A1-A5).
-- Applied to the TEST project (EAB-QA-Test) first. Never to production without Joe's approval.
-- Rollback: supabase/rollback/20261021000000_admin_eab_foundation_rollback.sql
--
-- What this does, in plain words:
--   A1  every saved version of every record is kept (the old "last 25 only" clean-up is removed).
--   A2  deleting a Google account or a workspace can no longer silently wipe records, history, files or audit
--       entries: those links now BLOCK the delete instead of cascading. Accounts are closed/banned instead.
--   A3  admin allow-list (eab_admins) with roles owner / admin / compliance / viewer / regulator, plus scopes that
--       limit a regulator to named agents, dates and an expiry. Nobody can add themselves: no policy, no grant.
--   A4  two tamper-proof logs: eab_admin_actions (what admins DID) and eab_admin_access (what admins SAW, searched or
--       exported). Each row carries sha256(previous hash + its own contents); rows can never be changed or deleted.
--   A5  server-side functions Admin EAB calls. Each checks the caller's role first and writes an access entry.
-- Admin EAB never holds the service-role key; it signs in with Google like the main app and calls these functions.

-- =====================================================================================================
-- A1. keep every record version
-- =====================================================================================================
create or replace function public.eab_keep_revision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.data is distinct from new.data or old.deleted <> new.deleted then
    insert into public.eab_record_revisions (workspace_id, collection, record_id, rev, data, deleted, saved_by, saved_at)
      values (old.workspace_id, old.collection, old.id, old.rev, old.data, old.deleted, old.written_by, old.written_at)
      on conflict do nothing;
    -- No clean-up here any more: versions are kept for the 7-year audit period. Removal only through the Admin EAB
    -- retention manager after Owner approval (later batch).
  end if;
  return new;
end $$;

-- =====================================================================================================
-- A2. block deletes that would wipe audit-relevant data (was ON DELETE CASCADE)
-- =====================================================================================================
alter table public.eab_records          drop constraint if exists eab_records_user_id_fkey,
  add constraint eab_records_user_id_fkey foreign key (user_id) references auth.users (id) on delete restrict;
alter table public.eab_records          drop constraint if exists eab_records_workspace_id_fkey,
  add constraint eab_records_workspace_id_fkey foreign key (workspace_id) references public.eab_workspaces (id) on delete restrict;
alter table public.eab_record_revisions drop constraint if exists eab_record_revisions_workspace_id_fkey,
  add constraint eab_record_revisions_workspace_id_fkey foreign key (workspace_id) references public.eab_workspaces (id) on delete restrict;
alter table public.eab_files            drop constraint if exists eab_files_workspace_id_fkey,
  add constraint eab_files_workspace_id_fkey foreign key (workspace_id) references public.eab_workspaces (id) on delete restrict;
alter table public.eab_files            drop constraint if exists eab_files_uploaded_by_fkey,
  add constraint eab_files_uploaded_by_fkey foreign key (uploaded_by) references auth.users (id) on delete restrict;
alter table public.eab_audit            drop constraint if exists eab_audit_workspace_id_fkey,
  add constraint eab_audit_workspace_id_fkey foreign key (workspace_id) references public.eab_workspaces (id) on delete restrict;
alter table public.eab_members          drop constraint if exists eab_members_user_id_fkey,
  add constraint eab_members_user_id_fkey foreign key (user_id) references auth.users (id) on delete restrict;
alter table public.eab_members          drop constraint if exists eab_members_workspace_id_fkey,
  add constraint eab_members_workspace_id_fkey foreign key (workspace_id) references public.eab_workspaces (id) on delete restrict;
alter table public.eab_bug_reports      drop constraint if exists eab_bug_reports_user_id_fkey,
  add constraint eab_bug_reports_user_id_fkey foreign key (user_id) references auth.users (id) on delete restrict;
alter table public.eab_teams            drop constraint if exists eab_teams_created_by_fkey,
  add constraint eab_teams_created_by_fkey foreign key (created_by) references auth.users (id) on delete restrict;
alter table public.eab_team_members     drop constraint if exists eab_team_members_user_id_fkey,
  add constraint eab_team_members_user_id_fkey foreign key (user_id) references auth.users (id) on delete restrict;
alter table public.eab_team_members     drop constraint if exists eab_team_members_team_id_fkey,
  add constraint eab_team_members_team_id_fkey foreign key (team_id) references public.eab_teams (id) on delete restrict;
alter table public.eab_delete_requests  drop constraint if exists eab_delete_requests_team_id_fkey,
  add constraint eab_delete_requests_team_id_fkey foreign key (team_id) references public.eab_teams (id) on delete restrict;
-- Left as cascade on purpose (no audit value): push tokens, push sent, invites, shares, user options, developers,
-- usage events/daily (usage detail has its own 365-day clean-up), property refs and duplicates (rebuilt from records).

-- =====================================================================================================
-- A3. admin allow-list, roles and regulator scopes
-- =====================================================================================================
create table if not exists public.eab_admins (
  user_id     uuid primary key references auth.users (id) on delete restrict,
  email       text not null check (char_length(email) between 3 and 320),
  role        text not null check (role in ('owner', 'admin', 'compliance', 'viewer', 'regulator')),
  active      boolean not null default true,
  expires_at  timestamptz,
  note        text check (note is null or char_length(note) <= 500),
  added_by    uuid,
  added_at    timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table if not exists public.eab_admin_scopes (
  id          uuid primary key default gen_random_uuid(),
  admin_user  uuid not null references public.eab_admins (user_id) on delete restrict,
  agent_user  uuid not null references auth.users (id) on delete restrict,
  date_from   date,
  date_to     date,
  case_ref    text check (case_ref is null or char_length(case_ref) <= 120),
  expires_at  timestamptz not null,
  created_by  uuid not null,
  created_at  timestamptz not null default now()
);
create index if not exists eab_admin_scopes_admin on public.eab_admin_scopes (admin_user, agent_user);
alter table public.eab_admins enable row level security;
alter table public.eab_admin_scopes enable row level security;
revoke all on public.eab_admins, public.eab_admin_scopes from anon, authenticated, public;

-- The caller's admin role, or null (not on the list, switched off, or expired).
create or replace function public.eab_admin_role() returns text
language sql stable security definer set search_path = public as $$
  select a.role from public.eab_admins a
   where a.user_id = auth.uid() and a.active and (a.expires_at is null or a.expires_at > now())
$$;

-- Raises 'not allowed' unless the caller holds one of the given roles. Returns the role.
create or replace function public.eab_admin_guard(p_roles text[]) returns text
language plpgsql stable security definer set search_path = public as $$
declare r text := public.eab_admin_role();
begin
  if r is null or not (r = any (p_roles)) then raise exception 'not allowed' using errcode = '42501'; end if;
  return r;
end $$;

-- May the caller see this agent? Everyone except a regulator; a regulator only inside an unexpired scope.
create or replace function public.eab_admin_can_see(p_agent uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when r is null then false
    when r = 'regulator' then exists (select 1 from public.eab_admin_scopes s
                                       where s.admin_user = auth.uid() and s.agent_user = p_agent and s.expires_at > now())
    else true end
  from (select public.eab_admin_role() r) x
$$;

-- The usage dashboard's developer list keeps working, and owners/admins count as developers too (one allow-list).
create or replace function public.eab_is_developer() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from public.eab_developers where user_id = auth.uid())
    or coalesce(public.eab_admin_role() in ('owner', 'admin'), false));
$$;

-- =====================================================================================================
-- A4. tamper-proof admin logs (hash chain)
-- =====================================================================================================
create table if not exists public.eab_admin_actions (
  seq         bigserial primary key,
  at          timestamptz not null default now(),
  admin_user  uuid not null,
  admin_email text,
  admin_role  text,
  action      text not null check (char_length(action) between 2 and 60),
  target_user uuid,
  target_ref  text check (target_ref is null or char_length(target_ref) <= 300),
  reason      text check (reason is null or char_length(reason) <= 2000),
  before      jsonb,
  after       jsonb,
  device      text check (device is null or char_length(device) <= 300),
  prev_hash   text not null,
  hash        text not null
);
create table if not exists public.eab_admin_access (
  seq         bigserial primary key,
  at          timestamptz not null default now(),
  admin_user  uuid not null,
  admin_email text,
  admin_role  text,
  kind        text not null check (kind in ('sign_in', 'search', 'view_agent', 'view_records', 'view_history',
                                           'view_actions', 'view_access', 'verify_chain', 'export')),
  target_user uuid,
  target_ref  text check (target_ref is null or char_length(target_ref) <= 300),
  detail      jsonb,
  device      text check (device is null or char_length(device) <= 300),
  prev_hash   text not null,
  hash        text not null
);
create index if not exists eab_admin_actions_target on public.eab_admin_actions (target_user, at desc);
create index if not exists eab_admin_access_target on public.eab_admin_access (target_user, at desc);
create index if not exists eab_admin_access_admin on public.eab_admin_access (admin_user, at desc);
alter table public.eab_admin_actions enable row level security;
alter table public.eab_admin_access enable row level security;
revoke all on public.eab_admin_actions, public.eab_admin_access from anon, authenticated, public;
revoke all on sequence public.eab_admin_actions_seq_seq, public.eab_admin_access_seq_seq from anon, authenticated, public;

-- The exact text that is hashed for a row (same function used when writing and when checking).
create or replace function public.eab_admin_row_text(p_tbl text, r jsonb) returns text
language sql immutable as $$
  select p_tbl || '|' || (r - 'hash' - 'prev_hash' - 'at' - 'seq')::text
         || '|seq=' || (r->>'seq') || '|at=' || (r->>'at_us')
$$;

create or replace function public.eab_admin_chain() returns trigger
language plpgsql security definer set search_path = public as $$
declare prev text; body jsonb;
begin
  -- One writer at a time per log, so the chain never forks.
  perform pg_advisory_xact_lock(hashtext('eab_admin_chain:' || tg_table_name));
  execute format('select hash from public.%I order by seq desc limit 1', tg_table_name) into prev;
  new.prev_hash := coalesce(prev, 'GENESIS');
  new.at := now();
  body := to_jsonb(new) || jsonb_build_object('at_us', (extract(epoch from new.at) * 1000000)::bigint);
  new.hash := encode(sha256(convert_to(new.prev_hash || '|' || public.eab_admin_row_text(tg_table_name, body), 'UTF8')), 'hex');
  return new;
end $$;

create or replace function public.eab_admin_no_change() returns trigger
language plpgsql as $$
begin
  raise exception 'admin logs cannot be changed or deleted' using errcode = '42501';
end $$;

drop trigger if exists eab_admin_actions_chain on public.eab_admin_actions;
create trigger eab_admin_actions_chain before insert on public.eab_admin_actions for each row execute function public.eab_admin_chain();
drop trigger if exists eab_admin_access_chain on public.eab_admin_access;
create trigger eab_admin_access_chain before insert on public.eab_admin_access for each row execute function public.eab_admin_chain();
drop trigger if exists eab_admin_actions_lock on public.eab_admin_actions;
create trigger eab_admin_actions_lock before update or delete on public.eab_admin_actions for each row execute function public.eab_admin_no_change();
drop trigger if exists eab_admin_access_lock on public.eab_admin_access;
create trigger eab_admin_access_lock before update or delete on public.eab_admin_access for each row execute function public.eab_admin_no_change();
drop trigger if exists eab_admin_actions_notrunc on public.eab_admin_actions;
create trigger eab_admin_actions_notrunc before truncate on public.eab_admin_actions for each statement execute function public.eab_admin_no_change();
drop trigger if exists eab_admin_access_notrunc on public.eab_admin_access;
create trigger eab_admin_access_notrunc before truncate on public.eab_admin_access for each statement execute function public.eab_admin_no_change();

-- internal writers (not callable by apps)
create or replace function public.eab_admin_write_access(p_kind text, p_target uuid, p_ref text, p_detail jsonb, p_device text)
returns void language sql security definer set search_path = public, auth as $$
  insert into public.eab_admin_access (admin_user, admin_email, admin_role, kind, target_user, target_ref, detail, device, prev_hash, hash)
  values (auth.uid(), (select email from auth.users where id = auth.uid()), public.eab_admin_role(),
          p_kind, p_target, left(p_ref, 300), p_detail, left(p_device, 300), '', '');
$$;
create or replace function public.eab_admin_write_action(p_action text, p_target uuid, p_ref text, p_reason text,
                                                         p_before jsonb, p_after jsonb, p_device text)
returns void language sql security definer set search_path = public, auth as $$
  insert into public.eab_admin_actions (admin_user, admin_email, admin_role, action, target_user, target_ref, reason, before, after, device, prev_hash, hash)
  values (auth.uid(), (select email from auth.users where id = auth.uid()), public.eab_admin_role(),
          p_action, p_target, left(p_ref, 300), p_reason, p_before, p_after, left(p_device, 300), '', '');
$$;

-- Re-computes the whole chain. Returns {ok, checked, first_bad_seq}.
create or replace function public.eab_admin_check_chain(p_tbl text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rec record; prev text := 'GENESIS'; n bigint := 0; body jsonb; expect text;
begin
  if p_tbl not in ('eab_admin_actions', 'eab_admin_access') then raise exception 'unknown log'; end if;
  for rec in execute format('select to_jsonb(t) j from public.%I t order by seq', p_tbl) loop
    n := n + 1;
    body := rec.j || jsonb_build_object('at_us', (extract(epoch from (rec.j->>'at')::timestamptz) * 1000000)::bigint);
    expect := encode(sha256(convert_to(prev || '|' || public.eab_admin_row_text(p_tbl, body), 'UTF8')), 'hex');
    if rec.j->>'prev_hash' <> prev or rec.j->>'hash' <> expect then
      return jsonb_build_object('ok', false, 'checked', n, 'first_bad_seq', (rec.j->>'seq')::bigint);
    end if;
    prev := rec.j->>'hash';
  end loop;
  return jsonb_build_object('ok', true, 'checked', n, 'first_bad_seq', null);
end $$;

-- =====================================================================================================
-- A5. functions Admin EAB calls
-- Roles: owner = everything; admin = daily operations (profiles yes, exports no, logs no);
--        compliance = profiles, exports, logs; viewer = dashboards only; regulator = scoped, read-only.
-- =====================================================================================================

-- Who am I? Returns null for anyone not on the allow-list (the app then signs them out).
create or replace function public.eab_admin_me() returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select case when public.eab_admin_role() is null then null else jsonb_build_object(
    'user_id', a.user_id, 'email', a.email, 'role', a.role, 'expires_at', a.expires_at) end
  from public.eab_admins a where a.user_id = auth.uid()
$$;

create or replace function public.eab_admin_signed_in(p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer', 'regulator']);
  perform public.eab_admin_write_access('sign_in', null, null, null, p_device);
  return public.eab_admin_me();
end $$;

-- Display name of an agent from Google profile data.
create or replace function public.eab_admin_name(u auth.users) returns text
language sql immutable as $$
  select nullif(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''), '')
$$;

-- Global search: agent name / email / user id, and property reference / address / contact name or phone.
create or replace function public.eab_admin_search(p_q text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare q text := btrim(coalesce(p_q, '')); pat text; out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'regulator']);
  if char_length(q) < 2 then return '[]'::jsonb; end if;
  pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  with agents as (
    select jsonb_build_object('kind', 'agent', 'user_id', u.id, 'email', u.email, 'name', public.eab_admin_name(u),
                              'label', coalesce(public.eab_admin_name(u), u.email)) j
    from auth.users u
    where (u.email ilike pat or public.eab_admin_name(u) ilike pat or u.id::text = q)
      and public.eab_admin_can_see(u.id)
    limit 25
  ), recs as (
    select jsonb_build_object('kind', 'record', 'user_id', r.user_id, 'email', u.email, 'collection', r.collection,
                              'record_id', r.id, 'workspace_id', r.workspace_id, 'deleted', r.deleted,
                              'label', coalesce(r.data->>'ref', r.data->>'name', r.data->>'title', r.data->>'headline', r.id),
                              'sub', concat_ws(', ', r.data->>'unitNo', r.data->>'street', r.data->>'neighborhood', r.data->>'city', r.data->>'state')) j
    from public.eab_records r join auth.users u on u.id = r.user_id
    where r.collection in ('properties', 'contacts', 'deals', 'journeys')
      and (r.data->>'ref' ilike pat or r.data->>'headline' ilike pat or r.data->>'street' ilike pat
           or r.data->>'neighborhood' ilike pat or r.data->>'city' ilike pat or r.data->>'name' ilike pat
           or r.data->>'phone' ilike pat or r.data->>'title' ilike pat or r.id = q)
      and public.eab_admin_can_see(r.user_id)
    limit 50
  )
  select coalesce(jsonb_agg(j), '[]'::jsonb) into out from (select j from agents union all select j from recs) x;
  perform public.eab_admin_write_access('search', null, left(q, 300), jsonb_build_object('results', jsonb_array_length(out)), p_device);
  return out;
end $$;

-- Agent profile for the Agent Profile Viewer.
create or replace function public.eab_admin_agent(p_user uuid, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare u auth.users; out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'regulator']);
  if not public.eab_admin_can_see(p_user) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into u from auth.users where id = p_user;
  if u.id is null then raise exception 'agent not found' using errcode = 'P0002'; end if;
  out := jsonb_build_object(
    'user_id', u.id, 'email', u.email, 'name', public.eab_admin_name(u), 'joined_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at, 'banned_until', u.banned_until, 'deleted_at', u.deleted_at,
    'status', case when u.deleted_at is not null then 'closed'
                   when u.banned_until is not null and u.banned_until > now() then 'banned' else 'active' end,
    'licence', null,  -- licence field arrives with Change I (MainForAdmin-B); shown as "not provided"
    'workspaces', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'role', m.role)), '[]'::jsonb)
                     from public.eab_members m join public.eab_workspaces w on w.id = m.workspace_id where m.user_id = u.id),
    'counts', (select coalesce(jsonb_object_agg(c.collection, jsonb_build_object('total', c.total, 'deleted', c.del)), '{}'::jsonb)
                 from (select collection, count(*) total, count(*) filter (where deleted) del
                         from public.eab_records where user_id = u.id group by collection) c));
  perform public.eab_admin_write_access('view_agent', p_user, u.email, null, p_device);
  return out;
end $$;

-- All records of one agent in one collection (soft-deleted included when asked).
create or replace function public.eab_admin_agent_records(p_user uuid, p_collection text, p_include_deleted boolean default true,
                                                          p_limit integer default 200, p_offset integer default 0,
                                                          p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'regulator']);
  if not public.eab_admin_can_see(p_user) then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('workspace_id', r.workspace_id, 'collection', r.collection, 'id', r.id,
           'data', r.data, 'deleted', r.deleted, 'rev', r.rev, 'written_at', r.written_at, 'written_by', r.written_by)
           order by r.written_at desc nulls last), '[]'::jsonb) into out
  from (select * from public.eab_records
         where user_id = p_user and collection = p_collection and (p_include_deleted or not deleted)
         order by written_at desc nulls last
         limit least(greatest(coalesce(p_limit, 200), 1), 1000) offset greatest(coalesce(p_offset, 0), 0)) r;
  perform public.eab_admin_write_access('view_records', p_user, p_collection,
            jsonb_build_object('rows', jsonb_array_length(out), 'include_deleted', p_include_deleted), p_device);
  return out;
end $$;

-- Every version of one record, newest first (current version first).
create or replace function public.eab_admin_record_history(p_workspace uuid, p_collection text, p_record text,
                                                           p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'regulator']);
  select user_id into v_owner from public.eab_records where workspace_id = p_workspace and collection = p_collection and id = p_record;
  if v_owner is null then raise exception 'record not found' using errcode = 'P0002'; end if;
  if not public.eab_admin_can_see(v_owner) then raise exception 'not allowed' using errcode = '42501'; end if;
  select jsonb_agg(v order by (v->>'rev')::bigint desc) into out from (
    select jsonb_build_object('rev', r.rev, 'data', r.data, 'deleted', r.deleted, 'saved_by', r.written_by,
                              'saved_at', r.written_at, 'current', true) v
      from public.eab_records r where r.workspace_id = p_workspace and r.collection = p_collection and r.id = p_record
    union all
    select jsonb_build_object('rev', h.rev, 'data', h.data, 'deleted', h.deleted, 'saved_by', h.saved_by,
                              'saved_at', h.saved_at, 'current', false)
      from public.eab_record_revisions h where h.workspace_id = p_workspace and h.collection = p_collection and h.record_id = p_record
  ) x;
  perform public.eab_admin_write_access('view_history', v_owner, p_collection || '/' || p_record,
            jsonb_build_object('versions', jsonb_array_length(out)), p_device);
  return out;
end $$;

-- Record an export BEFORE the file is made; returns the reference number printed on every page.
create or replace function public.eab_admin_export(p_kind text, p_format text, p_target uuid, p_detail jsonb default null,
                                                   p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ref text; s bigint;
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  if p_target is not null and not public.eab_admin_can_see(p_target) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_format not in ('pdf', 'xlsx') then raise exception 'unknown format'; end if;
  s := nextval('public.eab_admin_export_seq');
  ref := 'EAB-' || to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYYMMDD') || '-' || lpad(s::text, 6, '0');
  perform public.eab_admin_write_access('export', p_target, ref,
            jsonb_build_object('kind', left(p_kind, 60), 'format', p_format) || coalesce(p_detail, '{}'::jsonb), p_device);
  return jsonb_build_object('reference', ref, 'at', now());
end $$;
create sequence if not exists public.eab_admin_export_seq;
revoke all on sequence public.eab_admin_export_seq from anon, authenticated, public;

-- Master Audit Log and access log, newest first. Owner and Compliance only.
create or replace function public.eab_admin_list_log(p_log text, p_target uuid default null, p_limit integer default 100,
                                                     p_before_seq bigint default null, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  if p_log = 'actions' then
    select coalesce(jsonb_agg(to_jsonb(t) - 'prev_hash' order by t.seq desc), '[]'::jsonb) into out from (
      select * from public.eab_admin_actions where (p_target is null or target_user = p_target)
        and (p_before_seq is null or seq < p_before_seq) order by seq desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) t;
    perform public.eab_admin_write_access('view_actions', p_target, null, null, p_device);
  elsif p_log = 'access' then
    select coalesce(jsonb_agg(to_jsonb(t) - 'prev_hash' order by t.seq desc), '[]'::jsonb) into out from (
      select * from public.eab_admin_access where (p_target is null or target_user = p_target)
        and (p_before_seq is null or seq < p_before_seq) order by seq desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) t;
    perform public.eab_admin_write_access('view_access', p_target, null, null, p_device);
  else
    raise exception 'unknown log';
  end if;
  return out;
end $$;

create or replace function public.eab_admin_verify_chain(p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a jsonb; b jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  a := public.eab_admin_check_chain('eab_admin_actions');
  b := public.eab_admin_check_chain('eab_admin_access');
  perform public.eab_admin_write_access('verify_chain', null, null, jsonb_build_object('actions', a, 'access', b), p_device);
  return jsonb_build_object('actions', a, 'access', b);
end $$;

-- Admin list (Owner only) and add / change / switch off an admin. Reason required; written to the audit log.
create or replace function public.eab_admin_list_admins() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.eab_admin_guard(array['owner']);
  return (select coalesce(jsonb_agg(to_jsonb(a) order by a.added_at), '[]'::jsonb) from public.eab_admins a);
end $$;

create or replace function public.eab_admin_set_admin(p_email text, p_role text, p_active boolean, p_expires_at timestamptz,
                                                      p_reason text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid; old_row jsonb; new_row jsonb;
begin
  perform public.eab_admin_guard(array['owner']);
  if coalesce(btrim(p_reason), '') = '' then raise exception 'a reason is required'; end if;
  if p_role not in ('owner', 'admin', 'compliance', 'viewer', 'regulator') then raise exception 'unknown role'; end if;
  if p_role = 'regulator' and p_expires_at is null then raise exception 'a regulator login needs an expiry date'; end if;
  select id into uid from auth.users where lower(email) = lower(btrim(p_email));
  if uid is null then raise exception 'this email has not signed in with Google yet' using errcode = 'P0002'; end if;
  select to_jsonb(a) into old_row from public.eab_admins a where a.user_id = uid;
  -- never leave the system without an active owner
  if old_row->>'role' = 'owner' and (p_role <> 'owner' or not p_active)
     and not exists (select 1 from public.eab_admins where role = 'owner' and active and user_id <> uid) then
    raise exception 'there must always be at least one active owner';
  end if;
  insert into public.eab_admins (user_id, email, role, active, expires_at, added_by)
    values (uid, (select email from auth.users where id = uid), p_role, p_active, p_expires_at, auth.uid())
    on conflict (user_id) do update set role = excluded.role, active = excluded.active,
      expires_at = excluded.expires_at, updated_at = now();
  select to_jsonb(a) into new_row from public.eab_admins a where a.user_id = uid;
  perform public.eab_admin_write_action(case when old_row is null then 'admin_added' else 'admin_changed' end,
                                        uid, new_row->>'email', p_reason, old_row, new_row, p_device);
  return new_row;
end $$;

-- =====================================================================================================
-- permissions: apps may call only the public entry points
-- =====================================================================================================
revoke all on function public.eab_admin_role(), public.eab_admin_guard(text[]), public.eab_admin_can_see(uuid),
  public.eab_admin_row_text(text, jsonb), public.eab_admin_chain(), public.eab_admin_no_change(),
  public.eab_admin_write_access(text, uuid, text, jsonb, text),
  public.eab_admin_write_action(text, uuid, text, text, jsonb, jsonb, text),
  public.eab_admin_check_chain(text), public.eab_admin_name(auth.users) from public, anon, authenticated;
revoke all on function public.eab_admin_me(), public.eab_admin_signed_in(text), public.eab_admin_search(text, text),
  public.eab_admin_agent(uuid, text), public.eab_admin_agent_records(uuid, text, boolean, integer, integer, text),
  public.eab_admin_record_history(uuid, text, text, text), public.eab_admin_export(text, text, uuid, jsonb, text),
  public.eab_admin_list_log(text, uuid, integer, bigint, text), public.eab_admin_verify_chain(text),
  public.eab_admin_list_admins(), public.eab_admin_set_admin(text, text, boolean, timestamptz, text, text) from public, anon;
grant execute on function public.eab_admin_me(), public.eab_admin_signed_in(text), public.eab_admin_search(text, text),
  public.eab_admin_agent(uuid, text), public.eab_admin_agent_records(uuid, text, boolean, integer, integer, text),
  public.eab_admin_record_history(uuid, text, text, text), public.eab_admin_export(text, text, uuid, jsonb, text),
  public.eab_admin_list_log(text, uuid, integer, bigint, text), public.eab_admin_verify_chain(text),
  public.eab_admin_list_admins(), public.eab_admin_set_admin(text, text, boolean, timestamptz, text, text) to authenticated;

-- FIRST OWNER (run once by hand in the SQL editor, with Joe's Google email; not part of this migration):
--   insert into public.eab_admins (user_id, email, role)
--     select id, email, 'owner' from auth.users where lower(email) = lower('JOE-EMAIL@gmail.com');

-- fixed search path for the small helpers (Supabase security advisor)
alter function public.eab_admin_row_text(text, jsonb) set search_path = pg_catalog, public;
alter function public.eab_admin_no_change() set search_path = pg_catalog, public;
alter function public.eab_admin_name(auth.users) set search_path = pg_catalog, public;

-- NOTE (21 Oct 2026): applied to EAB-QA-Test in parts (a2_block_cascades, a1_a3_allowlist, a4_logs, a5_functions,
-- permissions, search_path) because the database tool refused one large request. Same content as this file.
-- Tests: supabase/tests/admin_eab_foundation_test.sql (30 passed) + delete/tamper block (5 passed).
