-- Rollback for 20261021120000_admin_batch_002_reads.sql (only removes the two read functions; no data is touched).
drop function if exists public.eab_admin_agents(text, text, integer, integer, text);
drop function if exists public.eab_admin_settings();
