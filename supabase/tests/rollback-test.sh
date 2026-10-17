#!/usr/bin/env bash
# Rollback rehearsal on a LOCAL PostgreSQL only: base migrations -> data -> Phase 2 migration -> more data -> rollback.
# Checks that records survive, that an old app's plain upsert still works afterwards, and that the migration can be re-applied.
# Usage (as the postgres OS user): PGUSER=postgres bash supabase/tests/rollback-test.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="psql -v ON_ERROR_STOP=1 -q"; DBN=eab_rollback_test
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
$DB -c "grant select, insert, update on public.eab_records to authenticated;" >/dev/null
A=aaaaaaaa-0000-0000-0000-000000000001
as() { printf "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$A',true) \\\\g /dev/null\n%s;\ncommit;\n" "$*" | $P 2>&1 | grep -v '^$' | tr '\n' ' ' | sed 's/ $//'; }
$DB -c "insert into public.eab_records (user_id, collection, id, data, updated) values ('$A','properties','p1','{\"ref\":\"P1001\",\"refNo\":1001}',1),('$A','properties','p2','{\"ref\":\"A1001\",\"refNo\":1001}',2),('$A','contacts','c1','{\"name\":\"Before\"}',1)" >/dev/null 2>&1 || true
$DB -f supabase/migrations/20261012120000_workspaces_roles.sql >/dev/null 2>&1
set +e +o pipefail
pass=0; fail=0
check() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS $1"; else fail=$((fail+1)); echo "FAIL $1 :: expected [$2] got [$3]"; fi; }
BEFORE=$($P -c "select count(*) from eab_records")
$DB -f supabase/migrations/20261014000000_phase2_sync_refs_files.sql >/dev/null 2>&1; check "migration applies on existing data" "0" "$?"
check "existing records all kept by the migration" "$BEFORE" "$($P -c "select count(*) from eab_records")"
check "legacy duplicate was listed, not changed"   "1" "$($P -c "select count(*) from eab_ref_duplicates")"
WS=$($P -c "select workspace_id from eab_members where user_id='$A'")
as "update eab_records set data='{\"name\":\"After\"}' where id='c1'" >/dev/null
check "a Phase 2 edit bumped the version"          "2" "$($P -c "select rev from eab_records where id='c1'")"
SNAP=$($P -c "select md5(string_agg(workspace_id::text||collection||id||coalesce(data::text,'')||deleted::text, ',' order by workspace_id, collection, id)) from eab_records")
$DB -f supabase/rollback/20261014000000_phase2_rollback.sql >/dev/null 2>&1; check "rollback runs" "0" "$?"
check "records and their content untouched by the rollback" "$SNAP" "$($P -c "select md5(string_agg(workspace_id::text||collection||id||coalesce(data::text,'')||deleted::text, ',' order by workspace_id, collection, id)) from eab_records")"
check "Phase 2 objects are gone" "0" "$($P -c "select count(*) from pg_proc where proname in ('eab_push_records','eab_record_version','eab_keep_revision','eab_sync_property_ref')")"
check "no Phase 2 tables left"   "0" "$($P -c "select count(*) from pg_tables where schemaname='public' and tablename in ('eab_files','eab_record_revisions','eab_property_refs','eab_ref_duplicates')")"
check "no Phase 2 storage policies left" "0" "$($P -c "select count(*) from pg_policies where schemaname='storage' and policyname like 'eab file object%'")"
check "an old app's plain upsert works again" "" "$(as "insert into eab_records (workspace_id, collection, id, data, updated) values ('$WS','contacts','c1','{\"name\":\"Old app\"}',9) on conflict (workspace_id, collection, id) do update set data=excluded.data, updated=excluded.updated" | grep -i error)"
check "...and it changed the record" "Old app" "$($P -c "select data->>'name' from eab_records where id='c1'")"
$DB -f supabase/migrations/20261014000000_phase2_sync_refs_files.sql >/dev/null 2>&1; check "migration can be applied again after a rollback" "0" "$?"
check "re-applied: version column continues (never reset)" "t" "$($P -c "select rev >= 1 from eab_records where id='c1'")"
SNAP2=$($P -c "select md5(string_agg(workspace_id::text||collection||id||coalesce(data::text,'')||deleted::text, ',' order by workspace_id, collection, id)) from eab_records")
# Failure behaviour: something unexpected depends on a Phase 2 table, so the rollback cannot finish. Nothing may be half-done.
$DB -c "create view public.zz_blocker as select file_id from public.eab_files;" >/dev/null
count_p2() { $P -c "select (select count(*) from pg_trigger where tgname in ('eab_records_version','eab_records_keep_revision','eab_records_property_ref')) + (select count(*) from pg_proc where proname in ('eab_push_records','eab_sync_property_ref')) + (select count(*) from pg_tables where tablename in ('eab_files','eab_property_refs','eab_record_revisions')) + (select count(*) from pg_policies where policyname like 'eab file object%')"; }
FULL=$(count_p2)
$DB -f supabase/rollback/20261014000000_phase2_rollback.sql >/dev/null 2>&1; check "failing rollback stops with an error (stop-on-error mode)" "3" "$?"
check "...and changed nothing (all Phase 2 objects still there)" "$FULL" "$(count_p2)"
psql -d $DBN -q -f supabase/rollback/20261014000000_phase2_rollback.sql >/dev/null 2>&1   # a pasted script keeps going after an error
check "failing rollback in keep-going mode also changes nothing" "$FULL" "$(count_p2)"
check "records still intact after the failed attempts" "$SNAP2" "$($P -c "select md5(string_agg(workspace_id::text||collection||id||coalesce(data::text,'')||deleted::text, ',' order by workspace_id, collection, id)) from eab_records")"
$DB -c "drop view public.zz_blocker;" >/dev/null
$DB -f supabase/rollback/20261014000000_phase2_rollback.sql >/dev/null 2>&1; check "rollback succeeds again once the blocker is gone" "0" "$?"
echo "passed $pass, failed $fail"; [ "$fail" -eq 0 ]
