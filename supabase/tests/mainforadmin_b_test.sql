-- Tests for 20261021100000_mainforadmin_b_accounts_security.sql (MainForAdmin-B).
-- Run in the SQL editor of the TEST project (or a local copy). One block that ends by raising 'TEST RESULT ...', so
-- EVERY change it makes is rolled back. Needs at least 3 users in auth.users. Good = "TEST RESULT: n passed, 0 failed".
do $test$
declare
  a uuid; o uuid; v uuid; r uuid;          -- agent, owner (admin), someone not on the admin list, regulator without scope
  pass int := 0; fail int := 0; msgs text := '';
  j jsonb; n int; n0 int; ok boolean; t text;
  as_user constant text := 'select set_config(''request.jwt.claims'', json_build_object(''sub'', %L, ''role'', ''authenticated'')::text, true), set_config(''request.jwt.claim.sub'', %L, true)';
begin
  select id into a from auth.users order by created_at limit 1;
  select id into o from auth.users where id <> a order by created_at limit 1;
  select id into v from auth.users where id not in (a, o) order by created_at limit 1;
  select id into r from auth.users where id not in (a, o, v) order by created_at limit 1;
  if v is null then raise exception 'needs at least 3 users'; end if;
  -- setup as database owner: o is an Owner admin (if not already); r (if any) a regulator with no scope
  insert into public.eab_admins (user_id, email, role) select o, email, 'owner' from auth.users where id = o
    on conflict (user_id) do update set role = 'owner', active = true, expires_at = null;
  if r is not null then
    insert into public.eab_admins (user_id, email, role, expires_at) select r, email, 'regulator', now() + interval '1 day' from auth.users where id = r
      on conflict (user_id) do update set role = 'regulator', active = true;
  end if;
  delete from public.eab_admins where user_id in (a, v);
  select count(*) into n0 from public.eab_admin_actions;

  ---------------------------------------------------------------- the agent
  execute format(as_user, a, a); execute 'set local role authenticated';
  j := public.eab_my_account();
  if j->>'status' = 'active' and j->>'company_name' is not null then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1 my_account ' || j::text || ']'; end if;
  begin perform count(*) from public.eab_login_log; fail := fail + 1; msgs := msgs || ' [2 agent read login log]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform count(*) from public.eab_account_status; fail := fail + 1; msgs := msgs || ' [2b agent read status table]';
  exception when insufficient_privilege then pass := pass + 1; end;
  n := public.eab_log_login(jsonb_build_array(
    jsonb_build_object('event', 'sign_in', 'at', now(), 'device_id', 'dev-1', 'platform', 'android', 'app_version', '2.2.0', 'lat', 2.82, 'lng', 101.8, 'acc', 12),
    jsonb_build_object('event', 'sign_in_failed', 'at', now() + interval '3 days', 'device_id', 'dev-1', 'platform', 'weird'),
    jsonb_build_object('event', 'drop table', 'at', now())));
  if n = 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [3 logged ' || n || ' of 2 valid]'; end if;
  begin perform public.eab_set_my_licence('XYZ', '1'); fail := fail + 1; msgs := msgs || ' [4 bad licence type accepted]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_set_my_licence('ren', ' REN 01234 ');
  if j->>'type' = 'REN' and j->>'number' = 'REN 01234' and (j->>'verified')::boolean = false then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5 licence ' || j::text || ']'; end if;
  j := public.eab_accept_terms('1.0', true, 'dev-1');
  if j->'terms'->>'version' = '1.0' and (j->>'marketing')::boolean then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6 terms ' || j::text || ']'; end if;
  j := public.eab_set_marketing(false, 'dev-1');
  if (j->>'marketing')::boolean = false and j->'terms'->>'version' = '1.0' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [7 marketing off]'; end if;
  begin perform public.eab_admin_set_account_status(v, 'suspended', 'x'); fail := fail + 1; msgs := msgs || ' [8 agent suspended someone]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_login_log(a); fail := fail + 1; msgs := msgs || ' [9 agent read admin login log]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';

  ---------------------------------------------------------------- the logs cannot be changed, even by the database owner
  select happened_at <= now() + interval '1 minute' into ok from public.eab_login_log where user_id = a and event = 'sign_in_failed' order by seq desc limit 1;
  if ok then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [10 future time not clamped]'; end if;
  select platform = 'unknown' into ok from public.eab_login_log where user_id = a and event = 'sign_in_failed' order by seq desc limit 1;
  if ok then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [11 unknown platform]'; end if;
  begin update public.eab_login_log set event = 'sign_out' where user_id = a; fail := fail + 1; msgs := msgs || ' [12 login log changed]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin delete from public.eab_terms_acceptance where user_id = a; fail := fail + 1; msgs := msgs || ' [13 terms deleted]';
  exception when insufficient_privilege then pass := pass + 1; end;

  ---------------------------------------------------------------- someone not on the admin list
  execute format(as_user, v, v); execute 'set local role authenticated';
  begin perform public.eab_admin_force_logout(a, 'x'); fail := fail + 1; msgs := msgs || ' [14 non-admin forced logout]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_set_settings('{"support_email":"x@y.z"}'::jsonb, 'x'); fail := fail + 1; msgs := msgs || ' [15 non-admin changed settings]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';

  ---------------------------------------------------------------- a regulator without a scope for this agent
  if r is not null then
    execute format(as_user, r, r); execute 'set local role authenticated';
    begin perform public.eab_admin_login_log(a); fail := fail + 1; msgs := msgs || ' [16 regulator saw an agent outside scope]';
    exception when insufficient_privilege then pass := pass + 1; end;
    begin perform public.eab_admin_set_account_status(a, 'banned', 'x'); fail := fail + 1; msgs := msgs || ' [17 regulator banned]';
    exception when insufficient_privilege then pass := pass + 1; end;
    execute 'reset role';
  end if;

  ---------------------------------------------------------------- the owner (admin)
  execute format(as_user, o, o); execute 'set local role authenticated';
  begin perform public.eab_admin_set_account_status(a, 'suspended', '  '); fail := fail + 1; msgs := msgs || ' [18 no reason accepted]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_set_account_status(a, 'suspended', 'Test: misleading listing');
  if j->>'status' = 'suspended' and j->>'force_logout_after' is not null then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [19 suspend ' || j::text || ']'; end if;
  if not public.eab_account_ok(a) then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [20 suspended account still ok]'; end if;
  j := public.eab_admin_verify_licence(a, true, 'Checked on the Board website');
  if (j->>'verified')::boolean then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [21 verify]'; end if;
  j := public.eab_admin_agent(a);
  if j->>'status' = 'suspended' and j->'licence'->>'number' = 'REN 01234' and j->'terms'->>'version' = '1.0' and j->'last_login'->>'event' = 'sign_in'
  then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [22 agent view ' || left(j::text, 300) || ']'; end if;
  j := public.eab_admin_login_log(a, 50);
  if jsonb_array_length(j) >= 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [23 login log rows]'; end if;
  j := public.eab_admin_terms_log(a);
  if jsonb_array_length(j) >= 3 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [24 terms log rows]'; end if;
  j := public.eab_admin_set_settings('{"support_email":"support@example.com","company_name":""}'::jsonb, 'Test settings');
  if j->>'support_email' = 'support@example.com' and j->>'company_name' <> '' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [25 settings ' || j::text || ']'; end if;
  j := public.eab_admin_set_account_status(a, 'active', 'Test: cleared');
  if public.eab_account_ok(a) then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [26 re-activated account not ok]'; end if;
  j := public.eab_admin_force_logout(a, 'Test: lost phone');
  if j->>'force_logout_after' is not null and j->>'status' = 'active' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [27 force logout]'; end if;
  execute 'reset role';

  ---------------------------------------------------------------- back to the agent: sees it all, licence change needs a new check
  execute format(as_user, a, a); execute 'set local role authenticated';
  j := public.eab_my_account();
  if j->>'support_email' = 'support@example.com' and j->>'force_logout_after' is not null and (j->'licence'->>'verified')::boolean
  then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [28 agent view ' || j::text || ']'; end if;
  j := public.eab_set_my_licence('REN', 'REN 99999');
  if (j->>'verified')::boolean = false then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [29 changed licence still verified]'; end if;
  execute 'reset role';

  ---------------------------------------------------------------- every admin change is in the tamper-proof admin log
  select count(*) - n0 into n from public.eab_admin_actions;
  if n = 5 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [30 admin actions logged ' || n || ' of 5]'; end if;
  j := public.eab_admin_check_chain('eab_admin_actions');
  if (j->>'ok')::boolean then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [31 hash chain ' || j::text || ']'; end if;

  raise exception 'TEST RESULT: % passed, % failed%', pass, fail, msgs;
end $test$;
