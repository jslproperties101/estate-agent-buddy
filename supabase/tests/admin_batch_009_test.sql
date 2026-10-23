-- Tests for 20261027000000_admin_batch_009_agents.sql. Run in the SQL editor of the TEST project (or a local copy).
-- Everything is rolled back (the block ends by raising 'TEST RESULT ...'). Makes its own test users inside the block.
do $test$
declare
  o uuid := gen_random_uuid(); a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); v uuid := gen_random_uuid(); g uuid := gen_random_uuid();
  x uuid := gen_random_uuid(); y uuid := gen_random_uuid(); z uuid := gen_random_uuid(); ws uuid := gen_random_uuid();
  pass int := 0; fail int := 0; msgs text := '';
  j jsonb; k jsonb; n bigint; ref text; bid uuid; today date := (now() at time zone 'Asia/Kuala_Lumpur')::date; many uuid[];
begin
  insert into auth.users (id, email, created_at, raw_user_meta_data) values
    (o, 'b9-owner@test.invalid', now() - interval '60 days', '{}'), (a, 'b9-admin@test.invalid', now() - interval '60 days', '{}'),
    (c, 'b9-compliance@test.invalid', now() - interval '60 days', '{}'), (v, 'b9-viewer@test.invalid', now() - interval '60 days', '{}'),
    (g, 'b9-regulator@test.invalid', now() - interval '60 days', '{}'),
    (x, 'b9-agent-x@test.invalid', now(), '{"full_name": "Agent Ex"}'), (y, 'b9-agent-y@test.invalid', now(), '{}'),
    (z, 'b9-agent-z@test.invalid', now(), '{}');
  insert into public.eab_admins (user_id, email, role) values
    (o, 'b9-owner@test.invalid', 'owner'), (a, 'b9-admin@test.invalid', 'admin'), (c, 'b9-compliance@test.invalid', 'compliance'),
    (v, 'b9-viewer@test.invalid', 'viewer'), (g, 'b9-regulator@test.invalid', 'regulator');
  insert into public.eab_workspaces (id, name, created_by) values (ws, 'B9 test', x);
  insert into public.eab_members (workspace_id, user_id, email, role) values (ws, x, 'b9-agent-x@test.invalid', 'owner');
  -- x: one complete listing (Sold) and one with only the type
  insert into public.eab_records (user_id, workspace_id, collection, id, data, deleted, updated) values
    (x, ws, 'properties', 'b9-1', '{"type": "Condo / apartment", "street": "Jalan B9", "tenure": "freehold", "township": "Bangsar", "purpose": "sale",
       "askingPrice": 700000, "builtUpSqft": 1000, "ownerName": "Mr Tan", "lat": 3.13, "lng": 101.67, "photos": [{"id": "p1"}], "status": "sold"}', false,
       (extract(epoch from now()) * 1000)::bigint),
    (x, ws, 'properties', 'b9-2', '{"type": "Terrace"}', false, (extract(epoch from now()) * 1000)::bigint);
  insert into public.eab_licences (user_id, type, number, verified, expires_on) values (x, 'REN', 'REN 88 888', true, today + 100), (z, 'REN', 'ren88888', false, null);
  insert into public.eab_usage_events (user_id, at, kind, name, ok, app_version, platform, device)
    select x, now() - (d || ' days')::interval, 'session', 'open', true, '9.9.0', 'android', 'B9 phone' from generate_series(0, 4) d;
  insert into public.eab_login_log (happened_at, user_id, event, device_id, device, platform, app_version, lat, lng) values
    (now() - interval '2 days', x, 'sign_in', 'b9-dev-1', 'Galaxy B9', 'android', '9.9.0', 3.1, 101.6),
    (now() - interval '1 day', x, 'app_open', 'b9-dev-1', 'Galaxy B9', 'android', '9.9.1', null, null),
    (now() - interval '1 day', z, 'sign_in', 'b9-dev-1', 'Galaxy B9', 'android', '9.9.1', null, null);
  insert into public.eab_terms_acceptance (user_id, at, kind, terms_version, accepted, device_id) values (x, now(), 'terms', '1.1', true, 'b9-dev-1');
  insert into public.eab_agent_contacts (user_id, phone) values (x, '60123450909'), (z, '60123450909');

  -- ================= listing details =================
  if public.eab_listing_details('{}') = 0
     and public.eab_listing_details('{"type": "Office", "street": "s", "tenure": "t", "city": "KL", "purpose": "rent", "monthlyRent": 3000, "landSqft": 1, "vendorId": "v", "lat": 1, "lng": 2, "photos": [1]}') = 9
     and public.eab_listing_details('{"purpose": "sale_or_rent", "askingPrice": 1}') = 0 and public.eab_listing_details('{"purpose": "sale_or_rent", "askingPrice": 1, "monthlyRent": 2}') = 1
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [0 listing details]'; end if;

  -- ================= scorecard =================
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.eab_admin_scorecard(2000, 't');
  k := (select r from jsonb_array_elements(j->'agents') r where (r->>'user_id')::uuid = x);
  if (k->>'p_listings')::int = 22 and (k->>'p_activity')::int = 8 and (k->>'p_compliance')::int = 30 and (k->>'score')::int = 60
     and (k->>'listings')::int = 2 and (k->>'incomplete')::int = 1 and (k->>'active_days')::int = 5 and k->>'name' = 'Agent Ex'
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1a x score ' || coalesce(k::text, 'missing') || ']'; end if;
  if k->'reasons' ? '1 of 2 listings are missing details' and k->'reasons' ? 'used the app 5 of the last 30 days' and jsonb_array_length(k->'reasons') = 2
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1b x reasons ' || coalesce((k->'reasons')::text, '') || ']'; end if;
  k := (select r from jsonb_array_elements(j->'agents') r where (r->>'user_id')::uuid = y);
  if (k->>'score')::int = 10 and k->'reasons' ? 'no listings yet' and k->'reasons' ? 'no licence entered' and k->'reasons' ? 'no licence expiry date'
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1c y score ' || coalesce(k::text, 'missing') || ']'; end if;
  if not exists (select 1 from jsonb_array_elements(j->'agents') r where (r->>'user_id')::uuid in (o, a, c, v, g))
     and (select min((r->>'score')::int) from jsonb_array_elements(j->'agents') r) = (j->'agents'->0->>'score')::int
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1d admins out, lowest first]'; end if;
  j := public.eab_admin_agent_score(x, 't');
  if (j->>'score')::int = 60 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1e one agent]'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  j := public.eab_admin_scorecard(2000, 't');
  if not j ? 'agents' and (j->>'names_hidden')::boolean
     and (select sum((b->>'agents')::int) from jsonb_array_elements(j->'bands') b) = (j->>'agents_count')::int
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1f viewer spread only]'; end if;
  begin perform public.eab_admin_agent_score(x, 't'); fail := fail + 1; msgs := msgs || ' [1g viewer one agent]';
  exception when insufficient_privilege then pass := pass + 1; end;

  -- ================= funnel =================
  j := public.eab_admin_funnel(today, today);
  if (j->>'names_hidden')::boolean and jsonb_array_length(j->'steps') = 7 and (j->'steps'->0->>'agents')::int >= 3
     and (j->'steps'->6->>'agents')::int >= 1 and (j->'steps'->0->>'agents')::int >= (j->'steps'->1->>'agents')::int
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2a funnel ' || j::text || ']'; end if;
  begin perform public.eab_admin_funnel_stuck(today, today, 2, 't'); fail := fail + 1; msgs := msgs || ' [2b viewer stuck]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_funnel(today, today - 1); fail := fail + 1; msgs := msgs || ' [2c bad range]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  j := public.eab_admin_funnel_stuck(today, today, 2, 't');
  k := public.eab_admin_funnel_stuck(today, today, 3, 't');
  if j @> jsonb_build_array(jsonb_build_object('user_id', y)) and not j @> jsonb_build_array(jsonb_build_object('user_id', z))
     and not j @> jsonb_build_array(jsonb_build_object('user_id', x)) and k @> jsonb_build_array(jsonb_build_object('user_id', z))
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2d stuck lists]'; end if;
  j := public.eab_admin_funnel_stuck(today, today, 7, 't');
  if not j @> jsonb_build_array(jsonb_build_object('user_id', x)) then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2e x has a deal]'; end if;
  begin perform public.eab_admin_funnel_stuck(today, today, 1, 't'); fail := fail + 1; msgs := msgs || ' [2f step 1]';
  exception when invalid_parameter_value then pass := pass + 1; end;

  -- ================= bulk actions =================
  begin perform public.eab_admin_bulk_action('suspend', array[y, z], 'abc', null, 't'); fail := fail + 1; msgs := msgs || ' [3a short reason]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_bulk_action('delete', array[y], 'Testing bulk', null, 't'); fail := fail + 1; msgs := msgs || ' [3b unknown action]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  many := array(select gen_random_uuid() from generate_series(1, 51));
  begin perform public.eab_admin_bulk_action('sign_out', many, 'Testing bulk', null, 't'); fail := fail + 1; msgs := msgs || ' [3c 51 agents]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_bulk_action('sign_out', array[y, c], 'Testing bulk', null, 't'); fail := fail + 1; msgs := msgs || ' [3d admin in list]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_bulk_action('suspend', array[y, gen_random_uuid()], 'Testing bulk', null, 't'); fail := fail + 1; msgs := msgs || ' [3e unknown agent]';
  exception when no_data_found then pass := pass + 1; end;
  j := public.eab_admin_bulk_action('suspend', array[y, z, y], 'Fake documents found', null, 't');
  ref := j->>'ref';
  if ref ~ '^BULK-[0-9]{4}-[0-9]{4}$' and (j->>'count')::int = 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [3f suspend ' || j::text || ']'; end if;
  j := public.eab_admin_bulk_action('tag_add', array[y, z], 'Watch these two', 'B9 Watch', 't');
  j := public.eab_admin_agent_internal(z, 't');
  if j->'tags' ? 'b9 watch' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [3g tag]'; end if;
  perform public.eab_admin_bulk_action('reactivate', array[z], 'Documents checked again', null, 't');
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  begin perform public.eab_admin_bulk_action('sign_out', array[y], 'Testing bulk', null, 't'); fail := fail + 1; msgs := msgs || ' [3h compliance bulk]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';
  if (select status from public.eab_account_status where user_id = y) = 'suspended' and (select reason from public.eab_account_status where user_id = y) like '[' || ref || '] Fake%'
     and (select force_logout_after from public.eab_account_status where user_id = y) is not null
     and (select status from public.eab_account_status where user_id = z) = 'active'
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [3i statuses]'; end if;
  select count(*) into n from public.eab_admin_actions where admin_user = a and action in ('account_status', 'agent_tag_added', 'bulk_action');
  -- suspend 2 + bulk 1, tag 2 + bulk 1, reactivate 1 + bulk 1 = 8
  if n = 8 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [3j audit rows ' || n || ']'; end if;

  -- ================= message ticked agents (broadcast audience "agents") =================
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin perform public.eab_admin_broadcast_save('{"channel": "email", "kind": "service", "subject_en": "S", "body_en": "B", "audience": "agents", "user_ids": []}', 't');
    fail := fail + 1; msgs := msgs || ' [4a no agents]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_broadcast_save(jsonb_build_object('channel', 'email', 'kind', 'service', 'subject_en', 'Your documents', 'body_en', 'Please call us',
         'audience', 'agents', 'user_ids', jsonb_build_array(x, y, x)), 't');
  bid := (j->>'id')::uuid;
  if j->>'audience' = 'agents' and jsonb_array_length(j->'user_ids') = 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [4b draft]'; end if;
  j := public.eab_admin_broadcast_preview(bid);
  if (j->>'matched')::int = 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [4c preview ' || j::text || ']'; end if;
  j := public.eab_admin_broadcast_queue(bid, 'Documents follow-up', 't');
  execute 'reset role';
  select count(*) into n from public.eab_broadcast_recipients where broadcast_id = bid;
  if n = 2 and exists (select 1 from public.eab_broadcast_recipients where broadcast_id = bid and user_id = y and status = 'skipped_not_active')
     and exists (select 1 from public.eab_broadcast_recipients where broadcast_id = bid and user_id = x and status = 'pending')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [4d recipients ' || n || ']'; end if;
  execute 'set local role authenticated';
  j := public.eab_admin_broadcast_save('{"channel": "whatsapp", "kind": "news", "body_en": "Hello", "audience": "all", "user_ids": ["00000000-0000-0000-0000-000000000000"]}', 't');
  if j->>'audience' = 'all' and jsonb_array_length(j->'user_ids') = 0 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [4e all ignores ids]'; end if;

  -- ================= duplicates =================
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  j := public.eab_admin_duplicates('t');
  if exists (select 1 from jsonb_array_elements(j) d where d->>'kind' = 'phone' and d->'agents' @> jsonb_build_array(jsonb_build_object('user_id', x), jsonb_build_object('user_id', z)))
     and exists (select 1 from jsonb_array_elements(j) d where d->>'kind' = 'device' and d->>'value' like 'Galaxy B9%' and d->'agents' @> jsonb_build_array(jsonb_build_object('user_id', x), jsonb_build_object('user_id', z)))
     and exists (select 1 from jsonb_array_elements(j) d where d->>'kind' = 'licence' and d->'agents' @> jsonb_build_array(jsonb_build_object('user_id', x), jsonb_build_object('user_id', z)))
     and not exists (select 1 from jsonb_array_elements(j) d where d->'agents' @> jsonb_build_array(jsonb_build_object('user_id', y)))
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5a duplicates]'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  begin perform public.eab_admin_duplicates('t'); fail := fail + 1; msgs := msgs || ' [5b viewer]';
  exception when insufficient_privilege then pass := pass + 1; end;

  -- ================= devices =================
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  j := public.eab_admin_agent_devices(x, 't');
  if jsonb_array_length(j) = 1 and j->0->>'device_id' = 'b9-dev-1' and j->0->>'app_version' = '9.9.1' and (j->0->>'sign_ins')::int = 1
     and (j->0->>'opens')::int = 1 and (j->0->>'last_lat')::float = 3.1 and j->0->'removed' = 'null'::jsonb
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6a devices ' || j::text || ']'; end if;
  begin perform public.eab_admin_device_remove(x, 'b9-dev-1', 'Phone stolen', 't'); fail := fail + 1; msgs := msgs || ' [6b compliance removes]';
  exception when insufficient_privilege then pass := pass + 1; end;
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  begin perform public.eab_admin_agent_devices(x, 't'); fail := fail + 1; msgs := msgs || ' [6c regulator without scope]';
  exception when insufficient_privilege then pass := pass + 1; end;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin perform public.eab_admin_device_remove(x, 'b9-dev-1', 'lost', 't'); fail := fail + 1; msgs := msgs || ' [6d short reason]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_device_remove(x, 'not-a-phone', 'Phone stolen', 't'); fail := fail + 1; msgs := msgs || ' [6e unknown phone]';
  exception when no_data_found then pass := pass + 1; end;
  j := public.eab_admin_device_remove(x, 'b9-dev-1', 'Phone stolen at the office', 't');
  k := public.eab_admin_agent_devices(x, 't');
  if j->>'removed_by_email' = 'b9-admin@test.invalid' and k->0->'removed'->>'reason' = 'Phone stolen at the office' and not (k->0->>'signed_in_after_removal')::boolean
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6f removed]'; end if;
  -- the main app on that phone learns it was removed; another phone of x is not affected
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  if (public.eab_my_device('b9-dev-1')->>'removed_at') is not null and (public.eab_my_device('b9-dev-2')->>'removed_at') is null
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6g my device]'; end if;
  -- z used the same phone id but was not removed
  perform set_config('request.jwt.claims', json_build_object('sub', z, 'role', 'authenticated')::text, true);
  if (public.eab_my_device('b9-dev-1')->>'removed_at') is null then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6h other agent]'; end if;
  begin perform public.eab_admin_scorecard(10, 't'); fail := fail + 1; msgs := msgs || ' [6i agent cannot read scorecard]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';
  begin update public.eab_device_removals set reason = 'changed reason' where user_id = x; fail := fail + 1; msgs := msgs || ' [6j edit removal]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin delete from public.eab_device_removals where user_id = x; fail := fail + 1; msgs := msgs || ' [6k delete removal]';
  exception when insufficient_privilege then pass := pass + 1; end;

  -- ================= logs, grants =================
  if exists (select 1 from public.eab_admin_access where admin_user = c and target_ref = 'scorecard')
     and exists (select 1 from public.eab_admin_access where admin_user = a and target_ref = 'funnel stuck at step 2')
     and exists (select 1 from public.eab_admin_access where admin_user = c and target_ref = 'duplicate accounts')
     and exists (select 1 from public.eab_admin_access where admin_user = c and target_user = x and target_ref = 'devices')
     and exists (select 1 from public.eab_admin_actions where admin_user = a and action = 'device_removed' and target_user = x)
     and not exists (select 1 from public.eab_admin_access where admin_user = v and target_ref = 'scorecard')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [7a logs]'; end if;
  if (public.eab_admin_check_chain('eab_admin_access')->>'ok')::boolean and (public.eab_admin_check_chain('eab_admin_actions')->>'ok')::boolean
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [7b chains]'; end if;
  if not has_function_privilege('anon', 'public.eab_admin_scorecard(integer, text)', 'execute')
     and not has_function_privilege('anon', 'public.eab_my_device(text)', 'execute')
     and has_function_privilege('authenticated', 'public.eab_my_device(text)', 'execute')
     and not has_function_privilege('authenticated', 'public.eab_scores()', 'execute')
     and not has_function_privilege('authenticated', 'public.eab_funnel_rows(date, date)', 'execute')
     and not has_function_privilege('authenticated', 'public.eab_bc_in_audience(public.eab_broadcasts, uuid)', 'execute')
     and has_function_privilege('authenticated', 'public.eab_admin_bulk_action(text, uuid[], text, text, text)', 'execute')
     and not has_table_privilege('authenticated', 'public.eab_device_removals', 'select')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [7c grants]'; end if;

  raise exception 'TEST RESULT: % passed, % failed%', pass, fail, coalesce(nullif(msgs, ''), '');
end $test$;
