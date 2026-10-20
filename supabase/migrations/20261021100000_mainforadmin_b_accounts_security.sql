-- MainForAdmin-B — accounts and security (JoyChange009-Main.txt A6, A7, A9 part; JoyChange005-Main Part2 C, Part5 E,
-- Part6 H1-H5 and I). Builds on 20261021000000_admin_eab_foundation.sql (MainForAdmin-A).
-- Applied to the TEST project (EAB-QA-Test) first. Never to production without Joe's approval.
-- Rollback: supabase/rollback/20261021100000_mainforadmin_b_rollback.sql
--
-- What this does, in plain words:
--   B1  account status per agent: active / suspended / banned / closed, with the reason and a "force logout after"
--       time. Only Admin EAB functions change it (owner / admin), each change goes to the tamper-proof admin log with
--       a reason. eab_account_ok() now also refuses suspended, banned and closed accounts.
--   B2  login log kept 7 years (its own table, NOT the 365-day usage log): sign-ins, app opens, failed sign-ins,
--       lockouts, forced sign-outs, with device, platform, app version and GPS when the agent allowed location.
--       Written only by the signed-in phone through eab_log_login(); never changed or deleted by anyone.
--   B3  licence number (REN / REA / PEA / EA / firm) set by the agent; "Verified" only by Admin EAB.
--   B4  Terms acceptance and marketing consent: every answer is a new row (version and time), kept 7 years.
--   B5  shared settings (company name, support email, business address) read by the main app; changed only through
--       Admin EAB (owner / admin), audited. JoyChange009 A9 adds force update and maintenance mode later (batch D).
-- Apps never get direct table access: everything goes through the functions below.

-- =====================================================================================================
-- B5. shared settings (one row)
-- =====================================================================================================
create table if not exists public.eab_settings (
  id                boolean primary key default true check (id),
  company_name      text not null default 'JSL Global Trading' check (char_length(company_name) between 1 and 200),
  support_email     text check (support_email is null or char_length(support_email) <= 320),
  business_address  text check (business_address is null or char_length(business_address) <= 500),
  updated_at        timestamptz not null default now(),
  updated_by        uuid
);
insert into public.eab_settings (id) values (true) on conflict (id) do nothing;
alter table public.eab_settings enable row level security;

-- =====================================================================================================
-- B1. account status
-- =====================================================================================================
create table if not exists public.eab_account_status (
  user_id             uuid primary key references auth.users (id) on delete restrict,
  status              text not null default 'active' check (status in ('active', 'suspended', 'banned', 'closed')),
  reason              text check (reason is null or char_length(reason) <= 1000),
  force_logout_after  timestamptz,
  changed_by          uuid,
  changed_at          timestamptz not null default now()
);
alter table public.eab_account_status enable row level security;

-- Usable = the Google account is not banned or deleted (Change 010) AND Admin EAB has not suspended, banned or closed it.
create or replace function public.eab_account_ok(p_user uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from auth.users u where u.id = p_user
                 and (u.banned_until is null or u.banned_until <= now()) and u.deleted_at is null)
     and not exists (select 1 from public.eab_account_status s where s.user_id = p_user and s.status <> 'active')
$$;

-- =====================================================================================================
-- B3. licence
-- =====================================================================================================
create table if not exists public.eab_licences (
  user_id      uuid primary key references auth.users (id) on delete restrict,
  type         text check (type is null or type in ('REN', 'REA', 'PEA', 'EA', 'FIRM')),
  number       text check (number is null or char_length(number) between 1 and 60),
  updated_at   timestamptz not null default now(),
  verified     boolean not null default false,
  verified_by  uuid,
  verified_at  timestamptz
);
alter table public.eab_licences enable row level security;

-- =====================================================================================================
-- B4. Terms acceptance and marketing consent (history: one row per answer)
-- =====================================================================================================
create table if not exists public.eab_terms_acceptance (
  seq            bigserial primary key,
  user_id        uuid not null references auth.users (id) on delete restrict,
  at             timestamptz not null default now(),
  kind           text not null check (kind in ('terms', 'marketing')),
  terms_version  text check (terms_version is null or char_length(terms_version) <= 20),
  accepted       boolean not null,
  device_id      text check (device_id is null or char_length(device_id) <= 80)
);
create index if not exists eab_terms_acceptance_user on public.eab_terms_acceptance (user_id, kind, seq desc);
alter table public.eab_terms_acceptance enable row level security;

-- =====================================================================================================
-- B2. login log (7 years)
-- =====================================================================================================
create table if not exists public.eab_login_log (
  seq          bigserial primary key,
  received_at  timestamptz not null default now(),
  happened_at  timestamptz not null,
  -- The account signed in on the phone when the entry was sent. Failed attempts and lockouts happen BEFORE a sign-in,
  -- so they are kept on the phone and sent with the next successful sign-in (device_id ties them to the phone).
  user_id      uuid not null references auth.users (id) on delete restrict,
  event        text not null check (event in ('sign_in', 'app_open', 'sign_in_failed', 'locked_out', 'forced_out', 'blocked', 'sign_out')),
  device_id    text check (device_id is null or char_length(device_id) <= 80),
  device       text check (device is null or char_length(device) <= 200),
  platform     text check (platform is null or platform in ('android', 'ios', 'web', 'desktop', 'tablet', 'unknown')),
  app_version  text check (app_version is null or char_length(app_version) <= 40),
  lat          double precision check (lat is null or lat between -90 and 90),
  lng          double precision check (lng is null or lng between -180 and 180),
  acc          real check (acc is null or acc between 0 and 100000),
  detail       text check (detail is null or char_length(detail) <= 200)
);
create index if not exists eab_login_log_user on public.eab_login_log (user_id, seq desc);
alter table public.eab_login_log enable row level security;

-- Logs and answers are never changed or deleted (7-year records). Removal only through the Admin EAB retention manager
-- after Owner approval (a later batch).
create or replace function public.eab_record_no_change() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'this record cannot be changed or deleted' using errcode = '42501';
end $$;
drop trigger if exists eab_login_log_lock on public.eab_login_log;
create trigger eab_login_log_lock before update or delete on public.eab_login_log for each row execute function public.eab_record_no_change();
drop trigger if exists eab_login_log_notrunc on public.eab_login_log;
create trigger eab_login_log_notrunc before truncate on public.eab_login_log for each statement execute function public.eab_record_no_change();
drop trigger if exists eab_terms_lock on public.eab_terms_acceptance;
create trigger eab_terms_lock before update or delete on public.eab_terms_acceptance for each row execute function public.eab_record_no_change();
drop trigger if exists eab_terms_notrunc on public.eab_terms_acceptance;
create trigger eab_terms_notrunc before truncate on public.eab_terms_acceptance for each statement execute function public.eab_record_no_change();

-- The admin access log (MainForAdmin-A) also records views of the login log and the Terms answers.
alter table public.eab_admin_access drop constraint if exists eab_admin_access_kind_check;
alter table public.eab_admin_access add constraint eab_admin_access_kind_check check (kind in ('sign_in', 'search', 'view_agent',
  'view_records', 'view_history', 'view_actions', 'view_access', 'verify_chain', 'export', 'view_login_log', 'view_terms_log'));

-- =====================================================================================================
-- functions the MAIN APP calls (signed in)
-- =====================================================================================================

-- Everything the app needs about its own account in one call: status, forced sign-out, Terms, licence, support contact.
create or replace function public.eab_my_account() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); s public.eab_account_status; l public.eab_licences; st public.eab_settings; u auth.users;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into u from auth.users where id = uid;
  select * into s from public.eab_account_status where user_id = uid;
  select * into l from public.eab_licences where user_id = uid;
  select * into st from public.eab_settings where id;
  return jsonb_build_object(
    'status', case when u.deleted_at is not null then 'closed'
                   when u.banned_until is not null and u.banned_until > now() then 'banned'
                   else coalesce(s.status, 'active') end,
    'reason', s.reason,
    'force_logout_after', s.force_logout_after,
    'terms', (select jsonb_build_object('version', t.terms_version, 'at', t.at) from public.eab_terms_acceptance t
               where t.user_id = uid and t.kind = 'terms' and t.accepted order by t.seq desc limit 1),
    'marketing', (select t.accepted from public.eab_terms_acceptance t where t.user_id = uid and t.kind = 'marketing' order by t.seq desc limit 1),
    'licence', case when l.user_id is null then null else jsonb_build_object('type', l.type, 'number', l.number, 'verified', l.verified) end,
    'company_name', st.company_name, 'support_email', st.support_email, 'business_address', st.business_address);
end $$;

-- The phone sends its queued sign-in events (up to 200 at a time). Times are the phone's, kept within sensible bounds.
create or replace function public.eab_log_login(p_events jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); e jsonb; n integer := 0; t timestamptz;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 200 then raise exception 'bad events' using errcode = '22023'; end if;
  for e in select * from jsonb_array_elements(p_events) loop
    if jsonb_typeof(e) <> 'object' or coalesce(e->>'event', '') not in ('sign_in', 'app_open', 'sign_in_failed', 'locked_out', 'forced_out', 'blocked', 'sign_out') then continue; end if;
    begin t := (e->>'at')::timestamptz; exception when others then t := now(); end;
    if t is null or t > now() + interval '5 minutes' or t < now() - interval '90 days' then t := now(); end if;
    insert into public.eab_login_log (happened_at, user_id, event, device_id, device, platform, app_version, lat, lng, acc, detail)
    values (t, uid, e->>'event', left(e->>'device_id', 80), left(e->>'device', 200),
            case when e->>'platform' in ('android', 'ios', 'web', 'desktop', 'tablet') then e->>'platform' else 'unknown' end,
            left(e->>'app_version', 40),
            case when (e->>'lat') ~ '^-?[0-9.]+$' and (e->>'lat')::float8 between -90 and 90 then (e->>'lat')::float8 end,
            case when (e->>'lng') ~ '^-?[0-9.]+$' and (e->>'lng')::float8 between -180 and 180 then (e->>'lng')::float8 end,
            case when (e->>'acc') ~ '^[0-9.]+$' and (e->>'acc')::float8 <= 100000 then (e->>'acc')::real end,
            left(e->>'detail', 200));
    n := n + 1;
  end loop;
  return n;
end $$;

-- The agent's own licence (optional). A changed number has to be verified again.
create or replace function public.eab_set_my_licence(p_type text, p_number text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); num text := nullif(btrim(coalesce(p_number, '')), ''); typ text := nullif(upper(btrim(coalesce(p_type, ''))), '');
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if typ is not null and typ not in ('REN', 'REA', 'PEA', 'EA', 'FIRM') then raise exception 'bad licence type' using errcode = '22023'; end if;
  insert into public.eab_licences as l (user_id, type, number, updated_at)
  values (uid, typ, left(num, 60), now())
  on conflict (user_id) do update set type = excluded.type, number = excluded.number, updated_at = now(),
    verified = case when l.number is not distinct from excluded.number and l.type is not distinct from excluded.type then l.verified else false end,
    verified_by = case when l.number is not distinct from excluded.number and l.type is not distinct from excluded.type then l.verified_by end,
    verified_at = case when l.number is not distinct from excluded.number and l.type is not distinct from excluded.type then l.verified_at end;
  return (select jsonb_build_object('type', type, 'number', number, 'verified', verified) from public.eab_licences where user_id = uid);
end $$;

-- First login: the Terms version accepted, and the marketing answer (both kept as history rows).
create or replace function public.eab_accept_terms(p_version text, p_marketing boolean, p_device_id text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_version is null or char_length(p_version) not between 1 and 20 then raise exception 'bad version' using errcode = '22023'; end if;
  insert into public.eab_terms_acceptance (user_id, kind, terms_version, accepted, device_id) values (uid, 'terms', p_version, true, left(p_device_id, 80));
  insert into public.eab_terms_acceptance (user_id, kind, terms_version, accepted, device_id) values (uid, 'marketing', p_version, coalesce(p_marketing, false), left(p_device_id, 80));
  return public.eab_my_account();
end $$;

-- Settings: the agent turns marketing news on or off later.
create or replace function public.eab_set_marketing(p_on boolean, p_device_id text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into public.eab_terms_acceptance (user_id, kind, accepted, device_id) values (uid, 'marketing', coalesce(p_on, false), left(p_device_id, 80));
  return public.eab_my_account();
end $$;

-- =====================================================================================================
-- functions ADMIN EAB calls (allow-list and roles from MainForAdmin-A; every change goes to eab_admin_actions)
-- =====================================================================================================

-- Suspend / ban / close / re-activate an account; optionally force a sign-out. A reason is required.
create or replace function public.eab_admin_set_account_status(p_user uuid, p_status text, p_reason text,
                                                               p_force_logout boolean default false, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare before jsonb; after jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if not public.eab_admin_can_see(p_user) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('active', 'suspended', 'banned', 'closed') then raise exception 'bad status' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'agent not found' using errcode = 'P0002'; end if;
  select to_jsonb(s) into before from public.eab_account_status s where user_id = p_user;
  insert into public.eab_account_status as s (user_id, status, reason, force_logout_after, changed_by, changed_at)
  values (p_user, p_status, left(p_reason, 1000), case when p_force_logout or p_status <> 'active' then now() end, auth.uid(), now())
  on conflict (user_id) do update set status = excluded.status, reason = excluded.reason, changed_by = excluded.changed_by, changed_at = now(),
    force_logout_after = case when p_force_logout or excluded.status <> 'active' then now() else s.force_logout_after end;
  select to_jsonb(s) into after from public.eab_account_status s where user_id = p_user;
  perform public.eab_admin_write_action('account_status', p_user, p_status, p_reason, before, after, p_device);
  return after;
end $$;

-- Force a sign-out on the agent's phones (takes effect at the next app open or sync). A reason is required.
create or replace function public.eab_admin_force_logout(p_user uuid, p_reason text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare before jsonb; after jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if not public.eab_admin_can_see(p_user) then raise exception 'not allowed' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'agent not found' using errcode = 'P0002'; end if;
  select to_jsonb(s) into before from public.eab_account_status s where user_id = p_user;
  insert into public.eab_account_status as s (user_id, force_logout_after, changed_by, changed_at)
  values (p_user, now(), auth.uid(), now())
  on conflict (user_id) do update set force_logout_after = now(), changed_by = auth.uid(), changed_at = now();
  select to_jsonb(s) into after from public.eab_account_status s where user_id = p_user;
  perform public.eab_admin_write_action('force_logout', p_user, null, p_reason, before, after, p_device);
  return after;
end $$;

-- Tick (or untick) a licence as verified after checking it by hand.
create or replace function public.eab_admin_verify_licence(p_user uuid, p_verified boolean, p_reason text default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare before jsonb; after jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  if not public.eab_admin_can_see(p_user) then raise exception 'not allowed' using errcode = '42501'; end if;
  select to_jsonb(l) into before from public.eab_licences l where user_id = p_user;
  if before is null or before->>'number' is null then raise exception 'no licence number to verify' using errcode = 'P0002'; end if;
  update public.eab_licences set verified = coalesce(p_verified, false),
    verified_by = case when p_verified then auth.uid() end, verified_at = case when p_verified then now() end
   where user_id = p_user;
  select to_jsonb(l) into after from public.eab_licences l where user_id = p_user;
  perform public.eab_admin_write_action('licence_verified', p_user, after->>'number', p_reason, before, after, p_device);
  return after;
end $$;

-- An agent's sign-in history for Login Security (newest first).
create or replace function public.eab_admin_login_log(p_user uuid, p_limit integer default 200, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'regulator']);
  if not public.eab_admin_can_see(p_user) then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.seq desc), '[]'::jsonb) into out
    from (select * from public.eab_login_log where user_id = p_user order by seq desc limit least(greatest(coalesce(p_limit, 200), 1), 1000)) x;
  perform public.eab_admin_write_access('view_login_log', p_user, null, jsonb_build_object('rows', jsonb_array_length(out)), p_device);
  return out;
end $$;

-- Terms acceptance history of one agent (Admin EAB Terms Acceptance log).
create or replace function public.eab_admin_terms_log(p_user uuid, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'regulator']);
  if not public.eab_admin_can_see(p_user) then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.seq desc), '[]'::jsonb) into out from public.eab_terms_acceptance t where t.user_id = p_user;
  perform public.eab_admin_write_access('view_terms_log', p_user, null, jsonb_build_object('rows', jsonb_array_length(out)), p_device);
  return out;
end $$;

-- Shared settings (owner / admin). Only the given fields change; an empty text clears it. A reason is required.
create or replace function public.eab_admin_set_settings(p_patch jsonb, p_reason text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare before jsonb; after jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  select to_jsonb(s) into before from public.eab_settings s where id;
  update public.eab_settings set
    company_name     = case when p_patch ? 'company_name' and nullif(btrim(p_patch->>'company_name'), '') is not null then btrim(p_patch->>'company_name') else company_name end,
    support_email    = case when p_patch ? 'support_email' then nullif(btrim(p_patch->>'support_email'), '') else support_email end,
    business_address = case when p_patch ? 'business_address' then nullif(btrim(p_patch->>'business_address'), '') else business_address end,
    updated_at = now(), updated_by = auth.uid()
   where id;
  select to_jsonb(s) into after from public.eab_settings s where id;
  perform public.eab_admin_write_action('settings_changed', null, 'eab_settings', p_reason, before, after, p_device);
  return after;
end $$;

-- Agent profile for the Agent Profile Viewer (MainForAdmin-A version, now with account status, licence and Terms).
create or replace function public.eab_admin_agent(p_user uuid, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare u auth.users; out jsonb; s public.eab_account_status; l public.eab_licences;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'regulator']);
  if not public.eab_admin_can_see(p_user) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into u from auth.users where id = p_user;
  if u.id is null then raise exception 'agent not found' using errcode = 'P0002'; end if;
  select * into s from public.eab_account_status where user_id = p_user;
  select * into l from public.eab_licences where user_id = p_user;
  out := jsonb_build_object(
    'user_id', u.id, 'email', u.email, 'name', public.eab_admin_name(u), 'joined_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at, 'banned_until', u.banned_until, 'deleted_at', u.deleted_at,
    'status', case when u.deleted_at is not null then 'closed'
                   when u.banned_until is not null and u.banned_until > now() then 'banned'
                   else coalesce(s.status, 'active') end,
    'status_reason', s.reason, 'force_logout_after', s.force_logout_after,
    'licence', case when l.number is null then null
                    else jsonb_build_object('type', l.type, 'number', l.number, 'verified', l.verified, 'verified_at', l.verified_at) end,
    'terms', (select jsonb_build_object('version', t.terms_version, 'at', t.at) from public.eab_terms_acceptance t
               where t.user_id = u.id and t.kind = 'terms' and t.accepted order by t.seq desc limit 1),
    'marketing', (select t.accepted from public.eab_terms_acceptance t where t.user_id = u.id and t.kind = 'marketing' order by t.seq desc limit 1),
    'last_login', (select jsonb_build_object('at', g.happened_at, 'event', g.event, 'platform', g.platform, 'app_version', g.app_version)
                     from public.eab_login_log g where g.user_id = u.id and g.event in ('sign_in', 'app_open') order by g.seq desc limit 1),
    'workspaces', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'role', m.role)), '[]'::jsonb)
                     from public.eab_members m join public.eab_workspaces w on w.id = m.workspace_id where m.user_id = u.id),
    'counts', (select coalesce(jsonb_object_agg(c.collection, jsonb_build_object('total', c.total, 'deleted', c.del)), '{}'::jsonb)
                 from (select collection, count(*) total, count(*) filter (where deleted) del
                         from public.eab_records where user_id = u.id group by collection) c));
  perform public.eab_admin_write_access('view_agent', p_user, u.email, null, p_device);
  return out;
end $$;

-- =====================================================================================================
-- permissions: no table access for apps; only these entry points
-- =====================================================================================================
revoke all on public.eab_settings, public.eab_account_status, public.eab_licences, public.eab_terms_acceptance, public.eab_login_log
  from public, anon, authenticated;
revoke all on function public.eab_record_no_change() from public, anon, authenticated;
revoke all on function public.eab_my_account(), public.eab_log_login(jsonb), public.eab_set_my_licence(text, text),
  public.eab_accept_terms(text, boolean, text), public.eab_set_marketing(boolean, text),
  public.eab_admin_set_account_status(uuid, text, text, boolean, text), public.eab_admin_force_logout(uuid, text, text),
  public.eab_admin_verify_licence(uuid, boolean, text, text), public.eab_admin_login_log(uuid, integer, text),
  public.eab_admin_terms_log(uuid, text), public.eab_admin_set_settings(jsonb, text, text) from public, anon;
grant execute on function public.eab_my_account(), public.eab_log_login(jsonb), public.eab_set_my_licence(text, text),
  public.eab_accept_terms(text, boolean, text), public.eab_set_marketing(boolean, text),
  public.eab_admin_set_account_status(uuid, text, text, boolean, text), public.eab_admin_force_logout(uuid, text, text),
  public.eab_admin_verify_licence(uuid, boolean, text, text), public.eab_admin_login_log(uuid, integer, text),
  public.eab_admin_terms_log(uuid, text), public.eab_admin_set_settings(jsonb, text, text) to authenticated;
