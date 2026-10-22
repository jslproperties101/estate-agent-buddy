-- Tests for 20261025000000_admin_batch_008_comms.sql. Run in the SQL editor of the TEST project (or a local copy).
-- Everything is rolled back (the block ends by raising 'TEST RESULT ...'). Makes its own test users inside the block.
do $test$
declare
  o uuid := gen_random_uuid(); a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  x uuid := gen_random_uuid(); y uuid := gen_random_uuid(); z uuid := gen_random_uuid(); ws uuid := gen_random_uuid();
  pass int := 0; fail int := 0; msgs text := '';
  j jsonb; n bigint; b1 uuid; b2 uuid; b3 uuid; g1 uuid; rid bigint; tok text; run uuid; t1 uuid; t2 uuid; e1 uuid; act0 bigint; acc0 bigint;
  sat timestamptz; ids bigint[]; yid bigint;
begin
  insert into auth.users (id, email, created_at, raw_user_meta_data) values
    (o, 'b8-owner@test.invalid', now() - interval '40 days', '{}'), (a, 'b8-admin@test.invalid', now() - interval '40 days', '{}'),
    (c, 'b8-compliance@test.invalid', now() - interval '40 days', '{}'), (v, 'b8-viewer@test.invalid', now() - interval '40 days', '{}'),
    (x, 'b8-agent-x@test.invalid', now() - interval '20 days', '{"full_name": "Agent X", "country": "Malaysia"}'),
    (y, 'b8-agent-y@test.invalid', now() - interval '20 days', '{"full_name": "Agent Y"}'),
    (z, 'b8-agent-z@test.invalid', now() - interval '20 days', '{"full_name": "Agent Z"}');
  insert into public.eab_admins (user_id, email, role) values
    (o, 'b8-owner@test.invalid', 'owner'), (a, 'b8-admin@test.invalid', 'admin'),
    (c, 'b8-compliance@test.invalid', 'compliance'), (v, 'b8-viewer@test.invalid', 'viewer');
  insert into public.eab_workspaces (id, name, created_by) values (ws, 'B8 test workspace', x);
  insert into public.eab_members (workspace_id, user_id, email, role) values (ws, x, 'b8-agent-x@test.invalid', 'owner');
  insert into public.eab_terms_acceptance (user_id, kind, accepted) values (x, 'marketing', true), (y, 'marketing', true), (y, 'marketing', false);
  insert into public.eab_account_status (user_id, status, reason, changed_by) values (z, 'suspended', 'B8 test', o);
  insert into public.eab_usage_events (user_id, at, kind, name, ok) values (x, now() - interval '1 hour', 'language', 'lang.bm', true);
  select count(*) into act0 from public.eab_admin_actions;
  select count(*) into acc0 from public.eab_admin_access;

  -- ================= MainForAdmin-F: the agent's own number =================
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.eab_set_my_phone(' 012-345 6789 ');
  if j->>'phone' = '0123456789' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1a phone cleaned ' || coalesce(j->>'phone', 'null') || ']'; end if;
  begin perform public.eab_set_my_phone('call me'); fail := fail + 1; msgs := msgs || ' [1b bad phone]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  -- an agent cannot call admin functions
  begin perform public.eab_admin_broadcasts(10); fail := fail + 1; msgs := msgs || ' [1c agent list]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';
  if public.eab_wa_number('0123456789', 'Malaysia') = '60123456789' and public.eab_wa_number('+6591234567', 'Singapore') = '6591234567'
     and public.eab_wa_number('91234567', 'Singapore') is null and public.eab_wa_number(null, null) is null
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1d wa number]'; end if;

  -- ================= broadcasts: drafts =================
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  g1 := (public.eab_admin_group_save(jsonb_build_object('name', 'B8 agent x', 'priority', 5,
          'filters', jsonb_build_object('emails', jsonb_build_array('b8-agent-x@test.invalid'))), 'test', 't')->>'id')::uuid;
  begin perform public.eab_admin_broadcast_save('{"channel": "email", "kind": "service", "body_en": "Hello"}', 't'); fail := fail + 1; msgs := msgs || ' [2a no subject]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_broadcast_save('{"channel": "sms", "kind": "service", "body_en": "Hello"}', 't'); fail := fail + 1; msgs := msgs || ' [2b sms]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_broadcast_save('{"channel": "whatsapp", "kind": "news", "body_en": "x", "audience": "groups"}', 't'); fail := fail + 1; msgs := msgs || ' [2c groups empty]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_broadcast_save('{"channel": "email", "kind": "service", "subject_en": "B8 service", "body_en": "Office closed", "body_bm": "Pejabat tutup"}', 't');
  b1 := (j->>'id')::uuid;
  if j->>'ref' ~ '^BC-[0-9]{4}-[0-9]{4}$' and j->>'status' = 'draft' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2d save ' || coalesce(j->>'ref', '') || ']'; end if;
  j := public.eab_admin_broadcast_save(jsonb_build_object('id', b1, 'channel', 'email', 'kind', 'service', 'subject_en', 'B8 service 2', 'body_en', 'Office closed Fri'), 't');
  if j->>'subject_en' = 'B8 service 2' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2e change draft]'; end if;
  b2 := (public.eab_admin_broadcast_save('{"channel": "email", "kind": "news", "subject_en": "B8 news", "body_en": "New launch"}', 't')->>'id')::uuid;
  b3 := (public.eab_admin_broadcast_save(jsonb_build_object('channel', 'whatsapp', 'kind', 'news', 'body_en', 'Launch tonight', 'audience', 'groups',
          'group_ids', jsonb_build_array(g1)), 't')->>'id')::uuid;

  -- ================= preview: who is reached and why others are skipped =================
  j := public.eab_admin_broadcast_preview(b1);
  if (j->>'not_active')::int >= 1 and (j->>'reach')::int >= 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [3a preview service ' || j || ']'; end if;
  j := public.eab_admin_broadcast_preview(b2);
  if (j->>'no_consent')::int >= 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [3b preview news consent]'; end if;
  j := public.eab_admin_broadcast_preview(b3);
  if (j->>'matched')::int = 1 and (j->>'reach')::int = 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [3c preview wa group ' || j || ']'; end if;

  -- ================= queue: reason, fixed list, one queue only =================
  begin perform public.eab_admin_broadcast_queue(b2, ' ', 't'); fail := fail + 1; msgs := msgs || ' [4a no reason]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_broadcast_queue(b2, 'Launch news to opted-in agents', 't');
  if j->>'status' = 'queued' and (j->'counts'->>'pending')::int >= 1 and (j->'counts'->>'skipped_no_consent')::int >= 1 then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || ' [4b queue ' || (j->'counts')::text || ']'; end if;
  execute 'reset role';
  if exists (select 1 from public.eab_broadcast_recipients r where r.broadcast_id = b2 and r.user_id = x and r.status = 'pending' and r.lang = 'bm' and r.address = 'b8-agent-x@test.invalid')
     and exists (select 1 from public.eab_broadcast_recipients r where r.broadcast_id = b2 and r.user_id = y and r.status = 'skipped_no_consent')
     and exists (select 1 from public.eab_broadcast_recipients r where r.broadcast_id = b2 and r.user_id = z and r.status = 'skipped_not_active')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [4c recipient rows]'; end if;
  execute 'set local role authenticated';
  begin perform public.eab_admin_broadcast_queue(b2, 'again', 't'); fail := fail + 1; msgs := msgs || ' [4d queue twice]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_broadcast_save(jsonb_build_object('id', b2, 'channel', 'email', 'kind', 'news', 'subject_en', 'x', 'body_en', 'x'), 't');
    fail := fail + 1; msgs := msgs || ' [4e change queued]';
  exception when invalid_parameter_value then pass := pass + 1; end;

  -- ================= sending (Edge Function): claim with the admin's sign-in, results with the service key =================
  j := public.eab_admin_broadcast_claim(b2, 100, 't');
  if (j->>'left')::int >= 1 and exists (select 1 from jsonb_array_elements(j->'recipients') r where r->>'address' = 'b8-agent-x@test.invalid' and r->>'token' ~ '^[0-9a-f]{32}$')
     and not (j->'broadcast' ? 'queue_reason')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5a claim]'; end if;
  j := public.eab_admin_broadcast_claim(b2, 100, 't');   -- a second sender at the same time gets nobody
  if jsonb_array_length(j->'recipients') = 0 and (j->>'left')::int >= 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5b claim twice]'; end if;
  begin perform public.eab_bc_result(1, true); fail := fail + 1; msgs := msgs || ' [5c admin writes result]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';
  -- the Edge Function only uses the functions; the tables are read here as the database owner
  select array_agg(r.id) into ids from public.eab_broadcast_recipients r where r.broadcast_id = b2 and r.status = 'pending';
  select r.id into yid from public.eab_broadcast_recipients r where r.broadcast_id = b2 and r.user_id = y;
  select r.token into tok from public.eab_broadcast_recipients r where r.broadcast_id = b2 and r.user_id = x;
  execute 'set local role service_role';
  foreach rid in array ids loop perform public.eab_bc_result(rid, true, null, 'resend-test-id'); end loop;
  if not public.eab_bc_result(yid, true) then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || ' [5d skipped row changed]'; end if;
  if public.eab_bc_finish(b2) = 'done' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5e finish]'; end if;
  -- unsubscribe link: turns "news & offers" off for x
  j := public.eab_bc_unsubscribe(tok);
  if not (public.eab_bc_unsubscribe('00')->>'ok')::boolean then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5f2 bad token]'; end if;
  execute 'reset role';
  if (j->>'ok')::boolean and not public.eab_news_consent(x) then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5f unsubscribe]'; end if;
  insert into public.eab_terms_acceptance (user_id, kind, accepted) values (x, 'marketing', true);   -- x says yes again

  -- ================= WhatsApp tap-to-send =================
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.eab_admin_broadcast_queue(b3, 'Pilot group', 't');
  execute 'reset role';
  select r.id into rid from public.eab_broadcast_recipients r where r.broadcast_id = b3 and r.user_id = x;
  if (select r.address from public.eab_broadcast_recipients r where r.id = rid) = '60123456789' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6a wa address]'; end if;
  select r.id into n from public.eab_broadcast_recipients r where r.broadcast_id = b2 limit 1;
  execute 'set local role authenticated';
  begin perform public.eab_admin_broadcast_wa_opened(n, 't');
    fail := fail + 1; msgs := msgs || ' [6b wa on email]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_broadcast_wa_opened(rid, 't');
  if j->>'status' = 'done' and (j->'counts'->>'opened_wa')::int = 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6c wa opened ' || j || ']'; end if;
  begin perform public.eab_admin_broadcast_wa_opened(rid, 't'); fail := fail + 1; msgs := msgs || ' [6d wa twice]';
  exception when invalid_parameter_value then pass := pass + 1; end;

  -- ================= cancel =================
  j := public.eab_admin_broadcast_queue(b1, 'Holiday notice', 't');
  j := public.eab_admin_broadcast_cancel(b1, 'Wrong date', 't');
  if j->>'status' = 'cancelled' and coalesce((j->'counts'->>'pending')::int, 0) = 0 and (j->'counts'->>'cancelled')::int >= 1 then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || ' [7a cancel]'; end if;
  begin perform public.eab_admin_broadcast_claim(b1, 10, 't'); fail := fail + 1; msgs := msgs || ' [7b claim cancelled]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  -- a sender that could not start hands the broadcast back at once (nobody sent to yet)
  b1 := (public.eab_admin_broadcast_save('{"channel": "whatsapp", "kind": "service", "body_en": "B8 unclaim"}', 't')->>'id')::uuid;
  perform public.eab_admin_broadcast_queue(b1, 'API test', 't');
  perform public.eab_admin_broadcast_claim(b1, 10, 't');
  execute 'reset role'; execute 'set local role service_role';
  if not public.eab_bc_unclaim(b1) then fail := fail + 1; msgs := msgs || ' [7c unclaim refused]'; end if;
  execute 'reset role';
  if (select status from public.eab_broadcasts where id = b1) = 'queued' then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || ' [7c unclaim]'; end if;
  execute 'reset role'; execute 'set local role authenticated';

  -- ================= roles =================
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  if jsonb_array_length(public.eab_admin_broadcasts(50)) >= 3 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [8a viewer list]'; end if;
  begin perform public.eab_admin_broadcast(b2, 'v'); fail := fail + 1; msgs := msgs || ' [8b viewer names]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_broadcast_save('{"channel": "email", "kind": "service", "subject_en": "v", "body_en": "v"}', 'v'); fail := fail + 1; msgs := msgs || ' [8c viewer save]';
  exception when insufficient_privilege then pass := pass + 1; end;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  j := public.eab_admin_broadcast(b2, 'c');
  if exists (select 1 from jsonb_array_elements(j->'recipients') r where r->>'email' = 'b8-agent-x@test.invalid' and r->>'name' = 'Agent X' and r->>'status' = 'sent')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [8d compliance detail]'; end if;
  begin perform public.eab_admin_broadcast_queue(b1, 'x', 'c'); fail := fail + 1; msgs := msgs || ' [8e compliance queue]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';
  begin delete from public.eab_broadcast_recipients where broadcast_id = b2; fail := fail + 1; msgs := msgs || ' [8f recipients deleted]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin delete from public.eab_broadcasts where id = b2; fail := fail + 1; msgs := msgs || ' [8g broadcast deleted]';
  exception when insufficient_privilege then pass := pass + 1; end;

  -- ================= weekly report =================
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.eab_admin_report_settings_save(jsonb_build_object('enabled', true, 'recipients', jsonb_build_array(c)), 'x', 'c');
    fail := fail + 1; msgs := msgs || ' [9a compliance changes schedule]';
  exception when insufficient_privilege then pass := pass + 1; end;
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  begin perform public.eab_admin_report_settings_save(jsonb_build_object('enabled', true, 'recipients', jsonb_build_array(a)), 'x', 'o');
    fail := fail + 1; msgs := msgs || ' [9b report to admin role]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_report_settings_save(jsonb_build_object('enabled', true, 'weekday', 1, 'hour', 8, 'recipients', jsonb_build_array(c, o)), 'Weekly to owner and compliance', 'o');
  if (j->>'enabled')::boolean and jsonb_array_length(j->'recipient_emails') = 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [9c settings]'; end if;
  execute 'reset role';
  execute 'set local role service_role';
  sat := '2026-10-26 01:30:00+00';   -- Monday 09:30 Malaysia time
  j := public.eab_report_claim_scheduled(sat);
  if j->>'trigger' = 'schedule' and j->>'period_from' = '2026-10-19' and j->>'period_to' = '2026-10-25' and jsonb_array_length(j->'recipients') = 2
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [9d scheduled run ' || coalesce(j::text, 'null') || ']'; end if;
  run := (j->>'id')::uuid;
  if public.eab_report_claim_scheduled(sat + interval '1 hour') is null and public.eab_report_claim_scheduled('2026-10-27 01:30:00+00') is null
     and public.eab_report_claim_scheduled('2026-10-25 23:30:00+00') is null   -- Monday 07:30: before the hour
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [9e once a week, right day and hour]'; end if;
  j := public.eab_report_data(run);
  if j ? 'agents_total' and j ? 'agents_active' and jsonb_array_length(j->'active_by_day') = 7 and (j->>'log_chain_ok')::boolean and not (j::text ~ 'b8-agent')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [9f data]'; end if;
  begin perform public.eab_report_stored(run, 'r.pdf', repeat('a', 64), 100); fail := fail + 1; msgs := msgs || ' [9g stored without file]';
  exception when no_data_found then pass := pass + 1; end;
  execute 'reset role';
  insert into storage.objects (bucket_id, name) values ('eab-vault', 'reports/' || run || '/' || repeat('a', 64));   -- the upload, as storage would
  execute 'set local role service_role';
  j := public.eab_report_stored(run, 'EAB-weekly-2026-W43.pdf', repeat('a', 64), 1234);
  j := public.eab_report_finished(run, array['b8-owner@test.invalid', 'b8-compliance@test.invalid']);
  if j->>'status' = 'emailed' and cardinality(array(select jsonb_array_elements_text(j->'emailed_to'))) = 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [9h finished]'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.eab_admin_report_download(run, 'c');
  if j->>'path' = 'reports/' || run || '/' || repeat('a', 64) and public.eab_report_can_read(j->>'path') then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [9i download]'; end if;
  if (public.eab_admin_check_report(repeat('a', 64), 'c')->>'id')::uuid = run and public.eab_admin_check_report(repeat('b', 64), 'c') is null
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [9i2 check a report file]'; end if;
  j := public.eab_admin_report_claim('Check the numbers now', 'c');
  if j->>'trigger' = 'manual' and j->>'status' = 'making' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [9j manual run]'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin perform public.eab_admin_reports(10, 'a'); fail := fail + 1; msgs := msgs || ' [9k admin reports]';
  exception when insufficient_privilege then pass := pass + 1; end;
  if not public.eab_report_can_read('reports/' || run || '/' || repeat('a', 64)) then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [9l admin reads file]'; end if;
  execute 'reset role';
  if exists (select 1 from public.eab_admin_actions x2 where x2.action = 'report_run' and x2.admin_user = o and x2.device = 'weekly schedule')
     and exists (select 1 from public.eab_admin_actions x2 where x2.action = 'report_finished' and x2.admin_user = o)
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [9m schedule audit]'; end if;
  begin delete from public.eab_report_runs where id = run; fail := fail + 1; msgs := msgs || ' [9n run deleted]';
  exception when insufficient_privilege then pass := pass + 1; end;

  -- ================= Team Workspaces overview =================
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.eab_admin_workspaces('B8 test workspace', 'a');
  if exists (select 1 from jsonb_array_elements(j->'workspaces') w where (w->>'id')::uuid = ws and w->>'owner_email' = 'b8-agent-x@test.invalid' and (w->>'members')::int = 1)
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [10a workspaces]'; end if;
  j := public.eab_admin_workspace(ws, 'a');
  if jsonb_array_length(j->'members') = 1 and j->>'name' = 'B8 test workspace' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [10b workspace]'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  begin perform public.eab_admin_workspaces(null, 'v'); fail := fail + 1; msgs := msgs || ' [10c viewer workspaces]';
  exception when insufficient_privilege then pass := pass + 1; end;

  -- ================= To-Do & Calendar =================
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  t1 := (public.eab_admin_task_save('{"title": "B8 private task", "due_on": "2026-10-30"}', 'a')->>'id')::uuid;
  t2 := (public.eab_admin_task_save('{"title": "B8 shared task", "shared": true}', 'a')->>'id')::uuid;
  e1 := (public.eab_admin_event_save('{"title": "B8 team meeting", "starts_at": "2026-10-28T02:00:00Z", "shared": true}', 'a')->>'id')::uuid;
  begin perform public.eab_admin_event_save('{"title": "bad", "starts_at": "2026-10-28T02:00:00Z", "ends_at": "2026-10-28T01:00:00Z"}', 'a');
    fail := fail + 1; msgs := msgs || ' [11a end before start]';
  exception when check_violation then pass := pass + 1; end;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  j := public.eab_admin_todo();
  if not exists (select 1 from jsonb_array_elements(j->'tasks') t where (t->>'id')::uuid = t1)
     and exists (select 1 from jsonb_array_elements(j->'tasks') t where (t->>'id')::uuid = t2 and not (t->>'mine')::boolean)
     and exists (select 1 from jsonb_array_elements(j->'events') e where (e->>'id')::uuid = e1)
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [11b who sees what]'; end if;
  begin perform public.eab_admin_task_save(jsonb_build_object('id', t1, 'done', true), 'c'); fail := fail + 1; msgs := msgs || ' [11c tick private of other]';
  exception when insufficient_privilege then pass := pass + 1; end;
  j := public.eab_admin_task_save(jsonb_build_object('id', t2, 'done', true), 'c');
  if (j->>'done')::boolean and (j->>'done_by')::uuid = c then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [11d tick shared]'; end if;
  begin perform public.eab_admin_task_save(jsonb_build_object('id', t2, 'shared', false), 'c'); fail := fail + 1; msgs := msgs || ' [11e make other private]';
  exception when insufficient_privilege then pass := pass + 1; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  begin perform public.eab_admin_task_save('{"title": "v shared", "shared": true}', 'v'); fail := fail + 1; msgs := msgs || ' [11f viewer shared]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_task_save(jsonb_build_object('id', t2, 'done', false), 'v'); fail := fail + 1; msgs := msgs || ' [11g viewer edits shared]';
  exception when insufficient_privilege then pass := pass + 1; end;
  j := public.eab_admin_task_save('{"title": "Viewer own note"}', 'v');
  if not (j->>'shared')::boolean then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [11h viewer private]'; end if;
  begin perform public.eab_admin_task_save(jsonb_build_object('id', j->>'id', 'shared', true), 'v'); fail := fail + 1; msgs := msgs || ' [11h2 viewer shares own]';
  exception when insufficient_privilege then pass := pass + 1; end;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.eab_admin_task_save(jsonb_build_object('id', t1, 'removed', true), 'a');
  if not exists (select 1 from jsonb_array_elements(public.eab_admin_todo()->'tasks') t where (t->>'id')::uuid = t1) then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || ' [11i removed hidden]'; end if;
  execute 'reset role';
  begin delete from public.eab_admin_tasks where id = t1; fail := fail + 1; msgs := msgs || ' [11j task deleted]';
  exception when insufficient_privilege then pass := pass + 1; end;
  select count(*) into n from public.eab_admin_actions x2 where x2.seq > 0 and x2.action in ('admin_task_added', 'admin_task_changed', 'admin_event_added');
  if n = 3 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [11k shared changes audited ' || n || ' (private not)]'; end if;

  -- ================= logs and grants =================
  if exists (select 1 from public.eab_admin_actions x2 where x2.action = 'broadcast_queued' and x2.reason = 'Launch news to opted-in agents' and x2.admin_user = a)
     and exists (select 1 from public.eab_admin_actions x2 where x2.action = 'broadcast_send_started')
     and exists (select 1 from public.eab_admin_actions x2 where x2.action = 'broadcast_wa_opened' and x2.target_user = x)
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [12a audit]'; end if;
  if (public.eab_admin_check_chain('eab_admin_access')->>'ok')::boolean and (public.eab_admin_check_chain('eab_admin_actions')->>'ok')::boolean
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [12b chains]'; end if;
  if not has_function_privilege('anon', 'public.eab_set_my_phone(text)', 'execute')
     and has_function_privilege('authenticated', 'public.eab_set_my_phone(text)', 'execute')
     and not has_function_privilege('authenticated', 'public.eab_bc_result(bigint, boolean, text, text)', 'execute')
     and not has_function_privilege('authenticated', 'public.eab_report_claim_scheduled(timestamptz)', 'execute')
     and not has_function_privilege('authenticated', 'public.eab_bc_unsubscribe(text)', 'execute')
     and not has_function_privilege('authenticated', 'public.eab_bc_unclaim(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'public.eab_report_data(uuid)', 'execute')
     and has_function_privilege('service_role', 'public.eab_report_data(uuid)', 'execute')
     and not has_function_privilege('anon', 'public.eab_admin_broadcasts(integer)', 'execute')
     and not has_table_privilege('authenticated', 'public.eab_agent_contacts', 'select')
     and not has_table_privilege('authenticated', 'public.eab_broadcast_recipients', 'select')
     and not has_table_privilege('authenticated', 'public.eab_admin_tasks', 'select')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [12c grants]'; end if;

  raise exception 'TEST RESULT: % passed, % failed%', pass, fail, coalesce(nullif(msgs, ''), '');
end $test$;
