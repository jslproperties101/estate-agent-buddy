-- Change 24 (JoyChange002): the invitation pop-up appears at once while the app is open.
-- Turns on Supabase Realtime for the invitations table. The phone opens one live connection while the app is on screen;
-- when an invitation for me is created, cancelled or answered, Realtime sends a short "something changed" message and
-- the app asks eab_team_status() as before. The phone never trusts the message content.
-- Who receives a change is decided by the table's existing row-level security ("eab invites mine": the sender, and the
-- person whose Google email the invitation names). Nobody else is told. Nothing in the table or its rules changes.
-- Apply AFTER 20261016000000_change010_team_sharing_audit.sql. Safe to run twice. Undo: 20261018200000_change024_rollback.sql

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;           -- Supabase creates it with every project; only a bare database lacks it
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'eab_team_invites') then
    alter publication supabase_realtime add table public.eab_team_invites;
  end if;
end $$;
