-- Tests for 20261021210000_push_broadcast_counts.sql (JoyChange010-03: push alerts for posts, sent / delivered / opened).
-- One block that ends by raising 'TEST RESULT ...', so EVERY change is rolled back. Needs at least 4 users in auth.users.
-- Good = "TEST RESULT: n passed, 0 failed".
do $test$
declare
  a uuid; o uuid; v uuid; d uuid;
  pass int := 0; fail int := 0; msgs text := '';
  j jsonb; n int; n0 int; ok boolean; s text;
  p1 uuid; p2 uuid; p3 uuid; ren uuid;
  as_user constant text := 'select set_config(''request.jwt.claims'', json_build_object(''sub'', %L, ''role'', ''authenticated'')::text, true), set_config(''request.jwt.claim.sub'', %L, true)';
  procedure_ok boolean;
begin
  select id into a from auth.users order by created_at limit 1;
  select id into o from auth.users where id <> a order by created_at limit 1;
  select id into v from auth.users where id not in (a, o) order by created_at limit 1;
  select id into d from auth.users where id not in (a, o, v) order by created_at limit 1;
  if d is null then raise exception 'needs at least 4 users'; end if;
  insert into public.eab_admins (user_id, email, role) select o, email, 'owner' from auth.users where id = o
    on conflict (user_id) do update set role = 'owner', active = true, expires_at = null;
  insert into public.eab_admins (user_id, email, role) select v, email, 'viewer' from auth.users where id = v
    on conflict (user_id) do update set role = 'viewer', active = true, expires_at = null;
  delete from public.eab_admins where user_id in (a, d);
  delete from public.eab_licences where user_id in (a, d);
  delete from public.eab_push_tokens where user_id in (a, o, v, d);
  -- a has two phones (one will be refused), d has one; o and v have none
  insert into public.eab_push_tokens (token, user_id, email, app_id, lang) values
    ('tok-a-good-000000000000000', a, 'a', 'com.jslproperties.estateagentbuddy.qa', 'bm'),
    ('tok-a-dead-000000000000000', a, 'a', 'com.jslproperties.estateagentbuddy.qa', 'bm'),
    ('tok-d-good-000000000000000', d, 'd', 'com.jslproperties.estateagentbuddy.qa', 'en');
  select count(*) into n0 from public.eab_admin_actions;

  execute format(as_user, a, a); execute 'set local role authenticated';
  perform public.eab_set_my_licence('REN', 'REN 22222');        -- a is a REN, d is not
  execute 'reset role';

  ---------------------------------------------------------------- queueing
  execute format(as_user, o, o); execute 'set local role authenticated';
  p1 := (public.eab_admin_feed_save('{"kind":"news","title_en":"Rates up","title_bm":"Kadar naik","body_en":"OPR  +0.25\nfrom today","push_alert":true}'::jsonb, 'Test')->>'id')::uuid;
  ren := (public.eab_admin_group_save('{"name":"REN only","filters":{"licence_types":["REN"]},"priority":10}'::jsonb, 'Test')->>'id')::uuid;
  p2 := (public.eab_admin_feed_save(jsonb_build_object('kind','news','title_en','For RENs','audience','groups','group_ids',jsonb_build_array(ren),'push_alert',true), 'Test')->>'id')::uuid;
  p3 := (public.eab_admin_feed_save('{"kind":"news","title_en":"Quiet"}'::jsonb, 'Test')->>'id')::uuid;
  execute 'reset role';
  if not exists (select 1 from public.eab_push_broadcasts where item_id in (p1, p2, p3)) then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1 draft queued]'; end if;
  execute format(as_user, o, o); execute 'set local role authenticated';
  perform public.eab_admin_feed_set_status(p1, 'published', 'Test');
  perform public.eab_admin_feed_set_status(p2, 'published', 'Test');
  perform public.eab_admin_feed_set_status(p3, 'published', 'Test');
  execute 'reset role';
  select count(*) into n from public.eab_push_broadcasts where item_id in (p1, p2) and status = 'queued';
  if n = 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2 published with alert not queued: ' || n || ']'; end if;
  if not exists (select 1 from public.eab_push_broadcasts where item_id = p3) then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [3 no-alert post queued]'; end if;

  ---------------------------------------------------------------- an agent cannot start, read or fake anything
  execute format(as_user, a, a); execute 'set local role authenticated';
  begin perform public.eab_push_feed_claim(p1); fail := fail + 1; msgs := msgs || ' [4 agent claimed]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform count(*) from public.eab_push_deliveries; fail := fail + 1; msgs := msgs || ' [5 agent read deliveries]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_push_feed_finish(p1, '[]'::jsonb); fail := fail + 1; msgs := msgs || ' [6 agent finished]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform * from public.eab_push_feed_recipients(p1); fail := fail + 1; msgs := msgs || ' [7 agent listed recipients]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_push_report(p1); fail := fail + 1; msgs := msgs || ' [8 agent read report]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';

  ---------------------------------------------------------------- a viewer can read but not send
  execute format(as_user, v, v); execute 'set local role authenticated';
  begin perform public.eab_push_feed_claim(p1); fail := fail + 1; msgs := msgs || ' [9 viewer claimed]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';

  ---------------------------------------------------------------- the owner claims once; it is logged
  execute format(as_user, o, o); execute 'set local role authenticated';
  j := to_jsonb(public.eab_push_feed_queued());
  if j @> to_jsonb(array[p1, p2]) then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [10 queued list ' || j::text || ']'; end if;
  ok := public.eab_push_feed_claim(p1, 'test');
  if ok then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [11 first claim refused]'; end if;
  ok := public.eab_push_feed_claim(p1, 'test');
  if not ok then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [12 claimed twice]'; end if;
  ok := public.eab_push_feed_claim(p3, 'test');
  if not ok then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [13 claimed a post without alert]'; end if;
  execute 'reset role';
  if exists (select 1 from public.eab_admin_actions where action = 'push_broadcast_started' and target_ref = 'eab_feed_items:' || p1) then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || ' [14 claim not in admin log]'; end if;

  ---------------------------------------------------------------- recipients: who may see it, in their language
  execute 'set local role service_role';
  select count(*) into n from public.eab_push_feed_recipients(p1) r where r.user_id = a;
  if n = 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [15 a should have 2 phones: ' || n || ']'; end if;
  select r.title into s from public.eab_push_feed_recipients(p1) r where r.user_id = a limit 1;
  if s = 'Kadar naik' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [16 BM title: ' || coalesce(s, 'null') || ']'; end if;
  select r.body into s from public.eab_push_feed_recipients(p1) r where r.user_id = a limit 1;
  if s = 'OPR +0.25 from today' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [17 BM falls back to English body, spaces tidied: ' || coalesce(s, 'null') || ']'; end if;
  select count(*) into n from public.eab_push_feed_recipients(p1) r where r.user_id = o and r.token is null;
  if n = 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [18 no-phone agent missing]'; end if;
  select count(*) into n from public.eab_push_feed_recipients(p2) r where r.user_id <> a;
  if n = 0 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [19 group post reached non-RENs: ' || n || ']'; end if;
  execute 'reset role';
  update auth.users set banned_until = now() + interval '1 day' where id = d;
  execute 'set local role service_role';
  select count(*) into n from public.eab_push_feed_recipients(p1) r where r.user_id = d;
  if n = 0 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [20 suspended agent gets push]'; end if;
  execute 'reset role';
  update auth.users set banned_until = null where id = d;

  ---------------------------------------------------------------- finish: counts per agent
  execute 'set local role service_role';
  j := public.eab_push_feed_finish(p1, jsonb_build_array(
         jsonb_build_object('user_id', a, 'status', 'sent'),
         jsonb_build_object('user_id', d, 'status', 'failed', 'error', 'UNAVAILABLE 503!'),
         jsonb_build_object('user_id', o, 'status', 'no_phone'),
         jsonb_build_object('user_id', v, 'status', 'no_phone')));
  execute 'reset role';
  if j = '{"targeted":4,"sent":1,"failed":1,"no_phone":2}'::jsonb then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [21 counts ' || j::text || ']'; end if;
  select error into s from public.eab_push_deliveries where item_id = p1 and user_id = d;
  if s = 'unavailable_503_' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [22 error kept as a code: ' || coalesce(s, 'null') || ']'; end if;
  if (select status from public.eab_push_broadcasts where item_id = p1) = 'done' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [23 not done]'; end if;
  -- a repeat after a half-finished send never turns "sent" into "failed"
  execute 'set local role service_role';
  perform public.eab_push_feed_finish(p1, jsonb_build_array(jsonb_build_object('user_id', a, 'status', 'failed', 'error', 'x')));
  execute 'reset role';
  if (select status from public.eab_push_deliveries where item_id = p1 and user_id = a) = 'sent' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [24 sent downgraded]'; end if;

  ---------------------------------------------------------------- the phone reports received / opened
  execute format(as_user, a, a); execute 'set local role authenticated';
  ok := public.eab_push_ack(p1, 'opened');
  if ok then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [25 opened not counted]'; end if;
  begin perform public.eab_push_ack(p1, 'deleted'); fail := fail + 1; msgs := msgs || ' [26 unknown mark accepted]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  execute 'reset role';
  execute format(as_user, d, d); execute 'set local role authenticated';
  ok := public.eab_push_ack(p1, 'received');
  if not ok then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [27 a failed send was counted as delivered]'; end if;
  ok := public.eab_push_ack(p2, 'received');
  if not ok then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [28 ack for a push never sent to him]'; end if;
  execute 'reset role';

  ---------------------------------------------------------------- the report
  execute format(as_user, v, v); execute 'set local role authenticated';
  j := public.eab_admin_push_report(p1);
  if (j->>'sent')::int = 1 and (j->>'delivered')::int = 1 and (j->>'opened')::int = 1 and (j->>'failed')::int = 1 and (j->>'no_phone')::int = 2
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [29 report ' || j::text || ']'; end if;
  j := public.eab_admin_push_list();
  if jsonb_array_length(j) >= 2 and exists (select 1 from jsonb_array_elements(j) e where e->>'item_id' = p2::text and e->>'status' = 'queued')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [30 list]'; end if;
  execute 'reset role';

  ---------------------------------------------------------------- a send that died half-way can be retried after 15 minutes; a withdrawn post cannot
  execute format(as_user, o, o); execute 'set local role authenticated';
  ok := public.eab_push_feed_claim(p2, 'test');
  execute 'reset role';
  update public.eab_push_broadcasts set started_at = now() - interval '20 minutes' where item_id = p2;
  execute format(as_user, o, o); execute 'set local role authenticated';
  ok := public.eab_push_feed_claim(p2, 'test');
  if ok then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [31 stuck send not retried]'; end if;
  perform public.eab_admin_feed_set_status(p2, 'withdrawn', 'Test');
  execute 'reset role';
  update public.eab_push_broadcasts set status = 'queued' where item_id = p2;
  execute format(as_user, o, o); execute 'set local role authenticated';
  ok := public.eab_push_feed_claim(p2, 'test');
  if not ok then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [32 withdrawn post sent]'; end if;
  execute 'reset role';

  ---------------------------------------------------------------- records are kept: no cascade delete
  begin delete from auth.users where id = a; fail := fail + 1; msgs := msgs || ' [33 agent with push history deleted]';
  exception when foreign_key_violation then pass := pass + 1; end;

  raise exception 'TEST RESULT: % passed, % failed%', pass, fail, case when msgs <> '' then ' —' || msgs else '' end;
end $test$;
