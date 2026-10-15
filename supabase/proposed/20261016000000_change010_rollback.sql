-- Rollback for supabase/proposed/20261016000000_change010_team_sharing_audit.sql. NOT run automatically. Read before use.
-- WARNING: this DELETES every Team Workspace, invitation, sharing permission, deletion request and the cloud audit
-- history (including the audit backup). Records in eab_records are NOT touched: each agent keeps their own records;
-- shared access simply stops. Take a backup first (Supabase → Database → Backups).
-- Phones running the Change 010 app keep working for their own records; Team Workspace screens will report errors.
begin;

drop policy if exists "eab shared read" on public.eab_records;
drop policy if exists "eab shared update" on public.eab_records;
drop policy if exists "eab file added by a shared editor" on public.eab_files;
drop trigger if exists eab_records_shared_rules on public.eab_records;
drop trigger if exists eab_users_disabled on auth.users;

-- eab_push_records back to the exact Phase 2 version.
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
do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'eab_records_block_direct') then
    alter function public.eab_push_records(uuid, jsonb) set eab.via_push = 'on';
  end if;
end $$;

-- Functions that nothing else depends on.
drop function if exists public.eab_shared_write_rules();
drop function if exists public.eab_account_disabled();
drop function if exists public.eab_audit_delete(text[]);
drop function if exists public.eab_decide_delete(uuid, boolean);
drop function if exists public.eab_request_delete(uuid, text, text);
drop function if exists public.eab_shared_index();
drop function if exists public.eab_share_all_set(text, text);
drop function if exists public.eab_share_set(uuid, jsonb);
drop function if exists public.eab_team_remove(uuid);
drop function if exists public.eab_team_leave();
drop function if exists public.eab_team_decline(text, uuid);
drop function if exists public.eab_team_accept(text, uuid);
drop function if exists public.eab_find_invite(text, uuid);
drop function if exists public.eab_team_cancel_invite(uuid);
drop function if exists public.eab_team_invite(text);
drop function if exists public.eab_team_status();
drop function if exists public.eab_end_team(uuid, text, uuid);
drop function if exists public.eab_log(uuid, text, uuid, text, text, uuid, jsonb);
-- Then the tables (with their triggers and policies), then the helpers those used.
drop table if exists public.eab_audit_backup;
drop table if exists public.eab_audit_events;
drop table if exists public.eab_delete_requests;
drop table if exists public.eab_share_all;
drop table if exists public.eab_shares;
drop table if exists public.eab_team_invites;
drop table if exists public.eab_team_members;
drop table if exists public.eab_teams;
drop function if exists public.eab_audit_stamp();
drop function if exists public.eab_audit_immutable();
drop function if exists public.eab_can_read(uuid, text, text);
drop function if exists public.eab_linked_to_workspace(uuid);
drop function if exists public.eab_shared_level(uuid, uuid, text, text, jsonb, uuid);
drop function if exists public.eab_scope_matches(text, text, jsonb);
drop function if exists public.eab_owns_workspace(uuid, uuid);
drop function if exists public.eab_my_partner();
drop function if exists public.eab_my_team();
drop function if exists public.eab_account_ok(uuid);
drop sequence if exists public.eab_audit_seq;

commit;
