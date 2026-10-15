# Integrated release 2.0.010 — Changes 001–010 in one build

| | |
|---|---|
| Integration branch | `feature/v2.0.10-integrated`, made from Change 010's final commit `e368606` |
| QA branch | `feature/qa-v2.0.10-integrated` (same commit; the name makes CI build only the isolated QA APK) |
| Base verified | `feature/qa-changes-001-009` (`5037b41`) is an ancestor of `e368606`: no cherry-picks, no duplicate commits |
| Unchanged | `main` (`e936769`), `feature/qa-changes-001-009`, `feature/change-010-team-audit-exports` |
| Version | internal **2.2.0** (valid SemVer, above 2.1.0); release label **2.0.010** shown in About, never compared by updates |

Status key: **IT** implemented and tested automatically (Node, Chromium 384 × 824 with stand-ins, local PostgreSQL 16) ·
**NV** not verified on a real phone or live service · **PI** partial · **NEW** implemented in this integration ·
**OD** owner decision/action · **DEF** deferred by owner decision · **SUP** superseded.

## Requirements-to-code matrix
| Change | Requirement | Status | Where | Tests |
|---|---|---|---|---|
| 001 | First-start sample-data popup higher | IT | `styles.css` `.start-scrim` | U98 |
| 002/002a | Owner's black-and-gold logo in the app (header, sign-in, first start); launcher icon unchanged (owner) | IT | `brand/`, `icons.tsx` | BR5, U1, U28, U98 |
| 003 | Top-middle "Soon" item removed; Co-broke Opportunities from the Opportunities card | IT | `App.tsx` | U1, U25 |
| 004 | Main-screen To-Do popup removed; due reminders in Notifications | IT; phone notifications NV | `App.tsx` | U9, U89 |
| 005 | Old preview popup | SUP by 008/009 | — | U65 asserts absent |
| 006 L1 | Record history + Recovery, kept separate from the audit trail; local-first save | IT; cloud NV | `data/store.ts`, `sync.ts`, `audit/*`, **NEW** `backup/driveTree.ts` Recovery | L1-1…L1-5, T3, T5, T6, T9, H*, P2-* |
| 006 L2 | Readable Google Drive folders | **NEW** IT; Drive NV | `backup/tree.ts`, `driveTree.ts` | T1–T10, U92 |
| 006 L3 | Daily restore points (30 kept), verified restore with preview, old backups restore | **NEW** IT; Drive NV | `backup/restorePoints.ts`, `drive.ts`, `BackupUI.tsx` | RP1–RP7, DR1–DR3, D6, B1–B7, U91, U92 |
| 006 L4 | Independent encrypted backup | **NEW** code IT; **not operational (OD)** | `ops/platform-backup/` | P4-1…P4-10, `platform-backup-test.sh` (22) |
| 007 | Orange QA banner removed; About still says QA | IT | `App.tsx` | U99 |
| 008 | Single tap; no long press / preview eye | IT | `listing/ListingUI.tsx` | U65 |
| 009 | Property List cards, form fields, dropdowns, Title Case app-wide, photos, Maps link, price/tenure/commission (sale %/flat, rent months/custom/flat), details order, Extra Comments, tenant/owner/WhatsApp, banner location, verification colours | IT; native phone-book picker NV | see `docs/CHANGES_001_009.md` | C9-*, U7, U63, U65, U66, U100–U104 |
| 010 | Team Workspace, invitations, expiry, switching, sharing (Share All, per-record, View Only / View and Edit at UI, store and RLS), revocation, archive/restore/deletion requests | IT; live Supabase and two phones NV | `team/*`, proposal SQL | A1–A13, S1–S14, C1–C8, 122 DB checks |
| 010 | Audit history: immutable, actor, exact before/after, MYT, search | IT; NV | `audit/*` | AU1–AU9, C9 |
| 010 | PDF/XLSX exports, preview, cancel, saved/deleted exports and retention | IT; Android share NV | `exports/*` | R1–R7, E1–E5, C10, C11 |
| 010 | Owner decision 1: field-level restore | DEF (whole-version restore kept) | — | — |
| 010 | Owner decision 2: own audit history in backups, merge by id, older backups compatible | IT, and now also in Drive restore points | `data/manifest.ts`, `backup.ts` | E5, RP1 |
| 010 | Owner decision 3: delete/restore own export copies only | IT | `exports/saved.ts` | E1–E4, C11 |

### Found and fixed during integration (each with a regression test)
| Defect | Effect | Fix | Test |
|---|---|---|---|
| Confidential documents uploaded to the shared cloud bucket | a teammate with access to the record could download a title deed | never put in the bucket; in the owner's own backups and Drive (owner decision 16 Oct) | TB1, TB2, FX2, `file-access-test.sh` |
| Advert screenshots missing from `fileRefs` | not in any backup, never synced | included (cloud kind "other") | FX1 |
| Two restore points in the same second | one folder with two manifests | separate names with milliseconds | RP7, U92 |

### Distribution safeguard added at the QA step
The first QA APK of this branch (`qa-96e2803`) was built, like earlier QA builds, with the **production** Supabase
project as its default connection (from the repository secrets). That is replaced: QA builds now take only the
separate test project's secrets (`EAB_QA_SUPABASE_URL` / `EAB_QA_SUPABASE_ANON_KEY`), and without them the QA app asks
for the connection on its sign-in screen. Test W2. Use the QA APK built after this change, not `qa-96e2803`.

### Shared systems checked across Changes 006 and 010
Backups and restore points carry only the account's own records, history, audit entries and files (confidential documents
included, owner decision 16 Oct): never records shared in by another agent, never Team Workspace events (RP1, E5, T1).
Confidential documents never enter the shared cloud bucket, so team sharing cannot expose them (TB1, TB2). Change 010 permissions were not relaxed anywhere: no
SQL, policy or access-check file was changed by this integration.

## Automated results on the final integrated commit (this workspace)
| Check | Result |
|---|---|
| TypeScript strict | 0 errors |
| Lint (incl. EN/BM/ZH) | passed, 226 files |
| Unit tests (Node) | 400 / 400 (368 before; +32: Change 006 Drive 22, Layer 1 5, team boundary 2, version 1, workflow 2) |
| Browser tests (Chromium 384 × 824, stand-ins) | 115 / 115 (U92 rewritten for the Drive layers, U30 for the release label) |
| Production build (no publishing) | built (`scripts/build.mjs --no-env`); QA build inside U99 |
| DB: RLS / rollback / write-block / Change 010 / RLS + 010 | 125/125 · 18/18 · 22/22 · 122/122 · 126/126 |
| DB: file access with sharing, revoking, leaving | 16/16 |
| Layer 4 format tests | 10 / 10 |
| Layer 4 PostgreSQL rehearsal | 22 / 22 |
| GitHub Actions | see the final report for run links |
| Real phone, live Supabase, Google OAuth, real Drive, Storage, Android sharing, GPS, camera, microphone | **not run** |

## What is NOT proven (and why)
- Everything cloud-side: the Phase 2 migration and the Change 010 proposal have never been applied to a Supabase project.
- Google Drive Layers 1–3: only a stand-in Drive. Needs the `drive.file` scope on the test OAuth client.
- Layer 4: no provider, no key holders, no schedule (owner decisions, `CHANGE_006_LAYER4.md`).
- Anything on the S23 Ultra.

## Missing or unrecoverable requirement text
- `changemainA.docx` and the Dropbox change records: **not accessible from this session** (no Dropbox connection), so
  they were not read. Reconciliation used the repository's records: `docs/CHANGES_001_009.md`, `docs/CHANGE_010.md`,
  `docs/MASTER_REQUIREMENTS_AUDIT.md`, `docs/AUDIT.md`, `Property_Explorer.docx` and the Change 006 design. No
  requirement in those was found unresolved apart from the owner decisions listed in `CHANGE_006.md`.
- Nothing was recorded in Dropbox (as instructed: only after your explicit recording instruction).
