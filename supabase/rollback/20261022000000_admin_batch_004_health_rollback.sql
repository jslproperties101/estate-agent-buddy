-- Rollback for 20261022000000_admin_batch_004_health.sql. TEST PROJECT ONLY.
-- WARNING: removes the recorded backup checks / restore tests and the daily storage readings. Never run on production
-- once real backup tests have been recorded (they are audit evidence).
drop function if exists public.eab_admin_error_reports(text, integer, text);
drop function if exists public.eab_admin_performance(integer);
drop function if exists public.eab_admin_push_health();
drop function if exists public.eab_admin_sync_health(integer, text);
drop function if exists public.eab_admin_backup_test_add(jsonb, text);
drop function if exists public.eab_admin_backup_tests(integer);
drop function if exists public.eab_admin_set_health_limits(jsonb, text, text);
drop function if exists public.eab_admin_health_storage();
drop function if exists public.eab_admin_health_db();
drop function if exists public.eab_backup_tests_summary();
drop function if exists public.eab_health_limits_json();
drop function if exists public.eab_health_snapshot();
drop table if exists public.eab_backup_tests;
drop function if exists public.eab_backup_test_fixed();
drop sequence if exists public.eab_backup_test_seq;
drop table if exists public.eab_health_daily;
drop table if exists public.eab_health_limits;
