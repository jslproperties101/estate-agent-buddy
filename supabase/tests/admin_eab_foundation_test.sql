-- Tests for 20261021000000_admin_eab_foundation.sql. Run in the SQL editor of the TEST project.
-- Everything happens inside one block that ends by raising 'TEST RESULT ...', so ALL changes are rolled back.
-- Needs at least 3 users in auth.users, one of them with records. Reads "TEST RESULT: n passed, 0 failed" when good.
do $test$
declare
  a uuid; o uuid; r uuid; v uuid;          -- agent with records, owner, regulator, someone not on the list
  ws uuid; coll text; rid text;
  pass int := 0; fail int := 0; msgs text := '';
  j jsonb; n int; n2 int; ok boolean; em_o text; em_r text;
begin
  select user_id into a from public.eab_records group by user_id order by count(*) desc limit 1;
  select id into o from auth.users where id <> a order by created_at limit 1;
  select id into r from auth.users where id not in (a, o) order by created_at limit 1;
  select id into v from auth.users where id not in (a, o, r) order by created_at limit 1;
  if v is null then v := r; end if;
  select workspace_id, collection, id into ws, coll, rid from public.eab_records where user_id = a and collection = 'properties' limit 1;
  if rid is null then select workspace_id, collection, id into ws, coll, rid from public.eab_records where user_id = a limit 1; end if;

  select email into em_o from auth.users where id = o;
  select email into em_r from auth.users where id = r;
  -- setup as database owner
  insert into public.eab_admins (user_id, email, role) select o, email, 'owner' from auth.users where id = o;

  ---------------------------------------------------------------- 1. not on the list -> refused
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.eab_admin_search('jo');
    fail := fail + 1; msgs := msgs || ' [1 non-admin search allowed]';
  exception when insufficient_privilege then pass := pass + 1; end;
  -- 1b. me() is null for non-admin
  if public.eab_admin_me() is null then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1b me not null]'; end if;
  -- 1c. direct table read refused
  begin
    perform 1 from public.eab_admins limit 1;
    fail := fail + 1; msgs := msgs || ' [1c direct read allowed]';
  exception when insufficient_privilege then pass := pass + 1; end;
  -- 1d. internal writer not callable
  begin
    perform public.eab_admin_write_access('search', null, 'x', null, null);
    fail := fail + 1; msgs := msgs || ' [1d internal writer callable]';
  exception when insufficient_privilege then pass := pass + 1; end;
  -- 1e. logs cannot be read directly
  begin
    perform 1 from public.eab_admin_access limit 1;
    fail := fail + 1; msgs := msgs || ' [1e log read allowed]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';

  ---------------------------------------------------------------- 2. owner can do everything
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.eab_admin_signed_in('test-device');
  if j->>'role' = 'owner' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2 signed_in]'; end if;
  j := public.eab_admin_search(a::text);
  if jsonb_array_length(j) >= 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2b search by id]'; end if;
  j := public.eab_admin_agent(a);
  if (j->>'user_id')::uuid = a and j->'counts' <> '{}'::jsonb then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2c agent]'; end if;
  j := public.eab_admin_agent_records(a, coll, true);
  if jsonb_array_length(j) >= 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2d records]'; end if;
  j := public.eab_admin_record_history(ws, coll, rid);
  if jsonb_array_length(j) >= 1 and (j->0->>'current')::boolean then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2e history]'; end if;
  j := public.eab_admin_export('agent_profile', 'pdf', a);
  if j->>'reference' like 'EAB-________-______' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2f export ref]'; end if;
  -- 2g. reason required to add an admin
  begin
    perform public.eab_admin_set_admin(em_r, 'viewer', true, null, '  ');
    fail := fail + 1; msgs := msgs || ' [2g no reason accepted]';
  exception when others then
    if sqlerrm like '%reason is required%' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2g ' || sqlerrm || ']'; end if; end;
  -- 2h. cannot remove the last owner
  begin
    perform public.eab_admin_set_admin(em_o, 'viewer', true, null, 'test');
    fail := fail + 1; msgs := msgs || ' [2h last owner demoted]';
  exception when others then
    if sqlerrm like '%at least one active owner%' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2h ' || sqlerrm || ']'; end if; end;
  -- 2i. regulator needs expiry
  begin
    perform public.eab_admin_set_admin(em_r, 'regulator', true, null, 'test');
    fail := fail + 1; msgs := msgs || ' [2i regulator without expiry]';
  exception when others then
    if sqlerrm like '%needs an expiry%' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2i ' || sqlerrm || ']'; end if; end;
  -- 2j. add regulator with expiry -> audit action written
  j := public.eab_admin_set_admin(em_r, 'regulator', true, now() + interval '7 days', 'JPPH case test');
  if j->>'role' = 'regulator' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2j add regulator]'; end if;
  execute 'reset role';
  select count(*) into n from public.eab_admin_actions where action = 'admin_added' and target_user = r and reason = 'JPPH case test';
  if n = 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2k action logged]'; end if;

  ---------------------------------------------------------------- 3. regulator only sees scoped agents, cannot export
  perform set_config('request.jwt.claims', json_build_object('sub', r, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.eab_admin_agent(a);
    fail := fail + 1; msgs := msgs || ' [3 regulator saw unscoped agent]';
  exception when insufficient_privilege then pass := pass + 1; end;
  j := public.eab_admin_search(a::text);
  if jsonb_array_length(j) = 0 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [3b regulator search leaked]'; end if;
  execute 'reset role';
  insert into public.eab_admin_scopes (admin_user, agent_user, expires_at, created_by, case_ref) values (r, a, now() + interval '1 day', o, 'TEST');
  execute 'set local role authenticated';
  j := public.eab_admin_agent(a);
  if (j->>'user_id')::uuid = a then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [3c scoped view]'; end if;
  begin
    perform public.eab_admin_export('agent_profile', 'pdf', a);
    fail := fail + 1; msgs := msgs || ' [3d regulator exported]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin
    perform public.eab_admin_list_log('access');
    fail := fail + 1; msgs := msgs || ' [3e regulator read logs]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';
  -- 3f. expired regulator is locked out
  update public.eab_admins set expires_at = now() - interval '1 minute' where user_id = r;
  execute 'set local role authenticated';
  if public.eab_admin_me() is null then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [3f expired still in]'; end if;
  execute 'reset role';

  ---------------------------------------------------------------- 4. viewer and admin limits
  update public.eab_admins set role = 'viewer', expires_at = null where user_id = r;
  execute 'set local role authenticated';
  begin
    perform public.eab_admin_agent(a);
    fail := fail + 1; msgs := msgs || ' [4 viewer saw profile]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';
  update public.eab_admins set role = 'admin' where user_id = r;
  execute 'set local role authenticated';
  j := public.eab_admin_agent(a);
  if (j->>'user_id')::uuid = a then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [4b admin profile]'; end if;
  begin
    perform public.eab_admin_export('agent_profile', 'xlsx', a);
    fail := fail + 1; msgs := msgs || ' [4c admin exported]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';

  ---------------------------------------------------------------- 5. logs: chained, unchangeable, tamper detected
  select count(*) into n from public.eab_admin_access;
  if n >= 8 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5 access rows ' || n || ']'; end if;
  ok := (public.eab_admin_check_chain('eab_admin_access')->>'ok')::boolean and (public.eab_admin_check_chain('eab_admin_actions')->>'ok')::boolean;
  if ok then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5b chain broken]'; end if;
  begin
    update public.eab_admin_access set target_ref = 'changed' where seq = (select max(seq) from public.eab_admin_access);
    fail := fail + 1; msgs := msgs || ' [5c update allowed]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin
    delete from public.eab_admin_access where seq = (select max(seq) from public.eab_admin_access);
    fail := fail + 1; msgs := msgs || ' [5d delete allowed]';
  exception when insufficient_privilege then pass := pass + 1; end;
  -- simulate someone bypassing the triggers with database-owner powers: the check must notice
  alter table public.eab_admin_access disable trigger eab_admin_access_lock;
  update public.eab_admin_access set target_ref = 'tampered' where seq = (select min(seq) from public.eab_admin_access where kind = 'search');
  alter table public.eab_admin_access enable trigger eab_admin_access_lock;
  j := public.eab_admin_check_chain('eab_admin_access');
  if not (j->>'ok')::boolean then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5e tamper not detected]'; end if;

  ---------------------------------------------------------------- 6. every version kept (more than 25)
  select count(*) into n from public.eab_record_revisions where workspace_id = ws and collection = coll and record_id = rid;
  for i in 1..30 loop
    update public.eab_records set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('__test', i)
     where workspace_id = ws and collection = coll and id = rid;
  end loop;
  select count(*) into n2 from public.eab_record_revisions where workspace_id = ws and collection = coll and record_id = rid;
  if n2 - n = 30 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6 versions kept ' || (n2 - n) || '/30]'; end if;

  ---------------------------------------------------------------- 7. deleting an agent with records is blocked
  begin
    delete from auth.users where id = a;
    fail := fail + 1; msgs := msgs || ' [7 agent delete allowed]';
  exception when foreign_key_violation then pass := pass + 1; end;
  begin
    delete from public.eab_workspaces where id = ws;
    fail := fail + 1; msgs := msgs || ' [7b workspace delete allowed]';
  exception when foreign_key_violation then pass := pass + 1; end;

  ---------------------------------------------------------------- 8. anon cannot call admin functions
  execute 'set local role anon';
  begin
    perform public.eab_admin_me();
    fail := fail + 1; msgs := msgs || ' [8 anon allowed]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';

  raise exception 'TEST RESULT: % passed, % failed.%', pass, fail, msgs;
end
$test$;
