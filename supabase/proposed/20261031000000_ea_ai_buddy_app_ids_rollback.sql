-- Rollback for 20261031000000_ea_ai_buddy_app_ids.sql: removes the push sign-ups of the new EA AI Buddy packages and puts
-- back the original check (old package names only). Safe to run more than once.
begin;
delete from public.eab_push_tokens where app_id in ('com.jslproperties.eaaibuddy', 'com.jslproperties.eaaibuddy.qa');
alter table public.eab_push_tokens drop constraint if exists eab_push_tokens_app_id_check;
alter table public.eab_push_tokens add constraint eab_push_tokens_app_id_check check (app_id in (
  'com.jslproperties.estateagentbuddy', 'com.jslproperties.estateagentbuddy.qa'));
commit;
