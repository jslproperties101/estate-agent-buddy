# Phase 2 — Data safety and synchronisation

Branch `feature/v2-phase2` (from Phase 1 commit `b1b2521`). Not merged. **Nothing here has been applied to a live Supabase
project or tested on a real phone.** Server rules were tested on a local PostgreSQL 16 only (see "What was and was not tested").

## 1. What the Phase 1 sync really did (inspected before changing it)

| Finding | Effect |
|---|---|
| Pulled rows by `updated` timestamp with a 5-minute margin, newest `updated` won | Device clocks decided; an earlier edit on a phone with a fast clock overwrote a later one |
| Pushed with an unconditional upsert | A stale phone silently replaced the cloud copy; no history |
| Cleared "waiting" for every key that was in the list **before** the upload | An edit typed during the upload was marked sent although it never was |
| Reference uniqueness only checked on the phone | Two offline phones could both use P1001 / A1001 |
| Deleting a property removed its photos at once; files never left the phone | Pictures lost on another phone; no recovery |

## 2. Design

**Versions, not clocks.** Every cloud record has `rev` (+1 on each write, set by the database) and `seq` (order of
changes, set by the database). A phone remembers per record the version the cloud last accepted or sent (its *base*).

**Safe push** `eab_push_records(ws, rows)`: writes a row only if `base_rev` equals the cloud's current `rev`; otherwise it
answers `conflict` with the current copy and writes nothing. It runs as the signed-in user (`security invoker`), so the
existing row-level security still decides who may write. Each row carries an `op_id`; a retry after a lost answer is
recognised and not applied twice. Answers: `ok`, `conflict`, `ref_conflict`, `denied`.

**Joining (phone, `data/merge.ts`).** Three-way, field by field, against the base:
- changed on one side only → kept; same change on both → kept once;
- different change to the same field → conflict: this phone's value stays, the cloud's copy is saved in History, the
  record is **not sent** until the person decides (Settings → Data safety → Sync review);
- lists of items with an `id` (photos, documents, adverts) are joined item by item; `history` entries are combined;
- deleted on one side and edited on the other → conflict (`deleted-remote` / `deleted-local`), never a silent delete or resurrection.

**"Synced" is earned.** Set only from the cloud's answer for the exact content sent. If the record changed while the
upload ran, it stays *waiting* and is sent next (on top of the version just accepted). The overall status line and the
per-record chip also refuse "Synced" while a conflict or a picture/document upload is outstanding.

**History.** Before a record is replaced (by an edit, a cloud copy, a join, a restore, a delete, the status migration) the
old version is kept on the phone: newest first, 25 per record, edits within 2 minutes count as one step, record fields only
(no sign-in data). The cloud keeps its own last 25 overwritten versions (`eab_record_revisions`, readable by whoever can
read the record). Deleted records stay recoverable ("Recently deleted") for 30 days on the phone.

**Property numbers.** `eab_property_refs` makes the number unique across all prefixes inside a workspace (P1001 blocks
A1001). A refused write answers `ref_conflict` with the number, the other property's reference and — only if this user may
read it — its id and headline. The phone keeps its record untouched, never renames, and explains. Existing duplicate data is
never renamed or deleted: the oldest keeps the number, the rest are listed in `eab_ref_duplicates` (owner/admin can read it)
and edits to them that leave the number alone still work.

**Files.** Private bucket `eab-files`, object path `<workspace id>/<sha-256>`; metadata in `eab_files` (record, workspace,
kind, checksum). Access follows the record: nobody who cannot read the record can read the row or the object (policies in
SQL, not only in the UI). Phone: the file is uploaded after its record is in the cloud; the same content is never stored
twice; a failed upload keeps the phone copy and retries later with a growing pause (3 failures → "failed", "Try now"
button); downloaded files are verified against the checksum; missing/deleted/forbidden files show a placeholder, the record
stays usable. Removing a picture only switches its cloud row off and keeps the phone copy for 30 days.

**Drafts.** Debounced (0.7 s) and flushed when the page is hidden or the form closes; stored in a separate area, never a
record, never synced. Restored only if the saved record is still the one the draft started from; otherwise the person
chooses (autosave pauses meanwhile). Cleared by Save or Discard. Wired to Property, Contact, Task, Inquiry, Appointment and
Deal forms. Follow-up task ids derive from the inquiry/appointment id so pressing Save twice cannot create two tasks.

**Phase 1 status migration.** Verified: every Inactive buyer becomes Dropped, `previousLeadStatus: 'inactive'` stays on the
record, nothing else changes, the report lists exactly those buyers. Added: *Undo* (per buyer or all) restores only
`leadStatus`/`previousLeadStatus` of buyers still exactly as the conversion left them; buyers whose status was changed on
purpose, or that no longer exist, are skipped and reported; later edits are never rolled back. An undone buyer carries
`inactiveKept` so no phone converts it again. Fixed a Phase 1 detail: the Notifications count counted deleted buyers.

**Backup readiness.** `data/manifest.ts` can describe (not restore) records, history, deleted records, cloud versions,
pending state, conflicts, file links/checksums, schema version. No tokens, keys, sample data or file bytes. No second backup
system and no restore were built.

## 3. Migration, and what you must do by hand (later, when you approve)

Files: `supabase/migrations/20261014000000_phase2_sync_refs_files.sql` (additive), `supabase/rollback/20261014000000_phase2_rollback.sql`.
**Created, not applied anywhere.**

1. Supabase → Database → Backups: take a backup (or download an export).
2. Run the duplicate check (SQL Editor) and read the result:
   ```sql
   select workspace_id, coalesce(data->>'refNo', substring(upper(data->>'ref') from '[0-9]+')) as ref_no, count(*)
   from public.eab_records where collection='properties' and not deleted and coalesce(data->>'sample','false')<>'true'
   group by 1,2 having count(*)>1;
   ```
   Rows here are legacy duplicates. The migration will not touch them; fix them from the app when you like.
3. Run the migration file in the SQL Editor. It adds columns (`rev, seq, op_id, written_by, written_at`) to `eab_records`,
   gives existing rows a `seq` in their last-changed order (the only statement that touches existing rows, and it runs
   before the new triggers exist, so it does not create versions or history), adds tables, triggers, functions, policies and
   the private bucket `eab-files` (25 MB limit).
4. Check Storage → `eab-files` exists and is **not** public.
5. Install the new APK on every phone before the migration is relied on; older APKs keep the old protocol, which the new
   function does not serve (see risks).
6. Soft-deleted files: removed pictures stay in the bucket (rows marked `deleted`). To reclaim space, delete objects in
   Storage whose `eab_files` rows are all `deleted = true`.

**Rollback / recovery:** run the rollback file (it deletes cloud history, registry and file metadata but **not** your records
or uploaded objects). Restore from the backup of step 1 if anything looks wrong. The version columns can stay.

## 4. Tests

| Required scenario | Where |
|---|---|
| 1 Draft restored after closing | `phase2-drafts` D2, UI U50, U51 |
| 2 Edit / discard drafts | D3, D4, U50 |
| 3 Save status during failure and retry | `phase2-sync` P2-8, P2-9b, P2-9c, P2-14 |
| 4 Revision preserved | `phase2-history` H1–H4, `phase2-sync` P2-4, P2-20, UI U53 |
| 5 Safe undo of status migration | `phase2-history` U1–U3 |
| 6 Two devices, offline edits, both orders | P2-2, P2-3 (both orders), P2-10 |
| 7 Same-field conflict | P2-3, P2-4, UI U54 |
| 8 Offline duplicate property numbers | P2-16, P2-17, DB tests, UI U54 |
| 9 Duplicate prevention in concurrent sync | P2-18 and DB concurrency test |
| 10 Failed upload and safe retry | `phase2-files` F2, F3, F13 |
| 11 Download on another device | F5, F6 |
| 12 Deleted file/record behaviour | P2-5/6/7, F7, F8, H4 |
| 13 Access policies | F9, F10, DB tests (`rls-test.sh`) |
| 14 No false Synced | P2-9, P2-9b, P2-9c, F2 |

`tests/support/fakeCloud.ts` re-implements the SQL rules so the phone's code can be tested end to end; the SQL itself is
tested separately in `supabase/tests/rls-test.sh`.

## 5. What was and was not tested

- **Local PostgreSQL 16 only** (with stand-ins for Supabase's `auth` and `storage` schemas). **No live Supabase test was run.**
  The Storage HTTP layer (upload/download endpoints, the real policy engine of Storage) was not exercised: object
  policies were checked on the stand-in table only.
- **No real device.** Browser tests ran in desktop Chromium at 384×824. The installed APK is untested.
- Compression-for-upload uses the browser canvas; it is injected away in unit tests.

## 6. Remaining risks and decisions for you

1. **Old APKs will stop syncing** once the migration is live (they call a protocol that no longer matches). Update all
   phones first, then apply the migration.
2. **Legacy records edited before upgrade have no stored base**: the first join can list more fields as conflicts than
   really differ. Safe but noisy; only affects records with unsent edits at upgrade time.
3. **Undo restores the retired value "Inactive"** (shown as "Inactive (retired)", flagged so it is not converted again).
   That is what "undo" means, but it re-introduces a status you retired. Alternative: undo to "no status". Your call.
4. **Originals are not kept**: pictures are already shrunk to 1600 px when added (Phase 1 behaviour); upload sends that copy
   (only a still-large picture over 2.5 MB is shrunk further, for the upload only). Keeping full-size originals would double
   phone storage; not done without your decision.
5. **History is coalesced**: edits within 2 minutes are one step, so an intermediate state within a burst is not kept.
6. **Not covered by drafts**: income/expense forms, journeys, the voice flow, the profile. Not covered by revisions: settings, profile, options.
7. **Cloud objects of deleted files remain** until you clean them (manual step 6).
8. **A limited-role person's own edits** are kept in History and replaced by the cloud copy when that record changes elsewhere.
9. **Join on non-identical id-lists** (e.g. one phone edits a photo's name, another removes that photo) is reported as a
   conflict of the whole list, not item by item.
10. The reference check is by number only (as you confirmed); a property without a number is never blocked.
