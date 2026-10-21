-- JoyChange010-03: push alerts for Admin EAB posts, with sent / delivered / opened counts per post.
--   Requirement: JoyChange005-Main Part6 Change K9 ("Admin EAB push broadcast reporting shows sent, delivered and opened"),
--   JoyChange009-Main Stage C/D; MainForAdmin-D left push_alert stored but never sent.
--
-- How it works:
--   1. A post (eab_feed_items) that is published with push_alert on is QUEUED once (trigger, eab_push_broadcasts).
--      Switching push_alert on after publishing also queues it. A post is never pushed twice.
--   2. Admin EAB (Owner or Admin) asks the send-push Edge Function to send it: {"kind":"feed","item_id":...}, or
--      {"kind":"feed"} for every queued post. The function claims the post with the ADMIN'S OWN sign-in
--      (eab_push_feed_claim: role check, admin audit log), so a phone or an agent can never start a broadcast.
--   3. With the service role it gets the agents who may see the post now (same rule as eab_my_feed, active accounts only)
--      and their phones (eab_push_feed_recipients), sends in each phone's language, and records one row per agent
--      (eab_push_feed_finish): sent / failed / no phone.
--   4. The phone reports "received" (arrived while the app was open) and "opened" (tapped) through eab_push_ack.
--   5. Admin EAB reads the counts: eab_admin_push_report(item) and eab_admin_push_list().
-- Honest limit: Android shows a push by itself when the app is closed or in the background, without telling the app.
--   So "delivered" = agents whose phone reported received OR opened; a push that arrived and was never tapped while the
--   app was closed is not seen. Exact delivery needs Firebase's delivery data (BigQuery export), not built.
-- Records are kept 7 years: no cascade delete from agents or posts. Safe to run twice.
-- Rollback: supabase/rollback/20261021210000_push_broadcast_counts_rollback.sql
begin;

create table if not exists public.eab_push_broadcasts (
  item_id     uuid primary key references public.eab_feed_items (id) on delete restrict,
  status      text not null default 'queued' check (status in ('queued', 'sending', 'done')),
  queued_at   timestamptz not null default now(),
  started_at  timestamptz,
  started_by  uuid,
  finished_at timestamptz,
  targeted    integer not null default 0,   -- agents who could see the post when it was sent
  sent        integer not null default 0,   -- agents with at least one phone that Firebase accepted
  failed      integer not null default 0,   -- agents whose every phone was refused by Firebase
  no_phone    integer not null default 0    -- agents with no phone registered for push
);
create index if not exists eab_push_broadcasts_status on public.eab_push_broadcasts (status, queued_at);

create table if not exists public.eab_push_deliveries (
  item_id     uuid not null references public.eab_feed_items (id) on delete restrict,
  user_id     uuid not null references auth.users (id) on delete restrict,
  status      text not null check (status in ('sent', 'failed', 'no_phone')),
  error       text check (error is null or error ~ '^[a-z0-9_.:-]{1,60}$'),   -- a code, never a message
  sent_at     timestamptz not null default now(),
  received_at timestamptz,
  opened_at   timestamptz,
  primary key (item_id, user_id)
);

alter table public.eab_push_broadcasts enable row level security;
alter table public.eab_push_deliveries enable row level security;
revoke all on public.eab_push_broadcasts, public.eab_push_deliveries from public, anon, authenticated;

-- 1. Queue a published post that has push_alert on (once).
create or replace function public.eab_push_queue_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and new.push_alert then
    insert into public.eab_push_broadcasts (item_id) values (new.id) on conflict (item_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists eab_feed_items_push_queue on public.eab_feed_items;
create trigger eab_feed_items_push_queue after insert or update of status, push_alert on public.eab_feed_items
  for each row execute function public.eab_push_queue_trg();

-- 2. Admin EAB: what is waiting to be sent.
create or replace function public.eab_push_feed_queued() returns uuid[]
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  return coalesce((select array_agg(b.item_id order by b.queued_at) from public.eab_push_broadcasts b
    join public.eab_feed_items i on i.id = b.item_id
   where (b.status = 'queued' or (b.status = 'sending' and b.started_at < now() - interval '15 minutes'))
     and i.status = 'published' and i.push_alert), '{}');
end $$;

-- 2. Claim one post for sending, as the signed-in admin. Returns false when there is nothing to send (already sent,
--    withdrawn, alert switched off, or not yet due). A send that died half-way can be claimed again after 15 minutes.
create or replace function public.eab_push_feed_claim(p_item uuid, p_device text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare i public.eab_feed_items; n int;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  select * into i from public.eab_feed_items where id = p_item;
  if i.id is null or i.status <> 'published' or not i.push_alert
     or (i.published_at is not null and i.published_at > now()) or (i.expires_at is not null and i.expires_at <= now()) then
    return false;
  end if;
  update public.eab_push_broadcasts set status = 'sending', started_at = now(), started_by = auth.uid()
   where item_id = p_item and (status = 'queued' or (status = 'sending' and started_at < now() - interval '15 minutes'));
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  perform public.eab_admin_write_action('push_broadcast_started', null, 'eab_feed_items:' || p_item,
    'Push alert for a published post', null, jsonb_build_object('item_id', p_item, 'kind', i.kind, 'title_en', i.title_en), p_device);
  return true;
end $$;

-- 3. Service role only: who gets it. One row per phone; an agent who may see the post but has no phone comes back once
--    with token null (counted as "no phone").
create or replace function public.eab_push_feed_recipients(p_item uuid)
returns table (user_id uuid, token text, lang text, title text, body text)
language plpgsql stable security definer set search_path = public, auth as $$
declare i public.eab_feed_items;
begin
  select * into i from public.eab_feed_items where id = p_item;
  if i.id is null then return; end if;
  return query
  select u.id, t.token, coalesce(t.lang, 'en'),
         case coalesce(t.lang, 'en') when 'bm' then coalesce(i.title_bm, i.title_en) when 'zh' then coalesce(i.title_zh, i.title_en) else i.title_en end,
         left(regexp_replace(coalesce(case coalesce(t.lang, 'en') when 'bm' then coalesce(i.body_bm, i.body_en) when 'zh' then coalesce(i.body_zh, i.body_en) else i.body_en end, ''), '\s+', ' ', 'g'), 150)
    from auth.users u
    left join public.eab_push_tokens t on t.user_id = u.id
   where public.eab_account_ok(u.id) and public.eab_feed_visible(u.id, i)
   order by u.id;
end $$;

-- 3. Service role only: the result, one entry per agent: {"user_id":..., "status":"sent"|"failed"|"no_phone", "error":code}.
--    Works out the counts and closes the broadcast.
create or replace function public.eab_push_feed_finish(p_item uuid, p_results jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; out jsonb;
begin
  if jsonb_typeof(coalesce(p_results, '[]'::jsonb)) <> 'array' then raise exception 'results must be a list' using errcode = '22023'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    insert into public.eab_push_deliveries (item_id, user_id, status, error)
    values (p_item, (r->>'user_id')::uuid, r->>'status', nullif(left(lower(regexp_replace(coalesce(r->>'error', ''), '[^a-zA-Z0-9_.:-]', '_', 'g')), 60), ''))
    on conflict (item_id, user_id) do update set
      -- a second attempt after a half-finished send: "sent" is never downgraded
      status = case when eab_push_deliveries.status = 'sent' then 'sent' else excluded.status end,
      error  = case when eab_push_deliveries.status = 'sent' then eab_push_deliveries.error else excluded.error end;
  end loop;
  update public.eab_push_broadcasts b set status = 'done', finished_at = now(),
    targeted = (select count(*) from public.eab_push_deliveries d where d.item_id = p_item),
    sent     = (select count(*) from public.eab_push_deliveries d where d.item_id = p_item and d.status = 'sent'),
    failed   = (select count(*) from public.eab_push_deliveries d where d.item_id = p_item and d.status = 'failed'),
    no_phone = (select count(*) from public.eab_push_deliveries d where d.item_id = p_item and d.status = 'no_phone')
   where b.item_id = p_item
  returning jsonb_build_object('targeted', targeted, 'sent', sent, 'failed', failed, 'no_phone', no_phone) into out;
  return out;
end $$;

-- 4. The phone: the alert arrived (app open) or was tapped. Only the agent's own row; true when it was counted.
create or replace function public.eab_push_ack(p_item uuid, p_what text) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n int;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_what not in ('received', 'opened') then raise exception 'unknown mark' using errcode = '22023'; end if;
  update public.eab_push_deliveries set
    received_at = coalesce(received_at, now()),
    opened_at   = case when p_what = 'opened' then coalesce(opened_at, now()) else opened_at end
   where item_id = p_item and user_id = me and status = 'sent';
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- 5. Admin EAB: the counts for one post, and for every post that had an alert.
create or replace function public.eab_push_counts(p_item uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('item_id', b.item_id, 'status', b.status, 'queued_at', b.queued_at, 'started_at', b.started_at,
    'finished_at', b.finished_at, 'targeted', b.targeted, 'sent', b.sent, 'failed', b.failed, 'no_phone', b.no_phone,
    'delivered', (select count(*) from public.eab_push_deliveries d where d.item_id = b.item_id and d.received_at is not null),
    'opened',    (select count(*) from public.eab_push_deliveries d where d.item_id = b.item_id and d.opened_at is not null))
  from public.eab_push_broadcasts b where b.item_id = p_item
$$;

create or replace function public.eab_admin_push_report(p_item uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  return public.eab_push_counts(p_item);
end $$;

create or replace function public.eab_admin_push_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  return coalesce((select jsonb_agg(public.eab_push_counts(b.item_id) || jsonb_build_object('kind', i.kind, 'title_en', i.title_en)
                                    order by b.queued_at desc)
                     from public.eab_push_broadcasts b join public.eab_feed_items i on i.id = b.item_id), '[]'::jsonb);
end $$;

revoke all on function public.eab_push_queue_trg(), public.eab_push_feed_queued(), public.eab_push_feed_claim(uuid, text),
  public.eab_push_feed_recipients(uuid), public.eab_push_feed_finish(uuid, jsonb), public.eab_push_ack(uuid, text),
  public.eab_push_counts(uuid), public.eab_admin_push_report(uuid), public.eab_admin_push_list() from public, anon, authenticated;
grant execute on function public.eab_push_feed_queued(), public.eab_push_feed_claim(uuid, text), public.eab_push_ack(uuid, text),
  public.eab_admin_push_report(uuid), public.eab_admin_push_list() to authenticated;
grant execute on function public.eab_push_feed_recipients(uuid), public.eab_push_feed_finish(uuid, jsonb) to service_role;

-- Posts already published with an alert before this migration are queued too (they were never sent).
insert into public.eab_push_broadcasts (item_id)
  select id from public.eab_feed_items where status = 'published' and push_alert on conflict (item_id) do nothing;

commit;
