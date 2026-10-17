#!/usr/bin/env bash
# Change 010 proposal (supabase/proposed/20261016000000_change010_*.sql): Team Workspace, sharing, deletion requests,
# audit history. LOCAL PostgreSQL only, with stand-ins for Supabase's auth schema; applies nothing anywhere real.
# Usage: PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres bash supabase/tests/change010-test.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="psql -v ON_ERROR_STOP=1 -q"; DBN=eab_change010_test
$ROOT -c "drop database if exists $DBN;" -c "create database $DBN;" >/dev/null
DB="$ROOT -d $DBN"; P="psql -d $DBN -q -tA"
$DB >/dev/null 2>&1 <<'SQL'
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
-- Like Supabase: pgcrypto lives in the "extensions" schema, NOT public (functions must find it via search_path).
create schema if not exists extensions; create extension if not exists pgcrypto schema extensions;
grant usage on schema extensions to anon, authenticated;
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
# A's own records: two properties, a buyer, a vendor, a to-do, an appointment and a saved calculation.
push $A $WSA '[{"collection":"properties","id":"p1","base_rev":0,"data":{"id":"p1","ref":"P1001","headline":"Shop lot"},"updated":1,"op_id":"a1"},
 {"collection":"properties","id":"p2","base_rev":0,"data":{"id":"p2","ref":"P1002","headline":"Terrace"},"updated":1,"op_id":"a2"},
 {"collection":"contacts","id":"cb","base_rev":0,"data":{"id":"cb","name":"Buyer Bee","roles":["buyer"]},"updated":1,"op_id":"a3"},
 {"collection":"contacts","id":"cv","base_rev":0,"data":{"id":"cv","name":"Vendor Vee","roles":["vendor"]},"updated":1,"op_id":"a4"},
 {"collection":"tasks","id":"t1","base_rev":0,"data":{"id":"t1","title":"Call bank"},"updated":1,"op_id":"a5"},
 {"collection":"appointments","id":"ap1","base_rev":0,"data":{"id":"ap1","kind":"viewing"},"updated":1,"op_id":"a6"},
 {"collection":"calculations","id":"k1","base_rev":0,"data":{"id":"k1","kind":"purchase"},"updated":1,"op_id":"a7"}]' >/dev/null
push $B $WSB '[{"collection":"properties","id":"pb1","base_rev":0,"data":{"id":"pb1","ref":"B2001","headline":"B own"},"updated":1,"op_id":"b1"}]' >/dev/null
check "setup: A has 7 records"                          "7"  "$(as $A "select count(*) from eab_records")"

echo "--- membership"
check "no team before an invitation"                    '"team": null' "$(as $A "select eab_team_status()")"
check "cannot invite yourself"                          "cannot invite yourself" "$(as $A "select eab_team_invite('A@x.com')")"
check "invalid email refused"                           "invalid email" "$(as $A "select eab_team_invite('not-an-email')")"
INV=$(as $A "select eab_team_invite('B@X.com')")
check "A invites b@x.com (link token answered once)"    '"token"' "$INV"
TOK=$(echo "$INV" | sed 's/.*"token": "\([0-9a-f]*\)".*/\1/')
check "token is never stored in clear"                  "0" "$(q "select count(*) from eab_team_invites where token_hash = '$TOK'")"
check "token hash is not readable through the API"      "permission denied" "$(as $A "select token_hash from eab_team_invites")"
check "only one invitation waits at a time"             "already waiting" "$(as $A "select eab_team_invite('d@x.com')")"
check "B sees the invitation addressed to them"         "a@x.com" "$(as $B "select eab_team_status()->'invites_for_me'")"
check "C does not see it"                               "[]" "$(as $C "select eab_team_status()->'invites_for_me'")"
check "C cannot accept B's email invitation"            "another Google account" "$(as $C "select eab_team_accept('$TOK')")"
check "A cannot accept own invitation"                  "own invitation" "$(as $A "select eab_team_accept('$TOK')")"
check "C cannot cancel A's invitation"                  "not allowed" "$(as $C "select eab_team_cancel_invite((select id from eab_team_invites limit 1))")"
IID=$(q "select id from eab_team_invites where status='pending'")
check_ok "A cancels the waiting invitation"             "$(as $A "select eab_team_cancel_invite('$IID')")"
check "cancelled link no longer works"                  "no longer valid (cancelled)" "$(as $B "select eab_team_accept('$TOK')")"
INV=$(as $A "select eab_team_invite('b@x.com')"); TOK=$(echo "$INV" | sed 's/.*"token": "\([0-9a-f]*\)".*/\1/')
q "update eab_team_invites set expires_at = now() - interval '1 minute' where status='pending'" >/dev/null
check "an invitation older than 7 days cannot be accepted" "invitation expired" "$(as $B "select eab_team_accept('$TOK')")"
check "expiry is 7 days after sending"                  "7 days" "$(q "select (expires_at - created_at)::text from eab_team_invites order by created_at limit 1")"
check "expired invitation is not listed for B"          "[]" "$(as $B "select eab_team_status()->'invites_for_me'")"
INV=$(as $A "select eab_team_invite('b@x.com')"); TOK=$(echo "$INV" | sed 's/.*"token": "\([0-9a-f]*\)".*/\1/')
check "sender may issue another after expiry"           '"token"' "$INV"
check_ok "B declines"                                   "$(as $B "select eab_team_decline(null, (select id from eab_team_invites where status='pending'))")"
check "declined invitation cannot be accepted"          "no longer valid (declined)" "$(as $B "select eab_team_accept('$TOK')")"
INV=$(as $A "select eab_team_invite(null)"); TOK=$(echo "$INV" | sed 's/.*"token": "\([0-9a-f]*\)".*/\1/')
check "invitation by link (no email)"                   '"token"' "$INV"
check "wrong link token refused"                        "not found" "$(as $B "select eab_team_accept('deadbeef')")"
TEAM=$(as $B "select eab_team_accept('$TOK')")
check "B accepts with the link and joins A's team"      "-" "$TEAM"
check "team has exactly two members"                    "2" "$(as $A "select jsonb_array_length(eab_team_status()->'members')")"
check "team is full: no third invitation"               "team is full" "$(as $A "select eab_team_invite('c@x.com')")"
check "B cannot invite a third person either"           "team is full" "$(as $B "select eab_team_invite('c@x.com')")"
check "used link cannot be reused by C"                 "no longer valid (accepted)" "$(as $C "select eab_team_accept('$TOK')")"
check "A is the team creator"                           "$A" "$(as $A "select eab_team_status()->'team'->>'created_by'")"
check "C sees no members of A's team"                   "0" "$(as $C "select count(*) from eab_team_members")"

echo "--- sharing"
check "joining reveals nothing: B reads 0 of A's records" "0" "$(as $B "select count(*) from eab_records where workspace_id='$WSA'")"
check "A shares p1 View Only"                           '"status": "ok"' "$(as $A "select eab_share_set('$WSA','[{\"collection\":\"properties\",\"id\":\"p1\",\"level\":\"view\"}]')")"
check "B reads exactly p1"                              "p1" "$(as $B "select string_agg(id, ',') from eab_records where workspace_id='$WSA'")"
check "B's shared index shows p1 view with A as owner"  "p1|view|a@x.com|Aina Agent" "$(as $B "select id||'|'||level||'|'||owner_email||'|'||owner_name from eab_shared_index()")"
check "View Only cannot change p1 (push denied)"        '"status": "denied"' "$(push $B $WSA '[{"collection":"properties","id":"p1","base_rev":1,"data":{"id":"p1","ref":"P1001","headline":"B edit"},"updated":2,"op_id":"x1"}]')"
check "View Only cannot change p1 (direct update)"      "0" "$(as $B "with u as (update eab_records set data='{}' where id='p1' returning 1) select count(*) from u")"
check "View Only cannot request deletion"               "not allowed" "$(as $B "select eab_request_delete('$WSA','properties','p1')")"
check "A changes p1 to View and Edit"                   '"level": "edit"' "$(as $A "select eab_share_set('$WSA','[{\"collection\":\"properties\",\"id\":\"p1\",\"level\":\"edit\"}]')")"
check "View and Edit: B's edit is accepted"             '"status": "ok"' "$(push $B $WSA '[{"collection":"properties","id":"p1","base_rev":1,"data":{"id":"p1","ref":"P1001","headline":"Shop lot, B edit"},"updated":2,"op_id":"x2"}]')"
check "edit kept A as the owner"                        "$A|Shop lot, B edit" "$(q "select user_id||'|'||(data->>'headline') from eab_records where id='p1'")"
check "B cannot permanently delete A's property"        '"status": "denied"' "$(push $B $WSA '[{"collection":"properties","id":"p1","base_rev":2,"data":null,"deleted":true,"updated":3,"op_id":"x3"}]')"
check "B cannot archive A's property directly"          '"status": "denied"' "$(push $B $WSA '[{"collection":"properties","id":"p1","base_rev":2,"data":{"id":"p1","ref":"P1001","archived":{"at":3}},"updated":3,"op_id":"x4"}]')"
check "B cannot create records in A's workspace"        '"status": "denied"' "$(push $B $WSA '[{"collection":"properties","id":"pz","base_rev":0,"data":{"id":"pz"},"updated":3,"op_id":"x5"}]')"
check "B cannot share A's record onward"                '"status": "not_owner"' "$(as $B "select eab_share_set('$WSB','[{\"collection\":\"properties\",\"id\":\"p1\",\"level\":\"view\"}]')")"
check "B cannot share using A's workspace"              "only your own records" "$(as $B "select eab_share_set('$WSA','[{\"collection\":\"properties\",\"id\":\"p1\",\"level\":\"view\"}]')")"
check "Calculator is never shared"                      '"status": "not_shareable"' "$(as $A "select eab_share_set('$WSA','[{\"collection\":\"calculations\",\"id\":\"k1\",\"level\":\"view\"}]')")"
check "Share All refuses the calculator"                "cannot be shared" "$(as $A "select eab_share_all_set('calculations','view')")"
check "C (outside the team) still reads nothing of A"   "0" "$(as $C "select count(*) from eab_records where workspace_id='$WSA'")"
check "C cannot push into A's workspace"                "not allowed" "$(push $C $WSA '[{"collection":"properties","id":"p1","base_rev":2,"data":{"id":"p1"},"updated":3,"op_id":"c1"}]')"
check "sharing is two-way and independent: A reads none of B's" "0" "$(as $A "select count(*) from eab_records where workspace_id='$WSB'")"
check "B shares pb1 with A"                              '"status": "ok"' "$(as $B "select eab_share_set('$WSB','[{\"collection\":\"properties\",\"id\":\"pb1\",\"level\":\"view\"}]')")"
check "A reads B's pb1"                                  "pb1" "$(as $A "select string_agg(id, ',') from eab_records where workspace_id='$WSB'")"
check_ok "Share All buyers (View Only)"                     "$(as $A "select eab_share_all_set('buyers','view')")"
check "B reads the buyer but not the vendor"            "cb" "$(as $B "select string_agg(id, ',' order by id) from eab_records where workspace_id='$WSA' and collection='contacts'")"
check "Share All properties covers existing records"    "p1,p2" "$(as $A "select eab_share_all_set('properties','view')" >/dev/null; as $B "select string_agg(id, ',' order by id) from eab_records where workspace_id='$WSA' and collection='properties'")"
push $A $WSA '[{"collection":"properties","id":"p3","base_rev":0,"data":{"id":"p3","ref":"P1003"},"updated":4,"op_id":"a8"}]' >/dev/null
check "Share All covers future records"                  "p1,p2,p3" "$(as $B "select string_agg(id, ',' order by id) from eab_records where workspace_id='$WSA' and collection='properties'")"
check "selected Edit + Share All View → Edit on p1"     "edit" "$(as $B "select level from eab_shared_index() where id='p1'")"
check "Share All View on p2 → view"                     "view" "$(as $B "select level from eab_shared_index() where id='p2'")"
as $A "select eab_share_all_set('properties', null)" >/dev/null
check "turning off Share All keeps the selected p1 only" "p1" "$(as $B "select string_agg(id, ',' order by id) from eab_records where workspace_id='$WSA' and collection='properties'")"
check "To-Do sharing is optional (not shared yet)"      "0" "$(as $B "select count(*) from eab_records where workspace_id='$WSA' and collection='tasks'")"
as $A "select eab_share_set('$WSA','[{\"collection\":\"tasks\",\"id\":\"t1\",\"level\":\"edit\"},{\"collection\":\"appointments\",\"id\":\"ap1\",\"level\":\"view\"}]')" >/dev/null
check "a shared To-Do may be deleted by the editor"     '"status": "ok"' "$(push $B $WSA '[{"collection":"tasks","id":"t1","base_rev":1,"data":null,"deleted":true,"updated":5,"op_id":"x6"}]')"
check "a View Only calendar entry cannot be deleted"    '"status": "denied"' "$(push $B $WSA '[{"collection":"appointments","id":"ap1","base_rev":1,"data":null,"deleted":true,"updated":5,"op_id":"x7"}]')"
check "B reads the history of a shared record"          "t" "$(as $B "select count(*) > 0 from eab_record_revisions where record_id='p1'")"
check "permission events logged (granted/changed/revoked)" "changed granted revoked" "$(q "select string_agg(distinct detail->>'event', ' ' order by detail->>'event') from eab_audit_events where action='permission'")"
check "B sees A's Share All in status"                  "buyers" "$(as $B "select eab_team_status()->'share_all_received'")"

echo "--- deletion requests"
RQ=$(as $B "select eab_request_delete('$WSA','properties','p1')")
check "editor B requests deletion of A's p1"            "-" "$RQ"
check "a second request for the same record is refused" "duplicate key" "$(as $B "select eab_request_delete('$WSA','properties','p1')")"
check "A sees the request"                               "p1" "$(as $A "select eab_team_status()->'delete_requests'")"
check "B cannot decide on it"                            "not allowed" "$(as $B "select eab_decide_delete('$RQ', true)")"
check_ok "A approves"                                    "$(as $A "select eab_decide_delete('$RQ', true)")"
check "the owner archives the property (allowed)"       '"status": "ok"' "$(push $A $WSA '[{"collection":"properties","id":"p1","base_rev":2,"data":{"id":"p1","ref":"P1001","headline":"Shop lot, B edit","archived":{"at":6}},"updated":6,"op_id":"a9"}]')"
check "editor B may restore it (un-archive)"            '"status": "ok"' "$(push $B $WSA '[{"collection":"properties","id":"p1","base_rev":3,"data":{"id":"p1","ref":"P1001","headline":"Shop lot, B edit"},"updated":7,"op_id":"x8"}]')"
check "request and decision are audited"                 "delete_decision delete_request" "$(q "select string_agg(distinct action, ' ' order by action) from eab_audit_events where action like 'delete_%'")"

echo "--- audit history"
check_ok "B records an edit event on shared p1"          "$(as $B "insert into eab_audit_events (id, workspace_id, collection, record_id, action, changes, at) values ('ev-b-0001','$WSA','properties','p1','edit','[{\"field\":\"headline\",\"before\":\"Shop lot\",\"after\":\"Shop lot, B edit\"}]', now())")"
check "actor comes from the sign-in, owner from the record" "$B|Badrul Agent|b@x.com|$A" "$(q "select actor||'|'||actor_name||'|'||actor_email||'|'||owner_id from eab_audit_events where id='ev-b-0001'")"
check "B cannot pose as A"                               "$B" "$(as $B "insert into eab_audit_events (id, workspace_id, collection, record_id, action, at, actor) values ('ev-b-0002','$WSA','properties','p1','edit', now(), '$A')" >/dev/null; q "select actor from eab_audit_events where id='ev-b-0002'")"
check "C cannot write audit for A's record"              "row-level security" "$(as $C "insert into eab_audit_events (id, workspace_id, collection, record_id, action, at) values ('ev-c-0001','$WSA','properties','p1','edit', now())")"
check "C cannot read A's audit"                          "0" "$(as $C "select count(*) from eab_audit_events where record_id='p1'")"
check "the app cannot write membership events"           "ERROR" "$(as $B "insert into eab_audit_events (id, team_id, action, at) values ('ev-b-0003','$TEAM','membership', now())")"
check "audit entries cannot be changed"                  "cannot be changed" "$(q "update eab_audit_events set action='edit' where id='ev-b-0001'" 2>&1)"
check "the API cannot delete audit entries directly"     "permission denied" "$(as $A "delete from eab_audit_events where id='ev-b-0001'")"
check "B reads p1's audit while authorized"              "ev-b-0001" "$(as $B "select string_agg(id, ',') from eab_audit_events where record_id='p1' and id like 'ev-%'")"
check "B cannot delete audit entries of A's record"      "only the record owner" "$(as $B "select eab_audit_delete(array['ev-b-0001'])")"
check "membership events visible to current members"     "joined" "$(as $B "select string_agg(distinct detail->>'event', ',') from eab_audit_events where action='membership'")"

echo "--- leaving, removal, rejoining"
check_ok "B leaves"                                         "$(as $B "select eab_team_leave()")"
check "former member B reads none of A's records"        "0" "$(as $B "select count(*) from eab_records where workspace_id='$WSA'")"
check "B's shared index is empty"                        "0" "$(as $B "select count(*) from eab_shared_index()")"
check "former member B reads none of p1's audit"         "0" "$(as $B "select count(*) from eab_audit_events where record_id='p1'")"
check "former member B no longer sees team membership events" "0" "$(as $B "select count(*) from eab_audit_events where action='membership'")"
check "team owner A still reviews B's past actions on A's records" "ev-b-0001" "$(as $A "select string_agg(id, ',') from eab_audit_events where record_id='p1' and actor='$B'")"
check "team owner A still sees the team's membership history" "left" "$(as $A "select string_agg(distinct detail->>'event', ',' order by detail->>'event') from eab_audit_events where action='membership'")"
check "B's edit stays in A's record"                     "Shop lot, B edit" "$(q "select data->>'headline' from eab_records where id='p1'")"
check "B keeps own records (pb1) after leaving"          "1" "$(as $B "select count(*) from eab_records where workspace_id='$WSB'")"
check "A no longer reads B's pb1"                        "0" "$(as $A "select count(*) from eab_records where workspace_id='$WSB'")"
check "every grant was revoked"                          "0" "$(q "select count(*) from eab_shares where revoked_at is null")"
check "B can no longer push to A's workspace"            "not allowed" "$(push $B $WSA '[{"collection":"properties","id":"p1","base_rev":4,"data":{"id":"p1"},"updated":9,"op_id":"x9"}]')"
check "the waiting deletion request situation is closed" "0" "$(q "select count(*) from eab_delete_requests where status='pending'")"
INV=$(as $A "select eab_team_invite('b@x.com')"); TOK=$(echo "$INV" | sed 's/.*"token": "\([0-9a-f]*\)".*/\1/')
check "reconnecting needs a new invitation"              '"token"' "$INV"
as $B "select eab_team_accept('$TOK')" >/dev/null
check "rejoined: old permissions do NOT come back"       "0" "$(as $B "select count(*) from eab_records where workspace_id='$WSA'")"
as $A "select eab_share_set('$WSA','[{\"collection\":\"properties\",\"id\":\"p2\",\"level\":\"view\"}]')" >/dev/null
check "A grants again explicitly"                        "p2" "$(as $B "select string_agg(id, ',') from eab_records where workspace_id='$WSA'")"
B_UID=$B; as $A "select eab_team_remove('$B_UID')" >/dev/null
check "A removes B: shared access stops at once"         "0" "$(as $B "select count(*) from eab_records where workspace_id='$WSA'")"
check "A cannot remove themselves via remove"            "not in a Team Workspace" "$(as $A "select eab_team_remove('$A')")"

echo "--- disabled account"
INV=$(as $A "select eab_team_invite('d@x.com')"); TOK=$(echo "$INV" | sed 's/.*"token": "\([0-9a-f]*\)".*/\1/')
as $D "select eab_team_accept('$TOK')" >/dev/null
as $A "select eab_share_set('$WSA','[{\"collection\":\"properties\",\"id\":\"p2\",\"level\":\"view\"}]')" >/dev/null
check "D reads p2 while active"                          "1" "$(as $D "select count(*) from eab_records where workspace_id='$WSA'")"
q "update auth.users set banned_until = now() + interval '100 years' where id='$D'" >/dev/null
check "disabling D's account revokes D's access"         "0" "$(as $D "select count(*) from eab_records where workspace_id='$WSA'")"
check "...and ends the team"                             "0" "$(q "select count(*) from eab_shares where revoked_at is null")"
check "disabled account cannot accept invitations"       "account disabled" "$(as $D "select eab_team_accept('$TOK')")"
q "update auth.users set banned_until = null where id='$D'" >/dev/null
INV=$(as $A "select eab_team_invite('d@x.com')"); TOK=$(echo "$INV" | sed 's/.*"token": "\([0-9a-f]*\)".*/\1/'); as $D "select eab_team_accept('$TOK')" >/dev/null
check "returning account gets nothing back by itself"   "0" "$(as $D "select count(*) from eab_records where workspace_id='$WSA'")"

echo "--- deleting old audit entries (owner only, kept in the backup)"
EVA=$(q "select id from eab_audit_events where record_id='p1' and action='delete_request' limit 1")
check "A (record owner) deletes an old entry"            "1" "$(as $A "select eab_audit_delete(array['$EVA'])")"
check "...it is gone from the history"                   "0" "$(q "select count(*) from eab_audit_events where id='$EVA'")"
check "...and kept in the audit backup"                  "1" "$(q "select count(*) from eab_audit_backup where id='$EVA' and deleted_by='$A'")"
check "the backup is not readable through the API"       "permission denied" "$(as $A "select count(*) from eab_audit_backup")"
check "the deletion itself is recorded"                  "audit_delete" "$(q "select action from eab_audit_events where action='audit_delete' and record_id='p1'")"
check "membership events cannot be deleted by anyone"    "only the record owner" "$(as $A "select eab_audit_delete(array[(select id from eab_audit_events where action='membership' limit 1)])")"

echo "--- compatibility with the proposed old-app write block"
$DB -f supabase/proposed/20261015000000_block_direct_writes.sql >/dev/null 2>&1; check "write block applies after Change 010" "0" "$?"
OUT=$($DB -f supabase/proposed/20261016000000_change010_team_sharing_audit.sql 2>&1); check_none "Change 010 can be re-applied (idempotent)" "$(echo "$OUT" | grep -i error)"
check "push still works with both in place"              '"status": "ok"' "$(push $A $WSA '[{"collection":"properties","id":"p4","base_rev":0,"data":{"id":"p4","ref":"P1004"},"updated":10,"op_id":"a10"}]')"
check "direct writes are still blocked"                  "can no longer write records directly" "$(as $A "update eab_records set data='{}' where id='p4'")"

echo "--- rollback"
OUT=$($DB -f supabase/proposed/20261016000000_change010_rollback.sql 2>&1); check_none "rollback applies" "$(echo "$OUT" | grep -i error)"
check "records untouched by the rollback"                "9" "$(q "select count(*) from eab_records where workspace_id='$WSA'")"
check_none "rollback removed the team tables" "$(q "select to_regclass('public.eab_teams')")"
check "push works after rollback"                        '"status": "ok"' "$(push $A $WSA '[{"collection":"properties","id":"p5","base_rev":0,"data":{"id":"p5","ref":"P1005"},"updated":11,"op_id":"a11"}]')"

echo "passed $pass, failed $fail"
[ "$fail" -eq 0 ]
