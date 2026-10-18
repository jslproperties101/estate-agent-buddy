-- Undo Change 25: no more phone notifications while the app is closed. The app keeps working without them.
drop function if exists public.eab_push_register(text, text, text);
drop function if exists public.eab_push_unregister(text);
drop function if exists public.eab_push_claim(uuid, text, uuid);
drop function if exists public.eab_push_drop(text);
drop table if exists public.eab_push_tokens;
alter table public.eab_team_invites drop column if exists pushed_at;
alter table public.eab_team_invites drop column if exists answer_pushed_at;
