-- Undo Change 24: stop sending live invitation changes. The app falls back to checking now and then (Change 13).
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'eab_team_invites') then
    alter publication supabase_realtime drop table public.eab_team_invites;
  end if;
end $$;
