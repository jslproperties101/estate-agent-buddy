-- Rollback for 20261021100000_mainforadmin_b_accounts_security.sql (MainForAdmin-B).
-- WARNING: dropping the tables removes the login log, Terms answers, licences and account statuses. Export them first
-- (7-year records). Run only with Joe's approval.
drop function if exists public.eab_my_account();
drop function if exists public.eab_log_login(jsonb);
drop function if exists public.eab_set_my_licence(text, text);
drop function if exists public.eab_accept_terms(text, boolean, text);
drop function if exists public.eab_set_marketing(boolean, text);
drop function if exists public.eab_admin_set_account_status(uuid, text, text, boolean, text);
drop function if exists public.eab_admin_force_logout(uuid, text, text);
drop function if exists public.eab_admin_verify_licence(uuid, boolean, text, text);
drop function if exists public.eab_admin_login_log(uuid, integer, text);
drop function if exists public.eab_admin_terms_log(uuid, text);
drop function if exists public.eab_admin_set_settings(jsonb, text, text);

-- eab_account_ok back to the Change 010 version (Google ban / deletion only).
create or replace function public.eab_account_ok(p_user uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from auth.users u where u.id = p_user
                 and (u.banned_until is null or u.banned_until <= now()) and u.deleted_at is null)
$$;

-- eab_admin_agent back to the MainForAdmin-A version (licence shown as not provided).
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
    'licence', null,
    'workspaces', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'role', m.role)), '[]'::jsonb)
                     from public.eab_members m join public.eab_workspaces w on w.id = m.workspace_id where m.user_id = u.id),
    'counts', (select coalesce(jsonb_object_agg(c.collection, jsonb_build_object('total', c.total, 'deleted', c.del)), '{}'::jsonb)
                 from (select collection, count(*) total, count(*) filter (where deleted) del
                         from public.eab_records where user_id = u.id group by collection) c));
  perform public.eab_admin_write_access('view_agent', p_user, u.email, null, p_device);
  return out;
end $$;

-- The admin access log's kinds back to the MainForAdmin-A list. NOT VALID: entries already written for the B views are
-- kept (the log can never be changed); only new entries are checked.
alter table public.eab_admin_access drop constraint if exists eab_admin_access_kind_check;
alter table public.eab_admin_access add constraint eab_admin_access_kind_check check (kind in ('sign_in', 'search', 'view_agent',
  'view_records', 'view_history', 'view_actions', 'view_access', 'verify_chain', 'export')) not valid;

-- Tables last (the protected logs need their no-change triggers removed first).
drop trigger if exists eab_login_log_lock on public.eab_login_log;
drop trigger if exists eab_login_log_notrunc on public.eab_login_log;
drop trigger if exists eab_terms_lock on public.eab_terms_acceptance;
drop trigger if exists eab_terms_notrunc on public.eab_terms_acceptance;
drop table if exists public.eab_login_log;
drop table if exists public.eab_terms_acceptance;
drop table if exists public.eab_licences;
drop table if exists public.eab_account_status;
drop table if exists public.eab_settings;
drop function if exists public.eab_record_no_change();
