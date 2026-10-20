-- Tests for 20261021130000_admin_batch_003_cases.sql. Run in the SQL editor of the TEST project.
-- Everything is rolled back (the block ends by raising 'TEST RESULT ...'). Needs 4+ users in auth.users, one with records.
do $test$
declare
  a uuid; o uuid; r uuid; x uuid; em_r text; em_o text;
  pass int := 0; fail int := 0; msgs text := '';
  j jsonb; cid uuid; pid uuid; ref text; n int; sha text := repeat('ab', 32);
begin
  select user_id into a from public.eab_records group by user_id order by count(*) desc limit 1;
  select id into o from auth.users where id <> a order by created_at limit 1;
  -- the regulator must be an account that is NOT staff
  select id into r from auth.users u where id not in (a, o)
     and not exists (select 1 from public.eab_admins ad where ad.user_id = u.id and ad.role <> 'regulator') order by created_at limit 1;
  select id into x from auth.users where id not in (a, o, coalesce(r, a)) order by created_at limit 1;   -- another agent
  select email into em_r from auth.users where id = r;
  select email into em_o from auth.users where id = o;
  insert into public.eab_admins (user_id, email, role) select o, email, 'owner' from auth.users where id = o
    on conflict (user_id) do update set role = 'owner', active = true, expires_at = null;

  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  -- 1. create a case
  j := public.eab_admin_case_create(jsonb_build_object('requester_type', 'jpph', 'requester_name', 'JPPH Kuala Lumpur',
        'requester_ref', 'JPPH/KL/2026/77', 'received_on', '2026-10-20', 'deadline', '2026-11-03', 'description', 'Misleading listing complaint'), 't');
  cid := (j->>'id')::uuid;
  if j->>'case_no' ~ '^CASE-\d{4}-\d{4}$' and j->>'status' = 'open' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1 create ' || coalesce(j->>'case_no','') || ']'; end if;
  -- 2. grant with no agents refused
  begin perform public.eab_admin_case_grant(cid, em_r, now() + interval '7 days', 'officer', 't'); fail := fail + 1; msgs := msgs || ' [2 grant without agents]';
  exception when others then if sqlerrm like '%at least one agent%' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2 ' || sqlerrm || ']'; end if; end;
  -- 3. add agent a; bad date range refused
  j := public.eab_admin_case_add_agent(cid, a, '2026-09-01', '2026-10-20', 'Named in the complaint', 't');
  if jsonb_array_length(j->'agents') = 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [3 add agent]'; end if;
  begin perform public.eab_admin_case_add_agent(cid, a, '2026-10-20', '2026-09-01', 'bad', 't'); fail := fail + 1; msgs := msgs || ' [3b bad dates]';
  exception when check_violation then pass := pass + 1; end;
  -- 4. grant limits: more than 90 days, yourself, a staff account
  begin perform public.eab_admin_case_grant(cid, em_r, now() + interval '120 days', 'officer', 't'); fail := fail + 1; msgs := msgs || ' [4a 120 days]';
  exception when others then if sqlerrm like '%90 days%' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [4a ' || sqlerrm || ']'; end if; end;
  begin perform public.eab_admin_case_grant(cid, em_o, now() + interval '7 days', 'me', 't'); fail := fail + 1; msgs := msgs || ' [4b self]';
  exception when others then if sqlerrm like '%yourself%' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [4b ' || sqlerrm || ']'; end if; end;
  -- 5. grant the regulator 7 days
  j := public.eab_admin_case_grant(cid, em_r, now() + interval '7 days', 'Officer Aminah, JPPH KL', 't');
  if jsonb_array_length(j->'grants') = 1 and (j->'grants'->0->>'active')::boolean then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5 grant]'; end if;
  -- 6. export reference → register a pack; unknown reference refused
  ref := public.eab_admin_export('case_pack', 'pdf', null, jsonb_build_object('case', cid), 't')->>'reference';
  begin perform public.eab_admin_pack_register(jsonb_build_object('case_id', cid, 'reference', 'EAB-00000000-000000', 'kind', 'case_pack',
          'format', 'pdf', 'file_name', 'x.pdf', 'sha256', sha, 'bytes', 100), 't'); fail := fail + 1; msgs := msgs || ' [6a unknown ref]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_pack_register(jsonb_build_object('case_id', cid, 'reference', ref, 'kind', 'case_pack', 'format', 'pdf',
        'file_name', ref || '.pdf', 'sha256', sha, 'content_sha256', repeat('cd', 32), 'bytes', 1234), 't');
  pid := (j->>'id')::uuid;
  if not (j->>'stored')::boolean then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6b register]'; end if;
  -- 7. vault upload rule: only the registered path; stored only once the object exists
  if public.eab_vault_can_upload(pid::text || '/' || sha) and not public.eab_vault_can_upload(pid::text || '/' || repeat('00', 32))
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [7 upload rule]'; end if;
  begin perform public.eab_admin_pack_stored(pid); fail := fail + 1; msgs := msgs || ' [7b stored without file]';
  exception when no_data_found then pass := pass + 1; end;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('eab-vault', pid::text || '/' || sha, o);
    pass := pass + 1;
  exception when others then fail := fail + 1; msgs := msgs || ' [7c upload as owner: ' || sqlerrm || ']'; end;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('eab-vault', pid::text || '/' || repeat('00', 32), o);
    fail := fail + 1; msgs := msgs || ' [7d unregistered upload allowed]';
  exception when insufficient_privilege then pass := pass + 1; end;
  j := public.eab_admin_pack_stored(pid);
  if (j->>'stored')::boolean then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [7e stored]'; end if;
  if not public.eab_vault_can_upload(pid::text || '/' || sha) then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [7f second upload allowed]'; end if;
  execute 'reset role';

  -- 8. pack and case records cannot be changed or deleted, even by the database owner
  begin update public.eab_reg_packs set sha256 = repeat('ee', 32) where id = pid; fail := fail + 1; msgs := msgs || ' [8a pack changed]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin delete from public.eab_reg_packs where id = pid; fail := fail + 1; msgs := msgs || ' [8b pack deleted]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin delete from public.eab_reg_cases where id = cid; fail := fail + 1; msgs := msgs || ' [8c case deleted]';
  exception when insufficient_privilege then pass := pass + 1; end;

  -- 9. regulator: sees only this case and this agent; no grants list; cannot change anything
  perform set_config('request.jwt.claims', json_build_object('sub', r, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.eab_admin_cases();
  if jsonb_array_length(j) = 1 and (j->0->>'id')::uuid = cid then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [9a cases ' || jsonb_array_length(j) || ']'; end if;
  j := public.eab_admin_case(cid);
  if not (j ? 'grants') and jsonb_array_length(j->'packs') = 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [9b case view]'; end if;
  j := public.eab_admin_agent(a);
  if (j->>'user_id')::uuid = a then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [9c agent]'; end if;
  if x is not null then
    begin perform public.eab_admin_agent(x); fail := fail + 1; msgs := msgs || ' [9d other agent seen]';
    exception when insufficient_privilege then pass := pass + 1; end;
  else pass := pass + 1; end if;
  if jsonb_array_length(public.eab_admin_vault()) = 1 and public.eab_admin_check_file(sha) is not null
     and public.eab_admin_pack_download(pid)->>'path' = pid::text || '/' || sha and public.eab_vault_can_read(pid::text || '/' || sha)
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [9e vault]'; end if;
  begin perform public.eab_admin_case_create(jsonb_build_object('requester_type','other','requester_name','x','received_on','2026-10-20','description','x'), 't');
    fail := fail + 1; msgs := msgs || ' [9f regulator created case]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_case_update(cid, '{"status":"closed"}', 'x', 't'); fail := fail + 1; msgs := msgs || ' [9g regulator closed case]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_export('agent_profile', 'pdf', a); fail := fail + 1; msgs := msgs || ' [9h regulator exported]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';

  -- 10. revoke: regulator loses the case, the agent and the vault; login switched off
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.eab_admin_case_revoke(cid, r, 'Request answered', 't');
  if not (j->'grants'->0->>'active')::boolean then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [10a revoke]'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', r, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.eab_admin_me() is null then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [10b still signed in]'; end if;
  begin perform public.eab_admin_cases(); fail := fail + 1; msgs := msgs || ' [10c still sees cases]';
  exception when insufficient_privilege then pass := pass + 1; end;
  if not public.eab_vault_can_read(pid::text || '/' || sha) then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [10d still reads file]'; end if;
  execute 'reset role';

  -- 11. close the case: no more agents or grants; actions logged; chain intact
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.eab_admin_case_update(cid, '{"status":"closed","outcome":"Records supplied to JPPH"}', 'Supplied and acknowledged', 't');
  if j->>'status' = 'closed' and j->>'closed_at' is not null then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [11a close]'; end if;
  begin perform public.eab_admin_case_add_agent(cid, coalesce(x, a), null, null, 'late', 't'); fail := fail + 1; msgs := msgs || ' [11b added to closed]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  execute 'reset role';
  select count(*) into n from public.eab_admin_actions where target_ref like 'CASE-%' or action in ('pack_created', 'regulator_granted', 'regulator_revoked');
  if n >= 6 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [11c actions ' || n || ']'; end if;
  if (public.eab_admin_check_chain('eab_admin_actions')->>'ok')::boolean and (public.eab_admin_check_chain('eab_admin_access')->>'ok')::boolean
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [11d chain]'; end if;

  raise exception 'TEST RESULT: % passed, % failed.%', pass, fail, msgs;
end
$test$;
