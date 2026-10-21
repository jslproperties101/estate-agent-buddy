-- Rollback for 20261021210000_push_broadcast_counts.sql (JoyChange010-03).
-- WARNING: deletes every push broadcast record and every per-agent sent / delivered / opened row.
-- Posts themselves (eab_feed_items) and their push_alert switch are NOT touched. All or nothing.
begin;
drop trigger if exists eab_feed_items_push_queue on public.eab_feed_items;
drop function if exists public.eab_admin_push_list();
drop function if exists public.eab_admin_push_report(uuid);
drop function if exists public.eab_push_counts(uuid);
drop function if exists public.eab_push_ack(uuid, text);
drop function if exists public.eab_push_feed_finish(uuid, jsonb);
drop function if exists public.eab_push_feed_recipients(uuid);
drop function if exists public.eab_push_feed_claim(uuid, text);
drop function if exists public.eab_push_feed_queued();
drop function if exists public.eab_push_queue_trg();
drop table if exists public.eab_push_deliveries;
drop table if exists public.eab_push_broadcasts;
commit;
