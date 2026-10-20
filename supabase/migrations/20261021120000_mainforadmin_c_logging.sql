-- MainForAdmin-C: more of what the app notes (Stage C logging). Applies on top of the usage log (change019/020) and stage B.
--   * four new kinds of event: command (AI Assisted Command), marketing (Marketing Studio), language, push
--   * platform may now also be tablet or desktop (the same words the login log uses)
--   * usage detail is KEPT (Joe, 21 Oct 2026: 7 years). Before this, eab_usage_cleanup deleted detail older than 365 days.
--     It now only refreshes the daily totals and deletes nothing. After 7 years Admin EAB lists what is due; Joe approves.
-- Safe to run twice. Rollback: supabase/rollback/20261021120000_mainforadmin_c_rollback.sql
begin;

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.eab_usage_events'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) like '%kind = ANY%' or pg_get_constraintdef(oid) like '%platform = ANY%'
           or pg_get_constraintdef(oid) like '%(kind)::text = ANY%' or pg_get_constraintdef(oid) like '%(platform)::text = ANY%')
  loop
    execute format('alter table public.eab_usage_events drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.eab_usage_events add constraint eab_usage_events_kind_check
  check (kind in ('google', 'session', 'screen', 'feature', 'ai', 'sync', 'error', 'metric', 'command', 'marketing', 'language', 'push'));
alter table public.eab_usage_events add constraint eab_usage_events_platform_check
  check (platform is null or platform in ('android', 'ios', 'web', 'tablet', 'desktop'));

create or replace function public.eab_usage_cleanup() returns integer
language plpgsql security definer set search_path = public as $$
begin
  perform public.eab_usage_rollup();
  return 0;   -- nothing is deleted any more (kept 7 years; deletion only after Owner approval, outside this function)
end $$;

commit;
