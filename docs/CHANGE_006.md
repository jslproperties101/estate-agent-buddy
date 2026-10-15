# Change 006 — Four-layer backup and recovery: what is built, and what is still not proven

Branch `feature/v2.0.10-integrated` (from Change 010 `e368606`). Specification: the approved design document
"Change 006 Four-Layer Backup and Recovery Architecture" (design-only, checked against `5037b41`). This file reports the
implementation against it. Owner defaults applied (Oct 2026): Drive backups only while the app is open, no server and
no stored refresh token; Supabase stays on Free; restore points daily, 30 kept; no identity-document collection.

Status words: **IT** = implemented and covered by automated tests (Node, Chromium at 384 × 824 with stand-ins, local
PostgreSQL 16). **NV** = not verified on a real phone or live service. **OD** = waits for an owner decision or owner
account action. Nothing below has touched Google Drive, Supabase, a provider account or a phone for real.

## Layer status at a glance
| Layer | Built | Automated tests | Real-service test | What is still needed |
|---|---|---|---|---|
| 1 Record history and Recovery | phone history and Recently deleted (Phase 2), cloud history (Phase 2 migration, not applied), Change 010 audit trail, **Drive Recovery folders (new)** | IT | NV | apply Phase 2 + Change 010 to a **test** Supabase project and run the test plan |
| 2 Readable Drive folders | **new** | IT (stand-in Drive) | NV | Google OAuth: `drive.file` scope on the test OAuth client; a real Google test account |
| 3 Drive restore points | **new** (replaces the .zip upload; old .zip copies still restore) | IT (stand-in Drive) | NV | same as Layer 2 |
| 4 Independent encrypted backup | **new, provider-neutral** code and runbook | IT (format tests + PostgreSQL rehearsal) | **Not operational** | OD: storage provider, two key holders, where the nightly job runs (see `CHANGE_006_LAYER4.md`) |

## Layer 1 — record history and recovery
Two systems on purpose, never merged:
- **Record history** (what a record was): 25 versions per record and 30 days of Recently deleted on the phone
  (`data/store.ts`); version check and field conflict review (`data/sync.ts`, `merge.ts`); cloud history
  `eab_record_revisions` in the Phase 2 migration (not applied anywhere real). Restoring a version is an ordinary edit,
  so it can be undone.
- **Audit history** (who changed what, when; Change 010): insert-only, exact before/after values, actor, MYT time.
  Saved after the record itself, sent in the background; a slow or failing audit upload never blocks, fails or undoes
  a saved record (test L1-2).
- **Drive Recovery folders (new, `backup/driveTree.ts`)**: before a readable file is rewritten, the previous Drive copy
  goes to `Recovery/` beside it (`2026-10-15T09-42-07+0800 edited Property Details.txt`); a deleted photo or document
  goes to `Pictures/Recovery/` etc.; a deleted property, contact or To-Do goes to the parent's `Recovery/` as one
  folder or file. Kept 90 days, then to the Drive bin. Written only from cloud-confirmed records.

| Requirement | Status | Tests |
|---|---|---|
| Create / edit / delete / archive / restore keep history and audit | IT | L1-1, L1-3, L1-4, H1–H6, AU2–AU3 |
| Offline save is immediate and survives restart; reconnect sends record and audit once | IT | L1-1 |
| Audit upload failure never blocks a saved record | IT | L1-2 |
| Same field changed on two phones: both kept, person decides | IT | L1-5, P2-2–P2-8 |
| Permissions preserved across sync (Change 010) | IT | A1–A13, S1–S14 |
| Cloud history and retention live | NV | needs Phase 2 migration on the test project |
| Edited and deleted items kept in Drive Recovery | IT | T3, T5, T6 |
| Recovery older than 90 days to the bin | IT | T9 |

## Layer 2 — readable Google Drive folders (`backup/tree.ts`, `backup/driveTree.ts`)
`Estate Agent AI Buddy/` → README.txt, Export Status.txt, Index.csv, Settings/, Property Listing/<Country>/<State>/
<Town>/<Township>/<Unit/Lot + street>/<Owner>/ (Property Details, Owner Details, Pictures 01 = main, Documents by
category, Buyers who enquired or viewed, Tenancy, Adverts + screenshots, Banners), Property Listing/Archived/…, To-Do,
Calendar, Contacts/Buyers|Vendors|Other, Inquiries and Viewings, GPS Assistance, Agent Financial (CSV), Property
Calculator, Agent Profile, Ask Expert. A module folder exists only when it holds something.

| Rule | Status | Tests |
|---|---|---|
| Exact layout; empty levels "… Not Recorded"; clashes get `[id8]`; identity from Record ID, never folder name | IT | T1 |
| Own records only: no shared-in (Change 010), no sample data | IT | T1 |
| **No confidential documents** (title, owner correspondence, rental/sales papers) and **no identity-document folder**; IC/NRIC/passport/bank fields withheld | IT | T1 |
| No secrets: Maps key, Supabase URL/key, Ask Expert URL, tokens never written | IT | T1, T10 |
| Idempotent: rerun uploads nothing | IT | T2 |
| Edit → previous version to Recovery, same Drive file updated | IT | T3 |
| Move/rename keeps Drive ids; empty old folders to the bin | IT | T4 |
| Delete → Recovery, never deleted | IT | T5 |
| Hand-edited file kept as "edited outside the app"; binned file written again | IT | T6 |
| Unsynced changes wait; status says partial with the list | IT | T7 |
| Rebuild / new phone adopts existing files, no duplicates | IT | T8 |
| Same content in every app language | IT | T10 |
| Screen: status line, "Rebuild Drive folders" | IT | U92 |
| Real Google Drive | **NV** | — |

## Layer 3 — restore points (`backup/restorePoints.ts`)
`Estate Agent AI Buddy/Disaster Recovery/` → `Objects/<sha256>` (each photo/document once), `Restore Points/<UTC time>/`
→ `records.json` (exactly the backup-file content: same builder, same restore code), `manifest.json` (written last,
read back and checked, with its own SHA-256), `Restore Point.txt`.

| Rule | Status | Tests |
|---|---|---|
| Objects → records.json (read back) → manifest.json last (read back) | IT | RP1 |
| No secrets; no shared-in records; confidential documents included (own backup) | IT | RP1 |
| Objects uploaded once; newest 30 kept; unreferenced objects to the bin; older points still complete | IT | RP2 |
| Restore to a clean phone and onto later local edits; nothing newer deleted; safety copy; repeat restore adds nothing | IT | RP3 |
| Damaged object / records.json / manifest refused before any change | IT | RP4 |
| Interrupted run never offered; binned after a day | IT | RP5 |
| Unverified upload binned, no success recorded | IT | RP6 |
| Two points in the same second stay separate (bug found by U92, fixed) | IT | RP7, U92 |
| Daily at app start when due (20 h) + "Back up to Drive now"; folders every run; layers fail independently | IT | DR1–DR3, U92 |
| Before a restore: a "before-restore" point (best effort) + the local safety copy (always) | IT (code path), NV | U92 |
| Older `.zip` backups on Drive (pre-006) and backup files still restore | IT | D6, B1–B7, E5, U91 |
| Warning amber after 2 days, red after 7 | IT | screen code; U92 checks the normal state |
| Real Google Drive | **NV** | — |

Retention: the design proposed 30 daily + 12 monthly; the owner default is **30 copies**, which is what is built. Adding
monthly points later is a one-line retention change.

The app **no longer uploads .zip files to Drive** (that was the stand-in for Layer 3; keeping both would be two
overlapping Drive backups). The old folder "Estate Agent AI Buddy backups" is left as it is; its files stay listed under
"Older backup files on Drive" and still restore. The manual backup file (share sheet / download) is unchanged and is
the "Download All Data" of the design.

## Layer 4 — independent encrypted backup (`ops/platform-backup/`, runbook `docs/CHANGE_006_LAYER4.md`)
Built provider-neutral, independent of Google Drive and Supabase: X25519 + HKDF-SHA256 key wrap for each key holder,
AES-256-GCM in 64 KiB chunks with counters and a last-chunk flag, header bound to every chunk; any one of two key
holders opens it; key-less storage check; write-once folder target; restore only into a new empty folder with every
entry checked against the inner manifest.

| Check | Status | Tests |
|---|---|---|
| Either key holder opens; byte-for-byte restore | IT | P4-1, P4-10 |
| Nothing readable stored; no private key anywhere; public index names nothing inside | IT | P4-2, rehearsal |
| Non-holder key refused | IT | P4-3 |
| Flipped byte, truncation, dropped/swapped chunk, edited header all refused, nothing written | IT | P4-4, rehearsal |
| Key-less integrity check of stored copies | IT | P4-5 |
| Write-once, read-only stored files; never restores on top of something | IT | P4-6, P4-7 |
| Job refuses private keys; key tool refuses to write keys inside the repository; never prints a private key | IT | P4-8 |
| pg_dump → encrypt → restore into a NEW database with each key → counts and content fingerprints match | IT (local PostgreSQL, synthetic) | `supabase/tests/platform-backup-test.sh` (22 checks) |
| Real independent storage, object lock, key holders, nightly schedule, monthly restore drill | **Not operational (OD)** | — |

## Fixes made during the integration (each with a regression test)
1. **Confidential documents reached the cloud** although the form says "kept on this phone only"; a Team Workspace
   member could then download them. Cloud file sync now skips them (`data/fileRefs.ts` `cloudFileRefs`); the record
   shows "N confidential, kept on this phone only". They remain in the person's own backup file and Drive restore
   points. Test FX2. *Owner to confirm this reading (see below).*
2. **Advert screenshots were in no backup and never synced** (missing from `fileRefs`). Now included (cloud kind
   "other"). Test FX1.
3. **Two restore points in the same second shared one folder.** Now separate (`…07.400Z`). Test RP7 (found by U92).

## Identity documents and privacy
No identity-document folders and no collection: the app has no place for owner or buyer IC scans, and none was added.
If the owner later asks for it, it needs consent recording, access control, encryption and retention rules first
(design section 13). Malaysian PDPA notes in the design still apply (Supabase region and backup location belong in the
privacy notice).

## Owner actions and decisions (only the ones that need you)
1. **Google OAuth for Drive (test first).** In the Google Cloud project used for the **test** sign-in: OAuth consent
   screen → Scopes → add `https://www.googleapis.com/auth/drive.file`; add your two test Google accounts as test users.
   Nothing else in Drive becomes visible to the app.
2. **Layer 4 provider and key holders** — see `CHANGE_006_LAYER4.md` §2. Until then Layer 4 is code and tests only.
3. **Confidential documents off the cloud (fix 1).** Built as the form promises. If you instead want title deeds etc.
   in the cloud (so a new phone gets them automatically), say so; it is a one-line switch, but teammates with access
   to the record would then be able to download them.

## Not changed
`main`, the Supabase production project, the website and update channel, Google Cloud settings, any Drive account,
Dropbox. No migration was applied anywhere. No paid service was used or created.
