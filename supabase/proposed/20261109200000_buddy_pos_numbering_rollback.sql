-- Rollback of 20261109200000_buddy_pos_numbering.sql. Removes the numbering tables and functions; phones then number on
-- their own again (as before Batch 7). The record of numbers already given is lost with eab_acct_blocks: export it first.
begin;
drop function if exists public.eab_acct_take(uuid, text, integer, text, bigint);
drop function if exists public.eab_acct_numbering_set(uuid, text);
drop function if exists public.eab_acct_numbering_get(uuid, text);
drop function if exists public.eab_acct_can_post(uuid);
drop function if exists public.eab_acct_letter_of(integer);
drop table if exists public.eab_acct_blocks;
drop table if exists public.eab_acct_counters;
drop table if exists public.eab_acct_letters;
drop table if exists public.eab_acct_numbering;
commit;
