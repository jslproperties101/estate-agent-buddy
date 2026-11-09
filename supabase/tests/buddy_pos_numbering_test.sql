-- Tests for supabase/proposed/20261109200000_buddy_pos_numbering.sql (Batch 7). Run in the SQL editor of the TEST project
-- after the migration. Everything is rolled back: the block ends by raising 'TEST RESULT ...'. Uses a made-up workspace with
-- two existing users as owner and agent, and a third (if any) as an outsider.
do $test$
declare
  ws uuid := gen_random_uuid(); own uuid; ag uuid; outsider uuid;
  pass int := 0; fail int := 0; msgs text := '';
  j jsonb; j2 jsonb; t text; n int;
begin
  select id into own from auth.users order by created_at limit 1;
  select id into ag from auth.users where id <> own order by created_at limit 1;
  select id into outsider from auth.users where id not in (own, ag) order by created_at limit 1;
  if own is null or ag is null then raise exception 'needs 2 users in auth.users'; end if;
  insert into public.eab_workspaces (id, name, created_by) values (ws, 'Batch 7 numbering test', own);
  insert into public.eab_members (workspace_id, user_id, email, role, active)
  select ws, u.id, coalesce(u.email, u.id::text || '@test.invalid'), case when u.id = own then 'owner' else 'agent' end, true from auth.users u where u.id in (own, ag);

  -- letters
  if public.eab_acct_letter_of(1) = 'A' and public.eab_acct_letter_of(26) = 'Z' and public.eab_acct_letter_of(27) = 'AA' and public.eab_acct_letter_of(703) = 'AAA' then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n0 letters'; end if;

  -- 1. device mode (default): each phone its own letter, kept, never shared
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', own::text, true);
  set local role authenticated;
  j := public.eab_acct_numbering_get(ws, 'phone-own-1');
  if j->>'mode' = 'device' and j->>'letter' = 'A' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n1a ' || j::text; end if;
  j := public.eab_acct_numbering_get(ws, 'phone-own-1');
  if j->>'letter' = 'A' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n1b letter changed: ' || j::text; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ag, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ag::text, true);
  set local role authenticated;
  j := public.eab_acct_numbering_get(ws, 'phone-agent-1');
  if j->>'letter' = 'B' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n1c second phone: ' || j::text; end if;
  begin perform public.eab_acct_take(ws, 'INV', 5, 'phone-agent-1', 0); fail := fail + 1; msgs := msgs || E'\n1d numbers taken in device mode';
  exception when others then pass := pass + 1; end;
  begin perform public.eab_acct_numbering_set(ws, 'blocks'); fail := fail + 1; msgs := msgs || E'\n1e an agent changed the numbering';
  exception when others then pass := pass + 1; end;
  begin perform public.eab_acct_numbering_get(ws, 'bad id!'); fail := fail + 1; msgs := msgs || E'\n1f bad device id accepted';
  exception when others then pass := pass + 1; end;
  begin perform 1 from public.eab_acct_letters; fail := fail + 1; msgs := msgs || E'\n1g phone read the letters table';
  exception when others then pass := pass + 1; end;
  reset role;

  -- 2. blocks: one series, never repeats, starts above what the phones already used
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', own::text, true);
  set local role authenticated;
  t := public.eab_acct_numbering_set(ws, 'blocks');
  j := public.eab_acct_take(ws, 'INV', 50, 'phone-own-1', 12);
  if (j->>'from')::int = 13 and (j->>'to')::int = 62 and j->>'mode' = 'blocks' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n2a ' || j::text; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ag, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ag::text, true);
  set local role authenticated;
  j2 := public.eab_acct_take(ws, 'INV', 50, 'phone-agent-1', 3);
  if (j2->>'from')::int = 63 and (j2->>'to')::int = 112 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n2b ' || j2::text; end if;
  j2 := public.eab_acct_take(ws, 'JV', 1, 'phone-agent-1', 0);
  if (j2->>'from')::int = 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n2c each series counts on its own: ' || j2::text; end if;
  begin perform public.eab_acct_take(ws, 'INV', 101, 'phone-agent-1', 0); fail := fail + 1; msgs := msgs || E'\n2d more than 100';
  exception when others then pass := pass + 1; end;
  begin perform public.eab_acct_take(ws, 'XYZ', 1, 'phone-agent-1', 0); fail := fail + 1; msgs := msgs || E'\n2e unknown series';
  exception when others then pass := pass + 1; end;
  reset role;

  -- 3. server mode: one at a time, same series
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', own::text, true);
  set local role authenticated;
  t := public.eab_acct_numbering_set(ws, 'server');
  j := public.eab_acct_take(ws, 'INV', 1, 'phone-own-1', 0);
  if (j->>'from')::int = 113 and j->>'mode' = 'server' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n3a ' || j::text; end if;
  j := public.eab_acct_numbering_get(ws, 'phone-own-1');
  if j->>'mode' = 'server' and j->>'letter' is null then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n3b ' || j::text; end if;
  reset role;

  -- 4. every hand-out written down, no overlap
  select count(*) into n from public.eab_acct_blocks b1 join public.eab_acct_blocks b2
    on b1.workspace_id = b2.workspace_id and b1.series = b2.series and b1.id < b2.id and b1.from_no <= b2.to_no and b2.from_no <= b1.to_no
   where b1.workspace_id = ws;
  if n = 0 and (select count(*) from public.eab_acct_blocks where workspace_id = ws) = 4 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n4a overlaps or missing log rows'; end if;

  -- 5. an outsider gets nothing
  if outsider is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', outsider::text, true);
    set local role authenticated;
    begin perform public.eab_acct_take(ws, 'INV', 1, 'phone-out-1', 0); fail := fail + 1; msgs := msgs || E'\n5a outsider took numbers';
    exception when others then pass := pass + 1; end;
    begin perform public.eab_acct_numbering_get(ws, 'phone-out-1'); fail := fail + 1; msgs := msgs || E'\n5b outsider got a letter';
    exception when others then pass := pass + 1; end;
    reset role;
  end if;

  raise exception 'TEST RESULT: % passed, % failed%', pass, fail, msgs;
end
$test$;
