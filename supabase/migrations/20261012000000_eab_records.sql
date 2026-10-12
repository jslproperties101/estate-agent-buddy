-- Estate Agent Buddy: cloud copy for the app's "Sync now" (Profile & Name Card → Settings).
-- Interim document-style table: one row per app record (property, contact, inquiry, appointment, task, journey,
-- deal, expense, income, target, Ask Expert thread), private to the signed-in user by row-level security.
-- The fully relational design in schema.sql remains the long-term target; records keep the same ids, so they can
-- be migrated into those tables later.
create table if not exists public.eab_records (
  user_id    uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  collection text    not null,
  id         text    not null,
  data       jsonb,
  deleted    boolean not null default false,
  updated    bigint  not null,          -- milliseconds since 1970, set by the phone that made the change
  primary key (user_id, collection, id)
);
create index if not exists eab_records_user_updated on public.eab_records (user_id, updated);

alter table public.eab_records enable row level security;
drop policy if exists "Own records only" on public.eab_records;
create policy "Own records only" on public.eab_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
