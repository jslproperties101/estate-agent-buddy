-- Tests for supabase/proposed/20261110200000_oneharta_lookups.sql (Batch C). Run in the SQL editor of the TEST project after
-- 20261103000000_tokens_sandbox.sql and the lookup migration. Everything is rolled back: the block ends by raising
-- 'TEST RESULT ...'. Needs 2+ users in auth.users.
do $test$
declare
  a uuid; b uuid; l1 uuid; l2 uuid; l3 uuid; l4 uuid;
  pass int := 0; fail int := 0; msgs text := '';
  j jsonb; n int;
  bal int;
begin
  select id into a from auth.users order by created_at limit 1;
  select id into b from auth.users where id <> a order by created_at limit 1;
  if a is null or b is null then raise exception 'needs 2 users in auth.users'; end if;
  perform public.eab_tokens_credit(a, 'tokens_20', 20, 500, 'sandbox', 'google_play', 'gp:lk-test-a');

  -- 1. the most a lookup can cost is held first; 3 tokens per credit really charged are kept; the rest comes back at once
  j := public.eab_lookup_begin(a, 'sandbox', 'ct_search', 3, 'Land tax lot 1', 30, 100);
  l1 := (j ->> 'id')::uuid;
  if j ->> 'result' = 'ok' and (j ->> 'held')::int = 9 and (j ->> 'balance')::int = 11 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n1a begin: ' || j::text; end if;
  j := public.eab_lookup_finish(l1, 3, 'done', 'rec-token-1');
  if (j ->> 'tokens_charged')::int = 9 and (j ->> 'refunded')::int = 0 and (j ->> 'balance')::int = 11 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n1b finish found: ' || j::text; end if;
  j := public.eab_lookup_begin(a, 'sandbox', 'infosearch', 1, 'InfoSearch by name', 30, 100);
  l2 := (j ->> 'id')::uuid;
  j := public.eab_lookup_finish(l2, 0, 'empty', null);
  if (j ->> 'tokens_charged')::int = 0 and (j ->> 'refunded')::int = 3 and (j ->> 'balance')::int = 11 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n1c nothing found is free: ' || j::text; end if;
  j := public.eab_lookup_finish(l2, 1, 'done', null);
  if j ->> 'result' = 'already' and (select balance from public.eab_token_balances where user_id = a and env = 'sandbox') = 11 then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n1d finished twice: ' || j::text; end if;
  j := public.eab_lookup_begin(a, 'sandbox', 'sale_unlock', 3, 'Sale names', 30, 100);
  l3 := (j ->> 'id')::uuid;
  j := public.eab_lookup_finish(l3, 99, 'done', '100012345');
  if (j ->> 'tokens_charged')::int = 9 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n1e more credits than the most is capped: ' || j::text; end if;

  -- 2. not enough tokens: refused, nothing held, nothing recorded
  select count(*) into n from public.eab_lookups where user_id = a;
  j := public.eab_lookup_begin(a, 'sandbox', 'company', 3, 'Company 201901000005', 30, 100);   -- balance 2, needs 9
  if j ->> 'result' = 'not-enough-tokens' and (j ->> 'needed')::int = 9 and (j ->> 'balance')::int = 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n2a: ' || j::text; end if;
  if (select count(*) from public.eab_lookups where user_id = a) = n and (select balance from public.eab_token_balances where user_id = a and env = 'sandbox') = 2 then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n2b refused lookup changed something'; end if;
  j := public.eab_lookup_begin(b, 'sandbox', 'infosearch', 1, 'x', 30, 100);
  if j ->> 'result' = 'not-enough-tokens' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n2c agent with no wallet: ' || j::text; end if;
  j := public.eab_lookup_begin(a, 'live', 'infosearch', 1, 'x', 30, 100);
  if j ->> 'result' = 'not-enough-tokens' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n2d test tokens spent as live: ' || j::text; end if;

  -- 3. daily limits in credits (per agent, and for the whole app)
  perform public.eab_tokens_credit(a, 'tokens_100', 100, 2500, 'sandbox', 'google_play', 'gp:lk-test-a2');   -- balance 102
  j := public.eab_lookup_begin(a, 'sandbox', 'ct_search', 3, 'x', 8, 100);   -- used today: 3 + 0 + 3 = 6; +3 > 8
  if j ->> 'result' = 'agent-limit' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n3a agent limit: ' || j::text; end if;
  j := public.eab_lookup_begin(a, 'sandbox', 'infosearch', 1, 'x', 8, 6);    -- the whole app has used 6
  if j ->> 'result' = 'app-limit' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n3b app limit: ' || j::text; end if;
  j := public.eab_lookup_begin(a, 'sandbox', 'infosearch', 1, 'x', 8, 100);
  l4 := (j ->> 'id')::uuid;
  if j ->> 'result' = 'ok' and public.eab_lookup_credits_today(a) = 7 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n3c a pending lookup counts at its most: ' || public.eab_lookup_credits_today(a); end if;
  j := public.eab_lookup_finish(l4, null, 'unknown', null);
  bal := (select balance from public.eab_token_balances where user_id = a and env = 'sandbox');
  if j ->> 'result' = 'unknown' and bal = 99 and public.eab_lookup_credits_today(a) = 7 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n3d no answer keeps the tokens held: ' || j::text || ' ' || bal; end if;

  -- 4. a company Oneharta refunded: everything back, once; only finished lookups
  j := public.eab_lookup_begin(a, 'sandbox', 'company', 3, 'Company 201901000005', 30, 100);
  j := public.eab_lookup_finish((j ->> 'id')::uuid, 3, 'done', '201901000005');
  l2 := (select id from public.eab_lookups where user_id = a and kind = 'company');
  j := public.eab_lookup_refund(l2);
  if (j ->> 'refunded')::int = 9 and (select balance from public.eab_token_balances where user_id = a and env = 'sandbox') = 99 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n4a refund: ' || j::text; end if;
  j := public.eab_lookup_refund(l2);
  if j ->> 'result' = 'already' and (select balance from public.eab_token_balances where user_id = a and env = 'sandbox') = 99 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n4b refunded twice'; end if;
  j := public.eab_lookup_refund(l4);
  if j ->> 'result' = 'not-finished' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n4c refund of an unknown lookup: ' || j::text; end if;

  -- 5. every token change is in the ledger and adds up to the balance
  if (select sum(delta) from public.eab_token_ledger where user_id = a and env = 'sandbox') = 99 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n5a ledger does not add up'; end if;

  -- 6. bad input is refused
  begin perform public.eab_lookup_begin(a, 'sandbox', 'ct_search', 50, 'x', 30, 100); fail := fail + 1; msgs := msgs || E'\n6a 50 credits accepted';
  exception when others then pass := pass + 1; end;
  begin perform public.eab_lookup_begin(a, 'sandbox', 'request_search', 1, 'x', 30, 100); fail := fail + 1; msgs := msgs || E'\n6b unknown kind accepted';
  exception when others then pass := pass + 1; end;
  begin perform public.eab_lookup_finish(l1, 1, 'paid', null); fail := fail + 1; msgs := msgs || E'\n6c unknown status accepted';
  exception when others then pass := pass + 1; end;

  -- 7. the agent sees only their own lookups (no results), and cannot call the paying functions
  if public.eab_lookup_owned(l1, b) is null and (public.eab_lookup_owned(l1, a) ->> 'oh_ref') = 'rec-token-1' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n7a owned'; end if;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.eab_my_lookups();
  if jsonb_array_length(j) = 5 and not (j::text ~ 'rec-token-1') and jsonb_path_exists(j, '$[*] ? (@.kind == "ct_search" && @.reopen == true)') then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n7b own list: ' || left(j::text, 300); end if;
  begin perform public.eab_lookup_begin(a, 'sandbox', 'infosearch', 1, 'x', 30, 100); fail := fail + 1; msgs := msgs || E'\n7c the phone started a paid lookup';
  exception when others then pass := pass + 1; end;
  begin perform public.eab_lookup_finish(l4, 0, 'failed', null); fail := fail + 1; msgs := msgs || E'\n7d the phone refunded itself';
  exception when others then pass := pass + 1; end;
  begin perform 1 from public.eab_lookups; fail := fail + 1; msgs := msgs || E'\n7e the phone read the lookup table';
  exception when others then pass := pass + 1; end;
  reset role;
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if jsonb_array_length(public.eab_my_lookups()) = 0 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n7f another agent sees lookups'; end if;
  reset role;

  raise exception 'TEST RESULT: % passed, % failed%', pass, fail, msgs;
end
$test$;
