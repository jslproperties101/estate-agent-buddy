#!/usr/bin/env bash
# Role and security tests for the Supabase migrations, on a local PostgreSQL with stand-ins for Supabase's
# auth.uid() / auth.jwt() and the anon / authenticated roles.
# Usage: PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres bash supabase/tests/rls-test.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="psql -v ON_ERROR_STOP=1 -q"
$ROOT -c "drop database if exists eab_rls_test;" -c "create database eab_rls_test;" >/dev/null
DB="$ROOT -d eab_rls_test"
$DB >/dev/null 2>&1 <<'SQL'
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
create function auth.jwt() returns jsonb language sql stable as $f$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated; grant usage on schema public to anon, authenticated;
insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000001','a@x.com'), ('bbbbbbbb-0000-0000-0000-000000000002','b@x.com'),
  ('cccccccc-0000-0000-0000-000000000003','c@x.com'), ('dddddddd-0000-0000-0000-000000000004','d@x.com');
SQL
$DB -f supabase/migrations/20261012000000_eab_records.sql >/dev/null 2>&1
$DB -c "grant select, insert, update on public.eab_records to authenticated;" >/dev/null
# Records from the single-user version, to check they move into the owner's workspace.
printf "begin; set local role authenticated;\nselect set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001',true);\ninsert into public.eab_records (collection, id, data, updated) values ('properties','p1','{\"ref\":\"P1001\"}',1), ('contacts','c1','{\"name\":\"Owner A\"}',1);\ncommit;\n" | $DB >/dev/null
$DB -f supabase/migrations/20261012120000_workspaces_roles.sql >/dev/null 2>&1
P="psql -d eab_rls_test -q -tA"
set +e +o pipefail   # the checks below compare outputs themselves
A=aaaaaaaa-0000-0000-0000-000000000001; B=bbbbbbbb-0000-0000-0000-000000000002; C=cccccccc-0000-0000-0000-000000000003; D=dddddddd-0000-0000-0000-000000000004
as() { local uid=$1 email=$2; shift 2; printf "begin;\nset local role authenticated;\nselect set_config('request.jwt.claim.sub','%s',true) \\\\g /dev/null\nselect set_config('request.jwt.claims','{\"sub\":\"%s\",\"email\":\"%s\",\"user_metadata\":{\"full_name\":\"User\"}}',true) \\\\g /dev/null\n%s;\ncommit;\n" "$uid" "$uid" "$email" "$*" | $P 2>&1 | grep -v '^$' | sed 's/^psql:<stdin>:[0-9]*: //' | tr '\n' ' ' | sed 's/ $//'; }
pass=0; fail=0
check() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS $1"; else fail=$((fail+1)); echo "FAIL $1 :: expected [$2] got [$3]"; fi; }
WSA=$($P -c "select workspace_id from eab_members where user_id='$A'")
check "owner A membership"          "owner"                "$(as $A a@x.com "select role from eab_my_membership()")"
check "A reads legacy records"      "2"                    "$(as $A a@x.com "select count(*) from eab_records")"
check "stranger C gets own workspace" "owner"              "$(as $C c@x.com "select role from eab_my_membership()")"
check "C cannot see A's records"    "0"                    "$(as $C c@x.com "select count(*) from eab_records where workspace_id='$WSA'")"
check "C cannot write into A's workspace" "row-level security" "$(as $C c@x.com "insert into eab_records (workspace_id, collection, id, data, updated) values ('$WSA','contacts','cx','{}',1)")"
check "non-member cannot invite"    "not allowed"          "$(as $B b@x.com "select eab_invite('$WSA','e@x.com','agent')")"
check "non-member cannot cancel invites" "not allowed"   "$(as $C c@x.com "select eab_cancel_invite('$WSA','b@x.com')")"
check "non-member cannot change members" "not allowed"   "$(as $C c@x.com "select eab_set_member('$WSA','$A','agent',false)")"
check "no invite was created by a non-member" "0"        "$($P -c "select count(*) from eab_invites where email='e@x.com'")"
as $A a@x.com "select eab_invite('$WSA','B@X.com','agent')" >/dev/null
as $A a@x.com "select eab_invite('$WSA','d@x.com','admin')" >/dev/null
check "invite stored lowercase"     "b@x.com|agent"        "$($P -c "select email||'|'||role from eab_invites where email='b@x.com'")"
check "B joins A's team as agent"   "agent"                "$(as $B b@x.com "select role from eab_my_membership()")"
check "D joins as admin"            "admin"                "$(as $D d@x.com "select role from eab_my_membership()")"
check "B reads no records of A"     "0"                    "$(as $B b@x.com "select count(*) from eab_records")"
check "B adds own record"           ""                     "$(as $B b@x.com "insert into eab_records (workspace_id, collection, id, data, updated, user_id) values ('$WSA','contacts','cb','{\"name\":\"Buyer of B\"}',2,'$B')")"
check "B reads own record only"     "1"                    "$(as $B b@x.com "select count(*) from eab_records")"
check "B cannot pose as A"          "row-level security"   "$(as $B b@x.com "insert into eab_records (workspace_id, collection, id, data, updated, user_id) values ('$WSA','contacts','cz','{}',2,'$A')")"
check "B cannot edit A's record"    "0"                    "$(as $B b@x.com "with u as (update eab_records set data='{}' where id='c1' returning 1) select count(*) from u")"
check "A reads B's record too"      "3"                    "$(as $A a@x.com "select count(*) from eab_records")"
as $A a@x.com "insert into eab_records (workspace_id, collection, id, data, updated) values ('$WSA','contacts','cb','{\"name\":\"edited by owner\"}',3) on conflict (workspace_id, collection, id) do update set data = excluded.data, updated = excluded.updated" >/dev/null
check "owner's edit keeps creator B" "$B|edited by owner"  "$($P -c "select user_id||'|'||(data->>'name') from eab_records where id='cb'")"
check "no hard deletes"             "permission denied"                    "$(as $A a@x.com "with d as (delete from eab_records where id='c1' returning 1) select count(*) from d")"
check "agent sees only own membership" "1"                 "$(as $B b@x.com "select count(*) from eab_members")"
check "owner sees all members"      "3"                    "$(as $A a@x.com "select count(*) from eab_members where workspace_id='$WSA'")"
check "agent cannot read audit"     "0"                    "$(as $B b@x.com "select count(*) from eab_audit")"
check "admin cannot change owner"   "not allowed"          "$(as $D d@x.com "select eab_set_member('$WSA','$A','agent',true)")"
check "admin cannot make admins"    "only the owner"       "$(as $D d@x.com "select eab_set_member('$WSA','$B','admin',true)")"
check "admin cannot invite admins"  "role not allowed"     "$(as $D d@x.com "select eab_invite('$WSA','f@x.com','admin')")"
check "nobody can invite an owner"  "role not allowed"     "$(as $A a@x.com "select eab_invite('$WSA','f@x.com','owner')")"
as $D d@x.com "select eab_set_member('$WSA','$B','limited',true)" >/dev/null
check "limited B still reads own"   "1"                    "$(as $B b@x.com "select count(*) from eab_records")"
check "limited B cannot add"        "row-level security"   "$(as $B b@x.com "insert into eab_records (workspace_id, collection, id, data, updated, user_id) values ('$WSA','tasks','t1','{}',4,'$B')")"
check "limited B cannot edit own"   "0"                    "$(as $B b@x.com "with u as (update eab_records set data='{}' where id='cb' returning 1) select count(*) from u")"
as $A a@x.com "select eab_set_member('$WSA','$B','agent',false)" >/dev/null
check "switched-off B: no membership" "0"                  "$(as $B b@x.com "select count(*) from eab_my_membership()")"
check "switched-off B sees nothing" "0"                    "$(as $B b@x.com "select count(*) from eab_records")"
check "switched-off B gets no new workspace" "1"           "$($P -c "select count(*) from eab_members where user_id='$B'")"
check "assigned record visible to agent" "1"              "$(as $A a@x.com "select eab_set_member('$WSA','$B','agent',true)" >/dev/null; $P -c "update eab_records set assigned_to='$B' where id='p1'"; as $B b@x.com "select count(*) from eab_records where id='p1'")"
check "audit has the changes"       "access_off"           "$($P -c "select string_agg(action, ',' order by id) from eab_audit")"
# ---- Easy Bug Report (migration 20261013120000_bug_reports.sql). Storage does not exist in this stand-in database, so only
# the table and its policies are tested here; the guarded storage part is skipped by the migration itself.
$DB -f supabase/migrations/20261013120000_bug_reports.sql >/dev/null 2>&1
check "bug report migration applied" "eab_bug_reports"      "$($P -c "select to_regclass('public.eab_bug_reports')")"
check "B adds a bug report as self"  ""                     "$(as $B b@x.com "insert into eab_bug_reports (id, description, app_version, platform, language, screen) values ('11111111-1111-1111-1111-111111111111','Button does not work','2.1.0','android','en','settings')")"
check "report is stored for B"       "$B"                   "$($P -c "select user_id from eab_bug_reports where id='11111111-1111-1111-1111-111111111111'")"
check "B cannot report as A (user_id cannot be set)" "permission denied" "$(as $B b@x.com "insert into eab_bug_reports (id, user_id, description) values ('22222222-2222-2222-2222-222222222222','$A','x')")"
check "empty description refused"    "violates check constraint"   "$(as $B b@x.com "insert into eab_bug_reports (description) values ('   ')")"
check "other user's screenshot path refused" "violates check constraint" "$(as $B b@x.com "insert into eab_bug_reports (description, screenshot_path) values ('x','$A/abc.jpg')")"
check "B reads own report"           "1"                    "$(as $B b@x.com "select count(*) from eab_bug_reports")"
check "A cannot read B's report"     "0"                    "$(as $A a@x.com "select count(*) from eab_bug_reports")"
check "reports cannot be edited"     "permission denied"    "$(as $B b@x.com "update eab_bug_reports set description='changed'")"
check "reports cannot be deleted"    "permission denied"    "$(as $B b@x.com "delete from eab_bug_reports")"
check "reporter cannot set status"   "permission denied"    "$(as $B b@x.com "insert into eab_bug_reports (description, status) values ('x','fixed')")"
check "anon cannot read reports"     "permission denied"    "$(printf "set role anon;\nselect count(*) from eab_bug_reports;\n" | $P 2>&1)"
check "anon cannot add reports"      "permission denied"    "$(printf "set role anon;\ninsert into eab_bug_reports (description) values ('x');\n" | $P 2>&1)"
check "anon cannot call membership" "permission denied"    "$(printf "set role anon;\nselect * from eab_my_membership();\n" | $P 2>&1)"
echo "passed $pass, failed $fail"
[ "$fail" -eq 0 ]
