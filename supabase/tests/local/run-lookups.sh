#!/bin/bash
# Local test of the token (Batch B), lookup (Batch C) and admin lookup / token (Batch D) SQL on plain PostgreSQL 16.
# Needs a running local server reachable as the postgres user (PGHOST / PGPORT if not the default). The same test files run
# on EAB-QA-Test in the SQL editor (everything rolled back).
set -e
cd "$(dirname "$0")/../.."
DB=lookups_local_test
P="psql -q -U postgres"
$P -c "drop database if exists $DB" -c "create database $DB" >/dev/null
for f in tests/local/agency_stubs.sql tests/local/lookups_stubs.sql proposed/20261103000000_tokens_sandbox.sql proposed/20261111100000_token_pack_bonus.sql \
         proposed/20261110200000_oneharta_lookups.sql proposed/20261110300000_admin_lookups_tokens.sql \
         proposed/20261110200000_oneharta_lookups.sql proposed/20261110300000_admin_lookups_tokens.sql proposed/20261111100000_token_pack_bonus.sql; do
  $P -v ON_ERROR_STOP=1 -d $DB -f "$f" 2>&1 | grep -v "already exists, skipping" || true
done
for t in tokens_sandbox_test oneharta_lookups_test admin_lookups_tokens_test; do
  printf '%-28s ' "$t"; $P -d $DB -f "tests/$t.sql" 2>&1 | grep -oE "TEST RESULT.*|ERROR.*" | head -3
done
