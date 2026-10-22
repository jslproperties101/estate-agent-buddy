-- Tests for 20261024000000_admin_batch_007_compliance.sql. Run in the SQL editor of the TEST project (or a local copy).
-- Everything is rolled back (the block ends by raising 'TEST RESULT ...'). Makes its own test users inside the block.
do $test$
declare
  o uuid := gen_random_uuid(); a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  x uuid := gen_random_uuid(); y uuid := gen_random_uuid(); ws uuid := gen_random_uuid();
  pass int := 0; fail int := 0; msgs text := '';
  j jsonb; n bigint; pid uuid; cid uuid; hid uuid; item uuid; today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  acc0 bigint; act0 bigint;
begin
  insert into auth.users (id, email, created_at) values
    (o, 'b7-owner@test.invalid', now() - interval '40 days'), (a, 'b7-admin@test.invalid', now() - interval '40 days'),
    (c, 'b7-compliance@test.invalid', now() - interval '40 days'), (v, 'b7-viewer@test.invalid', now() - interval '40 days'),
    (x, 'b7-agent-x@test.invalid', now() - interval '9 years'), (y, 'b7-agent-y@test.invalid', now() - interval '20 days');
  insert into public.eab_admins (user_id, email, role) values
    (o, 'b7-owner@test.invalid', 'owner'), (a, 'b7-admin@test.invalid', 'admin'),
    (c, 'b7-compliance@test.invalid', 'compliance'), (v, 'b7-viewer@test.invalid', 'viewer');
  insert into public.eab_workspaces (id, name, created_by) values (ws, 'B7 test', x);
  insert into public.eab_members (workspace_id, user_id, email, role) values (ws, x, 'b7-agent-x@test.invalid', 'owner');
  -- an 8-year-old record for x (retention) and a new one
  insert into public.eab_records (user_id, workspace_id, collection, id, data, deleted, updated) values
    (x, ws, 'properties', 'b7-old', '{"status": "sold"}', false, (extract(epoch from now() - interval '8 years') * 1000)::bigint),
    (x, ws, 'properties', 'b7-new', '{"status": "available"}', false, (extract(epoch from now()) * 1000)::bigint);
  insert into public.eab_licences (user_id, type, number) values (x, 'REN', 'REN 99999');
  select count(*) into acc0 from public.eab_admin_access;
  select count(*) into act0 from public.eab_admin_actions;

  -- ================= compliance: PDPA requests =================
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.eab_admin_pdpa_create(jsonb_build_object('requester_name', 'X', 'received_on', today + 1, 'kind', 'access', 'details', 'd'), 't');
    fail := fail + 1; msgs := msgs || ' [1a future date]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_pdpa_create(jsonb_build_object('agent_user', x, 'requester_name', 'Agent X', 'requester_contact', 'b7-agent-x@test.invalid',
         'received_on', today - 15, 'kind', 'deletion', 'details', 'Please delete all my data'), 't');
  pid := (j->>'id')::uuid;
  if j->>'ref' ~ '^PDPA-[0-9]{4}-[0-9]{4}$' and j->>'status' = 'open' and jsonb_array_length(j->'history') = 1 and (j->>'days_open')::int = 15
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1b create]'; end if;
  begin perform public.eab_admin_pdpa_update(pid, '{"status": "in_progress"}', ' ', 't'); fail := fail + 1; msgs := msgs || ' [2a no reason]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_pdpa_update(pid, '{"status": "in_progress", "decision": "Checking the 7-year rule with the lawyer"}', 'Started review', 't');
  if j->>'status' = 'in_progress' and j->'history'->1->>'kind' = 'status' and j->'history'->1->>'from_status' = 'open' and j->>'decision' like 'Checking%'
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2b update]'; end if;
  j := public.eab_admin_pdpa_note(pid, 'Called the agent', 't');
  if jsonb_array_length(j->'history') = 3 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2c note]'; end if;
  j := public.eab_admin_pdpa_list('active', 't');
  if exists (select 1 from jsonb_array_elements(j->'requests') r where (r->>'id')::uuid = pid and not (r ? 'details') and r->>'summary' like 'Please delete%')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2d list]'; end if;

  -- ================= legal hold =================
  j := public.eab_admin_hold_place(x, 'Police case RPT/88', null, 't');
  hid := (j->>'id')::uuid;
  begin perform public.eab_admin_hold_place(x, 'again', null, 't'); fail := fail + 1; msgs := msgs || ' [3a twice]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  -- a deletion request cannot be marked done while on hold
  begin perform public.eab_admin_pdpa_update(pid, '{"status": "done"}', 'done', 't'); fail := fail + 1; msgs := msgs || ' [3b done on hold]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  execute 'reset role';
  -- the database refuses to delete records of an agent on hold, even for the database owner
  begin delete from public.eab_records where user_id = x and id = 'b7-new'; fail := fail + 1; msgs := msgs || ' [3c delete on hold]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin delete from public.eab_legal_holds where id = hid; fail := fail + 1; msgs := msgs || ' [3d delete hold]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin update public.eab_legal_holds set reason = 'changed' where id = hid; fail := fail + 1; msgs := msgs || ' [3e edit hold]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'set local role authenticated';
  j := public.eab_admin_retention('t');
  if (j->>'deletion_enabled')::boolean = false and (j->'counts'->>'records')::int >= 1 and (j->'counts'->>'records_on_hold')::int >= 1
     and exists (select 1 from jsonb_array_elements(j->'agents') r where (r->>'user_id')::uuid = x and (r->>'on_hold')::boolean)
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [4 retention]'; end if;
  -- compliance cannot record a retention review (owner only)
  begin perform public.eab_admin_retention_review('keep', 'x', 't'); fail := fail + 1; msgs := msgs || ' [4b review compliance]';
  exception when insufficient_privilege then pass := pass + 1; end;
  j := public.eab_admin_hold_release(hid, 'Case closed', 't');
  if j->>'released_at' is not null and j->>'release_reason' = 'Case closed' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5a release]'; end if;
  begin perform public.eab_admin_hold_release(hid, 'again', 't'); fail := fail + 1; msgs := msgs || ' [5b release twice]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_pdpa_update(pid, jsonb_build_object('status', 'refused', 'decided_on', today, 'outcome', 'Kept: inside 7 years'), 'Lawyer advice', 't');
  if j->>'status' = 'refused' and (j->>'days_open') is null then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5c refused]'; end if;

  -- ================= admin: complaints, licence expiry, tags, notes, schedule =================
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  j := public.eab_admin_complaint_create(jsonb_build_object('agent_user', x, 'complainant_name', 'Buyer B', 'received_on', today, 'channel', 'phone',
         'category', 'misleading_listing', 'listing_ref', 'P1001', 'details', 'The price in the advert was not the real price'), 't');
  cid := (j->>'id')::uuid;
  if j->>'ref' ~ '^CMP-[0-9]{4}-[0-9]{4}$' and (j->>'agent_complaints')::int = 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6a complaint]'; end if;
  begin perform public.eab_admin_complaint_create(jsonb_build_object('complainant_name', 'B', 'received_on', today, 'channel', 'fax', 'category', 'other', 'details', 'x'), 't');
    fail := fail + 1; msgs := msgs || ' [6b bad channel]';
  exception when check_violation then pass := pass + 1; end;
  j := public.eab_admin_complaint_update(cid, '{"status": "investigating"}', 'Asked the agent for the SPA', 't');
  j := public.eab_admin_complaint_note(cid, 'Agent replied', 't');
  if j->>'status' = 'investigating' and jsonb_array_length(j->'history') = 3 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6c update+note]'; end if;
  j := public.eab_admin_complaints('active', x, 't');
  if jsonb_array_length(j->'complaints') = 1 and (j->'by_category'->>'misleading_listing')::int >= 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6d list]'; end if;
  -- admin may not see PDPA requests, place holds
  begin perform public.eab_admin_pdpa_list(null, 't'); fail := fail + 1; msgs := msgs || ' [7a admin pdpa]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_hold_place(y, 'x', null, 't'); fail := fail + 1; msgs := msgs || ' [7b admin hold]';
  exception when insufficient_privilege then pass := pass + 1; end;
  -- licence expiry
  begin perform public.eab_admin_set_licence_expiry(y, today + 10, 'x', 't'); fail := fail + 1; msgs := msgs || ' [8a no licence]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_set_licence_expiry(x, today + 20, 'From the REN card', 't');
  if (j->>'expires_on')::date = today + 20 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [8b set]'; end if;
  j := public.eab_admin_licence_expiry(60, 't');
  if (j->'counts'->>'in_30')::int >= 1 and exists (select 1 from jsonb_array_elements(j->'agents') r where (r->>'user_id')::uuid = x and (r->>'days_left')::int = 20)
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [8c list]'; end if;
  -- tags and notes
  begin perform public.eab_admin_agent_tag(x, 'Bad Tag!!', true, 't'); fail := fail + 1; msgs := msgs || ' [9a bad tag]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  perform public.eab_admin_agent_tag(x, 'VIP', true, 't');
  perform public.eab_admin_agent_tag(x, 'watch', true, 't');
  j := public.eab_admin_agent_tag(x, 'watch', false, 't');
  if j = '["vip"]'::jsonb then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [9b tags]'; end if;
  perform public.eab_admin_agent_note(x, 'Met at the Board office', 't');
  j := public.eab_admin_agent_internal(x, 't');
  if j->'tags' = '["vip"]'::jsonb and jsonb_array_length(j->'notes') = 1 and jsonb_array_length(j->'holds') = 1 and not (j->>'on_hold')::boolean
     and (j->>'complaints')::int = 1 and (j->>'pdpa')::int = 1 and (j->>'licence_expires_on')::date = today + 20
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [9c internal]'; end if;
  -- scheduled post
  item := (public.eab_admin_feed_save('{"kind": "news", "title_en": "B7 scheduled"}', 'test', 't')->>'id')::uuid;
  begin perform public.eab_admin_feed_schedule(item, now() - interval '1 day', 'x', 't'); fail := fail + 1; msgs := msgs || ' [10a past]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_feed_schedule(item, now() + interval '2 days', 'Publish on Monday', 't');
  if j->>'status' = 'published' and (j->>'published_at')::timestamptz > now() + interval '1 day' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [10b schedule]'; end if;
  -- an agent does not see it yet
  perform set_config('request.jwt.claims', json_build_object('sub', y, 'role', 'authenticated')::text, true);
  j := public.eab_my_feed('news', 'en');
  if not exists (select 1 from jsonb_array_elements(j) i where (i->>'id')::uuid = item) then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [10c hidden until due]'; end if;
  -- an agent cannot call any of it
  begin perform public.eab_admin_complaints(null, null, 'y'); fail := fail + 1; msgs := msgs || ' [11a agent]';
  exception when insufficient_privilege then pass := pass + 1; end;

  -- ================= viewer: nothing personal =================
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  begin perform public.eab_admin_complaints(null, null, 'v'); fail := fail + 1; msgs := msgs || ' [11b viewer complaints]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_agent_internal(x, 'v'); fail := fail + 1; msgs := msgs || ' [11c viewer internal]';
  exception when insufficient_privilege then pass := pass + 1; end;
  j := public.eab_admin_dash_master();
  if (j->>'licences_expiring_30')::int >= 1 and (j->>'complaints_active')::int >= 1 and j ? 'pdpa_due_soon' and j ? 'holds_active' and j ? 'agents'
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [12 master keys]'; end if;

  -- ================= owner: retention review =================
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  begin perform public.eab_admin_retention_review('delete_now', 'x', 'o'); fail := fail + 1; msgs := msgs || ' [13a bad decision]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_retention_review('keep', 'Lawyer not answered yet: keep everything', 'o');
  if j->>'decision' = 'keep' and (j->'counts'->>'records')::int >= 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [13b review]'; end if;
  execute 'reset role';

  -- ================= kept for good; logs; grants =================
  begin update public.eab_pdpa_events set body = 'x' where request_id = pid; fail := fail + 1; msgs := msgs || ' [14a pdpa event changed]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin delete from public.eab_pdpa_requests where id = pid; fail := fail + 1; msgs := msgs || ' [14b pdpa deleted]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin delete from public.eab_complaints where id = cid; fail := fail + 1; msgs := msgs || ' [14c complaint deleted]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin delete from public.eab_agent_notes where user_id = x; fail := fail + 1; msgs := msgs || ' [14d note deleted]';
  exception when insufficient_privilege then pass := pass + 1; end;
  -- after release, deleting a record is possible again (proves the guard follows the hold)
  begin delete from public.eab_records where user_id = x and id = 'b7-new'; pass := pass + 1;
  exception when others then fail := fail + 1; msgs := msgs || ' [14e delete after release: ' || sqlerrm || ']'; end;
  select count(*) into n from public.eab_admin_actions where seq > 0 and admin_user in (o, a, c) and action in
    ('pdpa_created', 'pdpa_updated', 'pdpa_note', 'legal_hold_placed', 'legal_hold_released', 'complaint_created', 'complaint_updated',
     'complaint_note', 'licence_expiry_set', 'agent_tag_added', 'agent_tag_removed', 'agent_note', 'feed_scheduled', 'retention_reviewed');
  -- pdpa: create, update x3 (in_progress, refused... + failed ones rolled back), note -> 1+2+1 = 4; holds 2; complaints 3; licence 1; tags 3; note 1; schedule 1; review 1 = 16
  if n = 16 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [15 audit rows ' || n || ']'; end if;
  if (public.eab_admin_check_chain('eab_admin_access')->>'ok')::boolean and (public.eab_admin_check_chain('eab_admin_actions')->>'ok')::boolean
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [16 chains]'; end if;
  if not has_function_privilege('anon', 'public.eab_admin_pdpa_list(text, text)', 'execute')
     and not has_function_privilege('anon', 'public.eab_admin_complaints(text, uuid, text)', 'execute')
     and not has_function_privilege('authenticated', 'public.eab_agent_on_hold(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'public.eab_retention_counts(date)', 'execute')
     and has_function_privilege('authenticated', 'public.eab_admin_retention(text)', 'execute')
     and not has_table_privilege('authenticated', 'public.eab_pdpa_requests', 'select')
     and not has_table_privilege('authenticated', 'public.eab_legal_holds', 'select')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [17 grants]'; end if;

  raise exception 'TEST RESULT: % passed, % failed%', pass, fail, coalesce(nullif(msgs, ''), '');
end $test$;
