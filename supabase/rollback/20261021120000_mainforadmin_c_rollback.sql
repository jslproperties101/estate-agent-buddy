-- Undoes 20261021120000_mainforadmin_c_logging.sql. Rows of the new kinds (command, marketing, language, push) and the
-- new platforms stay in the table; the old rules are put back as NOT VALID, so they apply to new rows only.
begin;
alter table public.eab_usage_events drop constraint if exists eab_usage_events_kind_check;
alter table public.eab_usage_events drop constraint if exists eab_usage_events_platform_check;
alter table public.eab_usage_events add constraint eab_usage_events_kind_check
  check (kind in ('google', 'session', 'screen', 'feature', 'ai', 'sync', 'error', 'metric')) not valid;
alter table public.eab_usage_events add constraint eab_usage_events_platform_check
  check (platform is null or platform in ('android', 'ios', 'web')) not valid;
create or replace function public.eab_usage_cleanup() returns integer
language plpgsql security definer set search_path = public as $$
declare k integer;
begin
  perform public.eab_usage_rollup();
  with old as (select id from public.eab_usage_events where at < now() - interval '365 days' order by at limit 50000)
  delete from public.eab_usage_events e using old where e.id = old.id;
  get diagnostics k = row_count;
  return k;
end $$;
commit;
