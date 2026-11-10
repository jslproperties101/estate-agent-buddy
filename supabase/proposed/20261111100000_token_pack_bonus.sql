-- Batch D (11 Nov 2026, owner's choice): bonus tokens on the bigger Ai Buddy Token packs. 1 token still costs USD 0.25 in the
-- USD 5 pack; bigger packs give more:
--   tokens_20    USD 5    20 tokens  (no bonus)
--   tokens_100   USD 25   105 tokens (+5%)
--   tokens_400   USD 100  440 tokens (+10%)
--   tokens_1000  USD 250  1,150 tokens (+15%)
-- The Google Play product ids stay the same (they are named after the base count). Purchases credited before this file keep
-- what they got; a Google refund takes back exactly what its purchase added (Batch 5 reads the purchase's own ledger row).
-- PROPOSED: not applied to any project. Needs 20261103000000_tokens_sandbox.sql. Safe to run twice.
-- Rollback: 20261111100000_token_pack_bonus_rollback.sql
begin;

-- The one pack list in the database. The server (supabase/functions/_shared/billing.ts) and the app hold the same list; a test
-- keeps the three equal.
create or replace function public.eab_token_packs()
returns table (pack_id text, tokens integer, amount_cents integer)
language sql immutable set search_path = public as $$
  values ('tokens_20', 20, 500), ('tokens_100', 105, 2500), ('tokens_400', 440, 10000), ('tokens_1000', 1150, 25000)
$$;
revoke all on function public.eab_token_packs() from public, anon;
grant execute on function public.eab_token_packs() to authenticated, service_role;

create or replace function public.eab_tokens_credit(
  p_user uuid, p_pack text, p_tokens integer, p_amount_cents integer, p_env text, p_provider text, p_ref text)
returns text
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_env not in ('sandbox', 'live') or p_provider is distinct from 'google_play' or coalesce(p_ref, '') = ''
     or not exists (select 1 from public.eab_token_packs() k where k.pack_id = p_pack and k.tokens = p_tokens and k.amount_cents = p_amount_cents) then
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
