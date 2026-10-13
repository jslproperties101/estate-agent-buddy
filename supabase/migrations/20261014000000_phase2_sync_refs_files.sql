-- Estate Agent AI Buddy, Phase 2: safe synchronisation, unique property references, private file storage.
-- NOT APPLIED to any live project. Review it, take a backup (Supabase → Database → Backups), then run it in
-- Supabase → SQL Editor (or `supabase db push`). Run after 20261013120000_bug_reports.sql. It only ADDS things
-- (columns, tables, triggers, functions, policies, one storage bucket); no existing row, policy or column is changed
-- or dropped. To undo it see supabase/rollback/20261014000000_phase2_rollback.sql.
--
-- 1. Versions.   eab_records gets rev (+1 on every write), seq (order of changes, assigned by the database, so devices'
--                clocks are never compared), op_id (identifies a write, so a retry is never applied twice).
-- 2. Safe push.  eab_push_records(ws, rows) writes records only if the device saw the current rev (compare-and-set);
--                otherwise it answers "conflict" with the current cloud copy and writes nothing. Row-level security
--                still decides who may write what (it runs as the signed-in user, not as an administrator).
-- 3. History.    Before a record is overwritten, its previous version goes to eab_record_revisions (last 25 kept per
--                record; readable by anyone who can read the record).
-- 4. References. eab_property_refs makes the reference NUMBER unique across all prefixes inside a workspace (P1001
--                makes A1001 impossible). Existing duplicates are never renamed or deleted: they are listed in
--                eab_ref_duplicates for the owner to review, and edits to those records that leave the reference alone
--                still work.
-- 5. Files.      eab_files (metadata, one row per file, tied to its record and workspace) and the private storage
--                bucket "eab-files" (objects at <workspace id>/<sha-256>). Access follows the record: whoever cannot
--                read the record cannot read its file.
--
-- Before running, you can check for duplicate references yourself:
--   select workspace_id, coalesce(data->>'refNo', substring(upper(data->>'ref') from '[0-9]+')) as ref_no, count(*)
--   from public.eab_records where collection = 'properties' and not deleted and coalesce(data->>'sample','false') <> 'true'
--   group by 1, 2 having count(*) > 1;

create extension if not exists pgcrypto;

-- ---------- 1. versions ----------
alter table public.eab_records add column if not exists rev        bigint not null default 1;
alter table public.eab_records add column if not exists seq        bigint;
alter table public.eab_records add column if not exists op_id      text;
alter table public.eab_records add column if not exists written_by uuid;
alter table public.eab_records add column if not exists written_at timestamptz not null default now();

create sequence if not exists public.eab_change_seq;

-- Existing rows get a seq in the order they were last changed (oldest first).
do $$
declare base bigint;
begin
  select coalesce(max(seq), 0) into base from public.eab_records;
  update public.eab_records r set seq = base + o.n
    from (select workspace_id, collection, id, row_number() over (order by updated, workspace_id, collection, id) as n
          from public.eab_records where seq is null) o
    where r.workspace_id = o.workspace_id and r.collection = o.collection and r.id = o.id and r.seq is null;
  perform setval('public.eab_change_seq', greatest((select coalesce(max(seq), 0) from public.eab_records), 0) + 1, false);
end $$;
create index if not exists eab_records_ws_seq on public.eab_records (workspace_id, seq);

create or replace function public.eab_record_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.rev := 1; else new.rev := old.rev + 1; end if;
  new.seq := nextval('public.eab_change_seq');
  new.written_by := auth.uid();
  new.written_at := now();
  return new;
end $$;
drop trigger if exists eab_records_version on public.eab_records;
create trigger eab_records_version before insert or update on public.eab_records for each row execute function public.eab_record_version();

-- ---------- 3. history of overwritten versions ----------
create table if not exists public.eab_record_revisions (
  workspace_id uuid   not null references public.eab_workspaces (id) on delete cascade,
  collection   text   not null,
  record_id    text   not null,
  rev          bigint not null,
  data         jsonb,
  deleted      boolean not null,
  saved_by     uuid,
  saved_at     timestamptz not null default now(),
  source       text   not null default 'cloud-overwrite',
  primary key (workspace_id, collection, record_id, rev)
);
alter table public.eab_record_revisions enable row level security;
drop policy if exists "eab revisions follow the record" on public.eab_record_revisions;
create policy "eab revisions follow the record" on public.eab_record_revisions for select to authenticated using (
  exists (select 1 from public.eab_records r where r.workspace_id = eab_record_revisions.workspace_id
          and r.collection = eab_record_revisions.collection and r.id = eab_record_revisions.record_id)
);
revoke all on public.eab_record_revisions from anon, authenticated;
grant select on public.eab_record_revisions to authenticated;

create or replace function public.eab_keep_revision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.data is distinct from new.data or old.deleted <> new.deleted then
    insert into public.eab_record_revisions (workspace_id, collection, record_id, rev, data, deleted, saved_by, saved_at)
      values (old.workspace_id, old.collection, old.id, old.rev, old.data, old.deleted, old.written_by, old.written_at)
      on conflict do nothing;
    delete from public.eab_record_revisions v
      where v.workspace_id = old.workspace_id and v.collection = old.collection and v.record_id = old.id
        and v.rev <= coalesce((select x.rev from public.eab_record_revisions x
                               where x.workspace_id = old.workspace_id and x.collection = old.collection and x.record_id = old.id
                               order by x.rev desc offset 25 limit 1), -1);
  end if;
  return new;
end $$;
drop trigger if exists eab_records_keep_revision on public.eab_records;
create trigger eab_records_keep_revision after update on public.eab_records for each row execute function public.eab_keep_revision();

-- ---------- 4. unique property references ----------
-- The number part of a reference (P1001 → 1001): refNo if present, else the digits of "ref".
create or replace function public.eab_ref_number(d jsonb) returns integer
language sql immutable as $$
  select coalesce(
    case when (d ->> 'refNo') ~ '^[0-9]{1,9}$' then (d ->> 'refNo')::integer end,
    (regexp_match(upper(btrim(coalesce(d ->> 'ref', ''))), '^[A-Z]{1,6}-?([0-9]{1,9})$'))[1]::integer)
$$;

create table if not exists public.eab_property_refs (
  workspace_id uuid not null references public.eab_workspaces (id) on delete cascade,
  property_id  text not null,
  ref_no       integer not null,
  ref          text not null,
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, property_id),
  constraint eab_property_refs_ws_no_key  unique (workspace_id, ref_no),
  constraint eab_property_refs_ws_ref_key unique (workspace_id, ref)
);
create table if not exists public.eab_ref_duplicates (
  workspace_id uuid not null references public.eab_workspaces (id) on delete cascade,
  ref_no       integer not null,
  property_ids text[] not null,
  found_at     timestamptz not null default now(),
  primary key (workspace_id, ref_no)
);
alter table public.eab_property_refs enable row level security;   -- no policies: reached only through the functions below
alter table public.eab_ref_duplicates enable row level security;
drop policy if exists "eab owner reads duplicates" on public.eab_ref_duplicates;
create policy "eab owner reads duplicates" on public.eab_ref_duplicates for select to authenticated using (public.eab_role_in(workspace_id) in ('owner', 'admin'));
revoke all on public.eab_property_refs, public.eab_ref_duplicates from anon, authenticated;
grant select on public.eab_ref_duplicates to authenticated;

-- Existing data first: register the oldest property for each number; list the others, never rename or delete them.
insert into public.eab_property_refs (workspace_id, property_id, ref_no, ref)
  select distinct on (workspace_id, public.eab_ref_number(data)) workspace_id, id, public.eab_ref_number(data),
         coalesce(nullif(upper(btrim(coalesce(data ->> 'ref', ''))), ''), upper(coalesce(data ->> 'refPrefix', '')) || public.eab_ref_number(data)::text)
  from public.eab_records
  where collection = 'properties' and not deleted and data is not null and public.eab_ref_number(data) is not null
    and coalesce(data ->> 'sample', 'false') <> 'true'
  order by workspace_id, public.eab_ref_number(data), updated, id
  on conflict do nothing;
insert into public.eab_ref_duplicates (workspace_id, ref_no, property_ids)
  select workspace_id, public.eab_ref_number(data), array_agg(id order by updated, id)
  from public.eab_records
  where collection = 'properties' and not deleted and data is not null and public.eab_ref_number(data) is not null
    and coalesce(data ->> 'sample', 'false') <> 'true'
  group by workspace_id, public.eab_ref_number(data) having count(*) > 1
  on conflict do nothing;

create or replace function public.eab_sync_property_ref() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_no integer; v_ref text; v_old_no integer;
begin
  if new.collection <> 'properties' then return new; end if;
  if new.deleted or new.data is null or coalesce(new.data ->> 'sample', 'false') = 'true' then
    delete from public.eab_property_refs where workspace_id = new.workspace_id and property_id = new.id;   -- number is free again
    return new;
  end if;
  v_no := public.eab_ref_number(new.data);
  v_ref := upper(btrim(coalesce(new.data ->> 'ref', '')));
  if v_no is null then
    delete from public.eab_property_refs where workspace_id = new.workspace_id and property_id = new.id;
    return new;
  end if;
  if v_ref = '' then v_ref := upper(coalesce(new.data ->> 'refPrefix', '')) || v_no::text; end if;
  if tg_op = 'UPDATE' and old.data is not null then v_old_no := public.eab_ref_number(old.data); end if;
  begin
    insert into public.eab_property_refs (workspace_id, property_id, ref_no, ref) values (new.workspace_id, new.id, v_no, v_ref)
      on conflict (workspace_id, property_id) do update set ref_no = excluded.ref_no, ref = excluded.ref, updated_at = now();
  exception when unique_violation then
    -- A legacy duplicate whose reference is NOT being changed is tolerated (it is listed in eab_ref_duplicates).
    if tg_op = 'UPDATE' and v_old_no is not distinct from v_no and not old.deleted then null; else raise; end if;
  end;
  return new;
end $$;
drop trigger if exists eab_records_property_ref on public.eab_records;
create trigger eab_records_property_ref after insert or update on public.eab_records for each row execute function public.eab_sync_property_ref();

-- Who holds a number (used only to explain a refused write to a member of that workspace).
create or replace function public.eab_ref_holder(ws uuid, p_no integer) returns table (property_id text, ref text)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.eab_role_in(ws) is null then raise exception 'not allowed' using errcode = '42501'; end if;
  return query select r.property_id, r.ref from public.eab_property_refs r where r.workspace_id = ws and r.ref_no = p_no;
end $$;

-- ---------- 2. safe push ----------
-- rows: [{collection, id, base_rev, data, deleted, updated, op_id}]. Answers one result per row, in order:
--   ok            written; rev = the new version (also answered when op_id shows this exact write was already applied)
--   conflict      the cloud copy changed since base_rev; nothing written; the current copy (rev, data, deleted) is returned
--   ref_conflict  the property reference number is already used by another property; nothing written
--   denied        row-level security does not allow this user to write this record
create or replace function public.eab_push_records(ws uuid, rows jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  r jsonb; cur public.eab_records; out jsonb := '[]'::jsonb;
  v_coll text; v_id text; v_base bigint; v_op text; v_del boolean; v_data jsonb; v_upd bigint; v_rev bigint;
  v_no integer; v_cname text; h record; v_title text; v_seen boolean;
begin
  if public.eab_role_in(ws) is null then raise exception 'not allowed' using errcode = '42501'; end if;
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

revoke all on function public.eab_push_records(uuid, jsonb), public.eab_ref_holder(uuid, integer) from public, anon;
grant execute on function public.eab_push_records(uuid, jsonb), public.eab_ref_holder(uuid, integer) to authenticated;

-- ---------- 5. files ----------
create table if not exists public.eab_files (
  workspace_id uuid   not null references public.eab_workspaces (id) on delete cascade,
  file_id      text   not null check (char_length(file_id) between 1 and 80),
  collection   text   not null,
  record_id    text   not null,
  kind         text   not null check (kind in ('photo', 'document', 'banner', 'other')),
  sha256       text   not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes        bigint not null check (bytes between 0 and 26214400),
  mime         text   check (mime is null or char_length(mime) <= 100),
  name         text   check (name is null or char_length(name) <= 200),
  storage_path text   generated always as (workspace_id::text || '/' || sha256) stored,
  status       text   not null default 'pending' check (status in ('pending', 'uploaded')),
  deleted      boolean not null default false,
  uploaded_by  uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  uploaded_at  timestamptz,
  primary key (workspace_id, file_id)
);
create index if not exists eab_files_record on public.eab_files (workspace_id, collection, record_id);
alter table public.eab_files enable row level security;
drop policy if exists "eab file visible with its record" on public.eab_files;
drop policy if exists "eab file added by an editor" on public.eab_files;
drop policy if exists "eab file marked by its uploader" on public.eab_files;
create policy "eab file visible with its record" on public.eab_files for select to authenticated using (
  exists (select 1 from public.eab_records r where r.workspace_id = eab_files.workspace_id and r.collection = eab_files.collection and r.id = eab_files.record_id)
);
create policy "eab file added by an editor" on public.eab_files for insert to authenticated with check (
  uploaded_by = auth.uid() and public.eab_role_in(workspace_id) in ('owner', 'admin', 'team_leader', 'agent')
  and exists (select 1 from public.eab_records r where r.workspace_id = eab_files.workspace_id and r.collection = eab_files.collection and r.id = eab_files.record_id
              and (public.eab_role_in(r.workspace_id) in ('owner', 'admin') or r.user_id = auth.uid() or r.assigned_to = auth.uid()))
);
create policy "eab file marked by its uploader" on public.eab_files for update to authenticated
  using (uploaded_by = auth.uid() or public.eab_role_in(workspace_id) in ('owner', 'admin'))
  with check (uploaded_by = auth.uid() or public.eab_role_in(workspace_id) in ('owner', 'admin'));
revoke all on public.eab_files from anon, authenticated;
grant select, insert on public.eab_files to authenticated;
grant update (status, deleted, uploaded_at) on public.eab_files to authenticated;
-- No delete policy: a removed file is only marked deleted; the object stays until you clean it up (see docs/PHASE2.md).

-- Private bucket and object policies (only where Supabase Storage exists).
do $$
begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
      values ('eab-files', 'eab-files', false, 26214400)
      on conflict (id) do update set public = false, file_size_limit = 26214400;
    drop policy if exists "eab file object add" on storage.objects;
    drop policy if exists "eab file object read" on storage.objects;
    create policy "eab file object add" on storage.objects for insert to authenticated with check (
      bucket_id = 'eab-files' and exists (select 1 from public.eab_files f
        where f.workspace_id::text = split_part(objects.name, '/', 1) and f.sha256 = split_part(objects.name, '/', 2) and f.uploaded_by = auth.uid() and not f.deleted)
    );
    create policy "eab file object read" on storage.objects for select to authenticated using (
      bucket_id = 'eab-files' and exists (select 1 from public.eab_files f
        where f.workspace_id::text = split_part(objects.name, '/', 1) and f.sha256 = split_part(objects.name, '/', 2))
    );
  end if;
end $$;
