-- Patch for EAB-QA-Test (21 Oct 2026): MainForAdmin-B returned the licence as an object; Admin EAB (AdminBatch001) shows
-- and exports it as one line of text. Same function as in 20261021100000_mainforadmin_b_accounts_security.sql now.
-- Paste into the SQL editor of EAB-QA-Test and Run. Safe to run more than once.
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
    -- 'licence' stays ONE line of text, as Admin EAB (AdminBatch001) shows and exports it; the parts are in 'licence_detail'.
    'licence', case when l.number is null then null
                    else concat_ws(' ', nullif(case l.type when 'FIRM' then 'Firm licence' else l.type end, ''), l.number)
                         || case when l.verified then ' (verified)' else ' (not verified)' end end,
    'licence_detail', case when l.number is null then null
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

