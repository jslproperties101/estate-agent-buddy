-- Rollback for 20261021000000_admin_eab_foundation.sql. TEST PROJECT ONLY.
-- WARNING: this drops the admin audit and access logs. Never run on production once real admin work is logged.

drop function if exists public.eab_admin_set_admin(text, text, boolean, timestamptz, text, text);
drop function if exists public.eab_admin_list_admins();
drop function if exists public.eab_admin_verify_chain(text);
drop function if exists public.eab_admin_list_log(text, uuid, integer, bigint, text);
drop function if exists public.eab_admin_export(text, text, uuid, jsonb, text);
drop function if exists public.eab_admin_record_history(uuid, text, text, text);
drop function if exists public.eab_admin_agent_records(uuid, text, boolean, integer, integer, text);
drop function if exists public.eab_admin_agent(uuid, text);
drop function if exists public.eab_admin_search(text, text);
drop function if exists public.eab_admin_signed_in(text);
drop function if exists public.eab_admin_me();
drop function if exists public.eab_admin_check_chain(text);
drop function if exists public.eab_admin_write_action(text, uuid, text, text, jsonb, jsonb, text);
drop function if exists public.eab_admin_write_access(text, uuid, text, jsonb, text);
drop function if exists public.eab_admin_name(auth.users);
drop sequence if exists public.eab_admin_export_seq;

-- the log tables refuse truncate/delete by trigger; dropping the table removes the triggers with it
drop table if exists public.eab_admin_actions;
drop table if exists public.eab_admin_access;
drop function if exists public.eab_admin_chain();
drop function if exists public.eab_admin_no_change();
drop function if exists public.eab_admin_row_text(text, jsonb);

-- developer list back to its own table only
create or replace function public.eab_is_developer() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.eab_developers where user_id = auth.uid());
$$;
drop function if exists public.eab_admin_can_see(uuid);
drop function if exists public.eab_admin_guard(text[]);
drop function if exists public.eab_admin_role();
drop table if exists public.eab_admin_scopes;
drop table if exists public.eab_admins;

-- links back to ON DELETE CASCADE
alter table public.eab_records          drop constraint if exists eab_records_user_id_fkey,
  add constraint eab_records_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;
alter table public.eab_records          drop constraint if exists eab_records_workspace_id_fkey,
  add constraint eab_records_workspace_id_fkey foreign key (workspace_id) references public.eab_workspaces (id) on delete cascade;
alter table public.eab_record_revisions drop constraint if exists eab_record_revisions_workspace_id_fkey,
  add constraint eab_record_revisions_workspace_id_fkey foreign key (workspace_id) references public.eab_workspaces (id) on delete cascade;
alter table public.eab_files            drop constraint if exists eab_files_workspace_id_fkey,
  add constraint eab_files_workspace_id_fkey foreign key (workspace_id) references public.eab_workspaces (id) on delete cascade;
alter table public.eab_files            drop constraint if exists eab_files_uploaded_by_fkey,
  add constraint eab_files_uploaded_by_fkey foreign key (uploaded_by) references auth.users (id) on delete cascade;
alter table public.eab_audit            drop constraint if exists eab_audit_workspace_id_fkey,
  add constraint eab_audit_workspace_id_fkey foreign key (workspace_id) references public.eab_workspaces (id) on delete cascade;
alter table public.eab_members          drop constraint if exists eab_members_user_id_fkey,
  add constraint eab_members_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;
alter table public.eab_members          drop constraint if exists eab_members_workspace_id_fkey,
  add constraint eab_members_workspace_id_fkey foreign key (workspace_id) references public.eab_workspaces (id) on delete cascade;
alter table public.eab_bug_reports      drop constraint if exists eab_bug_reports_user_id_fkey,
  add constraint eab_bug_reports_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;
alter table public.eab_teams            drop constraint if exists eab_teams_created_by_fkey,
  add constraint eab_teams_created_by_fkey foreign key (created_by) references auth.users (id) on delete cascade;
alter table public.eab_team_members     drop constraint if exists eab_team_members_user_id_fkey,
  add constraint eab_team_members_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;
alter table public.eab_team_members     drop constraint if exists eab_team_members_team_id_fkey,
  add constraint eab_team_members_team_id_fkey foreign key (team_id) references public.eab_teams (id) on delete cascade;
alter table public.eab_delete_requests  drop constraint if exists eab_delete_requests_team_id_fkey,
  add constraint eab_delete_requests_team_id_fkey foreign key (team_id) references public.eab_teams (id) on delete cascade;

-- last-25-versions clean-up back (versions already kept above 25 are trimmed on the next edit of that record)
create or replace function public.eab_keep_revision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.data is distinct from new.data or old.deleted <> new.deleted then
    insert into public.eab_record_revisions (workspace_id, collection, record_id, rev, data, deleted, saved_by, saved_at)
      values (old.workspace_id, old.collection, old.id, old.rev, old.data, old.deleted, old.written_by, old.written_at)
      on conflict do nothing;
    delete from public.eab_record_revisions v
      where v.workspace_id = old.workspace_id and v.collection = old.collection and v.record_id = old.id
        and v.rev <= coalesce((select x.rev from public.eab_record_revisions x
                               where x.workspace_id = old.workspace_id and x.collection = old.collection and x.record_id = old.id
                               order by x.rev desc offset 25 limit 1), -1);
  end if;
  return new;
end $$;
