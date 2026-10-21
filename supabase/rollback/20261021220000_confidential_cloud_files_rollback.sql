-- Rollback for 20261021220000_confidential_cloud_files.sql (JoyChange010-05).
-- Puts back the earlier cloud file rule (every file of a visible property is visible) and removes the per-share
-- "Include confidential documents" switches. WARNING: after this, a partner who can see a property can again download
-- every file of it that is in the cloud, including confidential ones the new app uploaded. All or nothing.
begin;
drop policy if exists "eab file visible with its record" on public.eab_files;
create policy "eab file visible with its record" on public.eab_files for select to authenticated using (
  exists (select 1 from public.eab_records r where r.workspace_id = eab_files.workspace_id and r.collection = eab_files.collection and r.id = eab_files.record_id)
);
drop function if exists public.eab_share_confidential_list();
drop function if exists public.eab_share_confidential_set(uuid, text, boolean);
drop function if exists public.eab_confidential_shared(uuid, uuid, text, text, jsonb, uuid);
drop function if exists public.eab_file_confidential(jsonb, text);
drop table if exists public.eab_share_confidential;
commit;
