# Changes 010 and 006 — test plan for a separate Supabase TEST project (two Google accounts, two devices)

Status: **prepared, not started.** Nothing here has been applied anywhere. **Never run these steps on the production
project.** Everything below happens in a new, separate Supabase project that holds no real data.

Files used
- Migrations, in order: `supabase/migrations/20261012000000_eab_records.sql`, `20261012120000_workspaces_roles.sql`,
  `20261013120000_bug_reports.sql`, `20261014000000_phase2_sync_refs_files.sql`
- Change 010 proposal: `supabase/proposed/20261016000000_change010_team_sharing_audit.sql`
- Undo: `supabase/proposed/20261016000000_change010_rollback.sql`
- Already rehearsed on local PostgreSQL 16: `supabase/tests/change010-test.sh` (122/122) and `rls-test.sh` with the
  proposal on top (126/126). The test project proves what the stand-in cannot: real Supabase Auth (Google),
  PostgREST, Storage, the `auth.users` trigger, and two real phones.

## You need
- Two Google accounts used only for testing: **Agent A** and **Agent B** (not your real account).
- Two devices: phone 1 (A) and phone 2 (B). One may be a computer browser if a second phone is not at hand.
- An app build that can be pointed at the test project. Use the **QA app** (EAB QA, separate storage, cannot touch
  the real app). CI builds the QA APK only for branch names containing `qa`, so this needs either a `qa` branch made
  from `feature/change-010-team-audit-exports` (your approval) or the web version opened from a local build.
  The Supabase URL and anon key are typed in Settings on each device and are never committed.
  **Integrated release 2.0.010:** use the QA APK from branch `feature/qa-v2.0.10-integrated` (release `qa-<commit>` on GitHub).
  Never install the normal debug APK for this test. The QA APK has **no** Supabase project built in (the production
  project is deliberately kept out of QA builds): on its sign-in screen open **Connection settings** and type the TEST
  project's URL and anon key (or add them once as repository secrets `EAB_QA_SUPABASE_URL` and
  `EAB_QA_SUPABASE_ANON_KEY`, then rebuild the QA branch). Never type the production project there.
- For the Change 006 Drive checks (Part 3): the Google Cloud project behind the **test** sign-in, with the
  `https://www.googleapis.com/auth/drive.file` scope added to its OAuth consent screen and both test accounts listed as
  test users.

## Part 1 — Set up the test project (owner, about 20 minutes)
1. Supabase → **New project** (free plan is fine), region Singapore. Name it e.g. `eab-change010-test`.
2. Authentication → Providers → **Google**: switch on, using a Google OAuth client for testing.
3. Authentication → URL configuration → Redirect URLs: add `com.jslproperties.estateagentbuddy.qa://auth-callback`
   (and the web address if testing in a browser).
4. SQL editor: run the four migration files **one at a time, in the order above**. Save each output. All must say
   "Success. No rows returned".
5. SQL editor: run the Change 010 proposal. Save the output. Expected: success, no errors.
6. Check that it is in place (paste into the SQL editor):
   ```sql
   select to_regclass('public.eab_teams') is not null as teams,
          to_regclass('public.eab_audit_events') is not null as audit,
          exists (select 1 from pg_trigger where tgname = 'eab_users_disabled') as disabled_trigger,
          exists (select 1 from pg_policies where tablename = 'eab_records' and policyname = 'eab shared read') as shared_read;
   ```
   All four must be `true`. If `disabled_trigger` is false, Supabase refused the trigger on `auth.users`. Write that
   down (it affects step 3.8 only); nothing else depends on it.
7. On phone 1, sign in to the QA app with **Agent A**; on phone 2 with **Agent B**. Each gets their own workspace.

## Part 2 — What to test, and what counts as a pass
Write the result (Pass / Fail + a screenshot) in each row. The ✓ column is for you.

### 2.1 Membership
| # | Do this | Pass when | ✓ |
|---|---|---|---|
| 1 | Phone 1: Settings → Team Workspace → invite Agent B's email | "Invitation waiting" with an expiry 7 days ahead | |
| 2 | Phone 2: open Team Workspace | B sees "From Agent A"; Accept and Decline shown | |
| 3 | Phone 1: Cancel invitation; phone 2: Refresh | invitation gone on phone 2 | |
| 4 | Phone 1: Create invitation link; send it to phone 2; phone 2 pastes it → Accept | both phones list two members; A marked Team owner | |
| 5 | Phone 1: try to invite a third address | not offered / "only two people" | |
| 6 | SQL: `update eab_team_invites set expires_at = now() - interval '1 minute' where status = 'pending';` on a fresh invitation, then accept | "This invitation has expired" | |

### 2.2 Sharing and permissions
| # | Do this | Pass when | ✓ |
|---|---|---|---|
| 1 | A adds two properties (P1, P2) and syncs | — | |
| 2 | Phone 2 Property List, Team Workspace | **nothing** of A's yet (joining shares nothing) | |
| 3 | A: Manage Sharing (gear) → P1 View Only → Save; B syncs | B sees P1 only, creator "Agent A" bottom-right; no Edit, no Delete | |
| 4 | A: P1 → View and Edit; B edits the price and syncs; A syncs | A sees B's price; A is still the owner | |
| 5 | B opens P1 → Request deletion; A: Team Workspace → Approve | P1 moves to A's Archived section; B can restore it | |
| 6 | A: Share All → Property listings (View Only) → confirm; add P3 | B sees P1–P3; turning Share All off leaves only P1 | |
| 7 | B shares one of B's own properties with A | A sees it; A cannot share it onward (no gear on it) | |
| 8 | A shares a To-Do with View and Edit; B deletes it | deleted on both phones after sync | |
| 9 | Calculator | never appears in Manage Sharing or in the Team Workspace | |
| 10 | Switch Personal ↔ Team on both phones | Personal shows only one's own records; no sign-out needed | |

### 2.3 Audit history
| # | Do this | Pass when | ✓ |
|---|---|---|---|
| 1 | Open P1 → View History (bottom, closed) → open | B's edit shows exact before/after, "By Agent B", time like "15 Oct 2026, 4:30 PM (MYT, UTC+8)" | |
| 2 | Open and close P1 three times | no new entries (views are not logged) | |
| 3 | Settings → Audit History → search "P1" | results only for records the person may see now | |
| 4 | A: Delete old entries → pick one → confirm | gone from the history; SQL `select count(*) from eab_audit_backup;` increases by 1; the app cannot read that table | |

### 2.4 Exports
| # | Do this | Pass when | ✓ |
|---|---|---|---|
| 1 | P1 → View History → Export history → PDF | preview shows scope, filters, counts, size; file `Audit-History-P1001-YYYYMMDD-EXP….pdf`; header/footer/watermark on every page | |
| 2 | Same as XLSX with snapshot | opens in Excel/Sheets: 3 sheets, filters on, header frozen, CONFIDENTIAL on each sheet | |
| 3 | Save or share to phone, and Keep in the app | file saved/shared on Android (**first real test of Android sharing**) | |
| 4 | Export Management → Saved Exports → delete one; Deleted Exports → restore; delete permanently | counts and messages as specified; "Kept until permanently deleted" | |
| 5 | B deletes B's own copy of A's record | allowed; A's record and history untouched | |

### 2.5 Ending, rejoining, disabled account
| # | Do this | Pass when | ✓ |
|---|---|---|---|
| 1 | B: End Team Workspace (exact warning text) | A's records disappear from phone 2 at once; B keeps B's own | |
| 2 | A: invite B again; B accepts | B sees **nothing** of A's until A shares again | |
| 3 | A: View History of P1 | B's earlier actions are still there | |
| 4 | Phone 2 airplane mode; B edits B's own record; back online | edit syncs; shared-record changes made offline are sent only if access still holds | |
| 5 | Supabase → Authentication → Users → **ban** Agent B; phone 2 syncs | phone 2 loses access, shared records gone; unban + rejoin: nothing returns by itself | |

### 2.6 Rollback rehearsal (test project only)
1. Supabase → Database → Backups: note the latest backup (or export the tables).
2. SQL editor: run `supabase/proposed/20261016000000_change010_rollback.sql`.
3. Pass when: both agents' own records are unchanged, the apps keep syncing their own records, and the Team Workspace
   screen says it is not switched on. Then re-run the proposal to continue testing if needed.

## Part 3 — Change 006 backup and recovery (same test project, test accounts only)
Before starting: Google Cloud console (test project) → APIs & Services → enable **Google Drive API**; OAuth consent
screen → Scopes → add `.../auth/drive.file`. Then on phone 1: Agent Profile → Settings → Backup and restore →
**Connect Google Drive** and allow.

### 3.1 Layer 1 — record history (cloud)
| # | Do this | Pass when | ✓ |
|---|---|---|---|
| 1 | SQL: `select to_regclass('public.eab_record_revisions');` | not null (Phase 2 migration in place) | |
| 2 | Phone 1: edit P1's price twice, sync; SQL: `select count(*) from eab_record_revisions where record_id='<P1 id>';` | ≥ 2 | |
| 3 | P1 → History → restore the first version → sync | price back on both phones; View History shows the restore with before/after | |
| 4 | Airplane mode: edit P2; close and reopen the app; back online | edit still there after reopening; syncs; one audit entry, not two | |

### 3.2 Layer 2 — readable folders (real Google Drive)
| # | Do this | Pass when | ✓ |
|---|---|---|---|
| 1 | After connecting, open drive.google.com with Agent A | folder **Estate Agent AI Buddy** with Property Listing/…/Owner/Property Details.txt, Pictures/01-…jpg | |
| 2 | Add a title deed (Confidential) to P1, sync, Back up to Drive now | the deed **is** in A's Drive under Documents/Property Title (owner decision); P1's file line says "confidential: not shared with your team" | |
| 2a | A shares P1 with B (View and Edit); B syncs | B sees P1 but **not** the title deed; SQL `select count(*) from eab_files where name = 'Geran.pdf';` = 0 (never in the shared bucket) | |
| 2b | A stops sharing P1 (or B leaves the Team Workspace); B syncs | P1 disappears from phone 2 | |
| 3 | Edit P1's price, sync, Back up to Drive now | Property Details.txt updated; previous copy in `Recovery/` with the time in its name | |
| 4 | In Drive, edit a To-Do .txt by hand; Back up to Drive now | your text kept in To-Do/Recovery "edited outside the app"; the app's text back; Settings says so | |
| 5 | Delete P2 permanently in the app, sync, back up | P2's folder moved to its parent's `Recovery/`, not deleted | |
| 6 | A record B shares with A | never appears in A's Drive | |
| 7 | Settings: readable folders line | "complete", or "partial" with the reason (e.g. waiting for sync) | |

### 3.3 Layer 3 — restore points (real Google Drive)
| # | Do this | Pass when | ✓ |
|---|---|---|---|
| 1 | Back up to Drive now | Disaster Recovery/Restore Points/<time>/manifest.json, records.json, Restore Point.txt; message names the point | |
| 2 | Open records.json in Drive and search for the Supabase key, "accessToken", "refreshToken", the Maps key | none found | |
| 3 | Uninstall the QA app (or use phone 2 signed in as A on a clean install), connect Drive, Restore points → newest → Check | preview shows counts; restore brings back records, photos and documents, **including the title deed** | |
| 4 | Change a byte in one Objects file (download, edit, upload over it), try that point again | refused: "did not pass its checks"; nothing changed | |
| 5 | Leave the app closed for 3 days, then open it | warning shows the last point's date; a new point is made at start | |
| 6 | An older `.zip` in "Estate Agent AI Buddy backups" (from the previous QA app) | still listed under "Older backup files on Drive" and restores | |

### 3.4 Layer 4 — not part of this test
Layer 4 needs a storage provider and two key holders first (`docs/CHANGE_006_LAYER4.md`). Its format and a full
dump → encrypt → restore-into-a-new-database rehearsal pass automatically on local PostgreSQL in CI.

## After the test
- Fill in this file's ✓ column (or send the screenshots) so `docs/CHANGE_010.md` can move rows from **NV** to verified.
- Only after a clean pass do we discuss production, and that needs your explicit approval.
