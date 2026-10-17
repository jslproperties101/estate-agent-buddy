-- Undo Changes 19 and 20 (database part): removes the usage log, the developer list and the dashboard functions.
-- All logged usage events are deleted with the table. Nothing else is touched (records, files, teams stay as they are).
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'eab-usage-cleanup';
  end if;
end $$;

begin;
drop function if exists public.eab_dev_daily(timestamptz, timestamptz, uuid, text);
drop function if exists public.eab_dev_events(timestamptz, timestamptz, uuid, text, text, text, text, integer);
drop function if exists public.eab_dev_breakdown(timestamptz, timestamptz, uuid, text, text, text);
drop function if exists public.eab_dev_users(timestamptz, timestamptz, text, text);
drop function if exists public.eab_dev_overview(timestamptz, timestamptz);
drop function if exists public.eab_log_usage(jsonb);
drop function if exists public.eab_usage_cleanup();
drop function if exists public.eab_dev_guard();
drop function if exists public.eab_is_developer();
drop table if exists public.eab_usage_events;
drop table if exists public.eab_developers;
commit;
