# JoyChange003 - Batch B2 (19 Oct 2026)

The rest of Change 51: remembered dropdown values follow the account across devices. Model: Opus 5.5 + High (Joe's pick, as recommended). Read after `HANDOVER_JOYCHANGE003.md` and `JOYCHANGE003_BATCH_B.md`.

## What it does
- Everything the app remembers for a dropdown (towns, streets, neighbourhoods, reference prefixes, custom field names, deal fields …) and the agent's own WhatsApp texts (Change 64) now go with the signed-in account to the agent's other phones and the laptop website.
- Adding, using, renaming (including the lists under a renamed entry) and deleting are all carried over; so are values restored from a backup.
- Values belong to the PERSON, not the team workspace: a teammate never receives them, and an owner does not get every agent's values mixed into theirs.
- The values already on a phone before this version are sent to the account at its first sync, so nothing is lost.
- Two devices changing the same value: the change made last wins, by the time it was made. A deletion is kept as a deleted row, so a device that was offline does not bring the value back.
- Another account signing in on the same phone gets its own values (the previous person's stay on their account; any of their changes not yet synced on that phone are dropped).
- A database without the new table (the live one, until it is rebuilt) is detected and simply skipped: records keep syncing and nothing fails.

## How
- Database: `supabase/migrations/20261019120000_joychange003_user_options.sql`: table `eab_user_options` (one row per person, list and value; not readable or writable directly), functions `eab_options_push` (newest change wins) and `eab_options_pull` (the caller's own rows after a position). A disabled account (Change 010) is refused.
  - **Applied to the TEST database (EAB-QA-Test, talksazsqsgjriamwxdp) only**, and checked there with a rolled-back test. The live database was not touched; it needs this migration when it is rebuilt for going live.
  - SQL tests: `supabase/tests/user-options-test.sh` (11 checks, run on a local PostgreSQL: own rows only, no direct table access, no anonymous use, newest change wins in any letter case, deletion kept, re-adding keeps the first added time, bad input skipped, at most 500 rows at once).
- App: `src/data/optionSync.ts` (the rules), `src/data/store.ts` (every change to the options is compared before/after and queued in `meta.optSync.pending`; values from the cloud are applied without being queued), `src/data/sync.ts` `syncOptions` (runs inside every sync, after the records; it can never fail the records' sync).
- Why not a record collection (as first suggested in Batch B): records belong to the team workspace and two phones adding the same value would show as "conflicts" in Sync review. A per-account table matches "remembered on the account" exactly and needs no conflict screen.

## Tests
- Unit: `tests/joychange003-batchB2.test.ts` B2-1..7 (two phones and a teammate through the stand-in cloud; `tests/support/fakeCloud.ts` follows the SQL).

## To test on the phone
- Sign in with the same account on the phone (QA app) and the laptop website (or two phones).
- On one, add a new town or street in a property form and an own WhatsApp text; let it sync (on its own, or tap "Sync now" in Settings). On the other, sync: the new values appear in the dropdowns and the WhatsApp list.
- Delete or rename one on the second device; sync both: the change shows on the first.
