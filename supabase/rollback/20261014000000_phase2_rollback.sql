-- Rollback for 20261014000000_phase2_sync_refs_files.sql. NOT run automatically. Read before use.
-- WARNING: this DELETES the cloud revision history, the reference registry and the file metadata. Your property,
-- contact and other records in eab_records are NOT touched, and the files already uploaded to the "eab-files"
-- bucket are NOT removed (delete them in Supabase → Storage if you want them gone). Take a backup first.
-- Devices running the Phase 2 app will fail to sync after this until the migration is applied again.

drop trigger if exists eab_records_property_ref on public.eab_records;
drop trigger if exists eab_records_keep_revision on public.eab_records;
drop trigger if exists eab_records_version on public.eab_records;
drop function if exists public.eab_push_records(uuid, jsonb);
drop function if exists public.eab_ref_holder(uuid, integer);
drop function if exists public.eab_sync_property_ref();
drop function if exists public.eab_keep_revision();
drop function if exists public.eab_record_version();
drop function if exists public.eab_ref_number(jsonb);
drop table if exists public.eab_files;
drop table if exists public.eab_record_revisions;
drop table if exists public.eab_ref_duplicates;
drop table if exists public.eab_property_refs;
drop sequence if exists public.eab_change_seq;
-- The version columns are harmless to keep. To remove them too (loses rev/seq/op_id only):
-- alter table public.eab_records drop column if exists rev, drop column if exists seq, drop column if exists op_id,
--   drop column if exists written_by, drop column if exists written_at;
do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists "eab file object add" on storage.objects;
    drop policy if exists "eab file object read" on storage.objects;
  end if;
end $$;
