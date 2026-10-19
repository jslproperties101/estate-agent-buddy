#!/usr/bin/env bash
# JoyChange003 Change 51 (Batch B2): tests for supabase/migrations/20261019120000_joychange003_user_options.sql on a local
# PostgreSQL with stand-ins for Supabase's auth.uid() and the anon / authenticated roles.
# Usage: PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres bash supabase/tests/user-options-test.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="psql -v ON_ERROR_STOP=1 -q"
$ROOT -c "drop database if exists eab_opt_test;" -c "create database eab_opt_test;" >/dev/null
DB="$ROOT -d eab_opt_test"
$DB >/dev/null 2>&1 <<'SQL'
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated; grant usage on schema public to anon, authenticated;
insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000001','a@x.com'), ('bbbbbbbb-0000-0000-0000-000000000002','b@x.com');
SQL
$DB -f supabase/migrations/20261019120000_joychange003_user_options.sql >/dev/null
$DB -f supabase/migrations/20261019120000_joychange003_user_options.sql >/dev/null   # safe to run twice
A=aaaaaaaa-0000-0000-0000-000000000001; B=bbbbbbbb-0000-0000-0000-000000000002
as() { local who=$1; shift; printf "begin; set local role authenticated; select set_config('request.jwt.claim.sub','%s',true);\n%s\ncommit;\n" "$who" "$*" | psql -d eab_opt_test -q -tA 2>&1 | grep -v '^$' | grep -v '^set_config' | grep -v "^$who\$"; }
fail=0
check() { if [ "$2" == "$3" ]; then echo "ok   $1"; else echo "FAIL $1"; echo "     expected: $3"; echo "     got:      $2"; fail=1; fi; }

check "A sends two values" "$(as $A "select public.eab_options_push('[{\"list\":\"township\",\"value\":\"Sungai Besi\",\"added\":10,\"used\":10,\"updated\":10},{\"list\":\"waTexts\",\"value\":\"Hi {name}\",\"added\":11,\"used\":11,\"updated\":11}]');")" "2"
check "A reads them back in change order" "$(as $A "select string_agg(list||'='||value||':'||deleted, ',' order by seq) from public.eab_options_pull(0, 100);")" "township=Sungai Besi:false,waTexts=Hi {name}:false"
check "B sees none of A's values" "$(as $B "select count(*) from public.eab_options_pull(0, 100);")" "0"
check "the table cannot be read directly" "$(as $A "select count(*) from public.eab_user_options;" | grep -c 'permission denied')" "1"
check "nobody signed in is refused" "$(printf "begin; set local role authenticated; select public.eab_options_pull(0,10); commit;" | psql -d eab_opt_test -q -tA 2>&1 | grep -c 'not signed in')" "1"
check "anon cannot call the functions" "$(printf "begin; set local role anon; select public.eab_options_pull(0,10); commit;" | psql -d eab_opt_test -q -tA 2>&1 | grep -c 'permission denied')" "1"
# the change made last wins; an older change arriving late is ignored
as $A "select public.eab_options_push('[{\"list\":\"township\",\"value\":\"sungai besi\",\"deleted\":true,\"added\":10,\"used\":10,\"updated\":30}]');" >/dev/null
as $A "select public.eab_options_push('[{\"list\":\"township\",\"value\":\"Sungai Besi\",\"added\":10,\"used\":20,\"updated\":20}]');" >/dev/null
check "a later deletion beats an older change (any letter case)" "$(as $A "select value||':'||deleted||':'||updated from public.eab_options_pull(0, 100) where list = 'township';")" "sungai besi:true:30"
check "only rows changed after a position are sent" "$(as $A "select count(*) from public.eab_options_pull((select max(seq) from public.eab_options_pull(0,100)), 100);")" "0"
as $A "select public.eab_options_push('[{\"list\":\"township\",\"value\":\"Sungai Besi\",\"added\":40,\"used\":40,\"updated\":40}]');" >/dev/null
check "added again after the deletion, keeping the first added time" "$(as $A "select value||':'||deleted||':'||added from public.eab_options_pull(0, 100) where list = 'township';")" "Sungai Besi:false:10"
check "bad input is skipped, not stored (0 taken)" "$(as $A "select public.eab_options_push('[{\"list\":\"township\",\"value\":\"   \"},{\"value\":\"x\"}]');")" "0"
check "more than 500 rows at once is refused" "$(as $A "select public.eab_options_push((select jsonb_agg(jsonb_build_object('list','t','value','v'||g)) from generate_series(1,501) g));" | grep -c 'at most 500')" "1"
exit $fail
