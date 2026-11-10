-- Tests for supabase/proposed/20261109100000_batch5_news_gate_play_events.sql (Batch 5). Run in the SQL editor of the TEST
-- project, after the migration (and after billing_sandbox + tokens_sandbox). Everything is rolled back: the block ends by
-- raising 'TEST RESULT ...'. Needs 2+ active users in auth.users.
do $test$
declare
  a uuid; b uuid; item uuid; proj uuid;
  pass int := 0; fail int := 0; msgs text := '';
  r text; n int; j jsonb;
  ok boolean;
begin
  select id into a from auth.users u where public.eab_account_ok(u.id) order by created_at limit 1;
  select id into b from auth.users u where public.eab_account_ok(u.id) and id <> a order by created_at limit 1;
  if a is null or b is null then raise exception 'needs 2 active users in auth.users'; end if;
  if exists (select 1 from public.eab_billing_entitlements where user_id in (a, b) and product = 'news') then raise exception 'leftover news plan rows'; end if;
  insert into public.eab_feed_items (kind, title_en, body_en, audience, status, published_at, push_alert)
  values ('news', 'Batch5 test news', 'Paid market insight', 'all', 'published', now() - interval '1 minute', true) returning id into item;
  insert into public.eab_feed_items (kind, title_en, audience, status, published_at, project)
  values ('project', 'Batch5 test project', 'all', 'published', now() - interval '1 minute', '{}'::jsonb) returning id into proj;
  update public.eab_billing_settings set news_paid = false, live = false where id;

  -- 1. switch off (the default): everybody sees news, exactly as before
  select public.eab_feed_visible(a, i) into ok from public.eab_feed_items i where i.id = item;
  if ok then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n1a news hidden while the switch is off'; end if;
  select count(*) into n from public.eab_push_feed_recipients(item) x where x.user_id in (a, b);
  if n >= 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n1b push recipients while off: ' || n; end if;

  -- 2. switch on: news needs a plan; projects and announcements are untouched
  update public.eab_billing_settings set news_paid = true where id;
  select public.eab_feed_visible(a, i) into ok from public.eab_feed_items i where i.id = item;
  if not ok then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n2a news visible without a plan'; end if;
  select public.eab_feed_visible(a, i) into ok from public.eab_feed_items i where i.id = proj;
  if ok then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n2b a project was hidden'; end if;
  select count(*) into n from public.eab_push_feed_recipients(item) x where x.user_id in (a, b);
  if n = 0 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n2c push still goes to agents without a plan: ' || n; end if;

  -- 3. a Google Play news plan for a only
  r := public.eab_billing_apply('google_play', 'b5_news_a', a, 'play.active', 'news', 'news_monthly', 'active', 'sandbox',
        now() + interval '30 days', null, false, 'GPA.b5', null, now());
  select public.eab_feed_visible(a, i) into ok from public.eab_feed_items i where i.id = item;
  if r = 'applied' and ok then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n3a subscriber cannot see news: ' || r; end if;
  select public.eab_feed_visible(b, i) into ok from public.eab_feed_items i where i.id = item;
  if not ok then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n3b another agent sees the paid news'; end if;
  select count(*) into n from public.eab_push_feed_recipients(item) x where x.user_id = a;
  if n >= 1 and not exists (select 1 from public.eab_push_feed_recipients(item) x where x.user_id = b) then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n3c push recipients wrong'; end if;

  -- 4. the same rules as the app: grace after an unpaid end, cancelled runs to the end, expired / untrusted rows do not count
  update public.eab_billing_entitlements set status = 'past_due', period_end = now() - interval '6 days' where user_id = a and product = 'news';
  if public.eab_billing_has(a, 'news') then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n4a grace day 6 refused'; end if;
  update public.eab_billing_entitlements set period_end = now() - interval '8 days' where user_id = a and product = 'news';
  if not public.eab_billing_has(a, 'news') then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n4b grace day 8 allowed'; end if;
  update public.eab_billing_entitlements set status = 'canceled', period_end = now() + interval '3 days' where user_id = a and product = 'news';
  if public.eab_billing_has(a, 'news') then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n4c cancelled before its end refused'; end if;
  update public.eab_billing_entitlements set status = 'canceled', period_end = now() - interval '1 minute' where user_id = a and product = 'news';
  if not public.eab_billing_has(a, 'news') then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n4d cancelled after its end allowed'; end if;
  update public.eab_billing_entitlements set status = 'active', period_end = null where user_id = a and product = 'news';
  if not public.eab_billing_has(a, 'news') then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n4e active with no end allowed'; end if;
  update public.eab_billing_entitlements set status = 'expired', period_end = now() + interval '30 days' where user_id = a and product = 'news';
  if not public.eab_billing_has(a, 'news') then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n4f expired allowed'; end if;

  -- 5. live: a sandbox plan stops counting
  update public.eab_billing_entitlements set status = 'active', period_end = now() + interval '30 days' where user_id = a and product = 'news';
  update public.eab_billing_settings set live = true where id;
  if not public.eab_billing_has(a, 'news') then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n5a sandbox plan counted while live'; end if;
  update public.eab_billing_settings set live = false where id;

  -- 6. the phone: reads the switch, cannot read the settings table, cannot use the server-only functions
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  set local role authenticated;
  j := public.eab_billing_public();
  if (j->>'news_paid')::boolean then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n6a switch not readable: ' || coalesce(j::text, 'null'); end if;
  begin perform 1 from public.eab_billing_settings; fail := fail + 1; msgs := msgs || E'\n6b phone read the settings table';
  exception when others then pass := pass + 1; end;
  begin perform public.eab_billing_has(b, 'news'); fail := fail + 1; msgs := msgs || E'\n6c phone called eab_billing_has';
  exception when others then pass := pass + 1; end;
  begin perform public.eab_play_purchase_link(repeat('a', 64), b, 'subs', 'news_monthly'); fail := fail + 1; msgs := msgs || E'\n6d phone linked a purchase';
  exception when others then pass := pass + 1; end;
  begin perform public.eab_tokens_refund('gp:x'); fail := fail + 1; msgs := msgs || E'\n6e phone refunded tokens';
  exception when others then pass := pass + 1; end;
  begin perform public.eab_admin_billing_settings_set('{"news_paid": false}', 'not an admin', 't'); fail := fail + 1; msgs := msgs || E'\n6f a non-admin changed the switch';
  exception when others then pass := pass + 1; end;
  select count(*) into n from jsonb_array_elements(public.eab_my_feed('news', 'en')) x where x->>'id' = item::text;
  if n = 0 then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n6g eab_my_feed still sends paid news'; end if;
  begin
    if not public.eab_feed_mark(item, 'opened') then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n6h marked hidden news'; end if;
  exception when others then fail := fail + 1; msgs := msgs || E'\n6h ' || sqlerrm; end;
  reset role;

  -- 7. purchases: linked once, never re-pointed to another agent
  r := public.eab_play_purchase_link(repeat('b', 64), a, 'subs', 'news_monthly');
  if r = 'linked' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n7a link: ' || r; end if;
  r := public.eab_play_purchase_link(repeat('b', 64), a, 'subs', 'news_monthly');
  if r = 'seen' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n7b again: ' || r; end if;
  r := public.eab_play_purchase_link(repeat('b', 64), b, 'subs', 'news_monthly');
  if r = 'other-agent' and (public.eab_play_purchase_owner(repeat('b', 64))->>'user_id')::uuid = a then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n7c re-pointed: ' || r; end if;
  if public.eab_play_purchase_owner(repeat('c', 64)) is null then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n7d unknown token has an owner'; end if;
  begin perform public.eab_play_purchase_link('not-a-hash', a, 'subs', 'news_monthly'); fail := fail + 1; msgs := msgs || E'\n7e bad hash stored';
  exception when others then pass := pass + 1; end;

  -- 8. token refunds: whatever is left is taken back, never below zero, once
  r := public.eab_tokens_credit(a, 'tokens_100', 105, 2500, 'sandbox', 'google_play', 'gp:b5refund');
  update public.eab_token_balances set balance = balance - 30 where user_id = a and env = 'sandbox';   -- stands in for spending (Batch C)
  insert into public.eab_token_ledger (user_id, env, delta, kind) values (a, 'sandbox', -30, 'spend');
  select balance into n from public.eab_token_balances where user_id = a and env = 'sandbox';
  j := public.eab_tokens_refund('gp:b5refund');
  if j->>'result' = 'applied' and (j->>'due')::int = 105 and (j->>'taken')::int = least(105, n) then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n8a refund: ' || j::text; end if;
  if (select balance from public.eab_token_balances where user_id = a and env = 'sandbox') = n - least(105, n) then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n8b balance after refund'; end if;
  j := public.eab_tokens_refund('gp:b5refund');
  if j->>'result' = 'duplicate' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n8c second refund: ' || j::text; end if;
  if (select count(*) from public.eab_token_ledger where ref = 'gp:b5refund' and kind = 'refund') <= 1 then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n8d two refund rows'; end if;
  if (select sum(delta) from public.eab_token_ledger where user_id = a and env = 'sandbox') = (select balance from public.eab_token_balances where user_id = a and env = 'sandbox') then pass := pass + 1;
  else fail := fail + 1; msgs := msgs || E'\n8e ledger and balance disagree'; end if;
  j := public.eab_tokens_refund('gp:never-bought');
  if j->>'result' = 'unknown-purchase' then pass := pass + 1; else fail := fail + 1; msgs := msgs || E'\n8f unknown purchase: ' || j::text; end if;

  raise exception 'TEST RESULT: % passed, % failed%', pass, fail, msgs;
end
$test$;
