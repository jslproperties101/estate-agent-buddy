-- Estate Agent AI Buddy: Easy Bug Report (Phase 1). NOT APPLIED to any live project: run it yourself, after review,
-- in Supabase → SQL Editor (or `supabase db push`). Until it is applied the app shows "not sent" for every report.
--
-- What it creates:
--   table  public.eab_bug_reports   one row per report (description, app version, platform, language, screen)
--   bucket storage "bug-reports"    private; one optional screenshot per report at <user id>/<report id>.jpg
-- Who can do what (enforced here by row-level security, not by the app):
--   a signed-in person can add a report as themselves and read their own reports; nobody can edit or delete through
--   the API; anonymous visitors can do nothing. The owner reads all reports in the Supabase dashboard (service role),
--   which is not subject to these policies.
-- The report holds no passwords, keys or tokens: the app sends only the fields below, and user_id comes from the sign-in.

create extension if not exists pgcrypto;

create table if not exists public.eab_bug_reports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  description     text not null check (char_length(btrim(description)) between 1 and 1000),
  screenshot_path text check (screenshot_path is null or screenshot_path like user_id::text || '/%'),
  app_version     text check (char_length(app_version) <= 40),
  platform        text check (char_length(platform) <= 20),
  language        text check (char_length(language) <= 10),
  screen          text check (char_length(screen) <= 40),
  status          text not null default 'new' check (status in ('new', 'seen', 'fixed', 'closed')),
  created_at      timestamptz not null default now()
);
create index if not exists eab_bug_reports_created on public.eab_bug_reports (created_at desc);

alter table public.eab_bug_reports enable row level security;
drop policy if exists "eab bug report add" on public.eab_bug_reports;
drop policy if exists "eab bug report own" on public.eab_bug_reports;
create policy "eab bug report add" on public.eab_bug_reports for insert to authenticated with check (user_id = auth.uid() and status = 'new');
create policy "eab bug report own" on public.eab_bug_reports for select to authenticated using (user_id = auth.uid());
-- No update or delete policy: reports cannot be changed or removed through the API.
revoke all on public.eab_bug_reports from anon, authenticated;
grant insert (id, description, screenshot_path, app_version, platform, language, screen), select on public.eab_bug_reports to authenticated;

-- ---------- private storage for screenshots (only where Supabase Storage exists) ----------
do $$
begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('bug-reports', 'bug-reports', false, 3145728, array['image/jpeg', 'image/png'])
      on conflict (id) do update set public = false, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg', 'image/png'];
    drop policy if exists "eab bug screenshot add" on storage.objects;
    drop policy if exists "eab bug screenshot own" on storage.objects;
    create policy "eab bug screenshot add" on storage.objects for insert to authenticated
      with check (bucket_id = 'bug-reports' and (storage.foldername(name))[1] = auth.uid()::text);
    create policy "eab bug screenshot own" on storage.objects for select to authenticated
      using (bucket_id = 'bug-reports' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
