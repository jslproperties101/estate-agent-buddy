#!/usr/bin/env bash
# Change 006 Layer 4 rehearsal on a LOCAL PostgreSQL only (synthetic data, never a Supabase project):
#   all migrations + the Change 010 proposal → synthetic records, history, audit and file rows → pg_dump →
#   encrypted platform backup for two key holders → key-less verification → restore with EACH key into a NEW database →
#   row counts and content fingerprints compared → a tampered backup is refused and creates nothing.
# Usage: PGHOST=localhost PGUSER=postgres bash supabase/tests/platform-backup-test.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="psql -v ON_ERROR_STOP=1 -q"; SRC=eab_l4_src
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
for d in $SRC eab_l4_restore1 eab_l4_restore2 eab_l4_bad; do $ROOT -c "drop database if exists $d;" >/dev/null; done
$ROOT -c "create database $SRC;" >/dev/null
DB="$ROOT -d $SRC"; P="psql -d $SRC -q -tA"
setup_auth() {
psql -v ON_ERROR_STOP=1 -q -d "$1" >/dev/null 2>&1 <<'SQL'
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
create schema if not exists auth; create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb, banned_until timestamptz, deleted_at timestamptz);
create or replace function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
create or replace function auth.jwt() returns jsonb language sql stable as $f$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated; grant usage on schema public to anon, authenticated;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid default auth.uid(), created_at timestamptz default now(), unique (bucket_id, name));
alter table storage.objects enable row level security; grant usage on schema storage to authenticated; grant select, insert on storage.objects to authenticated;
SQL
}
setup_auth $SRC
# The same order as rls-test.sh (some statements need Supabase-only parts such as Storage policies; like there, the
# stand-in skips them). What this rehearsal needs is checked right after.
for f in supabase/migrations/*.sql supabase/proposed/20261016000000_change010_team_sharing_audit.sql; do psql -q -d $SRC -f "$f" >/dev/null 2>&1 || true; done
$DB -c "grant select, insert, update on public.eab_records to authenticated;" >/dev/null
for t in eab_records eab_record_revisions eab_members eab_workspaces eab_audit_events; do [ "$($P -c "select to_regclass('public.$t') is not null")" = t ] || { echo "FAIL table $t missing after migrations"; exit 1; }; done

# synthetic data: two agents, records with history, audit entries, file rows
A=aaaaaaaa-0000-0000-0000-000000000001; B=bbbbbbbb-0000-0000-0000-000000000002
$DB >/dev/null 2>&1 <<SQL
insert into auth.users (id, email) values ('$A','agent.a@example.test'),('$B','agent.b@example.test') on conflict do nothing;
SQL
as() { printf "begin; set local role authenticated; select set_config('request.jwt.claim.sub','%s',true) \\\\g /dev/null\n%s;\ncommit;\n" "$1" "$2" | $P >/dev/null 2>&1 || true; }
WSA=$($P -c "select workspace_id from eab_members where user_id='$A'" 2>/dev/null || true)
if [ -z "$WSA" ]; then as $A "select 1 from eab_my_membership()"; WSA=$($P -c "select workspace_id from eab_members where user_id='$A'"); fi
as $B "select 1 from eab_my_membership()"; WSB=$($P -c "select workspace_id from eab_members where user_id='$B'")
for i in $(seq 1 40); do
  as $A "insert into eab_records (workspace_id, collection, id, data, updated) values ('$WSA','properties','p$i','{\"ref\":\"P$((1000+i))\",\"refNo\":$((1000+i)),\"street\":\"Jalan Ujian $i\"}',$i)"
  as $A "update eab_records set data = data || '{\"askingPrice\":$((400000+i))}' where workspace_id='$WSA' and id='p$i'"
done
for i in $(seq 1 15); do as $B "insert into eab_records (workspace_id, collection, id, data, updated) values ('$WSB','contacts','c$i','{\"name\":\"Pembeli $i\",\"roles\":[\"buyer\"]}',$i)"; done
$DB -c "insert into storage.buckets (id, name) values ('eab-files','eab-files') on conflict do nothing;" >/dev/null
for i in $(seq 1 12); do $DB -c "insert into public.eab_audit_events (id, workspace_id, collection, record_id, owner_id, actor, actor_name, action, changes, at) values ('audit-test-$i','$WSA','properties','p$i','$A','$A','Agent A','edit','[{\"field\":\"askingPrice\",\"before\":400000,\"after\":$((400000+i))}]', now())" >/dev/null; done

set +e +o pipefail
pass=0; fail=0
check() { if [[ "$3" == *"$2"* ]]; then pass=$((pass+1)); echo "PASS $1"; else fail=$((fail+1)); echo "FAIL $1 :: expected [$2] got [$3]"; fi; }
TABLES="eab_records eab_record_revisions eab_members eab_workspaces eab_audit_events"
fingerprint() { local db=$1 out=""; for t in $TABLES; do out="$out $t:$(psql -d $db -q -tA -c "select count(*)||'/'||coalesce(md5(string_agg(t::text, '|' order by t::text)),'-') from public.$t t" 2>/dev/null)"; done; echo "$out"; }
SRCFP=$(fingerprint $SRC)
check "synthetic data present (40 properties, 15 contacts)" "55" "$($P -c "select count(*) from eab_records")"
check "history present (one earlier version per property)" "t" "$($P -c "select count(*) >= 40 from eab_record_revisions")"
check "audit history present" "12" "$($P -c "select count(*) from eab_audit_events")"

# --- the job: dump, objects, counts → encrypted backup for two key holders (public keys only)
pg_dump --format=plain --no-owner --no-privileges --schema=public --schema=auth --schema=storage -d $SRC > "$WORK/database.sql" 2>/dev/null
check "pg_dump made a dump" "t" "$([ -s "$WORK/database.sql" ] && echo t)"
mkdir -p "$WORK/objects/$WSA"; printf 'photo-one' > "$WORK/obj"; SHA=$(sha256sum "$WORK/obj" | cut -c1-64); mv "$WORK/obj" "$WORK/objects/$WSA/$SHA"
COUNTS=$(printf '{'; first=1; for t in $TABLES; do [ $first = 1 ] || printf ','; first=0; printf '"%s":%s' "$t" "$($P -c "select count(*) from public.$t")"; done; printf '}')
echo "$COUNTS" > "$WORK/counts.json"
node ops/platform-backup/keygen.mjs holder1 "$WORK/keys" >/dev/null; node ops/platform-backup/keygen.mjs holder2 "$WORK/keys" >/dev/null
OUT=$(node ops/platform-backup/make-backup.mjs --dump "$WORK/database.sql" --objects "$WORK/objects" --counts "$WORK/counts.json" --key "$WORK/keys/holder1.public.json" --key "$WORK/keys/holder2.public.json" --target "$WORK/target" --source local-rehearsal 2>&1); check "encrypted backup made and verified after writing" "eab-platform-backup-index" "$OUT"
FILE=$(ls "$WORK/target"/*.eab | head -1)
check "the stored file holds no readable record" "0" "$(grep -c 'Jalan Ujian' "$FILE")"
check "the stored file holds no e-mail address" "0" "$(grep -c 'example.test' "$FILE")"
node ops/platform-backup/verify.mjs "$WORK/target" >/dev/null; check "key-less verification of the stored copy" "0" "$?"

# --- restore with EACH key holder into a NEW database; compare
n=0
for h in holder1 holder2; do
  n=$((n+1)); NEW=eab_l4_restore$n
  node ops/platform-backup/restore-backup.mjs --file "$FILE" --identity "$WORK/keys/$h.private.json" --out "$WORK/restored-$h" >/dev/null 2>&1; check "$h's key opens the backup and every entry checks out" "0" "$?"
  $ROOT -c "create database $NEW;" >/dev/null
  psql -q -d $NEW -c "drop schema public cascade;" >/dev/null 2>&1   # the dump creates it, as on a brand-new project
  psql -q -d $NEW -c "drop schema public cascade;" >/dev/null 2>&1   # the dump creates it, as on a brand-new project
  psql -d $NEW -q -c "do \$\$ begin create role anon nologin; exception when duplicate_object then null; end \$\$; do \$\$ begin create role authenticated nologin; exception when duplicate_object then null; end \$\$; do \$\$ begin create role service_role nologin; exception when duplicate_object then null; end \$\$;" >/dev/null 2>&1
  # the dump holds tables, not extensions: right after it creates schema public, enable pg_trgm there (JoyChange002 trigram search indexes need it)
  sed -i 's/^CREATE SCHEMA public;$/CREATE SCHEMA public;\nCREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;/' "$WORK/restored-$h/database.sql"
  psql -v ON_ERROR_STOP=1 -d $NEW -q -f "$WORK/restored-$h/database.sql" >/dev/null 2>"$WORK/load-$h.err"; RC=$?; [ $RC = 0 ] || head -3 "$WORK/load-$h.err"
  check "dump loads into a NEW database ($NEW)" "0" "$RC"
  check "row counts and content fingerprints match the source ($h)" "$SRCFP" "$(fingerprint $NEW)"
  check "storage object restored byte for byte ($h)" "photo-one" "$(cat "$WORK/restored-$h/objects/$WSA/$SHA")"
  check "row counts recorded at backup time come back ($h)" "\"eab_records\": 55" "$(cat "$WORK/restored-$h/manifest.json")"
done
check "the source database was not touched by the restores" "$SRCFP" "$(fingerprint $SRC)"

# --- a tampered backup creates nothing
cp "$FILE" "$WORK/bad.eab"; chmod u+w "$WORK/bad.eab"; printf '\x00' | dd of="$WORK/bad.eab" bs=1 seek=$(( $(stat -c %s "$WORK/bad.eab") - 100 )) conv=notrunc 2>/dev/null
node ops/platform-backup/restore-backup.mjs --file "$WORK/bad.eab" --identity "$WORK/keys/holder1.private.json" --out "$WORK/restored-bad" >/dev/null 2>&1; check "a tampered backup is refused" "1" "$?"
check "...and nothing was written" "no" "$([ -e "$WORK/restored-bad" ] && echo yes || echo no)"
check "no private key ever reached the backup folder" "0" "$(grep -rl '"d":' "$WORK/target" | wc -l)"

for d in eab_l4_restore1 eab_l4_restore2 $SRC; do $ROOT -c "drop database if exists $d;" >/dev/null; done
echo "passed $pass, failed $fail"
[ $fail -eq 0 ]
