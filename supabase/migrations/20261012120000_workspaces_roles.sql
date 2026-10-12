-- Estate Agent Buddy: team workspaces, roles, invitations, audit log, and role-based access to records.
-- Run after 20261012000000_eab_records.sql (Supabase → SQL Editor, or `supabase db push`).
--
-- Roles (enforced here by row-level security — hiding buttons in the app is not what protects the data):
--   owner        everything in the workspace; manages members, including admins
--   admin        all records; manages members except the owner and other admins
--   team_leader  reads all records; edits records they created or are assigned to
--   agent        reads and edits records they created or are assigned to
--   limited      reads records they created or are assigned to; cannot change anything
-- First Google sign-in with no invitation creates the person's own workspace (they are its owner). Anyone else joins
-- only through an invitation sent by the owner or an admin to their Google email. Switched-off members see nothing.
-- Records are never hard-deleted by the app: a deletion is synced as deleted = true (kept for history/recovery).

create extension if not exists pgcrypto;

-- ---------- tables ----------
create table if not exists public.eab_workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.eab_members (
  workspace_id uuid not null references public.eab_workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  email        text not null,
  role         text not null check (role in ('owner', 'admin', 'team_leader', 'agent', 'limited')),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists eab_members_user on public.eab_members (user_id);

create table if not exists public.eab_invites (
  workspace_id uuid not null references public.eab_workspaces (id) on delete cascade,
  email        text not null check (email = lower(email)),
  role         text not null check (role in ('admin', 'team_leader', 'agent', 'limited')),
  invited_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, email)
);

create table if not exists public.eab_audit (
  id           bigserial primary key,
  workspace_id uuid references public.eab_workspaces (id) on delete cascade,
  actor        uuid,
  action       text not null,
  target       text,
  detail       jsonb,
  at           timestamptz not null default now()
);
create index if not exists eab_audit_ws_at on public.eab_audit (workspace_id, at desc);

-- ---------- helper: my role in a workspace (null = not an active member) ----------
create or replace function public.eab_role_in(ws uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.eab_members where workspace_id = ws and user_id = auth.uid() and active
$$;

-- ---------- records: belong to a workspace ----------
alter table public.eab_records add column if not exists workspace_id uuid references public.eab_workspaces (id) on delete cascade;
alter table public.eab_records add column if not exists assigned_to uuid references auth.users (id) on delete set null;

-- Existing records (from the single-user version) move into their owner's own workspace.
do $$
declare r record; ws uuid;
begin
  for r in select distinct user_id from public.eab_records where workspace_id is null loop
    select m.workspace_id into ws from public.eab_members m where m.user_id = r.user_id and m.role = 'owner' limit 1;
    if ws is null then
      insert into public.eab_workspaces (name, created_by) values ('My team', r.user_id) returning id into ws;
      insert into public.eab_members (workspace_id, user_id, email, role)
        values (ws, r.user_id, coalesce((select lower(email) from auth.users where id = r.user_id), ''), 'owner');
    end if;
    update public.eab_records set workspace_id = ws where user_id = r.user_id and workspace_id is null;
  end loop;
end $$;

alter table public.eab_records alter column workspace_id set not null;
alter table public.eab_records drop constraint if exists eab_records_pkey;
alter table public.eab_records add primary key (workspace_id, collection, id);
create index if not exists eab_records_ws_updated on public.eab_records (workspace_id, updated);

-- Whoever edits a record, its creator and workspace stay the same.
create or replace function public.eab_keep_owner() returns trigger
language plpgsql as $$
begin
  new.user_id := old.user_id;
  new.workspace_id := old.workspace_id;
  return new;
end $$;
drop trigger if exists eab_records_keep_owner on public.eab_records;
create trigger eab_records_keep_owner before update on public.eab_records for each row execute function public.eab_keep_owner();

-- ---------- row-level security ----------
alter table public.eab_records enable row level security;
drop policy if exists "Own records only" on public.eab_records;
drop policy if exists "eab read" on public.eab_records;
drop policy if exists "eab insert" on public.eab_records;
drop policy if exists "eab update" on public.eab_records;

create policy "eab read" on public.eab_records for select using (
  public.eab_role_in(workspace_id) in ('owner', 'admin', 'team_leader')
  or (public.eab_role_in(workspace_id) in ('agent', 'limited') and (user_id = auth.uid() or assigned_to = auth.uid()))
);
create policy "eab insert" on public.eab_records for insert with check (
  public.eab_role_in(workspace_id) in ('owner', 'admin', 'team_leader', 'agent') and user_id = auth.uid()
);
create policy "eab update" on public.eab_records for update using (
  public.eab_role_in(workspace_id) in ('owner', 'admin')
  or (public.eab_role_in(workspace_id) in ('team_leader', 'agent') and (user_id = auth.uid() or assigned_to = auth.uid()))
) with check (
  public.eab_role_in(workspace_id) in ('owner', 'admin')
  or (public.eab_role_in(workspace_id) in ('team_leader', 'agent') and (user_id = auth.uid() or assigned_to = auth.uid()))
);
-- No delete policy: records cannot be hard-deleted through the API.

alter table public.eab_workspaces enable row level security;
drop policy if exists "eab member reads workspace" on public.eab_workspaces;
create policy "eab member reads workspace" on public.eab_workspaces for select using (public.eab_role_in(id) is not null);

alter table public.eab_members enable row level security;
drop policy if exists "eab members visible" on public.eab_members;
-- The owner and admins see the member list; everyone else sees only their own membership (no team emails for agents).
create policy "eab members visible" on public.eab_members for select using (
  user_id = auth.uid() or public.eab_role_in(workspace_id) in ('owner', 'admin')
);

alter table public.eab_invites enable row level security;
drop policy if exists "eab invites visible" on public.eab_invites;
create policy "eab invites visible" on public.eab_invites for select using (public.eab_role_in(workspace_id) in ('owner', 'admin'));

alter table public.eab_audit enable row level security;
drop policy if exists "eab audit visible" on public.eab_audit;
create policy "eab audit visible" on public.eab_audit for select using (public.eab_role_in(workspace_id) in ('owner', 'admin'));
-- Members, invitations and the audit log are changed only through the functions below (checked and logged).

-- ---------- functions used by the app ----------
-- Called after every sign-in: accepts invitations for this Google email, creates an own workspace on the very first
-- sign-in, and returns the active membership (none = access switched off).
create or replace function public.eab_my_membership()
returns table (workspace_id uuid, workspace_name text, role text)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  em  text := lower(coalesce(auth.jwt() ->> 'email', ''));
  inv record;
  ws  uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  for inv in select * from public.eab_invites i where i.email = em loop
    insert into public.eab_members (workspace_id, user_id, email, role) values (inv.workspace_id, uid, em, inv.role)
      on conflict on constraint eab_members_pkey do nothing;
    insert into public.eab_audit (workspace_id, actor, action, target, detail) values (inv.workspace_id, uid, 'invite_accepted', em, jsonb_build_object('role', inv.role));
    delete from public.eab_invites i2 where i2.workspace_id = inv.workspace_id and i2.email = em;
  end loop;
  if not exists (select 1 from public.eab_members m where m.user_id = uid) then
    insert into public.eab_workspaces (name, created_by)
      values (coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''), em) || ' team', uid) returning id into ws;
    insert into public.eab_members (workspace_id, user_id, email, role) values (ws, uid, em, 'owner');
    insert into public.eab_audit (workspace_id, actor, action, target) values (ws, uid, 'workspace_created', em);
  end if;
  return query
    select m.workspace_id, w.name, m.role
    from public.eab_members m join public.eab_workspaces w on w.id = m.workspace_id
    where m.user_id = uid and m.active
    order by array_position(array['owner', 'admin', 'team_leader', 'agent', 'limited'], m.role), m.created_at
    limit 1;
end $$;

-- Invite a Google email with a role. Owner: any role except owner. Admin: not admin.
create or replace function public.eab_invite(ws uuid, p_email text, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare me text := coalesce(public.eab_role_in(ws), ''); em text := lower(trim(p_email));
begin
  -- coalesce: a non-member has no role (null), and "null not in (...)" would not stop them.
  if me not in ('owner', 'admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_role not in ('admin', 'team_leader', 'agent', 'limited') or (me = 'admin' and p_role = 'admin') then
    raise exception 'role not allowed' using errcode = '42501'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email' using errcode = '22023'; end if;
  insert into public.eab_invites (workspace_id, email, role, invited_by) values (ws, em, p_role, auth.uid())
    on conflict (workspace_id, email) do update set role = excluded.role, invited_by = excluded.invited_by, created_at = now();
  insert into public.eab_audit (workspace_id, actor, action, target, detail) values (ws, auth.uid(), 'invite', em, jsonb_build_object('role', p_role));
end $$;

create or replace function public.eab_cancel_invite(ws uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.eab_role_in(ws), '') not in ('owner', 'admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from public.eab_invites where workspace_id = ws and email = lower(trim(p_email));
  insert into public.eab_audit (workspace_id, actor, action, target) values (ws, auth.uid(), 'invite_cancelled', lower(trim(p_email)));
end $$;

-- Change a member's role or switch their access off/on. Nobody changes the owner or themselves; only the owner
-- changes admins or makes someone admin.
create or replace function public.eab_set_member(ws uuid, p_user uuid, p_role text, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me text := coalesce(public.eab_role_in(ws), ''); cur record;
begin
  if me not in ('owner', 'admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into cur from public.eab_members where workspace_id = ws and user_id = p_user;
  if not found then raise exception 'no such member' using errcode = '22023'; end if;
  if p_user = auth.uid() or cur.role = 'owner' or p_role = 'owner' then raise exception 'not allowed' using errcode = '42501'; end if;
  if me = 'admin' and (cur.role = 'admin' or p_role = 'admin') then raise exception 'only the owner manages admins' using errcode = '42501'; end if;
  if p_role not in ('admin', 'team_leader', 'agent', 'limited') then raise exception 'role not allowed' using errcode = '22023'; end if;
  update public.eab_members set role = p_role, active = p_active where workspace_id = ws and user_id = p_user;
  insert into public.eab_audit (workspace_id, actor, action, target, detail)
    values (ws, auth.uid(), case when cur.active <> p_active then (case when p_active then 'access_on' else 'access_off' end) else 'role_changed' end,
            cur.email, jsonb_build_object('role', p_role, 'from', cur.role, 'active', p_active));
end $$;

revoke all on function public.eab_my_membership() from public, anon;
revoke all on function public.eab_invite(uuid, text, text) from public, anon;
revoke all on function public.eab_cancel_invite(uuid, text) from public, anon;
revoke all on function public.eab_set_member(uuid, uuid, text, boolean) from public, anon;
revoke all on function public.eab_role_in(uuid) from public, anon;
grant execute on function public.eab_my_membership() to authenticated;
grant execute on function public.eab_invite(uuid, text, text) to authenticated;
grant execute on function public.eab_cancel_invite(uuid, text) to authenticated;
grant execute on function public.eab_set_member(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.eab_role_in(uuid) to authenticated;

grant select, insert, update on public.eab_records to authenticated;
grant select on public.eab_workspaces, public.eab_members, public.eab_invites, public.eab_audit to authenticated;
