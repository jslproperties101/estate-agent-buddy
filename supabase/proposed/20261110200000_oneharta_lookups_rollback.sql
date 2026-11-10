-- Rollback for 20261110200000_oneharta_lookups.sql (Batch C). Removes the lookup records and functions. Token ledger rows
-- made by lookups ('spend' / 'refund' with refs lk:, lkr:, lkx:) stay, so every balance still matches its ledger.
-- Safe to run twice. Test project only.
begin;
drop function if exists public.eab_my_lookups();
drop function if exists public.eab_lookup_owned(uuid, uuid);
drop function if exists public.eab_lookup_refund(uuid);
drop function if exists public.eab_lookup_finish(uuid, integer, text, text);
drop function if exists public.eab_lookup_begin(uuid, text, text, integer, text, integer, integer);
drop function if exists public.eab_lookup_credits_today(uuid);
drop table if exists public.eab_lookups;
commit;
