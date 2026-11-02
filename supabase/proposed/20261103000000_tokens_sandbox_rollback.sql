-- Rollback for 20261103000000_tokens_sandbox.sql (Batch B, Ai Buddy Tokens). Removes the token tables (every balance and
-- every ledger row in them) and the two functions. Nothing else refers to them. Safe to run twice.
-- WARNING: once real (live) tokens exist, this deletes what agents paid for. Test project only.
begin;
drop function if exists public.eab_tokens_credit(uuid, text, integer, integer, text, text, text);
drop function if exists public.eab_my_tokens();
drop table if exists public.eab_token_ledger;
drop table if exists public.eab_token_balances;
commit;
