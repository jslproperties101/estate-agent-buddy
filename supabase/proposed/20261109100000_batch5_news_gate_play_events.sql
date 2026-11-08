-- Batch 5 (9 Nov 2026): payments hardening, part 1. SANDBOX / TEST MODE ONLY. PROPOSED: run on the TEST Supabase project
-- (EAB-QA-Test) first; never on production without the owner's approval. Needs 20261028000000_billing_sandbox.sql and
-- 20261103000000_tokens_sandbox.sql first. Safe to run more than once. Rollback: 20261109100000_batch5_..._rollback.sql
--
-- In plain words:
--  1. Market News is hidden ON THE SERVER for agents without a news plan, once the Owner switches "news is paid" on.
--     Until then nothing changes for anybody (the switch is off by default). The rule sits in eab_feed_visible, so it covers
--     the agent's feed, read marks, invitation-code counts AND who gets a push alert for a news post.
--  2. Google Play tells the server about renewals, cancellations and refunds (real-time developer notifications). The
--     server remembers which agent each purchase belongs to (a hash of Google's purchase token, never the token), so a
--     notification can be matched to the agent without trusting anything else in it. Every notification is checked again
--     with Google before anything changes.
--  3. A refunded token pack takes its tokens back. If some were already spent, only what is left is taken (the balance
--     never goes below zero) and the shortfall is recorded for the Owner. Each refund is applied once.
begin;

-- ---------------------------------------------------------------------------------------------- 1. billing switches
create table if not exists public.eab_billing_settings (
  id          boolean primary key default true check (id),
  news_paid   boolean not null default false,   -- Market News needs a news plan (server-side hiding on)
  live        boolean not null default false,   -- only 'live' purchases count (mirror of BILLING_LIVE in the app)
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
insert into public.eab_billing_settings (id) values (true) on conflict do nothing;
alter table public.eab_billing_settings enable row level security;
revoke all on public.eab_billing_settings from public, anon, authenticated;

-- Does this agent have this product now? Same rules as the app (app/src/billing/entitlement.ts resolveLine): a trial or a
-- paid period that has not ended; 7 days' grace after a period ends unpaid; a row without an end date is not trusted;
-- while live, a sandbox purchase never counts.
create or replace function public.eab_billing_has(p_user uuid, p_product text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case e.status
             when 'trialing' then coalesce(e.trial_end, e.period_end) > now()
             when 'active'   then e.period_end is not null and e.period_end + interval '7 days' > now()
             when 'past_due' then e.period_end is not null and e.period_end + interval '7 days' > now()
             when 'canceled' then e.period_end is not null and e.period_end > now()
             else false end
      from public.eab_billing_entitlements e
     where e.user_id = p_user and e.product = p_product
       and (not coalesce((select s.live from public.eab_billing_settings s where s.id), false) or e.env = 'live')), false)
$$;
revoke all on function public.eab_billing_has(uuid, text) from public, anon, authenticated;

-- What the app needs to know about the switches (signed-in agents only).
create or replace function public.eab_billing_public() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('news_paid', s.news_paid, 'live', s.live) from public.eab_billing_settings s where s.id and auth.uid() is not null
$$;
revoke all on function public.eab_billing_public() from public, anon;
grant execute on function public.eab_billing_public() to authenticated;

-- Owner only, with a reason, written to the admin action log.
create or replace function public.eab_admin_billing_settings_set(p_patch jsonb, p_reason text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare before jsonb; after jsonb;
begin
  perform public.eab_admin_guard(array['owner']);
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'a reason of at least 5 characters is required' using errcode = '22023'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or exists (select 1 from jsonb_object_keys(p_patch) k where k not in ('news_paid', 'live'))
     or (p_patch ? 'news_paid' and jsonb_typeof(p_patch->'news_paid') <> 'boolean')
     or (p_patch ? 'live' and jsonb_typeof(p_patch->'live') <> 'boolean') then
    raise exception 'only news_paid and live (true / false) can be set' using errcode = '22023';
  end if;
  select to_jsonb(s) into before from public.eab_billing_settings s where s.id;
  update public.eab_billing_settings set
    news_paid = coalesce((p_patch->>'news_paid')::boolean, news_paid),
    live = coalesce((p_patch->>'live')::boolean, live),
    updated_at = now(), updated_by = auth.uid()
   where id returning to_jsonb(eab_billing_settings.*) into after;
  perform public.eab_admin_write_action('billing_settings_set', null, 'eab_billing_settings', btrim(p_reason), before, after, p_device);
  return jsonb_build_object('news_paid', after->'news_paid', 'live', after->'live');
end $$;
revoke all on function public.eab_admin_billing_settings_set(jsonb, text, text) from public, anon;
grant execute on function public.eab_admin_billing_settings_set(jsonb, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------- server-side news hiding
-- Unchanged from MainForAdmin-D except the last line: a news post needs a news plan while news_paid is on.
create or replace function public.eab_feed_visible(p_user uuid, i public.eab_feed_items) returns boolean
language sql stable security definer set search_path = public as $$
  select i.status = 'published' and (i.published_at is null or i.published_at <= now()) and (i.expires_at is null or i.expires_at > now())
     and (i.audience = 'all'
          or (i.audience = 'groups' and exists (select 1 from public.eab_feed_targets t join public.eab_my_groups(p_user) g on g.group_id = t.group_id where t.item_id = i.id))
          or exists (select 1 from public.eab_feed_code_grants c where c.user_id = p_user and c.item_id = i.id))
     and (i.kind <> 'news' or not coalesce((select s.news_paid from public.eab_billing_settings s where s.id), false)
          or public.eab_billing_has(p_user, 'news'))
$$;
revoke all on function public.eab_feed_visible(uuid, public.eab_feed_items) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------- 2. Google Play purchases
-- Which agent each Google Play purchase belongs to. token_hash = sha256 of Google's purchase token (hex); the token itself
-- is never stored. Written only by the billing function after Google confirmed the purchase belongs to that agent.
create table if not exists public.eab_play_purchases (
  token_hash  text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('subs', 'inapp')),
  product_id  text not null check (product_id in ('pro_monthly', 'pro_yearly', 'pos_monthly', 'news_monthly', 'news_yearly',
                                                  'tokens_20', 'tokens_100', 'tokens_400', 'tokens_1000')),
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
create index if not exists eab_play_purchases_user_idx on public.eab_play_purchases (user_id);
alter table public.eab_play_purchases enable row level security;
revoke all on public.eab_play_purchases from public, anon, authenticated;

-- 'linked', 'seen' (already linked to this agent) or 'other-agent' (never re-pointed to someone else).
create or replace function public.eab_play_purchase_link(p_token_hash text, p_user uuid, p_kind text, p_product text) returns text
language plpgsql security definer set search_path = public as $$
declare cur uuid;
begin
  insert into public.eab_play_purchases (token_hash, user_id, kind, product_id) values (p_token_hash, p_user, p_kind, p_product)
  on conflict (token_hash) do nothing;
  if found then return 'linked'; end if;
  select user_id into cur from public.eab_play_purchases where token_hash = p_token_hash;
  if cur is distinct from p_user then return 'other-agent'; end if;
  update public.eab_play_purchases set last_seen = now() where token_hash = p_token_hash;
  return 'seen';
end $$;
revoke all on function public.eab_play_purchase_link(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.eab_play_purchase_link(text, uuid, text, text) to service_role;

-- Who a purchase belongs to (null when unknown).
create or replace function public.eab_play_purchase_owner(p_token_hash text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('user_id', p.user_id, 'kind', p.kind, 'product_id', p.product_id)
    from public.eab_play_purchases p where p.token_hash = p_token_hash
$$;
revoke all on function public.eab_play_purchase_owner(text) from public, anon, authenticated;
grant execute on function public.eab_play_purchase_owner(text) to service_role;

-- ---------------------------------------------------------------------------------------------- 3. token refunds
create table if not exists public.eab_token_refunds (
  ref           text primary key,                -- the purchase's ledger ref ('gp:' + hash of the purchase token)
  user_id       uuid not null references auth.users (id) on delete cascade,
  env           text not null check (env in ('sandbox', 'live')),
  tokens_due    integer not null check (tokens_due > 0),
  tokens_taken  integer not null check (tokens_taken >= 0 and tokens_taken <= tokens_due),
  at            timestamptz not null default now()
);
alter table public.eab_token_refunds enable row level security;
revoke all on public.eab_token_refunds from public, anon, authenticated;

-- The ledger may now also hold refund rows; their ref is the purchase's ref (one refund per purchase).
create or replace function public.eab_tokens_refund(p_ref text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.eab_token_ledger; bal integer; take integer;
begin
  if coalesce(p_ref, '') = '' then raise exception 'bad refund' using errcode = '22023'; end if;
  select * into p from public.eab_token_ledger where kind = 'purchase' and ref = p_ref;
  if p.id is null then return jsonb_build_object('result', 'unknown-purchase'); end if;
  if exists (select 1 from public.eab_token_refunds where ref = p_ref) then
    return (select jsonb_build_object('result', 'duplicate', 'due', r.tokens_due, 'taken', r.tokens_taken) from public.eab_token_refunds r where r.ref = p_ref);
  end if;
  select balance into bal from public.eab_token_balances where user_id = p.user_id and env = p.env for update;
  take := least(p.delta, coalesce(bal, 0));
  insert into public.eab_token_refunds (ref, user_id, env, tokens_due, tokens_taken) values (p_ref, p.user_id, p.env, p.delta, take);
  if take > 0 then
    insert into public.eab_token_ledger (user_id, env, delta, kind, pack_id, provider, ref, amount_cents)
    values (p.user_id, p.env, -take, 'refund', p.pack_id, p.provider, p_ref, p.amount_cents);
    update public.eab_token_balances set balance = balance - take, updated_at = now() where user_id = p.user_id and env = p.env;
  end if;
  return jsonb_build_object('result', 'applied', 'due', p.delta, 'taken', take);
end $$;
revoke all on function public.eab_tokens_refund(text) from public, anon, authenticated;
grant execute on function public.eab_tokens_refund(text) to service_role;

commit;
