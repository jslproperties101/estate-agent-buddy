# Change 006 Layer 4 — independent encrypted backup: runbook and the decisions still needed

**Status: code and tests complete; NOT operational.** No storage provider, key holder, schedule or secret exists yet.
Nothing here has run against production or against any real storage. Layer 4 counts as working only after a real
backup has been written to the chosen independent storage AND restored from there by a key holder (rule from the
design: "a backup that has never been restored is not counted as working").

## 1. What it is
The business's own copy of every workspace, outside Google Drive and outside Supabase, so the business can recover if
either is lost, hacked or shut down. Nightly: a database dump (all tables, including record history, audit history and
deleted records still within their keep period) plus every file in the `eab-files` bucket (Supabase database backups
do not include Storage files), encrypted before it leaves the machine that makes it.

Tools (Node.js 20+, no packages): `ops/platform-backup/`
| File | What it does |
|---|---|
| `keygen.mjs <holder> <folder outside the repo>` | one key holder's key pair; private file mode 600; refuses to write inside the repository |
| `make-backup.mjs --dump … --objects … --counts … --key A.public.json --key B.public.json --target <folder>` | encrypted backup + public index, then checks the stored copy; refuses private keys |
| `verify.mjs <folder>` | checks every stored backup's size and SHA-256 **without any key** |
| `restore-backup.mjs --file … --identity <holder.private.json> --out <new empty folder>` | opens with ONE key holder's key, checks every entry, writes `database.sql`, `objects/…`, `manifest.json` |
| `lib.mjs` | the format (see the file header) |

Tests: `node --test ops/platform-backup/platform-backup.test.mjs` (P4-1…P4-10) and
`bash supabase/tests/platform-backup-test.sh` (local PostgreSQL: dump → encrypt → restore into a NEW database with each
key → row counts and content fingerprints equal; tampered file refused). Both run in CI (database job).

## 2. Decisions only the owner can make (nothing is assumed)
1. **Independent storage.** Must be a different company or at least a different account from Supabase and from the
   Google account that holds Drive, with **write-once retention (object lock)** so stolen job credentials cannot delete
   backups. Options from the design: Backblaze B2, Cloudflare R2, AWS S3 (all S3-compatible; a few US dollars a month for
   a small business, so this is a **new recurring cost that needs your approval**). A no-cost interim: an encrypted
   external disk kept by a key holder, with `make-backup.mjs --target /media/disk` run by hand weekly; weaker (no object
   lock, manual), but independent.
2. **Two key holders** (names are yours to choose; the code never assumes them). Each runs `keygen.mjs` on their own
   computer, keeps the private file offline (printed copy and an encrypted USB key in a safe place), and gives only the
   `*.public.json` file to whoever runs the job. Either holder alone can restore; losing both keys loses Layer 4.
3. **Where the nightly job runs.** It needs a direct database connection string and a Storage key that can read the
   bucket. Those are secrets: they live only in that machine's or CI provider's secret store, never in this repository,
   never in logs. A GitHub Actions scheduled job with repository secrets is possible but puts production database
   credentials into GitHub; a small computer you control is the alternative.
4. **Supabase plan.** Supabase Free has no daily backups of its own. Layer 4 does not need Pro, but Pro (about
   US$25/month) gives a second, provider-side copy. Owner default: stay on Free for test/development.

## 3. The nightly job, once decided (outline; not set up)
```bash
# on the job machine, with secrets in its environment (never typed into chat or committed)
pg_dump "$EAB_DB_URL" --format=plain --no-owner --no-privileges --schema=public --schema=auth --schema=storage > database.sql
# copy every object of bucket eab-files into ./objects (Supabase Storage S3 endpoint or the Storage API), names kept
psql "$EAB_DB_URL" -tAc "select json_object_agg(t, n) from (select 'eab_records' t, count(*) n from eab_records union all select 'eab_record_revisions', count(*) from eab_record_revisions union all select 'eab_audit_events', count(*) from eab_audit_events) x" > counts.json
node ops/platform-backup/make-backup.mjs --dump database.sql --objects objects --counts counts.json \
     --key holder1.public.json --key holder2.public.json --target "$BACKUP_FOLDER" --source production
shred -u database.sql; rm -rf objects counts.json         # plaintext never kept
# then copy the .eab and .json to the object-locked bucket with write-only credentials
```
Retention belongs to the storage (object lock + lifecycle: proposal 35 daily + 12 monthly), not to this code, so that
the job's credentials cannot delete backups.

## 4. Monthly restore drill (once operational)
Restore the newest backup into a **new, separate** Supabase or PostgreSQL project (never production):
`restore-backup.mjs` → load `database.sql` → compare the row counts in `manifest.json` → open a few records and photos.
Record the date and result. A failed drill means Layer 4 is not working.

## 5. Whole-platform recovery (design runbook R6)
1. A key holder decrypts the newest backup on a clean computer: `restore-backup.mjs --out ./restore-<date>`.
2. Create a **new** Supabase project (or other PostgreSQL); load `database.sql`; upload `objects/` to its bucket.
3. Run the counts check; open sample records and photos.
4. Point the app at the new project (Supabase URL and anon key are set at build time or in Settings, never in code).
5. Announce. Target: back within one working day, losing at most one day (RPO 24 h, RTO 1 day), without the paid PITR
   add-on.

## 6. Per-user restore (design R5)
Not built. It needs an audited admin console with MFA; until then a per-user restore is done by a developer from a
drill restore (separate project) with the owner's written approval, copying only that owner's rows.
