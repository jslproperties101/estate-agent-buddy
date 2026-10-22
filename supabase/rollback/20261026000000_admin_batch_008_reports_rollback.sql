-- Rollback for 20261026000000_admin_batch_008_reports.sql. TEST PROJECT ONLY.
-- WARNING: removes every saved report. Board-report and audit-bundle files already kept in the Document Vault stay
-- there; the Vault's list of kinds is only narrowed back when none of those files exist (otherwise it is left as is).
drop function if exists public.eab_admin_audit_bundle(integer, text);
drop function if exists public.eab_admin_board_report(date, text);
drop function if exists public.eab_board_numbers(date, date);
drop function if exists public.eab_admin_saved_report_delete(uuid, text);
drop function if exists public.eab_admin_saved_report_save(jsonb, text);
drop function if exists public.eab_admin_saved_reports();
drop function if exists public.eab_admin_report_run(jsonb, text);
drop function if exists public.eab_admin_report_catalog();
drop function if exists public.eab_report_sql(jsonb, text);
drop function if exists public.eab_report_base(text);
drop function if exists public.eab_report_catalog();
drop table if exists public.eab_saved_reports;
do $$ begin
  if not exists (select 1 from public.eab_reg_packs where kind in ('board_report', 'audit_bundle')) then
    alter table public.eab_reg_packs drop constraint if exists eab_reg_packs_kind_check;
    alter table public.eab_reg_packs add constraint eab_reg_packs_kind_check check (kind in ('case_pack', 'agent_profile', 'pdpa_access'));
  end if;
end $$;
