# Controlled test of the Phase 2 migration on a separate Supabase project

Status: **not done. It needs you to create the project.** Nothing here touches your live project.
Local PostgreSQL 16 stand-ins (`supabase/tests/*.sh`) cannot show Storage policies, PostgREST behaviour or Google sign-in.

## What you do (about 15 minutes)

1. In Supabase, create a **new, empty project** (free plan is fine). Do not reuse the live one.
2. Authentication → URL configuration: add `com.jslproperties.estateagentbuddy.qa://auth-callback`.
3. Authentication → Providers → Google: use a **test** Google account for the first run.
4. Give the QA build the new project's URL and anon key by typing them in Settings on the QA app (they are never committed).
5. SQL editor: run the four files in `supabase/migrations/` **in filename order**, one at a time, saving the output.

## What I then check (and write down, with the output)

| Check | Pass condition |
|---|---|
| Migrations apply in order with no errors | all four run clean |
| Two test accounts, one workspace | the second account sees only what its role allows |
| Sync: add, edit, delete on phone A, appears on phone B | records and versions match |
| Same field edited on two phones | Sync review shows both, nothing lost |
| Same property number on two phones | refused, shown for review |
| Photo/file upload | file appears in the `eab-files` bucket under the workspace folder; a user outside the workspace cannot read it |
| Easy Bug Report with a screenshot | row in `eab_bug_reports`, file in the private bucket, nobody else can read it |
| Backup to Google Drive (real Google test account) | file appears in the app folder; 31st backup removes the oldest |
| Restore the backup into a second clean phone | records match; the safety copy exists |
| Rollback script on the test project | records unchanged afterwards |
| `supabase/proposed/20261015000000_block_direct_writes.sql` (optional) | old-style upsert refused through the real API; the new app still syncs |

Until this table is filled in with real results, every cloud, Storage and Drive row in `docs/MASTER_REQUIREMENTS_AUDIT.md` stays “Not verified on a real phone or live service”.
