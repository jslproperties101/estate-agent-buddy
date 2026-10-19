-- JoyChange003 Change 51 (Batch B2): remembered dropdown values (towns, streets, reference prefixes, custom field names, the
-- agent's own WhatsApp texts …) follow the ACCOUNT across phones and the laptop website.
--
-- eab_user_options  one row per remembered value of one person: which list, the value, when it was added and last used,
--                   when it was last changed, and whether it was deleted (a deletion is kept, so a phone that was offline
--                   does not bring the value back). Values belong to the person, not to the team workspace.
-- Nobody reads or writes the table directly. The app uses two functions, which only ever touch the caller's own rows:
--   eab_options_push(p_rows jsonb)               sends changes; for each value the change made last wins (by its time)
--   eab_options_pull(p_since bigint, p_limit int) the caller's rows changed after position p_since, in change order
-- Safe to run more than once.

create sequence if not exists public.eab_user_options_seq;

create table if not exists public.eab_user_options (
  user_id     uuid not null references auth.users (id) on delete cascade,
  list        text not null check (length(list) between 1 and 300),
  value_key   text not null check (length(value_key) between 1 and 2000),
  value       text not null check (length(value) between 1 and 2000),
  deleted     boolean not null default false,
  added_ms    bigint not null default 0,
  used_ms     bigint not null default 0,
  updated_ms  bigint not null default 0,
  seq         bigint not null default nextval('public.eab_user_options_seq'),
  primary key (user_id, list, value_key)
);
create index if not exists eab_user_options_user_seq on public.eab_user_options (user_id, seq);
alter table public.eab_user_options enable row level security;
revoke all on public.eab_user_options from anon, authenticated;
revoke all on sequence public.eab_user_options_seq from anon, authenticated;

-- A disabled account (Change 010) cannot use its values. The check is skipped on a database without Change 010.
create or replace function public.eab_options_account_ok(uid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare ok boolean := true;
begin
  if to_regprocedure('public.eab_account_ok(uuid)') is not null then
    execute 'select public.eab_account_ok($1)' into ok using uid;
  end if;
  return coalesce(ok, false);
end $$;

create or replace function public.eab_options_push(p_rows jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r jsonb; n integer := 0; v text; l text;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if not public.eab_options_account_ok(uid) then raise exception 'account disabled' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'rows must be a list of at most 500' using errcode = '22023'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    l := r ->> 'list'; v := btrim(coalesce(r ->> 'value', ''));
    if l is null or length(l) not between 1 and 300 or length(v) not between 1 and 2000 then continue; end if;
    insert into public.eab_user_options as o (user_id, list, value_key, value, deleted, added_ms, used_ms, updated_ms, seq)
      values (uid, l, lower(v), v, coalesce((r ->> 'deleted')::boolean, false), coalesce((r ->> 'added')::bigint, 0),
              coalesce((r ->> 'used')::bigint, 0), coalesce((r ->> 'updated')::bigint, 0), nextval('public.eab_user_options_seq'))
      on conflict (user_id, list, value_key) do update
        set value = excluded.value, deleted = excluded.deleted,
            added_ms = case when o.added_ms = 0 then excluded.added_ms when excluded.added_ms = 0 then o.added_ms else least(o.added_ms, excluded.added_ms) end,
            used_ms = greatest(o.used_ms, excluded.used_ms), updated_ms = excluded.updated_ms, seq = excluded.seq
        where excluded.updated_ms >= o.updated_ms;
    n := n + 1;
  end loop;
  -- A generous limit per person, so the table cannot be filled without end.
  if (select count(*) from public.eab_user_options where user_id = uid) > 20000 then
    raise exception 'too many remembered values' using errcode = '54000';
  end if;
  return n;
end $$;

create or replace function public.eab_options_pull(p_since bigint default 0, p_limit integer default 1000)
returns table (list text, value text, deleted boolean, added bigint, used bigint, updated bigint, seq bigint)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if not public.eab_options_account_ok(uid) then raise exception 'account disabled' using errcode = '42501'; end if;
  return query
    select o.list, o.value, o.deleted, o.added_ms, o.used_ms, o.updated_ms, o.seq
    from public.eab_user_options o
    where o.user_id = uid and o.seq > coalesce(p_since, 0)
    order by o.seq
    limit least(greatest(coalesce(p_limit, 1000), 1), 5000);
end $$;

revoke all on function public.eab_options_account_ok(uuid) from public, anon, authenticated;
revoke all on function public.eab_options_push(jsonb) from public, anon;
revoke all on function public.eab_options_pull(bigint, integer) from public, anon;
grant execute on function public.eab_options_push(jsonb) to authenticated;
grant execute on function public.eab_options_pull(bigint, integer) to authenticated;
