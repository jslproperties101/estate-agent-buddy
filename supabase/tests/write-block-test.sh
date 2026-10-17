#!/usr/bin/env bash
# Proposed block on direct writes (supabase/proposed). LOCAL PostgreSQL only; applies nothing anywhere real.
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="psql -v ON_ERROR_STOP=1 -q"; DBN=eab_writeblock_test
$ROOT -c "drop database if exists $DBN;" -c "create database $DBN;" >/dev/null
DB="$ROOT -d $DBN"; P="psql -d $DBN -q -tA"
$DB >/dev/null 2>&1 <<'SQL'
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
-- Like Supabase: pgcrypto lives in the "extensions" schema, NOT public (functions must find it via search_path).
create schema if not exists extensions; create extension if not exists pgcrypto schema extensions;
grant usage on schema extensions to anon, authenticated;
create schema auth; create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
create function auth.jwt() returns jsonb language sql stable as $f$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated; grant usage on schema public to anon, authenticated;
insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000001','a@x.com');
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid default auth.uid(), created_at timestamptz default now(), unique (bucket_id, name));
alter table storage.objects enable row level security; grant usage on schema storage to authenticated; grant select, insert on storage.objects to authenticated;
SQL
$DB -f supabase/migrations/20261012000000_eab_records.sql >/dev/null 2>&1
$DB -c "grant select, insert, update, delete on public.eab_records to authenticated;" >/dev/null
$DB -f supabase/migrations/20261012120000_workspaces_roles.sql >/dev/null 2>&1
$DB -f supabase/migrations/20261014000000_phase2_sync_refs_files.sql >/dev/null 2>&1
A=aaaaaaaa-0000-0000-0000-000000000001
as() { printf "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$A',true) \\\\g /dev/null\n%s;\ncommit;\n" "$*" | $P 2>&1 | grep -v '^$' | tr '\n' ' ' | sed 's/ $//'; }
set +e +o pipefail
pass=0; fail=0
check() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS $1"; else fail=$((fail+1)); echo "FAIL $1 :: expected [$2] got [$3]"; fi; }
WS=$($P -c "select workspace_id from eab_members where user_id='$A'")
[ -z "$WS" ] && $P -c "select eab_my_membership()" >/dev/null 2>&1
WS=$(as "select workspace_id from eab_my_membership() limit 1")
check "setup: the test user has a workspace" "-" "$WS"
push() { as "select eab_push_records('$WS', '$1'::jsonb)"; }
OLDUPSERT="insert into eab_records (workspace_id, collection, id, data, updated) values ('$WS','contacts','c1','{\"name\":\"Old app\"}',9) on conflict (workspace_id, collection, id) do update set data=excluded.data, updated=excluded.updated"
check "before the block: new sync works"          "ok"  "$(push '[{"collection":"contacts","id":"c1","base_rev":0,"data":{"name":"New app"},"updated":1,"op_id":"o1"}]')"
check "before the block: an old app overwrites"   "" "$(as "$OLDUPSERT")"
check "...and it did replace the record"          "Old app" "$($P -c "select data->>'name' from eab_records where id='c1'")"
SNAP=$($P -c "select md5(string_agg(collection||id||coalesce(data::text,'')||deleted::text, ',' order by collection, id)) from eab_records")
$DB -f supabase/proposed/20261015000000_block_direct_writes.sql >/dev/null 2>&1; check "proposal applies" "0" "$?"
check "records untouched by applying it"          "$SNAP" "$($P -c "select md5(string_agg(collection||id||coalesce(data::text,'')||deleted::text, ',' order by collection, id)) from eab_records")"
check "old app: plain upsert refused"             "can no longer write" "$(as "$OLDUPSERT")"
check "old app: plain insert refused"             "can no longer write" "$(as "insert into eab_records (workspace_id, collection, id, data, updated) values ('$WS','contacts','c2','{}',1)")"
check "old app: plain update refused"             "can no longer write" "$(as "update eab_records set data='{\"name\":\"X\"}' where id='c1'")"
as "delete from eab_records where id='c1'" >/dev/null
check "old app: delete changes nothing"           "1" "$($P -c "select count(*) from eab_records where id='c1'")"
check "record unchanged by the refused writes"    "Old app" "$($P -c "select data->>'name' from eab_records where id='c1'")"
REV=$($P -c "select rev from eab_records where id='c1'")
check "new app: push of a new record works"       "ok"  "$(push '[{"collection":"contacts","id":"c3","base_rev":0,"data":{"name":"Third"},"updated":2,"op_id":"o3"}]')"
check "new app: push of an edit works"            "ok"  "$(push "[{\"collection\":\"contacts\",\"id\":\"c1\",\"base_rev\":$REV,\"data\":{\"name\":\"Edited\"},\"updated\":3,\"op_id\":\"o4\"}]")"
check "...and was stored"                         "Edited" "$($P -c "select data->>'name' from eab_records where id='c1'")"
check "new app: a stale edit still gets a conflict, not a write" "conflict" "$(push '[{"collection":"contacts","id":"c1","base_rev":1,"data":{"name":"Stale"},"updated":4,"op_id":"o5"}]')"
check "reading is untouched"                      "$($P -c "select count(*) from eab_records")" "$(as "select count(*) from eab_records")"
check "the setting is not left on outside the function" "" "$(as "select coalesce(current_setting('eab.via_push', true), '')")"
$P -c "update eab_records set data='{\"name\":\"Repaired\"}' where id='c3'" >/dev/null 2>&1
check "owner/SQL-editor repair still possible"    "Repaired" "$($P -c "select data->>'name' from eab_records where id='c3'")"
$DB -f supabase/proposed/20261015000000_block_direct_writes_rollback.sql >/dev/null 2>&1; check "rollback runs" "0" "$?"
check "after rollback an old app can write again" "" "$(as "$OLDUPSERT")"
check "after rollback the new sync still works"   "ok"  "$(push '[{"collection":"contacts","id":"c9","base_rev":0,"data":{"name":"Nine"},"updated":5,"op_id":"o9"}]')"
check "block can be applied again"                "0" "$($DB -f supabase/proposed/20261015000000_block_direct_writes.sql >/dev/null 2>&1; echo $?)"
echo "passed $pass, failed $fail"; [ "$fail" -eq 0 ]
