-- Tests for supabase/proposed/20261103000000_tokens_sandbox.sql (Batch B, Ai Buddy Tokens) with the Batch D pack bonus
-- (20261111100000_token_pack_bonus.sql: 20 / 105 / 440 / 1,150 tokens) applied after it. Run in the SQL editor of the TEST
-- project, after the migration. Everything is rolled back: the block ends by raising 'TEST RESULT ...'. Needs 2+ users in
-- auth.users.
do $test$
declare
  a uuid; b uuid;
  pass int := 0; fail int := 0; msgs text := '';
  r text; n int; j jsonb;
begin
  select id into a from auth.users order by created_at limit 1;
  select id into b from auth.users where id <> a order by created_at limit 1;
  if a is null or b is null then raise exception 'needs 2 users in auth.users'; end if;

  -- 1. each pack credits exactly its own tokens, once per purchase
  r := public.eab_tokens_credit(a, 'tokens_20', 20, 500, 'sandbox', 'google_play', 'gp:t1');
  if r = 'applied' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n1a credit: ' || r; end if;
  r := public.eab_tokens_credit(a, 'tokens_20', 20, 500, 'sandbox', 'google_play', 'gp:t1');
  if r = 'duplicate' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n1b same purchase again: ' || r; end if;
  if (select balance from public.eab_token_balances where user_id = a and env = 'sandbox') = 20 then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n1c balance after a duplicate is not 20'; end if;
  r := public.eab_tokens_credit(a, 'tokens_100', 105, 2500, 'sandbox', 'google_play', 'gp:t2');
  r := public.eab_tokens_credit(a, 'tokens_400', 440, 10000, 'sandbox', 'google_play', 'gp:t3');
  r := public.eab_tokens_credit(a, 'tokens_1000', 1150, 25000, 'sandbox', 'google_play', 'gp:t4');
  if (select balance from public.eab_token_balances where user_id = a and env = 'sandbox') = 1715 then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n1d four packs do not add up to 1715'; end if;
  select count(*) into n from public.eab_token_ledger where user_id = a;
  if n = 4 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n1e ledger rows: ' || n; end if;

  begin
    perform public.eab_tokens_credit(a, 'tokens_400', 400, 10000, 'sandbox', 'google_play', 'gp:old400');
    fail := fail + 1; msgs := msgs || E'\n1f the old count without the bonus was accepted';
  exception when others then pass := pass + 1; end;

  -- 2. test-mode tokens never become live tokens, and one agent's purchase never reaches another
  if not exists (select 1 from public.eab_token_balances where user_id = a and env = 'live') then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n2a sandbox purchase created a live balance'; end if;
  if not exists (select 1 from public.eab_token_balances where user_id = b) then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n2b another agent got tokens'; end if;
  r := public.eab_tokens_credit(b, 'tokens_20', 20, 500, 'sandbox', 'google_play', 'gp:t1');
  if r = 'duplicate' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n2c the same purchase credited a second agent: ' || r; end if;

  -- 3. anything that is not exactly one of the four packs is refused
  begin
    perform public.eab_tokens_credit(a, 'tokens_20', 2000, 500, 'sandbox', 'google_play', 'gp:x1');
    fail := fail + 1; msgs := msgs || E'\n3a more tokens than the pack accepted';
  exception when others then pass := pass + 1; end;
  begin
    perform public.eab_tokens_credit(a, 'tokens_100', 100, 1, 'sandbox', 'google_play', 'gp:x2');
    fail := fail + 1; msgs := msgs || E'\n3b a wrong price accepted';
  exception when others then pass := pass + 1; end;
  begin
    perform public.eab_tokens_credit(a, 'tokens_free', 50, 0, 'sandbox', 'google_play', 'gp:x3');
    fail := fail + 1; msgs := msgs || E'\n3c unknown pack accepted';
  exception when others then pass := pass + 1; end;
  begin
    perform public.eab_tokens_credit(a, 'tokens_20', 20, 500, 'sandbox', 'stripe', 'gp:x4');
    fail := fail + 1; msgs := msgs || E'\n3d tokens by card accepted';
  exception when others then pass := pass + 1; end;
  begin
    perform public.eab_tokens_credit(a, 'tokens_20', 20, 500, 'sandbox', 'google_play', '');
    fail := fail + 1; msgs := msgs || E'\n3e empty purchase reference accepted';
  exception when others then pass := pass + 1; end;
  begin
    perform public.eab_tokens_credit(a, 'tokens_20', 20, 500, 'prod', 'google_play', 'gp:x5');
    fail := fail + 1; msgs := msgs || E'\n3f unknown environment accepted';
  exception when others then pass := pass + 1; end;
  r := public.eab_tokens_credit('00000000-0000-0000-0000-000000000000', 'tokens_20', 20, 500, 'sandbox', 'google_play', 'gp:x6');
  if r = 'unknown-user' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n3g unknown user: ' || r; end if;
  begin
    update public.eab_token_balances set balance = -1 where user_id = a and env = 'sandbox';
    fail := fail + 1; msgs := msgs || E'\n3h a negative balance was stored';
  exception when others then pass := pass + 1; end;

  -- 4. the phone reads only its own wallet, and cannot write to it or call the credit function
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.eab_my_tokens();
  if (j -> 'balances' ->> 'sandbox')::int = 1715 and jsonb_array_length(j -> 'history') = 4
     and (j -> 'history' -> 0 ->> 'pack_id') = 'tokens_1000' then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n4a own wallet: ' || coalesce(j::text, 'null'); end if;
  begin
    perform public.eab_tokens_credit(a, 'tokens_20', 20, 500, 'sandbox', 'google_play', 'gp:self');
    fail := fail + 1; msgs := msgs || E'\n4b the phone credited itself';
  exception when others then pass := pass + 1; end;
  begin
    perform 1 from public.eab_token_balances;
    fail := fail + 1; msgs := msgs || E'\n4c the phone read the balances table directly';
  exception when others then pass := pass + 1; end;
  begin
    insert into public.eab_token_ledger (user_id, env, delta, kind) values (a, 'sandbox', 999, 'adjust');
    fail := fail + 1; msgs := msgs || E'\n4d the phone wrote to the ledger';
  exception when others then pass := pass + 1; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.eab_my_tokens();
  if j -> 'balances' = '{}'::jsonb and jsonb_array_length(j -> 'history') = 0 then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n4e another agent sees: ' || coalesce(j::text, 'null'); end if;
  reset role;

  raise exception 'TEST RESULT: % passed, % failed%', pass, fail, msgs;
end
$test$;
