#!/usr/bin/env bash
# Who can download a record's pictures and documents (Change 010 sharing x Change 006 backup boundary).
# LOCAL PostgreSQL only, with stand-ins for Supabase auth and Storage; applies nothing anywhere real.
# Usage: PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres bash supabase/tests/file-access-test.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="psql -v ON_ERROR_STOP=1 -q"; DBN=eab_file_access_test
$ROOT -c "drop database if exists $DBN;" -c "create database $DBN;" >/dev/null
DB="$ROOT -d $DBN"; P="psql -d $DBN -q -tA"
$DB >/dev/null 2>&1 <<'SQL'
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key, email text, banned_until timestamptz, deleted_at timestamptz);
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
create function auth.jwt() returns jsonb language sql stable as $f$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated; grant usage on schema public to anon, authenticated;
insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001','a@x.com'), ('bbbbbbbb-0000-0000-0000-000000000002','b@x.com'),
  ('cccccccc-0000-0000-0000-000000000003','c@x.com'), ('dddddddd-0000-0000-0000-000000000004','d@x.com');
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid default auth.uid(), created_at timestamptz default now(), unique (bucket_id, name));
alter table storage.objects enable row level security; grant usage on schema storage to authenticated; grant select, insert on storage.objects to authenticated;
SQL
$DB -f supabase/migrations/20261012000000_eab_records.sql >/dev/null 2>&1
$DB -c "grant select, insert, update on public.eab_records to authenticated;" >/dev/null
$DB -f supabase/migrations/20261012120000_workspaces_roles.sql >/dev/null 2>&1
$DB -f supabase/migrations/20261014000000_phase2_sync_refs_files.sql >/dev/null 2>&1
set +e +o pipefail
pass=0; fail=0
check() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS $1"; else fail=$((fail+1)); echo "FAIL $1 :: expected [$2] got [$3]"; fi; }
check_none() { if [[ -z "$2" ]]; then pass=$((pass+1)); echo "PASS $1"; else fail=$((fail+1)); echo "FAIL $1 :: expected nothing, got [$2]"; fi; }
check_ok() { if [[ "$2" != *ERROR* ]]; then pass=$((pass+1)); echo "PASS $1"; else fail=$((fail+1)); echo "FAIL $1 :: expected no error, got [$2]"; fi; }
OUT=$($DB -f supabase/proposed/20261016000000_change010_team_sharing_audit.sql 2>&1); check_none "proposal applies cleanly" "$(echo "$OUT" | grep -i error)"

A=aaaaaaaa-0000-0000-0000-000000000001; B=bbbbbbbb-0000-0000-0000-000000000002; C=cccccccc-0000-0000-0000-000000000003; D=dddddddd-0000-0000-0000-000000000004
declare -A EM=([$A]=a@x.com [$B]=b@x.com [$C]=c@x.com [$D]=d@x.com)
declare -A NM=([$A]="Aina Agent" [$B]="Badrul Agent" [$C]="Chong" [$D]="")
as() { local uid=$1; shift; printf "begin;\nset local role authenticated;\nselect set_config('request.jwt.claim.sub','%s',true) \\\\g /dev/null\nselect set_config('request.jwt.claims','{\"sub\":\"%s\",\"email\":\"%s\",\"user_metadata\":{\"full_name\":\"%s\"}}',true) \\\\g /dev/null\n%s;\ncommit;\n" "$uid" "$uid" "${EM[$uid]}" "${NM[$uid]}" "$*" | $P 2>&1 | grep -v '^$' | sed 's/^psql:<stdin>:[0-9]*: //' | tr '\n' ' ' | sed 's/ $//'; }
q() { $P -c "$*"; }
for u in $A $B $C $D; do as $u "select role from eab_my_membership()" >/dev/null; done
WSA=$(q "select workspace_id from eab_members where user_id='$A'"); WSB=$(q "select workspace_id from eab_members where user_id='$B'")
push() { local uid=$1 ws=$2; shift 2; as $uid "select eab_push_records('$ws', '$*'::jsonb)"; }
push $A $WSA '[{"collection":"properties","id":"p1","base_rev":0,"data":{"id":"p1","ref":"P1001"},"updated":1,"op_id":"a1"},
 {"collection":"properties","id":"p2","base_rev":0,"data":{"id":"p2","ref":"P1002"},"updated":1,"op_id":"a2"}]' >/dev/null
S1=$(printf 'a%.0s' $(seq 1 64)); S2=$(printf 'b%.0s' $(seq 1 64))
as $A "insert into eab_files (workspace_id, file_id, collection, record_id, kind, sha256, bytes, name) values ('$WSA','f1','properties','p1','photo','$S1',10,'front.jpg'), ('$WSA','f2','properties','p2','document','$S2',20,'brochure.pdf')" >/dev/null
as $A "insert into storage.objects (bucket_id, name) values ('eab-files','$WSA/$S1'), ('eab-files','$WSA/$S2')" >/dev/null
check "setup: A's two file rows" "2" "$(as $A "select count(*) from eab_files")"
check "setup: A reads both stored objects" "2" "$(as $A "select count(*) from storage.objects")"
files_b() { as $B "select count(*) from eab_files where workspace_id='$WSA'"; }
objs_b()  { as $B "select count(*) from storage.objects where name like '$WSA/%'"; }

echo "--- no team"
check "B sees none of A's file rows" "0" "$(files_b)"
check "B can download none of A's objects" "0" "$(objs_b)"
INV=$(as $A "select eab_team_invite(null)"); TOK=$(echo "$INV" | sed 's/.*"token": "\([0-9a-f]*\)".*/\1/')
as $B "select eab_team_accept('$TOK')" >/dev/null
echo "--- team, nothing shared"
check "joining the team gives B no file of A's" "0" "$(files_b)"
check "...and no object" "0" "$(objs_b)"
echo "--- p1 shared View Only"
as $A "select eab_share_set('$WSA','[{\"collection\":\"properties\",\"id\":\"p1\",\"level\":\"view\"}]')" >/dev/null
check "B sees exactly p1's file" "f1" "$(as $B "select string_agg(file_id, ',') from eab_files where workspace_id='$WSA'")"
check "B can download exactly p1's object" "$WSA/$S1" "$(as $B "select string_agg(name, ',') from storage.objects where name like '$WSA/%'")"
check "View Only: B cannot add a file to p1" "row-level security" "$(as $B "insert into eab_files (workspace_id, file_id, collection, record_id, kind, sha256, bytes) values ('$WSA','fb','properties','p1','photo','$S2',1)")"
echo "--- revoked"
as $A "select eab_share_set('$WSA','[{\"collection\":\"properties\",\"id\":\"p1\",\"level\":null}]')" >/dev/null
check "after revoking p1, B sees no file of A's" "0" "$(files_b)"
check "...and can download no object of A's" "0" "$(objs_b)"
echo "--- shared again, then B leaves"
as $A "select eab_share_set('$WSA','[{\"collection\":\"properties\",\"id\":\"p1\",\"level\":\"edit\"}]')" >/dev/null
check "shared again: B sees p1's file" "1" "$(files_b)"
as $B "select eab_team_leave()" >/dev/null
check "after leaving, B sees no file of A's" "0" "$(files_b)"
check "...and can download no object of A's" "0" "$(objs_b)"
check "A still has both files" "2" "$(as $A "select count(*) from eab_files")"
echo "passed $pass, failed $fail"
[ $fail -eq 0 ]
