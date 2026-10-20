# Handover — JoyChange006/007/008 Batches 1-5 + MainForAdmin-A/B (as of 21 Oct 2026)

Read this first in a new session. Then read the files it points to. Do not trust it over the code: check the branch.

## Where the work is
- Repo `jslproperties101/estate-agent-buddy`, branch **`joychange006`** (latest commit 3cbec69). It contains Batches 1-5 AND MainForAdmin-A AND MainForAdmin-B.
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
| Phone test lists | `docs/JoyChange006-008-007_TestChecklist.txt` (also in Dropbox), `docs/MainForAdmin-B_TestChecklist.txt` (NOT in Dropbox yet; ask Joe) |

## Database state
- **EAB-QA-Test** (`talksazsqsgjriamwxdp`): stage A and stage B applied by Joe by hand. Stage B tests 32/32.
- **Joe still has to paste** `supabase/patches/20261021110000_b_admin_agent_licence_text.sql` (licence returned as text for Admin EAB). Ask him if done; the stage B test file (test 22) proves it.
- **Live** (`vcimagencluybldngjzb`): NEVER touch without Joe's explicit yes. It is far behind the test project (5 tables vs 34+). Catching it up is a separate, approved release step with backup + rollback plan.
- Supabase `apply_migration` approvals did not reach Joe; he pastes SQL in the SQL editor himself.
- Rollback files: `supabase/rollback/`. Tests: `supabase/tests/`.

## How to test
- Unit: `node scripts/test-unit.mjs` (575 passing at 6eb4ff0). Screen: `npm run test:ui` (199 passing; needs `node scripts/build.mjs --no-env` first, Chromium at 384x824).
- Local database mirror: `scratchpad/mkdb.sh` (PostgreSQL 16; `pg_ctlcluster 16 main start`, password postgres). It is in the old session scratchpad, so recreate from the migrations if missing.
- CI: branches containing "qa" build only the QA APK. Verify releases with `gh api repos/jslproperties101/estate-agent-buddy/releases/tags/qa-<sha>` (gh GraphQL is blocked).

## Not done (do not claim done)
- Phone testing of anything in Batches 1-5 or stage B: NOT done.
- Stage C (logging: feature/AI/Marketing logs, performance, crash reporting tool not chosen, sync failures, push delivered/opened).
- Stage D (pushed content: feeds, Market News, Projects, announcements, force update, maintenance).
- Follow-ups: native Android map + rotate; OSM neighbourhoods/streets; check journeys sync to cloud; BM/ZH wording to be confirmed by a native speaker; real support email/address (set in Admin EAB); lawyer review of Terms 1.1-draft; Privacy Notice; production DB catch-up.
- Open question for Joe: should status `rented_pending_ta` count as a rental deal in Track My Sales?

## Joe's rules (also in the project instructions)
Name each batch and ask which model (ask again if it does not suit); short plain words; questions as clickable options (max 4); ask which app if unclear; never delete files without his explicit confirmation; never suggest stopping; all user text in EN/BM/ZH; record new change requests; after each batch give a test list and ask before putting it in Dropbox `/Estate Agent AI Buddy/` (Dropbox cannot edit in place, so new file each time).

## Known gotchas
- Never run `git checkout -- <file>` on test files with uncommitted edits (lost work once).
- Do not `pkill -f "node --test"` while tests run.
- Stage B moved `eab_admin_agent.licence` to text; the parts are in `licence_detail`.
- A suspended agent's direct cloud writes are not yet blocked (needs the "block direct writes" proposal first).
