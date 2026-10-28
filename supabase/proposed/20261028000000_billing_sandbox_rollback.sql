-- Rollback for 20261028000000_billing_sandbox.sql. Removes the billing tables (and every entitlement and event in them) and
-- the three functions. Nothing else in the database refers to them. Safe to run twice.
begin;
drop function if exists public.eab_billing_apply(text, text, uuid, text, text, text, text, text, timestamptz, integer, boolean, text, integer, timestamptz);
drop function if exists public.eab_billing_start_trial(uuid, text, integer, text);
drop function if exists public.eab_my_billing();
drop table if exists public.eab_billing_events;
drop table if exists public.eab_billing_entitlements;
commit;
