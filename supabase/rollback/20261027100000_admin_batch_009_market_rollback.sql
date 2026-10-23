-- Rollback for 20261027000000_admin_batch_009_market.sql. TEST PROJECT ONLY.
-- Functions only: no table or data is removed. Safe to re-apply the migration afterwards.
drop function if exists public.eab_admin_market_news(date, date);
drop function if exists public.eab_admin_market_projects(date, date);
drop function if exists public.eab_admin_market_commission(date, date, text);
drop function if exists public.eab_admin_market_stuck(integer, text);
drop function if exists public.eab_admin_market_areas(date, date);
drop function if exists public.eab_admin_market_price(date, date, text);
drop function if exists public.eab_admin_market_dom(date, date);
drop function if exists public.eab_admin_market_quality(integer, integer, text);
drop function if exists public.eab_mkt_reach(uuid[]);
drop function if exists public.eab_mkt_median(numeric[]);
drop function if exists public.eab_mkt_days(timestamptz, timestamptz);
drop function if exists public.eab_mkt_inq_day(jsonb);
drop function if exists public.eab_mkt_commission(jsonb);
drop function if exists public.eab_mkt_open(jsonb);
drop function if exists public.eab_mkt_city(jsonb);
drop function if exists public.eab_mkt_state(jsonb);
drop function if exists public.eab_mkt_score(jsonb);
drop function if exists public.eab_mkt_ms(jsonb);
drop function if exists public.eab_mkt_num(jsonb);
