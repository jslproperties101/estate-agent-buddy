-- Tests for supabase/proposed/20261110100000_agency_licences.sql (Batch 5 part 2). Runs on the TEST project's SQL editor (after
-- the migration) or locally (supabase/tests/local/run-agency.sh). Everything is rolled back: the block ends by raising
-- 'TEST RESULT ...'. Needs 3 users in auth.users (a 4th is used as a 'limited' member when there is one). Uses a made-up
-- agency; the first user is also made a platform owner (eab_admins) for the length of the test.
do $test$
declare
  ws uuid := gen_random_uuid(); own uuid; ag uuid; outsider uuid; lim uuid;
  pass int := 0; fail int := 0; msgs text := '';
  j jsonb; r text; n int; inv uuid; inv2 uuid; e1 timestamptz; e2 timestamptz; ok boolean; pm int;
begin
  select id into own from auth.users order by created_at, id limit 1;
  select id into ag from auth.users where id <> own order by created_at, id limit 1;
  select id into outsider from auth.users where id not in (own, ag) order by created_at, id limit 1;
  select id into lim from auth.users where id not in (own, ag, outsider) order by created_at, id limit 1;
  if outsider is null then raise exception 'needs 3 users in auth.users'; end if;
  insert into public.eab_workspaces (id, name, created_by) values (ws, 'Batch 5b agency test', own);
  insert into public.eab_members (workspace_id, user_id, email, role, active, created_at)
  select ws, u.id, coalesce(u.email, u.id::text || '@test.invalid'), case when u.id = own then 'owner' when u.id = ag then 'agent' else 'limited' end, true,
         now() - case when u.id = own then interval '2 hours' when u.id = ag then interval '1 hour' else interval '30 minutes' end
    from auth.users u where u.id in (own, ag) or u.id = lim;
  delete from public.eab_admins where user_id = own;
  insert into public.eab_admins (user_id, email, role, active) values (own, coalesce((select email from auth.users where id = own), 'owner@test.invalid'), 'owner', true);
  update public.eab_billing_settings set live = false where id;
  select amount_sen into pm from public.eab_agency_prices where plan = 'agency_monthly';

  -- 1. prices on sale (signed-in), placeholders in place
  perform set_config('request.jwt.claims', json_build_object('sub', ag, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ag::text, true);
  set local role authenticated;
  j := public.eab_agency_price_list();
  if jsonb_array_length(j) = 4 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n1a prices: ' || j::text; end if;
  begin perform 1 from public.eab_agency_invoices; fail := fail + 1; msgs := msgs || E'\n1b a phone read the invoices table';
  exception when others then pass := pass + 1; end;
  begin perform public.eab_agency_apply('fpx', 'x', gen_random_uuid(), 'sandbox', null, 100, now()); fail := fail + 1; msgs := msgs || E'\n1c a phone applied a payment';
  exception when others then pass := pass + 1; end;
  begin perform public.eab_admin_agency_invoice_create(ws, 'agency_monthly', 1, null, 'sandbox', null, null, 'not an owner'); fail := fail + 1; msgs := msgs || E'\n1d an agent raised an invoice';
  exception when others then pass := pass + 1; end;
  reset role;

  -- 2. website checkout: only the agency owner or an admin; the amount is the price list's
  begin perform public.eab_agency_open_checkout(ws, ag, 'agency_seat_monthly', 3, 'sandbox'); fail := fail + 1; msgs := msgs || E'\n2a an agent opened a checkout';
  exception when others then pass := pass + 1; end;
  j := public.eab_agency_open_checkout(ws, own, 'agency_seat_monthly', 3, 'sandbox');
  inv := (j->>'id')::uuid;
  if (j->>'amount_sen')::int = 3 * (select amount_sen from public.eab_agency_prices where plan = 'agency_seat_monthly') and (j->>'seats')::int = 3 and j->>'no' like 'AGI-%' then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n2b checkout: ' || j::text; end if;
  begin perform public.eab_agency_open_checkout(ws, own, 'agency_seat_monthly', 0, 'sandbox'); fail := fail + 1; msgs := msgs || E'\n2c zero seats accepted';
  exception when others then pass := pass + 1; end;

  -- 3. a payment of the wrong amount changes nothing (and is recorded for the owner)
  r := public.eab_agency_apply('fpx', 'bill-wrong', inv, 'sandbox', 'bill-wrong', 100, now());
  if r = 'wrong-amount' and not exists (select 1 from public.eab_agency_licences where workspace_id = ws) then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n3a ' || r; end if;

  -- 4. the right amount: licence for 30 days, seats filled (owner first, then the agent; 'limited' never)
  r := public.eab_agency_apply('fpx', 'bill-ok', inv, 'sandbox', 'bill-ok', (j->>'amount_sen')::int, now());
  select period_end into e1 from public.eab_agency_licences where workspace_id = ws;
  if r = 'applied' and e1 between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n4a ' || r || ' ' || coalesce(e1::text, 'no licence'); end if;
  select count(*) into n from public.eab_agency_seats where workspace_id = ws;
  if n = 2 and exists (select 1 from public.eab_agency_seats where workspace_id = ws and user_id = ag) and (lim is null or not exists (select 1 from public.eab_agency_seats where workspace_id = ws and user_id = lim)) then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n4b seats filled: ' || n; end if;
  if (select status from public.eab_agency_invoices where id = inv) = 'paid' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n4c invoice not marked paid'; end if;

  -- 5. the same event again, and a second payment for the same invoice: nothing more
  r := public.eab_agency_apply('fpx', 'bill-ok', inv, 'sandbox', 'bill-ok', (j->>'amount_sen')::int, now());
  if r = 'duplicate' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n5a ' || r; end if;
  r := public.eab_agency_apply('stripe', 'cs_second', inv, 'sandbox', 'cs_second', (j->>'amount_sen')::int, now());
  if r = 'already-paid' and (select period_end from public.eab_agency_licences where workspace_id = ws) = e1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n5b ' || r; end if;

  -- 6. Pro through the agency: the seated agent yes, the outsider no; the phone sees an 'agency' row
  if public.eab_billing_has(ag, 'pro') and not public.eab_billing_has(outsider, 'pro') and not public.eab_billing_has(ag, 'pos') then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n6a coverage wrong'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ag, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ag::text, true);
  set local role authenticated;
  select count(*) into n from public.eab_my_billing() b where b.product = 'pro' and b.provider = 'agency' and b.status = 'active';
  if n = 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n6b my_billing agency rows: ' || n; end if;
  -- 7. what an agent sees of the agency: no members, no invoices
  j := public.eab_my_agency(ws);
  if (j->>'my_seat')::boolean and (j->'licence'->>'in_force')::boolean and not (j ? 'members') and not (j ? 'invoices') then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n7a agent view: ' || j::text; end if;
  begin perform public.eab_agency_seat_set(ws, ag, false); fail := fail + 1; msgs := msgs || E'\n7b an agent changed seats';
  exception when others then pass := pass + 1; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  set local role authenticated;
  begin perform public.eab_my_agency(ws); fail := fail + 1; msgs := msgs || E'\n7c an outsider read the agency';
  exception when others then pass := pass + 1; end;
  reset role;

  -- 8. the agency owner: sees members and seats; moves a seat; cannot go over the limit; 'limited' cannot hold one
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', own::text, true);
  set local role authenticated;
  j := public.eab_my_agency(ws);
  if jsonb_array_length(j->'members') >= 2 and (j->>'seats_used')::int = 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n8a owner view: ' || j::text; end if;
  n := public.eab_agency_seat_set(ws, ag, false);
  reset role; ok := public.eab_billing_has(ag, 'pro'); set local role authenticated;
  if n = 1 and not ok then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n8b unseat: ' || n; end if;
  n := public.eab_agency_seat_set(ws, ag, true);
  reset role; ok := public.eab_billing_has(ag, 'pro'); set local role authenticated;
  if n = 2 and ok then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n8c reseat: ' || n; end if;
  if lim is not null then
    begin perform public.eab_agency_seat_set(ws, lim, true); fail := fail + 1; msgs := msgs || E'\n8d a limited member got a seat';
    exception when others then pass := pass + 1; end;
  end if;
  begin perform public.eab_agency_seat_set(ws, outsider, true); fail := fail + 1; msgs := msgs || E'\n8e an outsider got a seat';
  exception when others then pass := pass + 1; end;

  -- 9. the platform owner: price change (logged), invoice with its own amount, marked paid by bank transfer
  j := public.eab_admin_agency_price_set('agency_monthly', null, 1, null, 'Batch 5b test: cap of one agent');
  if (j->>'seats_included')::int = 1 then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n9a price set: ' || j::text; end if;
  j := public.eab_admin_agency_invoice_create(ws, 'agency_monthly', null, 1000, 'sandbox', 'Batch 5b Realty Sdn Bhd', 'pro-rata test', 'Batch 5b test invoice');
  inv2 := (j->>'id')::uuid;
  if (j->>'amount_sen')::int = 1000 and (j->>'list_amount_sen')::int = pm and (j->>'seats')::int = 1
     then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n9b invoice: ' || j::text; end if;
  begin perform public.eab_admin_agency_invoice_mark_paid(inv2, '', 'Batch 5b test'); fail := fail + 1; msgs := msgs || E'\n9c marked paid without a bank reference';
  exception when others then pass := pass + 1; end;
  r := public.eab_admin_agency_invoice_mark_paid(inv2, 'MBB-TRF-0001', 'Batch 5b test transfer');
  reset role;
  select period_end into e2 from public.eab_agency_licences where workspace_id = ws;
  if r = 'applied' and e2 between e1 + interval '29 days 23 hours' and e1 + interval '30 days 1 hour' then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n9d mark paid: ' || r || ' end ' || coalesce(e2::text, '-'); end if;
  -- the new plan covers one agent: the most recently given seat goes
  select count(*) into n from public.eab_agency_seats where workspace_id = ws;
  if n = 1 and (select style from public.eab_agency_licences where workspace_id = ws) = 'agency' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n9e seats after a smaller plan: ' || n; end if;
  begin perform public.eab_agency_seat_set(ws, (select m.user_id from public.eab_members m where m.workspace_id = ws and m.role <> 'limited'
                and not exists (select 1 from public.eab_agency_seats s where s.workspace_id = ws and s.user_id = m.user_id) limit 1), true);
    fail := fail + 1; msgs := msgs || E'\n9f a seat over the limit';
  exception when others then pass := pass + 1; end;
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', own::text, true);
  set local role authenticated;

  -- 10. a void invoice: a payment for it is recorded but changes nothing, and shows in the owner's problems list
  j := public.eab_admin_agency_invoice_create(ws, 'agency_yearly', null, null, 'sandbox', null, null, 'Batch 5b void test');
  inv := (j->>'id')::uuid;
  j := public.eab_admin_agency_invoice_void(inv, 'Batch 5b raised by mistake');
  reset role;
  r := public.eab_agency_apply('fpx', 'bill-void', inv, 'sandbox', 'bill-void', (j->>'amount_sen')::int, now());
  if r = 'void-invoice' and (select period_end from public.eab_agency_licences where workspace_id = ws) = e2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n10a ' || r; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', own::text, true);
  set local role authenticated;
  j := public.eab_admin_agency_problems();
  if exists (select 1 from jsonb_array_elements(j) x where x->>'event_id' in ('bill-void', 'bill-wrong')) and not exists (select 1 from jsonb_array_elements(j) x where x->>'event_id' = 'bill-ok') then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n10b problems list'; end if;
  j := public.eab_admin_agency_invoices(null, 50);
  if (select count(*) from jsonb_array_elements(j) x where (x->>'workspace_id')::uuid = ws) = 3 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n10c invoice list'; end if;
  begin perform public.eab_admin_agency_invoice_void(inv2, 'Batch 5b void a paid one'); fail := fail + 1; msgs := msgs || E'\n10d voided a paid invoice';
  exception when others then pass := pass + 1; end;
  reset role;

  if (select count(*) from public.eab_admin_actions a where a.action in ('agency_price_set', 'agency_invoice_create', 'agency_invoice_void', 'agency_invoice_mark_paid')) >= 5 then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n10e owner actions not all logged'; end if;

  -- 11. coverage stops: a member who leaves; a licence that ran out (after the grace); sandbox while live
  select user_id into own from public.eab_agency_seats where workspace_id = ws limit 1;   -- whoever holds the one seat
  update public.eab_members set active = false where workspace_id = ws and user_id = own;
  if not public.eab_agency_covers(own) then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n11a a member who left is still covered'; end if;
  update public.eab_members set active = true where workspace_id = ws and user_id = own;
  update public.eab_agency_licences set period_end = now() - interval '6 days' where workspace_id = ws;
  ok := public.eab_agency_covers(own);
  update public.eab_agency_licences set period_end = now() - interval '8 days' where workspace_id = ws;
  if ok and not public.eab_agency_covers(own) then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n11b grace wrong'; end if;
  update public.eab_agency_licences set period_end = now() + interval '10 days' where workspace_id = ws;
  update public.eab_billing_settings set live = true where id;
  if not public.eab_agency_covers(own) then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n11c a sandbox licence counted while live'; end if;
  update public.eab_billing_settings set live = false where id;

  -- 12. after the grace a new payment starts from today, not from the old end
  update public.eab_agency_licences set period_end = now() - interval '40 days', status = 'expired' where workspace_id = ws;
  j := public.eab_agency_open_checkout(ws, (select user_id from public.eab_members where workspace_id = ws and role = 'owner'), 'agency_seat_yearly', 2, 'sandbox');
  r := public.eab_agency_apply('stripe', 'cs_new', (j->>'id')::uuid, 'sandbox', 'cs_new', (j->>'amount_sen')::int, now());
  if r = 'applied' and (select period_end from public.eab_agency_licences where workspace_id = ws) between now() + interval '364 days 23 hours' and now() + interval '365 days 1 hour'
     and (select status from public.eab_agency_licences where workspace_id = ws) = 'active' then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n12a renewal after expiry: ' || r; end if;

  raise exception 'TEST RESULT: % passed, % failed%', pass, fail, msgs;
end
$test$;
