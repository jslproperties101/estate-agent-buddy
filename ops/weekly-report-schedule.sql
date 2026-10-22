-- AdminBatch008: switch on the hourly check for the weekly report (Scheduled Reports, feature 70). TEST project first.
-- Run this ONCE in the Supabase SQL editor AFTER:
--   1. the database file 20261025000000_admin_batch_008_comms.sql is applied,
--   2. the Edge Function is deployed:  supabase functions deploy weekly-report --no-verify-jwt
--   3. the secret REPORT_CRON_SECRET is set (Edge Functions → Secrets) to a long random text.
-- Before running, replace the two placeholders below:
--   PROJECT_URL  e.g. https://talksazsqsgjriamwxdp.supabase.co   (Settings → API → Project URL)
--   CRON_SECRET  the SAME text as REPORT_CRON_SECRET
-- Every hour at :05 the database calls the function; it makes the report only on the day and hour chosen in Admin EAB
-- (Scheduled Reports), once a week. Switching the report off in Admin EAB is enough to stop it; to remove the hourly
-- check completely:  select cron.unschedule('eab-weekly-report');
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- the secret is kept in Supabase Vault (encrypted), not in the job text
select vault.create_secret('CRON_SECRET', 'eab_report_cron_secret', 'AdminBatch008 weekly report: x-cron-secret')
 where not exists (select 1 from vault.secrets where name = 'eab_report_cron_secret');

select cron.schedule('eab-weekly-report', '5 * * * *', $job$
  select net.http_post(
    url := 'PROJECT_URL/functions/v1/weekly-report',
    headers := jsonb_build_object('content-type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'eab_report_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000)
$job$);

-- Check: select jobname, schedule, active from cron.job;   and later: select * from cron.job_run_details order by start_time desc limit 5;
