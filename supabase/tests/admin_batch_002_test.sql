-- Tests for 20261021120000_admin_batch_002_reads.sql together with the MainForAdmin-B admin functions the
-- AdminBatch002 screens use. Run in the SQL editor of the TEST project. Everything is rolled back (the block ends by
-- raising 'TEST RESULT ...'). Needs 3+ users in auth.users, one with records.
do $test$
declare
  a uuid; o uuid; r uuid; v uuid; em_a text;
  pass int := 0; fail int := 0; msgs text := '';
  j jsonb; n int;
  as_user text := 'set local role authenticated';
begin
  select user_id into a from public.eab_records group by user_id order by count(*) desc limit 1;
  select id into o from auth.users where id <> a order by created_at limit 1;
  select id into r from auth.users where id not in (a, o) order by created_at limit 1;
  select id into v from auth.users where id not in (a, o, r) order by created_at limit 1;
  if v is null then v := r; end if;
  select email into em_a from auth.users where id = a;
  -- roles for this test only (everything is rolled back at the end)
  insert into public.eab_admins (user_id, email, role) select o, email, 'owner' from auth.users where id = o
    on conflict (user_id) do update set role = 'owner', active = true, expires_at = null;
  insert into public.eab_admins (user_id, email, role, expires_at) select r, email, 'regulator', now() + interval '1 day' from auth.users where id = r
    on conflict (user_id) do update set role = 'regulator', active = true, expires_at = now() + interval '1 day';
  update public.eab_admins set active = false where user_id = v and v not in (o, r);
  -- sample login history for agent a (as the database owner, like the main app's eab_log_login would)
  insert into public.eab_login_log (happened_at, user_id, event, platform) values
    (now() - interval '1 day', a, 'sign_in_failed', 'android'), (now() - interval '1 day', a, 'sign_in_failed', 'android'),
    (now() - interval '1 day', a, 'locked_out', 'android'), (now() - interval '2 hours', a, 'sign_in', 'android');
  insert into public.eab_licences (user_id, type, number) values (a, 'REN', 'REN 99999') on conflict (user_id) do update set type = 'REN', number = 'REN 99999', verified = false;

  -- 1. owner: settings readable
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  execute as_user;
  j := public.eab_admin_settings();
  if j ? 'company_name' and not (j ? 'id') then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1 settings]'; end if;
  -- 2. list all includes agent a with licence and last login
  j := public.eab_admin_agents('all', em_a);
  if jsonb_array_length(j) = 1 and j->0->'licence'->>'number' = 'REN 99999' and j->0->'last_login'->>'platform' = 'android'
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2 list all ' || coalesce(j::text, 'null') || ']'; end if;
  -- 3. security filter: a is listed with 2 failed and 1 lockout
  j := public.eab_admin_agents('security');
  if exists (select 1 from jsonb_array_elements(j) e where (e->>'user_id')::uuid = a and (e->>'failed_30d')::int = 2 and (e->>'lockouts_30d')::int = 1)
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [3 security]'; end if;
  -- 4. licence filter lists a, unverified
  j := public.eab_admin_agents('licence');
  if exists (select 1 from jsonb_array_elements(j) e where (e->>'user_id')::uuid = a and not (e->'licence'->>'verified')::boolean)
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [4 licence]'; end if;
  -- 5. verify licence → verified; action logged with reason
  j := public.eab_admin_verify_licence(a, true, 'Checked on the board website', 't');
  if (j->>'verified')::boolean then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5 verify]'; end if;
  -- 6. not_active filter empty for a, then suspend → listed with reason
  j := public.eab_admin_agents('not_active', em_a);
  if jsonb_array_length(j) = 0 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6a not_active before]'; end if;
  j := public.eab_admin_set_account_status(a, 'suspended', 'Misleading listing under review', false, 't');
  j := public.eab_admin_agents('not_active', em_a);
  if jsonb_array_length(j) = 1 and j->0->>'status' = 'suspended' and j->0->>'status_reason' = 'Misleading listing under review'
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6b suspended listed]'; end if;
  -- 7. agent profile shows suspended + licence text
  j := public.eab_admin_agent(a);
  if j->>'status' = 'suspended' and j->>'licence' like '%REN 99999%(verified)%' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [7 profile ' || coalesce(j->>'status','') || ' ' || coalesce(j->>'licence','') || ']'; end if;
  -- 8. login log readable
  j := public.eab_admin_login_log(a, 50);
  if jsonb_array_length(j) >= 4 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [8 login log]'; end if;
  -- 9. bad filter refused
  begin perform public.eab_admin_agents('everything'); fail := fail + 1; msgs := msgs || ' [9 bad filter accepted]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  execute 'reset role';
  -- 10. actions + access logged, chain intact
  select count(*) into n from public.eab_admin_actions where target_user = a and action in ('licence_verified', 'account_status') and reason is not null;
  if n = 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [10 actions ' || n || ']'; end if;
  select count(*) into n from public.eab_admin_access where admin_user = o and kind = 'search' and target_ref like 'agents list:%';
  if n >= 4 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [10b access ' || n || ']'; end if;
  if (public.eab_admin_check_chain('eab_admin_actions')->>'ok')::boolean and (public.eab_admin_check_chain('eab_admin_access')->>'ok')::boolean
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [10c chain]'; end if;

  -- 11. regulator without scope sees nobody; with scope sees only that agent; cannot suspend or change settings
  perform set_config('request.jwt.claims', json_build_object('sub', r, 'role', 'authenticated')::text, true);
  execute as_user;
  j := public.eab_admin_agents('all');
  if jsonb_array_length(j) = 0 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [11a regulator saw ' || jsonb_array_length(j) || ']'; end if;
  execute 'reset role';
  insert into public.eab_admin_scopes (admin_user, agent_user, expires_at, created_by, case_ref) values (r, a, now() + interval '1 day', o, 'TEST');
  execute as_user;
  j := public.eab_admin_agents('all');
  if jsonb_array_length(j) = 1 and (j->0->>'user_id')::uuid = a then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [11b scope]'; end if;
  begin perform public.eab_admin_set_account_status(a, 'active', 'x', false, 't'); fail := fail + 1; msgs := msgs || ' [11c regulator changed status]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_settings(); fail := fail + 1; msgs := msgs || ' [11d regulator read settings]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';

  -- 12. viewer: settings yes, agents list no
  update public.eab_admins set role = 'viewer', expires_at = null where user_id = r;
  execute as_user;
  begin perform public.eab_admin_settings(); pass := pass + 1;
  exception when others then fail := fail + 1; msgs := msgs || ' [12a viewer settings]'; end;
  begin perform public.eab_admin_agents('all'); fail := fail + 1; msgs := msgs || ' [12b viewer listed agents]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';

  -- 13. not on the list: refused; anon: refused
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  if v <> r then
    execute as_user;
    begin perform public.eab_admin_agents('all'); fail := fail + 1; msgs := msgs || ' [13 outsider listed]';
    exception when insufficient_privilege then pass := pass + 1; end;
    execute 'reset role';
  else pass := pass + 1; end if;
  execute 'set local role anon';
  begin perform public.eab_admin_settings(); fail := fail + 1; msgs := msgs || ' [13b anon]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';

  raise exception 'TEST RESULT: % passed, % failed.%', pass, fail, msgs;
end
$test$;
