-- AdminBatch002 — two read functions Admin EAB needs for the accounts & security screens.
-- Builds on MainForAdmin-A (20261021000000) and MainForAdmin-B (20261021100000). TEST project first; never production
-- without Joe's approval. Rollback: supabase/rollback/20261021120000_admin_batch_002_reads_rollback.sql
-- Only adds functions (no table or constraint changes).

-- Shared settings for the System Settings screen (company name, support email, business address).
-- Not personal data, so no access-log entry. Every CHANGE goes through eab_admin_set_settings (audited).
create or replace function public.eab_admin_settings() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  return (select to_jsonb(s) - 'id' from public.eab_settings s where id);
end $$;

-- All agents in one list, for Agents Overview, Login Security, Suspend / Ban and Licence Verification.
-- p_filter: 'all' | 'not_active' (suspended, banned, closed) | 'licence' (has a licence number; unverified first)
--           | 'security' (a failed sign-in, lockout or blocked attempt in the last 30 days; most first)
-- p_q: optional text matched against email, name or user id. A regulator only sees agents in an unexpired scope.
-- The list itself is written to the access log as a search (the agents shown, not their records).
create or replace function public.eab_admin_agents(p_filter text default 'all', p_q text default null,
                                                   p_limit integer default 100, p_offset integer default 0,
                                                   p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare out jsonb; q text := nullif(btrim(coalesce(p_q, '')), ''); pat text;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'regulator']);
  if p_filter not in ('all', 'not_active', 'licence', 'security') then raise exception 'unknown filter' using errcode = '22023'; end if;
  pat := case when q is null then null else '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  with base as (
    select u.id, u.email, public.eab_admin_name(u) as name, u.created_at,
      case when u.deleted_at is not null then 'closed'
           when u.banned_until is not null and u.banned_until > now() then 'banned'
           else coalesce(s.status, 'active') end as status,
      s.reason as status_reason, s.changed_at as status_changed_at, s.force_logout_after,
      l.type as licence_type, l.number as licence_number, l.verified as licence_verified, l.verified_at as licence_verified_at,
      (select jsonb_build_object('at', g.happened_at, 'platform', g.platform, 'app_version', g.app_version)
         from public.eab_login_log g where g.user_id = u.id and g.event in ('sign_in', 'app_open') order by g.seq desc limit 1) as last_login,
      (select count(*) from public.eab_login_log g where g.user_id = u.id and g.event = 'sign_in_failed' and g.happened_at > now() - interval '30 days') as failed_30d,
      (select count(*) from public.eab_login_log g where g.user_id = u.id and g.event = 'locked_out' and g.happened_at > now() - interval '30 days') as lockouts_30d,
      (select count(*) from public.eab_login_log g where g.user_id = u.id and g.event = 'blocked' and g.happened_at > now() - interval '30 days') as blocked_30d,
      (select t.terms_version from public.eab_terms_acceptance t where t.user_id = u.id and t.kind = 'terms' and t.accepted order by t.seq desc limit 1) as terms_version,
      (select count(*) from public.eab_records r where r.user_id = u.id) as records
    from auth.users u
    left join public.eab_account_status s on s.user_id = u.id
    left join public.eab_licences l on l.user_id = u.id
    where public.eab_admin_can_see(u.id)
      and (pat is null or u.email ilike pat or public.eab_admin_name(u) ilike pat or u.id::text = q)
  ), picked as (
    select b.*, row_number() over (order by
      case when p_filter = 'licence' then (case when b.licence_verified then 1 else 0 end) end,
      case when p_filter = 'security' then -(b.failed_30d + b.lockouts_30d * 10 + b.blocked_30d * 10) end,
      case when p_filter = 'not_active' then b.status_changed_at end desc nulls last,
      b.created_at desc, b.id) as rn
    from base b
    where p_filter = 'all'
       or (p_filter = 'not_active' and b.status <> 'active')
       or (p_filter = 'licence' and b.licence_number is not null)
       or (p_filter = 'security' and (b.failed_30d + b.lockouts_30d + b.blocked_30d) > 0)
  ), page as (
    select * from picked order by rn
    limit least(greatest(coalesce(p_limit, 100), 1), 500) offset greatest(coalesce(p_offset, 0), 0)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', p.id, 'email', p.email, 'name', p.name, 'joined_at', p.created_at,
      'status', p.status, 'status_reason', p.status_reason, 'status_changed_at', p.status_changed_at,
      'force_logout_after', p.force_logout_after,
      'licence', case when p.licence_number is null then null else jsonb_build_object(
          'type', p.licence_type, 'number', p.licence_number, 'verified', p.licence_verified, 'verified_at', p.licence_verified_at) end,
      'last_login', p.last_login, 'failed_30d', p.failed_30d, 'lockouts_30d', p.lockouts_30d, 'blocked_30d', p.blocked_30d,
      'terms_version', p.terms_version, 'records', p.records) order by p.rn), '[]'::jsonb) into out
  from page p;
  perform public.eab_admin_write_access('search', null, left('agents list: ' || p_filter || coalesce(' "' || q || '"', ''), 300),
            jsonb_build_object('results', jsonb_array_length(out), 'filter', p_filter), p_device);
  return out;
end $$;

revoke all on function public.eab_admin_settings(), public.eab_admin_agents(text, text, integer, integer, text) from public, anon;
grant execute on function public.eab_admin_settings(), public.eab_admin_agents(text, text, integer, integer, text) to authenticated;

-- NOTE (21 Oct 2026): applied to EAB-QA-Test (admin_batch_002_reads + admin_batch_002_agents_order).
-- Tests: supabase/tests/admin_batch_002_test.sql — 21 passed, 0 failed (rolled back).
