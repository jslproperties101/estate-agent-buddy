-- AdminBatch003 — Regulator Request case files (feature 72), temporary regulator logins tied to a case (75),
-- PDPA access requests as cases (78), and the Document Vault (19) with tamper-evident fingerprints (73).
-- Builds on MainForAdmin-A/B and AdminBatch002. TEST project first; never production without Joe's approval.
-- Rollback: supabase/rollback/20261021130000_admin_batch_003_cases_rollback.sql
--
-- In plain words:
--   * A CASE records one request: who asked (JPPH, police, court, the agents' board, or an agent's own PDPA request),
--     their reference, dates, what was asked, and what was supplied. Kept 7 years; never deleted.
--   * Each case names the AGENTS it is about, each with an optional date range.
--   * The Owner can give a regulator officer TEMPORARY read-only access for one case: their Google account becomes a
--     'regulator' admin with an expiry, limited to that case's agents (eab_admin_scopes). Revoking ends it at once.
--   * A PACK is a PDF / Excel file built for a case. Its fingerprint (sha256 of the file) and the fingerprint of the
--     data inside it are recorded here; the file itself is kept in the private storage bucket 'eab-vault', which
--     nobody can overwrite or delete through the API. "Check a file" proves later that a copy is unchanged.

-- =====================================================================================================
-- tables
-- =====================================================================================================
create sequence if not exists public.eab_reg_case_seq;
create table if not exists public.eab_reg_cases (
  id               uuid primary key default gen_random_uuid(),
  case_no          text not null unique,
  requester_type   text not null check (requester_type in ('jpph', 'police', 'court', 'board', 'pdpa', 'other')),
  requester_name   text not null check (char_length(requester_name) between 1 and 200),
  requester_ref    text check (requester_ref is null or char_length(requester_ref) <= 120),
  requester_contact text check (requester_contact is null or char_length(requester_contact) <= 300),
  received_on      date not null,
  deadline         date,
  description      text not null check (char_length(description) between 1 and 4000),
  status           text not null default 'open' check (status in ('open', 'supplied', 'closed')),
  outcome          text check (outcome is null or char_length(outcome) <= 4000),
  created_by       uuid not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  closed_at        timestamptz
);
create table if not exists public.eab_reg_case_agents (
  case_id     uuid not null references public.eab_reg_cases (id) on delete restrict,
  agent_user  uuid not null references auth.users (id) on delete restrict,
  date_from   date,
  date_to     date check (date_to is null or date_from is null or date_to >= date_from),
  added_by    uuid not null,
  added_at    timestamptz not null default now(),
  removed_at  timestamptz,
  removed_by  uuid,
  primary key (case_id, agent_user)
);
create table if not exists public.eab_reg_packs (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid references public.eab_reg_cases (id) on delete restrict,
  agent_user    uuid references auth.users (id) on delete restrict,
  reference     text not null unique,                 -- the EAB-YYYYMMDD-###### export reference
  kind          text not null check (kind in ('case_pack', 'agent_profile', 'pdpa_access')),
  format        text not null check (format in ('pdf', 'xlsx')),
  file_name     text not null check (char_length(file_name) between 1 and 200),
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  bytes         bigint not null check (bytes > 0 and bytes <= 52428800),
  stored        boolean not null default false,       -- true once the file is in the vault bucket
  created_by    uuid not null,
  created_at    timestamptz not null default now()
);
create index if not exists eab_reg_packs_case on public.eab_reg_packs (case_id, created_at desc);
create index if not exists eab_reg_packs_sha on public.eab_reg_packs (sha256);
alter table public.eab_admin_scopes add column if not exists case_id uuid references public.eab_reg_cases (id) on delete restrict;

alter table public.eab_reg_cases enable row level security;
alter table public.eab_reg_case_agents enable row level security;
alter table public.eab_reg_packs enable row level security;
revoke all on public.eab_reg_cases, public.eab_reg_case_agents, public.eab_reg_packs from public, anon, authenticated;
revoke all on sequence public.eab_reg_case_seq from public, anon, authenticated;

-- Cases and packs are never deleted (7-year records). A pack's file details never change once stored.
create or replace function public.eab_reg_no_delete() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'case records cannot be deleted' using errcode = '42501';
end $$;
create trigger eab_reg_cases_nodelete before delete on public.eab_reg_cases for each row execute function public.eab_reg_no_delete();
create trigger eab_reg_case_agents_nodelete before delete on public.eab_reg_case_agents for each row execute function public.eab_reg_no_delete();
create trigger eab_reg_packs_nodelete before delete on public.eab_reg_packs for each row execute function public.eab_reg_no_delete();
create trigger eab_reg_cases_notrunc before truncate on public.eab_reg_cases for each statement execute function public.eab_reg_no_delete();
create trigger eab_reg_case_agents_notrunc before truncate on public.eab_reg_case_agents for each statement execute function public.eab_reg_no_delete();
create trigger eab_reg_packs_notrunc before truncate on public.eab_reg_packs for each statement execute function public.eab_reg_no_delete();
create or replace function public.eab_reg_pack_fixed() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if (new.sha256, new.content_sha256, new.bytes, new.reference, new.file_name, new.case_id, new.agent_user, new.kind, new.format, new.created_by, new.created_at)
     is distinct from
     (old.sha256, old.content_sha256, old.bytes, old.reference, old.file_name, old.case_id, old.agent_user, old.kind, old.format, old.created_by, old.created_at)
     or (old.stored and not new.stored) then
    raise exception 'a pack record cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger eab_reg_packs_fixed before update on public.eab_reg_packs for each row execute function public.eab_reg_pack_fixed();

-- The admin access log gets the new view kinds.
alter table public.eab_admin_access drop constraint if exists eab_admin_access_kind_check;
alter table public.eab_admin_access add constraint eab_admin_access_kind_check check (kind in ('sign_in', 'search', 'view_agent',
  'view_records', 'view_history', 'view_actions', 'view_access', 'verify_chain', 'export', 'view_login_log', 'view_terms_log',
  'view_cases', 'view_case', 'view_vault', 'download_pack', 'check_file'));

-- =====================================================================================================
-- helpers
-- =====================================================================================================
-- May the caller see this case? Owner / compliance: every case. Regulator: only a case they hold an unexpired scope for.
create or replace function public.eab_admin_can_see_case(p_case uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when r is null then false
    when r in ('owner', 'compliance') then true
    when r = 'regulator' then exists (select 1 from public.eab_admin_scopes s
                                       where s.admin_user = auth.uid() and s.case_id = p_case and s.expires_at > now())
    else false end
  from (select public.eab_admin_role() r) x
$$;

-- One case as JSON (agents with email, packs, regulator grants).
create or replace function public.eab_admin_case_json(p_case uuid) returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select to_jsonb(c) || jsonb_build_object(
    'agents', (select coalesce(jsonb_agg(jsonb_build_object('user_id', a.agent_user, 'email', u.email, 'name', public.eab_admin_name(u),
                 'date_from', a.date_from, 'date_to', a.date_to, 'added_at', a.added_at, 'removed_at', a.removed_at) order by a.added_at), '[]'::jsonb)
               from public.eab_reg_case_agents a join auth.users u on u.id = a.agent_user where a.case_id = c.id),
    'packs', (select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc), '[]'::jsonb) from public.eab_reg_packs p where p.case_id = c.id),
    'grants', (select coalesce(jsonb_agg(g order by g->>'granted_at' desc), '[]'::jsonb) from (
                 select jsonb_build_object('admin_user', s.admin_user, 'email', ad.email, 'expires_at', max(s.expires_at),
                   'granted_at', min(s.created_at), 'active', max(s.expires_at) > now() and bool_or(ad.active)) g
                 from public.eab_admin_scopes s join public.eab_admins ad on ad.user_id = s.admin_user
                 where s.case_id = c.id group by s.admin_user, ad.email) gg))
  from public.eab_reg_cases c where c.id = p_case
$$;

-- =====================================================================================================
-- functions Admin EAB calls
-- =====================================================================================================

-- New case. p: {requester_type, requester_name, requester_ref?, requester_contact?, received_on, deadline?, description}
create or replace function public.eab_admin_case_create(p jsonb, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cid uuid; no text; out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  no := 'CASE-' || to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY') || '-' || lpad(nextval('public.eab_reg_case_seq')::text, 4, '0');
  insert into public.eab_reg_cases (case_no, requester_type, requester_name, requester_ref, requester_contact, received_on, deadline, description, created_by)
  values (no, p->>'requester_type', btrim(p->>'requester_name'), nullif(btrim(coalesce(p->>'requester_ref', '')), ''),
          nullif(btrim(coalesce(p->>'requester_contact', '')), ''), (p->>'received_on')::date, nullif(p->>'deadline', '')::date,
          btrim(p->>'description'), auth.uid())
  returning id into cid;
  out := public.eab_admin_case_json(cid);
  perform public.eab_admin_write_action('case_created', null, no, null, null, out - 'agents' - 'packs' - 'grants', p_device);
  return out;
end $$;

-- Change status / outcome / deadline / description. A reason is required.
create or replace function public.eab_admin_case_update(p_case uuid, p jsonb, p_reason text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare before jsonb; after jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  select to_jsonb(c) into before from public.eab_reg_cases c where id = p_case;
  if before is null then raise exception 'case not found' using errcode = 'P0002'; end if;
  if p ? 'status' and p->>'status' not in ('open', 'supplied', 'closed') then raise exception 'bad status' using errcode = '22023'; end if;
  update public.eab_reg_cases set
    status      = coalesce(p->>'status', status),
    outcome     = case when p ? 'outcome' then nullif(btrim(p->>'outcome'), '') else outcome end,
    deadline    = case when p ? 'deadline' then nullif(p->>'deadline', '')::date else deadline end,
    description = case when p ? 'description' and nullif(btrim(p->>'description'), '') is not null then btrim(p->>'description') else description end,
    requester_ref = case when p ? 'requester_ref' then nullif(btrim(p->>'requester_ref'), '') else requester_ref end,
    closed_at   = case when coalesce(p->>'status', status) = 'closed' then coalesce(closed_at, now()) else null end,
    updated_at  = now()
  where id = p_case;
  select to_jsonb(c) into after from public.eab_reg_cases c where id = p_case;
  perform public.eab_admin_write_action('case_updated', null, after->>'case_no', p_reason, before, after, p_device);
  return public.eab_admin_case_json(p_case);
end $$;

-- Add an agent to a case (or change their dates / bring them back). Existing regulator grants for the case cover them too.
create or replace function public.eab_admin_case_add_agent(p_case uuid, p_agent uuid, p_from date, p_to date, p_reason text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.eab_reg_cases;
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  select * into c from public.eab_reg_cases where id = p_case;
  if c.id is null then raise exception 'case not found' using errcode = 'P0002'; end if;
  if c.status = 'closed' then raise exception 'the case is closed' using errcode = '22023'; end if;
  if not exists (select 1 from auth.users where id = p_agent) then raise exception 'agent not found' using errcode = 'P0002'; end if;
  insert into public.eab_reg_case_agents (case_id, agent_user, date_from, date_to, added_by)
  values (p_case, p_agent, p_from, p_to, auth.uid())
  on conflict (case_id, agent_user) do update set date_from = excluded.date_from, date_to = excluded.date_to,
    removed_at = null, removed_by = null, added_by = excluded.added_by, added_at = now();
  -- regulators already granted on this case also get this agent, until their grant ends
  insert into public.eab_admin_scopes (admin_user, agent_user, date_from, date_to, case_ref, case_id, expires_at, created_by)
  select g.admin_user, p_agent, p_from, p_to, c.case_no, p_case, max(g.expires_at), auth.uid()
    from public.eab_admin_scopes g where g.case_id = p_case and g.expires_at > now()
     and not exists (select 1 from public.eab_admin_scopes x where x.case_id = p_case and x.admin_user = g.admin_user and x.agent_user = p_agent and x.expires_at > now())
   group by g.admin_user;
  update public.eab_reg_cases set updated_at = now() where id = p_case;
  perform public.eab_admin_write_action('case_agent_added', p_agent, c.case_no, p_reason, null,
            jsonb_build_object('date_from', p_from, 'date_to', p_to), p_device);
  return public.eab_admin_case_json(p_case);
end $$;

-- Take an agent off a case (kept in the record as removed). Regulator access to that agent for this case ends.
create or replace function public.eab_admin_case_remove_agent(p_case uuid, p_agent uuid, p_reason text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare no text;
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  select case_no into no from public.eab_reg_cases where id = p_case;
  if no is null then raise exception 'case not found' using errcode = 'P0002'; end if;
  update public.eab_reg_case_agents set removed_at = now(), removed_by = auth.uid()
   where case_id = p_case and agent_user = p_agent and removed_at is null;
  if not found then raise exception 'agent is not on this case' using errcode = 'P0002'; end if;
  update public.eab_admin_scopes set expires_at = least(expires_at, now())
   where case_id = p_case and agent_user = p_agent and expires_at > now();
  perform public.eab_admin_write_action('case_agent_removed', p_agent, no, p_reason, null, null, p_device);
  return public.eab_admin_case_json(p_case);
end $$;

-- Owner gives a regulator officer temporary read-only access for one case (feature 75). The officer must have signed in
-- with Google once. An existing staff admin (non-regulator) can never be turned into a regulator this way.
create or replace function public.eab_admin_case_grant(p_case uuid, p_email text, p_expires_at timestamptz, p_reason text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare uid uuid; c public.eab_reg_cases; existing public.eab_admins; n int;
begin
  perform public.eab_admin_guard(array['owner']);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  if p_expires_at is null or p_expires_at <= now() then raise exception 'the access must end in the future' using errcode = '22023'; end if;
  if p_expires_at > now() + interval '90 days' then raise exception 'regulator access can last at most 90 days' using errcode = '22023'; end if;
  select * into c from public.eab_reg_cases where id = p_case;
  if c.id is null then raise exception 'case not found' using errcode = 'P0002'; end if;
  if c.status = 'closed' then raise exception 'the case is closed' using errcode = '22023'; end if;
  if not exists (select 1 from public.eab_reg_case_agents a where a.case_id = p_case and a.removed_at is null) then
    raise exception 'add at least one agent to the case first' using errcode = '22023';
  end if;
  select id into uid from auth.users where lower(email) = lower(btrim(p_email));
  if uid is null then raise exception 'this email has not signed in with Google yet' using errcode = 'P0002'; end if;
  if uid = auth.uid() then raise exception 'you cannot grant yourself regulator access' using errcode = '22023'; end if;
  select * into existing from public.eab_admins where user_id = uid;
  if existing.user_id is not null and existing.role <> 'regulator' then
    raise exception 'this account is already Admin EAB staff (%); use a separate account for the officer', existing.role using errcode = '22023';
  end if;
  insert into public.eab_admins (user_id, email, role, active, expires_at, added_by, note)
  values (uid, (select email from auth.users where id = uid), 'regulator', true, p_expires_at, auth.uid(), left('Regulator for ' || c.case_no, 500))
  on conflict (user_id) do update set active = true, updated_at = now(),
    expires_at = greatest(coalesce(public.eab_admins.expires_at, excluded.expires_at), excluded.expires_at);
  -- end any older grant rows on this case first, then add one scope per current agent of the case
  update public.eab_admin_scopes set expires_at = least(expires_at, now()) where admin_user = uid and case_id = p_case and expires_at > now();
  insert into public.eab_admin_scopes (admin_user, agent_user, date_from, date_to, case_ref, case_id, expires_at, created_by)
  select uid, a.agent_user, a.date_from, a.date_to, c.case_no, p_case, p_expires_at, auth.uid()
    from public.eab_reg_case_agents a where a.case_id = p_case and a.removed_at is null;
  get diagnostics n = row_count;
  perform public.eab_admin_write_action('regulator_granted', uid, c.case_no, p_reason, null,
            jsonb_build_object('email', p_email, 'expires_at', p_expires_at, 'agents', n), p_device);
  return public.eab_admin_case_json(p_case);
end $$;

-- End a regulator's access for one case now. If they hold no other unexpired case, their login is switched off.
create or replace function public.eab_admin_case_revoke(p_case uuid, p_admin uuid, p_reason text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare no text; r text;
begin
  perform public.eab_admin_guard(array['owner']);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  select case_no into no from public.eab_reg_cases where id = p_case;
  if no is null then raise exception 'case not found' using errcode = 'P0002'; end if;
  select role into r from public.eab_admins where user_id = p_admin;
  if r is distinct from 'regulator' then raise exception 'not a regulator login' using errcode = '22023'; end if;
  update public.eab_admin_scopes set expires_at = least(expires_at, now()) where admin_user = p_admin and case_id = p_case and expires_at > now();
  if not exists (select 1 from public.eab_admin_scopes where admin_user = p_admin and expires_at > now()) then
    update public.eab_admins set active = false, expires_at = least(coalesce(expires_at, now()), now()), updated_at = now() where user_id = p_admin;
  end if;
  perform public.eab_admin_write_action('regulator_revoked', p_admin, no, p_reason, null, null, p_device);
  return public.eab_admin_case_json(p_case);
end $$;

-- Cases list. Owner / compliance: all (optionally by status / text). Regulator: only their own cases.
create or replace function public.eab_admin_cases(p_status text default null, p_q text default null, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb; q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  perform public.eab_admin_guard(array['owner', 'compliance', 'regulator']);
  select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object(
      'agents', (select count(*) from public.eab_reg_case_agents a where a.case_id = c.id and a.removed_at is null),
      'packs', (select count(*) from public.eab_reg_packs p where p.case_id = c.id and p.stored))
      order by (c.status = 'closed'), c.deadline nulls last, c.created_at desc), '[]'::jsonb) into out
  from public.eab_reg_cases c
  where public.eab_admin_can_see_case(c.id)
    and (p_status is null or c.status = p_status)
    and (q is null or c.case_no ilike '%' || q || '%' or c.requester_name ilike '%' || q || '%'
         or coalesce(c.requester_ref, '') ilike '%' || q || '%' or c.description ilike '%' || q || '%');
  perform public.eab_admin_write_access('view_cases', null, left(coalesce(p_status, 'all') || coalesce(' "' || q || '"', ''), 300),
            jsonb_build_object('results', jsonb_array_length(out)), p_device);
  return out;
end $$;

create or replace function public.eab_admin_case(p_case uuid, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'compliance', 'regulator']);
  if not public.eab_admin_can_see_case(p_case) then raise exception 'not allowed' using errcode = '42501'; end if;
  out := public.eab_admin_case_json(p_case);
  if out is null then raise exception 'case not found' using errcode = 'P0002'; end if;
  -- a regulator does not see who else was granted access
  if public.eab_admin_role() = 'regulator' then out := out - 'grants'; end if;
  perform public.eab_admin_write_access('view_case', null, out->>'case_no', null, p_device);
  return out;
end $$;

-- Register a pack BEFORE uploading it (the upload is only accepted for a registered pack with the same fingerprint).
-- p: {case_id?, agent_user?, reference, kind, format, file_name, sha256, content_sha256?, bytes}
-- The reference must be one this admin got from eab_admin_export (so every pack is also in the access log).
create or replace function public.eab_admin_pack_register(p jsonb, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pid uuid; cid uuid := nullif(p->>'case_id', '')::uuid; ag uuid := nullif(p->>'agent_user', '')::uuid; out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  if cid is not null and not exists (select 1 from public.eab_reg_cases where id = cid) then raise exception 'case not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.eab_admin_access a where a.kind = 'export' and a.admin_user = auth.uid() and a.target_ref = p->>'reference') then
    raise exception 'unknown export reference' using errcode = '22023';
  end if;
  insert into public.eab_reg_packs (case_id, agent_user, reference, kind, format, file_name, sha256, content_sha256, bytes, created_by)
  values (cid, ag, p->>'reference', p->>'kind', p->>'format', p->>'file_name', lower(p->>'sha256'), lower(nullif(p->>'content_sha256', '')),
          (p->>'bytes')::bigint, auth.uid())
  returning id into pid;
  select to_jsonb(x) into out from public.eab_reg_packs x where id = pid;
  perform public.eab_admin_write_action('pack_created', ag, p->>'reference', null, null, out, p_device);
  return out;
end $$;

-- Called after the upload succeeded: marks the pack as stored in the vault (the storage object must exist).
create or replace function public.eab_admin_pack_stored(p_pack uuid) returns jsonb
language plpgsql security definer set search_path = public, storage as $$
declare pk public.eab_reg_packs;
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  select * into pk from public.eab_reg_packs where id = p_pack and created_by = auth.uid();
  if pk.id is null then raise exception 'pack not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'eab-vault' and o.name = pk.id::text || '/' || pk.sha256) then
    raise exception 'the file is not in the vault yet' using errcode = 'P0002';
  end if;
  update public.eab_reg_packs set stored = true where id = p_pack;
  return (select to_jsonb(x) from public.eab_reg_packs x where id = p_pack);
end $$;

-- Document Vault list. Owner / compliance: all (or one case / one agent). Regulator: packs of their own cases.
create or replace function public.eab_admin_vault(p_case uuid default null, p_agent uuid default null, p_limit integer default 200, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'compliance', 'regulator']);
  select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object('case_no', c.case_no, 'agent_email', u.email, 'created_by_email', cb.email)
           order by p.created_at desc), '[]'::jsonb) into out
  from (select * from public.eab_reg_packs x
         where x.stored and (p_case is null or x.case_id = p_case) and (p_agent is null or x.agent_user = p_agent)
           and (public.eab_admin_role() in ('owner', 'compliance') or (x.case_id is not null and public.eab_admin_can_see_case(x.case_id)))
         order by x.created_at desc limit least(greatest(coalesce(p_limit, 200), 1), 1000)) p
  left join public.eab_reg_cases c on c.id = p.case_id
  left join auth.users u on u.id = p.agent_user
  left join auth.users cb on cb.id = p.created_by;
  perform public.eab_admin_write_access('view_vault', p_agent, null, jsonb_build_object('rows', jsonb_array_length(out), 'case', p_case), p_device);
  return out;
end $$;

-- Log a download from the vault (the app calls this just before fetching the file).
create or replace function public.eab_admin_pack_download(p_pack uuid, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pk public.eab_reg_packs;
begin
  perform public.eab_admin_guard(array['owner', 'compliance', 'regulator']);
  select * into pk from public.eab_reg_packs where id = p_pack and stored;
  if pk.id is null then raise exception 'pack not found' using errcode = 'P0002'; end if;
  if not (public.eab_admin_role() in ('owner', 'compliance') or (pk.case_id is not null and public.eab_admin_can_see_case(pk.case_id))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform public.eab_admin_write_access('download_pack', pk.agent_user, pk.reference, jsonb_build_object('pack', pk.id), p_device);
  return jsonb_build_object('path', pk.id::text || '/' || pk.sha256, 'file_name', pk.file_name, 'format', pk.format, 'sha256', pk.sha256);
end $$;

-- "Check a file": is this exact file (by its sha256) a pack Admin EAB made? Returns the pack or null.
create or replace function public.eab_admin_check_file(p_sha256 text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare out jsonb; h text := lower(btrim(coalesce(p_sha256, '')));
begin
  perform public.eab_admin_guard(array['owner', 'compliance', 'regulator']);
  if h !~ '^[0-9a-f]{64}$' then raise exception 'not a fingerprint' using errcode = '22023'; end if;
  select to_jsonb(p) || jsonb_build_object('case_no', c.case_no, 'agent_email', u.email, 'created_by_email', cb.email) into out
    from public.eab_reg_packs p
    left join public.eab_reg_cases c on c.id = p.case_id
    left join auth.users u on u.id = p.agent_user
    left join auth.users cb on cb.id = p.created_by
   where p.sha256 = h
     and (public.eab_admin_role() in ('owner', 'compliance') or (p.case_id is not null and public.eab_admin_can_see_case(p.case_id)))
   limit 1;
  perform public.eab_admin_write_access('check_file', null, left(h, 16), jsonb_build_object('found', out is not null), p_device);
  return out;
end $$;

-- Storage rules for the vault bucket: an admin may upload ONLY the file of a pack they registered (path = pack id /
-- sha256) and only once (no overwrite, no delete); reading follows the same rules as the vault list.
create or replace function public.eab_vault_can_upload(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.eab_admin_role() in ('owner', 'compliance'), false) and exists (
    select 1 from public.eab_reg_packs p
     where p.id::text = split_part(p_name, '/', 1) and p.sha256 = split_part(p_name, '/', 2)
       and p.created_by = auth.uid() and not p.stored)
$$;
create or replace function public.eab_vault_can_read(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.eab_reg_packs p
     where p.id::text = split_part(p_name, '/', 1) and p.sha256 = split_part(p_name, '/', 2)
       and (coalesce(public.eab_admin_role() in ('owner', 'compliance'), false)
            or (p.case_id is not null and public.eab_admin_can_see_case(p.case_id))))
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('eab-vault', 'eab-vault', false, 52428800, array['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;
create policy "eab vault upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'eab-vault' and public.eab_vault_can_upload(name));
create policy "eab vault read" on storage.objects for select to authenticated
  using (bucket_id = 'eab-vault' and public.eab_vault_can_read(name));
-- no update or delete policy: vault files can never be overwritten or removed through the API.

-- =====================================================================================================
-- permissions
-- =====================================================================================================
revoke all on function public.eab_reg_no_delete(), public.eab_reg_pack_fixed(), public.eab_admin_can_see_case(uuid),
  public.eab_admin_case_json(uuid) from public, anon, authenticated;
revoke all on function public.eab_admin_case_create(jsonb, text), public.eab_admin_case_update(uuid, jsonb, text, text),
  public.eab_admin_case_add_agent(uuid, uuid, date, date, text, text), public.eab_admin_case_remove_agent(uuid, uuid, text, text),
  public.eab_admin_case_grant(uuid, text, timestamptz, text, text), public.eab_admin_case_revoke(uuid, uuid, text, text),
  public.eab_admin_cases(text, text, text), public.eab_admin_case(uuid, text), public.eab_admin_pack_register(jsonb, text),
  public.eab_admin_pack_stored(uuid), public.eab_admin_vault(uuid, uuid, integer, text), public.eab_admin_pack_download(uuid, text),
  public.eab_admin_check_file(text, text), public.eab_vault_can_upload(text), public.eab_vault_can_read(text) from public, anon;
grant execute on function public.eab_admin_case_create(jsonb, text), public.eab_admin_case_update(uuid, jsonb, text, text),
  public.eab_admin_case_add_agent(uuid, uuid, date, date, text, text), public.eab_admin_case_remove_agent(uuid, uuid, text, text),
  public.eab_admin_case_grant(uuid, text, timestamptz, text, text), public.eab_admin_case_revoke(uuid, uuid, text, text),
  public.eab_admin_cases(text, text, text), public.eab_admin_case(uuid, text), public.eab_admin_pack_register(jsonb, text),
  public.eab_admin_pack_stored(uuid), public.eab_admin_vault(uuid, uuid, integer, text), public.eab_admin_pack_download(uuid, text),
  public.eab_admin_check_file(text, text), public.eab_vault_can_upload(text), public.eab_vault_can_read(text) to authenticated;

-- NOTE (21 Oct 2026): applied to EAB-QA-Test in parts (p1_tables, p2_functions_a, p3_functions_b, p4_vault_storage,
-- p5_permissions). Tests: supabase/tests/admin_batch_003_test.sql — 34 passed, 0 failed (rolled back).
