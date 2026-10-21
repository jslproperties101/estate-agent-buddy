-- Tests for 20261021220000_confidential_cloud_files.sql (JoyChange010-05: confidential documents in the cloud, per-share switch).
-- One block that ends by raising 'TEST RESULT ...', so EVERY change is rolled back. Needs at least 4 users in auth.users,
-- one of them (the one with the most records) owning a workspace with a property.
-- Good = "TEST RESULT: n passed, 0 failed".
do $test$
declare
  a uuid; b uuid; c uuid; d uuid; ws uuid; bws uuid := gen_random_uuid(); tm uuid := gen_random_uuid();
  pass int := 0; fail int := 0; msgs text := '';
  s text; n int; ok boolean; j jsonb;
  sha_c text := repeat('c', 64); sha_o text := repeat('0', 64);
  as_user constant text := 'select set_config(''request.jwt.claims'', json_build_object(''sub'', %L, ''role'', ''authenticated'')::text, true), set_config(''request.jwt.claim.sub'', %L, true)';
begin
  select user_id into a from public.eab_records group by user_id order by count(*) desc limit 1;
  select workspace_id into ws from public.eab_members where user_id = a and role = 'owner' and active limit 1;
  select id into b from auth.users where id <> a order by created_at limit 1;
  select id into c from auth.users where id not in (a, b) order by created_at limit 1;
  select id into d from auth.users where id not in (a, b, c) order by created_at limit 1;
  if d is null or ws is null then raise exception 'needs 4 users and an owner with a workspace'; end if;
  -- b has a personal workspace; c is a team leader in a's workspace; a and b are in one Team Workspace
  insert into public.eab_workspaces (id, name, created_by) values (bws, 'B ws', b);
  insert into public.eab_members (workspace_id, user_id, email, role) values (bws, b, 'b', 'owner'), (ws, c, 'c', 'team_leader');
  update public.eab_team_members set left_at = now() where user_id in (a, b, c, d) and left_at is null;
  insert into public.eab_teams (id, created_by) values (tm, a);
  insert into public.eab_team_members (team_id, user_id, email) values (tm, a, 'a'), (tm, b, 'b');
  -- a property with one title deed (confidential) and one floor plan
  insert into public.eab_records (user_id, workspace_id, collection, id, data, updated)
    values (a, ws, 'properties', 'pc', jsonb_build_object('ref', 'C1', 'documents', jsonb_build_array(
      jsonb_build_object('id', 'd1', 'fileId', 'f-title', 'category', 'title', 'name', 'geran.pdf'),
      jsonb_build_object('id', 'd2', 'fileId', 'f-plan', 'category', 'floorplan', 'name', 'plan.pdf'))), 1);
  insert into public.eab_files (workspace_id, file_id, collection, record_id, kind, sha256, bytes, status, uploaded_by) values
    (ws, 'f-title', 'properties', 'pc', 'document', sha_c, 10, 'uploaded', a),
    (ws, 'f-plan', 'properties', 'pc', 'document', sha_o, 10, 'uploaded', a);
  insert into storage.buckets (id, name) values ('eab-files', 'eab-files') on conflict do nothing;
  insert into storage.objects (bucket_id, name) values ('eab-files', ws || '/' || sha_c), ('eab-files', ws || '/' || sha_o);
  insert into public.eab_shares (team_id, owner_id, recipient_id, workspace_id, collection, record_id, level) values (tm, a, b, ws, 'properties', 'pc', 'view');

  ---------------------------------------------------------------- the owner sees both, on any device
  execute format(as_user, a, a); execute 'set local role authenticated';
  select string_agg(file_id, ',' order by file_id) into s from public.eab_files where record_id = 'pc';
  if s = 'f-plan,f-title' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1 owner sees ' || coalesce(s, 'none') || ']'; end if;
  select count(*) into n from storage.objects where bucket_id = 'eab-files' and name like ws || '/%';
  if n = 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2 owner objects ' || n || ']'; end if;
  execute 'reset role';

  ---------------------------------------------------------------- shared without the switch: the property and the plan, not the title
  execute format(as_user, b, b); execute 'set local role authenticated';
  select count(*) into n from public.eab_records where id = 'pc';
  if n = 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [3 partner cannot see the property]'; end if;
  select string_agg(file_id, ',' order by file_id) into s from public.eab_files where record_id = 'pc';
  if s = 'f-plan' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [4 partner without switch sees ' || coalesce(s, 'none') || ']'; end if;
  select count(*) into n from storage.objects where bucket_id = 'eab-files' and name = ws || '/' || sha_c;
  if n = 0 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5 partner can download the title deed]'; end if;
  -- the partner cannot turn the switch on for someone else's property
  begin perform public.eab_share_confidential_set(ws, 'pc', true); fail := fail + 1; msgs := msgs || ' [6 partner switched it on]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';

  ---------------------------------------------------------------- a team leader in the same workspace: not the confidential file
  execute format(as_user, c, c); execute 'set local role authenticated';
  select string_agg(file_id, ',' order by file_id) into s from public.eab_files where record_id = 'pc';
  if s = 'f-plan' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [7 team leader sees ' || coalesce(s, 'none') || ']'; end if;
  execute 'reset role';

  ---------------------------------------------------------------- someone outside: nothing, and no switch
  execute format(as_user, d, d); execute 'set local role authenticated';
  select count(*) into n from public.eab_files where record_id = 'pc';
  if n = 0 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [8 outsider sees files]'; end if;
  begin perform public.eab_share_confidential_set(null, null, true); fail := fail + 1; msgs := msgs || ' [9 outsider switched]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';

  ---------------------------------------------------------------- the owner switches it on for this property
  execute format(as_user, a, a); execute 'set local role authenticated';
  ok := public.eab_share_confidential_set(ws, 'pc', true);
  if ok then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [10 switch on]'; end if;
  ok := public.eab_share_confidential_set(ws, 'pc', true);   -- twice: still one switch
  j := public.eab_share_confidential_list();
  if j = jsonb_build_object('all', false, 'records', jsonb_build_array(jsonb_build_object('workspace_id', ws, 'record_id', 'pc')))
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [11 list ' || j::text || ']'; end if;
  begin perform public.eab_share_confidential_set(ws, 'not-mine', true); fail := fail + 1; msgs := msgs || ' [12 switch on a missing property]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';
  execute format(as_user, b, b); execute 'set local role authenticated';
  select string_agg(file_id, ',' order by file_id) into s from public.eab_files where record_id = 'pc';
  if s = 'f-plan,f-title' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [13 partner with switch sees ' || coalesce(s, 'none') || ']'; end if;
  select count(*) into n from storage.objects where bucket_id = 'eab-files' and name = ws || '/' || sha_c;
  if n = 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [14 partner cannot download the title deed with the switch]'; end if;
  execute 'reset role';
  if exists (select 1 from public.eab_audit_events where team_id = tm and action = 'permission' and detail->>'event' = 'confidential_on' and record_id = 'pc')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [15 not in the history]'; end if;
  select count(*) into n from public.eab_audit_events where team_id = tm and detail->>'event' = 'confidential_on';
  if n = 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [16 switching on twice logged ' || n || ' times]'; end if;

  ---------------------------------------------------------------- off again
  execute format(as_user, a, a); execute 'set local role authenticated';
  ok := public.eab_share_confidential_set(ws, 'pc', false);
  execute 'reset role';
  execute format(as_user, b, b); execute 'set local role authenticated';
  select string_agg(file_id, ',' order by file_id) into s from public.eab_files where record_id = 'pc';
  if s = 'f-plan' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [17 switched off but sees ' || coalesce(s, 'none') || ']'; end if;
  execute 'reset role';

  ---------------------------------------------------------------- Share All switch covers every shared property; ends with the share
  execute format(as_user, a, a); execute 'set local role authenticated';
  ok := public.eab_share_confidential_set(null, null, true);
  j := public.eab_share_confidential_list();
  if (j->>'all')::boolean then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [18 share-all switch not listed]'; end if;
  execute 'reset role';
  execute format(as_user, b, b); execute 'set local role authenticated';
  select count(*) into n from public.eab_files where record_id = 'pc';
  if n = 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [19 share-all switch not applied]'; end if;
  execute 'reset role';
  update public.eab_shares set revoked_at = now() where team_id = tm and record_id = 'pc';
  execute format(as_user, b, b); execute 'set local role authenticated';
  select count(*) into n from public.eab_files where record_id = 'pc';
  if n = 0 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [20 sharing stopped but files still seen: ' || n || ']'; end if;
  execute 'reset role';
  update public.eab_shares set revoked_at = null where team_id = tm and record_id = 'pc';

  ---------------------------------------------------------------- the team ends: the switch no longer counts
  update public.eab_teams set ended_at = now(), end_reason = 'left' where id = tm;
  if not public.eab_confidential_shared(a, ws, 'properties', 'pc', (select data from public.eab_records where id = 'pc'), b)
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [21 switch outlived the team]'; end if;
  update public.eab_teams set ended_at = null, end_reason = null where id = tm;

  ---------------------------------------------------------------- the folder in the property decides, not the phone
  if public.eab_file_confidential('{"documents":[{"fileId":"x","category":"transaction"}]}', 'x') and not public.eab_file_confidential('{"documents":[{"fileId":"x","category":"brochure"}]}', 'x')
     and not public.eab_file_confidential('{}', 'x') and not public.eab_file_confidential('{"documents":"bad"}', 'x')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [22 confidential test]'; end if;
  execute format(as_user, a, a); execute 'set local role authenticated';
  perform public.eab_share_confidential_set(null, null, false);
  execute 'reset role';
  update public.eab_records set data = jsonb_set(data, '{documents,0,category}', '"other"') where id = 'pc';   -- moved to Other documents
  execute format(as_user, b, b); execute 'set local role authenticated';
  select count(*) into n from public.eab_files where record_id = 'pc';
  if n = 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [23 moved out of a confidential folder still hidden]'; end if;
  execute 'reset role';

  raise exception 'TEST RESULT: % passed, % failed%', pass, fail, case when msgs <> '' then ' —' || msgs else '' end;
end $test$;
