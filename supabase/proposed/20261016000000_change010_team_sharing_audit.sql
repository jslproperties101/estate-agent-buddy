-- Estate Agent AI Buddy, Change 010: Team Workspace (two agents), owner-controlled sharing, audit history.
-- PROPOSAL — NOT APPLIED to any live or test project. Review it, take a backup (Supabase → Database → Backups), apply it
-- first to a separate Supabase TEST project, and only then decide about production. Run after all files in
-- supabase/migrations/ (it needs Phase 2: 20261014000000_phase2_sync_refs_files.sql). Undo:
-- supabase/proposed/20261016000000_change010_rollback.sql. Rehearsed on local PostgreSQL 16 by
-- supabase/tests/change010-test.sh.
--
-- It only ADDS tables, functions, triggers and policies. Existing rows are not changed. One existing function is
-- replaced: eab_push_records gets ONE extra condition (an agent may send changes to a record that its owner shared with
-- them through an active Team Workspace); everything else in it is byte-for-byte the Phase 2 version, and row-level
-- security still decides each row.
--
-- Rules enforced here (hiding buttons in the app is never what protects the data):
--  Team       at most two people; one active Team Workspace per person; invitation by Google email or by link;
--             an unaccepted invitation expires after 7 days; the sender may cancel it (the link stops working);
--             leaving, removing the other person, or the account being disabled ENDS the Team Workspace: every shared
--             access stops at once; old permissions never come back (a new invitation starts from nothing).
--  Sharing    two-way and independent: each person shares only records they own in their own personal workspace,
--             with View Only or View and Edit; selected records and/or Share All per category (properties, buyers,
--             vendors, to-dos, calendar). Calculator and every other kind of record are never shared. Not transitive:
--             a recipient cannot share onward (only the record's owner can grant).
--  Writes     View Only cannot change anything. View and Edit can edit; only the owner can permanently delete a
--             property or contact or archive a property (an editor asks with a deletion request the owner decides);
--             a shared to-do or calendar entry can be deleted by either person.
--  Audit      eab_audit_events is insert-only and immutable; it is readable by whoever may read the record NOW (former
--             members lose it with the access); membership events are readable by current members and by the person
--             who created the Team Workspace. The record's owner may delete old entries only through
--             eab_audit_delete, which first copies them into eab_audit_backup (not readable through the API).

begin;

create extension if not exists pgcrypto;
create sequence if not exists public.eab_audit_seq;

-- ---------- tables ----------
create table if not exists public.eab_teams (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  ended_at    timestamptz,
  ended_by    uuid,
  end_reason  text check (end_reason in ('left', 'removed', 'disabled'))
);

create table if not exists public.eab_team_members (
  team_id    uuid not null references public.eab_teams (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  email      text not null,
  name       text,
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,
  primary key (team_id, user_id)
);
-- One active Team Workspace per person.
create unique index if not exists eab_team_members_one_active on public.eab_team_members (user_id) where left_at is null;

create table if not exists public.eab_team_invites (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.eab_teams (id) on delete cascade,
  invited_by    uuid not null references auth.users (id) on delete cascade,
  email         text check (email is null or (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  token_hash    text not null unique,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  responded_at  timestamptz,
  responded_by  uuid
);
-- One open invitation per Team Workspace at a time (the sender cancels it, or it expires, before another is sent).
create unique index if not exists eab_team_invites_one_pending on public.eab_team_invites (team_id) where status = 'pending';

create table if not exists public.eab_shares (
  id            bigserial primary key,
  team_id       uuid not null references public.eab_teams (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  recipient_id  uuid not null references auth.users (id) on delete cascade,
  workspace_id  uuid not null,
  collection    text not null check (collection in ('properties', 'contacts', 'tasks', 'appointments')),
  record_id     text not null,
  level         text not null check (level in ('view', 'edit')),
  granted_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  revoked_by    uuid,
  revoke_reason text
);
create unique index if not exists eab_shares_active on public.eab_shares (team_id, recipient_id, workspace_id, collection, record_id) where revoked_at is null;
create index if not exists eab_shares_recipient on public.eab_shares (recipient_id) where revoked_at is null;

create table if not exists public.eab_share_all (
  id            bigserial primary key,
  team_id       uuid not null references public.eab_teams (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  recipient_id  uuid not null references auth.users (id) on delete cascade,
  scope         text not null check (scope in ('properties', 'buyers', 'vendors', 'tasks', 'appointments')),
  level         text not null check (level in ('view', 'edit')),
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  ended_by      uuid,
  end_reason    text
);
create unique index if not exists eab_share_all_active on public.eab_share_all (team_id, owner_id, recipient_id, scope) where ended_at is null;

create table if not exists public.eab_delete_requests (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.eab_teams (id) on delete cascade,
  workspace_id  uuid not null,
  collection    text not null,
  record_id     text not null,
  owner_id      uuid not null,
  requester_id  uuid not null,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'void')),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid
);
create unique index if not exists eab_delete_requests_one_pending on public.eab_delete_requests (workspace_id, collection, record_id) where status = 'pending';

create table if not exists public.eab_audit_events (
  id            text primary key check (char_length(id) between 8 and 80),
  workspace_id  uuid,
  collection    text,
  record_id     text,
  owner_id      uuid,
  team_id       uuid,
  actor         uuid not null,
  actor_name    text check (actor_name is null or char_length(actor_name) <= 200),
  actor_email   text check (actor_email is null or char_length(actor_email) <= 320),
  action        text not null check (action in ('create', 'edit', 'archive', 'restore', 'delete', 'permission', 'membership', 'export', 'delete_request', 'delete_decision', 'audit_delete')),
  changes       jsonb check (changes is null or jsonb_typeof(changes) = 'array'),
  detail        jsonb check (detail is null or jsonb_typeof(detail) = 'object'),
  at            timestamptz not null,
  seq           bigint not null default nextval('public.eab_audit_seq'),
  received_at   timestamptz not null default now(),
  check (pg_column_size(changes) is null or pg_column_size(changes) <= 262144)
);
create index if not exists eab_audit_events_record on public.eab_audit_events (workspace_id, collection, record_id, at desc);
create index if not exists eab_audit_events_seq on public.eab_audit_events (seq);
create index if not exists eab_audit_events_team on public.eab_audit_events (team_id) where record_id is null;

-- Entries the owner deleted: kept for good, never readable or changeable through the API (no policy, no grant).
create table if not exists public.eab_audit_backup (
  like public.eab_audit_events,
  deleted_at  timestamptz not null default now(),
  deleted_by  uuid not null
);

-- ---------- helpers ----------
-- True when this person's Google account is usable (not banned, not deleted). Supabase keeps both in auth.users.
create or replace function public.eab_account_ok(p_user uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from auth.users u where u.id = p_user
                 and (u.banned_until is null or u.banned_until <= now()) and u.deleted_at is null)
$$;

-- My active Team Workspace (null = none).
create or replace function public.eab_my_team() returns uuid
language sql stable security definer set search_path = public as $$
  select m.team_id from public.eab_team_members m join public.eab_teams t on t.id = m.team_id
  where m.user_id = auth.uid() and m.left_at is null and t.ended_at is null limit 1
$$;

-- The other active member of my active Team Workspace (null = none).
create or replace function public.eab_my_partner() returns uuid
language sql stable security definer set search_path = public as $$
  select m.user_id from public.eab_team_members m
  where m.team_id = public.eab_my_team() and m.user_id <> auth.uid() and m.left_at is null limit 1
$$;

-- True when p_user owns workspace p_ws (their own personal workspace).
create or replace function public.eab_owns_workspace(p_ws uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.eab_members m where m.workspace_id = p_ws and m.user_id = p_user and m.role = 'owner' and m.active)
$$;

-- Which category a record belongs to for Share All.
create or replace function public.eab_scope_matches(p_scope text, p_coll text, p_data jsonb) returns boolean
language sql immutable as $$
  select case p_scope
    when 'properties'   then p_coll = 'properties'
    when 'tasks'        then p_coll = 'tasks'
    when 'appointments' then p_coll = 'appointments'
    when 'buyers'       then p_coll = 'contacts' and jsonb_typeof(p_data -> 'roles') = 'array' and (p_data -> 'roles') ?| array['buyer', 'tenant', 'investor']
    when 'vendors'      then p_coll = 'contacts' and jsonb_typeof(p_data -> 'roles') = 'array' and (p_data -> 'roles') ?| array['vendor', 'landlord']
    else false end
$$;

-- What p_user may do with a record that someone ELSE owns, through Change 010 sharing: 'edit', 'view' or null.
-- Needs: an active Team Workspace with both people still in it, both accounts usable, the record in its owner's own
-- personal workspace, and an active selected grant or an active Share All for the record's category.
create or replace function public.eab_shared_level(p_owner uuid, p_ws uuid, p_coll text, p_id text, p_data jsonb, p_user uuid default auth.uid())
returns text
language sql stable security definer set search_path = public as $$
  with team as (
    select t.id from public.eab_teams t
    where t.ended_at is null
      and exists (select 1 from public.eab_team_members a where a.team_id = t.id and a.user_id = p_user and a.left_at is null)
      and exists (select 1 from public.eab_team_members b where b.team_id = t.id and b.user_id = p_owner and b.left_at is null)
  ), lv as (
    select s.level from public.eab_shares s join team on team.id = s.team_id
    where s.revoked_at is null and s.recipient_id = p_user and s.owner_id = p_owner
      and s.workspace_id = p_ws and s.collection = p_coll and s.record_id = p_id
    union all
    select a.level from public.eab_share_all a join team on team.id = a.team_id
    where a.ended_at is null and a.recipient_id = p_user and a.owner_id = p_owner and public.eab_scope_matches(a.scope, p_coll, p_data)
  )
  select case when p_user is null or p_owner is null or p_user = p_owner then null
              when not public.eab_owns_workspace(p_ws, p_owner) then null
              when not public.eab_account_ok(p_user) or not public.eab_account_ok(p_owner) then null
              when exists (select 1 from lv where level = 'edit') then 'edit'
              when exists (select 1 from lv) then 'view' end
$$;

-- True when I am in an active Team Workspace with the owner of workspace p_ws (lets eab_push_records accept me).
create or replace function public.eab_linked_to_workspace(p_ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.eab_my_partner() is not null and public.eab_owns_workspace(p_ws, public.eab_my_partner())
$$;

-- Writes an audit event from inside these functions (membership and permission changes).
create or replace function public.eab_log(p_team uuid, p_action text, p_ws uuid, p_coll text, p_id text, p_owner uuid, p_detail jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.eab_audit_events (id, team_id, workspace_id, collection, record_id, owner_id, actor, actor_name, actor_email, action, detail, at)
  values (gen_random_uuid()::text, p_team, p_ws, p_coll, p_id, p_owner, coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
          nullif(coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() -> 'user_metadata' ->> 'name'), ''),
          nullif(lower(coalesce(auth.jwt() ->> 'email', '')), ''), p_action, p_detail, now());
end $$;

-- Ends a Team Workspace: everyone's access through it stops now; nothing is transferred or deleted.
create or replace function public.eab_end_team(p_team uuid, p_reason text, p_by uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.eab_teams set ended_at = now(), ended_by = p_by, end_reason = p_reason where id = p_team and ended_at is null;
  if not found then return; end if;
  update public.eab_team_members set left_at = now() where team_id = p_team and left_at is null;
  update public.eab_shares set revoked_at = now(), revoked_by = p_by, revoke_reason = 'team ended: ' || p_reason where team_id = p_team and revoked_at is null;
  update public.eab_share_all set ended_at = now(), ended_by = p_by, end_reason = 'team ended: ' || p_reason where team_id = p_team and ended_at is null;
  update public.eab_team_invites set status = 'cancelled', responded_at = now(), responded_by = p_by where team_id = p_team and status = 'pending';
  update public.eab_delete_requests set status = 'void', decided_at = now(), decided_by = p_by where team_id = p_team and status = 'pending';
end $$;

-- ---------- team: status ----------
-- Everything the app needs about my Team Workspace in one answer (only what I am allowed to see).
create or replace function public.eab_team_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text := lower(coalesce(auth.jwt() ->> 'email', '')); tm uuid; out jsonb;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  tm := public.eab_my_team();
  select jsonb_build_object(
    'team', (select jsonb_build_object('id', t.id, 'created_by', t.created_by, 'created_at', t.created_at) from public.eab_teams t where t.id = tm),
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', m.email, 'name', m.name, 'joined_at', m.joined_at) order by m.joined_at)
                         from public.eab_team_members m where m.team_id = tm and m.left_at is null), '[]'::jsonb),
    'invites_sent', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'created_at', i.created_at, 'expires_at', i.expires_at))
                         from public.eab_team_invites i where i.team_id = tm and i.status = 'pending' and i.expires_at > now()), '[]'::jsonb),
    'invites_for_me', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'from_email', fm.email, 'from_name', fm.name, 'created_at', i.created_at, 'expires_at', i.expires_at))
                         from public.eab_team_invites i join public.eab_team_members fm on fm.team_id = i.team_id and fm.user_id = i.invited_by
                         where i.status = 'pending' and i.expires_at > now() and i.email = em and i.invited_by <> uid), '[]'::jsonb),
    'shares_given', coalesce((select jsonb_agg(jsonb_build_object('workspace_id', s.workspace_id, 'collection', s.collection, 'record_id', s.record_id, 'level', s.level, 'recipient_id', s.recipient_id, 'granted_at', s.granted_at))
                         from public.eab_shares s where s.team_id = tm and s.owner_id = uid and s.revoked_at is null), '[]'::jsonb),
    'share_all_given', coalesce((select jsonb_agg(jsonb_build_object('scope', a.scope, 'level', a.level, 'recipient_id', a.recipient_id, 'started_at', a.started_at))
                         from public.eab_share_all a where a.team_id = tm and a.owner_id = uid and a.ended_at is null), '[]'::jsonb),
    'share_all_received', coalesce((select jsonb_agg(jsonb_build_object('scope', a.scope, 'level', a.level, 'owner_id', a.owner_id))
                         from public.eab_share_all a where a.team_id = tm and a.recipient_id = uid and a.ended_at is null), '[]'::jsonb),
    'delete_requests', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'workspace_id', d.workspace_id, 'collection', d.collection, 'record_id', d.record_id,
                                  'owner_id', d.owner_id, 'requester_id', d.requester_id, 'created_at', d.created_at) order by d.created_at)
                         from public.eab_delete_requests d where d.team_id = tm and d.status = 'pending' and (d.owner_id = uid or d.requester_id = uid)), '[]'::jsonb)
  ) into out;
  return out;
end $$;

-- ---------- team: invitations ----------
-- Sends an invitation (to a Google email, or a link anyone signed in may accept when p_email is null). Creates my
-- Team Workspace if I have none. Answers the link token ONCE; only its hash is stored.
create or replace function public.eab_team_invite(p_email text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$   -- pgcrypto (gen_random_bytes, digest) lives in "extensions" on Supabase
declare uid uuid := auth.uid(); me text := lower(coalesce(auth.jwt() ->> 'email', '')); em text := nullif(lower(btrim(coalesce(p_email, ''))), '');
        nm text := nullif(coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() -> 'user_metadata' ->> 'name'), '');
        tm uuid; tok text; inv uuid; n int;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if not public.eab_account_ok(uid) then raise exception 'account disabled' using errcode = '42501'; end if;
  if em is not null and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email' using errcode = '22023'; end if;
  if em is not null and em = me then raise exception 'cannot invite yourself' using errcode = '22023'; end if;
  tm := public.eab_my_team();
  if tm is null then
    insert into public.eab_teams (created_by) values (uid) returning id into tm;
    insert into public.eab_team_members (team_id, user_id, email, name) values (tm, uid, me, nm);
    perform public.eab_log(tm, 'membership', null, null, null, null, jsonb_build_object('event', 'team_created', 'email', me));
  end if;
  perform 1 from public.eab_teams where id = tm for update;   -- one change at a time per Team Workspace
  select count(*) into n from public.eab_team_members where team_id = tm and left_at is null;
  if n >= 2 then raise exception 'team is full' using errcode = '42501'; end if;
  update public.eab_team_invites set status = 'expired' where team_id = tm and status = 'pending' and expires_at <= now();
  if exists (select 1 from public.eab_team_invites where team_id = tm and status = 'pending') then
    raise exception 'an invitation is already waiting' using errcode = '42501'; end if;
  tok := encode(gen_random_bytes(24), 'hex');
  insert into public.eab_team_invites (team_id, invited_by, email, token_hash, expires_at)
    values (tm, uid, em, encode(digest(tok, 'sha256'), 'hex'), now() + interval '7 days') returning id into inv;
  perform public.eab_log(tm, 'membership', null, null, null, null, jsonb_build_object('event', 'invited', 'email', em, 'by_link', em is null));
  return jsonb_build_object('invite_id', inv, 'token', tok, 'team_id', tm, 'expires_at', now() + interval '7 days');
end $$;

-- The sender cancels a waiting invitation at any time; its link stops working at once.
create or replace function public.eab_team_cancel_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = public as $$
declare inv public.eab_team_invites;
begin
  select * into inv from public.eab_team_invites where id = p_invite for update;
  if not found or inv.invited_by <> auth.uid() then raise exception 'not allowed' using errcode = '42501'; end if;
  if inv.status <> 'pending' then raise exception 'invitation is no longer waiting' using errcode = '22023'; end if;
  update public.eab_team_invites set status = 'cancelled', responded_at = now(), responded_by = auth.uid() where id = p_invite;
  perform public.eab_log(inv.team_id, 'membership', null, null, null, null, jsonb_build_object('event', 'invite_cancelled', 'email', inv.email));
end $$;

-- Finds a waiting invitation for me by link token or id (an expired one is marked so and refused).
create or replace function public.eab_find_invite(p_token text, p_invite uuid) returns public.eab_team_invites
language plpgsql security definer set search_path = public, extensions as $$   -- pgcrypto (digest) lives in "extensions" on Supabase
declare inv public.eab_team_invites; em text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if p_token is not null then
    select * into inv from public.eab_team_invites where token_hash = encode(digest(p_token, 'sha256'), 'hex') for update;
  else
    select * into inv from public.eab_team_invites where id = p_invite for update;
  end if;
  if not found then raise exception 'invitation not found' using errcode = '22023'; end if;
  if inv.status = 'pending' and inv.expires_at <= now() then
    update public.eab_team_invites set status = 'expired' where id = inv.id;
    raise exception 'invitation expired' using errcode = '22023';
  end if;
  if inv.status <> 'pending' then raise exception 'invitation is no longer valid (%)', inv.status using errcode = '22023'; end if;
  if inv.invited_by = auth.uid() then raise exception 'cannot accept your own invitation' using errcode = '42501'; end if;
  if inv.email is not null and inv.email <> em then raise exception 'invitation is for another Google account' using errcode = '42501'; end if;
  return inv;
end $$;

create or replace function public.eab_team_accept(p_token text default null, p_invite uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text := lower(coalesce(auth.jwt() ->> 'email', ''));
        nm text := nullif(coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() -> 'user_metadata' ->> 'name'), '');
        inv public.eab_team_invites; mine uuid; n int;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if not public.eab_account_ok(uid) then raise exception 'account disabled' using errcode = '42501'; end if;
  inv := public.eab_find_invite(p_token, p_invite);
  perform 1 from public.eab_teams where id = inv.team_id and ended_at is null for update;
  if not found then raise exception 'invitation is no longer valid (team ended)' using errcode = '22023'; end if;
  select count(*) into n from public.eab_team_members where team_id = inv.team_id and left_at is null;
  if n >= 2 then raise exception 'team is full' using errcode = '42501'; end if;
  mine := public.eab_my_team();
  if mine is not null then
    if exists (select 1 from public.eab_team_members where team_id = mine and user_id <> uid and left_at is null) then
      raise exception 'you are already in a Team Workspace' using errcode = '42501'; end if;
    -- My own Team Workspace has nobody else in it: it closes (its waiting invitation is cancelled).
    update public.eab_team_invites set status = 'cancelled', responded_at = now(), responded_by = uid where team_id = mine and status = 'pending';
    update public.eab_team_members set left_at = now() where team_id = mine and user_id = uid;
    update public.eab_teams set ended_at = now(), ended_by = uid, end_reason = 'left' where id = mine;
  end if;
  insert into public.eab_team_members (team_id, user_id, email, name) values (inv.team_id, uid, em, nm)
    on conflict (team_id, user_id) do update set left_at = null, joined_at = now(), email = excluded.email, name = excluded.name;
  update public.eab_team_invites set status = 'accepted', responded_at = now(), responded_by = uid where id = inv.id;
  perform public.eab_log(inv.team_id, 'membership', null, null, null, null, jsonb_build_object('event', 'joined', 'email', em));
  return inv.team_id;
end $$;

create or replace function public.eab_team_decline(p_token text default null, p_invite uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare inv public.eab_team_invites;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  inv := public.eab_find_invite(p_token, p_invite);
  update public.eab_team_invites set status = 'declined', responded_at = now(), responded_by = auth.uid() where id = inv.id;
  perform public.eab_log(inv.team_id, 'membership', null, null, null, null, jsonb_build_object('event', 'declined', 'email', lower(coalesce(auth.jwt() ->> 'email', ''))));
end $$;

-- Leaving, or removing the other person, ends the Team Workspace for both (it never has more than two people).
create or replace function public.eab_team_leave() returns void
language plpgsql security definer set search_path = public as $$
declare tm uuid := public.eab_my_team();
begin
  if tm is null then raise exception 'not in a Team Workspace' using errcode = '22023'; end if;
  perform public.eab_log(tm, 'membership', null, null, null, null, jsonb_build_object('event', 'left', 'email', lower(coalesce(auth.jwt() ->> 'email', ''))));
  perform public.eab_end_team(tm, 'left', auth.uid());
end $$;

create or replace function public.eab_team_remove(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare tm uuid := public.eab_my_team(); em text;
begin
  if tm is null then raise exception 'not in a Team Workspace' using errcode = '22023'; end if;
  select email into em from public.eab_team_members where team_id = tm and user_id = p_user and left_at is null;
  if not found or p_user = auth.uid() then raise exception 'not allowed' using errcode = '42501'; end if;
  perform public.eab_log(tm, 'membership', null, null, null, null, jsonb_build_object('event', 'removed', 'email', em));
  perform public.eab_end_team(tm, 'removed', auth.uid());
end $$;

-- A disabled (banned) or deleted Google account loses every sharing permission at once. If it returns, nothing comes
-- back by itself.
create or replace function public.eab_account_disabled() returns trigger
language plpgsql security definer set search_path = public as $$
declare tm uuid;
begin
  if (new.banned_until is not null and new.banned_until > now() and (old.banned_until is null or old.banned_until <= now()))
     or (new.deleted_at is not null and old.deleted_at is null) then
    for tm in select m.team_id from public.eab_team_members m join public.eab_teams t on t.id = m.team_id
              where m.user_id = new.id and m.left_at is null and t.ended_at is null loop
      insert into public.eab_audit_events (id, team_id, actor, actor_email, action, detail, at)
        values (gen_random_uuid()::text, tm, new.id, lower(new.email), 'membership', jsonb_build_object('event', 'account_disabled', 'email', lower(new.email)), now());
      perform public.eab_end_team(tm, 'disabled', new.id);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists eab_users_disabled on auth.users;
create trigger eab_users_disabled after update of banned_until, deleted_at on auth.users for each row execute function public.eab_account_disabled();

-- ---------- sharing ----------
-- Owner sets access for the other person on records they own: items = [{collection, id, level: 'view'|'edit'|null}]
-- (null = stop sharing). Takes effect at once; no acceptance needed. Logged as permission events.
create or replace function public.eab_share_set(p_ws uuid, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); tm uuid := public.eab_my_team(); partner uuid := public.eab_my_partner();
        it jsonb; v_coll text; v_id text; v_lvl text; cur public.eab_shares; rec public.eab_records; out jsonb := '[]'::jsonb;
begin
  if tm is null or partner is null then raise exception 'no active Team Workspace with another agent' using errcode = '42501'; end if;
  if not public.eab_account_ok(uid) then raise exception 'account disabled' using errcode = '42501'; end if;
  if not public.eab_owns_workspace(p_ws, uid) then raise exception 'only your own records can be shared' using errcode = '42501'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then raise exception 'items must be an array of at most 500' using errcode = '22023'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_coll := it ->> 'collection'; v_id := it ->> 'id'; v_lvl := nullif(it ->> 'level', '');
    if v_coll not in ('properties', 'contacts', 'tasks', 'appointments') then
      out := out || jsonb_build_object('collection', v_coll, 'id', v_id, 'status', 'not_shareable'); continue; end if;
    if v_lvl is not null and v_lvl not in ('view', 'edit') then raise exception 'level must be view or edit' using errcode = '22023'; end if;
    select * into rec from public.eab_records where workspace_id = p_ws and collection = v_coll and id = v_id;
    if not found or rec.user_id <> uid then
      out := out || jsonb_build_object('collection', v_coll, 'id', v_id, 'status', 'not_owner'); continue; end if;
    select * into cur from public.eab_shares where team_id = tm and recipient_id = partner and workspace_id = p_ws and collection = v_coll and record_id = v_id and revoked_at is null for update;
    if v_lvl is null then
      if found then
        update public.eab_shares set revoked_at = now(), revoked_by = uid, revoke_reason = 'stopped by owner' where id = cur.id;
        perform public.eab_log(tm, 'permission', p_ws, v_coll, v_id, uid, jsonb_build_object('event', 'revoked', 'from', cur.level, 'to', null, 'recipient', partner, 'via', 'selected'));
      end if;
    elsif not found then
      insert into public.eab_shares (team_id, owner_id, recipient_id, workspace_id, collection, record_id, level) values (tm, uid, partner, p_ws, v_coll, v_id, v_lvl);
      perform public.eab_log(tm, 'permission', p_ws, v_coll, v_id, uid, jsonb_build_object('event', 'granted', 'from', null, 'to', v_lvl, 'recipient', partner, 'via', 'selected'));
    elsif cur.level <> v_lvl then
      update public.eab_shares set revoked_at = now(), revoked_by = uid, revoke_reason = 'level changed' where id = cur.id;
      insert into public.eab_shares (team_id, owner_id, recipient_id, workspace_id, collection, record_id, level) values (tm, uid, partner, p_ws, v_coll, v_id, v_lvl);
      perform public.eab_log(tm, 'permission', p_ws, v_coll, v_id, uid, jsonb_build_object('event', 'changed', 'from', cur.level, 'to', v_lvl, 'recipient', partner, 'via', 'selected'));
    end if;
    out := out || jsonb_build_object('collection', v_coll, 'id', v_id, 'status', 'ok', 'level', v_lvl);
  end loop;
  return out;
end $$;

-- Share All for one category (existing and future records of mine in it). Level null turns it off: access that came
-- from Share All stops; records shared one by one keep their own setting.
create or replace function public.eab_share_all_set(p_scope text, p_level text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); tm uuid := public.eab_my_team(); partner uuid := public.eab_my_partner(); cur public.eab_share_all;
begin
  if tm is null or partner is null then raise exception 'no active Team Workspace with another agent' using errcode = '42501'; end if;
  if p_scope not in ('properties', 'buyers', 'vendors', 'tasks', 'appointments') then raise exception 'category cannot be shared' using errcode = '22023'; end if;
  if p_level is not null and p_level not in ('view', 'edit') then raise exception 'level must be view or edit' using errcode = '22023'; end if;
  select * into cur from public.eab_share_all where team_id = tm and owner_id = uid and recipient_id = partner and scope = p_scope and ended_at is null for update;
  if p_level is null then
    if found then
      update public.eab_share_all set ended_at = now(), ended_by = uid, end_reason = 'turned off by owner' where id = cur.id;
      perform public.eab_log(tm, 'permission', null, p_scope, null, uid, jsonb_build_object('event', 'revoked', 'from', cur.level, 'to', null, 'recipient', partner, 'via', 'share_all', 'scope', p_scope));
    end if;
  elsif not found then
    insert into public.eab_share_all (team_id, owner_id, recipient_id, scope, level) values (tm, uid, partner, p_scope, p_level);
    perform public.eab_log(tm, 'permission', null, p_scope, null, uid, jsonb_build_object('event', 'granted', 'from', null, 'to', p_level, 'recipient', partner, 'via', 'share_all', 'scope', p_scope));
  elsif cur.level <> p_level then
    update public.eab_share_all set ended_at = now(), ended_by = uid, end_reason = 'level changed' where id = cur.id;
    insert into public.eab_share_all (team_id, owner_id, recipient_id, scope, level) values (tm, uid, partner, p_scope, p_level);
    perform public.eab_log(tm, 'permission', null, p_scope, null, uid, jsonb_build_object('event', 'changed', 'from', cur.level, 'to', p_level, 'recipient', partner, 'via', 'share_all', 'scope', p_scope));
  end if;
end $$;

-- Every record someone shares with me right now (selected or Share All), with its version, so the phone can fetch what
-- is new and drop what is no longer shared. Deleted records are listed too (so the phone removes its copy).
create or replace function public.eab_shared_index() returns table (workspace_id uuid, collection text, id text, rev bigint, deleted boolean, level text, owner_id uuid, owner_email text, owner_name text)
language sql stable security definer set search_path = public as $$
  select r.workspace_id, r.collection, r.id, r.rev, r.deleted, public.eab_shared_level(r.user_id, r.workspace_id, r.collection, r.id, r.data), r.user_id, m.email, m.name
  from public.eab_records r
  join public.eab_team_members m on m.team_id = public.eab_my_team() and m.user_id = r.user_id and m.left_at is null
  where r.user_id = public.eab_my_partner() and r.collection in ('properties', 'contacts', 'tasks', 'appointments')
    and public.eab_shared_level(r.user_id, r.workspace_id, r.collection, r.id, r.data) is not null
$$;

-- ---------- deletion requests (an editor asks; the owner decides) ----------
create or replace function public.eab_request_delete(p_ws uuid, p_coll text, p_id text) returns uuid
language plpgsql security definer set search_path = public as $$
declare rec public.eab_records; rid uuid; tm uuid := public.eab_my_team();
begin
  select * into rec from public.eab_records where workspace_id = p_ws and collection = p_coll and id = p_id;
  if not found or coalesce(public.eab_shared_level(rec.user_id, rec.workspace_id, rec.collection, rec.id, rec.data), '') <> 'edit' then
    raise exception 'not allowed' using errcode = '42501'; end if;
  insert into public.eab_delete_requests (team_id, workspace_id, collection, record_id, owner_id, requester_id)
    values (tm, p_ws, p_coll, p_id, rec.user_id, auth.uid()) returning id into rid;
  perform public.eab_log(tm, 'delete_request', p_ws, p_coll, p_id, rec.user_id, jsonb_build_object('event', 'requested', 'request_id', rid));
  return rid;
end $$;

create or replace function public.eab_decide_delete(p_request uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare d public.eab_delete_requests;
begin
  select * into d from public.eab_delete_requests where id = p_request for update;
  if not found or d.owner_id <> auth.uid() then raise exception 'not allowed' using errcode = '42501'; end if;
  if d.status <> 'pending' then raise exception 'request is no longer waiting' using errcode = '22023'; end if;
  update public.eab_delete_requests set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now(), decided_by = auth.uid() where id = p_request;
  perform public.eab_log(d.team_id, 'delete_decision', d.workspace_id, d.collection, d.record_id, d.owner_id,
    jsonb_build_object('event', case when p_approve then 'approved' else 'rejected' end, 'request_id', d.id, 'requester', d.requester_id));
end $$;

-- ---------- records: what a person with shared access may write ----------
-- Only the owner may permanently delete a property or contact, or archive a property (others send a deletion request).
-- A shared to-do or calendar entry may be deleted by either person. Same-workspace roles keep their existing rights.
create or replace function public.eab_shared_write_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or auth.uid() = old.user_id or public.eab_role_in(old.workspace_id) is not null then return new; end if;
  if new.deleted and not old.deleted and old.collection not in ('tasks', 'appointments') then
    raise exception 'only the owner can permanently delete this record' using errcode = '42501'; end if;
  if old.collection = 'properties' and not new.deleted
     and jsonb_typeof(new.data -> 'archived') = 'object' and coalesce(jsonb_typeof(old.data -> 'archived'), 'null') <> 'object' then
    raise exception 'only the owner can archive this property; send a deletion request' using errcode = '42501'; end if;
  return new;
end $$;
drop trigger if exists eab_records_shared_rules on public.eab_records;
create trigger eab_records_shared_rules before update on public.eab_records for each row execute function public.eab_shared_write_rules();

drop policy if exists "eab shared read" on public.eab_records;
drop policy if exists "eab shared update" on public.eab_records;
create policy "eab shared read" on public.eab_records for select to authenticated using (
  user_id <> auth.uid() and public.eab_shared_level(user_id, workspace_id, collection, id, data) is not null);
create policy "eab shared update" on public.eab_records for update to authenticated
  using (user_id <> auth.uid() and public.eab_shared_level(user_id, workspace_id, collection, id, data) = 'edit')
  with check (user_id <> auth.uid() and public.eab_shared_level(user_id, workspace_id, collection, id, data) = 'edit');

-- ---------- audit history ----------
-- Who wrote an event comes from the sign-in, never from the phone. Events never change afterwards.
-- SECURITY INVOKER on purpose: current_user is then the signed-in person's role (inside a SECURITY DEFINER function it
-- would be the function's owner, and the stamp would be skipped).
create or replace function public.eab_audit_stamp() returns trigger
language plpgsql security invoker set search_path = public as $$
declare rec public.eab_records;
begin
  if current_user in ('authenticated', 'anon') then
    new.actor := auth.uid();
    new.actor_name := nullif(coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() -> 'user_metadata' ->> 'name'), '');
    new.actor_email := nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
    new.seq := nextval('public.eab_audit_seq');
    new.received_at := now();
    if new.at > now() + interval '10 minutes' then new.at := now(); end if;
    select * into rec from public.eab_records where workspace_id = new.workspace_id and collection = new.collection and id = new.record_id;
    if found then new.owner_id := rec.user_id; end if;
    new.team_id := public.eab_my_team();
  end if;
  return new;
end $$;
drop trigger if exists eab_audit_events_stamp on public.eab_audit_events;
create trigger eab_audit_events_stamp before insert on public.eab_audit_events for each row execute function public.eab_audit_stamp();

create or replace function public.eab_audit_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('eab.audit_delete', true), '') = 'on' then return old; end if;
  raise exception 'audit history cannot be changed' using errcode = '42501';
end $$;
drop trigger if exists eab_audit_events_immutable on public.eab_audit_events;
create trigger eab_audit_events_immutable before update or delete on public.eab_audit_events for each row execute function public.eab_audit_immutable();

-- Can the signed-in person read this record right now? (Runs the record's own row-level security.)
create or replace function public.eab_can_read(p_ws uuid, p_coll text, p_id text) returns boolean
language sql stable security invoker set search_path = public as $$
  select exists (select 1 from public.eab_records r where r.workspace_id = p_ws and r.collection = p_coll and r.id = p_id)
$$;

alter table public.eab_audit_events enable row level security;
drop policy if exists "eab audit read" on public.eab_audit_events;
drop policy if exists "eab audit add" on public.eab_audit_events;
create policy "eab audit read" on public.eab_audit_events for select to authenticated using (
  (record_id is not null and public.eab_can_read(workspace_id, collection, record_id))
  or (record_id is null and action = 'permission' and (owner_id = auth.uid()
        or (team_id = public.eab_my_team() and public.eab_my_partner() = owner_id)))
  or (record_id is null and action = 'membership' and (team_id = public.eab_my_team()
        or exists (select 1 from public.eab_teams t where t.id = team_id and t.created_by = auth.uid())))
);
create policy "eab audit add" on public.eab_audit_events for insert to authenticated with check (
  actor = auth.uid() and record_id is not null
  and action in ('create', 'edit', 'archive', 'restore', 'delete', 'export')
  and public.eab_can_read(workspace_id, collection, record_id)
);

-- The record's owner deletes old audit entries (after the app's warning). Each one is copied to eab_audit_backup first
-- (kept for good, not readable through the API), and the deletion itself is recorded.
create or replace function public.eab_audit_delete(p_ids text[]) returns integer
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int; bad int; ws uuid; coll text; rid text;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select count(*) into bad from public.eab_audit_events e where e.id = any (p_ids) and (e.record_id is null or e.owner_id is distinct from uid);
  if bad > 0 then raise exception 'only the record owner can delete these entries' using errcode = '42501'; end if;
  insert into public.eab_audit_backup select e.*, now(), uid from public.eab_audit_events e where e.id = any (p_ids);
  get diagnostics n = row_count;
  perform set_config('eab.audit_delete', 'on', true);
  delete from public.eab_audit_events e where e.id = any (p_ids);
  perform set_config('eab.audit_delete', '', true);
  for ws, coll, rid in select distinct b.workspace_id, b.collection, b.record_id from public.eab_audit_backup b where b.id = any (p_ids) and b.deleted_by = uid loop
    perform public.eab_log(public.eab_my_team(), 'audit_delete', ws, coll, rid, uid, jsonb_build_object('count', n));
  end loop;
  return n;
end $$;

-- ---------- row-level security on the new tables (changes go through the functions above) ----------
alter table public.eab_teams enable row level security;
alter table public.eab_team_members enable row level security;
alter table public.eab_team_invites enable row level security;
alter table public.eab_shares enable row level security;
alter table public.eab_share_all enable row level security;
alter table public.eab_delete_requests enable row level security;
alter table public.eab_audit_backup enable row level security;   -- no policy at all: unreadable through the API

drop policy if exists "eab team visible" on public.eab_teams;
create policy "eab team visible" on public.eab_teams for select to authenticated using (id = public.eab_my_team() or created_by = auth.uid());
drop policy if exists "eab team members visible" on public.eab_team_members;
create policy "eab team members visible" on public.eab_team_members for select to authenticated using (
  team_id = public.eab_my_team() or exists (select 1 from public.eab_teams t where t.id = team_id and t.created_by = auth.uid()));
drop policy if exists "eab invites mine" on public.eab_team_invites;
create policy "eab invites mine" on public.eab_team_invites for select to authenticated using (
  invited_by = auth.uid() or email = lower(coalesce(auth.jwt() ->> 'email', '')));
drop policy if exists "eab shares mine" on public.eab_shares;
create policy "eab shares mine" on public.eab_shares for select to authenticated using (owner_id = auth.uid() or (recipient_id = auth.uid() and revoked_at is null));
drop policy if exists "eab share all mine" on public.eab_share_all;
create policy "eab share all mine" on public.eab_share_all for select to authenticated using (owner_id = auth.uid() or (recipient_id = auth.uid() and ended_at is null));
drop policy if exists "eab delete requests mine" on public.eab_delete_requests;
create policy "eab delete requests mine" on public.eab_delete_requests for select to authenticated using (owner_id = auth.uid() or requester_id = auth.uid());

revoke all on public.eab_teams, public.eab_team_members, public.eab_team_invites, public.eab_shares, public.eab_share_all,
  public.eab_delete_requests, public.eab_audit_events, public.eab_audit_backup from anon, authenticated;
-- token_hash is never readable: invitations are visible column by column.
grant select on public.eab_teams, public.eab_team_members, public.eab_shares, public.eab_share_all, public.eab_delete_requests, public.eab_audit_events to authenticated;
grant select (id, team_id, invited_by, email, created_at, expires_at, status, responded_at) on public.eab_team_invites to authenticated;
grant insert (id, workspace_id, collection, record_id, action, changes, detail, at, actor) on public.eab_audit_events to authenticated;
-- The insert's default sequence number is taken as the person (the stamp trigger replaces it anyway).
grant usage on sequence public.eab_audit_seq to authenticated;

-- ---------- eab_push_records: the Phase 2 function with ONE extra condition ----------
create or replace function public.eab_push_records(ws uuid, rows jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  r jsonb; cur public.eab_records; out jsonb := '[]'::jsonb;
  v_coll text; v_id text; v_base bigint; v_op text; v_del boolean; v_data jsonb; v_upd bigint; v_rev bigint;
  v_no integer; v_cname text; h record; v_title text; v_seen boolean;
begin
  -- Change 010: also an agent whose Team Workspace partner owns this workspace (row-level security still decides each row).
  if public.eab_role_in(ws) is null and not public.eab_linked_to_workspace(ws) then raise exception 'not allowed' using errcode = '42501'; end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 200 then raise exception 'rows must be an array of at most 200' using errcode = '22023'; end if;
  for r in select * from jsonb_array_elements(rows) loop
    v_coll := r ->> 'collection'; v_id := r ->> 'id';
    v_base := coalesce((r ->> 'base_rev')::bigint, 0);
    v_op := nullif(r ->> 'op_id', '');
    v_del := coalesce((r ->> 'deleted')::boolean, false);
    v_data := case when v_del then null else r -> 'data' end;
    v_upd := coalesce((r ->> 'updated')::bigint, (extract(epoch from now()) * 1000)::bigint);
    begin
      select * into cur from public.eab_records where workspace_id = ws and collection = v_coll and id = v_id for update;
      if not found then
        insert into public.eab_records (workspace_id, user_id, collection, id, data, deleted, updated, op_id)
          values (ws, auth.uid(), v_coll, v_id, v_data, v_del, v_upd, v_op) returning rev into v_rev;
        out := out || jsonb_build_object('collection', v_coll, 'id', v_id, 'status', 'ok', 'rev', v_rev);
      elsif v_op is not null and cur.op_id = v_op then
        out := out || jsonb_build_object('collection', v_coll, 'id', v_id, 'status', 'ok', 'rev', cur.rev, 'duplicate', true);
      elsif cur.rev = v_base then
        update public.eab_records set data = v_data, deleted = v_del, updated = v_upd, op_id = v_op
          where workspace_id = ws and collection = v_coll and id = v_id returning rev into v_rev;
        out := out || jsonb_build_object('collection', v_coll, 'id', v_id, 'status', 'ok', 'rev', v_rev);
      else
        out := out || jsonb_build_object('collection', v_coll, 'id', v_id, 'status', 'conflict', 'rev', cur.rev, 'deleted', cur.deleted, 'data', cur.data);
      end if;
    exception
      when insufficient_privilege then
        out := out || jsonb_build_object('collection', v_coll, 'id', v_id, 'status', 'denied');
      when unique_violation then
        get stacked diagnostics v_cname = constraint_name;
        if v_cname like 'eab_property_refs%' then
          v_no := public.eab_ref_number(v_data);
          select * into h from public.eab_ref_holder(ws, v_no) limit 1;
          v_title := null; v_seen := false;
          if h.property_id is not null then
            select true, d.data ->> 'headline' into v_seen, v_title from public.eab_records d
              where d.workspace_id = ws and d.collection = 'properties' and d.id = h.property_id;   -- only if this user may read it
          end if;
          out := out || jsonb_build_object('collection', v_coll, 'id', v_id, 'status', 'ref_conflict', 'ref_no', v_no,
            'ref', upper(btrim(coalesce(v_data ->> 'ref', ''))), 'other_ref', h.ref,
            'other_id', case when coalesce(v_seen, false) then h.property_id end,
            'other_title', case when coalesce(v_seen, false) then v_title end, 'other_visible', coalesce(v_seen, false));
        else
          -- two devices created the same record id at the same moment: the second one sees the first one's copy
          select * into cur from public.eab_records where workspace_id = ws and collection = v_coll and id = v_id;
          if not found then
            out := out || jsonb_build_object('collection', v_coll, 'id', v_id, 'status', 'denied');
          elsif v_op is not null and cur.op_id = v_op then
            out := out || jsonb_build_object('collection', v_coll, 'id', v_id, 'status', 'ok', 'rev', cur.rev, 'duplicate', true);
          else
            out := out || jsonb_build_object('collection', v_coll, 'id', v_id, 'status', 'conflict', 'rev', cur.rev, 'deleted', cur.deleted, 'data', cur.data);
          end if;
        end if;
    end;
  end loop;
  return out;
end $$;

-- An editor of a shared record may add pictures/documents to it (the storage rules already follow eab_files).
drop policy if exists "eab file added by a shared editor" on public.eab_files;
create policy "eab file added by a shared editor" on public.eab_files for insert to authenticated with check (
  uploaded_by = auth.uid()
  and exists (select 1 from public.eab_records r where r.workspace_id = eab_files.workspace_id and r.collection = eab_files.collection
              and r.id = eab_files.record_id and public.eab_shared_level(r.user_id, r.workspace_id, r.collection, r.id, r.data) = 'edit')
);


-- If the proposed old-app write block (20261015000000_block_direct_writes.sql) is already in place, keep its marker on
-- the replaced function (CREATE OR REPLACE resets function settings).
do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'eab_records_block_direct') then
    alter function public.eab_push_records(uuid, jsonb) set eab.via_push = 'on';
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['eab_account_ok(uuid)', 'eab_my_team()', 'eab_my_partner()', 'eab_owns_workspace(uuid, uuid)',
    'eab_shared_level(uuid, uuid, text, text, jsonb, uuid)', 'eab_linked_to_workspace(uuid)', 'eab_log(uuid, text, uuid, text, text, uuid, jsonb)',
    'eab_end_team(uuid, text, uuid)', 'eab_team_status()', 'eab_team_invite(text)', 'eab_team_cancel_invite(uuid)', 'eab_find_invite(text, uuid)',
    'eab_team_accept(text, uuid)', 'eab_team_decline(text, uuid)', 'eab_team_leave()', 'eab_team_remove(uuid)', 'eab_share_set(uuid, jsonb)',
    'eab_share_all_set(text, text)', 'eab_shared_index()', 'eab_request_delete(uuid, text, text)', 'eab_decide_delete(uuid, boolean)',
    'eab_can_read(uuid, text, text)', 'eab_audit_delete(text[])', 'eab_scope_matches(text, text, jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
  end loop;
  -- Internal helpers: not callable through the API.
  foreach f in array array['eab_log(uuid, text, uuid, text, text, uuid, jsonb)', 'eab_end_team(uuid, text, uuid)', 'eab_find_invite(text, uuid)'] loop
    execute format('revoke all on function public.%s from authenticated', f);
  end loop;
  foreach f in array array['eab_account_ok(uuid)', 'eab_my_team()', 'eab_my_partner()', 'eab_owns_workspace(uuid, uuid)',
    'eab_shared_level(uuid, uuid, text, text, jsonb, uuid)', 'eab_linked_to_workspace(uuid)', 'eab_team_status()', 'eab_team_invite(text)',
    'eab_team_cancel_invite(uuid)', 'eab_team_accept(text, uuid)', 'eab_team_decline(text, uuid)', 'eab_team_leave()', 'eab_team_remove(uuid)',
    'eab_share_set(uuid, jsonb)', 'eab_share_all_set(text, text)', 'eab_shared_index()', 'eab_request_delete(uuid, text, text)',
    'eab_decide_delete(uuid, boolean)', 'eab_can_read(uuid, text, text)', 'eab_audit_delete(text[])', 'eab_scope_matches(text, text, jsonb)'] loop
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

commit;
