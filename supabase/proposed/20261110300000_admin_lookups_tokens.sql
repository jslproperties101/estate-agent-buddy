-- Batch D (10 Nov 2026): Admin EAB tools for Oneharta lookups and Ai Buddy Tokens.
-- PROPOSED: not applied to any project. Needs the Admin EAB foundation (eab_admin_guard, eab_admin_write_action,
-- eab_admin_write_access), 20261103000000_tokens_sandbox.sql and 20261110200000_oneharta_lookups.sql. Safe to run twice.
-- Rollback: 20261110300000_admin_lookups_tokens_rollback.sql
--
--   eab_admin_lookups          owner / admin / compliance: every agent's lookups (newest first), "stuck" ones flagged
--   eab_admin_lookup_settle    owner / admin: settle a lookup Oneharta never answered ("unknown"), or one left pending for
--                              more than 10 minutes, after checking Oneharta's call log: "charged N credits" (keeps 3 x N
--                              tokens, gives the rest back) or "not charged" (gives everything back). Reason required.
--   eab_admin_tokens           owner / admin / compliance: every agent's token balances (test and real kept apart)
--   eab_admin_token_history    owner / admin / compliance: one agent's last 100 token changes (logged as a view)
--   eab_admin_token_adjust     OWNER only: add or take tokens (goodwill, a mistake), never below zero. Reason required.
--   eab_admin_lookup_spend     owner / admin / compliance / viewer: Oneharta credits used per Malaysia day, tokens charged
--                              for them, tokens sold, and today's top agents.
-- Every change writes the hash-chained admin action log (who, when, reason, before and after). No lookup results are kept,
-- so none can be shown here.
begin;

create or replace function public.eab_admin_lookups(p_status text default null, p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select l.id, l.user_id, u.email, l.env, l.kind, l.summary, l.status, l.credits_max, l.credits_charged, l.tokens_held, l.tokens_charged,
             l.created_at, l.finished_at,
             (l.status = 'pending' and l.created_at < now() - interval '10 minutes') as stuck
        from public.eab_lookups l left join auth.users u on u.id = l.user_id
       where p_status is null
          or (p_status = 'attention' and (l.status = 'unknown' or (l.status = 'pending' and l.created_at < now() - interval '10 minutes')))
          or l.status = p_status
       order by l.created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) x), '[]'::jsonb);
end $$;

create or replace function public.eab_admin_lookup_settle(p_id uuid, p_outcome text, p_credits integer, p_reason text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare before public.eab_lookups; res jsonb; after jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'a reason of at least 5 characters is required' using errcode = '22023'; end if;
  if p_outcome not in ('charged', 'not_charged') then raise exception 'outcome must be charged or not_charged' using errcode = '22023'; end if;
  select * into before from public.eab_lookups where id = p_id for update;
  if before.id is null then raise exception 'unknown lookup' using errcode = '22023'; end if;
  if not (before.status = 'unknown' or (before.status = 'pending' and before.created_at < now() - interval '10 minutes')) then
    raise exception 'only a lookup with no answer, or one pending for more than 10 minutes, can be settled' using errcode = '22023';
  end if;
  if p_outcome = 'charged' and (p_credits is null or p_credits < 1 or p_credits > before.credits_max) then
    raise exception 'credits charged must be between 1 and %', before.credits_max using errcode = '22023';
  end if;
  update public.eab_lookups set status = 'pending' where id = p_id;
  res := public.eab_lookup_finish(p_id, case when p_outcome = 'charged' then p_credits else 0 end,
                                  case when p_outcome = 'charged' then 'done' else 'failed' end, null);
  select to_jsonb(l) into after from public.eab_lookups l where id = p_id;
  perform public.eab_admin_write_action('lookup_settle', before.user_id, p_id::text, btrim(p_reason), to_jsonb(before), after || jsonb_build_object('result', res), p_device);
  return res;
end $$;

create or replace function public.eab_admin_tokens(p_query text default null, p_limit integer default 200) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.last_change desc nulls last) from (
      select b.user_id, u.email,
             max(b.balance) filter (where b.env = 'sandbox') as sandbox, max(b.balance) filter (where b.env = 'live') as live,
             max(b.updated_at) as last_change
        from public.eab_token_balances b left join auth.users u on u.id = b.user_id
       where p_query is null or btrim(p_query) = '' or u.email ilike '%' || btrim(p_query) || '%'
       group by b.user_id, u.email
       order by max(b.updated_at) desc nulls last limit least(greatest(coalesce(p_limit, 200), 1), 1000)) x), '[]'::jsonb);
end $$;

create or replace function public.eab_admin_token_history(p_user uuid, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.id desc), '[]'::jsonb) into out from (
    select l.id, l.env, l.delta, l.kind, l.pack_id, l.provider, l.ref, l.amount_cents, l.created_at
      from public.eab_token_ledger l where l.user_id = p_user order by l.id desc limit 100) x;
  perform public.eab_admin_write_access('view_records', p_user, 'token_history', jsonb_build_object('rows', jsonb_array_length(out)), p_device);
  return out;
end $$;

create or replace function public.eab_admin_token_adjust(p_user uuid, p_env text, p_delta integer, p_reason text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare bal integer; ref text := 'adm:' || gen_random_uuid();
begin
  perform public.eab_admin_guard(array['owner']);
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'a reason of at least 5 characters is required' using errcode = '22023'; end if;
  if p_env not in ('sandbox', 'live') then raise exception 'env must be sandbox or live' using errcode = '22023'; end if;
  if p_delta is null or p_delta = 0 or abs(p_delta) > 10000 then raise exception 'the change must be between -10000 and 10000, not 0' using errcode = '22023'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'unknown agent' using errcode = '22023'; end if;
  insert into public.eab_token_balances (user_id, env, balance) values (p_user, p_env, 0) on conflict (user_id, env) do nothing;
  select balance into bal from public.eab_token_balances where user_id = p_user and env = p_env for update;
  if bal + p_delta < 0 then raise exception 'this would take the balance below zero (balance %)', bal using errcode = '22023'; end if;
  insert into public.eab_token_ledger (user_id, env, delta, kind, ref) values (p_user, p_env, p_delta, 'adjust', ref);
  update public.eab_token_balances set balance = balance + p_delta, updated_at = now() where user_id = p_user and env = p_env;
  perform public.eab_admin_write_action('token_adjust', p_user, ref, btrim(p_reason),
    jsonb_build_object('env', p_env, 'balance', bal), jsonb_build_object('env', p_env, 'balance', bal + p_delta, 'delta', p_delta), p_device);
  return jsonb_build_object('balance', bal + p_delta, 'ref', ref);
end $$;

-- Malaysia day of a timestamp.
create or replace function public.eab_my_day(p_at timestamptz) returns date language sql immutable as $$ select (p_at at time zone 'Asia/Kuala_Lumpur')::date $$;

create or replace function public.eab_admin_lookup_spend(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d integer := least(greatest(coalesce(p_days, 30), 1), 366); since date := public.eab_my_day(now()) - (least(greatest(coalesce(p_days, 30), 1), 366) - 1);
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  return jsonb_build_object(
    'days', d,
    'by_day', coalesce((select jsonb_agg(to_jsonb(x) order by x.day desc) from (
        select public.eab_my_day(l.created_at) as day, l.env,
               count(*) as lookups,
               coalesce(sum(l.credits_charged) filter (where l.status in ('done', 'empty')), 0) as credits,
               coalesce(sum(l.tokens_charged) filter (where l.status in ('done', 'empty')), 0) as tokens,
               count(*) filter (where l.status = 'unknown' or (l.status = 'pending' and l.created_at < now() - interval '10 minutes')) as attention,
               coalesce(sum(l.credits_max) filter (where l.status in ('unknown', 'pending')), 0) as credits_held
          from public.eab_lookups l where public.eab_my_day(l.created_at) >= since
         group by 1, 2) x), '[]'::jsonb),
    'tokens_sold', coalesce((select jsonb_agg(to_jsonb(x) order by x.day desc) from (
        select public.eab_my_day(t.created_at) as day, t.env, sum(t.delta) as tokens, sum(t.amount_cents) as usd_cents
          from public.eab_token_ledger t where t.kind = 'purchase' and public.eab_my_day(t.created_at) >= since
         group by 1, 2) x), '[]'::jsonb),
    'today_credits', public.eab_lookup_credits_today(null),
    'today_top', coalesce((select jsonb_agg(to_jsonb(x) order by x.credits desc) from (
        select l.user_id, u.email, public.eab_lookup_credits_today(l.user_id) as credits, count(*) as lookups
          from public.eab_lookups l left join auth.users u on u.id = l.user_id
         where public.eab_my_day(l.created_at) = public.eab_my_day(now())
         group by l.user_id, u.email order by 3 desc limit 10) x), '[]'::jsonb));
end $$;

do $$ declare f text; begin
  foreach f in array array['eab_admin_lookups(text, integer)', 'eab_admin_lookup_settle(uuid, text, integer, text, text)', 'eab_admin_tokens(text, integer)',
                           'eab_admin_token_history(uuid, text)', 'eab_admin_token_adjust(uuid, text, integer, text, text)', 'eab_admin_lookup_spend(integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);   -- the role check inside decides
  end loop;
end $$;
revoke all on function public.eab_my_day(timestamptz) from public, anon;

commit;
