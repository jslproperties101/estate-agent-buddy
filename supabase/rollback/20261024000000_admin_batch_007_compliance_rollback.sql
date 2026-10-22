-- Rollback for 20261024000000_admin_batch_007_compliance.sql. TEST PROJECT ONLY.
-- WARNING: removes PDPA requests, complaints, legal holds, agent tags and notes, retention reviews and every step of their
-- history, and the licence expiry dates. Never run where real requests, complaints or holds have been recorded.
-- The Master Dashboard function is put back to its AdminBatch006 version by re-running that part of
-- 20261023100000_admin_batch_006_ops.sql (eab_admin_dash_master) afterwards.
drop trigger if exists eab_records_hold_guard on public.eab_records;
drop function if exists public.eab_records_hold_guard();
drop function if exists public.eab_admin_feed_schedule(uuid, timestamptz, text, text);
drop function if exists public.eab_admin_retention_review(text, text, text);
drop function if exists public.eab_admin_retention(text);
drop function if exists public.eab_retention_counts(date);
drop function if exists public.eab_admin_tag_list();
drop function if exists public.eab_admin_agent_note(uuid, text, text);
drop function if exists public.eab_admin_agent_tag(uuid, text, boolean, text);
drop function if exists public.eab_admin_agent_internal(uuid, text);
drop function if exists public.eab_admin_licence_expiry(integer, text);
drop function if exists public.eab_admin_set_licence_expiry(uuid, date, text, text);
drop function if exists public.eab_admin_hold_release(uuid, text, text);
drop function if exists public.eab_admin_hold_place(uuid, text, uuid, text);
drop function if exists public.eab_admin_holds(boolean, text);
drop function if exists public.eab_admin_complaint_note(uuid, text, text);
drop function if exists public.eab_admin_complaint_update(uuid, jsonb, text, text);
drop function if exists public.eab_admin_complaint_create(jsonb, text);
drop function if exists public.eab_admin_complaint_get(uuid, text);
drop function if exists public.eab_admin_complaints(text, uuid, text);
drop function if exists public.eab_complaint_json(uuid);
drop function if exists public.eab_admin_pdpa_note(uuid, text, text);
drop function if exists public.eab_admin_pdpa_update(uuid, jsonb, text, text);
drop function if exists public.eab_admin_pdpa_create(jsonb, text);
drop function if exists public.eab_admin_pdpa_get(uuid, text);
drop function if exists public.eab_admin_pdpa_list(text, text);
drop function if exists public.eab_pdpa_json(uuid);
drop table if exists public.eab_retention_reviews;
drop table if exists public.eab_agent_notes;
drop table if exists public.eab_agent_tags;
drop table if exists public.eab_legal_holds;
drop table if exists public.eab_complaint_events;
drop table if exists public.eab_complaints;
drop table if exists public.eab_pdpa_events;
drop table if exists public.eab_pdpa_requests;
drop sequence if exists public.eab_complaint_seq;
drop sequence if exists public.eab_pdpa_seq;
drop function if exists public.eab_legal_holds_guard();
drop function if exists public.eab_agent_on_hold(uuid);
drop function if exists public.eab_b7_me_email();
drop function if exists public.eab_b7_reason(text);
drop function if exists public.eab_b7_no_delete();
drop function if exists public.eab_b7_fixed();
alter table public.eab_licences drop column if exists expires_on;
