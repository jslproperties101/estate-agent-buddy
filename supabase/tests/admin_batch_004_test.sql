-- Tests for 20261022000000_admin_batch_004_health.sql. Run in the SQL editor of the TEST project.
-- Everything is rolled back (the block ends by raising 'TEST RESULT ...'). Needs 3+ users in auth.users.
do $test$
declare
  o uuid; v uuid; x uuid;
  pass int := 0; fail int := 0; msgs text := '';
  j jsonb; n bigint; m bigint; bid uuid; today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  acc_before bigint; act_before bigint;
begin
  select id into o from auth.users order by created_at limit 1;
  select id into v from auth.users where id <> o order by created_at limit 1;
  select id into x from auth.users u where id not in (o, v)
     and not exists (select 1 from public.eab_admins ad where ad.user_id = u.id) order by created_at limit 1;
  insert into public.eab_admins (user_id, email, role) select o, email, 'owner' from auth.users where id = o
    on conflict (user_id) do update set role = 'owner', active = true, expires_at = null;
  insert into public.eab_admins (user_id, email, role) select v, email, 'viewer' from auth.users where id = v
    on conflict (user_id) do update set role = 'viewer', active = true, expires_at = null;
  select count(*) into acc_before from public.eab_admin_access;
  select count(*) into act_before from public.eab_admin_actions;

  -- ---------- owner ----------
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  -- 1. database health
  j := public.eab_admin_health_db();
  if (j->>'db_bytes')::bigint > 0 and jsonb_array_length(j->'tables') > 10 and (j->'connections'->>'max')::int > 0
     and j->'tables'->0 ? 'total_bytes' and j->'stats' ? 'cache_hit_pct'
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1 health_db]'; end if;
  -- 2. storage + today's reading; a second call keeps one row for today
  j := public.eab_admin_health_storage();
  perform public.eab_admin_health_storage();
  if (j->'today'->>'db_bytes')::bigint > 0 and exists (select 1 from jsonb_array_elements(j->'buckets') b where b->>'bucket' = 'eab-vault')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2a storage]'; end if;
  execute 'reset role';
  select count(*) into n from public.eab_health_daily where day = today;
  if n = 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2b daily rows ' || n || ']'; end if;
  select count(*) into n from storage.objects;
  if (j->'today'->>'storage_files')::bigint = n then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2c file count]'; end if;
  execute 'set local role authenticated';
  -- 3. limits: reason required; bad AWS state refused; change recorded
  begin perform public.eab_admin_set_health_limits('{"db_limit_mb": 8192}', '  ', 't'); fail := fail + 1; msgs := msgs || ' [3a no reason]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_set_health_limits('{"aws_backup": "maybe"}', 'r', 't'); fail := fail + 1; msgs := msgs || ' [3b bad aws]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_set_health_limits('{"db_limit_mb": 8192, "storage_limit_mb": 102400, "aws_backup": "set_up", "aws_note": "S3 bucket eab-backup"}', 'Supabase Pro plan', 't');
  if (j->>'db_limit_mb')::int = 8192 and j->>'aws_backup' = 'set_up' and j->>'aws_note' = 'S3 bucket eab-backup'
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [3c set limits]'; end if;
  -- 4. backup tests: future date, empty "what", bad result refused
  begin perform public.eab_admin_backup_test_add(jsonb_build_object('tested_on', today + 2, 'target', 'supabase', 'kind', 'restore_test', 'result', 'pass', 'what', 'x'), 't');
    fail := fail + 1; msgs := msgs || ' [4a future]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_backup_test_add(jsonb_build_object('tested_on', today, 'target', 'supabase', 'kind', 'restore_test', 'result', 'pass', 'what', ' '), 't');
    fail := fail + 1; msgs := msgs || ' [4b empty what]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  begin perform public.eab_admin_backup_test_add(jsonb_build_object('tested_on', today, 'target', 'supabase', 'kind', 'restore_test', 'result', 'great', 'what', 'x'), 't');
    fail := fail + 1; msgs := msgs || ' [4c bad result]';
  exception when check_violation then pass := pass + 1; end;
  -- 5. record a restore test
  j := public.eab_admin_backup_test_add(jsonb_build_object('tested_on', today - 1, 'target', 'supabase', 'kind', 'restore_test', 'result', 'pass',
        'what', 'Restored last night''s backup into a scratch project; 28 listings checked', 'duration_minutes', 40, 'notes', 'All present'), 't');
  bid := (j->>'id')::uuid;
  if j->>'ref' ~ '^BKT-\d{4}-\d{4}$' and (j->>'recorded_by')::uuid = o and (j->>'duration_minutes')::int = 40
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5 add ' || coalesce(j->>'ref', '') || ']'; end if;
  j := public.eab_admin_health_storage();
  if (j->'backup_tests'->'last_restore_pass'->>'id')::uuid = bid and (j->'limits'->>'storage_limit_mb')::int = 102400
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5b summary]'; end if;
  -- 6. sync, push, performance, problem reports
  j := public.eab_admin_sync_health(30, 't');
  execute 'reset role';
  select count(*) into n from public.eab_usage_events where kind = 'sync' and name = 'sync.run' and at > now() - interval '30 days';
  select count(distinct user_id) into m from public.eab_usage_events where kind = 'sync' and name = 'sync.run' and at > now() - interval '30 days';
  if (j->'totals'->>'runs')::bigint = n and jsonb_array_length(j->'agents') = m then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6a sync]'; end if;
  execute 'set local role authenticated';
  j := public.eab_admin_push_health();
  execute 'reset role';
  select count(distinct user_id) into n from public.eab_push_tokens;
  if (j->>'agents_with_phone')::bigint = n and jsonb_typeof(j->'broadcasts') = 'array' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6b push]'; end if;
  execute 'set local role authenticated';
  j := public.eab_admin_performance(30);
  execute 'reset role';
  select count(*) into n from public.eab_usage_events where kind = 'metric' and name = 'startup.ms' and at > now() - interval '30 days' and value is not null;
  if (j->'startup_all'->>'opens')::bigint = n then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6c performance]'; end if;
  execute 'set local role authenticated';
  j := public.eab_admin_error_reports(null, 50, 't');
  if jsonb_typeof(j->'reports') = 'array' and jsonb_typeof(j->'failures_7d') = 'array' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6d reports]'; end if;
  begin perform public.eab_admin_error_reports('lost', 50, 't'); fail := fail + 1; msgs := msgs || ' [6e bad status]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  execute 'reset role';

  -- ---------- viewer: dashboards yes, agent lists and changes no ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.eab_admin_health_db(); perform public.eab_admin_health_storage(); perform public.eab_admin_push_health();
    perform public.eab_admin_performance(7); perform public.eab_admin_backup_tests(10);
    pass := pass + 1;
  exception when others then fail := fail + 1; msgs := msgs || ' [7a viewer dashboards: ' || sqlerrm || ']'; end;
  begin perform public.eab_admin_sync_health(30, 't'); fail := fail + 1; msgs := msgs || ' [7b viewer sync list]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_error_reports(null, 10, 't'); fail := fail + 1; msgs := msgs || ' [7c viewer reports]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_backup_test_add(jsonb_build_object('tested_on', today, 'target', 'aws', 'kind', 'backup_check', 'result', 'pass', 'what', 'x'), 't');
    fail := fail + 1; msgs := msgs || ' [7d viewer add test]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_set_health_limits('{"db_limit_mb": 1}', 'r', 't'); fail := fail + 1; msgs := msgs || ' [7e viewer limits]';
  exception when insufficient_privilege then pass := pass + 1; end;
  -- viewer cannot read the tables directly
  begin perform 1 from public.eab_backup_tests limit 1; fail := fail + 1; msgs := msgs || ' [7f direct read]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';

  -- ---------- not an admin ----------
  if x is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin perform public.eab_admin_health_db(); fail := fail + 1; msgs := msgs || ' [8 non-admin]';
    exception when insufficient_privilege then pass := pass + 1; end;
    execute 'reset role';
  end if;
  if not has_function_privilege('anon', 'public.eab_admin_health_storage()', 'execute')
     and not has_function_privilege('authenticated', 'public.eab_health_snapshot()', 'execute')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [8b grants]'; end if;

  -- ---------- records cannot be changed, logs written, chain intact ----------
  begin update public.eab_backup_tests set result = 'fail' where id = bid; fail := fail + 1; msgs := msgs || ' [9a update]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin delete from public.eab_backup_tests where id = bid; fail := fail + 1; msgs := msgs || ' [9b delete]';
  exception when insufficient_privilege then pass := pass + 1; end;
  select count(*) into n from public.eab_admin_actions where seq > 0 and action in ('health_limits_changed', 'backup_test_recorded')
    and at >= now() - interval '1 minute';
  if n = 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [9c actions ' || n || ']'; end if;
  select count(*) into n from public.eab_admin_access where kind = 'search' and (target_ref like 'sync health%' or target_ref like 'problem reports%')
    and at >= now() - interval '1 minute';
  if n = 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [9d access ' || n || ']'; end if;
  if (public.eab_admin_check_chain('eab_admin_actions')->>'ok')::boolean and (public.eab_admin_check_chain('eab_admin_access')->>'ok')::boolean
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [9e chain]'; end if;

  raise exception 'TEST RESULT: % passed, % failed.%', pass, fail, msgs;
end
$test$;
