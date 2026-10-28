-- Tests for supabase/proposed/20261028000000_billing_sandbox.sql. Run in the SQL editor of the TEST project (after the
-- migration). Everything is rolled back: the block ends by raising 'TEST RESULT ...'. Needs 2+ users in auth.users.
do $test$
declare
  a uuid; b uuid;
  pass int := 0; fail int := 0; msgs text := '';
  r text; n int; t timestamptz; e1 timestamptz; e2 timestamptz;
begin
  select id into a from auth.users order by created_at limit 1;
  select id into b from auth.users where id <> a order by created_at limit 1;
  if a is null or b is null then raise exception 'needs 2 users in auth.users'; end if;

  -- 1. one trial per product, ever
  r := public.eab_billing_start_trial(a, 'pro', 14, 'sandbox');
  if r = 'started' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n1a trial start: ' || r; end if;
  r := public.eab_billing_start_trial(a, 'pro', 14, 'sandbox');
  if r = 'already-used' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n1b second trial: ' || r; end if;
  r := public.eab_billing_start_trial(a, 'pos', 14, 'sandbox');
  if r = 'started' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n1c other product trial: ' || r; end if;

  -- 2. a Stripe subscription event applies, the same event twice does not
  r := public.eab_billing_apply('stripe', 'evt_1', a, 'customer.subscription.created', 'pro', 'pro_monthly', 'active', 'sandbox',
        now() + interval '30 days', null, false, 'sub_1', null, now());
  if r = 'applied' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n2a apply: ' || r; end if;
  r := public.eab_billing_apply('stripe', 'evt_1', a, 'customer.subscription.created', 'pro', 'pro_monthly', 'active', 'sandbox',
        now() + interval '30 days', null, false, 'sub_1', null, now());
  if r = 'duplicate' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n2b duplicate: ' || r; end if;
  select count(*) into n from public.eab_billing_events where provider = 'stripe' and event_id = 'evt_1';
  if n = 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n2c event rows: ' || n; end if;

  -- 3. an older event never overwrites a newer one
  r := public.eab_billing_apply('stripe', 'evt_old', a, 'customer.subscription.updated', 'pro', 'pro_monthly', 'past_due', 'sandbox',
        now() + interval '1 day', null, false, 'sub_1', null, now() - interval '1 hour');
  if r = 'stale' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n3a stale: ' || r; end if;
  if (select status from public.eab_billing_entitlements where user_id = a and product = 'pro') = 'active' then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n3b status changed by a stale event'; end if;

  -- 4. one-time payments stack, in any order, and each bill counts once
  r := public.eab_billing_apply('fpx', 'bill_A', b, 'billplz.bill.paid', 'pro', 'pro_monthly', 'active', 'sandbox', null, 30, true, 'bill_A', 4900, now());
  select period_end into e1 from public.eab_billing_entitlements where user_id = b and product = 'pro';
  r := public.eab_billing_apply('fpx', 'bill_B', b, 'billplz.bill.paid', 'pro', 'pro_monthly', 'active', 'sandbox', null, 30, true, 'bill_B', 4900, now() - interval '5 minutes');
  select period_end into e2 from public.eab_billing_entitlements where user_id = b and product = 'pro';
  if r = 'applied' and e2 > e1 + interval '29 days' and e2 < e1 + interval '31 days' then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n4a stacking: ' || r || ' ' || e1 || ' -> ' || e2; end if;
  r := public.eab_billing_apply('fpx', 'bill_B', b, 'billplz.bill.paid', 'pro', 'pro_monthly', 'active', 'sandbox', null, 30, true, 'bill_B', 4900, now());
  select period_end into t from public.eab_billing_entitlements where user_id = b and product = 'pro';
  if r = 'duplicate' and t = e2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n4b repeated bill extended again: ' || r; end if;

  -- 5. bad input is refused
  begin
    perform public.eab_billing_apply('paypal', 'x', a, 'k', 'pro', 'pro_monthly', 'active', 'sandbox', null, null, false, null, null, now());
    fail := fail + 1; msgs := msgs || E'\n5a unknown provider accepted';
  exception when others then pass := pass + 1; end;
  begin
    perform public.eab_billing_apply('stripe', '', a, 'k', 'pro', 'pro_monthly', 'active', 'sandbox', null, null, false, null, null, now());
    fail := fail + 1; msgs := msgs || E'\n5b empty event id accepted';
  exception when others then pass := pass + 1; end;
  r := public.eab_billing_apply('stripe', 'evt_nobody', '00000000-0000-0000-0000-000000000000', 'k', 'pro', 'pro_monthly', 'active', 'sandbox', now(), null, false, null, null, now());
  if r = 'unknown-user' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n5c unknown user: ' || r; end if;

  -- 6. a signed-in agent sees only their own rows and cannot write
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.eab_my_billing();
  if n = 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n6a own rows: ' || n; end if;
  if (select count(*) from public.eab_my_billing() where product = 'pro' and status = 'active' and provider = 'stripe') = 1 then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n6b own pro row wrong'; end if;
  begin
    insert into public.eab_billing_entitlements (user_id, product, status, provider) values (a, 'pro', 'active', 'stripe');
    fail := fail + 1; msgs := msgs || E'\n6c phone could write an entitlement';
  exception when others then pass := pass + 1; end;
  begin
    perform public.eab_billing_apply('stripe', 'evt_self', a, 'k', 'pro', 'pro_monthly', 'active', 'sandbox', now() + interval '1 year', null, false, null, null, now());
    fail := fail + 1; msgs := msgs || E'\n6d phone could call apply';
  exception when others then pass := pass + 1; end;
  begin
    perform public.eab_billing_start_trial(b, 'pos', 14, 'sandbox');
    fail := fail + 1; msgs := msgs || E'\n6e phone could start a trial for someone else';
  exception when others then pass := pass + 1; end;
  begin
    perform count(*) from public.eab_billing_events;
    fail := fail + 1; msgs := msgs || E'\n6f phone could read the event log';
  exception when others then pass := pass + 1; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.eab_my_billing();
  if n = 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n6g other agent rows: ' || n; end if;
  reset role;

  raise exception 'TEST RESULT: % passed, % failed%', pass, fail, msgs;
end
$test$;
