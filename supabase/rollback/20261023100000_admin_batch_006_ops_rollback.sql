-- Rollback for 20261023100000_admin_batch_006_ops.sql. TEST PROJECT ONLY.
-- WARNING: removes the support-ticket notes and status history, and every feature flag. The post files folder
-- "eab-feed-media" is kept (posts may link to its files); remove it by hand only if no post uses it.
drop policy if exists "eab feed media upload" on storage.objects;
drop policy if exists "eab admin read bug screenshots" on storage.objects;
drop function if exists public.eab_admin_live_users(integer, text);
drop function if exists public.eab_admin_dash_top_agents(date, date, integer, text);
drop function if exists public.eab_admin_dash_master();
drop function if exists public.eab_my_flags();
drop function if exists public.eab_admin_flag_save(jsonb, text, text);
drop function if exists public.eab_admin_flags();
drop function if exists public.eab_admin_ticket_note(uuid, text, text);
drop function if exists public.eab_admin_ticket_set_status(uuid, text, text, text);
drop function if exists public.eab_admin_ticket(uuid, text);
drop function if exists public.eab_admin_tickets(text, text, integer, text);
drop function if exists public.eab_admin_code_grants(text, text);
drop function if exists public.eab_admin_group_preview(jsonb);
drop function if exists public.eab_admin_feed_order_get(uuid);
drop function if exists public.eab_ticket_can_read(text);
drop function if exists public.eab_feed_media_can_upload(text);
drop table if exists public.eab_feature_flags;
drop table if exists public.eab_ticket_notes;
drop function if exists public.eab_ticket_notes_fixed();
