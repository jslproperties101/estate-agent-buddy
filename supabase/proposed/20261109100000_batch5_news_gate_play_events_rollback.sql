-- Rollback of 20261109100000_batch5_news_gate_play_events.sql. Puts eab_feed_visible back exactly as MainForAdmin-D left
-- it and removes the Batch 5 tables and functions. Refund rows already in eab_token_ledger stay (the ledger is history).
-- Safe to run more than once.
begin;
create or replace function public.eab_feed_visible(p_user uuid, i public.eab_feed_items) returns boolean
language sql stable security definer set search_path = public as $$
  select i.status = 'published' and (i.published_at is null or i.published_at <= now()) and (i.expires_at is null or i.expires_at > now())
     and (i.audience = 'all'
          or (i.audience = 'groups' and exists (select 1 from public.eab_feed_targets t join public.eab_my_groups(p_user) g on g.group_id = t.group_id where t.item_id = i.id))
          or exists (select 1 from public.eab_feed_code_grants c where c.user_id = p_user and c.item_id = i.id))
$$;
revoke all on function public.eab_feed_visible(uuid, public.eab_feed_items) from public, anon, authenticated;
drop function if exists public.eab_tokens_refund(text);
drop table if exists public.eab_token_refunds;
drop function if exists public.eab_play_purchase_owner(text);
drop function if exists public.eab_play_purchase_link(text, uuid, text, text);
drop table if exists public.eab_play_purchases;
drop function if exists public.eab_admin_billing_settings_set(jsonb, text, text);
drop function if exists public.eab_billing_public();
drop function if exists public.eab_billing_has(uuid, text);
drop table if exists public.eab_billing_settings;
commit;
