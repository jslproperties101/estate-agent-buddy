-- Rollback for 20261111100000_token_pack_bonus.sql: back to the Batch B packs (20 / 100 / 400 / 1,000 tokens, no bonus).
-- Tokens already credited with a bonus stay in agents' balances. Safe to run twice. Test project only.
begin;
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

drop function if exists public.eab_token_packs();
commit;
