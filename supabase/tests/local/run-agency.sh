#!/bin/bash
# Local test of the agency licence SQL on plain PostgreSQL 16 (needs a running local server and the postgres user).
# The same test file runs on EAB-QA-Test in the SQL editor (everything rolled back).
set -e
cd "$(dirname "$0")/../.."
DB=agency_local_test
su postgres -c "dropdb --if-exists $DB; createdb $DB"
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f tests/local/agency_stubs.sql -f proposed/20261028000000_billing_sandbox.sql -f proposed/20261110100000_agency_licences.sql -f proposed/20261110100000_agency_licences.sql" 2>&1 | grep -v "already exists, skipping" || true
su postgres -c "psql -q -d $DB -f tests/agency_licences_test.sql" 2>&1 | grep -E "TEST RESULT|ERROR" | head -30
