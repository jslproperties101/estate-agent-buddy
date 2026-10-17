#!/usr/bin/env bash
# Changes 19 and 20 proposal (supabase/proposed/20261018000000_change019_020_*.sql): usage log and Developer Dashboard.
# LOCAL PostgreSQL only, with stand-ins for Supabase's auth schema; applies nothing anywhere real.
# Usage: PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres bash supabase/tests/change019-test.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="psql -v ON_ERROR_STOP=1 -q"; DBN=eab_change019_test
$ROOT -c "drop database if exists $DBN;" -c "create database $DBN;" >/dev/null
DB="$ROOT -d $DBN"; P="psql -d $DBN -q -tA"
$DB >/dev/null 2>&1 <<'SQL'
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema if not exists extensions; create extension if not exists pgcrypto schema extensions;
grant usage on schema extensions to anon, authenticated;
create schema auth;
create table auth.users (id uuid primary key, email text, created_at timestamptz default now(), banned_until timestamptz, deleted_at timestamptz);
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
create function auth.jwt() returns jsonb language sql stable as $f$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated; grant usage on schema public to anon, authenticated;
insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001','a@x.com'), ('bbbbbbbb-0000-0000-0000-000000000002','b@x.com'),
  ('cccccccc-0000-0000-0000-000000000003','c@x.com');
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid default auth.uid(), created_at timestamptz default now(), unique (bucket_id, name));
create function storage.foldername(name text) returns text[] language sql immutable as $f$ select (string_to_array(name, '/'))[1:greatest(coalesce(array_length(string_to_array(name, '/'), 1), 1) - 1, 0)] $f$;
alter table storage.objects enable row level security; grant usage on schema storage to authenticated; grant select, insert on storage.objects to authenticated;
grant execute on function storage.foldername(text) to authenticated;
-- Like Supabase: new tables and functions in public are open to the API roles by default, so the migration must close them.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
SQL
for f in supabase/migrations/20261012000000_eab_records.sql; do $DB -f $f >/dev/null 2>&1; done
$DB -c "grant select, insert, update on public.eab_records to authenticated;" >/dev/null
for f in supabase/migrations/20261012120000_workspaces_roles.sql supabase/migrations/20261013120000_bug_reports.sql \
         supabase/migrations/20261014000000_phase2_sync_refs_files.sql supabase/proposed/20261016000000_change010_team_sharing_audit.sql \
         supabase/proposed/20261017000000_change010_fix_pgcrypto_path.sql; do $DB -f $f >/dev/null 2>&1; done
set +e +o pipefail
pass=0; fail=0
check() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS $1"; else fail=$((fail+1)); echo "FAIL $1 :: expected [$2] got [$3]"; fi; }
check_none() { if [[ -z "$2" ]]; then pass=$((pass+1)); echo "PASS $1"; else fail=$((fail+1)); echo "FAIL $1 :: expected nothing, got [$2]"; fi; }
A=aaaaaaaa-0000-0000-0000-000000000001; B=bbbbbbbb-0000-0000-0000-000000000002; C=cccccccc-0000-0000-0000-000000000003
declare -A EM=([$A]=a@x.com [$B]=b@x.com [$C]=c@x.com)
as() { local uid=$1; shift; printf "begin;\nset local role authenticated;\nselect set_config('request.jwt.claim.sub','%s',true) \\\\g /dev/null\nselect set_config('request.jwt.claims','{\"sub\":\"%s\",\"email\":\"%s\"}',true) \\\\g /dev/null\n%s;\ncommit;\n" "$uid" "$uid" "${EM[$uid]}" "$*" | $P 2>&1 | grep -v '^$' | sed 's/^psql:<stdin>:[0-9]*: //' | tr '\n' ' ' | sed 's/ $//'; }
anon() { printf "begin;\nset local role anon;\n%s;\ncommit;\n" "$*" | $P 2>&1 | grep -v '^$' | tr '\n' ' '; }
q() { $P -c "$*"; }
for u in $A $B $C; do as $u "select role from eab_my_membership()" >/dev/null; done
WSB=$(q "select workspace_id from eab_members where user_id='$B'")
as $B "select eab_push_records('$WSB', '[{\"collection\":\"properties\",\"id\":\"p1\",\"base_rev\":0,\"data\":{\"id\":\"p1\",\"ref\":\"P1001\"},\"updated\":1,\"op_id\":\"b1\"},{\"collection\":\"properties\",\"id\":\"p2\",\"base_rev\":0,\"data\":{\"id\":\"p2\",\"ref\":\"P1002\"},\"updated\":1,\"op_id\":\"b2\"},{\"collection\":\"contacts\",\"id\":\"c1\",\"base_rev\":0,\"data\":{\"id\":\"c1\"},\"updated\":1,\"op_id\":\"b3\"}]'::jsonb)" >/dev/null
q "insert into eab_files (workspace_id, file_id, collection, record_id, kind, sha256, bytes, status, uploaded_by) values ('$WSB','f1','properties','p1','photo',repeat('a',64),150000,'uploaded','$B')" >/dev/null

echo "--- apply"
OUT=$($DB -f supabase/proposed/20261018000000_change019_020_usage_dashboard.sql 2>&1); check_none "proposal applies cleanly" "$(echo "$OUT" | grep -i error)"
OUT=$($DB -f supabase/proposed/20261018000000_change019_020_usage_dashboard.sql 2>&1); check_none "proposal can be re-applied" "$(echo "$OUT" | grep -i error)"

echo "--- logging"
EV='[{"kind":"google","name":"geocoding.reverse","screen":"location-picker","ok":true,"app_version":"1.0.0-qa","platform":"android","device":"SM-S918B"},
     {"kind":"google","name":"places.autocomplete","screen":"location-picker","ok":true},
     {"kind":"google","name":"routes.compute","screen":"property-map","ok":false},
     {"kind":"session","name":"session.start"},{"kind":"session","name":"session.active","value":180000},
     {"kind":"ai","name":"smartcapture.extract"},{"kind":"sync","name":"sync.push","ok":false},
     {"kind":"metric","name":"storage.local_bytes","value":5242880},
     {"kind":"google","name":"geocoding.reverse","screen":"location-picker","ok":true,"user_id":"'$A'"}]'
check "B logs 9 events"                          "9"                 "$(as $B "select eab_log_usage('$EV'::jsonb)")"
check "user id is always the signed-in user"     "9|0"               "$(q "select count(*) filter (where user_id='$B')||'|'||count(*) filter (where user_id='$A') from eab_usage_events")"
BAD='[{"kind":"google","name":"Jalan Ampang 12, Kuala Lumpur"},{"kind":"hack","name":"x"},{"kind":"error","name":"x","screen":"Client Ali 0123456789"},
      {"kind":"error","name":"sync.timeout","ok":false,"at":"not-a-date"},{"kind":"error","name":"crash.render","ok":false}]'
check "free text and bad rows skipped, good kept" "1"               "$(as $B "select eab_log_usage('$BAD'::jsonb)")"
check "no address stored anywhere"               "0"                 "$(q "select count(*) from eab_usage_events where name ilike '%jalan%' or screen ilike '%ali%'")"
check "future phone time is limited"             "t"                 "$(as $C "select eab_log_usage('[{\"kind\":\"screen\",\"name\":\"home\",\"at\":\"2099-01-01T00:00:00Z\"}]'::jsonb)" >/dev/null; q "select max(at) < now() + interval '6 minutes' from eab_usage_events where user_id='$C'")"
check "more than 200 in one call refused"        "too many events"   "$(as $B "select eab_log_usage((select jsonb_agg(jsonb_build_object('kind','screen','name','home')) from generate_series(1,201)))")"
check "anonymous cannot log"                     "denied"            "$(anon "select eab_log_usage('[{\"kind\":\"screen\",\"name\":\"home\"}]'::jsonb)")"
q "insert into eab_usage_events (user_id, kind, name, received_at) select '$C', 'screen', 'home', now() from generate_series(1,4995)" >/dev/null
check "hourly limit: only room left is stored"   "4"                 "$(as $C "select eab_log_usage((select jsonb_agg(jsonb_build_object('kind','screen','name','home')) from generate_series(1,10)))")"
q "delete from eab_usage_events where user_id='$C'" >/dev/null

echo "--- nobody reads or changes the log through the API"
check "user cannot read events"                  "permission denied" "$(as $B "select count(*) from eab_usage_events")"
check "user cannot insert directly"              "permission denied" "$(as $B "insert into eab_usage_events (user_id, kind, name) values ('$B','screen','home')")"
check "user cannot delete events"                "permission denied" "$(as $B "delete from eab_usage_events")"
check "user cannot make themself developer"      "permission denied" "$(as $B "insert into eab_developers (user_id) values ('$B')")"
check "user cannot read the developer list"      "permission denied" "$(as $B "select count(*) from eab_developers")"
check "user cannot run the clean-up"             "permission denied" "$(as $B "select eab_usage_cleanup()")"
check "user cannot run the totals refresh"       "permission denied" "$(as $B "select eab_usage_rollup()")"
check "user cannot read the daily totals"        "permission denied" "$(as $B "select count(*) from eab_usage_daily")"
check "non-developer: is_developer false"        "f"                 "$(as $B "select eab_is_developer()")"
for fn in "eab_dev_overview(now()-interval '1 day', now()+interval '1 day')" "eab_dev_users(now()-interval '1 day', now()+interval '1 day')" \
          "eab_dev_breakdown(now()-interval '1 day', now()+interval '1 day')" "eab_dev_events(now()-interval '1 day', now()+interval '1 day')" \
          "eab_dev_daily(current_date-1, current_date+1)" "eab_dev_history(current_date-1, current_date+1)"; do
  check "non-developer refused: ${fn%%(*}"       "not allowed"       "$(as $B "select * from $fn")"
  check "anonymous refused: ${fn%%(*}"           "denied"            "$(anon "select * from $fn")"
done

echo "--- developer dashboard"
q "insert into eab_developers (user_id) values ('$A')" >/dev/null
R="now()-interval '1 day', now()+interval '1 day'"
check "developer: is_developer true"             "t"                 "$(as $A "select eab_is_developer()")"
check "overview google calls and failures"       "4|1"               "$(as $A "select (o->>'google_calls')||'|'||(o->>'google_failures') from eab_dev_overview($R) o")"
check "overview active minutes"                  "3.0"               "$(as $A "select o->>'active_minutes' from eab_dev_overview($R) o")"
check "overview records and file bytes"          "3|150000"          "$(as $A "select (o->>'records_total')||'|'||(o->>'files_bytes') from eab_dev_overview($R) o")"
check "overview activation with listing"         '"with_listing": 1' "$(as $A "select o->'activation' from eab_dev_overview($R) o")"
check "users list shows e-mail and usage"        "b@x.com|4|1|1|1|3.0" "$(as $A "select email||'|'||google_calls||'|'||ai_calls||'|'||sync_failures||'|'||sessions||'|'||active_minutes from eab_dev_users($R) where email='b@x.com'")"
check "users list: records, storage, device"     '{"contacts": 1, "properties": 2}|150000|5242880|SM-S918B' "$(as $A "select records::text||'|'||files_bytes||'|'||local_bytes||'|'||coalesce((select device from eab_dev_events($R) where device is not null limit 1),'') from eab_dev_users($R) where email='b@x.com'")"
check "users list lists users without events"    "3"                 "$(as $A "select count(*) from eab_dev_users($R)")"
check "users list e-mail filter"                 "1"                 "$(as $A "select count(*) from eab_dev_users($R, 'b@')")"
check "users list app version filter"            "b@x.com"           "$(as $A "select string_agg(email, ',') from eab_dev_users($R, null, '1.0.0-qa')")"
check "breakdown by user, API and screen"        "b@x.com|geocoding.reverse|location-picker|2" "$(as $A "select email||'|'||name||'|'||screen||'|'||calls from eab_dev_breakdown($R, null, 'google') where name='geocoding.reverse'")"
check "breakdown screen filter"                  "1"                 "$(as $A "select count(*) from eab_dev_breakdown($R, null, 'google', 'property-map')")"
check "events list newest first, with e-mail"    "b@x.com"           "$(as $A "select email from eab_dev_events($R, '$B', 'google') limit 1")"
check "events list limit capped at 1000"         "10"                "$(as $A "select count(*) from eab_dev_events($R, null, null, null, null, null, 5000)")"
check "daily chart row"                          "|1|1|3.0|4|1|1"    "$(as $A "select '|'||active_users||'|'||sessions||'|'||active_minutes||'|'||google_calls||'|'||ai_calls||'|'||errors from eab_dev_daily(current_date-1, current_date+1)")"
check "developer still cannot read the table"    "permission denied" "$(as $A "select count(*) from eab_usage_events")"

echo "--- 1 year of events, daily totals forever"
check "history: B's Google calls by API and screen" "b@x.com|google|geocoding.reverse|location-picker|2" "$(as $A "select email||'|'||kind||'|'||name||'|'||screen||'|'||calls from eab_dev_history(current_date-1, current_date+1, '$B', 'google', 'geocoding.reverse')")"
q "insert into eab_usage_events (user_id, at, received_at, kind, name, screen, ok) values
   ('$B', now() - interval '400 days', now() - interval '400 days', 'google', 'geocoding.reverse', 'location-picker', true),
   ('$B', now() - interval '400 days', now() - interval '400 days', 'google', 'geocoding.reverse', 'location-picker', false),
   ('$B', now() - interval '200 days', now() - interval '200 days', 'screen', 'home', null, null)" >/dev/null
q "update eab_usage_rollup_state set last_run = null" >/dev/null   # as if the totals had never been refreshed
check "clean-up deletes only events over 1 year"  "2"                "$(q "select eab_usage_cleanup()")"
check "200-day-old event kept"                   "1"                 "$(q "select count(*) from eab_usage_events where name='home' and at < now() - interval '199 days'")"
check "deleted events stay in the daily totals"  "2|1"               "$(q "select calls||'|'||failures from eab_usage_daily where user_id='$B' and day <= current_date - 398")"
check "history over 2 years includes them"       "b@x.com|4|1|"      "$(as $A "select email||'|'||calls||'|'||failures||'|' from eab_dev_history(current_date-800, current_date+1, '$B', 'google', 'geocoding.reverse')")"
check "daily chart reaches beyond 1 year"        "2"                 "$(as $A "select google_calls from eab_dev_daily(current_date-800, current_date-399)")"
check "clean-up again changes nothing"           "0|2"               "$(q "select eab_usage_cleanup()||'|'||(select calls from eab_usage_daily where user_id='$B' and day <= current_date - 398)")"
as $B "select eab_log_usage('[{\"kind\":\"ai\",\"name\":\"voice.transcribe\",\"at\":\"$(date -u -d '20 days ago' +%Y-%m-%dT12:00:00Z)\"}]'::jsonb)" >/dev/null
check "late event from an offline phone is counted" "1"              "$(as $A "select ai_calls from eab_dev_daily(current_date-21, current_date-19) where ai_calls > 0")"
check "deleting a user deletes events and totals" "0|0"              "$(q "delete from auth.users where id='$B'"; q "select (select count(*) from eab_usage_events where user_id='$B')||'|'||(select count(*) from eab_usage_daily where user_id='$B')")"

echo "--- rollback"
RECS=$(q "select count(*) from eab_records")
OUT=$($DB -f supabase/proposed/20261018000000_change019_020_rollback.sql 2>&1); check_none "rollback applies" "$(echo "$OUT" | grep -i error)"
check_none "rollback removed the usage tables" "$(q "select concat(to_regclass('public.eab_usage_events'), to_regclass('public.eab_usage_daily'), to_regclass('public.eab_developers'))")"
check_none "rollback removed the functions"   "$(q "select proname from pg_proc where proname like 'eab_dev_%' or proname in ('eab_log_usage','eab_is_developer','eab_usage_cleanup','eab_usage_rollup')")"
check "records untouched by the rollback"        "$RECS"             "$(q "select count(*) from eab_records")"
OUT=$($DB -f supabase/proposed/20261018000000_change019_020_usage_dashboard.sql 2>&1); check_none "re-applies after rollback" "$(echo "$OUT" | grep -i error)"

echo "passed $pass, failed $fail"
[ "$fail" -eq 0 ]
