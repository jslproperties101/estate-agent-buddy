-- JoyChange010-05: confidential documents (title, owner correspondence, rental or sales documents) go to the cloud too,
-- so the agent has them on every phone and the laptop website. Joe, 21 Oct 2026. Replaces the owner decision of
-- 16 Oct 2026 (confidential documents only in the owner's own backups and Google Drive).
--
-- Who may download a confidential document from the cloud (decided HERE, never on the phone):
--   * the agent who owns the property, and the agent it is assigned to, on any of their devices;
--   * the owner / admin of the workspace the property is in (the account side, as for every other record);
--   * a Team Workspace partner the property is shared with ONLY when the owner switched on "Include confidential
--     documents" for that share — for that one property, or for every property shared through Share All. Off by default.
-- Everybody else who can see the property (e.g. a team leader in the same workspace, or a partner without the switch)
-- still sees the property and its other photos and documents, but not the confidential files.
-- Which file is confidential is read from the property itself (documents[].category), not from anything the phone says.
--
-- Safe to run twice. Rollback: supabase/rollback/20261021220000_confidential_cloud_files_rollback.sql
begin;

-- The owner's switch per share. Separate from eab_shares / eab_share_all so changing View/Edit never resets it; it only
-- counts while the property is actually shared (eab_shared_level not null).
create table if not exists public.eab_share_confidential (
  id           bigserial primary key,
  team_id      uuid not null references public.eab_teams (id) on delete restrict,
  owner_id     uuid not null references auth.users (id) on delete restrict,
  recipient_id uuid not null references auth.users (id) on delete restrict,
  workspace_id uuid,                 -- one property: workspace + record id; Share All: both null and scope = 'properties'
  record_id    text,
  scope        text check (scope is null or scope = 'properties'),
  granted_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  revoked_by   uuid,
  check ((scope is null and workspace_id is not null and record_id is not null) or (scope = 'properties' and workspace_id is null and record_id is null))
);
create unique index if not exists eab_share_confidential_one on public.eab_share_confidential
  (team_id, owner_id, recipient_id, coalesce(scope, ''), coalesce(workspace_id::text, ''), coalesce(record_id, '')) where revoked_at is null;
alter table public.eab_share_confidential enable row level security;
revoke all on public.eab_share_confidential from public, anon, authenticated;

-- Is this file a confidential document of this property?
create or replace function public.eab_file_confidential(p_data jsonb, p_file text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(jsonb_typeof(p_data -> 'documents') = 'array' and exists (
    select 1 from jsonb_array_elements(p_data -> 'documents') d
     where d ->> 'fileId' = p_file and d ->> 'category' in ('title', 'correspondence', 'transaction')), false)
$$;

-- May p_user see the confidential files of this shared property? (owner switched it on, and the property is shared now)
create or replace function public.eab_confidential_shared(p_owner uuid, p_ws uuid, p_coll text, p_id text, p_data jsonb, p_user uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public as $$
  select p_coll = 'properties' and p_user is not null and p_owner is not null and p_user <> p_owner
     and public.eab_shared_level(p_owner, p_ws, p_coll, p_id, p_data, p_user) is not null
     and exists (
       select 1 from public.eab_share_confidential c join public.eab_teams t on t.id = c.team_id and t.ended_at is null
        where c.revoked_at is null and c.owner_id = p_owner and c.recipient_id = p_user
          and exists (select 1 from public.eab_team_members a where a.team_id = t.id and a.user_id = p_user and a.left_at is null)
          and exists (select 1 from public.eab_team_members b where b.team_id = t.id and b.user_id = p_owner and b.left_at is null)
          and (c.scope = 'properties' or (c.workspace_id = p_ws and c.record_id = p_id)))
$$;

-- The cloud file list (and through it the storage objects) follows the property, minus confidential files for people
-- the rule above leaves out.
drop policy if exists "eab file visible with its record" on public.eab_files;
create policy "eab file visible with its record" on public.eab_files for select to authenticated using (
  exists (select 1 from public.eab_records r
           where r.workspace_id = eab_files.workspace_id and r.collection = eab_files.collection and r.id = eab_files.record_id
             and (not public.eab_file_confidential(r.data, eab_files.file_id)
                  or r.user_id = auth.uid() or r.assigned_to = auth.uid()
                  or public.eab_role_in(r.workspace_id) in ('owner', 'admin')
                  or public.eab_confidential_shared(r.user_id, r.workspace_id, r.collection, r.id, r.data)))
);

-- The owner turns the switch on or off: one property (p_ws + p_id) or every property shared by Share All (both null).
-- Takes effect at once; logged in the Team Workspace history like every permission change.
create or replace function public.eab_share_confidential_set(p_ws uuid, p_id text, p_on boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); tm uuid := public.eab_my_team(); partner uuid := public.eab_my_partner();
        all_ boolean := p_ws is null and p_id is null; cur public.eab_share_confidential; owner_ uuid;
begin
  if tm is null or partner is null then raise exception 'no active Team Workspace with another agent' using errcode = '42501'; end if;
  if not public.eab_account_ok(uid) then raise exception 'account disabled' using errcode = '42501'; end if;
  if not all_ then
    if p_ws is null or p_id is null then raise exception 'workspace and property both needed' using errcode = '22023'; end if;
    select user_id into owner_ from public.eab_records where workspace_id = p_ws and collection = 'properties' and id = p_id;
    if owner_ is null or owner_ <> uid or not public.eab_owns_workspace(p_ws, uid) then raise exception 'only your own properties' using errcode = '42501'; end if;
  end if;
  select * into cur from public.eab_share_confidential
   where team_id = tm and owner_id = uid and recipient_id = partner and revoked_at is null
     and (case when all_ then scope = 'properties' else workspace_id = p_ws and record_id = p_id end) for update;
  if coalesce(p_on, false) then
    if found then return true; end if;
    insert into public.eab_share_confidential (team_id, owner_id, recipient_id, workspace_id, record_id, scope)
      values (tm, uid, partner, case when all_ then null else p_ws end, case when all_ then null else p_id end, case when all_ then 'properties' end);
  else
    if not found then return false; end if;
    update public.eab_share_confidential set revoked_at = now(), revoked_by = uid where id = cur.id;
  end if;
  perform public.eab_log(tm, 'permission', case when all_ then null else p_ws end, 'properties', case when all_ then null else p_id end, uid,
    jsonb_build_object('event', case when coalesce(p_on, false) then 'confidential_on' else 'confidential_off' end, 'recipient', partner,
                       'via', case when all_ then 'share_all' else 'selected' end));
  return coalesce(p_on, false);
end $$;

-- The owner's switches that are on now, for the share screen: {"all": true|false, "records": [{workspace_id, record_id}]}.
create or replace function public.eab_share_confidential_list() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'all', exists (select 1 from public.eab_share_confidential c where c.team_id = public.eab_my_team() and c.owner_id = auth.uid()
                     and c.recipient_id = public.eab_my_partner() and c.revoked_at is null and c.scope = 'properties'),
    'records', coalesce((select jsonb_agg(jsonb_build_object('workspace_id', c.workspace_id, 'record_id', c.record_id) order by c.granted_at)
                           from public.eab_share_confidential c where c.team_id = public.eab_my_team() and c.owner_id = auth.uid()
                            and c.recipient_id = public.eab_my_partner() and c.revoked_at is null and c.scope is null), '[]'::jsonb))
$$;

revoke all on function public.eab_file_confidential(jsonb, text), public.eab_confidential_shared(uuid, uuid, text, text, jsonb, uuid),
  public.eab_share_confidential_set(uuid, text, boolean), public.eab_share_confidential_list() from public, anon;
grant execute on function public.eab_file_confidential(jsonb, text), public.eab_confidential_shared(uuid, uuid, text, text, jsonb, uuid),
  public.eab_share_confidential_set(uuid, text, boolean), public.eab_share_confidential_list() to authenticated;

commit;
