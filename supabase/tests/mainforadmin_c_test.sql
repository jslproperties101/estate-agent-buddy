-- Tests for 20261021140000_mainforadmin_c_logging.sql. One block that ends by raising 'TEST RESULT ...', so EVERY change
-- is rolled back. Needs at least 1 user in auth.users. Good = "TEST RESULT: n passed, 0 failed".
do $test$
declare
  a uuid; pass int := 0; fail int := 0; msgs text := ''; n int; k int; old_id bigint;
begin
  select id into a from auth.users order by created_at limit 1;
  if a is null then raise exception 'needs at least 1 user'; end if;
  execute format('select set_config(''request.jwt.claims'', json_build_object(''sub'', %L, ''role'', ''authenticated'')::text, true), set_config(''request.jwt.claim.sub'', %L, true)', a, a);
  execute 'set local role authenticated';
  n := public.eab_log_usage(jsonb_build_array(
    jsonb_build_object('kind','command','name','command.understood','ok',true,'platform','tablet'),
    jsonb_build_object('kind','marketing','name','poster.created','ok',true,'platform','desktop'),
    jsonb_build_object('kind','language','name','lang.ms'),
    jsonb_build_object('kind','push','name','push.opened'),
    jsonb_build_object('kind','metric','name','startup.ms','value',1800),
    jsonb_build_object('kind','nonsense','name','x'),
    jsonb_build_object('kind','feature','name','x','platform','toaster')));
  if n = 5 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1 stored ' || n || ' of 5 good]'; end if;
  execute 'reset role';
  select count(*) into k from public.eab_usage_events where user_id = a and kind in ('command','marketing','language','push');
  if k = 4 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2 new kinds ' || k || ']'; end if;
  select count(*) into k from public.eab_usage_events where user_id = a and platform in ('tablet','desktop');
  if k = 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [3 platforms ' || k || ']'; end if;
  -- old detail is kept
  insert into public.eab_usage_events (user_id, at, kind, name) values (a, now() - interval '800 days', 'feature', 'old.thing') returning id into old_id;
  k := public.eab_usage_cleanup();
  if k = 0 and exists (select 1 from public.eab_usage_events where id = old_id) then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [4 old detail deleted]'; end if;
  begin insert into public.eab_usage_events (user_id, kind, name) values (a, 'nonsense', 'x'); fail := fail + 1; msgs := msgs || ' [5 bad kind accepted]';
  exception when check_violation then pass := pass + 1; end;
  raise exception 'TEST RESULT: % passed, % failed%', pass, fail, msgs;
end $test$;
