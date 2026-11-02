-- Batch B (3 Nov 2026): Ai Buddy Tokens, sandbox / test mode only. A wallet per agent, filled by buying token packs through
-- Google Play (one-time, consumable products). 1 token = USD 0.25; packs of 20, 100, 400 and 1,000 tokens for USD 5, 25, 100
-- and 250. Spending tokens (Oneharta lookups) is Batch C and is NOT in this file.
-- PROPOSED: not applied to any project. Run it on the TEST Supabase project first; never on production without the owner's
-- approval (docs/MONETISATION_PLAN.md). Needs nothing from 20261028000000_billing_sandbox.sql, but is meant to run after it.
--
-- Who writes what:
--   * Only the billing server function (service role) adds tokens, through eab_tokens_credit(), after Google confirmed the
--     purchase. The phone cannot insert, update or delete anything here, so nobody can give themselves tokens from the app.
--   * A signed-in agent reads only their own balance and history, through eab_my_tokens().
--   * Every change is a ledger row; the balance is kept next to it in the same transaction and can never go below zero.
--   * One purchase credits once: the ledger is unique on (kind, ref), and ref is a hash of the Google purchase token.
--   * The pack list is held here too: a pack id with the wrong token count or price is refused, whatever the caller sends.
--   * Balances are kept per environment: tokens bought in test mode ('sandbox') never become real ('live') tokens.
--
-- Safe to run twice. Rollback: supabase/proposed/20261103000000_tokens_sandbox_rollback.sql
begin;

create table if not exists public.eab_token_balances (
  user_id    uuid not null references auth.users (id) on delete cascade,
  env        text not null check (env in ('sandbox', 'live')),
  balance    integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, env)
);
alter table public.eab_token_balances enable row level security;
revoke all on public.eab_token_balances from public, anon, authenticated;

create table if not exists public.eab_token_ledger (
  id           bigserial primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  env          text not null check (env in ('sandbox', 'live')),
  delta        integer not null check (delta <> 0),
  kind         text not null check (kind in ('purchase', 'spend', 'refund', 'adjust')),
  pack_id      text check (pack_id is null or pack_id in ('tokens_20', 'tokens_100', 'tokens_400', 'tokens_1000')),
  provider     text check (provider is null or provider in ('google_play')),
  ref          text,
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  created_at   timestamptz not null default now(),
  unique (kind, ref)                     -- the same purchase twice adds nothing
);
create index if not exists eab_token_ledger_user_idx on public.eab_token_ledger (user_id, id desc);
alter table public.eab_token_ledger enable row level security;
revoke all on public.eab_token_ledger from public, anon, authenticated;

-- The signed-in agent's own balances (per environment) and last 20 ledger rows, newest first.
create or replace function public.eab_my_tokens()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'balances', coalesce((select jsonb_object_agg(b.env, b.balance) from public.eab_token_balances b where b.user_id = auth.uid()), '{}'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('delta', h.delta, 'kind', h.kind, 'pack_id', h.pack_id, 'env', h.env, 'created_at', h.created_at) order by h.id desc)
                           from (select l.id, l.delta, l.kind, l.pack_id, l.env, l.created_at from public.eab_token_ledger l
                                  where l.user_id = auth.uid() order by l.id desc limit 20) h), '[]'::jsonb))
  where auth.uid() is not null
$$;
revoke all on function public.eab_my_tokens() from public, anon;
grant execute on function public.eab_my_tokens() to authenticated;

-- Credits one confirmed purchase of a token pack, once. Returns 'applied', 'duplicate' (this purchase was already credited)
-- or 'unknown-user'. Raises on anything that is not exactly one of the four packs at its own token count and price.
create or replace function public.eab_tokens_credit(
  p_user uuid, p_pack text, p_tokens integer, p_amount_cents integer, p_env text, p_provider text, p_ref text)
returns text
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_env not in ('sandbox', 'live') or p_provider is distinct from 'google_play' or coalesce(p_ref, '') = ''
     or (p_pack, p_tokens, p_amount_cents) not in (('tokens_20', 20, 500), ('tokens_100', 100, 2500), ('tokens_400', 400, 10000), ('tokens_1000', 1000, 25000)) then
    raise exception 'bad token credit';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then return 'unknown-user'; end if;
  insert into public.eab_token_ledger (user_id, env, delta, kind, pack_id, provider, ref, amount_cents)
  values (p_user, p_env, p_tokens, 'purchase', p_pack, p_provider, p_ref, p_amount_cents)
  on conflict (kind, ref) do nothing;
  get diagnostics n = row_count;
  if n = 0 then return 'duplicate'; end if;
  insert into public.eab_token_balances as b (user_id, env, balance, updated_at)
  values (p_user, p_env, p_tokens, now())
  on conflict (user_id, env) do update set balance = b.balance + excluded.balance, updated_at = now();
  return 'applied';
end $$;
revoke all on function public.eab_tokens_credit(uuid, text, integer, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.eab_tokens_credit(uuid, text, integer, integer, text, text, text) to service_role;

commit;
