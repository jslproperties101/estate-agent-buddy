-- Batch C (10 Nov 2026): Oneharta lookups paid with Ai Buddy Tokens. Sandbox / test mode first.
-- PROPOSED: not applied to any project. Needs 20261103000000_tokens_sandbox.sql first (the token wallet). Safe to run twice.
-- Rollback: 20261110200000_oneharta_lookups_rollback.sql
--
-- How a lookup is paid (only the lookup server function, as service_role, can call these):
--   1. eab_lookup_begin   takes the MOST the lookup can cost from the agent's tokens (3 tokens per Oneharta credit), checks
--                         the daily credit limits (per agent and for the whole app, Malaysia day), and records the lookup.
--                         Refused with no change when the balance is too low or a limit is reached.
--   2. the server asks Oneharta.
--   3. eab_lookup_finish  charges 3 tokens per credit Oneharta really charged and gives the rest back at once.
--      eab_lookup_refund  gives back everything charged (a company search Oneharta later found no data for, and refunded).
-- Every token change is a ledger row; the balance never goes below zero; a lookup is finished or refunded only once.
-- The results themselves (owner names, IC numbers, phones) are NEVER stored here: only what kind of lookup it was, a short
-- note without personal details, what it cost, and the Oneharta reference needed to reopen a land tax record for free.
begin;

create table if not exists public.eab_lookups (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  env             text not null check (env in ('sandbox', 'live')),
  kind            text not null check (kind in ('infosearch', 'ct_search', 'company', 'sale_search', 'sale_unlock', 'rental_search', 'rental_unlock')),
  summary         text not null check (length(summary) <= 200),
  credits_max     integer not null check (credits_max between 1 and 3),
  tokens_held     integer not null check (tokens_held = credits_max * 3),
  credits_charged integer check (credits_charged is null or credits_charged between 0 and credits_max),
  tokens_charged  integer check (tokens_charged is null or tokens_charged between 0 and tokens_held),
  status          text not null default 'pending' check (status in ('pending', 'done', 'empty', 'failed', 'unknown', 'refunded')),
  oh_ref          text check (oh_ref is null or length(oh_ref) <= 120),
  created_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create index if not exists eab_lookups_user_idx on public.eab_lookups (user_id, created_at desc);
create index if not exists eab_lookups_day_idx on public.eab_lookups (created_at);
alter table public.eab_lookups enable row level security;
revoke all on public.eab_lookups from public, anon, authenticated;

-- Credits counted against the daily limits since 00:00 Malaysia time: what was charged, or the most it can cost while the
-- answer is not known yet (pending, unknown). Failed and refunded lookups count nothing.
create or replace function public.eab_lookup_credits_today(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when status in ('pending', 'unknown') then credits_max when status in ('done', 'empty') then credits_charged else 0 end), 0)::int
  from public.eab_lookups
  where created_at >= (date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur')
    and (p_user is null or user_id = p_user)
$$;
revoke all on function public.eab_lookup_credits_today(uuid) from public, anon, authenticated;

create or replace function public.eab_lookup_begin(
  p_user uuid, p_env text, p_kind text, p_credits_max integer, p_summary text, p_agent_cap integer, p_global_cap integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare bal integer; held integer := p_credits_max * 3; lid uuid;
begin
  if p_env not in ('sandbox', 'live') or p_credits_max not between 1 and 3 or coalesce(p_agent_cap, -1) < 0 or coalesce(p_global_cap, -1) < 0 then
    raise exception 'bad lookup';
  end if;
  perform pg_advisory_xact_lock(hashtext('eab_lookups_daily_cap'));   -- one lookup at a time is checked against the limits
  if public.eab_lookup_credits_today(p_user) + p_credits_max > p_agent_cap then return jsonb_build_object('result', 'agent-limit'); end if;
  if public.eab_lookup_credits_today(null) + p_credits_max > p_global_cap then return jsonb_build_object('result', 'app-limit'); end if;
  select balance into bal from public.eab_token_balances where user_id = p_user and env = p_env for update;
  if coalesce(bal, 0) < held then return jsonb_build_object('result', 'not-enough-tokens', 'balance', coalesce(bal, 0), 'needed', held); end if;
  insert into public.eab_lookups (user_id, env, kind, summary, credits_max, tokens_held)
  values (p_user, p_env, p_kind, left(coalesce(p_summary, ''), 200), p_credits_max, held) returning id into lid;
  insert into public.eab_token_ledger (user_id, env, delta, kind, ref) values (p_user, p_env, -held, 'spend', 'lk:' || lid);
  update public.eab_token_balances set balance = balance - held, updated_at = now() where user_id = p_user and env = p_env;
  return jsonb_build_object('result', 'ok', 'id', lid, 'held', held, 'balance', bal - held);
end $$;
revoke all on function public.eab_lookup_begin(uuid, text, text, integer, text, integer, integer) from public, anon, authenticated;
grant execute on function public.eab_lookup_begin(uuid, text, text, integer, text, integer, integer) to service_role;

-- p_status: 'done' (found), 'empty' (nothing found), 'failed' (refused / error: nothing charged), 'unknown' (no answer from
-- Oneharta: the tokens stay held until the owner checks; see docs). Gives back tokens_held - 3 x credits charged.
create or replace function public.eab_lookup_finish(p_id uuid, p_credits integer, p_status text, p_ref text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.eab_lookups; charge integer; back integer; bal integer;
begin
  if p_status not in ('done', 'empty', 'failed', 'unknown') then raise exception 'bad status'; end if;
  select * into l from public.eab_lookups where id = p_id for update;
  if l.id is null then return jsonb_build_object('result', 'not-found'); end if;
  if l.status <> 'pending' then return jsonb_build_object('result', 'already', 'status', l.status, 'tokens_charged', l.tokens_charged); end if;
  if p_status = 'unknown' then
    update public.eab_lookups set status = 'unknown', finished_at = now() where id = p_id;
    return jsonb_build_object('result', 'unknown', 'tokens_charged', l.tokens_held);
  end if;
  if p_credits is null or p_credits < 0 then raise exception 'bad credits'; end if;
  charge := least(p_credits, l.credits_max) * 3;
  back := l.tokens_held - charge;
  update public.eab_lookups set status = p_status, credits_charged = least(p_credits, l.credits_max), tokens_charged = charge,
    oh_ref = coalesce(left(p_ref, 120), oh_ref), finished_at = now() where id = p_id;
  if back > 0 then
    insert into public.eab_token_ledger (user_id, env, delta, kind, ref) values (l.user_id, l.env, back, 'refund', 'lkr:' || l.id);
    update public.eab_token_balances set balance = balance + back, updated_at = now() where user_id = l.user_id and env = l.env;
  end if;
  select balance into bal from public.eab_token_balances where user_id = l.user_id and env = l.env;
  return jsonb_build_object('result', 'ok', 'tokens_charged', charge, 'refunded', back, 'balance', bal);
end $$;
revoke all on function public.eab_lookup_finish(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.eab_lookup_finish(uuid, integer, text, text) to service_role;

-- Gives back everything a finished lookup charged, once (Oneharta refunded it: a company with no data).
create or replace function public.eab_lookup_refund(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.eab_lookups;
begin
  select * into l from public.eab_lookups where id = p_id for update;
  if l.id is null then return jsonb_build_object('result', 'not-found'); end if;
  if l.status = 'refunded' then return jsonb_build_object('result', 'already'); end if;
  if l.status not in ('done', 'empty') then return jsonb_build_object('result', 'not-finished', 'status', l.status); end if;
  update public.eab_lookups set status = 'refunded', finished_at = now() where id = p_id;
  if coalesce(l.tokens_charged, 0) > 0 then
    insert into public.eab_token_ledger (user_id, env, delta, kind, ref) values (l.user_id, l.env, l.tokens_charged, 'refund', 'lkx:' || l.id);
    update public.eab_token_balances set balance = balance + l.tokens_charged, updated_at = now() where user_id = l.user_id and env = l.env;
  end if;
  return jsonb_build_object('result', 'ok', 'refunded', coalesce(l.tokens_charged, 0));
end $$;
revoke all on function public.eab_lookup_refund(uuid) from public, anon, authenticated;
grant execute on function public.eab_lookup_refund(uuid) to service_role;

-- The server's view of one of an agent's lookups (to reopen a land tax record or check a company), or null when it is not theirs.
create or replace function public.eab_lookup_owned(p_id uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(l) - 'user_id' from public.eab_lookups l where l.id = p_id and l.user_id = p_user
$$;
revoke all on function public.eab_lookup_owned(uuid, uuid) from public, anon, authenticated;
grant execute on function public.eab_lookup_owned(uuid, uuid) to service_role;

-- The signed-in agent's own last 30 lookups (no results, only what they were and what they cost).
create or replace function public.eab_my_lookups() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'summary', l.summary, 'status', l.status,
           'tokens', coalesce(l.tokens_charged, l.tokens_held), 'reopen', l.oh_ref is not null and l.kind in ('ct_search', 'company'),
           'created_at', l.created_at) order by l.created_at desc), '[]'::jsonb)
  from (select * from public.eab_lookups where user_id = auth.uid() order by created_at desc limit 30) l
  where auth.uid() is not null
$$;
revoke all on function public.eab_my_lookups() from public, anon;
grant execute on function public.eab_my_lookups() to authenticated;

commit;
