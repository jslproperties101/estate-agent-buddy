-- Tests for 20261023100000_admin_batch_006_ops.sql. Run in the SQL editor of the TEST project (or a local copy).
-- Everything is rolled back (the block ends by raising 'TEST RESULT ...'). Makes its own test users inside the block.
do $test$
declare
  o uuid := gen_random_uuid(); a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  x uuid := gen_random_uuid(); y uuid := gen_random_uuid(); ws uuid := gen_random_uuid();
  pass int := 0; fail int := 0; msgs text := '';
  j jsonb; n bigint; m bigint; i1 uuid; i2 uuid; prj uuid; g1 uuid; rep uuid := gen_random_uuid(); code text;
  acc0 bigint; acc1 bigint; act0 bigint;
begin
  insert into auth.users (id, email, created_at) values
    (o, 'b6-owner@test.invalid', now() - interval '40 days'), (a, 'b6-admin@test.invalid', now() - interval '40 days'),
    (c, 'b6-compliance@test.invalid', now() - interval '40 days'), (v, 'b6-viewer@test.invalid', now() - interval '40 days'),
    (x, 'b6-agent-x@test.invalid', now() - interval '20 days'), (y, 'b6-agent-y@test.invalid', now() - interval '20 days');
  insert into public.eab_admins (user_id, email, role) values
    (o, 'b6-owner@test.invalid', 'owner'), (a, 'b6-admin@test.invalid', 'admin'),
    (c, 'b6-compliance@test.invalid', 'compliance'), (v, 'b6-viewer@test.invalid', 'viewer');
  insert into public.eab_workspaces (id, name, created_by) values (ws, 'B6 test', x);
  insert into public.eab_members (workspace_id, user_id, email, role) values (ws, x, 'b6-agent-x@test.invalid', 'owner');
  insert into public.eab_bug_reports (id, user_id, description, screenshot_path, status)
    values (rep, x, 'B6 test: photo upload stuck', x || '/' || rep || '.jpg', 'new');
  insert into public.eab_usage_events (user_id, at, kind, name, screen, ok, app_version, platform, device)
    values (x, now() - interval '1 minute', 'screen', 'listing', 'listing', true, '9.6.0-test', 'android', 'B6-PHONE');
  select count(*) into acc0 from public.eab_admin_access;
  select count(*) into act0 from public.eab_admin_actions;

  -- ================= Part A: news helpers (admin writes through the MainForAdmin-D functions) =================
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  i1 := (public.eab_admin_feed_save('{"kind": "news", "title_en": "B6 first"}', 'test', 't')->>'id')::uuid;
  i2 := (public.eab_admin_feed_save('{"kind": "news", "title_en": "B6 second"}', 'test', 't')->>'id')::uuid;
  prj := (public.eab_admin_feed_save('{"kind": "project", "title_en": "B6 project"}', 'test', 't')->>'id')::uuid;
  perform public.eab_admin_feed_order_set('00000000-0000-0000-0000-000000000000', array[i2, i1], 'test', 't');
  -- 1. order of a group
  j := public.eab_admin_feed_order_get('00000000-0000-0000-0000-000000000000');
  if (j->0->>'item_id')::uuid = i2 and (j->0->>'position')::int = 1 and (j->1->>'item_id')::uuid = i1
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1 order get]'; end if;
  -- 2. preview a group's filters before saving
  j := public.eab_admin_group_preview(jsonb_build_object('emails', jsonb_build_array('B6-AGENT-X@test.invalid')));
  if (j->>'agents')::int = 1 and (j->>'of')::int >= 6 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2a preview]'; end if;
  begin perform public.eab_admin_group_preview('[1]'); fail := fail + 1; msgs := msgs || ' [2b preview array]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  g1 := (public.eab_admin_group_save(jsonb_build_object('name', 'B6 agent x', 'priority', 5,
          'filters', jsonb_build_object('emails', jsonb_build_array('b6-agent-x@test.invalid'))), 'test', 't')->>'id')::uuid;
  -- 3. invitation code grants (admin sees names; written to the access log)
  code := public.eab_admin_code_create('B6 code', array[prj], null, null, 'test', 't')->>'code';
  execute 'reset role';
  insert into public.eab_feed_code_grants (user_id, item_id, code) values (x, prj, code);
  execute 'set local role authenticated';
  j := public.eab_admin_code_grants(code, 't');
  if jsonb_array_length(j) = 1 and (j->0->>'user_id')::uuid = x and j->0->>'title' = 'B6 project'
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [3 code grants]'; end if;

  -- ================= Part B: tickets =================
  -- 4. list (open = new + seen) and one ticket
  j := public.eab_admin_tickets('open', 'photo upload stuck', 50, 't');
  if exists (select 1 from jsonb_array_elements(j->'tickets') t where (t->>'id')::uuid = rep and (t->>'has_screenshot')::boolean)
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [4 tickets list]'; end if;
  begin perform public.eab_admin_tickets('pending', null, 10, 't'); fail := fail + 1; msgs := msgs || ' [4b bad status]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  -- 5. status change needs a note; same status refused; note kept
  begin perform public.eab_admin_ticket_set_status(rep, 'seen', '  ', 't'); fail := fail + 1; msgs := msgs || ' [5a no note]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_ticket_set_status(rep, 'seen', 'Looking into it', 't');
  if j->>'status' = 'seen' and jsonb_array_length(j->'history') = 1 and j->'history'->0->>'from_status' = 'new'
     and j->'history'->0->>'to_status' = 'seen' and j->'history'->0->>'body' = 'Looking into it'
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5b set status]'; end if;
  begin perform public.eab_admin_ticket_set_status(rep, 'seen', 'again', 't'); fail := fail + 1; msgs := msgs || ' [5c same status]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_ticket_note(rep, 'Asked the agent to update the app', 't');
  if jsonb_array_length(j->'history') = 2 and j->'history'->1->>'kind' = 'note' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5d note]'; end if;
  begin perform public.eab_admin_ticket(gen_random_uuid(), 't'); fail := fail + 1; msgs := msgs || ' [5e unknown ticket]';
  exception when no_data_found then pass := pass + 1; end;
  -- 6. post files: admin may upload a well-named file
  if public.eab_feed_media_can_upload('2026/' || gen_random_uuid() || '.jpg') and not public.eab_feed_media_can_upload('2026/../x.jpg')
     and not public.eab_feed_media_can_upload('2026/' || gen_random_uuid() || '.exe') and public.eab_ticket_can_read(x || '/' || rep || '.jpg')
     and not public.eab_ticket_can_read(x || '/other.jpg')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6 storage rules admin]'; end if;

  -- ================= Part B: feature flags =================
  begin perform public.eab_admin_flag_save('{"key": "Bad Key!", "label": "x"}', 'test', 't'); fail := fail + 1; msgs := msgs || ' [7a bad key]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_flag_save('{"key": "b6_new", "label": "x"}', ' ', 't'); fail := fail + 1; msgs := msgs || ' [7b no reason]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_flag_save('{"key": "b6_new", "label": "x", "audience": "groups"}', 'test', 't'); fail := fail + 1; msgs := msgs || ' [7c groups empty]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_flag_save(jsonb_build_object('key', 'b6_new', 'label', 'x', 'audience', 'groups', 'group_ids', jsonb_build_array(gen_random_uuid())), 'test', 't');
    fail := fail + 1; msgs := msgs || ' [7d unknown group]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_flag_save(jsonb_build_object('key', 'b6_house_shopping', 'label', 'House Shopping (B6 test)', 'enabled', true,
         'audience', 'groups', 'group_ids', jsonb_build_array(g1)), 'Pilot with agent x', 't');
  if j->>'key' = 'b6_house_shopping' and (j->>'enabled')::boolean and j->>'audience' = 'groups'
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [7e save]'; end if;
  perform public.eab_admin_flag_save('{"key": "b6_everyone_off", "label": "Off for everyone (B6 test)"}', 'test', 't');
  -- 8. the main app's view: x is in the group, y is not
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  j := public.eab_my_flags();
  if (j->>'b6_house_shopping')::boolean and not (j->>'b6_everyone_off')::boolean then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [8a flags x]'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', y, 'role', 'authenticated')::text, true);
  j := public.eab_my_flags();
  if not (j->>'b6_house_shopping')::boolean then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [8b flags y]'; end if;
  -- an agent cannot call admin functions
  begin perform public.eab_admin_flags(); fail := fail + 1; msgs := msgs || ' [8c agent flags]';
  exception when insufficient_privilege then pass := pass + 1; end;

  -- ================= Part C: overview =================
  execute 'reset role';
  insert into public.eab_records (user_id, workspace_id, collection, id, data, deleted, updated)
    values (x, ws, 'properties', 'b6-sold', jsonb_build_object('status', 'sold', 'created', (extract(epoch from now() - interval '3 days') * 1000)::bigint),
            false, (extract(epoch from now() - interval '2 days') * 1000)::bigint);
  select count(*) into acc1 from public.eab_admin_access;
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  -- 9. master dashboard (viewer, counts only)
  j := public.eab_admin_dash_master();
  if (j->>'agents')::int >= 6 and (j->>'tickets_open')::int >= 1 and (j->>'flags_on')::int >= 1 and (j->>'live_now')::int >= 1
     and jsonb_array_length(j->'active_by_day') = 14 and j ? 'db_limit_bytes' and j ? 'maintenance_on' and (j->>'closed_30d')::int >= 1
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [9 master]'; end if;
  -- 10. live users: viewer gets counts, no names, nothing logged
  j := public.eab_admin_live_users(5, 'v');
  if (j->>'count')::int >= 1 and j->'agents' = 'null'::jsonb and (j->>'names_hidden')::boolean
     and exists (select 1 from jsonb_array_elements(j->'by_screen') s where s->>'screen' = 'listing')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [10a live viewer]'; end if;
  -- 11. viewer may not: tickets, ticket status, flags save, top agents, code grants
  begin perform public.eab_admin_tickets(null, null, 10, 'v'); fail := fail + 1; msgs := msgs || ' [11a viewer tickets]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_flag_save('{"key": "b6_v", "label": "v"}', 'test', 'v'); fail := fail + 1; msgs := msgs || ' [11b viewer flag]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_dash_top_agents(null, null, 10, 'v'); fail := fail + 1; msgs := msgs || ' [11c viewer top]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_code_grants(code, 'v'); fail := fail + 1; msgs := msgs || ' [11d viewer grants]';
  exception when insufficient_privilege then pass := pass + 1; end;
  if public.eab_feed_media_can_upload('2026/' || gen_random_uuid() || '.jpg') or public.eab_ticket_can_read(x || '/' || rep || '.jpg')
    then fail := fail + 1; msgs := msgs || ' [11e viewer storage]'; else pass := pass + 1; end if;
  j := public.eab_admin_flags();
  if exists (select 1 from jsonb_array_elements(j) f where f->>'key' = 'b6_house_shopping') then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [11f viewer reads flags]'; end if;
  execute 'reset role';
  select count(*) into n from public.eab_admin_access;
  if n = acc1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [11g viewer logged ' || (n - acc1) || ']'; end if;

  -- ================= compliance: reads tickets, cannot change them; top agents; live names =================
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.eab_admin_ticket(rep, 'c');
  if j->>'status' = 'seen' and j->>'email' = 'b6-agent-x@test.invalid' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [12a compliance reads]'; end if;
  begin perform public.eab_admin_ticket_note(rep, 'x', 'c'); fail := fail + 1; msgs := msgs || ' [12b compliance note]';
  exception when insufficient_privilege then pass := pass + 1; end;
  if public.eab_ticket_can_read(x || '/' || rep || '.jpg') and not public.eab_feed_media_can_upload('2026/' || gen_random_uuid() || '.jpg')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [12c compliance storage]'; end if;
  j := public.eab_admin_dash_top_agents((now() at time zone 'Asia/Kuala_Lumpur')::date - 29, (now() at time zone 'Asia/Kuala_Lumpur')::date, 50, 'c');
  if exists (select 1 from jsonb_array_elements(j->'agents') t where (t->>'user_id')::uuid = x and (t->>'sold')::int = 1 and (t->>'closed')::int = 1
               and (t->>'new_listings')::int = 1 and (t->>'active_days')::int >= 1)
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [13 top agents]'; end if;
  j := public.eab_admin_live_users(5, 'c');
  if exists (select 1 from jsonb_array_elements(j->'agents') t where (t->>'user_id')::uuid = x and t->>'screen' = 'listing' and t->>'device' = 'B6-PHONE')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [14 live names]'; end if;
  begin perform public.eab_admin_live_users(0, 'c'); fail := fail + 1; msgs := msgs || ' [14b minutes]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  execute 'reset role';

  -- ================= records kept; logs =================
  begin update public.eab_ticket_notes set body = 'changed' where report_id = rep; fail := fail + 1; msgs := msgs || ' [15a note changed]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin delete from public.eab_ticket_notes where report_id = rep; fail := fail + 1; msgs := msgs || ' [15b note deleted]';
  exception when insufficient_privilege then pass := pass + 1; end;
  select count(*) into n from public.eab_admin_actions a2 where a2.seq > 0 and a2.action in ('ticket_status', 'ticket_note', 'flag_saved') and a2.admin_user = a;
  if n = 4 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [16 audit rows ' || n || ']'; end if;
  -- access log: code grants, tickets list, 3 x ticket view (set_status, note, compliance view), top agents, live names = 7
  select count(*) into n from public.eab_admin_access;
  if n - acc0 = 7 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [17 access rows ' || (n - acc0) || ']'; end if;
  if (public.eab_admin_check_chain('eab_admin_access')->>'ok')::boolean and (public.eab_admin_check_chain('eab_admin_actions')->>'ok')::boolean
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [18 chains]'; end if;
  if not has_function_privilege('anon', 'public.eab_admin_dash_master()', 'execute')
     and not has_function_privilege('anon', 'public.eab_my_flags()', 'execute')
     and not has_function_privilege('anon', 'public.eab_admin_tickets(text, text, integer, text)', 'execute')
     and has_function_privilege('authenticated', 'public.eab_my_flags()', 'execute')
     and not has_table_privilege('authenticated', 'public.eab_feature_flags', 'select')
     and not has_table_privilege('authenticated', 'public.eab_ticket_notes', 'select')
     and exists (select 1 from storage.buckets b where b.id = 'eab-feed-media' and b.public)
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [19 grants]'; end if;

  raise exception 'TEST RESULT: % passed, % failed%', pass, fail, coalesce(nullif(msgs, ''), '');
end $test$;
