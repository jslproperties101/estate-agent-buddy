-- Undoes 20261019000000_joychange002_push.sql. The app keeps working without it (push simply stops; the invitation
-- pop-up still appears while the app is open).
drop function if exists public.eab_push_register(text, text, text, text);
drop function if exists public.eab_push_unregister(text);
drop table if exists public.eab_push_sent;
drop table if exists public.eab_push_tokens;
