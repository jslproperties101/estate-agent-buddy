# JoyChange010-05 — Confidential documents in the cloud, with an "Include confidential documents" switch per share

Branch `joychange006`. Joe, 21 Oct 2026: "everything has to upload to cloud so they can use it on other platforms and
desktop and other phone". Decided with Joe: the owner always has them; a Team Workspace partner gets them only when the
owner ticks **Include confidential documents** in the share settings — **off by default**.

**Replaces** the owner decision of 16 Oct 2026 (confidential documents only in the owner's own backups and Google Drive,
never in the cloud bucket) and the 010-04 "private copy" rule (no longer needed: moving a file between folders now only
changes its folder; the database reads the folder).

## Who can download a confidential document (title, owner correspondence, rental or sales documents)
Decided in the database (`eab_files` read rule; the storage bucket follows it), from the property's own documents list:
- the agent who owns the property, and the agent it is assigned to — on every phone and the laptop website;
- the owner / admin of the workspace the property is in (the account side, as for everything else);
- a Team Workspace partner the property is shared with — **only** with the switch on, for that property or for every
  property shared through Share All. Turning the share off, ending the Team Workspace or a suspended account ends it.
- Everyone else who can see the property (a partner without the switch, a **team leader** in the same workspace) sees the
  property, photos and other documents, not the confidential files. On their phone the file shows "🔒 Confidential — not
  shared with you" (not an error, not in Sync problems), and it arrives by itself at the next sync once the owner allows it.
- Admin EAB (compliance, regulators) reads through its own server functions: not affected.

## Screens
- Manage Sharing: under each **shared** property a tick box "Include confidential documents 🔒" (off); in Share All, when
  Properties are shared, "Include confidential documents of every property shared through Share All 🔒". Saved at once,
  written to the Team Workspace history (`confidential_on` / `confidential_off`).
- Property form, confidential folders: "Confidential: on all your own devices and in your backups. Teammates get them only
  if you tick 'Include confidential documents' when sharing. Never sent to AI." (EN / BM / ZH)

## Files
- Database: `supabase/migrations/20261021220000_confidential_cloud_files.sql` (table `eab_share_confidential`, functions
  `eab_file_confidential`, `eab_confidential_shared`, `eab_share_confidential_set`, `eab_share_confidential_list`, new read
  rule on `eab_files`), rollback `supabase/rollback/20261021220000_confidential_cloud_files_rollback.sql`, tests
  `supabase/tests/confidential_files_test.sql` (23).
- Phone: `data/fileRefs.ts` (all files to the cloud), `data/filesync.ts` (padlock state), `sync/SyncUI.tsx` (badge, not a
  problem), `team/api.ts` + `team/TeamUI.tsx` (switch), `share/inbox.ts` (no private copy), `share/strings.ts`,
  `listing/strings.ts`, `data/types.ts`.
- Tests: unit FX2, TB1, TB2, J10-04e updated (603 pass); screen test C3b in `tests/ui-change010.test.mjs`.

## Status
- Database: local PostgreSQL 16 copy: 23/23; all earlier sets still pass (foundation 34, B 32, AdminBatch002 21,
  AdminBatch003 34, C 5, D 26, push 33); rollback and re-apply rehearsed. **NOT applied to EAB-QA-Test** (Joe pastes it).
  **Not applied to production.**
- App: unit 603, lint, share-screen tests pass. **Not in an APK, not tested on a phone.**
- Order on the test database: apply this migration BEFORE installing an app with this change. An app with this change on a
  database without it would upload confidential files that a shared partner could read under the old rule.

## Open
- Team leaders in a shared workspace do not get confidential files (only owner / admin). Change if Joe wants otherwise.
- Lawyer review of Terms / Privacy Notice: confidential documents are now stored in the cloud (Supabase).
