-- JoyChange002 Change 25: push notifications for Team Workspace invitations, so they reach the phone when the app is closed.
--
-- eab_push_tokens  one row per phone: its Firebase Cloud Messaging address (token), whose phone it is, which app (real or
--                  QA) and the language the app was in. Nobody reads or writes it directly: the app registers and removes
--                  its own phone through the two functions below; only the send-push Edge Function (service role) reads it.
-- eab_push_sent    which invitation messages were already sent, so one invitation (or one answer) is pushed only once,
--                  however often the function is called.
-- Safe to run more than once.

create table if not exists public.eab_push_tokens (
  token       text primary key check (length(token) between 20 and 4096),
  user_id     uuid not null references auth.users (id) on delete cascade,
  email       text not null default '',
  app_id      text not null check (app_id in ('com.jslproperties.estateagentbuddy', 'com.jslproperties.estateagentbuddy.qa')),
  platform    text not null default 'android' check (platform in ('android', 'ios')),
  lang        text not null default 'en' check (lang in ('en', 'bm', 'zh')),
  updated_at  timestamptz not null default now()
);
create index if not exists eab_push_tokens_user on public.eab_push_tokens (user_id);
create index if not exists eab_push_tokens_email on public.eab_push_tokens (email);
alter table public.eab_push_tokens enable row level security;
revoke all on public.eab_push_tokens from anon, authenticated;

create table if not exists public.eab_push_sent (
  invite_id  uuid not null references public.eab_team_invites (id) on delete cascade,
  kind       text not null check (kind in ('invite', 'answer')),
  sent_at    timestamptz not null default now(),
  primary key (invite_id, kind)
);
alter table public.eab_push_sent enable row level security;
revoke all on public.eab_push_sent from anon, authenticated;

-- The signed-in person's phone says "send my notifications here". A phone that was signed in as someone else before
-- moves to the new person (one phone, one person). At most 10 phones per person are kept (the newest).
create or replace function public.eab_push_register(p_token text, p_app text, p_platform text default 'android', p_lang text default 'en')
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if not public.eab_account_ok(uid) then raise exception 'account disabled' using errcode = '42501'; end if;
  insert into public.eab_push_tokens (token, user_id, email, app_id, platform, lang, updated_at)
    values (p_token, uid, em, p_app, coalesce(p_platform, 'android'), case when p_lang in ('en', 'bm', 'zh') then p_lang else 'en' end, now())
    on conflict (token) do update set user_id = excluded.user_id, email = excluded.email, app_id = excluded.app_id,
      platform = excluded.platform, lang = excluded.lang, updated_at = now();
  delete from public.eab_push_tokens where user_id = uid and token in (
    select token from public.eab_push_tokens where user_id = uid order by updated_at desc offset 10);
end $$;

-- Signing out of a phone stops its notifications (only one's own phone can be removed).
create or replace function public.eab_push_unregister(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  delete from public.eab_push_tokens where token = p_token and user_id = auth.uid();
end $$;

revoke all on function public.eab_push_register(text, text, text, text) from public, anon;
revoke all on function public.eab_push_unregister(text) from public, anon;
grant execute on function public.eab_push_register(text, text, text, text) to authenticated;
grant execute on function public.eab_push_unregister(text) to authenticated;
