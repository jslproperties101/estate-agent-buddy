-- EA AI Buddy rename (31 Oct 2026): the app's Android package changes from com.jslproperties.estateagentbuddy to
-- com.jslproperties.eaaibuddy (QA: com.jslproperties.eaaibuddy.qa). Push alert sign-ups (eab_push_register) store the
-- package in eab_push_tokens.app_id, whose check only allowed the two old names, so a phone running the new APK could not
-- register for push alerts. This widens the check to the old AND new names (older APKs keep working).
-- PROPOSED: run on the TEST Supabase project first; never on production without the owner's approval.
-- Safe to run more than once. Rollback: 20261031000000_ea_ai_buddy_app_ids_rollback.sql
begin;
alter table public.eab_push_tokens drop constraint if exists eab_push_tokens_app_id_check;
alter table public.eab_push_tokens add constraint eab_push_tokens_app_id_check check (app_id in (
  'com.jslproperties.estateagentbuddy', 'com.jslproperties.estateagentbuddy.qa',
  'com.jslproperties.eaaibuddy', 'com.jslproperties.eaaibuddy.qa'));
commit;
