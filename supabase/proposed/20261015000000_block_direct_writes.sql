-- PROPOSAL ONLY. Not in supabase/migrations, so it is never applied by accident. Not applied anywhere.
-- Purpose: after EVERY phone runs the Phase 2 app, stop older apps from writing straight into eab_records
-- (an old app's plain upsert can silently replace a newer record; see docs/PHASE2.md section 3a and 7).
--
-- How: a trigger refuses inserts/updates/deletes on eab_records made by the roles "authenticated" and "anon" (the roles
-- the apps use) unless they come through public.eab_push_records, which marks its own call with a setting that
-- only exists while that function runs (ALTER FUNCTION ... SET). Nothing in the function body is rewritten.
-- Reading is untouched. Database-owner and service-role tooling (other roles) is untouched, so SQL-editor repairs still work.
-- Rollback: 20261015000000_block_direct_writes_rollback.sql
begin;

create or replace function public.eab_block_direct_writes() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and coalesce(current_setting('eab.via_push', true), '') <> 'on' then
    raise exception 'This app version can no longer write records directly. Update Estate Agent AI Buddy.' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

alter function public.eab_push_records(uuid, jsonb) set eab.via_push = 'on';

drop trigger if exists eab_records_block_direct on public.eab_records;
create trigger eab_records_block_direct before insert or update or delete on public.eab_records
  for each row execute function public.eab_block_direct_writes();

commit;
