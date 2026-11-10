-- Tests for supabase/proposed/20261110300000_admin_lookups_tokens.sql (Batch D). Run in the SQL editor of the TEST project
-- after the token, lookup and admin files. Everything is rolled back: the block ends by raising 'TEST RESULT ...'.
-- Needs an Owner and one other user in auth.users; the test adds them to eab_admins itself (rolled back).
do $test$
declare
  own uuid; agent uuid; adm uuid; vw uuid;
  pass int := 0; fail int := 0; msgs text := '';
  j jsonb; lid uuid; lid2 uuid; n int; acts int;
begin
  select id into own from auth.users order by created_at limit 1;
  select id into agent from auth.users where id <> own order by created_at limit 1;
  select id into adm from auth.users where id not in (own, agent) order by created_at limit 1;
  select id into vw from auth.users where id not in (own, agent, adm) order by created_at limit 1;
  if own is null or agent is null or adm is null or vw is null then raise exception 'needs 4 users in auth.users'; end if;
  delete from public.eab_admins where user_id in (own, adm, vw);
  insert into public.eab_admins (user_id, email, role, active) values (own, 'o@t', 'owner', true), (adm, 'a@t', 'admin', true), (vw, 'v@t', 'viewer', true);
  perform public.eab_tokens_credit(agent, 'tokens_20', 20, 500, 'sandbox', 'google_play', 'gp:adm-test-1');
  j := public.eab_lookup_begin(agent, 'sandbox', 'ct_search', 3, 'Land tax lot 1', 30, 100); lid := (j ->> 'id')::uuid;
  perform public.eab_lookup_finish(lid, null, 'unknown', null);                          -- Oneharta never answered: 9 held
  j := public.eab_lookup_begin(agent, 'sandbox', 'infosearch', 1, 'InfoSearch by name', 30, 100); lid2 := (j ->> 'id')::uuid;
  update public.eab_lookups set created_at = now() - interval '11 minutes' where id = lid2;   -- left pending: stuck
  select count(*) into acts from public.eab_admin_actions;

  -- 1. the owner sees every lookup; "attention" lists the unknown and the stuck one
  perform set_config('request.jwt.claim.sub', own::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.eab_admin_lookups('attention');
  if jsonb_array_length(j) = 2 and jsonb_path_exists(j, '$[*] ? (@.stuck == true)') then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n1a attention: ' || left(j::text, 200); end if;
  begin perform 1 from public.eab_token_balances; fail := fail + 1; msgs := msgs || E'\n1b an admin read the balances table directly (only the functions may)';
  exception when others then pass := pass + 1; end;
  reset role;
  if (select balance from public.eab_token_balances where user_id = agent and env = 'sandbox') = 8 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n1c start balance not 8'; end if;

  -- 2. settling: "charged 3" keeps 9; "not charged" gives everything back; each once, each logged with a reason
  set local role authenticated;
  begin perform public.eab_admin_lookup_settle(lid, 'charged', 3, 'ok'); fail := fail + 1; msgs := msgs || E'\n2a a short reason accepted';
  exception when others then pass := pass + 1; end;
  begin perform public.eab_admin_lookup_settle(lid, 'charged', 4, 'checked the Oneharta call log'); fail := fail + 1; msgs := msgs || E'\n2b more than the most accepted';
  exception when others then pass := pass + 1; end;
  j := public.eab_admin_lookup_settle(lid, 'charged', 3, 'Oneharta call log shows 3 credits');
  if (j ->> 'tokens_charged')::int = 9 and (j ->> 'refunded')::int = 0 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n2c charged: ' || j::text; end if;
  j := public.eab_admin_lookup_settle(lid2, 'not_charged', null, 'not in the Oneharta call log');
  if (j ->> 'refunded')::int = 3 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n2d not charged: ' || j::text; end if;
  begin perform public.eab_admin_lookup_settle(lid2, 'not_charged', null, 'second time round'); fail := fail + 1; msgs := msgs || E'\n2e settled twice';
  exception when others then pass := pass + 1; end;
  reset role;
  if (select balance from public.eab_token_balances where user_id = agent and env = 'sandbox') = 11 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n2f balance after settling not 11'; end if;
  if (select count(*) from public.eab_admin_actions) = acts + 2
     and exists (select 1 from public.eab_admin_actions where action = 'lookup_settle' and reason = 'Oneharta call log shows 3 credits') then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n2g settle not logged'; end if;

  -- 3. token adjust: owner only, reason, never below zero, ledger + log
  set local role authenticated;
  j := public.eab_admin_token_adjust(agent, 'sandbox', 5, 'goodwill after a slow search');
  if (j ->> 'balance')::int = 16 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n3a add: ' || j::text; end if;
  begin perform public.eab_admin_token_adjust(agent, 'sandbox', -17, 'take back too much'); fail := fail + 1; msgs := msgs || E'\n3b below zero accepted';
  exception when others then pass := pass + 1; end;
  begin perform public.eab_admin_token_adjust(agent, 'sandbox', 0, 'nothing at all'); fail := fail + 1; msgs := msgs || E'\n3c zero accepted';
  exception when others then pass := pass + 1; end;
  j := public.eab_admin_token_adjust(agent, 'live', 2, 'real tokens for a real refund');
  if (j ->> 'balance')::int = 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n3d live: ' || j::text; end if;
  j := public.eab_admin_token_history(agent);
  if jsonb_array_length(j) >= 6 and (j -> 0 ->> 'kind') = 'adjust' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n3e history: ' || left(j::text, 200); end if;
  j := public.eab_admin_tokens(null);
  if jsonb_path_exists(j, '$[*] ? (@.sandbox == 16 && @.live == 2)') then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n3f balances: ' || left(j::text, 200); end if;
  j := public.eab_admin_lookup_spend(7);
  if (j ->> 'today_credits')::int = 3 and jsonb_array_length(j -> 'tokens_sold') >= 1 and jsonb_array_length(j -> 'today_top') = 1 then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n3g spend: ' || left(j::text, 300); end if;
  reset role;
  if (select sum(delta) from public.eab_token_ledger where user_id = agent and env = 'sandbox') = 16 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n3h ledger does not add up'; end if;
  if exists (select 1 from public.eab_admin_access where kind = 'view_records' and target_user = agent and target_ref = 'token_history') then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n3i viewing history not logged'; end if;

  -- 4. an Admin may settle but not adjust; a Viewer sees only the spend; an agent sees nothing
  perform set_config('request.jwt.claim.sub', adm::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.eab_admin_token_adjust(agent, 'sandbox', 5, 'admin tries to add'); fail := fail + 1; msgs := msgs || E'\n4a an admin adjusted tokens';
  exception when others then pass := pass + 1; end;
  if jsonb_array_length(public.eab_admin_lookups(null)) = 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n4b admin list'; end if;
  reset role;
  perform set_config('request.jwt.claim.sub', vw::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', vw, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (public.eab_admin_lookup_spend(7) ->> 'today_credits')::int = 3 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n4c viewer spend'; end if;
  begin perform public.eab_admin_lookups(null); fail := fail + 1; msgs := msgs || E'\n4d a viewer saw lookups';
  exception when others then pass := pass + 1; end;
  reset role;
  perform set_config('request.jwt.claim.sub', agent::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.eab_admin_tokens(null); fail := fail + 1; msgs := msgs || E'\n4e an agent saw balances';
  exception when others then pass := pass + 1; end;
  begin perform public.eab_admin_lookup_settle(lid, 'not_charged', null, 'agent refunds self'); fail := fail + 1; msgs := msgs || E'\n4f an agent settled';
  exception when others then pass := pass + 1; end;
  reset role;

  raise exception 'TEST RESULT: % passed, % failed%', pass, fail, msgs;
end
$test$;
