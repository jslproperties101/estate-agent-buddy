-- Local test only (plain PostgreSQL 16): the smallest stand-in for the Supabase and EAB pieces that
-- 20261028000000_billing_sandbox.sql and 20261110100000_agency_licences.sql use. Never run this on a Supabase project.
-- Run: supabase/tests/local/run-agency.sh
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create schema auth;
grant usage on schema auth to authenticated, anon, service_role;
create table auth.users (id uuid primary key, email text, created_at timestamptz not null default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.eab_workspaces (id uuid primary key default gen_random_uuid(), name text not null, created_by uuid, created_at timestamptz not null default now());
create table public.eab_members (
  workspace_id uuid not null references public.eab_workspaces (id) on delete restrict, user_id uuid not null references auth.users (id),
  email text not null, role text not null check (role in ('owner', 'admin', 'team_leader', 'agent', 'limited')),
  active boolean not null default true, created_at timestamptz not null default now(), primary key (workspace_id, user_id));
create table public.eab_admins (user_id uuid primary key references auth.users (id), email text not null,
  role text not null check (role in ('owner', 'admin', 'compliance', 'viewer')), active boolean not null default true, expires_at timestamptz);
create table public.eab_admin_actions (seq bigserial, action text, ref text, reason text, before jsonb, after jsonb, admin_user uuid);
create function public.eab_admin_guard(p_roles text[]) returns text language plpgsql stable security definer set search_path = public as $$
declare r text;
begin
  select role into r from public.eab_admins where user_id = auth.uid() and active and (expires_at is null or expires_at > now());
  if r is null or not (r = any (p_roles)) then raise exception 'not allowed' using errcode = '42501'; end if;
  return r;
end $$;
create function public.eab_admin_write_action(p_action text, p_target uuid, p_ref text, p_reason text, p_before jsonb, p_after jsonb, p_device text)
returns void language sql security definer set search_path = public as $$
  insert into public.eab_admin_actions (action, ref, reason, before, after, admin_user) values (p_action, p_ref, p_reason, p_before, p_after, auth.uid()) $$;
-- from 20261109100000_batch5_news_gate_play_events.sql (only the switches table)
create table public.eab_billing_settings (id boolean primary key default true check (id), news_paid boolean not null default false,
  live boolean not null default false, updated_at timestamptz not null default now(), updated_by uuid);
insert into public.eab_billing_settings (id) values (true);
-- test users
insert into auth.users (id, email, created_at) values
  ('00000000-0000-4000-8000-000000000001', 'owner@test.local', now() - interval '4 days'),
  ('00000000-0000-4000-8000-000000000002', 'agent@test.local', now() - interval '3 days'),
  ('00000000-0000-4000-8000-000000000003', 'outsider@test.local', now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000004', 'limited@test.local', now() - interval '1 day');
