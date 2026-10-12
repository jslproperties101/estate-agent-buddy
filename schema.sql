-- =====================================================================
-- Property Explorer — complete database schema (review draft v1)
-- Target: PostgreSQL 15+ with PostGIS, hosted on Supabase.
-- Status: PROPOSAL FOR REVIEW. Not yet applied to any database.
-- Version 1C (11 Oct 2026): AI Smart Capture tables added (section 11b).
-- Version 1D (11 Oct 2026): team roles, invitations, audit trail, offline-conflict
--   history, backup log, roads missing from the map, AI spending (sections 1, 11c, 14).
--
-- Conventions
--   * Every business table has: id (UUID, generated on the device so
--     records created offline never collide), workspace_id, created_at,
--     updated_at, created_by, deleted_at (soft delete = recoverable).
--   * workspace_id + row-level security keeps each user's / agency's
--     records private (section 12).
--   * Links between records are real foreign keys, never free text,
--     so a task can never point at a property that does not exist.
--   * Units: areas in square feet, money in RM, distances in metres.
-- =====================================================================

create extension if not exists postgis;

-- ---------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 1. Users, workspaces and settings
-- ---------------------------------------------------------------------
-- Users themselves live in Supabase's auth.users table.
create table workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'negotiator'
               check (role in ('owner','admin','negotiator','viewer')),
  display_name text,
  ui_language  text not null default 'en' check (ui_language in ('en','ms')),  -- app screens
  show_progress_badges boolean not null default false,                     -- game-like badges off by default
  joined_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create or replace function is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members m
                 where m.workspace_id = ws and m.user_id = auth.uid());
$$;

create or replace function member_role(ws uuid) returns text
language sql stable security definer set search_path = public as $$
  select m.role from workspace_members m
   where m.workspace_id = ws and m.user_id = auth.uid();
$$;

-- Owner, Admin and Negotiator can change records; Viewer can only read.
create or replace function can_write(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(member_role(ws) in ('owner','admin','negotiator'), false);
$$;

create or replace function is_admin(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(member_role(ws) in ('owner','admin'), false);
$$;

-- Invitations: a single-use link; only a hash of the secret token is stored.
create table workspace_invitations (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  role           text not null check (role in ('admin','negotiator','viewer')),
  invited_email  text,
  invited_phone  text,
  token_hash     text not null unique,
  expires_at     timestamptz not null default now() + interval '7 days',
  created_by     uuid default auth.uid() references auth.users(id),
  created_at     timestamptz not null default now(),
  accepted_by    uuid references auth.users(id),
  accepted_at    timestamptz,
  revoked_at     timestamptz,
  check (invited_email is not null or invited_phone is not null)
);

create or replace function accept_invitation(token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv workspace_invitations;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into inv from workspace_invitations
   where token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex') for update;
  if not found then raise exception 'Invitation not found'; end if;
  if inv.revoked_at is not null then raise exception 'Invitation was cancelled'; end if;
  if inv.accepted_at is not null then raise exception 'Invitation already used'; end if;
  if inv.expires_at < now() then raise exception 'Invitation has expired'; end if;
  insert into workspace_members (workspace_id, user_id, role)
    values (inv.workspace_id, auth.uid(), inv.role)
    on conflict (workspace_id, user_id) do nothing;
  update workspace_invitations set accepted_by = auth.uid(), accepted_at = now() where id = inv.id;
  return inv.workspace_id;
end $$;

-- Audit trail: every create, change and delete on main records. Members cannot edit it.
create table audit_log (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  table_name   text not null,
  record_id    uuid,
  action       text not null check (action in ('insert','update','delete')),
  changed_by   uuid,
  changed_at   timestamptz not null default now(),
  old_data     jsonb,
  new_data     jsonb
);

create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into audit_log (workspace_id, table_name, record_id, action, changed_by, old_data, new_data)
  values ((r->>'workspace_id')::uuid, tg_table_name, (r->>'id')::uuid, lower(tg_op), auth.uid(),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;

create table workspace_settings (
  workspace_id            uuid primary key references workspaces(id) on delete cascade,
  availability_stale_days int  not null default 30,
  default_commission_pct  numeric(6,3),          -- configurable, not hard-coded
  default_negotiator_share_pct numeric(6,3),
  sst_pct                 numeric(6,3),
  duplicate_radius_m      int  not null default 30,
  default_language        text not null default 'en'
                          check (default_language in ('en','ms','zh','ta')),
  ai_monthly_limit_usd    numeric(8,2),          -- Smart Capture spending cap; null = AI switched off
  backup_keep_weeks       int not null default 8,
  updated_at              timestamptz not null default now()
);

-- Home screen: 12 configurable buttons (labels 9-12 still to confirm)
create table home_tiles (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  slot          int  not null check (slot between 1 and 12),
  label         text not null,
  icon          text,
  target_module text not null,       -- e.g. 'todo','calendar','gps','tbd'
  is_enabled    boolean not null default true,
  unique (workspace_id, slot)
);

-- ---------------------------------------------------------------------
-- 2. Places: industrial parks, tamans, buildings, streets
-- ---------------------------------------------------------------------
create table sites (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  parent_site_id uuid references sites(id) on delete set null,
  name          text not null,      -- e.g. 'Nilai Industrial Park Phase 2'
  kind          text not null check (kind in
                ('region','industrial_park','taman','commercial_centre',
                 'building','street','development','other')),
  city          text,
  state         text,
  boundary      geography(MultiPolygon, 4326),   -- used for "area completed"
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users(id),
  deleted_at    timestamptz
);

-- ---------------------------------------------------------------------
-- 3. Property types and type-specific fields
-- ---------------------------------------------------------------------
create table property_categories (
  code          text primary key,   -- 'factory','shoplot','land_industrial'...
  label         text not null,
  parent_code   text references property_categories(code),
  sort_order    int not null default 0,
  is_active     boolean not null default true
);

create table property_type_fields (
  id            uuid primary key default gen_random_uuid(),
  category_code text not null references property_categories(code) on delete cascade,
  field_key     text not null,      -- key inside properties.specs
  label         text not null,
  data_type     text not null check (data_type in
                ('text','number','integer','boolean','select','multiselect','date')),
  unit          text,               -- 'ft','kVA','amp','bays'...
  options       jsonb,              -- choices for select fields
  is_required   boolean not null default false,
  group_name    text,               -- 'Building','Utilities','Access'
  sort_order    int not null default 0,
  unique (category_code, field_key)
);

-- ---------------------------------------------------------------------
-- 4. Contacts (owners, buyers, tenants... one table, many roles)
-- ---------------------------------------------------------------------
create table contacts (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references workspaces(id) on delete cascade,
  full_name          text not null,
  company            text,
  phone_primary      text,
  phone_alt          text,
  whatsapp           text,
  email              text,
  preferred_channel  text check (preferred_channel in ('call','whatsapp','sms','email','in_person')),
  preferred_language text check (preferred_language in ('en','ms','zh','ta')),
  source             text,
  pdpa_notice_given_at timestamptz,   -- Personal Data Protection Act record
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid default auth.uid() references auth.users(id),
  deleted_at         timestamptz
);

create table contact_roles (
  contact_id   uuid not null references contacts(id) on delete cascade,
  role         text not null check (role in
               ('owner','landlord','seller','buyer','tenant','investor',
                'agent','lawyer','banker','valuer','developer','other')),
  primary key (contact_id, role)
);

-- ---------------------------------------------------------------------
-- 5. Exploration (declared before properties, which reference sessions)
-- ---------------------------------------------------------------------
create table exploration_sessions (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  user_id         uuid not null default auth.uid() references auth.users(id),
  started_at      timestamptz not null,
  ended_at        timestamptz,
  status          text not null default 'recording' check (status in
                  ('recording','paused','completed','discarded')),
  device_label    text,                 -- 'Samsung S23 Ultra'
  distance_m      numeric(10,1),
  point_count     int,
  gap_count       int,                  -- signal gaps over 60 s, for diagnostics
  site_id         uuid references sites(id) on delete set null,
  track           geography(MultiLineString, 4326),  -- simplified copy for display
  matching_status text not null default 'pending' check (matching_status in
                  ('pending','running','done','failed','skipped')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

-- Raw GPS points. Never edited, so road matching can be re-run.
create table gps_points (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  session_id    uuid not null references exploration_sessions(id) on delete cascade,
  client_seq    int  not null,          -- sequence from the phone; makes upload retries safe
  recorded_at   timestamptz not null,
  location      geography(Point, 4326) not null,
  accuracy_m    real,
  speed_mps     real,
  heading_deg   real,
  altitude_m    real,
  segment_no    int not null default 0, -- increments after each pause
  app_state     text check (app_state in ('foreground','background','screen_off')),
  is_mock       boolean not null default false,
  unique (session_id, client_seq)
);

-- Road network for working areas (Nilai, Sepang), imported from OpenStreetMap.
-- Shared reference data, so no workspace_id.
create table road_segments (
  id            bigint generated always as identity primary key,
  source        text not null default 'osm' check (source in ('osm','owner')),
  workspace_id  uuid references workspaces(id) on delete cascade,  -- set only for owner-added roads
  osm_way_id    bigint,
  from_node     bigint,
  to_node       bigint,
  name          text,
  road_class    text,                   -- 'primary','residential','service'...
  region        text not null,          -- 'nilai','sepang'
  geom          geography(LineString, 4326) not null,
  length_m      numeric(9,1) not null,
  imported_at   timestamptz not null default now(),
  unique (osm_way_id, from_node, to_node),
  check ((source = 'osm') = (osm_way_id is not null and workspace_id is null))
);

-- Current exploration status of each road segment for a workspace.
-- Re-driving a road updates this row; it never creates a new road.
create table road_coverage (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  segment_id        bigint not null references road_segments(id) on delete cascade,
  status            text not null check (status in ('explored','manual','removed')),
  source            text not null check (source in ('matched','manual')),
  confidence        numeric(4,3),       -- 0..1 for matched segments
  coverage_pct      numeric(5,2),
  times_explored    int not null default 1,
  first_explored_at timestamptz not null,
  last_explored_at  timestamptz not null,
  updated_at        timestamptz not null default now(),
  unique (workspace_id, segment_id)
);

-- Audit trail: which session explored what, and every manual correction.
create table road_coverage_events (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  segment_id    bigint not null references road_segments(id) on delete cascade,
  session_id    uuid references exploration_sessions(id) on delete set null,
  action        text not null check (action in
                ('matched','manual_mark','manual_unmark','correction')),
  coverage_pct  numeric(5,2),
  confidence    numeric(4,3),
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users(id)
);

-- ---------------------------------------------------------------------
-- 6. Properties
-- ---------------------------------------------------------------------
create table properties (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references workspaces(id) on delete cascade,
  ref_no              text,                         -- your own reference
  name                text,
  category_code       text not null references property_categories(code),
  subtype             text,                         -- 'semi_d','terrace','detached'...
  -- identity and address
  unit_no             text,
  lot_no              text,
  block               text,
  floor_level         text,
  street              text,
  site_id             uuid references sites(id) on delete set null,
  area                text,                         -- 'Nilai','Sepang','Bandar Baru Salak Tinggi'
  city                text,
  state               text,
  postcode            text,
  -- map position
  location            geography(Point, 4326),
  location_accuracy_m real,
  location_source     text check (location_source in ('gps','manual_pin','geocoded')),
  -- transaction
  listing_type        text not null default 'unknown'
                      check (listing_type in ('sale','rent','sale_or_rent','unknown')),
  asking_sale         numeric(14,2),
  asking_rent_monthly numeric(12,2),
  price_notes         text,
  -- size
  land_area_sqft      numeric(12,2),
  built_up_sqft       numeric(12,2),
  land_dimensions     text,                         -- '40 x 100 ft'
  -- legal
  tenure              text check (tenure in ('freehold','leasehold','unknown')),
  lease_expiry_year   int,
  land_status         text,                         -- 'open','bumi_lot','malay_reserve'
  title_type          text,                         -- 'individual','strata','master'
  title_no            text,
  zoning              text,
  -- type-specific fields (ceiling_ft, power_kva, bedrooms ...)
  specs               jsonb not null default '{}'::jsonb,
  -- availability: current value, kept in step with availability_log by trigger
  availability        text not null default 'unknown' check (availability in
                      ('available','unavailable','sold','rented','unknown','needs_check')),
  availability_verified    boolean not null default false,
  availability_verified_at timestamptz,
  -- origin and state
  discovered_session_id uuid references exploration_sessions(id) on delete set null,
  record_status       text not null default 'active'
                      check (record_status in ('draft','active','archived')),
  cover_photo_id      uuid,                         -- FK added after property_photos
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid default auth.uid() references auth.users(id),
  deleted_at          timestamptz,
  unique (workspace_id, ref_no)
);

-- Who is connected to a property (an owner may have many properties,
-- a property may have several contacts).
create table property_contacts (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,
  contact_id    uuid not null references contacts(id) on delete cascade,
  relationship  text not null check (relationship in
                ('owner','co_owner','representative','tenant','caretaker','agent','other')),
  is_primary    boolean not null default false,
  asking_terms  text,                 -- owner's price / rental terms
  instructions  text,                 -- owner instructions
  created_at    timestamptz not null default now(),
  unique (property_id, contact_id, relationship)
);

-- Full history of availability, with source, so old claims are never trusted blindly.
create table availability_log (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  property_id       uuid not null references properties(id) on delete cascade,
  status            text not null check (status in
                    ('available','unavailable','sold','rented','unknown','needs_check')),
  verified          boolean not null default false,
  source            text not null check (source in
                    ('owner','agent','signboard','site_visit','listing_portal','tenant','other')),
  source_contact_id uuid references contacts(id) on delete set null,
  noted_at          timestamptz not null default now(),
  note              text,
  created_by        uuid default auth.uid() references auth.users(id)
);

create table property_photos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  property_id   uuid references properties(id) on delete set null,  -- null = Unassigned inbox
  session_id    uuid references exploration_sessions(id) on delete set null,
  storage_path  text not null,
  thumb_path    text,
  taken_at      timestamptz,
  location      geography(Point, 4326),
  category      text check (category in
                ('exterior','interior','access_road','site_view','signboard','document',
                 'screenshot','business_card','brochure','listing','other')),
  source_kind   text not null default 'camera'
                check (source_kind in ('camera','screenshot','gallery','shared')),
  capture_id    uuid,                 -- Smart Capture this image belongs to; FK added after captures
  ai_text       text,                 -- text the AI read from the image (DETECTED evidence)
  caption       text,
  sort_order    int not null default 0,
  width_px      int,
  height_px     int,
  bytes         int,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users(id),
  deleted_at    timestamptz
);

alter table properties
  add constraint properties_cover_photo_fk
  foreign key (cover_photo_id) references property_photos(id) on delete set null;

create table documents (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  property_id   uuid references properties(id) on delete set null,
  contact_id    uuid references contacts(id) on delete set null,
  deal_id       uuid,                                -- FK added after deals
  doc_type      text,                                -- 'title','spa','tenancy','floor_plan'...
  title         text not null,
  storage_path  text not null,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users(id),
  deleted_at    timestamptz
);

-- ---------------------------------------------------------------------
-- 7. Neighbouring units
-- ---------------------------------------------------------------------
create table property_groups (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  name          text not null,          -- 'Jalan Perindustrian 2/3, Row A'
  kind          text not null check (kind in
                ('factory_row','shoplot_row','building','land_parcels','development','other')),
  site_id       uuid references sites(id) on delete set null,
  marketing     text not null default 'unknown'
                check (marketing in ('together','separately','unknown')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users(id),
  deleted_at    timestamptz
);

-- Order of units in the row. A property may belong to several groups
-- (e.g. a row and a development). Availability stays on each property.
create table property_group_members (
  group_id      uuid not null references property_groups(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,
  position      int  not null,
  primary key (group_id, property_id),
  unique (group_id, position) deferrable initially deferred
);

-- Physical adjacency. Suggestions from pin distance stay unconfirmed until you accept them.
create table property_adjacency (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  property_a    uuid not null references properties(id) on delete cascade,
  property_b    uuid not null references properties(id) on delete cascade,
  relation      text not null check (relation in
                ('side_by_side','back_to_back','above_below','corner','other')),
  source        text not null check (source in ('manual','suggested')),
  confirmed     boolean not null default false,
  created_at    timestamptz not null default now(),
  check (property_a < property_b),           -- stores each pair once
  unique (property_a, property_b, relation)
);

-- ---------------------------------------------------------------------
-- 8. Buyers, leads, matching
-- ---------------------------------------------------------------------
create table buyer_requirements (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null references workspaces(id) on delete cascade,
  contact_id             uuid not null references contacts(id) on delete cascade,
  title                  text,                  -- '2 adjoining factories, Nilai'
  transaction            text not null check (transaction in ('buy','rent','either')),
  category_codes         text[] not null default '{}',
  preferred_areas        text[] not null default '{}',
  search_area            geography(MultiPolygon, 4326),
  budget_min             numeric(14,2),
  budget_max             numeric(14,2),
  land_min_sqft          numeric(12,2),
  land_max_sqft          numeric(12,2),
  built_up_min_sqft      numeric(12,2),
  built_up_max_sqft      numeric(12,2),
  adjoining_units_needed int not null default 1 check (adjoining_units_needed >= 1),
  required_specs         jsonb not null default '{}'::jsonb,  -- {"power_kva":{"min":200}}
  tenure_preference      text,
  financing_notes        text,
  readiness              text check (readiness in ('browsing','ready','loan_approved','cash','unknown')),
  status                 text not null default 'active'
                         check (status in ('active','paused','fulfilled','dropped')),
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid default auth.uid() references auth.users(id),
  deleted_at             timestamptz
);

create table leads (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  contact_id        uuid not null references contacts(id) on delete cascade,
  lead_type         text not null check (lead_type in
                    ('buyer','seller','landlord','tenant','referral','other')),
  source            text,                 -- 'signboard','referral','portal','exploration'...
  property_id       uuid references properties(id) on delete set null,
  requirement_id    uuid references buyer_requirements(id) on delete set null,
  status            text not null default 'new' check (status in
                    ('new','contacted','qualified','converted','lost')),
  last_contact_at   timestamptz,
  next_follow_up_at timestamptz,
  assigned_to       uuid references auth.users(id),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid() references auth.users(id),
  deleted_at        timestamptz
);

-- Saved match suggestions (a single property OR a group of adjoining units).
create table matches (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  requirement_id  uuid not null references buyer_requirements(id) on delete cascade,
  property_id     uuid references properties(id) on delete cascade,
  group_id        uuid references property_groups(id) on delete cascade,
  unit_ids        uuid[],                -- the specific adjoining units when group_id is set
  score           numeric(5,2),
  reasons         jsonb,                 -- which criteria matched / failed
  status          text not null default 'suggested' check (status in
                  ('suggested','shortlisted','sent','rejected')),
  created_at      timestamptz not null default now(),
  check ((property_id is not null) <> (group_id is not null))
);

-- ---------------------------------------------------------------------
-- 9. Opportunities, deals, commission
-- ---------------------------------------------------------------------
create table opportunities (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null references workspaces(id) on delete cascade,
  title                  text not null,
  kind                   text not null default 'sale' check (kind in ('sale','rental','other')),
  stage                  text not null default 'identified' check (stage in
                         ('identified','contacted','matched','viewing','negotiating','won','lost')),
  lead_id                uuid references leads(id) on delete set null,
  requirement_id         uuid references buyer_requirements(id) on delete set null,
  buyer_contact_id       uuid references contacts(id) on delete set null,
  vendor_contact_id      uuid references contacts(id) on delete set null,
  group_id               uuid references property_groups(id) on delete set null,
  est_transaction_value  numeric(14,2),
  next_action            text,
  next_action_at         timestamptz,
  assigned_to            uuid references auth.users(id),
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid default auth.uid() references auth.users(id),
  deleted_at             timestamptz
);

create table opportunity_properties (
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  property_id    uuid not null references properties(id) on delete cascade,
  role           text not null default 'primary' check (role in ('primary','alternative')),
  primary key (opportunity_id, property_id)
);

create table deals (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references workspaces(id) on delete cascade,
  opportunity_id     uuid unique references opportunities(id) on delete set null,
  deal_type          text not null check (deal_type in ('sale','rental')),
  stage              text not null default 'offer' check (stage in
                     ('offer','booking_paid','spa_signed','loan_approved',
                      'tenancy_signed','completed','cancelled')),
  buyer_contact_id   uuid references contacts(id) on delete set null,
  vendor_contact_id  uuid references contacts(id) on delete set null,
  group_id           uuid references property_groups(id) on delete set null,
  transaction_value  numeric(14,2),
  offer_date         date,
  booking_date       date,
  spa_date           date,
  completion_date    date,
  tenancy_start      date,
  tenancy_months     int,
  next_action        text,
  assigned_to        uuid references auth.users(id),
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid default auth.uid() references auth.users(id),
  deleted_at         timestamptz
);

create table deal_properties (
  deal_id      uuid not null references deals(id) on delete cascade,
  property_id  uuid not null references properties(id) on delete restrict,
  primary key (deal_id, property_id)
);

alter table documents
  add constraint documents_deal_fk foreign key (deal_id) references deals(id) on delete set null;

-- One deal may earn more than one commission (e.g. vendor side and buyer side).
create table commissions (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references workspaces(id) on delete cascade,
  deal_id              uuid not null references deals(id) on delete cascade,
  payer_contact_id     uuid references contacts(id) on delete set null,
  basis                text not null check (basis in ('rate','fixed')),
  rate_pct             numeric(6,3),
  fixed_amount         numeric(14,2),
  gross_amount         numeric(14,2),     -- calculated by the app, stored for history
  sst_pct              numeric(6,3),
  negotiator_share_pct numeric(6,3),
  negotiator_amount    numeric(14,2),
  status               text not null default 'estimated' check (status in
                       ('estimated','confirmed','invoiced','received','cancelled')),
  received_amount      numeric(14,2),
  received_at          date,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check ((basis = 'rate' and rate_pct is not null) or (basis = 'fixed' and fixed_amount is not null))
);

-- ---------------------------------------------------------------------
-- 10. Calendar, viewings, tasks and follow-ups, activity history
-- ---------------------------------------------------------------------
create table calendar_events (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces(id) on delete cascade,
  title            text not null,
  kind             text not null check (kind in
                   ('viewing','site_visit','meeting','follow_up','deadline','other')),
  starts_at        timestamptz not null,
  ends_at          timestamptz,
  all_day          boolean not null default false,
  location_text    text,
  location         geography(Point, 4326),
  reminder_minutes int[] not null default '{}',
  property_id      uuid references properties(id) on delete set null,
  contact_id       uuid references contacts(id) on delete set null,
  opportunity_id   uuid references opportunities(id) on delete set null,
  deal_id          uuid references deals(id) on delete set null,
  lead_id          uuid references leads(id) on delete set null,
  external_ref     text,                  -- future sync with phone / Google calendar
  assigned_to      uuid references auth.users(id),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid default auth.uid() references auth.users(id),
  deleted_at       timestamptz,
  check (ends_at is null or ends_at >= starts_at)
);

create table event_attendees (
  event_id    uuid not null references calendar_events(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  primary key (event_id, contact_id)
);

-- One viewing appointment can cover several units.
create table viewings (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  event_id       uuid references calendar_events(id) on delete set null,
  property_id    uuid not null references properties(id) on delete cascade,
  buyer_contact_id uuid references contacts(id) on delete set null,
  viewed_at      timestamptz,
  outcome        text check (outcome in ('interested','not_interested','considering','no_show','pending')),
  feedback       text,
  created_at     timestamptz not null default now()
);

-- Tasks include follow-ups (kind = 'follow_up').
create table tasks (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  title           text not null,
  kind            text not null default 'general' check (kind in
                  ('general','follow_up','call','document','site_check','other')),
  notes           text,
  next_action     text,
  due_at          timestamptz,
  reminder_at     timestamptz,
  priority        text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status          text not null default 'open' check (status in ('open','done','cancelled')),
  completed_at    timestamptz,
  assigned_to     uuid references auth.users(id),
  property_id     uuid references properties(id) on delete set null,
  contact_id      uuid references contacts(id) on delete set null,
  lead_id         uuid references leads(id) on delete set null,
  opportunity_id  uuid references opportunities(id) on delete set null,
  deal_id         uuid references deals(id) on delete set null,
  event_id        uuid references calendar_events(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references auth.users(id),
  deleted_at      timestamptz
);

-- One timeline shown on every linked record.
create table activities (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  occurred_at     timestamptz not null default now(),
  kind            text not null check (kind in
                  ('note','call','whatsapp','sms','email','meeting','viewing',
                   'status_change','smart_capture','system')),
  summary         text not null,
  body            text,
  property_id     uuid references properties(id) on delete set null,
  contact_id      uuid references contacts(id) on delete set null,
  lead_id         uuid references leads(id) on delete set null,
  opportunity_id  uuid references opportunities(id) on delete set null,
  deal_id         uuid references deals(id) on delete set null,
  task_id         uuid references tasks(id) on delete set null,
  event_id        uuid references calendar_events(id) on delete set null,
  created_by      uuid default auth.uid() references auth.users(id)
);

-- ---------------------------------------------------------------------
-- 11. Communication templates and Ask Expert
-- ---------------------------------------------------------------------
create table message_templates (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  purpose       text not null check (purpose in
                ('owner_first_contact','availability_check','confirm_details',
                 'buyer_follow_up','arrange_viewing','after_viewing',
                 'offer_to_sell_other','property_info','other')),
  language      text not null check (language in ('en','ms','zh','ta')),
  title         text not null,
  body          text not null,         -- placeholders like {{contact_name}}, {{unit_no}}
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, purpose, language, title)
);

create table expert_profiles (
  code          text primary key,      -- 'lawyer','banker','tax','valuer','agent_ai'...
  label         text not null,
  instructions  text not null,
  disclaimer    text not null,
  sort_order    int not null default 0
);

create table expert_conversations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  expert_code   text not null references expert_profiles(code),
  title         text,
  property_id   uuid references properties(id) on delete set null,
  deal_id       uuid references deals(id) on delete set null,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users(id)
);

create table expert_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references expert_conversations(id) on delete cascade,
  role            text not null check (role in ('user','assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 11b. AI Smart Capture (core requirement, Version 1C)
-- One capture = photos / screenshots / business cards + voice or typed note
-- + GPS + existing records, analysed together into PROPOSED field values.
-- Nothing reaches properties or contacts until the owner confirms or edits
-- each value; inferred values can never be applied without a decision.
-- ---------------------------------------------------------------------
create table captures (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references workspaces(id) on delete cascade,
  session_id          uuid references exploration_sessions(id) on delete set null,
  location            geography(Point, 4326),        -- phone GPS when the capture was made
  location_accuracy_m real,
  location_source     text not null default 'none'
                      check (location_source in ('gps','none')),
  status              text not null default 'draft' check (status in
                      ('draft','queued','processing','ready_for_review','reviewed','rejected','failed')),
  owner_note          text,                          -- anything typed by the owner
  ai_model            text,
  ai_requested_at     timestamptz,
  ai_completed_at     timestamptz,
  ai_error            text,
  match_candidates    jsonb not null default '[]'::jsonb,  -- proposed existing properties, with reasons
  match_decision      text not null default 'pending'
                      check (match_decision in ('pending','existing','new','none')),
  matched_property_id uuid references properties(id) on delete set null,  -- chosen by the owner
  questions           jsonb not null default '[]'::jsonb,  -- what the AI could not decide
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid default auth.uid() references auth.users(id),
  deleted_at          timestamptz,
  check (match_decision <> 'existing' or matched_property_id is not null)
);

alter table property_photos
  add constraint property_photos_capture_fk
  foreign key (capture_id) references captures(id) on delete set null;

create table capture_inputs (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references workspaces(id) on delete cascade,
  capture_id          uuid not null references captures(id) on delete cascade,
  kind                text not null check (kind in
                      ('photo','screenshot','business_card','voice','text')),
  photo_id            uuid references property_photos(id) on delete set null,
  audio_path          text,                          -- voice note file (private storage)
  transcript          text,                          -- voice note as text
  transcript_language text,                          -- 'en','ms','zh','ta' or mixed
  transcript_source   text check (transcript_source in ('android_on_device','cloud','typed')),
  source_app          text,                          -- 'WhatsApp','Chrome','iProperty'... for shared screenshots
  text_content        text,                          -- typed note or shared text
  created_at          timestamptz not null default now(),
  check (kind not in ('photo','screenshot','business_card') or photo_id is not null),
  check (kind <> 'voice' or audio_path is not null or transcript is not null),
  check (kind <> 'text' or text_content is not null)
);

-- Every value the AI proposes, with where it came from.
--   detected = readable or visible in an image (evidence = the text read)
--   stated   = said by the owner in a voice note or typed (evidence = the words)
--   inferred = suggested from GPS, nearby or existing records, or context (evidence = the reason)
create table capture_fields (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  capture_id        uuid not null references captures(id) on delete cascade,
  target_entity     text not null check (target_entity in
                    ('property','contact','property_contact','availability','buyer_requirement','note')),
  target_ref        text,          -- groups fields of one new record, e.g. 'contact:1'
  target_record_id  uuid,          -- existing record to update (null = new record)
  field_key         text not null, -- 'unit_no','asking_sale','phone_primary'...
  proposed_value    jsonb,         -- null = not readable; left blank, never guessed
  basis             text not null check (basis in ('detected','stated','inferred')),
  source_input_id   uuid references capture_inputs(id) on delete set null,
  evidence          text,
  confidence        numeric(4,3) check (confidence between 0 and 1),
  status            text not null default 'pending'
                    check (status in ('pending','confirmed','edited','rejected')),
  final_value       jsonb,
  decided_at        timestamptz,
  decided_by        uuid references auth.users(id),
  applied_at        timestamptz,   -- when written into the real record
  created_at        timestamptz not null default now(),
  check (status = 'pending' or (decided_at is not null and decided_by is not null)),
  check (status <> 'edited' or final_value is not null),
  check (applied_at is null or status in ('confirmed','edited'))
);

-- 11c. Version 1D additions
-- ---------------------------------------------------------------------
-- Offline edits: latest save wins, the losing version is kept here and shown to the user.
create table sync_conflicts (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  table_name     text not null,
  record_id      uuid not null,
  losing_data    jsonb not null,       -- the earlier save that was overwritten
  winning_data   jsonb not null,
  losing_user    uuid references auth.users(id),
  losing_device  text,
  detected_at    timestamptz not null default now(),
  seen_at        timestamptz,
  seen_by        uuid references auth.users(id)
);

-- Weekly backups to Google Drive and restore tests.
create table backup_runs (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  kind           text not null check (kind in ('weekly','manual','restore_test')),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         text not null default 'running' check (status in ('running','ok','failed')),
  file_name      text,
  drive_file_id  text,
  size_bytes     bigint,
  row_counts     jsonb,                -- records per table, compared after a restore
  file_count     int,                  -- photos and documents included
  error          text
);

-- Driven sections that match no road on the map (shown red dashed).
create table unmatched_tracks (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  session_id     uuid not null references exploration_sessions(id) on delete cascade,
  geom           geography(LineString, 4326) not null,
  length_m       numeric(9,1),
  status         text not null default 'pending' check (status in ('pending','confirmed','dismissed')),
  segment_id     bigint references road_segments(id) on delete set null,  -- owner road created on confirm
  decided_by     uuid references auth.users(id),
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  check (status <> 'confirmed' or segment_id is not null)
);

-- Cost of each Smart Capture analysis, checked against the monthly limit.
create table ai_usage (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  capture_id     uuid references captures(id) on delete set null,
  model          text not null,
  input_tokens   int not null,
  output_tokens  int not null,
  cost_usd       numeric(10,5) not null,
  created_at     timestamptz not null default now()
);

-- 12. Indexes
-- ---------------------------------------------------------------------
create index on properties using gist (location);
create index on properties (workspace_id, category_code, availability);
create index on properties (workspace_id, unit_no);
create index on property_photos (property_id);
create index on property_photos (workspace_id) where property_id is null;   -- photo inbox
create index on availability_log (property_id, noted_at desc);
create index on property_contacts (contact_id);
create index on property_group_members (property_id);
create index on gps_points (session_id, client_seq);
create index on gps_points using gist (location);
create index on road_segments using gist (geom);
create index on road_segments (region);
create index on road_coverage (workspace_id, status);
create index on tasks (workspace_id, status, due_at);
create index on calendar_events (workspace_id, starts_at);
create index on leads (workspace_id, next_follow_up_at);
create index on activities (property_id, occurred_at desc);
create index on activities (contact_id, occurred_at desc);
create index on buyer_requirements (workspace_id, status);

-- ---------------------------------------------------------------------
create index on captures (workspace_id, status);
create index on captures using gist (location);
create index on capture_inputs (capture_id);
create index on capture_fields (capture_id, status);
create index on property_photos (capture_id);
create index on audit_log (workspace_id, changed_at desc);
create index on audit_log (table_name, record_id);
create index on sync_conflicts (workspace_id) where seen_at is null;
create index on unmatched_tracks (workspace_id, status);
create index on ai_usage (workspace_id, created_at);
create index on contacts (workspace_id, phone_primary);
create index on properties (workspace_id, lot_no);

-- 13. Triggers
-- ---------------------------------------------------------------------
-- Keep properties.availability equal to the latest availability_log entry.
create or replace function apply_availability() returns trigger
language plpgsql as $$
begin
  update properties p
     set availability = new.status,
         availability_verified = new.verified,
         availability_verified_at = case when new.verified then new.noted_at
                                         else p.availability_verified_at end
   where p.id = new.property_id
     and not exists (select 1 from availability_log l
                     where l.property_id = new.property_id
                       and l.noted_at > new.noted_at);
  return new;
end $$;

create trigger availability_log_apply
  after insert on availability_log
  for each row execute function apply_availability();

do $$
declare t text;
begin
  foreach t in array array[
    'sites','contacts','exploration_sessions','properties','property_groups',
    'buyer_requirements','leads','opportunities','deals','commissions',
    'calendar_events','tasks','message_templates','road_coverage','captures']
  loop
    execute format('create trigger %I_updated_at before update on %I
                    for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- Audit trail triggers on main records
do $$
declare t text;
begin
  foreach t in array array[
    'properties','property_contacts','availability_log','property_photos','documents',
    'property_groups','contacts','buyer_requirements','leads','opportunities','deals',
    'commissions','tasks','calendar_events','captures','capture_fields',
    'workspace_members','workspace_invitations','workspace_settings','road_coverage']
  loop
    execute format('create trigger %I_audit after insert or update or delete on %I
                    for each row execute function audit_row()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 14. Row-level security
--   Members see only their own workspace. Viewers read only.
--   Admin-only: settings, home buttons, invitations, audit trail, backup log.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'sites','contacts','exploration_sessions',
    'gps_points','road_coverage','road_coverage_events','properties',
    'property_contacts','availability_log','property_photos','documents',
    'property_groups','property_adjacency','buyer_requirements','leads','matches',
    'opportunities','deals','commissions','calendar_events','viewings','tasks',
    'activities','message_templates','expert_conversations',
    'captures','capture_inputs','capture_fields','sync_conflicts','unmatched_tracks','ai_usage']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I_read on %I for select using (is_member(workspace_id))', t, t);
    execute format('create policy %I_insert on %I for insert with check (can_write(workspace_id))', t, t);
    execute format('create policy %I_update on %I for update using (can_write(workspace_id)) with check (can_write(workspace_id))', t, t);
    execute format('create policy %I_delete on %I for delete using (can_write(workspace_id))', t, t);
  end loop;
  foreach t in array array['workspace_settings','home_tiles']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I_read on %I for select using (is_member(workspace_id))', t, t);
    execute format('create policy %I_admin on %I for all using (is_admin(workspace_id)) with check (is_admin(workspace_id))', t, t);
  end loop;
end $$;

alter table workspace_invitations enable row level security;
create policy invitations_admin on workspace_invitations for all
  using (is_admin(workspace_id)) with check (is_admin(workspace_id));

alter table audit_log enable row level security;
create policy audit_admin_read on audit_log for select using (is_admin(workspace_id));
-- no insert/update/delete policies: only the audit trigger writes here

alter table backup_runs enable row level security;
create policy backups_admin_read on backup_runs for select using (is_admin(workspace_id));

alter table workspaces enable row level security;
create policy workspaces_member on workspaces for select using (is_member(id));

alter table workspace_members enable row level security;
create policy members_read on workspace_members for select using (is_member(workspace_id));
create policy members_admin on workspace_members for update
  using (is_admin(workspace_id)) with check (is_admin(workspace_id) and role <> 'owner');
create policy members_admin_remove on workspace_members for delete
  using (is_admin(workspace_id) and role <> 'owner');

-- Child tables without workspace_id follow their parent.
create or replace function child_policies(child text, parent text, fk text) returns void
language plpgsql as $f$
begin
  execute format('alter table %I enable row level security', child);
  execute format('create policy %I_read on %I for select using (exists (select 1 from %I p where p.id = %I and is_member(p.workspace_id)))', child, child, parent, fk);
  execute format('create policy %I_write on %I for all using (exists (select 1 from %I p where p.id = %I and can_write(p.workspace_id))) with check (exists (select 1 from %I p where p.id = %I and can_write(p.workspace_id)))', child, child, parent, fk, parent, fk);
end $f$;
select child_policies('contact_roles','contacts','contact_id');
select child_policies('property_group_members','property_groups','group_id');
select child_policies('opportunity_properties','opportunities','opportunity_id');
select child_policies('deal_properties','deals','deal_id');
select child_policies('event_attendees','calendar_events','event_id');
select child_policies('expert_messages','expert_conversations','conversation_id');
drop function child_policies(text, text, text);

-- Shared reference data: readable by any signed-in user, written only by admins via migrations.
alter table road_segments        enable row level security;
create policy owner_roads_write on road_segments for insert to authenticated
  with check (source = 'owner' and can_write(workspace_id));
alter table property_categories  enable row level security;
alter table property_type_fields enable row level security;
alter table expert_profiles      enable row level security;
create policy road_segments_read on road_segments        for select to authenticated
  using (workspace_id is null or is_member(workspace_id));
create policy categories_read    on property_categories  for select to authenticated using (true);
create policy type_fields_read   on property_type_fields for select to authenticated using (true);
create policy experts_read       on expert_profiles      for select to authenticated using (true);
