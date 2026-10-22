-- Rollback for 20261023000000_admin_batch_005_dashboards.sql. TEST PROJECT ONLY.
-- Functions only: no table or data is removed. Safe to re-apply the migration afterwards.
drop function if exists public.eab_admin_dash_events(text, text, date, date, integer, text);
drop function if exists public.eab_admin_dash_usage(date, date);
drop function if exists public.eab_admin_dash_listings(date, date, integer, text);
drop function if exists public.eab_admin_dash_devices(date, date, text, text);
drop function if exists public.eab_admin_dash_inactive(integer, text);
drop function if exists public.eab_admin_dash_retention(date, date, text);
drop function if exists public.eab_admin_dash_active(date, date);
drop function if exists public.eab_admin_dash_growth(date, date, text);
drop function if exists public.eab_dash_status_key(jsonb);
drop function if exists public.eab_dash_detail_from();
drop function if exists public.eab_dash_activity(date, date);
drop function if exists public.eab_dash_names();
drop function if exists public.eab_dash_check_range(date, date);
drop function if exists public.eab_dash_ts(date);
drop function if exists public.eab_dash_today();
