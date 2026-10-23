-- Rollback for 20261027000000_admin_batch_009_agents.sql. TEST PROJECT ONLY.
-- WARNING: removes the record of removed phones (eab_device_removals) and the 009 functions. Broadcasts made for
-- "chosen agents" are kept (the user_ids column stays); after this rollback only "everyone" and "groups" can be saved.
-- The broadcast functions are put back exactly as in 20261025000000_admin_batch_008_comms.sql.
drop function if exists public.eab_my_device(text);
drop function if exists public.eab_admin_device_remove(uuid, text, text, text);
drop function if exists public.eab_admin_agent_devices(uuid, text);
drop table if exists public.eab_device_removals;
drop function if exists public.eab_device_removal_keep();
drop function if exists public.eab_admin_duplicates(text);
drop function if exists public.eab_admin_bulk_action(text, uuid[], text, text, text);
drop sequence if exists public.eab_bulk_no;
drop function if exists public.eab_admin_funnel_stuck(date, date, integer, text);
drop function if exists public.eab_admin_funnel(date, date);
drop function if exists public.eab_funnel_step(record, integer);
drop function if exists public.eab_funnel_rows(date, date);
drop function if exists public.eab_admin_agent_score(uuid, text);
drop function if exists public.eab_admin_scorecard(integer, text);
drop function if exists public.eab_score_reasons(record);
drop function if exists public.eab_scores();
drop function if exists public.eab_listing_details(jsonb);

create or replace function public.eab_bc_in_audience(b public.eab_broadcasts, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select b.audience = 'all' or exists (select 1 from public.eab_my_groups(p_user) g where g.group_id = any (b.group_ids))
$$;

create or replace function public.eab_admin_broadcast_save(p jsonb, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare bid uuid := nullif(p->>'id', '')::uuid; cur public.eab_broadcasts; gids uuid[]; before jsonb; after jsonb;
        t text := nullif(btrim(coalesce(p->>'body_en', '')), '');
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if coalesce(p->>'channel', '') not in ('email', 'whatsapp') then raise exception 'choose email or WhatsApp' using errcode = '22023'; end if;
  if coalesce(p->>'kind', '') not in ('service', 'news') then raise exception 'choose service notice or news & offers' using errcode = '22023'; end if;
  if t is null then raise exception 'the English text is required' using errcode = '22023'; end if;
  if p->>'channel' = 'email' and nullif(btrim(coalesce(p->>'subject_en', '')), '') is null then raise exception 'the English subject is required' using errcode = '22023'; end if;
  if coalesce(p->>'audience', 'all') not in ('all', 'groups') then raise exception 'audience must be all or groups' using errcode = '22023'; end if;
  select coalesce(array_agg(x::uuid), '{}') into gids from jsonb_array_elements_text(coalesce(p->'group_ids', '[]'::jsonb)) x;
  if coalesce(p->>'audience', 'all') = 'groups' and cardinality(gids) = 0 then raise exception 'choose at least one group, or everyone' using errcode = '22023'; end if;
  if exists (select 1 from unnest(gids) g where not exists (select 1 from public.eab_audience_groups a where a.id = g)) then
    raise exception 'unknown audience group' using errcode = '22023';
  end if;
  if bid is not null then
    select * into cur from public.eab_broadcasts where id = bid for update;
    if cur.id is null then raise exception 'broadcast not found' using errcode = 'P0002'; end if;
    if cur.status <> 'draft' then raise exception 'only a draft can be changed' using errcode = '22023'; end if;
    before := to_jsonb(cur);
    update public.eab_broadcasts set channel = p->>'channel', kind = p->>'kind',
      subject_en = nullif(btrim(coalesce(p->>'subject_en', '')), ''), subject_bm = nullif(btrim(coalesce(p->>'subject_bm', '')), ''),
      subject_zh = nullif(btrim(coalesce(p->>'subject_zh', '')), ''), body_en = t,
      body_bm = nullif(btrim(coalesce(p->>'body_bm', '')), ''), body_zh = nullif(btrim(coalesce(p->>'body_zh', '')), ''),
      audience = coalesce(p->>'audience', 'all'), group_ids = gids, updated_at = now()
     where id = bid;
  else
    insert into public.eab_broadcasts (ref, channel, kind, subject_en, subject_bm, subject_zh, body_en, body_bm, body_zh, audience, group_ids, created_by)
    values ('BC-' || to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY') || '-' || lpad(nextval('public.eab_broadcast_no')::text, 4, '0'),
            p->>'channel', p->>'kind', nullif(btrim(coalesce(p->>'subject_en', '')), ''), nullif(btrim(coalesce(p->>'subject_bm', '')), ''),
            nullif(btrim(coalesce(p->>'subject_zh', '')), ''), t, nullif(btrim(coalesce(p->>'body_bm', '')), ''),
            nullif(btrim(coalesce(p->>'body_zh', '')), ''), coalesce(p->>'audience', 'all'), gids, auth.uid())
    returning id into bid;
  end if;
  after := public.eab_bc_json(bid);
  perform public.eab_admin_write_action('broadcast_saved', null, after->>'ref', null, before, after - 'counts', p_device);
  return after;
end $$;
