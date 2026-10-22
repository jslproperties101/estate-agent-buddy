-- AdminBatch007 — Compliance core for Admin EAB (features 50, 51, 82, 88, 91, 94, 111).
-- Builds on AdminBatch001-006. TEST project first; never production without Joe's approval.
-- Rollback: supabase/rollback/20261024000000_admin_batch_007_compliance_rollback.sql
--
-- In plain words:
--   * PDPA REQUESTS (50): every written request (access, correction, deletion, consent) is logged with a reference
--     PDPA-YYYY-####, the decision, the outcome and dates; every step is kept for good (eab_pdpa_events).
--     A DELETION request is only LOGGED: nothing is deleted by this batch (lawyer's answer pending).
--   * RETENTION (51): lists what is older than 7 years, per kind of record and per agent, for Joe to review.
--     Reviews are recorded. NOTHING is ever deleted automatically, and there is no delete button yet.
--   * LEGAL HOLD (88): freezes an agent's records: the database refuses to delete them while the hold is on,
--     retention lists them as "on hold", and a PDPA deletion request for them cannot be marked done.
--   * COMPLAINTS (91): complaints from buyers / the public about agents, reference CMP-YYYY-####, outcome, case link.
--   * LICENCE EXPIRY (82): an expiry date per licence (eab_licences.expires_on), entered in Admin EAB; warnings.
--   * TAGS & NOTES (94): internal tags and notes on agents (agents never see them; notes kept for good).
--   * SCHEDULED POSTS (111): publish a post at a future time (the main app already hides posts until published_at).
-- Additive only: new tables, one new nullable column (eab_licences.expires_on), new functions; the Master Dashboard
-- function is extended with new keys (same name, same arguments).

-- =====================================================================================================
-- tables
-- =====================================================================================================
create sequence if not exists public.eab_pdpa_seq;
create table if not exists public.eab_pdpa_requests (
  id                uuid primary key default gen_random_uuid(),
  ref               text not null unique,
  agent_user        uuid references auth.users (id) on delete restrict,
  requester_name    text not null check (char_length(requester_name) between 1 and 200),
  requester_contact text check (requester_contact is null or char_length(requester_contact) <= 300),
  received_on       date not null,
  kind              text not null check (kind in ('access', 'correction', 'deletion', 'withdraw_consent', 'other')),
  details           text not null check (char_length(details) between 1 and 4000),
  status            text not null default 'open' check (status in ('open', 'in_progress', 'done', 'refused')),
  decision          text check (decision is null or char_length(decision) <= 4000),
  decided_on        date,
  supplied_on       date,
  outcome           text check (outcome is null or char_length(outcome) <= 4000),
  case_id           uuid references public.eab_reg_cases (id) on delete restrict,
  created_by        uuid not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists eab_pdpa_requests_status on public.eab_pdpa_requests (status, received_on);
create table if not exists public.eab_pdpa_events (
  id          bigint generated always as identity primary key,
  request_id  uuid not null references public.eab_pdpa_requests (id) on delete restrict,
  kind        text not null check (kind in ('created', 'status', 'updated', 'note')),
  body        text check (body is null or char_length(body) <= 4000),
  from_status text, to_status text, detail jsonb,
  by_user     uuid not null, by_email text, at timestamptz not null default now()
);
create index if not exists eab_pdpa_events_req on public.eab_pdpa_events (request_id, at);

create sequence if not exists public.eab_complaint_seq;
create table if not exists public.eab_complaints (
  id                  uuid primary key default gen_random_uuid(),
  ref                 text not null unique,
  agent_user          uuid references auth.users (id) on delete restrict,
  complainant_name    text not null check (char_length(complainant_name) between 1 and 200),
  complainant_contact text check (complainant_contact is null or char_length(complainant_contact) <= 300),
  received_on         date not null,
  channel             text not null check (channel in ('phone', 'email', 'walk_in', 'board', 'other')),
  category            text not null check (category in ('misleading_listing', 'conduct', 'fees', 'privacy', 'other')),
  listing_ref         text check (listing_ref is null or char_length(listing_ref) <= 120),
  details             text not null check (char_length(details) between 1 and 4000),
  status              text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'dismissed', 'referred')),
  outcome             text check (outcome is null or char_length(outcome) <= 4000),
  case_id             uuid references public.eab_reg_cases (id) on delete restrict,
  created_by          uuid not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists eab_complaints_status on public.eab_complaints (status, received_on);
create table if not exists public.eab_complaint_events (
  id           bigint generated always as identity primary key,
  complaint_id uuid not null references public.eab_complaints (id) on delete restrict,
  kind         text not null check (kind in ('created', 'status', 'updated', 'note')),
  body         text check (body is null or char_length(body) <= 4000),
  from_status  text, to_status text, detail jsonb,
  by_user      uuid not null, by_email text, at timestamptz not null default now()
);
create index if not exists eab_complaint_events_c on public.eab_complaint_events (complaint_id, at);

create table if not exists public.eab_legal_holds (
  id             uuid primary key default gen_random_uuid(),
  agent_user     uuid not null references auth.users (id) on delete restrict,
  reason         text not null check (char_length(reason) between 1 and 2000),
  case_id        uuid references public.eab_reg_cases (id) on delete restrict,
  placed_by      uuid not null, placed_by_email text, placed_at timestamptz not null default now(),
  released_by    uuid, released_by_email text, released_at timestamptz,
  release_reason text check (release_reason is null or char_length(release_reason) <= 2000)
);
create index if not exists eab_legal_holds_agent on public.eab_legal_holds (agent_user) where released_at is null;

create table if not exists public.eab_agent_tags (
  user_id  uuid not null references auth.users (id) on delete cascade,
  tag      text not null check (tag ~ '^[a-z0-9][a-z0-9 _-]{0,29}$'),
  added_by uuid not null, added_at timestamptz not null default now(),
  primary key (user_id, tag)
);
create table if not exists public.eab_agent_notes (
  id       bigint generated always as identity primary key,
  user_id  uuid not null references auth.users (id) on delete restrict,
  body     text not null check (char_length(body) between 1 and 4000),
  by_user  uuid not null, by_email text, at timestamptz not null default now()
);
create index if not exists eab_agent_notes_user on public.eab_agent_notes (user_id, at);

create table if not exists public.eab_retention_reviews (
  id          bigint generated always as identity primary key,
  cutoff      date not null,
  counts      jsonb not null,
  decision    text not null check (decision in ('keep', 'approve_later')),
  note        text not null check (char_length(note) between 1 and 2000),
  by_user     uuid not null, by_email text, at timestamptz not null default now()
);

alter table public.eab_licences add column if not exists expires_on date;

-- kept for good: no change, no delete, no truncate (status changes go through the functions only)
create or replace function public.eab_b7_fixed() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception '% rows cannot be changed or deleted', tg_table_name using errcode = '42501';
end $$;
create or replace function public.eab_b7_no_delete() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception '% rows cannot be deleted', tg_table_name using errcode = '42501';
end $$;
create or replace trigger eab_pdpa_events_fixed before update or delete on public.eab_pdpa_events for each row execute function public.eab_b7_fixed();
create or replace trigger eab_complaint_events_fixed before update or delete on public.eab_complaint_events for each row execute function public.eab_b7_fixed();
create or replace trigger eab_agent_notes_fixed before update or delete on public.eab_agent_notes for each row execute function public.eab_b7_fixed();
create or replace trigger eab_retention_reviews_fixed before update or delete on public.eab_retention_reviews for each row execute function public.eab_b7_fixed();
create or replace trigger eab_pdpa_requests_keep before delete on public.eab_pdpa_requests for each row execute function public.eab_b7_no_delete();
create or replace trigger eab_complaints_keep before delete on public.eab_complaints for each row execute function public.eab_b7_no_delete();
create or replace trigger eab_legal_holds_keep before delete on public.eab_legal_holds for each row execute function public.eab_b7_no_delete();
create or replace trigger eab_pdpa_events_notrunc before truncate on public.eab_pdpa_events for each statement execute function public.eab_b7_fixed();
create or replace trigger eab_complaint_events_notrunc before truncate on public.eab_complaint_events for each statement execute function public.eab_b7_fixed();
create or replace trigger eab_agent_notes_notrunc before truncate on public.eab_agent_notes for each statement execute function public.eab_b7_fixed();
create or replace trigger eab_retention_reviews_notrunc before truncate on public.eab_retention_reviews for each statement execute function public.eab_b7_fixed();
create or replace trigger eab_pdpa_requests_notrunc before truncate on public.eab_pdpa_requests for each statement execute function public.eab_b7_fixed();
create or replace trigger eab_complaints_notrunc before truncate on public.eab_complaints for each statement execute function public.eab_b7_fixed();
create or replace trigger eab_legal_holds_notrunc before truncate on public.eab_legal_holds for each statement execute function public.eab_b7_fixed();

-- Legal hold: the database refuses to delete an agent's records while a hold is on (the main app only soft-deletes).
create or replace function public.eab_agent_on_hold(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.eab_legal_holds h where h.agent_user = p_user and h.released_at is null)
$$;
create or replace function public.eab_records_hold_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.eab_agent_on_hold(old.user_id) then
    raise exception 'this agent is on legal hold: records cannot be deleted' using errcode = '42501';
  end if;
  return old;
end $$;
create or replace trigger eab_records_hold_guard before delete on public.eab_records for each row execute function public.eab_records_hold_guard();

alter table public.eab_pdpa_requests enable row level security;
alter table public.eab_pdpa_events enable row level security;
alter table public.eab_complaints enable row level security;
alter table public.eab_complaint_events enable row level security;
alter table public.eab_legal_holds enable row level security;
alter table public.eab_agent_tags enable row level security;
alter table public.eab_agent_notes enable row level security;
alter table public.eab_retention_reviews enable row level security;
revoke all on public.eab_pdpa_requests, public.eab_pdpa_events, public.eab_complaints, public.eab_complaint_events,
  public.eab_legal_holds, public.eab_agent_tags, public.eab_agent_notes, public.eab_retention_reviews from anon, authenticated, public;
revoke all on sequence public.eab_pdpa_seq, public.eab_complaint_seq from anon, authenticated, public;

-- =====================================================================================================
-- helpers
-- =====================================================================================================
create or replace function public.eab_b7_reason(p text) returns text
language plpgsql immutable set search_path = pg_catalog as $$
begin
  if nullif(btrim(coalesce(p, '')), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  return left(btrim(p), 2000);
end $$;
create or replace function public.eab_b7_me_email() returns text
language sql stable security definer set search_path = public, auth as $$
  select email::text from auth.users where id = auth.uid()
$$;

-- =====================================================================================================
-- feature 50 — PDPA requests (owner, compliance)
-- =====================================================================================================
create or replace function public.eab_pdpa_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select to_jsonb(r) || jsonb_build_object(
    'agent_email', u.email, 'agent_name', public.eab_admin_name(u),
    'agent_on_hold', coalesce(public.eab_agent_on_hold(r.agent_user), false),
    'case_no', (select c.case_no from public.eab_reg_cases c where c.id = r.case_id),
    'days_open', case when r.status in ('open', 'in_progress') then public.eab_dash_today() - r.received_on end,
    'history', (select coalesce(jsonb_agg(to_jsonb(e) order by e.at, e.id), '[]'::jsonb) from public.eab_pdpa_events e where e.request_id = r.id))
  from public.eab_pdpa_requests r left join auth.users u on u.id = r.agent_user where r.id = p_id
$$;

create or replace function public.eab_admin_pdpa_list(p_status text default null, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  if p_status is not null and p_status not in ('open', 'in_progress', 'done', 'refused', 'active') then raise exception 'unknown status' using errcode = '22023'; end if;
  select jsonb_build_object(
    'counts', (select coalesce(jsonb_object_agg(x.status, x.n), '{}'::jsonb) from (select status, count(*) n from public.eab_pdpa_requests group by 1) x),
    'requests', (select coalesce(jsonb_agg(to_jsonb(r) - 'details' || jsonb_build_object('agent_email', u.email,
        'agent_on_hold', coalesce(public.eab_agent_on_hold(r.agent_user), false),
        'days_open', case when r.status in ('open', 'in_progress') then public.eab_dash_today() - r.received_on end,
        'summary', left(r.details, 160)) order by r.received_on desc, r.created_at desc), '[]'::jsonb)
      from public.eab_pdpa_requests r left join auth.users u on u.id = r.agent_user
      where p_status is null or r.status = p_status or (p_status = 'active' and r.status in ('open', 'in_progress')))
  ) into out;
  perform public.eab_admin_write_access('search', null, 'pdpa requests' || coalesce(': ' || p_status, ''),
            jsonb_build_object('results', jsonb_array_length(out->'requests')), p_device);
  return out;
end $$;

create or replace function public.eab_admin_pdpa_get(p_id uuid, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  out := public.eab_pdpa_json(p_id);
  if out is null then raise exception 'request not found' using errcode = 'P0002'; end if;
  perform public.eab_admin_write_access('search', (out->>'agent_user')::uuid, 'pdpa: ' || (out->>'ref'), null, p_device);
  return out;
end $$;

-- p: agent_user (optional), requester_name, requester_contact, received_on, kind, details, case_id (optional)
create or replace function public.eab_admin_pdpa_create(p jsonb, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.eab_pdpa_requests; rec date := nullif(p->>'received_on', '')::date;
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  if rec is null or rec > public.eab_dash_today() then raise exception 'the date received is needed and cannot be in the future' using errcode = '22023'; end if;
  if nullif(p->>'agent_user', '') is not null and not exists (select 1 from auth.users where id = (p->>'agent_user')::uuid) then
    raise exception 'agent not found' using errcode = '22023';
  end if;
  insert into public.eab_pdpa_requests (ref, agent_user, requester_name, requester_contact, received_on, kind, details, case_id, created_by)
  values ('PDPA-' || to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY') || '-' || lpad(nextval('public.eab_pdpa_seq')::text, 4, '0'),
          nullif(p->>'agent_user', '')::uuid, btrim(p->>'requester_name'), nullif(btrim(p->>'requester_contact'), ''), rec,
          p->>'kind', btrim(p->>'details'), nullif(p->>'case_id', '')::uuid, auth.uid())
  returning * into r;
  insert into public.eab_pdpa_events (request_id, kind, to_status, by_user, by_email) values (r.id, 'created', 'open', auth.uid(), public.eab_b7_me_email());
  perform public.eab_admin_write_action('pdpa_created', r.agent_user, r.ref, 'new ' || r.kind || ' request', null, to_jsonb(r), p_device);
  return public.eab_pdpa_json(r.id);
end $$;

-- p: status, decision, decided_on, supplied_on, outcome, case_id (only the keys sent change). p_note is the reason.
create or replace function public.eab_admin_pdpa_update(p_id uuid, p jsonb, p_note text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.eab_pdpa_requests; a public.eab_pdpa_requests; note text := public.eab_b7_reason(p_note);
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  select * into b from public.eab_pdpa_requests where id = p_id for update;
  if b.id is null then raise exception 'request not found' using errcode = 'P0002'; end if;
  if p ? 'status' and p->>'status' not in ('open', 'in_progress', 'done', 'refused') then raise exception 'unknown status' using errcode = '22023'; end if;
  if p->>'status' = 'done' and b.kind = 'deletion' and public.eab_agent_on_hold(b.agent_user) then
    raise exception 'this agent is on legal hold: a deletion request cannot be marked done' using errcode = '22023';
  end if;
  update public.eab_pdpa_requests set
    status      = coalesce(nullif(p->>'status', ''), status),
    decision    = case when p ? 'decision' then nullif(btrim(p->>'decision'), '') else decision end,
    decided_on  = case when p ? 'decided_on' then nullif(p->>'decided_on', '')::date else decided_on end,
    supplied_on = case when p ? 'supplied_on' then nullif(p->>'supplied_on', '')::date else supplied_on end,
    outcome     = case when p ? 'outcome' then nullif(btrim(p->>'outcome'), '') else outcome end,
    case_id     = case when p ? 'case_id' then nullif(p->>'case_id', '')::uuid else case_id end,
    updated_at  = now()
  where id = p_id returning * into a;
  insert into public.eab_pdpa_events (request_id, kind, body, from_status, to_status, detail, by_user, by_email)
  values (p_id, case when a.status <> b.status then 'status' else 'updated' end, note,
          case when a.status <> b.status then b.status end, case when a.status <> b.status then a.status end,
          (to_jsonb(a) - 'updated_at') - (select coalesce(array_agg(k), '{}') from jsonb_each(to_jsonb(a)) j(k, v) where to_jsonb(b)->k = v),
          auth.uid(), public.eab_b7_me_email());
  perform public.eab_admin_write_action('pdpa_updated', a.agent_user, a.ref, note, to_jsonb(b), to_jsonb(a), p_device);
  return public.eab_pdpa_json(p_id);
end $$;

create or replace function public.eab_admin_pdpa_note(p_id uuid, p_note text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.eab_pdpa_requests; note text;
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  if nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'the note is empty' using errcode = '22023'; end if;
  note := left(btrim(p_note), 4000);
  select * into r from public.eab_pdpa_requests where id = p_id;
  if r.id is null then raise exception 'request not found' using errcode = 'P0002'; end if;
  insert into public.eab_pdpa_events (request_id, kind, body, by_user, by_email) values (p_id, 'note', note, auth.uid(), public.eab_b7_me_email());
  perform public.eab_admin_write_action('pdpa_note', r.agent_user, r.ref, 'note', null, jsonb_build_object('note', note), p_device);
  return public.eab_pdpa_json(p_id);
end $$;

-- =====================================================================================================
-- feature 91 — Complaints (owner, admin, compliance)
-- =====================================================================================================
create or replace function public.eab_complaint_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select to_jsonb(c) || jsonb_build_object('agent_email', u.email, 'agent_name', public.eab_admin_name(u),
    'case_no', (select x.case_no from public.eab_reg_cases x where x.id = c.case_id),
    'agent_complaints', (select count(*) from public.eab_complaints o where o.agent_user = c.agent_user),
    'history', (select coalesce(jsonb_agg(to_jsonb(e) order by e.at, e.id), '[]'::jsonb) from public.eab_complaint_events e where e.complaint_id = c.id))
  from public.eab_complaints c left join auth.users u on u.id = c.agent_user where c.id = p_id
$$;

create or replace function public.eab_admin_complaints(p_status text default null, p_agent uuid default null, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  if p_status is not null and p_status not in ('open', 'investigating', 'resolved', 'dismissed', 'referred', 'active') then raise exception 'unknown status' using errcode = '22023'; end if;
  select jsonb_build_object(
    'counts', (select coalesce(jsonb_object_agg(x.status, x.n), '{}'::jsonb) from (select status, count(*) n from public.eab_complaints group by 1) x),
    'by_category', (select coalesce(jsonb_object_agg(x.category, x.n), '{}'::jsonb) from (select category, count(*) n from public.eab_complaints group by 1) x),
    'complaints', (select coalesce(jsonb_agg(to_jsonb(c) - 'details' || jsonb_build_object('agent_email', u.email, 'agent_name', public.eab_admin_name(u),
        'summary', left(c.details, 160)) order by c.received_on desc, c.created_at desc), '[]'::jsonb)
      from public.eab_complaints c left join auth.users u on u.id = c.agent_user
      where (p_status is null or c.status = p_status or (p_status = 'active' and c.status in ('open', 'investigating')))
        and (p_agent is null or c.agent_user = p_agent))
  ) into out;
  perform public.eab_admin_write_access('search', p_agent, 'complaints' || coalesce(': ' || p_status, ''),
            jsonb_build_object('results', jsonb_array_length(out->'complaints')), p_device);
  return out;
end $$;

create or replace function public.eab_admin_complaint_get(p_id uuid, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  out := public.eab_complaint_json(p_id);
  if out is null then raise exception 'complaint not found' using errcode = 'P0002'; end if;
  perform public.eab_admin_write_access('search', (out->>'agent_user')::uuid, 'complaint: ' || (out->>'ref'), null, p_device);
  return out;
end $$;

-- p: agent_user (optional), complainant_name, complainant_contact, received_on, channel, category, listing_ref, details, case_id
create or replace function public.eab_admin_complaint_create(p jsonb, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.eab_complaints; rec date := nullif(p->>'received_on', '')::date;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  if rec is null or rec > public.eab_dash_today() then raise exception 'the date received is needed and cannot be in the future' using errcode = '22023'; end if;
  if nullif(p->>'agent_user', '') is not null and not exists (select 1 from auth.users where id = (p->>'agent_user')::uuid) then
    raise exception 'agent not found' using errcode = '22023';
  end if;
  insert into public.eab_complaints (ref, agent_user, complainant_name, complainant_contact, received_on, channel, category, listing_ref, details, case_id, created_by)
  values ('CMP-' || to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY') || '-' || lpad(nextval('public.eab_complaint_seq')::text, 4, '0'),
          nullif(p->>'agent_user', '')::uuid, btrim(p->>'complainant_name'), nullif(btrim(p->>'complainant_contact'), ''), rec,
          p->>'channel', p->>'category', nullif(btrim(p->>'listing_ref'), ''), btrim(p->>'details'), nullif(p->>'case_id', '')::uuid, auth.uid())
  returning * into c;
  insert into public.eab_complaint_events (complaint_id, kind, to_status, by_user, by_email) values (c.id, 'created', 'open', auth.uid(), public.eab_b7_me_email());
  perform public.eab_admin_write_action('complaint_created', c.agent_user, c.ref, 'new complaint: ' || c.category, null, to_jsonb(c), p_device);
  return public.eab_complaint_json(c.id);
end $$;

-- p: status, outcome, case_id, agent_user, listing_ref (only the keys sent change). p_note is the reason.
create or replace function public.eab_admin_complaint_update(p_id uuid, p jsonb, p_note text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.eab_complaints; a public.eab_complaints; note text := public.eab_b7_reason(p_note);
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  select * into b from public.eab_complaints where id = p_id for update;
  if b.id is null then raise exception 'complaint not found' using errcode = 'P0002'; end if;
  if p ? 'status' and p->>'status' not in ('open', 'investigating', 'resolved', 'dismissed', 'referred') then raise exception 'unknown status' using errcode = '22023'; end if;
  update public.eab_complaints set
    status      = coalesce(nullif(p->>'status', ''), status),
    outcome     = case when p ? 'outcome' then nullif(btrim(p->>'outcome'), '') else outcome end,
    case_id     = case when p ? 'case_id' then nullif(p->>'case_id', '')::uuid else case_id end,
    agent_user  = case when p ? 'agent_user' then nullif(p->>'agent_user', '')::uuid else agent_user end,
    listing_ref = case when p ? 'listing_ref' then nullif(btrim(p->>'listing_ref'), '') else listing_ref end,
    updated_at  = now()
  where id = p_id returning * into a;
  insert into public.eab_complaint_events (complaint_id, kind, body, from_status, to_status, by_user, by_email)
  values (p_id, case when a.status <> b.status then 'status' else 'updated' end, note,
          case when a.status <> b.status then b.status end, case when a.status <> b.status then a.status end, auth.uid(), public.eab_b7_me_email());
  perform public.eab_admin_write_action('complaint_updated', a.agent_user, a.ref, note, to_jsonb(b), to_jsonb(a), p_device);
  return public.eab_complaint_json(p_id);
end $$;

create or replace function public.eab_admin_complaint_note(p_id uuid, p_note text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.eab_complaints; note text;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  if nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'the note is empty' using errcode = '22023'; end if;
  note := left(btrim(p_note), 4000);
  select * into c from public.eab_complaints where id = p_id;
  if c.id is null then raise exception 'complaint not found' using errcode = 'P0002'; end if;
  insert into public.eab_complaint_events (complaint_id, kind, body, by_user, by_email) values (p_id, 'note', note, auth.uid(), public.eab_b7_me_email());
  perform public.eab_admin_write_action('complaint_note', c.agent_user, c.ref, 'note', null, jsonb_build_object('note', note), p_device);
  return public.eab_complaint_json(p_id);
end $$;

-- =====================================================================================================
-- feature 88 — Legal holds (list: owner, admin, compliance; place / release: owner, compliance)
-- =====================================================================================================
create or replace function public.eab_admin_holds(p_active boolean default true, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  select coalesce(jsonb_agg(to_jsonb(h) || jsonb_build_object('agent_email', u.email, 'agent_name', public.eab_admin_name(u),
           'case_no', (select c.case_no from public.eab_reg_cases c where c.id = h.case_id)) order by h.placed_at desc), '[]'::jsonb)
    into out
    from public.eab_legal_holds h join auth.users u on u.id = h.agent_user
   where not coalesce(p_active, true) or h.released_at is null;
  perform public.eab_admin_write_access('search', null, 'legal holds', jsonb_build_object('results', jsonb_array_length(out)), p_device);
  return out;
end $$;

create or replace function public.eab_admin_hold_place(p_agent uuid, p_reason text, p_case uuid default null, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare h public.eab_legal_holds; why text := public.eab_b7_reason(p_reason);
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  if not exists (select 1 from auth.users where id = p_agent) then raise exception 'agent not found' using errcode = '22023'; end if;
  if public.eab_agent_on_hold(p_agent) then raise exception 'this agent is already on legal hold' using errcode = '22023'; end if;
  insert into public.eab_legal_holds (agent_user, reason, case_id, placed_by, placed_by_email)
    values (p_agent, why, p_case, auth.uid(), public.eab_b7_me_email()) returning * into h;
  perform public.eab_admin_write_action('legal_hold_placed', p_agent, 'eab_legal_holds:' || h.id, why, null, to_jsonb(h), p_device);
  return to_jsonb(h);
end $$;

create or replace function public.eab_admin_hold_release(p_id uuid, p_reason text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.eab_legal_holds; a public.eab_legal_holds; why text := public.eab_b7_reason(p_reason);
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  select * into b from public.eab_legal_holds where id = p_id for update;
  if b.id is null then raise exception 'hold not found' using errcode = 'P0002'; end if;
  if b.released_at is not null then raise exception 'this hold was already released' using errcode = '22023'; end if;
  update public.eab_legal_holds set released_by = auth.uid(), released_by_email = public.eab_b7_me_email(), released_at = now(), release_reason = why
   where id = p_id returning * into a;
  perform public.eab_admin_write_action('legal_hold_released', a.agent_user, 'eab_legal_holds:' || a.id, why, to_jsonb(b), to_jsonb(a), p_device);
  return to_jsonb(a);
end $$;

-- a hold can only be released (once), never edited otherwise
create or replace function public.eab_legal_holds_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if old.released_at is not null or new.agent_user <> old.agent_user or new.reason <> old.reason or new.placed_at <> old.placed_at
     or new.placed_by <> old.placed_by or new.case_id is distinct from old.case_id or new.released_at is null then
    raise exception 'a legal hold can only be released, once' using errcode = '42501';
  end if;
  return new;
end $$;
create or replace trigger eab_legal_holds_guard before update on public.eab_legal_holds for each row execute function public.eab_legal_holds_guard();

-- =====================================================================================================
-- feature 82 — Licence expiry (owner, admin, compliance)
-- =====================================================================================================
create or replace function public.eab_admin_set_licence_expiry(p_user uuid, p_expires date, p_reason text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b jsonb; a jsonb; why text := public.eab_b7_reason(p_reason);
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  select to_jsonb(l) into b from public.eab_licences l where l.user_id = p_user;
  if b is null then raise exception 'this agent has not entered a licence number yet' using errcode = '22023'; end if;
  if p_expires is not null and (p_expires < date '2000-01-01' or p_expires > public.eab_dash_today() + 3650) then
    raise exception 'the expiry date does not look right' using errcode = '22023';
  end if;
  update public.eab_licences set expires_on = p_expires where user_id = p_user;
  select to_jsonb(l) into a from public.eab_licences l where l.user_id = p_user;
  perform public.eab_admin_write_action('licence_expiry_set', p_user, 'eab_licences', why, b, a, p_device);
  return a;
end $$;

create or replace function public.eab_admin_licence_expiry(p_within integer default 60, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare today date := public.eab_dash_today(); w integer := least(greatest(coalesce(p_within, 60), 1), 3650); out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  select jsonb_build_object('today', today, 'within', w,
    'counts', jsonb_build_object(
      'expired', (select count(*) from public.eab_licences l where l.expires_on < today),
      'in_7', (select count(*) from public.eab_licences l where l.expires_on between today and today + 7),
      'in_30', (select count(*) from public.eab_licences l where l.expires_on between today and today + 30),
      'in_60', (select count(*) from public.eab_licences l where l.expires_on between today and today + 60),
      'no_date', (select count(*) from public.eab_licences l where l.expires_on is null),
      'licences', (select count(*) from public.eab_licences)),
    'agents', (select coalesce(jsonb_agg(jsonb_build_object('user_id', l.user_id, 'email', u.email, 'name', public.eab_admin_name(u),
        'type', l.type, 'number', l.number, 'verified', l.verified, 'expires_on', l.expires_on,
        'days_left', case when l.expires_on is null then null else l.expires_on - today end)
        order by l.expires_on nulls last, u.email), '[]'::jsonb)
      from public.eab_licences l join auth.users u on u.id = l.user_id
      where l.expires_on is null or l.expires_on <= today + w)
  ) into out;
  perform public.eab_admin_write_access('search', null, 'licence expiry ' || w || ' days',
            jsonb_build_object('results', jsonb_array_length(out->'agents')), p_device);
  return out;
end $$;

-- =====================================================================================================
-- feature 94 — Internal tags and notes on agents (owner, admin, compliance)
-- =====================================================================================================
create or replace function public.eab_admin_agent_internal(p_user uuid, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  perform public.eab_admin_write_access('search', p_user, 'internal notes', null, p_device);
  return jsonb_build_object(
    'tags', (select coalesce(jsonb_agg(t.tag order by t.tag), '[]'::jsonb) from public.eab_agent_tags t where t.user_id = p_user),
    'notes', (select coalesce(jsonb_agg(to_jsonb(n) order by n.at desc, n.id desc), '[]'::jsonb) from public.eab_agent_notes n where n.user_id = p_user),
    'holds', (select coalesce(jsonb_agg(to_jsonb(h) order by h.placed_at desc), '[]'::jsonb) from public.eab_legal_holds h where h.agent_user = p_user),
    'on_hold', public.eab_agent_on_hold(p_user),
    'complaints', (select count(*) from public.eab_complaints c where c.agent_user = p_user),
    'complaints_active', (select count(*) from public.eab_complaints c where c.agent_user = p_user and c.status in ('open', 'investigating')),
    'pdpa', (select count(*) from public.eab_pdpa_requests r where r.agent_user = p_user),
    'licence_expires_on', (select l.expires_on from public.eab_licences l where l.user_id = p_user),
    'licence_number', (select l.number from public.eab_licences l where l.user_id = p_user));
end $$;

create or replace function public.eab_admin_agent_tag(p_user uuid, p_tag text, p_add boolean, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t text := lower(btrim(coalesce(p_tag, '')));
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  if t !~ '^[a-z0-9][a-z0-9 _-]{0,29}$' then raise exception 'a tag is 1-30 small letters, digits, space, dash or underscore' using errcode = '22023'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'agent not found' using errcode = '22023'; end if;
  if coalesce(p_add, true) then
    insert into public.eab_agent_tags (user_id, tag, added_by) values (p_user, t, auth.uid()) on conflict do nothing;
    perform public.eab_admin_write_action('agent_tag_added', p_user, t, 'tag', null, jsonb_build_object('tag', t), p_device);
  else
    delete from public.eab_agent_tags where user_id = p_user and tag = t;
    perform public.eab_admin_write_action('agent_tag_removed', p_user, t, 'tag', jsonb_build_object('tag', t), null, p_device);
  end if;
  return (select coalesce(jsonb_agg(x.tag order by x.tag), '[]'::jsonb) from public.eab_agent_tags x where x.user_id = p_user);
end $$;

create or replace function public.eab_admin_agent_note(p_user uuid, p_note text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n public.eab_agent_notes;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  if nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'the note is empty' using errcode = '22023'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'agent not found' using errcode = '22023'; end if;
  insert into public.eab_agent_notes (user_id, body, by_user, by_email) values (p_user, left(btrim(p_note), 4000), auth.uid(), public.eab_b7_me_email()) returning * into n;
  perform public.eab_admin_write_action('agent_note', p_user, 'eab_agent_notes:' || n.id, 'internal note', null, jsonb_build_object('note', n.body), p_device);
  return to_jsonb(n);
end $$;

create or replace function public.eab_admin_tag_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  return coalesce((select jsonb_agg(jsonb_build_object('tag', x.tag, 'agents', x.n) order by x.n desc, x.tag)
    from (select tag, count(*) n from public.eab_agent_tags group by tag) x), '[]'::jsonb);
end $$;

-- =====================================================================================================
-- feature 51 — Retention: what is older than 7 years (owner, compliance view; owner records a review).
-- NOTHING is deleted here. A delete step will be a separate, approved batch after the lawyer's answer.
-- =====================================================================================================
create or replace function public.eab_retention_counts(p_cutoff date) returns jsonb
language sql stable security definer set search_path = public as $$
  with cut as (select public.eab_dash_ts(p_cutoff) ts, (extract(epoch from public.eab_dash_ts(p_cutoff)) * 1000)::bigint ms)
  select jsonb_build_object(
    'records', (select count(*) from public.eab_records r, cut where r.updated < cut.ms),
    'records_on_hold', (select count(*) from public.eab_records r, cut where r.updated < cut.ms and public.eab_agent_on_hold(r.user_id)),
    'versions', (select count(*) from public.eab_record_revisions v, cut where v.saved_at < cut.ts),
    'sign_ins', (select count(*) from public.eab_login_log g, cut where g.happened_at < cut.ts),
    'problem_reports', (select count(*) from public.eab_bug_reports b, cut where b.created_at < cut.ts),
    'usage_days', (select count(*) from public.eab_usage_daily d where d.day < p_cutoff))
$$;

create or replace function public.eab_admin_retention(p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare today date := public.eab_dash_today(); cutoff date := (public.eab_dash_today() - interval '7 years')::date; ms bigint; out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  ms := (extract(epoch from public.eab_dash_ts(cutoff)) * 1000)::bigint;
  select jsonb_build_object('today', today, 'cutoff', cutoff, 'deletion_enabled', false,
    'counts', public.eab_retention_counts(cutoff),
    'next_year', public.eab_retention_counts(cutoff + 365),
    'agents', (select coalesce(jsonb_agg(jsonb_build_object('user_id', x.user_id, 'email', u.email, 'name', public.eab_admin_name(u),
        'records', x.n, 'oldest', to_timestamp(x.oldest / 1000.0), 'on_hold', public.eab_agent_on_hold(x.user_id)) order by x.oldest), '[]'::jsonb)
      from (select r.user_id, count(*) n, min(r.updated) oldest from public.eab_records r where r.updated < ms group by r.user_id order by min(r.updated) limit 200) x
      join auth.users u on u.id = x.user_id),
    'reviews', (select coalesce(jsonb_agg(to_jsonb(v) order by v.at desc), '[]'::jsonb) from (select * from public.eab_retention_reviews order by at desc limit 50) v)
  ) into out;
  perform public.eab_admin_write_access('search', null, 'retention review list', jsonb_build_object('results', jsonb_array_length(out->'agents')), p_device);
  return out;
end $$;

create or replace function public.eab_admin_retention_review(p_decision text, p_note text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cutoff date := (public.eab_dash_today() - interval '7 years')::date; r public.eab_retention_reviews; why text := public.eab_b7_reason(p_note);
begin
  perform public.eab_admin_guard(array['owner']);
  if p_decision not in ('keep', 'approve_later') then raise exception 'decision must be keep or approve_later' using errcode = '22023'; end if;
  insert into public.eab_retention_reviews (cutoff, counts, decision, note, by_user, by_email)
    values (cutoff, public.eab_retention_counts(cutoff), p_decision, why, auth.uid(), public.eab_b7_me_email()) returning * into r;
  perform public.eab_admin_write_action('retention_reviewed', null, 'eab_retention_reviews:' || r.id, why, null, to_jsonb(r), p_device);
  return to_jsonb(r);
end $$;

-- =====================================================================================================
-- feature 111 — Schedule a post (owner, admin). The main app shows a post only from its published_at time;
-- a push alert for it waits, and send-push skips it until it is due.
-- =====================================================================================================
create or replace function public.eab_admin_feed_schedule(p_item uuid, p_at timestamptz, p_reason text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b jsonb; a jsonb; why text := public.eab_b7_reason(p_reason);
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if p_at is null or p_at < now() - interval '1 minute' or p_at > now() + interval '366 days' then
    raise exception 'the publish time must be from now to one year ahead' using errcode = '22023';
  end if;
  select to_jsonb(i) into b from public.eab_feed_items i where i.id = p_item for update;
  if b is null then raise exception 'item not found' using errcode = 'P0002'; end if;
  if (b->>'expires_at') is not null and (b->>'expires_at')::timestamptz <= p_at then raise exception 'the post would end before it starts' using errcode = '22023'; end if;
  update public.eab_feed_items set status = 'published', published_at = p_at, updated_at = now() where id = p_item;
  select to_jsonb(i) into a from public.eab_feed_items i where i.id = p_item;
  perform public.eab_admin_write_action('feed_scheduled', null, 'eab_feed_items:' || p_item, why, b, a, p_device);
  return a;
end $$;

-- =====================================================================================================
-- Master Dashboard (AdminBatch006) gets the new numbers: licences expired / expiring, PDPA requests (21-day rule:
-- "due soon" = open 14+ days), complaints, legal holds. Same name and arguments; all earlier keys unchanged.
-- =====================================================================================================
create or replace function public.eab_admin_dash_master() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare today date := public.eab_dash_today(); lim public.eab_health_limits; s public.eab_settings;
        dbb bigint; sb bigint; last_pass date; out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  select * into lim from public.eab_health_limits where id;
  select * into s from public.eab_settings where id;
  dbb := pg_database_size(current_database());
  select coalesce(sum((o.metadata->>'size')::bigint), 0) into sb from storage.objects o;
  select max(t.tested_on) into last_pass from public.eab_backup_tests t where t.kind = 'restore_test' and t.result = 'pass';
  with a as (select * from public.eab_dash_activity(today - 89, today)),
  per as (select a.user_id, max(a.day) last_day, count(*) filter (where a.day > today - 30) recent,
                 count(*) filter (where a.day between today - 59 and today - 30) prev from a group by a.user_id)
  select jsonb_build_object(
    'checked_at', now(), 'today', today,
    'agents', (select count(*) from auth.users u where u.deleted_at is null),
    'new_7d', (select count(*) from auth.users u where (u.created_at at time zone 'Asia/Kuala_Lumpur')::date > today - 7),
    'active_today', (select count(distinct a.user_id) from a where a.day = today),
    'active_7d', (select count(distinct a.user_id) from a where a.day > today - 7),
    'active_30d', (select count(distinct a.user_id) from a where a.day > today - 30),
    'at_risk', (select count(*) from per p where p.last_day <= today - 14 or (p.prev >= 2 and p.recent < p.prev / 2.0)),
    'live_now', (select count(distinct e.user_id) from public.eab_usage_events e where e.at > now() - interval '5 minutes'),
    'listings', (select count(*) from public.eab_records r where r.collection = 'properties' and not r.deleted),
    'stale', (select count(*) from public.eab_records r where r.collection = 'properties' and not r.deleted
               and public.eab_dash_status_key(r.data) = 'available' and r.updated < (extract(epoch from now() - interval '60 days') * 1000)::bigint),
    'closed_30d', (select count(*) from public.eab_records r where r.collection = 'properties' and not r.deleted
               and public.eab_dash_status_key(r.data) in ('sold', 'rented') and r.updated >= (extract(epoch from now() - interval '30 days') * 1000)::bigint),
    'db_bytes', dbb, 'db_limit_bytes', lim.db_limit_mb::bigint * 1048576,
    'files_bytes', sb, 'files_limit_bytes', lim.storage_limit_mb::bigint * 1048576,
    'aws_backup', lim.aws_backup, 'last_restore_pass', last_pass,
    'sync_runs_7d', (select count(*) from public.eab_usage_events e where e.kind = 'sync' and e.name = 'sync.run' and e.at > now() - interval '7 days'),
    'sync_fails_7d', (select count(*) from public.eab_usage_events e where e.kind = 'sync' and e.name = 'sync.run' and not e.ok and e.at > now() - interval '7 days'),
    'tickets_new', (select count(*) from public.eab_bug_reports r where r.status = 'new'),
    'tickets_open', (select count(*) from public.eab_bug_reports r where r.status in ('new', 'seen')),
    'pushes_waiting', (select count(*) from public.eab_push_broadcasts b where b.status = 'queued'),
    'posts_live', (select count(*) from public.eab_feed_items i where i.status = 'published' and (i.expires_at is null or i.expires_at > now())),
    'maintenance_on', coalesce(s.maintenance_on, false), 'maintenance_back_at', s.maintenance_back_at,
    'min_version', s.min_version, 'min_version_mode', s.min_version_mode,
    'flags_on', (select count(*) from public.eab_feature_flags f where f.enabled),
    'licences_unverified', (select count(*) from public.eab_licences l where not coalesce(l.verified, false)),
    'accounts_not_active', (select count(*) from public.eab_account_status st where st.status <> 'active'),
    'licences_expired', (select count(*) from public.eab_licences l where l.expires_on < today),
    'licences_expiring_30', (select count(*) from public.eab_licences l where l.expires_on between today and today + 30),
    'pdpa_active', (select count(*) from public.eab_pdpa_requests r where r.status in ('open', 'in_progress')),
    'pdpa_due_soon', (select count(*) from public.eab_pdpa_requests r where r.status in ('open', 'in_progress') and r.received_on <= today - 14),
    'complaints_active', (select count(*) from public.eab_complaints c where c.status in ('open', 'investigating')),
    'holds_active', (select count(*) from public.eab_legal_holds h where h.released_at is null),
    'active_by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'agents', d.n) order by d.day), '[]'::jsonb)
       from (select g::date as day, (select count(distinct a.user_id) from a where a.day = g::date) n
               from generate_series(today - 13, today, interval '1 day') g) d)
  ) into out;
  return out;
end $$;


-- =====================================================================================================
-- permissions
-- =====================================================================================================
revoke all on function public.eab_b7_fixed(), public.eab_b7_no_delete(), public.eab_agent_on_hold(uuid), public.eab_records_hold_guard(),
  public.eab_legal_holds_guard(), public.eab_b7_reason(text), public.eab_b7_me_email(), public.eab_pdpa_json(uuid), public.eab_complaint_json(uuid),
  public.eab_retention_counts(date) from public, anon, authenticated;
revoke all on function public.eab_admin_pdpa_list(text, text), public.eab_admin_pdpa_get(uuid, text), public.eab_admin_pdpa_create(jsonb, text),
  public.eab_admin_pdpa_update(uuid, jsonb, text, text), public.eab_admin_pdpa_note(uuid, text, text),
  public.eab_admin_complaints(text, uuid, text), public.eab_admin_complaint_get(uuid, text), public.eab_admin_complaint_create(jsonb, text),
  public.eab_admin_complaint_update(uuid, jsonb, text, text), public.eab_admin_complaint_note(uuid, text, text),
  public.eab_admin_holds(boolean, text), public.eab_admin_hold_place(uuid, text, uuid, text), public.eab_admin_hold_release(uuid, text, text),
  public.eab_admin_set_licence_expiry(uuid, date, text, text), public.eab_admin_licence_expiry(integer, text),
  public.eab_admin_agent_internal(uuid, text), public.eab_admin_agent_tag(uuid, text, boolean, text), public.eab_admin_agent_note(uuid, text, text),
  public.eab_admin_tag_list(), public.eab_admin_retention(text), public.eab_admin_retention_review(text, text, text),
  public.eab_admin_feed_schedule(uuid, timestamptz, text, text) from public, anon;
grant execute on function public.eab_admin_pdpa_list(text, text), public.eab_admin_pdpa_get(uuid, text), public.eab_admin_pdpa_create(jsonb, text),
  public.eab_admin_pdpa_update(uuid, jsonb, text, text), public.eab_admin_pdpa_note(uuid, text, text),
  public.eab_admin_complaints(text, uuid, text), public.eab_admin_complaint_get(uuid, text), public.eab_admin_complaint_create(jsonb, text),
  public.eab_admin_complaint_update(uuid, jsonb, text, text), public.eab_admin_complaint_note(uuid, text, text),
  public.eab_admin_holds(boolean, text), public.eab_admin_hold_place(uuid, text, uuid, text), public.eab_admin_hold_release(uuid, text, text),
  public.eab_admin_set_licence_expiry(uuid, date, text, text), public.eab_admin_licence_expiry(integer, text),
  public.eab_admin_agent_internal(uuid, text), public.eab_admin_agent_tag(uuid, text, boolean, text), public.eab_admin_agent_note(uuid, text, text),
  public.eab_admin_tag_list(), public.eab_admin_retention(text), public.eab_admin_retention_review(text, text, text),
  public.eab_admin_feed_schedule(uuid, timestamptz, text, text) to authenticated;
