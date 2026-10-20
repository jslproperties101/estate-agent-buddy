-- Rollback for 20261021130000_admin_batch_003_cases.sql. TEST PROJECT ONLY.
-- WARNING: removes all case files and the vault records. Vault FILES must be removed from the 'eab-vault' bucket in
-- the dashboard first (storage keeps them otherwise). Never run on production once real cases exist.
drop policy if exists "eab vault upload" on storage.objects;
drop policy if exists "eab vault read" on storage.objects;
drop function if exists public.eab_vault_can_upload(text);
drop function if exists public.eab_vault_can_read(text);
drop function if exists public.eab_admin_check_file(text, text);
drop function if exists public.eab_admin_pack_download(uuid, text);
drop function if exists public.eab_admin_vault(uuid, uuid, integer, text);
drop function if exists public.eab_admin_pack_stored(uuid);
drop function if exists public.eab_admin_pack_register(jsonb, text);
drop function if exists public.eab_admin_case(uuid, text);
drop function if exists public.eab_admin_cases(text, text, text);
drop function if exists public.eab_admin_case_revoke(uuid, uuid, text, text);
drop function if exists public.eab_admin_case_grant(uuid, text, timestamptz, text, text);
drop function if exists public.eab_admin_case_remove_agent(uuid, uuid, text, text);
drop function if exists public.eab_admin_case_add_agent(uuid, uuid, date, date, text, text);
drop function if exists public.eab_admin_case_update(uuid, jsonb, text, text);
drop function if exists public.eab_admin_case_create(jsonb, text);
drop function if exists public.eab_admin_case_json(uuid);
drop function if exists public.eab_admin_can_see_case(uuid);
-- scopes created for cases end now; the column goes
update public.eab_admin_scopes set expires_at = least(expires_at, now()) where case_id is not null;
alter table public.eab_admin_scopes drop column if exists case_id;
drop table if exists public.eab_reg_packs;          -- triggers go with the tables
drop table if exists public.eab_reg_case_agents;
drop table if exists public.eab_reg_cases;
drop function if exists public.eab_reg_no_delete();
drop function if exists public.eab_reg_pack_fixed();
drop sequence if exists public.eab_reg_case_seq;
alter table public.eab_admin_access drop constraint if exists eab_admin_access_kind_check;
alter table public.eab_admin_access add constraint eab_admin_access_kind_check check (kind in ('sign_in', 'search', 'view_agent',
  'view_records', 'view_history', 'view_actions', 'view_access', 'verify_chain', 'export', 'view_login_log', 'view_terms_log'));
-- (fails if case-view entries were already logged: the access log can never be cleaned, by design)
