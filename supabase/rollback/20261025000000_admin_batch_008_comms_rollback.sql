-- Rollback for 20261025000000_admin_batch_008_comms.sql (AdminBatch008 + MainForAdmin-F).
-- WARNING: this removes every broadcast, every recipient row, the agents' contact numbers sent by the app, the weekly
-- report settings and runs, and the admins' To-Do / Calendar items. Report PDF files already in the vault bucket under
-- reports/ stay in storage (remove them in the Supabase Storage screen if wanted). Run only with Joe's approval.
-- The weekly schedule (pg_cron job "eab-weekly-report", made by ops/weekly-report-schedule.sql) is removed too, if present.
begin;
do $$ declare found_job boolean := false; begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select exists (select 1 from cron.job where jobname = 'eab-weekly-report')$q$ into found_job;
    if found_job then execute $q$select cron.unschedule('eab-weekly-report')$q$; end if;
  end if;
end $$;
drop policy if exists "eab vault read reports" on storage.objects;

drop function if exists public.eab_set_my_phone(text);
drop function if exists public.eab_wa_number(text, text);
drop function if exists public.eab_admin_broadcast_save(jsonb, text);
drop function if exists public.eab_admin_broadcast_preview(uuid);
drop function if exists public.eab_admin_broadcast_queue(uuid, text, text);
drop function if exists public.eab_admin_broadcast_cancel(uuid, text, text);
drop function if exists public.eab_admin_broadcasts(integer);
drop function if exists public.eab_admin_broadcast(uuid, text);
drop function if exists public.eab_admin_broadcast_wa_opened(bigint, text);
drop function if exists public.eab_admin_broadcast_claim(uuid, integer, text);
drop function if exists public.eab_bc_result(bigint, boolean, text, text);
drop function if exists public.eab_bc_finish(uuid);
drop function if exists public.eab_bc_unclaim(uuid);
drop function if exists public.eab_bc_unsubscribe(text);
drop function if exists public.eab_bc_json(uuid);
drop function if exists public.eab_bc_candidate(public.eab_broadcasts, auth.users);
drop function if exists public.eab_bc_in_audience(public.eab_broadcasts, uuid);
drop function if exists public.eab_news_consent(uuid);
drop function if exists public.eab_admin_report_settings();
drop function if exists public.eab_admin_report_settings_save(jsonb, text, text);
drop function if exists public.eab_admin_reports(integer, text);
drop function if exists public.eab_admin_report_download(uuid, text);
drop function if exists public.eab_admin_report_claim(text, text);
drop function if exists public.eab_admin_check_report(text, text);
drop function if exists public.eab_report_claim_scheduled(timestamptz);
drop function if exists public.eab_report_data(uuid);
drop function if exists public.eab_report_stored(uuid, text, text, bigint);
drop function if exists public.eab_report_finished(uuid, text[], text);
drop function if exists public.eab_report_audit(uuid, text, text, jsonb);
drop function if exists public.eab_report_week(date);
drop function if exists public.eab_report_can_read(text);
drop function if exists public.eab_admin_workspaces(text, text);
drop function if exists public.eab_admin_workspace(uuid, text);
drop function if exists public.eab_admin_todo();
drop function if exists public.eab_admin_todo_may(uuid, boolean);
drop function if exists public.eab_admin_task_save(jsonb, text);
drop function if exists public.eab_admin_event_save(jsonb, text);

-- the "kept for good" triggers must go before the tables can be dropped
drop trigger if exists eab_broadcasts_keep on public.eab_broadcasts;
drop trigger if exists eab_broadcasts_notrunc on public.eab_broadcasts;
drop trigger if exists eab_broadcast_recipients_keep on public.eab_broadcast_recipients;
drop trigger if exists eab_broadcast_recipients_notrunc on public.eab_broadcast_recipients;
drop trigger if exists eab_report_runs_keep on public.eab_report_runs;
drop trigger if exists eab_report_runs_notrunc on public.eab_report_runs;
drop trigger if exists eab_admin_tasks_keep on public.eab_admin_tasks;
drop trigger if exists eab_admin_events_keep on public.eab_admin_events;
drop table if exists public.eab_broadcast_recipients;
drop table if exists public.eab_broadcasts;
drop sequence if exists public.eab_broadcast_no;
drop table if exists public.eab_report_runs;
drop table if exists public.eab_report_settings;
drop table if exists public.eab_admin_tasks;
drop table if exists public.eab_admin_events;
drop table if exists public.eab_agent_contacts;
drop function if exists public.eab_broadcast_keep();
commit;
