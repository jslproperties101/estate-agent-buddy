-- Rollback for 20261110300000_admin_lookups_tokens.sql (Batch D). Removes the admin functions only; token changes already
-- made (ledger rows with refs adm:...) and the admin action log stay as they are. Safe to run twice.
begin;
drop function if exists public.eab_admin_lookup_spend(integer);
drop function if exists public.eab_my_day(timestamptz);
drop function if exists public.eab_admin_token_adjust(uuid, text, integer, text, text);
drop function if exists public.eab_admin_token_history(uuid, text);
drop function if exists public.eab_admin_tokens(text, integer);
drop function if exists public.eab_admin_lookup_settle(uuid, text, integer, text, text);
drop function if exists public.eab_admin_lookups(text, integer);
commit;
