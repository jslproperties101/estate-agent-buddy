-- Billing (sandbox / test mode only): who has Pro or the AI Buddy POS add-on, and the log of payment events that changed it.
-- Branch v3-updates-v42.26.10281931abGh68fltB4j9dCsaXFh, 28 Oct 2026. PROPOSED: not applied to any project. Run it on the TEST
-- Supabase project first; never on production without the owner's approval (docs/MONETISATION_PLAN.md).
--
-- Who writes what:
--   * Only the billing server functions (service role) change these tables, through the two functions below. The phone cannot
--     insert, update or delete anything here, so nobody can give themselves Pro from the app.
--   * A signed-in agent reads only their own rows, through eab_my_billing().
--   * No card numbers and no raw provider payloads are stored: only the event id, kind, plan, amount and time.
--
-- Safe to run twice. Rollback: supabase/proposed/20261028000000_billing_sandbox_rollback.sql
begin;

create table if not exists public.eab_billing_entitlements (
  user_id              uuid not null references auth.users (id) on delete cascade,
  product              text not null check (product in ('pro', 'pos')),
  plan_id              text check (plan_id is null or plan_id in ('pro_monthly', 'pro_yearly', 'pos_monthly')),
  status               text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  provider             text not null check (provider in ('trial', 'fpx', 'stripe', 'google_play')),
  provider_ref         text,
  env                  text not null default 'sandbox' check (env in ('sandbox', 'live')),
  trial_end            timestamptz,
  period_end           timestamptz,
  cancel_at_period_end boolean not null default false,
  last_event_at        timestamptz,
  updated_at           timestamptz not null default now(),
  primary key (user_id, product)
);
alter table public.eab_billing_entitlements enable row level security;
revoke all on public.eab_billing_entitlements from public, anon, authenticated;

create table if not exists public.eab_billing_events (
  id          bigserial primary key,
  provider    text not null check (provider in ('fpx', 'stripe', 'google_play')),
  event_id    text not null,
  user_id     uuid,
  kind        text not null,
  env         text not null check (env in ('sandbox', 'live')),
  plan_id     text,
  amount_sen  integer check (amount_sen is null or amount_sen >= 0),
  received_at timestamptz not null default now(),
  unique (provider, event_id)            -- the same event twice changes nothing
);
alter table public.eab_billing_events enable row level security;
revoke all on public.eab_billing_events from public, anon, authenticated;

-- The signed-in agent's own rows.
create or replace function public.eab_my_billing()
returns table (product text, plan_id text, status text, provider text, env text, trial_end timestamptz, period_end timestamptz, cancel_at_period_end boolean)
language sql stable security definer set search_path = public as $$
  select e.product, e.plan_id, e.status, e.provider, e.env, e.trial_end, e.period_end, e.cancel_at_period_end
    from public.eab_billing_entitlements e
   where e.user_id = auth.uid()
$$;
revoke all on function public.eab_my_billing() from public, anon;
grant execute on function public.eab_my_billing() to authenticated;

-- One free trial per person per product, ever (a row for that product already existing means it was used or paid for).
create or replace function public.eab_billing_start_trial(p_user uuid, p_product text, p_days integer, p_env text)
returns text
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_product not in ('pro', 'pos') or p_env not in ('sandbox', 'live') or p_days is null or p_days < 1 or p_days > 60 then
    raise exception 'bad trial request';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then return 'unknown-user'; end if;
  insert into public.eab_billing_entitlements (user_id, product, plan_id, status, provider, env, trial_end, last_event_at)
  values (p_user, p_product, null, 'trialing', 'trial', p_env, now() + make_interval(days => p_days), now())
  on conflict (user_id, product) do nothing;
  get diagnostics n = row_count;
  return case when n = 1 then 'started' else 'already-used' end;
end $$;
revoke all on function public.eab_billing_start_trial(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.eab_billing_start_trial(uuid, text, integer, text) to service_role;

-- Applies one payment event, once. Returns 'applied', 'duplicate' (this provider event id was already seen), 'stale' (a newer
-- event for the same plan was already applied) or 'unknown-user'.
--   * p_period_end: the provider's own end of the paid period (Stripe, Google Play).
--   * p_extend_days: a one-time payment (FPX / Billplz) adds that many days to the period still running, or to now.
create or replace function public.eab_billing_apply(
  p_provider text, p_event_id text, p_user uuid, p_kind text, p_product text, p_plan text, p_status text, p_env text,
  p_period_end timestamptz, p_extend_days integer, p_cancel_at_end boolean, p_ref text, p_amount_sen integer, p_event_at timestamptz)
returns text
language plpgsql security definer set search_path = public as $$
declare n integer; cur public.eab_billing_entitlements%rowtype; new_end timestamptz;
begin
  if p_provider not in ('fpx', 'stripe', 'google_play') or p_product not in ('pro', 'pos')
     or p_status not in ('trialing', 'active', 'past_due', 'canceled', 'expired') or p_env not in ('sandbox', 'live')
     or coalesce(p_event_id, '') = '' then
    raise exception 'bad billing event';
  end if;
  insert into public.eab_billing_events (provider, event_id, user_id, kind, env, plan_id, amount_sen)
  values (p_provider, p_event_id, p_user, p_kind, p_env, p_plan, p_amount_sen)
  on conflict (provider, event_id) do nothing;
  get diagnostics n = row_count;
  if n = 0 then return 'duplicate'; end if;
  if not exists (select 1 from auth.users where id = p_user) then return 'unknown-user'; end if;

  select * into cur from public.eab_billing_entitlements where user_id = p_user and product = p_product for update;
  -- Provider events can arrive out of order: an older one never overwrites a newer one. A one-time payment is exempt, because
  -- every paid bill must count, in whatever order the callbacks arrive.
  if found and p_extend_days is null and cur.last_event_at is not null and p_event_at < cur.last_event_at then return 'stale'; end if;

  new_end := case when p_extend_days is not null
                  then greatest(coalesce(cur.period_end, now()), now()) + make_interval(days => p_extend_days)
                  else p_period_end end;
  insert into public.eab_billing_entitlements as e
    (user_id, product, plan_id, status, provider, provider_ref, env, trial_end, period_end, cancel_at_period_end, last_event_at, updated_at)
  values (p_user, p_product, p_plan, p_status, p_provider, p_ref, p_env, null, new_end, coalesce(p_cancel_at_end, false),
          greatest(coalesce(cur.last_event_at, p_event_at), p_event_at), now())
  on conflict (user_id, product) do update set
    plan_id = excluded.plan_id, status = excluded.status, provider = excluded.provider, provider_ref = excluded.provider_ref,
    env = excluded.env, trial_end = null, period_end = excluded.period_end, cancel_at_period_end = excluded.cancel_at_period_end,
    last_event_at = excluded.last_event_at, updated_at = now();
  return 'applied';
end $$;
revoke all on function public.eab_billing_apply(text, text, uuid, text, text, text, text, text, timestamptz, integer, boolean, text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.eab_billing_apply(text, text, uuid, text, text, text, text, text, timestamptz, integer, boolean, text, integer, timestamptz) to service_role;

commit;
