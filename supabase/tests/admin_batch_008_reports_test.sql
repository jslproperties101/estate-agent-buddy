-- Tests for 20261026000000_admin_batch_008_reports.sql. Run in the SQL editor of the TEST project (or a local copy).
-- Everything is rolled back (the block ends by raising 'TEST RESULT ...'). Makes its own test users inside the block.
do $test$
declare
  o uuid := gen_random_uuid(); a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  x uuid := gen_random_uuid(); ws uuid := gen_random_uuid();
  pass int := 0; fail int := 0; msgs text := '';
  j jsonb; k jsonb; n bigint; rid uuid; rid2 uuid; today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  m date := date_trunc('month', (now() at time zone 'Asia/Kuala_Lumpur')::date)::date; pm date; ms bigint; acc0 bigint; refx text;
begin
  pm := (m - interval '1 month')::date;
  ms := (extract(epoch from now()) * 1000)::bigint;
  insert into auth.users (id, email, created_at, raw_user_meta_data) values
    (o, 'b8-owner@test.invalid', now(), '{}'), (a, 'b8-admin@test.invalid', now(), '{}'),
    (c, 'b8-compliance@test.invalid', now(), '{}'), (v, 'b8-viewer@test.invalid', now(), '{}'),
    (x, 'b8-agent-x@test.invalid', now(), '{"full_name": "Agent Bee Eight"}');
  insert into public.eab_admins (user_id, email, role) values
    (o, 'b8-owner@test.invalid', 'owner'), (a, 'b8-admin@test.invalid', 'admin'),
    (c, 'b8-compliance@test.invalid', 'compliance'), (v, 'b8-viewer@test.invalid', 'viewer');
  insert into public.eab_workspaces (id, name, created_by) values (ws, 'B8 test', x);
  insert into public.eab_members (workspace_id, user_id, email, role) values (ws, x, 'b8-agent-x@test.invalid', 'owner');
  insert into public.eab_records (user_id, workspace_id, collection, id, data, deleted, updated) values
    (x, ws, 'properties', 'b8-1', jsonb_build_object('ref', 'B8-001', 'state', 'B8 Selangor', 'type', 'condo', 'purpose', 'sale',
       'askingPrice', 500000, 'status', 'sold', 'created', ms), false, ms),
    (x, ws, 'properties', 'b8-2', jsonb_build_object('ref', 'B8-002', 'state', 'B8 Selangor', 'type', 'terrace', 'purpose', 'sale',
       'askingPrice', 900000, 'status', 'available', 'created', ms), false, ms),
    (x, ws, 'properties', 'b8-3', jsonb_build_object('ref', 'B8-003', 'state', 'B8 Johor', 'type', 'condo', 'purpose', 'rent',
       'monthlyRent', 2500, 'status', 'available', 'created', ms), false, ms);
  insert into public.eab_licences (user_id, type, number, expires_on) values (x, 'REN', 'REN 88888', today + 20);
  insert into public.eab_usage_events (user_id, at, kind, name, ok, app_version, platform, device) values
    (x, now(), 'screen', 'b8-listings', true, '9.8.0', 'android', 'B8 phone'), (x, now(), 'language', 'lang.ms', true, '9.8.0', 'android', 'B8 phone');
  insert into public.eab_login_log (happened_at, user_id, event, platform, app_version) values (now(), x, 'sign_in', 'android', '9.8.0');
  insert into public.eab_bug_reports (user_id, description, status, screen) values (x, 'B8 crash', 'new', 'b8-screen');
  -- PDPA in the previous month: one answered in 10 days, one answered after 28 days (late)
  insert into public.eab_pdpa_requests (ref, agent_user, requester_name, received_on, kind, details, status, supplied_on, created_by) values
    ('PDPA-B8-0001', x, 'B8 one', pm, 'access', 'copy', 'done', pm + 10, c),
    ('PDPA-B8-0002', x, 'B8 two', pm + 1, 'access', 'copy', 'done', pm + 29, c);
  insert into public.eab_complaints (ref, agent_user, complainant_name, received_on, channel, category, details, status, created_by) values
    ('CMP-B8-0001', x, 'B8 buyer', today, 'phone', 'fees', 'too high', 'open', c);
  select count(*) into acc0 from public.eab_admin_access;

  -- ================= catalogue by role =================
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.eab_admin_report_catalog();
  if j ? 'agents' and j ? 'listings' and not j ? 'pdpa' and not j ? 'complaints' and not j ? 'admin_actions' and not (j->'agents') ? 'roles'
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1a viewer catalogue]'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  j := public.eab_admin_report_catalog();
  if j ? 'complaints' and j ? 'tickets' and not j ? 'pdpa' and not j ? 'admin_actions' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1b admin catalogue]'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  j := public.eab_admin_report_catalog();
  if j ? 'pdpa' and j ? 'admin_actions' and (j->'agents'->'columns'->'email'->>'p')::boolean then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1c compliance catalogue]'; end if;

  -- ================= running reports (admin) =================
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  j := public.eab_admin_report_run('{"source": "listings", "columns": ["ref", "state", "asking_price", "agent_name"],
         "filters": [{"col": "agent_email", "op": "eq", "value": "b8-agent-x@test.invalid"}], "sort": {"by": "ref", "dir": "asc"}}', 't');
  if (j->>'count')::int = 3 and j->'rows'->0->>'ref' = 'B8-001' and (j->'rows'->0->>'asking_price')::numeric = 500000
     and j->'rows'->0->>'agent_name' = 'Agent Bee Eight' and not (j->'rows'->0) ? 'uid' and (j->>'truncated')::boolean = false
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2a rows ' || coalesce(j::text, '') || ']'; end if;
  j := public.eab_admin_report_run('{"source": "listings", "group_by": ["state"], "sort": {"by": "value", "dir": "desc"},
         "filters": [{"col": "state", "op": "contains", "value": "b8 "}]}', 't');
  if jsonb_array_length(j->'rows') = 2 and j->'rows'->0->>'state' = 'B8 Selangor' and (j->'rows'->0->>'value')::int = 2
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2b group count]'; end if;
  j := public.eab_admin_report_run('{"source": "listings", "group_by": ["purpose", "type"], "measure": "sum:asking_price",
         "filters": [{"col": "ref", "op": "in", "value": ["B8-001", "B8-002"]}], "sort": {"by": "type", "dir": "asc"}}', 't');
  if jsonb_array_length(j->'rows') = 2 and j->'rows'->0->>'type' = 'condo' and (j->'rows'->0->>'value')::numeric = 500000
     and (j->'rows'->1->>'value')::numeric = 900000 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2c sum + in]'; end if;
  j := public.eab_admin_report_run('{"source": "listings", "columns": ["ref"], "filters": [{"col": "asking_price", "op": "min", "value": 600000},
         {"col": "state", "op": "contains", "value": "B8"}]}', 't');
  if (j->>'count')::int = 1 and j->'rows'->0->>'ref' = 'B8-002' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2d min]'; end if;
  j := public.eab_admin_report_run('{"source": "listings", "columns": ["ref"], "filters": [{"col": "asking_price", "op": "is", "value": "empty"},
         {"col": "ref", "op": "contains", "value": "B8-"}]}', 't');
  if (j->>'count')::int = 1 and j->'rows'->0->>'ref' = 'B8-003' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2e is empty]'; end if;
  j := public.eab_admin_report_run(jsonb_build_object('source', 'agents', 'columns', '["email", "licence_verified", "licence_expires_on", "language", "listings"]'::jsonb,
         'from', today, 'to', today, 'filters', '[{"col": "licence_verified", "op": "is", "value": "false"}, {"col": "email", "op": "contains", "value": "b8-agent"}]'::jsonb), 't');
  if (j->>'count')::int = 1 and (j->'rows'->0->>'listings')::int = 3 and j->'rows'->0->>'language' = 'ms' and (j->'rows'->0->>'licence_expires_on')::date = today + 20
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2f agents ' || coalesce(j::text, '') || ']'; end if;
  j := public.eab_admin_report_run(jsonb_build_object('source', 'agents', 'columns', '["email"]'::jsonb, 'from', today + 1,
         'filters', '[{"col": "email", "op": "contains", "value": "b8-agent"}]'::jsonb), 't');
  if (j->>'count')::int = 0 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2g date range]'; end if;
  j := public.eab_admin_report_run('{"source": "listings", "columns": ["ref"], "filters": [{"col": "ref", "op": "contains", "value": "B8-"}], "limit": 2}', 't');
  if (j->>'count')::int = 2 and (j->>'truncated')::boolean then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2h truncated]'; end if;
  j := public.eab_admin_report_run('{"source": "activity", "group_by": ["name"], "filters": [{"col": "agent_email", "op": "eq", "value": "b8-agent-x@test.invalid"}]}', 't');
  k := public.eab_admin_report_run('{"source": "sign_ins", "columns": ["event", "platform"], "filters": [{"col": "agent_email", "op": "eq", "value": "b8-agent-x@test.invalid"}]}', 't');
  if jsonb_array_length(j->'rows') = 2 and k->'rows'->0->>'event' = 'sign_in' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2i activity / sign-ins]'; end if;
  j := public.eab_admin_report_run('{"source": "tickets", "columns": ["screen", "status"], "filters": [{"col": "screen", "op": "eq", "value": "b8-screen"}]}', 't');
  k := public.eab_admin_report_run('{"source": "complaints", "group_by": ["category"], "filters": [{"col": "ref", "op": "eq", "value": "CMP-B8-0001"}]}', 't');
  if j->'rows'->0->>'status' = 'new' and k->'rows'->0->>'category' = 'fees' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2j tickets / complaints]'; end if;

  -- ================= nothing typed becomes SQL =================
  begin perform public.eab_admin_report_run('{"source": "listings", "columns": ["ref; drop table public.eab_records; --"]}', 't');
    fail := fail + 1; msgs := msgs || ' [3a bad column]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_report_run($j${"source": "listings", "columns": ["ref"], "filters": [{"col": "ref", "op": "eq", "value": "x' or '1'='1"}]}$j$, 't');
  if (j->>'count')::int = 0 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [3b value as data]'; end if;
  begin perform public.eab_admin_report_run('{"source": "auth.users", "columns": ["email"]}', 't'); fail := fail + 1; msgs := msgs || ' [3c bad source]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_report_run('{"source": "listings", "columns": ["uid"]}', 't'); fail := fail + 1; msgs := msgs || ' [3d hidden uid]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_report_run('{"source": "listings", "group_by": ["state"], "measure": "sum:state"}', 't'); fail := fail + 1; msgs := msgs || ' [3e sum text]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_report_run('{"source": "listings", "group_by": ["state"], "measure": "max(1);--:x"}', 't'); fail := fail + 1; msgs := msgs || ' [3f bad measure]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_report_run('{"source": "listings", "group_by": ["state", "type", "city"]}', 't'); fail := fail + 1; msgs := msgs || ' [3g 3 groups]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_report_run('{"source": "listings", "columns": ["ref"], "filters": [{"col": "state", "op": "min", "value": "1"}]}', 't');
    fail := fail + 1; msgs := msgs || ' [3h op does not fit]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_report_run('{"source": "listings", "columns": ["ref"], "sort": {"by": "state"}}', 't'); fail := fail + 1; msgs := msgs || ' [3i sort]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_report_run('{"source": "listings", "columns": "ref"}', 't'); fail := fail + 1; msgs := msgs || ' [3k not a list]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_report_run('{"source": "listings", "columns": []}', 't'); fail := fail + 1; msgs := msgs || ' [3j no columns]';
  exception when invalid_parameter_value then pass := pass + 1; end;

  -- ================= who may run what =================
  begin perform public.eab_admin_report_run('{"source": "pdpa", "group_by": ["kind"]}', 't'); fail := fail + 1; msgs := msgs || ' [4a admin pdpa]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_report_run('{"source": "admin_actions", "group_by": ["action"]}', 't'); fail := fail + 1; msgs := msgs || ' [4b admin actions]';
  exception when insufficient_privilege then pass := pass + 1; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  begin perform public.eab_admin_report_run('{"source": "listings", "columns": ["ref"]}', 't'); fail := fail + 1; msgs := msgs || ' [4c viewer rows]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_report_run('{"source": "listings", "group_by": ["agent_email"]}', 't'); fail := fail + 1; msgs := msgs || ' [4d viewer personal group]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_report_run('{"source": "listings", "group_by": ["state"], "filters": [{"col": "agent_name", "op": "contains", "value": "Bee"}]}', 't');
    fail := fail + 1; msgs := msgs || ' [4e viewer personal filter]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_report_run('{"source": "complaints", "group_by": ["category"]}', 't'); fail := fail + 1; msgs := msgs || ' [4f viewer complaints]';
  exception when insufficient_privilege then pass := pass + 1; end;
  j := public.eab_admin_report_run('{"source": "listings", "group_by": ["state"], "filters": [{"col": "state", "op": "contains", "value": "B8 "}]}', 't');
  if jsonb_array_length(j->'rows') = 2 and not (j->'rows'->0) ? 'agent_email' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [4g viewer totals]'; end if;
  begin perform public.eab_admin_board_report(m, 't'); fail := fail + 1; msgs := msgs || ' [4h viewer board]';
  exception when insufficient_privilege then pass := pass + 1; end;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin perform public.eab_admin_board_report(m, 't'); fail := fail + 1; msgs := msgs || ' [4i admin board]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_audit_bundle(extract(year from today)::int, 't'); fail := fail + 1; msgs := msgs || ' [4j admin bundle]';
  exception when insufficient_privilege then pass := pass + 1; end;

  -- ================= saved reports (shared) =================
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  j := public.eab_admin_saved_report_save('{"name": "Listings by state", "source": "listings", "spec": {"source": "listings", "group_by": ["state"]}}', 't');
  rid := (j->>'id')::uuid;
  if j->>'name' = 'Listings by state' and j->>'created_by_email' = 'b8-viewer@test.invalid' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5a viewer save]'; end if;
  begin perform public.eab_admin_saved_report_save('{"name": "Emails", "source": "listings", "spec": {"source": "listings", "columns": ["agent_email"]}}', 't');
    fail := fail + 1; msgs := msgs || ' [5b viewer saves rows]';
  exception when insufficient_privilege then pass := pass + 1; end;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  j := public.eab_admin_saved_report_save('{"name": "PDPA by kind", "source": "pdpa", "spec": {"source": "pdpa", "group_by": ["kind"]}}', 't');
  rid2 := (j->>'id')::uuid;
  begin perform public.eab_admin_saved_report_save('{"name": "  ", "source": "listings", "spec": {"source": "listings", "group_by": ["state"]}}', 't');
    fail := fail + 1; msgs := msgs || ' [5c no name]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_saved_report_save('{"name": "Mixed", "source": "agents", "spec": {"source": "listings", "group_by": ["state"]}}', 't');
    fail := fail + 1; msgs := msgs || ' [5d source mismatch]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_saved_reports();
  if exists (select 1 from jsonb_array_elements(j) r where (r->>'id')::uuid = rid) and exists (select 1 from jsonb_array_elements(j) r where (r->>'id')::uuid = rid2)
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5e compliance sees both]'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  j := public.eab_admin_saved_reports();
  if exists (select 1 from jsonb_array_elements(j) r where (r->>'id')::uuid = rid) and not exists (select 1 from jsonb_array_elements(j) r where (r->>'id')::uuid = rid2)
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5f admin sees shared, not PDPA]'; end if;
  j := public.eab_admin_saved_report_save(jsonb_build_object('id', rid, 'name', 'Listings by state (all)', 'source', 'listings',
         'spec', '{"source": "listings", "group_by": ["state"], "sort": {"by": "value"}}'::jsonb), 't');
  if j->>'name' = 'Listings by state (all)' and (j->>'updated_by')::uuid = a and (j->>'created_by')::uuid = v then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5g edit]'; end if;
  begin perform public.eab_admin_saved_report_delete(rid, 't'); fail := fail + 1; msgs := msgs || ' [5h admin deletes others]';
  exception when insufficient_privilege then pass := pass + 1; end;
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  if public.eab_admin_saved_report_delete(rid, 't') and not public.eab_admin_saved_report_delete(rid, 't')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5i owner deletes]'; end if;

  -- ================= Board report =================
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  begin perform public.eab_admin_board_report((m + interval '1 month')::date, 't'); fail := fail + 1; msgs := msgs || ' [6a future month]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_board_report(today, 't');
  if (j->>'month')::date = m and (j->'previous'->>'from')::date = pm and (j->'previous'->>'to')::date = m - 1 and (j->'current'->>'from')::date = m
     and (j->>'complete')::boolean = false then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6b months]'; end if;
  if (j->'current'->'agents'->>'new')::int >= 5 and (j->'current'->'listings'->>'new')::int >= 3 and (j->'current'->'listings'->>'sold')::int >= 1
     and (j->'current'->'listings'->'by_status_now'->>'available')::int >= 2 and (j->'current'->'licences'->>'expiring_60_after')::int >= 0
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6c agents / listings ' || (j->'current')::text || ']'; end if;
  if (j->'current'->'complaints'->>'received')::int >= 1 and (j->'current'->'complaints'->'by_category'->>'fees')::int >= 1
     and (j->'current'->'tickets'->>'received')::int >= 1 and (j->'current'->'complaints'->>'open_at_end')::int >= 1
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6d complaints / tickets]'; end if;
  if (j->'previous'->'pdpa'->>'with_deadline')::int >= 2 and (j->'previous'->'pdpa'->>'answered_in_21')::int >= 1 and (j->'previous'->'pdpa'->>'late')::int >= 1
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6e PDPA 21 days ' || (j->'previous'->'pdpa')::text || ']'; end if;
  j := public.eab_admin_board_report(pm, 't');
  if (j->>'complete')::boolean and (j->'current'->>'from')::date = pm then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6f last month complete]'; end if;

  -- ================= Annual audit bundle + vault kinds =================
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  begin perform public.eab_admin_audit_bundle(2025, 't'); fail := fail + 1; msgs := msgs || ' [7a 2025]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_audit_bundle(extract(year from today)::int, 't');
  if (j->'chain'->'actions'->>'ok')::boolean and (j->'chain'->'access'->>'ok')::boolean
     and exists (select 1 from jsonb_array_elements(j->'actions') r where r->>'action' = 'report_saved')
     and not exists (select 1 from jsonb_array_elements(j->'actions') r where r ? 'before' or r ? 'prev_hash')
     and exists (select 1 from jsonb_array_elements(j->'pdpa') r where r->>'ref' = 'PDPA-B8-0001' and not r ? 'details')
     and exists (select 1 from jsonb_array_elements(j->'complaints') r where r->>'ref' = 'CMP-B8-0001')
     and jsonb_typeof(j->'cases') = 'array' and jsonb_typeof(j->'backup_tests') = 'array' and jsonb_typeof(j->'holds') = 'array'
     and (j->'counts'->>'actions')::int >= jsonb_array_length(j->'actions')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [7b bundle]'; end if;
  -- a board report file can be registered in the vault with its own kind
  refx := public.eab_admin_export('board_report', 'pdf', null, '{"month": "test"}', 't')->>'reference';
  j := public.eab_admin_pack_register(jsonb_build_object('reference', refx, 'kind', 'board_report', 'format', 'pdf', 'file_name', 'Board.pdf',
         'sha256', repeat('a', 64), 'bytes', 100), 't');
  if j->>'kind' = 'board_report' and j->>'case_id' is null then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [7c vault board_report]'; end if;
  refx := public.eab_admin_export('audit_bundle', 'xlsx', null, null, 't')->>'reference';
  j := public.eab_admin_pack_register(jsonb_build_object('reference', refx, 'kind', 'audit_bundle', 'format', 'xlsx', 'file_name', 'Audit.xlsx',
         'sha256', repeat('b', 64), 'bytes', 100), 't');
  if j->>'kind' = 'audit_bundle' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [7d vault audit_bundle]'; end if;
  refx := public.eab_admin_export('other', 'pdf', null, null, 't')->>'reference';
  begin perform public.eab_admin_pack_register(jsonb_build_object('reference', refx, 'kind', 'something_else', 'format', 'pdf', 'file_name', 'x.pdf',
         'sha256', repeat('c', 64), 'bytes', 100), 't'); fail := fail + 1; msgs := msgs || ' [7e unknown kind]';
  exception when check_violation then pass := pass + 1; end;

  -- ================= logs, grants =================
  execute 'reset role';
  if (select count(*) from public.eab_records where id like 'b8-%') = 3 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [8 records untouched]'; end if;
  select count(*) into n from public.eab_admin_access where seq > 0 and admin_user in (a, v) and kind = 'search' and target_ref like 'report: %';
  if n = 14 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [8a report access rows ' || n || ']'; end if;
  if exists (select 1 from public.eab_admin_access where admin_user = c and target_ref = 'board report ' || to_char(m, 'YYYY-MM'))
     and exists (select 1 from public.eab_admin_access where admin_user = o and target_ref = 'audit bundle ' || extract(year from today))
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [8b board / bundle access rows]'; end if;
  select count(*) into n from public.eab_admin_actions where admin_user in (o, a, c, v) and action in ('report_saved', 'report_removed');
  if n = 4 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [8c saved-report actions ' || n || ']'; end if;
  if (public.eab_admin_check_chain('eab_admin_access')->>'ok')::boolean and (public.eab_admin_check_chain('eab_admin_actions')->>'ok')::boolean
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [8d chains]'; end if;
  if not has_function_privilege('anon', 'public.eab_admin_report_run(jsonb, text)', 'execute')
     and not has_function_privilege('anon', 'public.eab_admin_board_report(date, text)', 'execute')
     and not has_function_privilege('authenticated', 'public.eab_report_sql(jsonb, text)', 'execute')
     and not has_function_privilege('authenticated', 'public.eab_board_numbers(date, date)', 'execute')
     and not has_function_privilege('authenticated', 'public.eab_report_base(text)', 'execute')
     and has_function_privilege('authenticated', 'public.eab_admin_audit_bundle(integer, text)', 'execute')
     and not has_table_privilege('authenticated', 'public.eab_saved_reports', 'select')
     and not has_table_privilege('anon', 'public.eab_saved_reports', 'select')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [8e grants]'; end if;

  raise exception 'TEST RESULT: % passed, % failed%', pass, fail, coalesce(nullif(msgs, ''), '');
end $test$;
