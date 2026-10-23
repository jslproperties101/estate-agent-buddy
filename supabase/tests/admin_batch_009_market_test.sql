-- Tests for 20261027000000_admin_batch_009_market.sql. Run in the SQL editor of the TEST project.
-- Everything is rolled back (the block ends by raising 'TEST RESULT ...'). Needs 3+ users in auth.users.
do $test$
declare
  o uuid; v uuid; x uuid; ws uuid;
  pass int := 0; fail int := 0; msgs text := '';
  j jsonb; n bigint; e jsonb; today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  acc_before bigint; acc_mid bigint; nw uuid; pr uuid;
  ms_now bigint := (extract(epoch from now()) * 1000)::bigint;
  ms_40 bigint := (extract(epoch from now() - interval '40 days') * 1000)::bigint;
  ms_100 bigint := (extract(epoch from now() - interval '100 days') * 1000)::bigint;
begin
  select id into o from auth.users order by created_at limit 1;
  select id into v from auth.users where id <> o order by created_at limit 1;
  select id into x from auth.users u where id not in (o, v)
     and not exists (select 1 from public.eab_admins ad where ad.user_id = u.id) order by created_at limit 1;
  insert into public.eab_admins (user_id, email, role) select o, email, 'owner' from auth.users where id = o
    on conflict (user_id) do update set role = 'owner', active = true, expires_at = null;
  insert into public.eab_admins (user_id, email, role) select v, email, 'viewer' from auth.users where id = v
    on conflict (user_id) do update set role = 'viewer', active = true, expires_at = null;
  select coalesce((select mb.workspace_id from public.eab_members mb where mb.user_id = o limit 1), (select w.id from public.eab_workspaces w limit 1)) into ws;

  -- test data (rolled back)
  insert into public.eab_records (user_id, workspace_id, collection, id, data, deleted, updated) values
    -- a complete listing (100 points) and a bare one (0 points), both on the market, listed 100 days ago
    (o, ws, 'properties', 'test-b9-good', jsonb_build_object('status', 'available', 'headline', 'TEST good', 'type', 'Terrace house',
        'photos', jsonb_build_array(1, 2, 3, 4, 5), 'askingPrice', 1000000, 'titleType', 'Individual title', 'tenure', 'freehold',
        'landSqft', 1650, 'bedrooms', 4, 'state', 'TEST State', 'city', 'TEST City', 'lat', 2.8, 'lng', 101.8, 'created', ms_100), false, ms_now),
    (o, ws, 'properties', 'test-b9-bare', jsonb_build_object('status', 'available', 'headline', 'TEST bare', 'created', ms_100), false, ms_now),
    -- sold today after 100 days
    (o, ws, 'properties', 'test-b9-sold', jsonb_build_object('status', 'sold', 'type', 'Terrace house', 'askingPrice', 500000,
        'state', 'TEST State', 'city', 'TEST City', 'created', ms_100), false, ms_now),
    -- booked - pending loan, no change for 40 days (stuck); booked fresh (not stuck); SPA signed old (never stuck)
    (o, ws, 'properties', 'test-b9-stuck', jsonb_build_object('status', 'in_progress', 'bookedStage', 'pending_loan', 'askingPrice', 800000, 'created', ms_100), false, ms_40),
    (o, ws, 'properties', 'test-b9-fresh', jsonb_build_object('status', 'in_progress', 'bookedStage', 'pending_consent', 'created', ms_100), false, ms_now),
    (o, ws, 'properties', 'test-b9-spa', jsonb_build_object('status', 'in_progress', 'bookedStage', 'spa_signed', 'created', ms_100), false, ms_40),
    -- deals: one linked to the good listing (asking 1,000,000, final 950,000 = -5%), estimated 3% next month;
    -- one confirmed with a typed commission, 50% share; one received today; one deleted (ignored)
    (o, ws, 'deals', 'test-b9-d1', jsonb_build_object('status', 'estimated', 'side', 'sale', 'propertyId', 'test-b9-good', 'value', 950000,
        'commissionPct', 3, 'commission', 0, 'date', to_char(today + 20, 'YYYY-MM-DD')), false, ms_now),
    (o, ws, 'deals', 'test-b9-d2', jsonb_build_object('status', 'confirmed', 'side', 'rent', 'value', 3000, 'commission', 3000, 'sharePct', 50,
        'date', to_char(today, 'YYYY-MM-DD')), false, ms_now),
    (o, ws, 'deals', 'test-b9-d3', jsonb_build_object('status', 'received', 'side', 'sale', 'value', 400000, 'commissionPct', 2, 'date', to_char(today, 'YYYY-MM-DD')), false, ms_now),
    (o, ws, 'deals', 'test-b9-d4', jsonb_build_object('status', 'confirmed', 'value', 9999999, 'commission', 99999, 'date', to_char(today, 'YYYY-MM-DD')), true, ms_now),
    -- enquiries: two on the good listing today, one with no listing
    (o, ws, 'inquiries', 'test-b9-q1', jsonb_build_object('propertyId', 'test-b9-good', 'at', to_char(today, 'YYYY-MM-DD') || 'T10:00'), false, ms_now),
    (o, ws, 'inquiries', 'test-b9-q2', jsonb_build_object('propertyId', 'test-b9-good', 'created', ms_now), false, ms_now),
    (o, ws, 'inquiries', 'test-b9-q3', jsonb_build_object('channel', 'phone', 'at', to_char(today, 'YYYY-MM-DD') || 'T11:00'), false, ms_now);
  -- a news post for everyone, opened by o; a project for invitation codes only, redeemed by x
  insert into public.eab_feed_items (kind, title_en, status, audience, push_alert, published_at)
    values ('news', 'TEST b9 news', 'published', 'all', true, now() - interval '2 hours') returning id into nw;
  insert into public.eab_feed_items (kind, title_en, status, audience, published_at, project)
    values ('project', 'TEST b9 project', 'published', 'codes', now() - interval '1 day', '{"developer":"TEST Dev"}') returning id into pr;
  insert into public.eab_feed_reads (user_id, item_id, opened_at) values (o, nw, now() - interval '1 hour'), (x, pr, now());
  insert into public.eab_feed_code_grants (user_id, item_id, code) values (x, pr, 'TESTB9');
  select count(*) into acc_before from public.eab_admin_access;

  -- ---------- helpers ----------
  if (public.eab_mkt_score('{"status":"available","photos":[1,2,3,4,5],"askingPrice":"1000","titleType":"x","tenure":"y","landSqft":10,"bedrooms":1,"state":"s","city":"c","lat":1,"lng":2}')->>'score')::int = 100
     and (public.eab_mkt_score('{}')->>'score')::int = 0
     and (public.eab_mkt_score('{"photos":[1],"type":"Residential land","state":"s","city":"c"}')->>'score')::int = 35
     and public.eab_mkt_score('{"photos":[1]}')->'missing' ? 'more_photos'
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [0a score]'; end if;
  if public.eab_mkt_commission('{"value":950000,"commissionPct":3,"commission":0}') = 28500
     and public.eab_mkt_commission('{"value":1,"commissionPct":3,"commission":500}') = 500
     and public.eab_mkt_commission('{}') = 0 and public.eab_mkt_num('"12.5"') = 12.5 and public.eab_mkt_num('"abc"') is null
     and public.eab_mkt_inq_day('{"at":"2026-01-02T09:00"}') = date '2026-01-02'
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [0b helpers]'; end if;

  -- ---------- owner ----------
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  -- 1. quality
  j := public.eab_admin_market_quality(80, 500, 'test');
  if (j->>'names_hidden')::boolean = false
     and exists (select 1 from jsonb_array_elements(j->'weak') w where w->>'id' = 'test-b9-bare' and (w->>'score')::int = 0 and w->'missing' ? 'photos')
     and not exists (select 1 from jsonb_array_elements(j->'weak') w where w->>'id' in ('test-b9-good', 'test-b9-sold'))
     and (j->'bands'->>'good')::int >= 1 and (j->'bands'->>'poor')::int >= 1 and (j->'missing'->>'photos')::int >= 1
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [1 quality]'; end if;
  begin perform public.eab_admin_market_quality(0, 10, 't'); fail := fail + 1; msgs := msgs || ' [1b below]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  -- 2. days on market
  j := public.eab_admin_market_dom(today - 29, today);
  if (j->'open'->>'listings')::int >= 2 and (j->'closed'->>'listings')::int >= 1
     and exists (select 1 from jsonb_array_elements(j->'by_city') c where c->>'city' = 'TEST City' and (c->>'open')::int = 1
                   and (c->>'oldest')::int between 99 and 100 and (c->>'closed')::int = 1 and (c->>'closed_median')::numeric between 99 and 100)
     and (j->'open'->'buckets'->>'d90_179')::int >= 2
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [2 dom]'; end if;
  begin perform public.eab_admin_market_dom(today, today - 1); fail := fail + 1; msgs := msgs || ' [2b range]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  -- 3. asking vs final (d1 is dated 20 days ahead, so look at a range that includes it is not allowed past today: use the list of today's range instead)
  j := public.eab_admin_market_price(today - 29, today, 'test');
  if (j->>'deals')::int >= 2 and not exists (select 1 from jsonb_array_elements(j->'list') l where l->>'deal_id' = 'test-b9-d4')
     and (j->>'not_linked')::int >= 2
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [3a price]'; end if;
  j := public.eab_admin_market_price(today, today + 30, 'test');
  if exists (select 1 from jsonb_array_elements(j->'list') l where l->>'deal_id' = 'test-b9-d1' and (l->>'pct')::numeric = -5
               and (l->>'asking')::numeric = 1000000 and (l->>'final')::numeric = 950000)
     and (j->>'below')::int >= 1
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [3b price pct]'; end if;
  -- 4. areas
  j := public.eab_admin_market_areas(today - 6, today);
  if exists (select 1 from jsonb_array_elements(j->'by_city') c where c->>'city' = 'TEST City' and (c->>'enquiries')::int = 2
               and (c->>'on_market')::int = 1 and (c->>'closed')::int = 1 and (c->>'per_listing')::numeric = 2)
     and (j->>'enquiries_unlinked')::int >= 1
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [4 areas]'; end if;
  -- 5. stuck deals (30 days)
  j := public.eab_admin_market_stuck(30, 'test');
  if exists (select 1 from jsonb_array_elements(j->'list') l where l->>'id' = 'test-b9-stuck' and l->>'stage' = 'booked_pending_loan' and (l->>'days')::int between 39 and 40)
     and not exists (select 1 from jsonb_array_elements(j->'list') l where l->>'id' in ('test-b9-fresh', 'test-b9-spa'))
     and (j->>'days')::int = 30 and (j->>'stuck_count')::int = jsonb_array_length(j->'list')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5 stuck]'; end if;
  j := public.eab_admin_market_stuck(60, 'test');
  if not exists (select 1 from jsonb_array_elements(j->'list') l where l->>'id' = 'test-b9-stuck') then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [5b stuck 60]'; end if;
  begin perform public.eab_admin_market_stuck(3, 't'); fail := fail + 1; msgs := msgs || ' [5c days]';
  exception when invalid_parameter_value then pass := pass + 1; end;
  -- 6. commission forecast
  j := public.eab_admin_market_commission(today - 29, today, 'test');
  execute 'reset role';
  select coalesce(sum(public.eab_mkt_commission(data)), 0) into n from public.eab_records
   where collection = 'deals' and not deleted and coalesce(data->>'status', 'estimated') in ('estimated', 'confirmed');
  execute 'set local role authenticated';
  if (j->'open'->>'commission')::numeric = n
     and exists (select 1 from jsonb_array_elements(j->'by_month') m where m->>'month' = to_char(today + 20, 'YYYY-MM') and (m->>'estimated')::numeric >= 28500)
     and (j->'received'->>'commission')::numeric >= 8000
     and exists (select 1 from jsonb_array_elements(j->'by_stage') s where s->>'stage' = 'available' and (s->>'commission')::numeric >= 28500)
     and exists (select 1 from jsonb_array_elements(j->'agents') a where (a->>'user_id')::uuid = o and (a->>'agents_share')::numeric >= 28500 + 1500)
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [6 commission]'; end if;
  -- 7. projects
  j := public.eab_admin_market_projects(today - 6, today);
  if exists (select 1 from jsonb_array_elements(j->'list') p where (p->>'id')::uuid = pr and (p->>'reached')::int = 1 and (p->>'opened')::int = 1
               and (p->>'redeemed')::int = 1 and (p->>'codes')::int = 1 and p->>'developer' = 'TEST Dev')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [7 projects]'; end if;
  -- 8. news engagement
  j := public.eab_admin_market_news(today - 6, today);
  execute 'reset role';
  select count(*) into n from auth.users;
  execute 'set local role authenticated';
  select p into e from jsonb_array_elements(j->'list') p where (p->>'id')::uuid = nw;
  if e is not null and (e->>'reached')::int = n and (e->>'opened')::int = 1 and (e->>'push_alert')::boolean
     and jsonb_array_length(j->'by_language') >= 1 and jsonb_array_length(j->'best') >= 1
     and not exists (select 1 from jsonb_array_elements(j->'heatmap') h where (h->>'dow')::int not between 1 and 7 or (h->>'hour')::int not between 0 and 23)
     and (select sum((l->>'reached')::int) from jsonb_array_elements(j->'by_language') l) = (j->>'reached')::int
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [8 news]'; end if;
  -- 9. lists written to the access log (quality, price x2, stuck x2, commission = 6)
  execute 'reset role';
  select count(*) into acc_mid from public.eab_admin_access;
  if acc_mid - acc_before = 6 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [9 access rows ' || (acc_mid - acc_before) || ']'; end if;

  -- ---------- viewer: totals only, no names, nothing logged ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.eab_admin_market_quality(80, 500, 'v');
  if (j->>'names_hidden')::boolean and j->'weak' = 'null'::jsonb and (j->>'weak_count')::int >= 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [10 viewer quality]'; end if;
  j := public.eab_admin_market_price(today, today + 30, 'v');
  if (j->>'names_hidden')::boolean and j->'list' = 'null'::jsonb and (j->>'compared')::int >= 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [11 viewer price]'; end if;
  j := public.eab_admin_market_stuck(30, 'v');
  if (j->>'names_hidden')::boolean and j->'list' = 'null'::jsonb and (j->>'stuck_count')::int >= 1 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [12 viewer stuck]'; end if;
  j := public.eab_admin_market_commission(null, null, 'v');
  if (j->>'names_hidden')::boolean and j->'agents' = 'null'::jsonb and (j->'open'->>'deals')::int >= 2 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [13 viewer commission]'; end if;
  j := public.eab_admin_market_dom(null, null);
  if jsonb_typeof(j->'by_state') = 'array' then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [14 viewer dom]'; end if;
  j := public.eab_admin_market_areas(null, null);
  if jsonb_typeof(j->'by_city') = 'array' and (j->>'enquiries')::int >= 3 then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [15 viewer areas]'; end if;
  j := public.eab_admin_market_news(null, null);
  if (j->>'posts')::int >= 1 and not (j::text like '%@%') then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [16 viewer news no emails]'; end if;
  j := public.eab_admin_market_projects(null, null);
  if (j->>'projects')::int >= 1 and not (j::text like '%@%') then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [17 viewer projects no emails]'; end if;
  execute 'reset role';
  select count(*) into n from public.eab_admin_access;
  if n = acc_mid then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [18 viewer logged ' || (n - acc_mid) || ']'; end if;

  -- ---------- not an admin ----------
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.eab_admin_market_quality(80, 10, 'x'); fail := fail + 1; msgs := msgs || ' [19a non-admin]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_market_news(null, null); fail := fail + 1; msgs := msgs || ' [19b non-admin]';
  exception when insufficient_privilege then pass := pass + 1; end;
  begin perform public.eab_admin_market_commission(null, null, 'x'); fail := fail + 1; msgs := msgs || ' [19c non-admin]';
  exception when insufficient_privilege then pass := pass + 1; end;
  execute 'reset role';

  -- ---------- grants ----------
  if not has_function_privilege('anon', 'public.eab_admin_market_quality(integer, integer, text)', 'execute')
     and not has_function_privilege('anon', 'public.eab_admin_market_news(date, date)', 'execute')
     and not has_function_privilege('authenticated', 'public.eab_mkt_reach(uuid[])', 'execute')
     and not has_function_privilege('authenticated', 'public.eab_mkt_score(jsonb)', 'execute')
     and has_function_privilege('authenticated', 'public.eab_admin_market_areas(date, date)', 'execute')
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [20 grants]'; end if;

  -- ---------- read-only: no listing, deal or feed row changed by any call ----------
  if (select count(*) from public.eab_records where id like 'test-b9-%') = 13
     and (select updated from public.eab_records where id = 'test-b9-stuck') = ms_40
    then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [21 read-only]'; end if;

  -- ---------- chain still intact ----------
  if (public.eab_admin_check_chain('eab_admin_access')->>'ok')::boolean then pass := pass + 1; else fail := fail + 1; msgs := msgs || ' [22 chain]'; end if;

  raise exception 'TEST RESULT: % passed, % failed%', pass, fail, coalesce(nullif(msgs, ''), '');
end $test$;
