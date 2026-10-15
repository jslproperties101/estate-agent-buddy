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
check_ok() { if [[ "$2" != *ERROR* ]]; then pass=$((pass+1)); echo "PASS $1"; else fail=$((fail+1)); echo "FAIL $1 :: expected no error, got [$2]"; fi; }
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
check_ok "B adds own record" "$(as $B b@x.com "insert into eab_records (workspace_id, collection, id, data, updated, user_id) values ('$WSA','contacts','cb','{\"name\":\"Buyer of B\"}',2,'$B')")"
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
# Stand-in for Supabase Storage (the real service is not part of plain PostgreSQL): same table and function names, so the
# object policies in the migrations are the very ones that run on Supabase. The upload/download HTTP layer is not tested here.
$DB >/dev/null 2>&1 <<'SQL'
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid default auth.uid(), created_at timestamptz default now(), unique (bucket_id, name));
create function storage.foldername(name text) returns text[] language sql immutable as $f$ select (string_to_array(name, '/'))[1:greatest(coalesce(array_length(string_to_array(name, '/'), 1), 1) - 1, 0)] $f$;
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated; grant select, insert on storage.objects to authenticated; grant execute on function storage.foldername(text) to authenticated;
SQL
$DB -f supabase/migrations/20261013120000_bug_reports.sql >/dev/null 2>&1
check "bug report migration applied" "eab_bug_reports"      "$($P -c "select to_regclass('public.eab_bug_reports')")"
check_ok "B adds a bug report as self" "$(as $B b@x.com "insert into eab_bug_reports (id, description, app_version, platform, language, screen) values ('11111111-1111-1111-1111-111111111111','Button does not work','2.1.0','android','en','settings')")"
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

# ---- bug-report screenshots in the (stand-in) private bucket
SB1=bbbbbbbb-0000-0000-0000-000000000002/shot1.jpg
check "bug bucket is private"        "f"                    "$($P -c "select public from storage.buckets where id='bug-reports'")"
check_ok "B uploads into own folder" "$(as $B b@x.com "insert into storage.objects (bucket_id, name) values ('bug-reports','$SB1')")"
check "B cannot upload into A's folder" "row-level security" "$(as $B b@x.com "insert into storage.objects (bucket_id, name) values ('bug-reports','$A/x.jpg')")"
check "B reads own screenshot"       "1"                    "$(as $B b@x.com "select count(*) from storage.objects where bucket_id='bug-reports'")"
check "A cannot read B's screenshot" "0"                    "$(as $A a@x.com "select count(*) from storage.objects where bucket_id='bug-reports'")"

# ======================= Phase 2: 20261014000000_phase2_sync_refs_files.sql =======================
# Existing data first: two legacy properties share the number 2001 (P2001 and A2001), written before the migration exists.
$P -c "insert into eab_records (workspace_id, user_id, collection, id, data, updated) values
  ('$WSA','$A','properties','legacy1','{\"ref\":\"P2001\",\"refNo\":2001,\"refPrefix\":\"P\",\"headline\":\"Legacy one\"}',10),
  ('$WSA','$A','properties','legacy2','{\"ref\":\"A2001\",\"refNo\":2001,\"refPrefix\":\"A\",\"headline\":\"Legacy two\"}',11),
  ('$WSA','$A','properties','legacy3','{\"ref\":\"P2002\",\"refNo\":2002,\"refPrefix\":\"P\",\"headline\":\"Legacy three\"}',12)" >/dev/null
check "phase 2 migration applies on existing data (no error)" "0" "$($DB -f supabase/migrations/20261014000000_phase2_sync_refs_files.sql 2>&1 | grep -ci "error")"
# EAB_WITH_CHANGE010=1: every check below runs again with the Change 010 proposal in place (it must not widen access).
if [ "${EAB_WITH_CHANGE010:-}" = "1" ]; then
  $P -c "alter table auth.users add column if not exists banned_until timestamptz, add column if not exists deleted_at timestamptz" >/dev/null
  check "Change 010 proposal applies on top (no error)" "0" "$($DB -f supabase/proposed/20261016000000_change010_team_sharing_audit.sql 2>&1 | grep -ci "error")"
fi
check "every existing row got a seq"   "0"                  "$($P -c "select count(*) from eab_records where seq is null")"
check "existing rows start at rev 1"   "1"                  "$($P -c "select count(distinct rev) from eab_records")"
check "registry holds the oldest legacy property"  "legacy1" "$($P -c "select property_id from eab_property_refs where workspace_id='$WSA' and ref_no=2001")"
check "legacy duplicate is listed, not renamed"    "legacy1,legacy2" "$($P -c "select array_to_string(property_ids, ',') from eab_ref_duplicates where ref_no=2001")"
check "legacy duplicate keeps its own reference"   "A2001"  "$($P -c "select data->>'ref' from eab_records where id='legacy2'")"
push() { local uid=$1 em=$2 json=$3; as "$uid" "$em" "select eab_push_records('$WSA', '$json'::jsonb)"; }
check "edit of a legacy duplicate (reference unchanged) still works" "\"status\": \"ok\"" "$(push $A a@x.com '[{"collection":"properties","id":"legacy2","base_rev":1,"data":{"ref":"A2001","refNo":2001,"refPrefix":"A","headline":"Legacy two edited"},"updated":20,"op_id":"l2"}]')"
check "legacy duplicate cannot move onto another used number" "ref_conflict" "$(push $A a@x.com '[{"collection":"properties","id":"legacy2","base_rev":2,"data":{"ref":"A2002","refNo":2002,"refPrefix":"A"},"updated":21,"op_id":"l2b"}]')"
check "new property cannot reuse 2001 under another prefix" "ref_conflict" "$(push $A a@x.com '[{"collection":"properties","id":"dup1","base_rev":0,"data":{"ref":"B2001","refNo":2001,"refPrefix":"B"},"updated":22,"op_id":"d1"}]')"
check "the refused record was not written"        "0"       "$($P -c "select count(*) from eab_records where id='dup1'")"

# versions, retries and compare-and-set
check "new record: ok, rev 1"         "\"rev\": 1"          "$(push $A a@x.com '[{"collection":"properties","id":"np1","base_rev":0,"data":{"ref":"P3001","refNo":3001,"refPrefix":"P","headline":"New one"},"updated":100,"op_id":"op1"}]')"
check "retry of the same write is not applied twice" "\"duplicate\": true" "$(push $A a@x.com '[{"collection":"properties","id":"np1","base_rev":0,"data":{"ref":"P3001","refNo":3001,"refPrefix":"P","headline":"New one"},"updated":100,"op_id":"op1"}]')"
check "...and the record is still at rev 1" "1"             "$($P -c "select rev from eab_records where id='np1'")"
SEQ1=$($P -c "select seq from eab_records where id='np1'")
check "update with the current base: ok, rev 2" "\"rev\": 2"  "$(push $A a@x.com '[{"collection":"properties","id":"np1","base_rev":1,"data":{"ref":"P3001","refNo":3001,"refPrefix":"P","headline":"Edited by A"},"updated":101,"op_id":"op2"}]')"
check "seq moves forward on every write" "1"                "$($P -c "select (seq > $SEQ1)::int from eab_records where id='np1'")"
check "stale base: conflict with the cloud copy, nothing written" "\"status\": \"conflict\"" "$(push $A a@x.com '[{"collection":"properties","id":"np1","base_rev":1,"data":{"ref":"P3001","refNo":3001,"refPrefix":"P","headline":"Edited on another phone"},"updated":102,"op_id":"op3"}]')"
check "...the cloud copy was not overwritten"    "Edited by A" "$($P -c "select data->>'headline' from eab_records where id='np1'")"
check "the overwritten version is kept in history" "New one"  "$($P -c "select data->>'headline' from eab_record_revisions where record_id='np1' and rev=1")"
check "history readable by the record's reader"   "1"        "$(as $A a@x.com "select count(*) from eab_record_revisions where record_id='np1'")"
check "history hidden from someone who cannot read the record" "0" "$(as $B b@x.com "select count(*) from eab_record_revisions where record_id='np1'")"
check "history is not writable through the API"   "permission denied" "$(as $A a@x.com "insert into eab_record_revisions (workspace_id, collection, record_id, rev, deleted) values ('$WSA','properties','np1',99,false)")"
for i in $(seq 1 30); do $P -c "update eab_records set data = jsonb_set(data, '{headline}', to_jsonb('edit $i'::text)) where id='np1'" >/dev/null; done
check "history keeps at most 25 versions per record" "25"    "$($P -c "select count(*) from eab_record_revisions where record_id='np1'")"

# permissions are still decided by row-level security
check "agent cannot write someone else's record" "\"status\": \"denied\"" "$(push $B b@x.com '[{"collection":"properties","id":"np1","base_rev":33,"data":{"ref":"P3001","refNo":3001},"updated":200,"op_id":"b1"}]')"
check "outsider cannot push into the workspace"  "not allowed" "$(as $C c@x.com "select eab_push_records('$WSA', '[]'::jsonb)")"
as $A a@x.com "select eab_set_member('$WSA','$B','limited',true)" >/dev/null
check "limited user cannot write"                "\"status\": \"denied\"" "$(push $B b@x.com '[{"collection":"tasks","id":"lt1","base_rev":0,"data":{"title":"x"},"updated":300,"op_id":"lt1"}]')"
as $A a@x.com "select eab_set_member('$WSA','$B','agent',true)" >/dev/null
check "agent can add own record"                 "\"status\": \"ok\"" "$(push $B b@x.com '[{"collection":"properties","id":"bp1","base_rev":0,"data":{"ref":"P3100","refNo":3100,"refPrefix":"P","headline":"B property"},"updated":301,"op_id":"bp1"}]')"
check "refused reference: holder visible to a user who may read it" "\"other_title\": \"B property\"" "$(push $A a@x.com '[{"collection":"properties","id":"dup2","base_rev":0,"data":{"ref":"A3100","refNo":3100,"refPrefix":"A"},"updated":302,"op_id":"d2"}]')"
check "refused reference: holder hidden from a user who may not" "\"other_visible\": false" "$(push $B b@x.com '[{"collection":"properties","id":"dup3","base_rev":0,"data":{"ref":"B3001","refNo":3001,"refPrefix":"B"},"updated":303,"op_id":"d3"}]')"
check "refused reference: no title leaked"       "\"other_title\": null" "$(push $B b@x.com '[{"collection":"properties","id":"dup3","base_rev":0,"data":{"ref":"B3001","refNo":3001,"refPrefix":"B"},"updated":303,"op_id":"d3"}]' | sed 's/\"other_title\": null/\"other_title\": null/')"
check "same number in another workspace is fine" "ok"        "$(as $C c@x.com "select eab_push_records((select workspace_id from eab_members where user_id='$C' limit 1), '[{\"collection\":\"properties\",\"id\":\"cp1\",\"base_rev\":0,\"data\":{\"ref\":\"P3001\",\"refNo\":3001},\"updated\":1,\"op_id\":\"c1\"}]'::jsonb)")"
check "deleting a property frees its number"     "\"status\": \"ok\"" "$(push $A a@x.com '[{"collection":"properties","id":"np1","base_rev":'$($P -c "select rev from eab_records where id='np1'")',"data":null,"deleted":true,"updated":400,"op_id":"del1"}]')"
check "...and another property can take it"      "\"status\": \"ok\"" "$(push $A a@x.com '[{"collection":"properties","id":"np2","base_rev":0,"data":{"ref":"A3001","refNo":3001,"refPrefix":"A","headline":"Reused"},"updated":401,"op_id":"np2"}]')"
check "plain SQL (an old app) cannot create a duplicate either" "eab_property_refs" "$(as $A a@x.com "insert into eab_records (workspace_id, collection, id, data, updated) values ('$WSA','properties','old1','{\"ref\":\"C3001\",\"refNo\":3001}',1)")"

# two devices at the same moment
CD=$(mktemp -d)
for i in 1 2 3 4 5 6 7 8; do ( push $A a@x.com '[{"collection":"properties","id":"race'$i'","base_rev":0,"data":{"ref":"P4000","refNo":4000,"refPrefix":"P"},"updated":500,"op_id":"race'$i'"}]' > $CD/ref$i.out 2>&1 ) & done; wait
check "8 simultaneous creates of one number: exactly one wins" "1" "$(cat $CD/ref*.out | grep -o '"status": "ok"' | wc -l | tr -d ' ')"
check "...the other 7 are refused as reference conflicts" "7" "$(cat $CD/ref*.out | grep -o 'ref_conflict' | wc -l | tr -d ' ')"
check "...and the registry holds exactly one row for it" "1" "$($P -c "select count(*) from eab_property_refs where workspace_id='$WSA' and ref_no=4000")"
REV0=$($P -c "select rev from eab_records where id='np2'")
for i in 1 2 3 4 5 6; do ( push $A a@x.com '[{"collection":"properties","id":"np2","base_rev":'$REV0',"data":{"ref":"A3001","refNo":3001,"refPrefix":"A","headline":"Device '$i'"},"updated":600,"op_id":"dev'$i'"}]' > $CD/cas$i.out 2>&1 ) & done; wait
check "6 devices updating from the same version: exactly one wins" "1" "$(cat $CD/cas*.out | grep -o '"status": "ok"' | wc -l | tr -d ' ')"
check "...the other 5 get a conflict, nothing lost"             "5" "$(cat $CD/cas*.out | grep -o '"status": "conflict"' | wc -l | tr -d ' ')"
check "...and the version went up by exactly one"               "$((REV0+1))" "$($P -c "select rev from eab_records where id='np2'")"
for i in 1 2 3 4; do ( push $A a@x.com '[{"collection":"tasks","id":"same","base_rev":0,"data":{"title":"t"},"updated":700,"op_id":"retry"}]' > $CD/dup$i.out 2>&1 ) & done; wait
check "4 simultaneous retries of one write: one row, never two" "1" "$($P -c "select count(*) from eab_records where id='same' and collection='tasks'")"
check "...all four are answered ok"                              "4" "$(cat $CD/dup*.out | grep -o '"status": "ok"' | wc -l | tr -d ' ')"
rm -rf $CD

# ---- files: metadata and private storage follow the record
H1=1111111111111111111111111111111111111111111111111111111111111111
H2=2222222222222222222222222222222222222222222222222222222222222222
check_ok "owner registers a file for a property" "$(as $A a@x.com "insert into eab_files (workspace_id, file_id, collection, record_id, kind, sha256, bytes, mime, name) values ('$WSA','f1','properties','np2','photo','$H1',1000,'image/jpeg','a.jpg')")"
check "path is workspace/sha-256 (generated)"    "$WSA/$H1"  "$($P -c "select storage_path from eab_files where file_id='f1'")"
check "same file id twice is refused (no duplicates)" "duplicate key" "$(as $A a@x.com "insert into eab_files (workspace_id, file_id, collection, record_id, kind, sha256, bytes) values ('$WSA','f1','properties','np2','photo','$H1',1000)")"
check "agent cannot attach to a record they cannot read" "row-level security" "$(as $B b@x.com "insert into eab_files (workspace_id, file_id, collection, record_id, kind, sha256, bytes) values ('$WSA','f2','properties','np2','photo','$H2',10)")"
check_ok "agent can attach to their own record" "$(as $B b@x.com "insert into eab_files (workspace_id, file_id, collection, record_id, kind, sha256, bytes, mime) values ('$WSA','f3','properties','bp1','photo','$H2',10,'image/jpeg')")"
check "agent cannot see the owner's file row"    "0"        "$(as $B b@x.com "select count(*) from eab_files where file_id='f1'")"
check "agent sees their own file row"            "1"        "$(as $B b@x.com "select count(*) from eab_files where file_id='f3'")"
check "owner sees every file in the workspace"   "2"        "$(as $A a@x.com "select count(*) from eab_files")"
check "outsider sees no file rows"               "0"        "$(as $C c@x.com "select count(*) from eab_files")"
check "limited user cannot attach files"         "row-level security" "$(as $A a@x.com "select eab_set_member('$WSA','$B','limited',true)" >/dev/null; as $B b@x.com "insert into eab_files (workspace_id, file_id, collection, record_id, kind, sha256, bytes) values ('$WSA','f4','properties','bp1','photo','$H2',10)")"
as $A a@x.com "select eab_set_member('$WSA','$B','agent',true)" >/dev/null
check "uploader can mark a file uploaded"        "1"        "$(as $A a@x.com "with u as (update eab_files set status='uploaded', uploaded_at=now() where file_id='f1' returning 1) select count(*) from u")"
check "another agent cannot change the owner's row" "0"    "$(as $B b@x.com "with u as (update eab_files set deleted=true where file_id='f1' returning 1) select count(*) from u")"
check "the content hash cannot be changed afterwards" "permission denied" "$(as $B b@x.com "update eab_files set sha256='$H1' where file_id='f3'")"
check "file rows cannot be deleted"              "permission denied" "$(as $A a@x.com "delete from eab_files where file_id='f1'")"
check "bucket eab-files is private"              "f"        "$($P -c "select public from storage.buckets where id='eab-files'")"
check_ok "owner uploads the object at workspace/sha" "$(as $A a@x.com "insert into storage.objects (bucket_id, name) values ('eab-files','$WSA/$H1')")"
check "no upload without a metadata row"         "row-level security" "$(as $A a@x.com "insert into storage.objects (bucket_id, name) values ('eab-files','$WSA/3333333333333333333333333333333333333333333333333333333333333333')")"
check "agent cannot upload over the owner's file" "row-level security" "$(as $B b@x.com "insert into storage.objects (bucket_id, name) values ('eab-files','$WSA/${H1:0:63}9')")"
check "agent cannot upload into another workspace" "row-level security" "$(as $B b@x.com "insert into storage.objects (bucket_id, name) values ('eab-files','cccccccc-0000-0000-0000-00000000aaaa/$H2')")"
check "agent cannot read the owner's object"     "0"        "$(as $B b@x.com "select count(*) from storage.objects where bucket_id='eab-files'")"
check "owner reads the object"                   "1"        "$(as $A a@x.com "select count(*) from storage.objects where bucket_id='eab-files'")"
check "outsider cannot read the object"          "0"        "$(as $C c@x.com "select count(*) from storage.objects where bucket_id='eab-files'")"
check_ok "agent uploads their own file's object" "$(as $B b@x.com "insert into storage.objects (bucket_id, name) values ('eab-files','$WSA/$H2')")"
check "owner can read the agent's object (record access)" "2" "$(as $A a@x.com "select count(*) from storage.objects where bucket_id='eab-files'")"
check "objects cannot be deleted through the API" "permission denied" "$(as $A a@x.com "delete from storage.objects where bucket_id='eab-files'")"
check "removed file: marked deleted, object kept" "1"       "$(as $A a@x.com "with u as (update eab_files set deleted=true where file_id='f1' returning 1) select count(*) from u")"
check "...still readable by the owner (undo can bring it back)" "2" "$(as $A a@x.com "select count(*) from storage.objects where bucket_id='eab-files'")"
check "...but no new upload for a deleted file"  "row-level security" "$(as $A a@x.com "insert into storage.objects (bucket_id, name) values ('eab-files','$WSA/$H1')")"
check "anon cannot call membership" "permission denied"    "$(printf "set role anon;\nselect * from eab_my_membership();\n" | $P 2>&1)"
# An old app (Phase 1) writes with a plain upsert: it still works after the migration, and what it replaces is kept in history.
as $A a@x.com "insert into eab_records (workspace_id, collection, id, data, updated) values ('$WSA','contacts','oldapp1','{\"name\":\"v1\"}',1)" >/dev/null
as $A a@x.com "insert into eab_records (workspace_id, collection, id, data, updated) values ('$WSA','contacts','oldapp1','{\"name\":\"OLD APP OVERWRITE\"}',2) on conflict (workspace_id, collection, id) do update set data = excluded.data, updated = excluded.updated" >/dev/null
check "old app plain upsert still overwrites (no version check)" "OLD APP OVERWRITE" "$($P -c "select data->>'name' from eab_records where id='oldapp1'")"
check "...and the replaced version is kept in cloud history"      "v1"                "$($P -c "select data->>'name' from eab_record_revisions where record_id='oldapp1'")"
echo "passed $pass, failed $fail"
[ "$fail" -eq 0 ]
