-- Batch 7d (9 Nov 2026): sync proof for AI Buddy POS. The 10 accounting collections go up and come back down through the
-- same database calls the phone uses (eab_push_records, then reading eab_records by seq), as a real workspace member.
-- Run in the SQL editor of the TEST project (EAB-QA-Test). Everything is rolled back: the block ends by raising
-- 'TEST RESULT ...'. Uses a made-up workspace with two existing users (owner and agent) and a third, if any, as an outsider.
do $test$
declare
  ws uuid := gen_random_uuid(); own uuid; ag uuid; outsider uuid;
  pass int := 0; fail int := 0; msgs text := '';
  cols text[] := array['acctJournals','acctInvoices','acctSales','acctEinvoices','acctLeads','acctStaff','acctAttendance','acctPayruns','acctProducts','acctProfile'];
  c text; rows jsonb := '[]'; out jsonb; n int; r int; s0 bigint;
begin
  select id into own from auth.users order by created_at limit 1;
  select id into ag from auth.users where id <> own order by created_at limit 1;
  select id into outsider from auth.users where id not in (own, ag) order by created_at limit 1;
  if own is null or ag is null then raise exception 'needs 2 users in auth.users'; end if;
  insert into public.eab_workspaces (id, name, created_by) values (ws, 'Batch 7 sync test', own);
  insert into public.eab_members (workspace_id, user_id, email, role, active)
  select ws, u.id, coalesce(u.email, u.id::text || '@test.invalid'), case when u.id = own then 'owner' else 'agent' end, true from auth.users u where u.id in (own, ag);
  foreach c in array cols loop
    rows := rows || jsonb_build_array(jsonb_build_object('collection', c, 'id', 'b7-' || c, 'base_rev', 0, 'deleted', false, 'updated', 1790000000000,
      'op_id', 'b7dev.' || c, 'data', jsonb_build_object('id', 'b7-' || c, 'created', 1790000000000, 'updated', 1790000000000,
      'no', case c when 'acctJournals' then 'JV-A-0001' when 'acctInvoices' then 'INV-A-0001' when 'acctSales' then 'POS-A-0001' end, 'note', 'Batch 7 sync proof')));
  end loop;

  -- 1. the agent's phone pushes one record of every accounting collection
  perform set_config('request.jwt.claims', json_build_object('sub', ag, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ag::text, true);
  set local role authenticated;
  select coalesce(max(seq), 0) into s0 from public.eab_records where workspace_id = ws;
  out := public.eab_push_records(ws, rows);
  select count(*) into n from jsonb_array_elements(out) x where x->>'status' = 'ok' and (x->>'rev')::int = 1;
  if n = 10 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n1a pushed ok: ' || n || ' ' || left(out::text, 300); end if;
  -- the same upload again (a retry after a lost answer) changes nothing
  out := public.eab_push_records(ws, rows);
  select count(*) into n from public.eab_records where workspace_id = ws and collection = any(cols);
  select max(rev) into r from public.eab_records where workspace_id = ws and collection = any(cols);
  if n = 10 and r = 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n1b retry made rows/revs: ' || n || '/' || r || ' ' || left(out::text, 200); end if;
  -- 2. it reads them back the way the phone pulls (by seq)
  select count(*) into n from public.eab_records where workspace_id = ws and seq > s0 and collection = any(cols);
  if n = 10 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n2a agent pulled ' || n; end if;
  -- 3. an edit on top of the version it has: accepted, rev 2; an edit on an old version: a conflict, nothing overwritten
  out := public.eab_push_records(ws, jsonb_build_array(jsonb_build_object('collection', 'acctStaff', 'id', 'b7-acctStaff', 'base_rev', 1, 'deleted', false, 'updated', 1790000001000,
           'op_id', 'b7dev.staff2', 'data', jsonb_build_object('id', 'b7-acctStaff', 'created', 1790000000000, 'updated', 1790000001000, 'note', 'edited'))));
  if out->0->>'status' = 'ok' and (out->0->>'rev')::int = 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n3a edit: ' || out::text; end if;
  out := public.eab_push_records(ws, jsonb_build_array(jsonb_build_object('collection', 'acctStaff', 'id', 'b7-acctStaff', 'base_rev', 1, 'deleted', false, 'updated', 1790000002000,
           'op_id', 'b7dev.staff3', 'data', jsonb_build_object('id', 'b7-acctStaff', 'created', 1790000000000, 'updated', 1790000002000, 'note', 'stale'))));
  if out->0->>'status' = 'conflict' and (select data->>'note' from public.eab_records where workspace_id = ws and collection = 'acctStaff' and id = 'b7-acctStaff') = 'edited' then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n3b stale edit: ' || out::text; end if;
  reset role;

  -- 4. the owner's phone pulls all of them, with the edit
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', own::text, true);
  set local role authenticated;
  select count(*) into n from public.eab_records where workspace_id = ws and seq > s0 and collection = any(cols);
  if n = 10 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n4a owner pulled ' || n; end if;
  if (select data->>'note' from public.eab_records where workspace_id = ws and collection = 'acctStaff' and id = 'b7-acctStaff') = 'edited' then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n4b owner did not get the edit'; end if;
  if (select data->>'no' from public.eab_records where workspace_id = ws and collection = 'acctSales' and id = 'b7-acctSales') = 'POS-A-0001' then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n4c document number changed on the way'; end if;
  reset role;

  -- 5. the agent deletes a draft: the delete reaches the owner as a tombstone
  perform set_config('request.jwt.claims', json_build_object('sub', ag, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ag::text, true);
  set local role authenticated;
  out := public.eab_push_records(ws, jsonb_build_array(jsonb_build_object('collection', 'acctLeads', 'id', 'b7-acctLeads', 'base_rev', 1, 'deleted', true, 'updated', 1790000003000, 'op_id', 'b7dev.del', 'data', null)));
  if out->0->>'status' = 'ok' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n5a delete: ' || out::text; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', own::text, true);
  set local role authenticated;
  if (select deleted from public.eab_records where workspace_id = ws and collection = 'acctLeads' and id = 'b7-acctLeads') then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n5b owner does not see the delete'; end if;
  reset role;

  -- 6. someone outside the business sees nothing and cannot write into it
  if outsider is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', outsider::text, true);
    set local role authenticated;
    select count(*) into n from public.eab_records where workspace_id = ws;
    if n = 0 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n6a outsider read ' || n; end if;
    begin
      out := public.eab_push_records(ws, jsonb_build_array(jsonb_build_object('collection', 'acctJournals', 'id', 'b7-intruder', 'base_rev', 0, 'deleted', false, 'updated', 1, 'op_id', 'x.1', 'data', '{"id":"b7-intruder"}'::jsonb)));
      if out->0->>'status' = 'ok' then fail := fail + 1; msgs := msgs || E'\n6b outsider wrote: ' || out::text; else pass := pass + 1; end if;
    exception when others then pass := pass + 1; end;
    reset role;
  end if;

  raise exception 'TEST RESULT: % passed, % failed%', pass, fail, msgs;
end
$test$;
