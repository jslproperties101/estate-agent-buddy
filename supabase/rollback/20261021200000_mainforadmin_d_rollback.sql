-- Undoes 20261021200000_mainforadmin_d_feed.sql. DELETES all feed items, groups, codes and read marks, and the new
-- settings columns. Admin actions already written to the tamper-proof log stay there.
begin;
drop function if exists public.eab_public_settings(), public.eab_my_feed(text, text), public.eab_feed_mark(uuid, text),
  public.eab_redeem_code(text), public.eab_admin_feed_save(jsonb, text, text), public.eab_admin_feed_set_status(uuid, text, text, text),
  public.eab_admin_feed_list(text), public.eab_admin_group_save(jsonb, text, text), public.eab_admin_group_list(),
  public.eab_admin_feed_order_set(uuid, uuid[], text, text),
  public.eab_admin_code_create(text, uuid[], timestamptz, integer, text, text), public.eab_admin_code_disable(text, text, text),
  public.eab_admin_code_revoke(uuid, uuid, text, text), public.eab_admin_code_list(),
  public.eab_feed_visible(uuid, public.eab_feed_items), public.eab_my_groups(uuid), public.eab_filters_match(jsonb, jsonb, uuid), public.eab_agent_facts(uuid);
drop table if exists public.eab_feed_reads, public.eab_feed_code_attempts, public.eab_feed_code_grants, public.eab_feed_codes,
  public.eab_feed_order, public.eab_feed_targets, public.eab_feed_items, public.eab_audience_groups;
alter table public.eab_settings drop column if exists min_version, drop column if exists min_version_mode, drop column if exists update_url,
  drop column if exists maintenance_on, drop column if exists maintenance_message_en, drop column if exists maintenance_message_bm,
  drop column if exists maintenance_message_zh, drop column if exists maintenance_back_at;
-- stage B version of the settings function
create or replace function public.eab_admin_set_settings(p_patch jsonb, p_reason text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare before jsonb; after jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  select to_jsonb(s) into before from public.eab_settings s where id;
  update public.eab_settings set
    company_name     = case when p_patch ? 'company_name' and nullif(btrim(p_patch->>'company_name'), '') is not null then btrim(p_patch->>'company_name') else company_name end,
    support_email    = case when p_patch ? 'support_email' then nullif(btrim(p_patch->>'support_email'), '') else support_email end,
    business_address = case when p_patch ? 'business_address' then nullif(btrim(p_patch->>'business_address'), '') else business_address end,
    updated_at = now(), updated_by = auth.uid()
   where id;
  select to_jsonb(s) into after from public.eab_settings s where id;
  perform public.eab_admin_write_action('settings_changed', null, 'eab_settings', p_reason, before, after, p_device);
  return after;
end $$;
commit;
