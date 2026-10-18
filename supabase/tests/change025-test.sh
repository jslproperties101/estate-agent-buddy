#!/usr/bin/env bash
# Changes 24 and 25 proposals (supabase/proposed/2026101820*_change024_* and 2026101821*_change025_*): live invitation changes and phone notifications.
# LOCAL PostgreSQL only, with stand-ins for Supabase's auth schema; applies nothing anywhere real.
# Usage: PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres bash supabase/tests/change019-test.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="psql -v ON_ERROR_STOP=1 -q"; DBN=eab_change025_test
$ROOT -c "drop database if exists $DBN;" -c "create database $DBN;" >/dev/null
DB="$ROOT -d $DBN"; P="psql -d $DBN -q -tA"
$DB >/dev/null 2>&1 <<'SQL'
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
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
         supabase/proposed/20261017000000_change010_fix_pgcrypto_path.sql supabase/proposed/20261018100000_change013_invitation_answers.sql; do $DB -f $f >/dev/null 2>&1; done
$DB -c "grant usage on schema public to service_role;" >/dev/null
set +e +o pipefail
pass=0; fail=0
check() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS $1"; else fail=$((fail+1)); echo "FAIL $1 :: expected [$2] got [$3]"; fi; }
check_none() { if [[ -z "$2" ]]; then pass=$((pass+1)); echo "PASS $1"; else fail=$((fail+1)); echo "FAIL $1 :: expected nothing, got [$2]"; fi; }
A=aaaaaaaa-0000-0000-0000-000000000001; B=bbbbbbbb-0000-0000-0000-000000000002; C=cccccccc-0000-0000-0000-000000000003
declare -A EM=([$A]=a@x.com [$B]=b@x.com [$C]=c@x.com)
as() { local uid=$1; shift; printf "begin;\nset local role authenticated;\nselect set_config('request.jwt.claim.sub','%s',true) \\\\g /dev/null\nselect set_config('request.jwt.claims','{\"sub\":\"%s\",\"email\":\"%s\",\"user_metadata\":{\"full_name\":\"Agent %s\"}}',true) \\\\g /dev/null\n%s;\ncommit;\n" "$uid" "$uid" "${EM[$uid]}" "${uid:0:1}" "$*" | $P 2>&1 | grep -v '^$' | sed 's/^psql:<stdin>:[0-9]*: //' | tr '\n' ' ' | sed 's/ $//'; }
svc() { printf "begin;\nset local role service_role;\n%s;\ncommit;\n" "$*" | $P 2>&1 | grep -v '^$' | sed 's/^psql:<stdin>:[0-9]*: //' | tr '\n' ' ' | sed 's/ $//'; }
anon() { printf "begin;\nset local role anon;\n%s;\ncommit;\n" "$*" | $P 2>&1 | grep -v '^$' | tr '\n' ' '; }
q() { $P -c "$*"; }
for u in $A $B $C; do as $u "select role from eab_my_membership()" >/dev/null; done
TB=tokB_aaaaaaaaaaaaaaaaaaaaaaaa; TB2=tokB2_bbbbbbbbbbbbbbbbbbbbbbb; TA=tokA_cccccccccccccccccccccccc; TC=tokC_dddddddddddddddddddddddd

echo "--- Change 24: apply"
OUT=$($DB -f supabase/proposed/20261018200000_change024_live_invites.sql 2>&1); check_none "24 applies cleanly" "$(echo "$OUT" | grep -i error)"
OUT=$($DB -f supabase/proposed/20261018200000_change024_live_invites.sql 2>&1); check_none "24 can be re-applied" "$(echo "$OUT" | grep -i error)"
check "invitations table sends live changes" "1" "$(q "select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='eab_team_invites'")"
check "no other table sends live changes"   "1" "$(q "select count(*) from pg_publication_tables where pubname='supabase_realtime'")"
# Realtime delivers a change only to people the table's row-level security lets read it: check that rule is still the one we rely on
INV0=$(as $A "select eab_team_invite('b@x.com') ->> 'invite_id'")
check "the invited person can see the invitation row"  "1" "$(as $B "select count(*) from eab_team_invites where id='$INV0'")"
check "the sender can see it"                          "1" "$(as $A "select count(*) from eab_team_invites where id='$INV0'")"
check "a third person cannot"                          "0" "$(as $C "select count(*) from eab_team_invites where id='$INV0'")"
as $A "select eab_team_cancel_invite('$INV0')" >/dev/null

echo "--- Change 25: apply"
OUT=$($DB -f supabase/proposed/20261018210000_change025_push.sql 2>&1); check_none "25 applies cleanly" "$(echo "$OUT" | grep -i error)"
OUT=$($DB -f supabase/proposed/20261018210000_change025_push.sql 2>&1); check_none "25 can be re-applied" "$(echo "$OUT" | grep -i error)"

echo "--- phone addresses"
check_none "B registers this phone"                    "$(as $B "select eab_push_register('$TB','android','bm')")"
check_none "B's second phone"                          "$(as $B "select eab_push_register('$TB2','android','en')")"
check_none "A registers"                               "$(as $A "select eab_push_register('$TA')")"
check "nobody reads addresses through the API"   "permission denied" "$(as $B "select count(*) from eab_push_tokens")"
check "nobody writes them directly"              "permission denied" "$(as $B "insert into eab_push_tokens (token,user_id) values ('$TC','$B')")"
check "anonymous cannot register"                "denied"            "$(anon "select eab_push_register('$TC')")"
check "bad address refused"                      "invalid token"     "$(as $B "select eab_push_register('x y')")"
check "bad platform refused"                     "invalid platform"  "$(as $B "select eab_push_register('$TC','windows')")"
check "bad language refused"                     "violates check"    "$(as $B "select eab_push_register('$TC','android','fr')")"
check "stored with owner and language"           "$B|bm"             "$(q "select user_id||'|'||lang from eab_push_tokens where token='$TB'")"
as $C "select eab_push_register('$TB2')" >/dev/null
check "an address moves to whoever signs in on that phone" "$C"      "$(q "select user_id from eab_push_tokens where token='$TB2'")"
as $B "select eab_push_unregister('$TB2')" >/dev/null
check "B cannot remove C's address"              "1"                 "$(q "select count(*) from eab_push_tokens where token='$TB2'")"
as $C "select eab_push_unregister('$TB2')" >/dev/null
check "C removes its own on sign-out"            "0"                 "$(q "select count(*) from eab_push_tokens where token='$TB2'")"
for i in $(seq 1 12); do as $C "select eab_push_register('tokC_${i}_xxxxxxxxxxxxxxxxxxxx')" >/dev/null; done
check "at most 10 phones per person"             "10"                "$(q "select count(*) from eab_push_tokens where user_id='$C'")"
q "delete from eab_push_tokens where user_id='$C'" >/dev/null

echo "--- who may ask whom to tell"
INV=$(as $A "select eab_team_invite('b@x.com') ->> 'invite_id'")
check "a signed-in person cannot ask directly"   "permission denied" "$(as $A "select * from eab_push_claim('$INV','invite','$A')")"
check "nor remove addresses"                     "permission denied" "$(as $A "select eab_push_drop('$TB')")"
check_none "someone who did not send it gets nothing" "$(svc "select token from eab_push_claim('$INV','invite','$C')")"
check "the sender's call: B's phone, B's language, A's name" "$TB|bm|invite|Agent a" "$(svc "select token||'|'||lang||'|'||kind||'|'||who from eab_push_claim('$INV','invite','$A')")"
check_none "announced once only"                 "$(svc "select token from eab_push_claim('$INV','invite','$A')")"
check_none "an answer cannot be announced before there is one" "$(svc "select token from eab_push_claim('$INV','answer','$B')")"
as $B "select eab_team_accept(null, '$INV')" >/dev/null
check_none "only the person who answered can announce it" "$(svc "select token from eab_push_claim('$INV','answer','$A')")"
check "B's answer goes to A's phone"             "$TA|accepted|Agent b" "$(svc "select token||'|'||kind||'|'||who from eab_push_claim('$INV','answer','$B')")"
check_none "the answer is announced once only"   "$(svc "select token from eab_push_claim('$INV','answer','$B')")"
as $A "select eab_team_leave()" >/dev/null 2>&1

INV2=$(as $A "select eab_team_invite('c@x.com') ->> 'invite_id'")
q "update eab_team_invites set created_at = now() - interval '20 minutes' where id='$INV2'" >/dev/null
as $C "select eab_push_register('$TC')" >/dev/null
check_none "an old invitation is not announced late" "$(svc "select token from eab_push_claim('$INV2','invite','$A')")"
as $C "select eab_team_decline(null, '$INV2')" >/dev/null
check "a decline is announced to the sender (by email: not a member)" "declined|c@x.com"  "$(svc "select kind||'|'||who from eab_push_claim('$INV2','answer','$C')")"
INV3=$(as $A "select eab_team_invite(null) ->> 'invite_id'")
check_none "a link invitation (no email) sends nothing" "$(svc "select token from eab_push_claim('$INV3','invite','$A')")"
as $A "select eab_team_cancel_invite('$INV3')" >/dev/null
INV4=$(as $A "select eab_team_invite('nobody@x.com') ->> 'invite_id'")
check_none "a person who never signed in: nothing to send" "$(svc "select token from eab_push_claim('$INV4','invite','$A')")"
check "  ...but it is marked so it is not tried again" "t"           "$(q "select (pushed_at is not null)::text from eab_team_invites where id='$INV4'")"
as $A "select eab_team_cancel_invite('$INV4')" >/dev/null
check_none "the service removes an address Google no longer knows" "$(svc "select eab_push_drop('$TC')")"
check "  ...and it is gone"                      "0"                 "$(q "select count(*) from eab_push_tokens where token='$TC'")"
check "deleting a person removes their addresses" "0"                "$(q "delete from auth.users where id='$C'; select count(*) from eab_push_tokens where user_id='$C'" | tail -1)"
check "team status still works with the new columns" "members"       "$(as $A "select eab_team_status()::text")"

echo "--- rollback and re-apply"
OUT=$($DB -f supabase/proposed/20261018210000_change025_rollback.sql 2>&1); check_none "25 rollback runs" "$(echo "$OUT" | grep -i error)"
check "25 rollback removes the table"            "0"                 "$(q "select count(*) from pg_tables where tablename='eab_push_tokens'")"
check "25 rollback keeps invitations"            "t"                 "$(q "select (count(*) > 0)::text from eab_team_invites")"
OUT=$($DB -f supabase/proposed/20261018200000_change024_rollback.sql 2>&1); check_none "24 rollback runs" "$(echo "$OUT" | grep -i error)"
check "24 rollback stops live changes"           "0"                 "$(q "select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='eab_team_invites'")"
OUT=$($DB -f supabase/proposed/20261018200000_change024_live_invites.sql -f supabase/proposed/20261018210000_change025_push.sql 2>&1); check_none "both apply again after rollback" "$(echo "$OUT" | grep -i error)"
echo "passed $pass, failed $fail"
[ "$fail" -eq 0 ]
