-- JoyChange002 Batch A: tidy-up and performance indexes.
--
-- Owner (Joe), 18 Oct 2026: no real users yet, so the app and database may be tidied
-- freely. This migration does the tidy-up that is actually warranted after reading the
-- live schema, rather than a full rebuild:
--
--   1. Drops eab_audit_backup. It is a leftover from the Change 010 audit work, holds no
--      rows, and nothing in the app reads it. (eab_audit is NOT dropped: the old "Team and
--      access" screen still reads it, along with eab_members and eab_invites.)
--   2. Adds indexes for the queries Changes 41 and 50 will make many times per screen.
--      Today every one of those queries reads the whole jsonb column for every record in
--      the workspace, which is what makes the lists feel slow as records build up.
--
-- Safe to run more than once.

begin;

-- 1. Dead table from the Change 010 work.
drop table if exists public.eab_audit_backup;

-- 2a. Change 41: the property list filters on status (hiding Sold, Rented and Withdrawn by
--     default, and ticking any of the five Booked stages). Without this the filter reads
--     every record's jsonb.
create index if not exists eab_records_ws_status
  on public.eab_records (workspace_id, collection, ((data ->> 'status')))
  where deleted = false;

-- 2b. Change 41: purpose (For Sale / For Rent / both) is the other tick-box filter.
create index if not exists eab_records_ws_purpose
  on public.eab_records (workspace_id, collection, ((data ->> 'purpose')))
  where deleted = false;

-- 2c. Change 50: finding a property by the ID the agent spoke ("D1001").
create index if not exists eab_records_ws_ref
  on public.eab_records (workspace_id, ((data ->> 'ref')))
  where collection = 'properties' and deleted = false;

-- 2d. Change 50: finding a property by its linked vendor or buyer.
create index if not exists eab_records_ws_vendor
  on public.eab_records (workspace_id, ((data ->> 'vendorId')))
  where collection = 'properties' and deleted = false;

-- 2e. Change 50: matching spoken address text against street, township, neighbourhood,
--     city and state at once, and the Subsale search box. trigram beats LIKE '%...%',
--     which cannot use a normal index at all.
create extension if not exists pg_trgm with schema public;

create index if not exists eab_records_address_trgm
  on public.eab_records using gin (
    (
      coalesce(data ->> 'street', '') || ' ' ||
      coalesce(data ->> 'neighbourhood', '') || ' ' ||
      coalesce(data ->> 'township', '') || ' ' ||
      coalesce(data ->> 'city', '') || ' ' ||
      coalesce(data ->> 'state', '')
    ) public.gin_trgm_ops
  )
  where collection = 'properties' and deleted = false;

-- 2f. Change 50 again: contacts are matched by name and phone from speech.
create index if not exists eab_records_contact_trgm
  on public.eab_records using gin (
    (coalesce(data ->> 'name', '') || ' ' || coalesce(data ->> 'phone', '')) public.gin_trgm_ops
  )
  where collection = 'contacts' and deleted = false;

commit;
