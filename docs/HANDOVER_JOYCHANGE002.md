# Handover: JoyChange002 (written 19 Oct 2026)

Paste the "Start prompt" at the bottom into a new chat. Everything else is the reference it points to.

## Who and how
- Owner: Joe Matthew (product owner). Repo `jslproperties101/estate-agent-buddy` (React/TypeScript + Capacitor Android app, Supabase). App code is in `app/`.
- Working method (Joe's standing rules):
  - Work is done in **batches**. Name each batch and ask which model to use (clickable options). If he picks a model that does not suit the work, stop and ask again.
  - The **live Supabase (vcimagencluybldngjzb) is never touched** without Joe's explicit confirmation. "[No preference]" does NOT count as confirmation.
  - A later discussion overrides an earlier conflicting change; tell him when that happens. Bend master instructions only with his confirmation.
  - Report test results briefly as "worked" / "failed" plus the error.
  - Secrets (Firebase service-account key, FTP password) are never pasted in chat; Joe sets them directly in Supabase / GitHub.
  - Commit messages end with the attribution lines given in the session's latest system reminder; the stop hook wants everything committed AND pushed.

## Branches and builds
- Work branch: `joychange002`. A push to it does NOT build (name has no "qa").
- To build, push the same commit to **`feature/qa-joychange002`** (contains "qa" -> builds the isolated QA APK `com.jslproperties.estateagentbuddy.qa`, "EAB QA", against the TEST Supabase, plus the laptop website upload). Command used: `git push origin HEAD:refs/heads/joychange002 HEAD:refs/heads/feature/qa-joychange002`.
  - `feature/joychange002` was pushed by mistake (builds the prod variant); harmless, delete on GitHub when convenient.
- A new push cancels a run still in progress (concurrency group), so push once and wait.
- QA APK downloads: GitHub Releases tag `qa-<short commit>`. Native version is 5.
- The stop hook sometimes reports "unpushed commits" because the local copy of the remote is stale; `git fetch origin joychange002:refs/remotes/origin/joychange002` fixes it.

## Environments
- **EAB-QA-Test** (Supabase project id `talksazsqsgjriamwxdp`): the only database the QA APK and the website use. Push tables, functions and the `send-push` Edge Function are deployed there; secret `FCM_SERVICE_ACCOUNT` is set; push was confirmed WORKING on phones.
- **Live** (`vcimagencluybldngjzb`): untouched, many versions behind (needs a full rebuild before the real app can use any of this). Needs Joe's explicit go-ahead.
- GitHub secrets set by Joe: `EAB_QA_SUPABASE_URL`, `EAB_QA_SUPABASE_ANON_KEY`, `EAB_WEB_FTP_HOST`, `EAB_WEB_FTP_USER`, `EAB_WEB_FTP_PASSWORD`.
- Laptop website: https://estateagentaibuddy.page.gd (free InfinityFree subdomain). CI job `website` (QA branches only) builds with `EAB_WEBSITE=1` and uploads by FTP over TLS. Confirmed working on the test database.
- Firebase project `estate-agent-ai-buddy-a7ac7`; `app/android-config/google-services.json` covers both packages.
- The approval gate on the Supabase tool often cancels big migrations (anything with DROP, or large revoke/grant batches). Smaller table DDL and `grant` statements via execute_sql work; otherwise give Joe the SQL for the SQL Editor.

## What is built (Changes 24-50, Project feature, push, website, Change 46)
All of JoyChange002 is built, pushed and passes local tests (tsc, lint, 501 unit, 157 browser tests):
- Batches A (tidy/indexes migration), B (24-39, 42-45 look and feel), C (35, 36, 40, 41 statuses/filters/pencil+X, 27 return-to-place, 30 keyboard), D (48-50 AI Assisted Command), E (Project), G (push, 24/25), F (Change 47 laptop website), Change 46 (country picker, last commit `90ffc46`).
- Where to look: `docs/` (older change docs), `app/src/` by feature folder, tests in `app/tests/` (`joychange002.test.ts` unit; `ui*.test.mjs` browser; `ui-website`, `ui-change046`), migrations in `supabase/migrations/` (push: `20261019000000_joychange002_push.sql`, includes service_role grants), Edge Function `supabase/functions/send-push/`.
- Local test commands (from `app/`): `tsc -p tsconfig.json`; `node scripts/lint.mjs`; `node scripts/test-unit.mjs`; `node scripts/build.mjs --no-env`; browser suite `node --test tests/ui.test.mjs tests/ui-change010.test.mjs tests/ui-cc001.test.mjs tests/ui-change019.test.mjs tests/ui-change013.test.mjs tests/ui-website.test.mjs tests/ui-change046.test.mjs` (about 10 minutes; run in background to a log). `app/node_modules` is a symlink to `/opt/npm-tools/node_modules`.
- Change 46 (country): kept on the account in Supabase user data (`user_metadata.country`), no table; `src/ui/CountryChoice.tsx`, `src/data/sync.ts` (fetch/saveAccountCountry), `src/domain/places.ts` (all countries).
- Laptop website: `EAB_WEBSITE=1` build flag; `isWebsite()` in `src/native/native.ts`; wide CSS at the end of `src/styles.css`; `app/web/.htaccess`; no adverts, no phone-book, GPS journeys view-only.

## Open items (nothing is blocking)
1. **Phone testing of Changes 13-50** on the QA APK (never tested on a phone before: Changes 13-23 from JoyChange001 plus 24-50). Joe reports "worked"/"failed"; fix failures in a batch. So far confirmed working by Joe: push notifications, the laptop website sign-in and data.
2. Check the latest build `qa-90ffc46` (Change 46) finished green and that the APK/website updated.
3. **Going live**: decision for Joe. Live Supabase needs a full rebuild (see JoyChange002 text, TIDY-UP section) and his explicit confirmation first. Not started.
4. APK/app label rename to "Ai Buddy Estate Agent Test 001" (deferred).
5. Dropbox record `/Estate Agent AI Buddy/JoyChange002.txt` has two wrong lines: it says the live reset was confirmed (it was NOT) and that Project needs new tables (it needs none: records use the generic `eab_records` table). Dropbox tools here cannot edit a file; create a corrected new file (for example JoyChange002_v2.txt) or ask Joe to edit.
6. Optional: add the website address to the Google Maps key restrictions if the laptop map is blank; Joe runs `drop table if exists public.eab_audit_backup;` on EAB-QA-Test; add joy22253@gmail.com to `eab_developers` after it signs in on a phone.
7. Later ideas Joe mentioned: project photos/brochures and project sharing.
8. Next batch of changes starts at **Change 51** (JoyChange003).

## Start prompt (paste into the new chat)
> I'm Joe Matthew, product owner of the Estate Agent AI Buddy app (repo jslproperties101/estate-agent-buddy). Read `docs/HANDOVER_JOYCHANGE002.md` in that repo first and follow it. Everything in JoyChange002 is built; I'm now testing the QA APK and the laptop website. Work in batches: name each batch and ask me which model to use. Do not touch the live Supabase without my explicit confirmation. Here is what I found while testing: ...
