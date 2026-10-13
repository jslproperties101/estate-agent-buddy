-- Rollback for 20261015000000_block_direct_writes.sql. Restores the previous behaviour; records are not touched.
begin;
drop trigger if exists eab_records_block_direct on public.eab_records;
drop function if exists public.eab_block_direct_writes();
alter function public.eab_push_records(uuid, jsonb) reset eab.via_push;
commit;
