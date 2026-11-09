-- Batch 7 (9 Nov 2026), AI Buddy POS go-live basics: document numbers given out by the server. PROPOSED: run on the TEST
-- Supabase project (EAB-QA-Test) first; never on production without the owner's approval. Safe to run more than once.
-- Rollback: 20261109200000_buddy_pos_numbering_rollback.sql
--
-- In plain words. Journal (JV), invoice (INV) and POS receipt (POS) numbers must never repeat in a business. Until now each
-- phone counted on its own, so two phones offline could both issue INV-0007. The business (workspace) now chooses one of
-- three ways (Joe, 9 Nov 2026: all three, chosen per business; the owner or an admin changes it):
--   device  (default) each phone gets its own letter once, from the server: INV-A-0001 on one phone, INV-B-0001 on another.
--           Works offline after the first time; never repeats.
--   blocks  the server hands a phone 50 numbers at a time from one series (INV-0001 ...). Works offline while the phone has
--           numbers left; never repeats; numbers can come out of date order between phones.
--   server  one series, one number at a time, given when the entry is posted. Needs internet to post.
-- Every hand-out is written down (who, which phone, which numbers), so a gap can always be explained.
begin;

create table if not exists public.eab_acct_numbering (
  workspace_id uuid primary key,
  mode         text not null default 'device' check (mode in ('device', 'blocks', 'server')),
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);
create table if not exists public.eab_acct_letters (
  workspace_id uuid not null,
  device_id    text not null check (device_id ~ '^[A-Za-z0-9_-]{6,64}$'),
  letter       text not null check (letter ~ '^[A-Z]{1,3}$'),
  assigned_at  timestamptz not null default now(),
  assigned_by  uuid,
  primary key (workspace_id, device_id),
  unique (workspace_id, letter)
);
create table if not exists public.eab_acct_counters (
  workspace_id uuid not null,
  series       text not null check (series in ('JV', 'INV', 'POS')),
  next_no      bigint not null default 1 check (next_no >= 1),
  primary key (workspace_id, series)
);
create table if not exists public.eab_acct_blocks (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null,
  series       text not null check (series in ('JV', 'INV', 'POS')),
  from_no      bigint not null check (from_no >= 1),
  to_no        bigint not null,
  mode         text not null check (mode in ('blocks', 'server')),
  device_id    text,
  user_id      uuid,
  at           timestamptz not null default now(),
  check (to_no >= from_no)
);
create index if not exists eab_acct_blocks_ws_idx on public.eab_acct_blocks (workspace_id, series, from_no);
alter table public.eab_acct_numbering enable row level security;
alter table public.eab_acct_letters enable row level security;
alter table public.eab_acct_counters enable row level security;
alter table public.eab_acct_blocks enable row level security;
revoke all on public.eab_acct_numbering, public.eab_acct_letters, public.eab_acct_counters, public.eab_acct_blocks from public, anon, authenticated;

-- A, B, ..., Z, AA, AB, ... (bijective base 26); n starts at 1.
create or replace function public.eab_acct_letter_of(n integer) returns text language plpgsql immutable set search_path = pg_catalog as $$
declare s text := ''; k integer := n;
begin
  if k < 1 then raise exception 'bad letter index'; end if;
  while k > 0 loop k := k - 1; s := chr(65 + (k % 26)) || s; k := k / 26; end loop;
  return s;
end $$;

-- Who may take numbers: anyone who may add records to this workspace.
create or replace function public.eab_acct_can_post(ws uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.eab_role_in(ws) in ('owner', 'admin', 'team_leader', 'agent'), false)
$$;
revoke all on function public.eab_acct_can_post(uuid) from public, anon, authenticated;

/** The business's way of numbering and, in device mode, this phone's letter (given now if it has none). */
create or replace function public.eab_acct_numbering_get(ws uuid, p_device text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m text; l text; n integer;
begin
  if not public.eab_acct_can_post(ws) then raise exception 'not allowed' using errcode = '42501'; end if;
  select mode into m from public.eab_acct_numbering where workspace_id = ws;
  m := coalesce(m, 'device');
  if m = 'device' then
    if p_device is null or p_device !~ '^[A-Za-z0-9_-]{6,64}$' then raise exception 'bad device id' using errcode = '22023'; end if;
    select letter into l from public.eab_acct_letters where workspace_id = ws and device_id = p_device;
    if l is null then
      perform pg_advisory_xact_lock(hashtext('eab_acct_letters'), hashtext(ws::text));
      select letter into l from public.eab_acct_letters where workspace_id = ws and device_id = p_device;
      if l is null then
        select count(*) + 1 into n from public.eab_acct_letters where workspace_id = ws;
        l := public.eab_acct_letter_of(n);
        while exists (select 1 from public.eab_acct_letters where workspace_id = ws and letter = l) loop n := n + 1; l := public.eab_acct_letter_of(n); end loop;
        insert into public.eab_acct_letters (workspace_id, device_id, letter, assigned_by) values (ws, p_device, l, auth.uid());
      end if;
    end if;
  end if;
  return jsonb_build_object('mode', m, 'letter', l);
end $$;
revoke all on function public.eab_acct_numbering_get(uuid, text) from public, anon;
grant execute on function public.eab_acct_numbering_get(uuid, text) to authenticated;

/** Owner or admin only. Changing the way applies to entries posted from now on; numbers already given stay. */
create or replace function public.eab_acct_numbering_set(ws uuid, p_mode text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.eab_role_in(ws), '') not in ('owner', 'admin') then raise exception 'only the owner or an admin can change numbering' using errcode = '42501'; end if;
  if p_mode not in ('device', 'blocks', 'server') then raise exception 'bad mode' using errcode = '22023'; end if;
  insert into public.eab_acct_numbering (workspace_id, mode, updated_by) values (ws, p_mode, auth.uid())
  on conflict (workspace_id) do update set mode = excluded.mode, updated_at = now(), updated_by = excluded.updated_by;
  return p_mode;
end $$;
revoke all on function public.eab_acct_numbering_set(uuid, text) from public, anon;
grant execute on function public.eab_acct_numbering_set(uuid, text) to authenticated;

/**
 * Take p_count numbers (1 to 100) from the business's series, for blocks or server mode. p_min is the highest number of
 * that series this phone already knows (from before the server gave numbers), so the series never goes back over it.
 * Answers {"from": n, "to": m}.
 */
create or replace function public.eab_acct_take(ws uuid, p_series text, p_count integer, p_device text, p_min bigint default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m text; f bigint;
begin
  if not public.eab_acct_can_post(ws) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_series not in ('JV', 'INV', 'POS') or p_count is null or p_count < 1 or p_count > 100 or coalesce(p_min, 0) < 0
     or (p_device is not null and p_device !~ '^[A-Za-z0-9_-]{6,64}$') then
    raise exception 'bad request' using errcode = '22023';
  end if;
  select mode into m from public.eab_acct_numbering where workspace_id = ws;
  m := coalesce(m, 'device');
  if m = 'device' then raise exception 'this business numbers by phone letter' using errcode = '22023'; end if;
  insert into public.eab_acct_counters (workspace_id, series) values (ws, p_series) on conflict do nothing;
  update public.eab_acct_counters set next_no = greatest(next_no, coalesce(p_min, 0) + 1) + p_count
   where workspace_id = ws and series = p_series
   returning next_no - p_count into f;
  insert into public.eab_acct_blocks (workspace_id, series, from_no, to_no, mode, device_id, user_id)
  values (ws, p_series, f, f + p_count - 1, m, p_device, auth.uid());
  return jsonb_build_object('from', f, 'to', f + p_count - 1, 'mode', m);
end $$;
revoke all on function public.eab_acct_take(uuid, text, integer, text, bigint) from public, anon;
grant execute on function public.eab_acct_take(uuid, text, integer, text, bigint) to authenticated;

commit;
