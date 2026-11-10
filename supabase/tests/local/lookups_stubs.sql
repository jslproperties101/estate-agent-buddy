-- Local test only (plain PostgreSQL 16): what the Batch C and D lookup / token files need on top of agency_stubs.sql.
-- Never run this on a Supabase project. Run: supabase/tests/local/run-lookups.sh
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), nullif(current_setting('request.jwt.claims', true)::json->>'sub', ''))::uuid $$;
grant usage on schema public to authenticated;
grant execute on function auth.uid() to authenticated;
create table if not exists public.eab_admin_access (seq bigserial, kind text, target_user uuid, target_ref text, detail jsonb, admin_user uuid);
create or replace function public.eab_admin_write_access(p_kind text, p_target uuid, p_ref text, p_detail jsonb, p_device text)
returns void language sql security definer set search_path = public as $$
  insert into public.eab_admin_access (kind, target_user, target_ref, detail, admin_user) values (p_kind, p_target, p_ref, p_detail, auth.uid()) $$;
insert into auth.users (id, email, created_at) values ('00000000-0000-4000-8000-000000000005', 'viewer@test.local', now()) on conflict do nothing;
