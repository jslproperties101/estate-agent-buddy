-- Tests for 20261021200000_mainforadmin_d_feed.sql (Stage D: feed, groups, order, codes, settings).
-- One block that ends by raising 'TEST RESULT ...', so EVERY change is rolled back. Needs at least 3 users in auth.users.
-- Good = "TEST RESULT: n passed, 0 failed".
do $test$
declare
  a uuid; o uuid; v uuid;
  pass int := 0; fail int := 0; msgs text := '';
  j jsonb; n int; n0 int; ok boolean;
  news1 uuid; news2 uuid; news3 uuid; ann uuid; p1 uuid; p2 uuid; ren uuid; code text;
  as_user constant text := 'select set_config(''request.jwt.claims'', json_build_object(''sub'', %L, ''role'', ''authenticated'')::text, true), set_config(''request.jwt.claim.sub'', %L, true)';
begin
  select id into a from auth.users order by created_at limit 1;
  select id into o from auth.users where id <> a order by created_at limit 1;
  select id into v from auth.users where id not in (a, o) order by created_at limit 1;
  if v is null then raise exception 'needs at least 3 users'; end if;
  insert into public.eab_admins (user_id, email, role) select o, email, 'owner' from auth.users where id = o
    on conflict (user_id) do update set role = 'owner', active = true, expires_at = null;
  delete from public.eab_admins where user_id in (a, v);
  delete from public.eab_licences where user_id in (a, v);
  select count(*) into n0 from public.eab_admin_actions;

  ---------------------------------------------------------------- an agent cannot publish or read the tables
  execute format(as_user, a, a); execute 'set local role authenticated';
  begin perform public.eab_admin_feed_save('{"kind":"news","title_en":"x"}'::jsonb, 'x'); fail := fail + 1; msgs := msgs || ' [1 agent published]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform count(*) from public.eab_feed_items; fail := fail + 1; msgs := msgs || ' [2 agent read table]';
  exception when insufficient_privilege then pass := pass + 1; end;
  perform public.eab_set_my_licence('REN', 'REN 11111');        -- a is a REN
  execute 'reset role';

  ---------------------------------------------------------------- the owner writes, targets, orders and makes a code
  execute format(as_user, o, o); execute 'set local role authenticated';
  begin perform public.eab_admin_feed_save('{"kind":"news","title_en":"x"}'::jsonb, ' '); fail := fail + 1; msgs := msgs || ' [3 no reason]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  news1 := (public.eab_admin_feed_save('{"kind":"news","title_en":"Rates up","title_bm":"Kadar naik","body_en":"OPR +0.25"}'::jsonb, 'Test')->>'id')::uuid;
  ren := (public.eab_admin_group_save('{"name":"REN only","filters":{"licence_types":["REN"]},"priority":10}'::jsonb, 'Test')->>'id')::uuid;
  news2 := (public.eab_admin_feed_save(jsonb_build_object('kind','news','title_en','For RENs','audience','groups','group_ids',jsonb_build_array(ren)), 'Test')->>'id')::uuid;
  news3 := (public.eab_admin_feed_save('{"kind":"news","title_en":"Old"}'::jsonb, 'Test')->>'id')::uuid;
  ann := (public.eab_admin_feed_save('{"kind":"announcement","title_en":"Server work","display":"popup"}'::jsonb, 'Test')->>'id')::uuid;
  p1 := (public.eab_admin_feed_save('{"kind":"project","title_en":"Taman A","audience":"codes","project":{"developer":"Dev A"}}'::jsonb, 'Test')->>'id')::uuid;
  p2 := (public.eab_admin_feed_save('{"kind":"project","title_en":"Taman B","audience":"codes"}'::jsonb, 'Test')->>'id')::uuid;
  begin perform public.eab_admin_feed_save('{"kind":"announcement","title_en":"No display"}'::jsonb, 'Test'); fail := fail + 1; msgs := msgs || ' [4 announcement without banner/popup]';
  exception when check_violation then pass := pass + 1; end;
  perform public.eab_admin_feed_set_status(news1, 'published', 'Test');
  perform pg_sleep(0.01);
  perform public.eab_admin_feed_set_status(news2, 'published', 'Test');
  perform public.eab_admin_feed_set_status(news3, 'published', 'Test');
  perform public.eab_admin_feed_set_status(news3, 'withdrawn', 'Test');
  perform public.eab_admin_feed_set_status(ann, 'published', 'Test');
  perform public.eab_admin_feed_set_status(p1, 'published', 'Test');
  perform public.eab_admin_feed_set_status(p2, 'published', 'Test');
  perform public.eab_admin_feed_order_set(ren, array[news1, news2], 'Test: RENs see the rates first');
  code := public.eab_admin_code_create('Launch bundle', array[p1, p2], now() + interval '1 day', null, 'Test')->>'code';
  if code ~ '^[A-Z0-9]{10}$' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5 code ' || coalesce(code, 'null') || ']'; end if;
  begin perform public.eab_admin_code_create('x', array[news1], null, null, 'Test'); fail := fail + 1; msgs := msgs || ' [6 code for news]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_group_list();
  if exists (select 1 from jsonb_array_elements(j) g where (g->>'id')::uuid = ren and (g->>'agents')::int >= 1) then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [7 group count]'; end if;
  execute 'reset role';

  ---------------------------------------------------------------- the REN agent
  execute format(as_user, a, a); execute 'set local role authenticated';
  j := public.eab_my_feed('news', 'bm');
  if jsonb_array_length(j) = 2 and (j->0->>'id')::uuid = news1 and (j->1->>'id')::uuid = news2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [8 REN order ' || j::text || ']'; end if;
  if j->0->>'title' = 'Kadar naik' and j->1->>'title' = 'For RENs' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [9 language fallback]'; end if;
  j := public.eab_my_feed('project', 'en');
  if jsonb_array_length(j) = 0 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [10 projects without code]'; end if;
  j := public.eab_redeem_code('WRONGCODE1');
  if (j->>'ok')::boolean = false and j->>'reason' = 'not_found' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [11 wrong code ' || j::text || ']'; end if;
  j := public.eab_redeem_code(lower(substr(code, 1, 5)) || '-' || substr(code, 6));   -- typed with a dash, lower case
  if (j->>'ok')::boolean and (j->>'added')::int = 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [12 redeem ' || j::text || ']'; end if;
  j := public.eab_my_feed('project', 'en');
  if jsonb_array_length(j) = 2 and (j->0->>'from_code')::boolean then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [13 projects after code]'; end if;
  ok := public.eab_feed_mark(news1, 'opened');
  if ok and (select (x->>'opened_at') is not null from jsonb_array_elements(public.eab_my_feed('news', 'en')) x where (x->>'id')::uuid = news1) then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [14 opened]'; end if;
  if not public.eab_feed_mark(news3, 'opened') then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [15 marked a withdrawn item]'; end if;
  perform public.eab_feed_mark(ann, 'acknowledged');
  j := public.eab_my_feed('announcement', 'en');
  if jsonb_array_length(j) = 1 and j->0->>'display' = 'popup' and j->0->>'acknowledged_at' is not null then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [16 announcement ' || j::text || ']'; end if;
  execute 'reset role';

  ---------------------------------------------------------------- another agent (not a REN, no code)
  execute format(as_user, v, v); execute 'set local role authenticated';
  j := public.eab_my_feed(null, 'zh');
  if jsonb_array_length(j) = 2 and not exists (select 1 from jsonb_array_elements(j) x where (x->>'id')::uuid in (news2, news3, p1, p2))
  then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [17 other agent sees ' || j::text || ']'; end if;
  if not public.eab_feed_mark(news2, 'opened') then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [18 marked an item outside the audience]'; end if;
  for n in 1 .. 20 loop perform public.eab_redeem_code('NOPE' || n); end loop;
  j := public.eab_redeem_code(code);
  if j->>'reason' = 'too_many' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [19 no wait after 20 wrong codes]'; end if;
  execute 'reset role';

  ---------------------------------------------------------------- withdrawing a project removes it (no archive); settings
  execute format(as_user, o, o); execute 'set local role authenticated';
  perform public.eab_admin_feed_set_status(p1, 'withdrawn', 'Test');
  j := public.eab_admin_set_settings('{"min_version":"2.5.0","min_version_mode":"hard","maintenance_on":true,"maintenance_message_bm":"Penyelenggaraan","update_url":"https://example.com/app"}'::jsonb, 'Test');
  begin perform public.eab_admin_set_settings('{"min_version_mode":"maybe"}'::jsonb, 'Test'); fail := fail + 1; msgs := msgs || ' [20 bad mode]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  j := public.eab_admin_feed_list('news');
  if exists (select 1 from jsonb_array_elements(j) x where (x->>'id')::uuid = news1 and (x->>'opened')::int = 1) then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [21 opened count]'; end if;
  execute 'reset role';
  execute format(as_user, a, a); execute 'set local role authenticated';
  j := public.eab_my_feed('project', 'en');
  if jsonb_array_length(j) = 1 and (j->0->>'id')::uuid = p2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [22 withdrawn project still shown]'; end if;
  execute 'reset role';
  execute 'set local role anon';
  j := public.eab_public_settings();
  if j->>'min_version' = '2.5.0' and j->>'min_version_mode' = 'hard' and (j->>'maintenance_on')::boolean and j->>'maintenance_message_bm' = 'Penyelenggaraan'
  then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [23 public settings ' || j::text || ']'; end if;
  begin perform public.eab_my_feed('news', 'en'); fail := fail + 1; msgs := msgs || ' [24 anon read the feed]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';

  ---------------------------------------------------------------- everything the admin did is in the tamper-proof log
  select count(*) - n0 into n from public.eab_admin_actions;
  if n >= 17 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [25 admin actions ' || n || ']'; end if;
  j := public.eab_admin_check_chain('eab_admin_actions');
  if (j->>'ok')::boolean then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [26 hash chain]'; end if;

  raise exception 'TEST RESULT: % passed, % failed%', pass, fail, msgs;
end $test$;
