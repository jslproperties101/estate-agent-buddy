-- Tests for 20261023000000_admin_batch_005_dashboards.sql. Run in the SQL editor of the TEST project.
-- Everything is rolled back (the block ends by raising 'TEST RESULT ...'). Needs 3+ users in auth.users.
do $test$
declare
  o uuid; v uuid; x uuid;
  pass int := 0; fail int := 0; msgs text := '';
  j jsonb; n bigint; m bigint; today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  acc_before bigint; acc_mid bigint; ws uuid;
begin
  select id into o from auth.users order by created_at limit 1;
  select id into v from auth.users where id <> o order by created_at limit 1;
  select id into x from auth.users u where id not in (o, v)
     and not exists (select 1 from public.eab_admins ad where ad.user_id = u.id)
   order by exists (select 1 from public.eab_usage_events e where e.user_id = u.id and e.at > now() - interval '30 days'), created_at limit 1;
  insert into public.eab_admins (user_id, email, role) select o, email, 'owner' from auth.users where id = o
    on conflict (user_id) do update set role = 'owner', active = true, expires_at = null;
  insert into public.eab_admins (user_id, email, role) select v, email, 'viewer' from auth.users where id = v
    on conflict (user_id) do update set role = 'viewer', active = true, expires_at = null;
  -- test data (rolled back): one stale Available listing, one Booked - pending loan, one Rented - Pending TA Signing,
  -- activity for x 20 days ago only (so x is "at risk"), one language event.
  select coalesce((select mb.workspace_id from public.eab_members mb where mb.user_id = o limit 1), (select w.id from public.eab_workspaces w limit 1)) into ws;
  insert into public.eab_records (user_id, workspace_id, collection, id, data, deleted, updated) values
    (o, ws, 'properties', 'test-b5-stale', jsonb_build_object('status', 'available', 'headline', 'TEST stale', 'created',
        (extract(epoch from now() - interval '100 days') * 1000)::bigint), false, (extract(epoch from now() - interval '100 days') * 1000)::bigint),
    (o, ws, 'properties', 'test-b5-loan', jsonb_build_object('status', 'in_progress', 'bookedStage', 'pending_loan'), false, (extract(epoch from now()) * 1000)::bigint),
    (o, ws, 'properties', 'test-b5-ta', jsonb_build_object('status', 'rented_pending_ta'), false, (extract(epoch from now()) * 1000)::bigint),
    (o, ws, 'properties', 'test-b5-gone', jsonb_build_object('status', 'sold'), true, (extract(epoch from now()) * 1000)::bigint);
  insert into public.eab_usage_events (user_id, at, kind, name, ok, app_version, platform, device) values
    (x, now() - interval '20 days', 'session', 'session.start', true, '9.9.9-test', 'android', 'TEST-PHONE'),
    (o, now() - interval '1 hour', 'language', 'lang.ms', true, '9.9.8-test', 'web', null);
  select count(*) into acc_before from public.eab_admin_access;

  -- ---------- helpers ----------
  if public.eab_dash_status_key('{"status":"in_progress","bookedStage":"pending_loan"}') = 'booked_pending_loan'
     and public.eab_dash_status_key('{"status":"in_progress"}') = 'booked'
     and public.eab_dash_status_key('{"status":"rented_pending_ta"}') = 'rented_pending_ta'
     and public.eab_dash_status_key('{}') = 'none'
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [0 status key]'; end if;

  -- ---------- owner ----------
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  -- 1. growth
  j := public.eab_admin_dash_growth(today - 29, today, 'day');
  execute 'reset role';
  select count(*) into n from auth.users where (created_at at time zone 'Asia/Kuala_Lumpur')::date <= today;
  execute 'set local role authenticated';
  if (j->>'total')::bigint = n and jsonb_array_length(j->'buckets') = 30
     and (j->'buckets'->29->>'running')::bigint = n and (j->>'before')::bigint + (j->>'new')::bigint = n
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1a growth day]'; end if;
  j := public.eab_admin_dash_growth(today - 364, today, 'month');
  if jsonb_array_length(j->'buckets') between 12 and 13 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1b growth month]'; end if;
  -- 2. bad input refused
  begin perform public.eab_admin_dash_growth(today, today - 1, 'day'); fail := fail + 1; msgs := msgs || ' [2a reversed range]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_dash_growth(today - 800, today, 'day'); fail := fail + 1; msgs := msgs || ' [2b long range]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_dash_growth(today - 7, today, 'year'); fail := fail + 1; msgs := msgs || ' [2c bucket]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  -- 3. active users
  j := public.eab_admin_dash_active(today - 29, today);
  if jsonb_array_length(j->'by_day') = 30 and (j->'last'->>'mau')::int >= (j->'last'->>'wau')::int
     and (j->'last'->>'wau')::int >= (j->'last'->>'dau')::int and (j->>'active_in_range')::int >= 1
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [3 active]'; end if;
  -- 4. retention + at-risk list (x was last active 20 days ago)
  j := public.eab_admin_dash_retention(today - 364, today, 'test');
  if jsonb_array_length(j->'retention') = 3 and (j->>'names_hidden')::boolean = false
     and exists (select 1 from jsonb_array_elements(j->'at_risk'->'agents') a where (a->>'user_id')::uuid = x and a->>'reason' = 'no_activity_14d')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [4 retention/at-risk]'; end if;
  -- 5. inactive
  begin perform public.eab_admin_dash_inactive(45, 't'); fail := fail + 1; msgs := msgs || ' [5a days]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_dash_inactive(30, 'test');
  if jsonb_typeof(j->'list') = 'array' and (j->'counts'->>'30')::int >= (j->'counts'->>'60')::int
     and (j->'counts'->>'60')::int >= (j->'counts'->>'90')::int and jsonb_array_length(j->'list') = (j->'counts'->>'30')::int
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5b inactive]'; end if;
  -- 6. devices, versions, language; version list
  j := public.eab_admin_dash_devices(today - 29, today, null, 'test');
  select coalesce(sum((e->>'agents')::int), 0) into n from jsonb_array_elements(j->'versions') e;
  if n = (j->>'agents')::int and exists (select 1 from jsonb_array_elements(j->'versions') e where e->>'app_version' = '9.9.8-test')
     and exists (select 1 from jsonb_array_elements(j->'languages') e where e->>'language' = 'ms') and j->'version_agents' = 'null'::jsonb
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6a devices]'; end if;
  j := public.eab_admin_dash_devices(today - 29, today, '9.9.8-test', 'test');
  if jsonb_array_length(j->'version_agents') = 1 and (j->'version_agents'->0->>'user_id')::uuid = o
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6b version list]'; end if;
  -- 7. listings + pipeline + stale
  j := public.eab_admin_dash_listings(today - 364, today, 60, 'test');
  execute 'reset role';
  select count(*) into n from public.eab_records where collection = 'properties' and not deleted;
  select count(*) into m from public.eab_records where collection = 'properties' and deleted;
  execute 'set local role authenticated';
  if (j->>'total')::bigint = n and (j->>'deleted')::bigint = m
     and jsonb_array_length(j->'pipeline'->'sale') = 4 and jsonb_array_length(j->'pipeline'->'rent') = 2
     and (j->'pipeline'->'sale'->1->>'listings')::int >= 1 and (j->'pipeline'->'rent'->0->>'listings')::int >= 1
     and (j->'by_status'->>'booked_pending_loan')::int >= 1
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [7a listings]'; end if;
  if (j->>'stale_count')::int >= 1 and exists (select 1 from jsonb_array_elements(j->'stale') s where s->>'id' = 'test-b5-stale')
     and not exists (select 1 from jsonb_array_elements(j->'stale') s where s->>'id' = 'test-b5-loan')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [7b stale]'; end if;
  -- 8. usage ranking + heatmap
  j := public.eab_admin_dash_usage(today - 29, today);
  if jsonb_array_length(j->'ranking') >= 1 and jsonb_typeof(j->'not_used') = 'array'
     and not exists (select 1 from jsonb_array_elements(j->'heatmap') h where (h->>'dow')::int not between 1 and 7 or (h->>'hour')::int not between 0 and 23)
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [8 usage]'; end if;
  -- 9. event drill-down
  j := public.eab_admin_dash_events('language', 'lang.ms', today - 1, today, 50, 'test');
  if (j->>'total')::int >= 1 and (j->'events'->0->>'user_id')::uuid = o then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [9 events]'; end if;
  -- 10. lists were written to the access log (at-risk, inactive, version, stale, events = 5)
  execute 'reset role';
  select count(*) into acc_mid from public.eab_admin_access;
  if acc_mid - acc_before = 5 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [10 access rows ' || (acc_mid - acc_before) || ']'; end if;

  -- ---------- viewer: totals only, no names, nothing logged ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.eab_admin_dash_growth(today - 6, today, 'day');
  if jsonb_array_length(j->'buckets') = 7 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [11 viewer growth]'; end if;
  j := public.eab_admin_dash_retention(null, null, 'v');
  if (j->>'names_hidden')::boolean and j->'at_risk'->'agents' = 'null'::jsonb and (j->'at_risk'->>'count')::int >= 1
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [12 viewer at-risk]'; end if;
  j := public.eab_admin_dash_inactive(30, 'v');
  if (j->>'names_hidden')::boolean and j->'list' = 'null'::jsonb then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [13 viewer inactive]'; end if;
  j := public.eab_admin_dash_listings(null, null, 60, 'v');
  if (j->>'names_hidden')::boolean and j->'stale' = 'null'::jsonb and (j->>'stale_count')::int >= 1
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [14 viewer listings]'; end if;
  begin perform public.eab_admin_dash_devices(null, null, '9.9.8-test', 'v'); fail := fail + 1; msgs := msgs || ' [15 viewer version list]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_dash_events('language', 'lang.ms', null, null, 10, 'v'); fail := fail + 1; msgs := msgs || ' [16 viewer events]';
  exception when insufficient_privilege then pass := pass + 1; end;
  j := public.eab_admin_dash_usage(null, null);
  if jsonb_array_length(j->'ranking') >= 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [17 viewer usage]'; end if;
  execute 'reset role';
  select count(*) into n from public.eab_admin_access;
  if n = acc_mid then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [18 viewer logged ' || (n - acc_mid) || ']'; end if;

  -- ---------- not an admin ----------
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.eab_admin_dash_growth(null, null, 'day'); fail := fail + 1; msgs := msgs || ' [19a non-admin]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_dash_listings(null, null, 60, 'x'); fail := fail + 1; msgs := msgs || ' [19b non-admin]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';

  -- ---------- grants ----------
  if not has_function_privilege('anon', 'public.eab_admin_dash_growth(date, date, text)', 'execute')
     and not has_function_privilege('anon', 'public.eab_admin_dash_listings(date, date, integer, text)', 'execute')
     and not has_function_privilege('authenticated', 'public.eab_dash_activity(date, date)', 'execute')
     and not has_function_privilege('authenticated', 'public.eab_dash_names()', 'execute')
     and has_function_privilege('authenticated', 'public.eab_admin_dash_usage(date, date)', 'execute')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [20 grants]'; end if;

  -- ---------- chain still intact ----------
  if (public.eab_admin_check_chain('eab_admin_access')->>'ok')::boolean then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [21 chain]'; end if;

  raise exception 'TEST RESULT: % passed, % failed%', pass, fail, coalesce(nullif(msgs, ''), '');
end $test$;
