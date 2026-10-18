-- Change 25 (JoyChange002): a phone notification for a Team Workspace invitation, and for its answer, even when the app
-- is closed. Google's Firebase Cloud Messaging (FCM) delivers it; the Edge Function supabase/functions/notify-invite sends it.
--
--  1. eab_push_tokens: each phone's FCM address ("token"), kept per signed-in person. Nobody can read or change it through
--     the API; the phone can only add or remove its OWN token with eab_push_register / eab_push_unregister.
--  2. eab_push_claim: used ONLY by the Edge Function (service role). After the sender's phone has created the invitation
--     (or the other agent's phone has answered it), the function asks this database which phones to tell. The database
--     checks that the caller really is the sender (or the person who answered), that it is recent, and that nobody was told
--     yet (each invitation and each answer is announced once). No message text, invitation link or token leaves the database
--     except the FCM addresses of the one person to tell and a display name.
--  3. eab_push_drop: the function removes an FCM address Google says no longer exists (the app was uninstalled).
--
-- Apply AFTER 20261016000000_change010_team_sharing_audit.sql. Safe to run twice. Undo: 20261018210000_change025_rollback.sql

create table if not exists public.eab_push_tokens (
  token       text primary key check (length(token) between 20 and 4096),
  user_id     uuid not null references auth.users (id) on delete cascade,
  platform    text not null default 'android' check (platform in ('android', 'ios')),
  lang        text not null default 'en' check (lang in ('en', 'bm', 'zh')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists eab_push_tokens_user on public.eab_push_tokens (user_id);
alter table public.eab_push_tokens enable row level security;            -- no policies: unreadable through the API
revoke all on public.eab_push_tokens from public, anon, authenticated;

alter table public.eab_team_invites add column if not exists pushed_at timestamptz;          -- the invitation was announced
alter table public.eab_team_invites add column if not exists answer_pushed_at timestamptz;   -- its answer was announced

-- The phone registers its own FCM address (again after Google changes it). A token moves to whoever signs in on that phone.
create or replace function public.eab_push_register(p_token text, p_platform text default 'android', p_lang text default 'en') returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_token is null or length(p_token) not between 20 and 4096 or p_token !~ '^[A-Za-z0-9_:\-\.]+$' then raise exception 'invalid token' using errcode = '22023'; end if;
  if p_platform not in ('android', 'ios') then raise exception 'invalid platform' using errcode = '22023'; end if;
  insert into public.eab_push_tokens (token, user_id, platform, lang) values (p_token, uid, p_platform, coalesce(nullif(p_lang, ''), 'en'))
    on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, lang = excluded.lang, updated_at = now();
  -- at most 10 phones per person: the oldest addresses go
  delete from public.eab_push_tokens where user_id = uid and token in (
    select token from public.eab_push_tokens where user_id = uid order by updated_at desc offset 10);
end $$;

-- Signing out removes this phone's address, so it is not told about the next person's invitations.
create or replace function public.eab_push_unregister(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  delete from public.eab_push_tokens where token = p_token and user_id = auth.uid();
end $$;

-- Service role only (the Edge Function). p_kind 'invite': p_caller must be the sender of a waiting invitation made in the
-- last 15 minutes that names a Google email. p_kind 'answer': p_caller must be the person who accepted or declined it in
-- the last 15 minutes. Marks it announced and returns where to send (empty when there is nothing to send).
create or replace function public.eab_push_claim(p_invite uuid, p_kind text, p_caller uuid)
returns table (token text, lang text, kind text, who text)
language plpgsql security definer set search_path = public as $$
declare inv public.eab_team_invites; target uuid; nm text;
begin
  select * into inv from public.eab_team_invites where id = p_invite for update;
  if not found then return; end if;
  if p_kind = 'invite' then
    if inv.invited_by <> p_caller or inv.status <> 'pending' or inv.expires_at <= now() or inv.email is null
       or inv.pushed_at is not null or inv.created_at < now() - interval '15 minutes' then return; end if;
    select u.id into target from auth.users u where lower(u.email) = inv.email limit 1;
    select coalesce(m.name, m.email) into nm from public.eab_team_members m where m.team_id = inv.team_id and m.user_id = inv.invited_by;
    update public.eab_team_invites set pushed_at = now() where id = inv.id;
    if target is null then return; end if;                -- that person has never signed in: nothing to send
    return query select t.token, t.lang, 'invite'::text, coalesce(nm, '') from public.eab_push_tokens t where t.user_id = target;
  elsif p_kind = 'answer' then
    if inv.responded_by is distinct from p_caller or inv.status not in ('accepted', 'declined') or inv.answer_pushed_at is not null
       or inv.responded_at < now() - interval '15 minutes' then return; end if;
    select coalesce(m.name, m.email) into nm from public.eab_team_members m where m.team_id = inv.team_id and m.user_id = p_caller;
    update public.eab_team_invites set answer_pushed_at = now() where id = inv.id;
    return query select t.token, t.lang, inv.status, coalesce(nm, inv.email, '') from public.eab_push_tokens t where t.user_id = inv.invited_by;
  end if;
end $$;

create or replace function public.eab_push_drop(p_token text) returns void
language sql security definer set search_path = public as $$ delete from public.eab_push_tokens where token = p_token $$;

revoke all on function public.eab_push_register(text, text, text), public.eab_push_unregister(text),
  public.eab_push_claim(uuid, text, uuid), public.eab_push_drop(text) from public, anon, authenticated;
grant execute on function public.eab_push_register(text, text, text), public.eab_push_unregister(text) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.eab_push_claim(uuid, text, uuid), public.eab_push_drop(text) to service_role;
  end if;
end $$;
