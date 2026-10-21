# Handover — JoyChange006/007/008 Batches 1-5 + MainForAdmin-A/B/C/D + JoyChange010 (as of 21 Oct 2026, afternoon)

Read this first in a new session. Then read the files it points to. Do not trust it over the code: check the branch.

## Where the work is
- Repo `jslproperties101/estate-agent-buddy`, branch **`joychange006`**. It contains Batches 1-5, MainForAdmin-A, B, C (logging), D (pushed content), change 010-01, and the teammate's AdminBatch002/003 database files (merged from `feature/admin-batch-003-db`).
- QA APK branch: `feature/qa-joychange006` (build 6eb4ff0, release tag `qa-6eb4ff0`, CI green). It does NOT yet contain 3cbec69 (DB patch only, no app change).
- Old branches were copied to `archive/*`; the old names still need deleting by Joe in the GitHub web page (this session got HTTP 403).
- Admin EAB is a separate repo `jslproperties101/admin-eab` built by a teammate. It calls `eab_admin_*` functions. Do not change their signatures or result shapes without checking that repo.

## What each document records
| Work | Record |
|---|---|
| Batch 1-3 | `docs/JOYCHANGE006_BATCH_1.md`, `_2.md`, `_3.md` |
| Batch 4 (places, JoyChange008) | `docs/JOYCHANGE008_BATCH_4.md` |
| Batch 5 (House Shopping / GPS, JoyChange007) | `docs/JOYCHANGE007_BATCH_5.md` |
| Stage B (accounts and security) | `docs/MAINFORADMIN_B.md` |
| Stage C (logging) | `docs/MAINFORADMIN_C.md` |
| Stage D (Market News, pushed Projects + codes, announcements, force update, maintenance) | `docs/MAINFORADMIN_D.md` |
| Joe's new change list (010-01, 010-02 …) | `docs/JOYCHANGE010_MAIN.md` (Dropbox `JoyChange010-Main.txt` not created yet) |
| Phone test lists | `docs/JoyChange006-008-007_TestChecklist.txt`, `docs/MainForAdmin-B_TestChecklist.txt` (both in Dropbox), `docs/MainForAdmin-C_TestChecklist.txt`, `docs/MainForAdmin-D_TestChecklist.txt` (repo only) |

## Database state
- **EAB-QA-Test** (`talksazsqsgjriamwxdp`): stage A and stage B applied by Joe by hand. Stage B tests 32/32.
- Licence-text patch and Stage C: pasted by Joe on 21 Oct (Stage C test 5/5 on EAB-QA-Test).
- Stage D (`20261021200000_mainforadmin_d_feed.sql`): applied to EAB-QA-Test by Joe on 21 Oct, test 26/26.
- Teammate's AdminBatch002 file says it was applied to EAB-QA-Test; AdminBatch003 (`20261021130000_admin_batch_003_cases.sql`) not confirmed.
- Stage C migration was renamed to `20261021140000_…` because it shared the number 20261021120000 with AdminBatch002.
- Local DB helper must stub `storage.buckets/objects`, make `auth.uid()` read `request.jwt.claims`, and seed one workspace + record (the teammate's tests need a user with records).
- **Live** (`vcimagencluybldngjzb`): NEVER touch without Joe's explicit yes. It is far behind the test project (5 tables vs 34+). Catching it up is a separate, approved release step with backup + rollback plan.
- Supabase `apply_migration` approvals did not reach Joe; he pastes SQL in the SQL editor himself.
- Rollback files: `supabase/rollback/`. Tests: `supabase/tests/`.

## How to test
- Unit: `node scripts/test-unit.mjs` (589 passing at 248d6f7). Screen: `npm run test:ui` (183 passing at 248d6f7; needs `node scripts/build.mjs --no-env` first, Chromium at 384x824). (An earlier note said 199 screen tests; that was a miscount.)
- Local database mirror: `scratchpad/mkdb.sh` (PostgreSQL 16; `pg_ctlcluster 16 main start`, password postgres). It is in the old session scratchpad, so recreate from the migrations if missing.
- CI: branches containing "qa" build only the QA APK. Verify releases with `gh api repos/jslproperties101/estate-agent-buddy/releases/tags/qa-<sha>` (gh GraphQL is blocked).

## Not done (do not claim done)
- Phone testing of anything in Batches 1-5 or stages B, C, D: NOT done. Joe asked to keep building and test later.
- Stage C/D: built and tested automatically; not on a phone. Crashlytics later (Joe: "both, Crashlytics later"); usage detail kept 7 years (Joe).
- Stage D limits: push alerts per post need Firebase + a sender; Admin EAB screens for posts/groups/codes not built (teammate); audience filters "state" and "team" not supported.
- Follow-ups: native Android map + rotate; OSM neighbourhoods/streets; check journeys sync to cloud; BM/ZH wording to be confirmed by a native speaker; real support email/address (set in Admin EAB); lawyer review of Terms 1.1-draft; Privacy Notice; production DB catch-up.
- Answered 21 Oct 2026 (JoyChange010-02): `rented_pending_ta` is listed in Track My Sales as its own stage but is not counted in the totals until it becomes plain Rented.

## Joe's rules (also in the project instructions)
Give Joe GitHub RELEASE PAGE links for APKs (he cannot use direct download links). Name each batch and ask which model (ask again if it does not suit); short plain words; questions as clickable options (max 4); ask which app if unclear; never delete files without his explicit confirmation; never suggest stopping; all user text in EN/BM/ZH; record new change requests; after each batch give a test list and ask before putting it in Dropbox `/Estate Agent AI Buddy/` (Dropbox cannot edit in place, so new file each time).

## Known gotchas
- Never run `git checkout -- <file>` on test files with uncommitted edits (lost work once).
- Do not `pkill -f "node --test"` while tests run.
- Stage B moved `eab_admin_agent.licence` to text; the parts are in `licence_detail`.
- A suspended agent's direct cloud writes are not yet blocked (needs the "block direct writes" proposal first).
