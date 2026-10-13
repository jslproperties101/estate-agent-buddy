# Master requirements audit

Branch `feature/v2-complete-and-qa` · written 14 Oct 2026 · `main` is untouched (`e9367695`).

This reconciles the original master instruction, your later decisions, Phase 1, Phase 2, Stages 3–7 and your latest
requests. **Each row has exactly one of five statuses** (listed in the key). "Tested automatically" means the test runs
in Node or in Chromium at 384 × 824 px with stand-ins for Google, GPS, speech, the contact picker and Drive. It is never
evidence about a real Android phone or a live service. Where a row is both automatically tested and unproven on a phone,
the status is the stricter one (“Not verified…”) and the test evidence column says what *was* proven.

Key
- **IT** = Implemented and tested automatically
- **PI** = Partially implemented
- **NI** = Not implemented
- **BD** = Blocked by my decision or setup
- **NV** = Not verified on a real phone or live service (built; automatic tests pass; no real-device or live evidence)

Nothing in this document was copied from an older result: the test counts in section 8 were produced on the commit named there.

---

## 1. Phase 1 — checked item by item against the current code

Phase 1 commit `b1b2521` compared with this branch (`b10fbdc` QA build, `ae634a8` Residential land, `e94e8bc` recheck tests).
A successful CI run was **not** taken as proof: each point below was traced to source and to a test that fails if the behaviour is removed.

| # | Requirement | Verdict | Source | Test evidence | Notes |
|---|---|---|---|---|---|
| 1 | “Saved on this phone” only after the local write finishes; 2 s; no success on failure; errors 6 s | **IT** (success timing); **NV** on a phone | `src/ui/toast.ts` (`TOAST_OK_MS=2000`, `TOAST_ERROR_MS=6000`), `src/data/savestate.ts`, `src/data/store.ts` (write confirmation) | P6, P7, P8, P9 (unit); U43 (browser: message appears after the write, disappears after 2 s, failed write shows an error, never success) | Browser storage failure was simulated; a full or locked Android WebView store was not. |
| 2 | Startup waits for app + storage readiness, honest about slow start, retry | **IT**; **NV** on a phone | `src/startup/startup.ts`, `src/App.tsx` | P1–P5 (unit); U39, U40, U41, U42 (ready at once; slow notice at ~5 s; failure → Try again; Bahasa Malaysia) | No fixed minimum splash. Real Samsung cold start not measured. |
| 3 | Dashboard cards, order, Settings placement, Coming Soon, “Agent Profile” | **IT** | `src/App.tsx` (tiles), `src/profile/ProfileUI.tsx` (Settings inside Agent Profile) | R4 (unit: 15 cards in the approved order; Settings, News and Co-broke are not cards), U44, U45 | **Gap found and fixed in `e94e8bc`:** the order was only checked indirectly; R4 now pins it. |
| 4 | Buyer statuses (Cold blue, Warm yellow, Hot red, Dropped grey, Booked/Bought green); old Inactive → Dropped, original kept, accurate report, Undo cannot overwrite later changes | **IT** | `src/data/types.ts`, `src/data/leadReview.ts` | P10–P12, R1, R2, H-tests in `phase2-history.test.ts` (U2: undo restores only converted buyers, keeps later edits, skips buyers whose status was changed on purpose; U3: another phone does not re-convert an undone buyer), U47, U48 | **Defect found and fixed in `e94e8bc`:** a buyer deleted after the conversion was still counted in the review report and the notification (R1). |
| 5 | Notifications: categories, wording, counts; deleted buyers not counted wrongly | **IT**; **NV** (no push, no notification with the app closed) | `src/agenda/*`, `src/data/leadReview.ts` | U44, R1 | Push messages are marked Coming Soon; nothing claims push works. |
| 6 | Easy Bug Report: screenshots, permissions, upload failures, honest messages; backend migration applied in a test environment? | **IT** for the app side; **NV** for the service | `src/bugreport/report.ts`, `supabase/migrations/20261013120000_bug_reports.sql` | P14–P18 (unit), U45, U46; `supabase/tests/rls-test.sh` applies the migration to a **local PostgreSQL 16 stand-in** and checks insert-as-self and isolation | **Not applied to any Supabase project.** The local stand-in has no Storage, so the private screenshot bucket policy was never executed. Applying it to a real test project is owner-side setup (section 5, item 3). |
| 7 | English / Bahasa Malaysia / Chinese for every new screen and status | **IT** (key coverage); wording **BD** | `src/*/strings.ts`, `scripts/lint.mjs` | R2, R3 (every Phase 1 string key and every buyer status exists in all three languages), U42, U46, lint | BM and Chinese wording are drafts that still need your review. |

**Is Phase 1 genuinely complete?** The application behaviour of items 1–5 and 7 is complete and tested in the browser. The two defects found are fixed. Item 6 is complete in the app and not proven against a real Supabase project. Nothing about Phase 1 is proven on a real phone.

### Why the original Phase 1 CI run failed (run 38396181920 on `b1b2521`)

Failed job: `test` → step “Tests”. Two browser tests failed: **U47** (“stays reviewed after reopening”, 1 !== 0) and **U13** (“previous journeys can be reviewed”, 0 !== 1). The database job, the Android job and lint all passed.

Both were races in the test, not defects in the app: the test reloaded the page or read the screen before the app’s own IndexedDB write had finished, which is quick on a laptop and slower on GitHub’s runners. Evidence: no application code changed in the commits that turned CI green, and the failing assertions passed when the test was made to wait for the stored record (U47: `e10a033`; U13: `9927a89`). The same pattern kept failing on later branches (U50, U54, U57, U70, U71, banner covering a dialog) and was fixed one test at a time.

Not merely flaky: while chasing these, **two real application defects were found by CI and fixed**: the reminder banner covered open dialogs and blocked the Download PDF button (`1dab590`), and the Maps check script was blocked by the first-start sample-data dialog (`759ee6f`, test tooling). The Phase 1 failure itself was test-only.

CI history for this chain (from `gh run list`): `b1b2521` failed; Phase 2 / Stage 3–7 commits failed until `9927a89`; `fb4cd7d`, `b10fbdc` and `ae634a8` are green.

---

## 2. Requirements reconciliation

Source codes: **M** = original master instruction (`docs/AUDIT.md`), **D** = your later decisions (12–13 Oct), **P1/P2** = Phase 1/2, **S3–S7** = Stages, **L** = latest requests (QA APK, icon, Residential land, this recheck).

### 2.1 Foundations, saving, sync, backup

| Requirement | Source | Status | Source files | Test evidence | Outstanding / dependency |
|---|---|---|---|---|---|
| Local-first persistent database | M 5.1 | IT | `src/data/store.ts` | store.test.ts, U4, U52 (upgrade from the Phase 1 layout) | — |
| Form draft autosave | M 5.1, P2 | IT | `src/data/drafts.ts` | phase2-drafts.test.ts, U50, U51 | Real phone close/kill behaviour unproven. |
| Visible save / sync state | M 5.1, P1 | IT | `src/data/savestate.ts` | P8, P9, U43 | — |
| Cloud sync with versions, conflict review | M 5.2, P2 | NV | `src/data/sync.ts` | phase2-sync.test.ts, U54–U58; 125 RLS checks on local PG | **Never run against a live Supabase project.** |
| Latest save wins, earlier version kept in history, restore | M 5.5, P2 | IT | `src/data/store.ts`, `src/data/recordstate.ts` | phase2-history.test.ts, U53 | — |
| Recently deleted with restore | P2 | IT | same | U53 | — |
| Workspace protection (never mix two teams’ records on one phone) | P2 | IT; **NV** with real accounts | `src/data/auth.ts`, `src/data/syncRunner.ts` | phase2-workspace.test.ts, U55–U58 | Needs two real accounts to prove. |
| Unique property numbers across devices (server constraint) | M 8.1, P2 | NV | migration `20261014000000_phase2_sync_refs_files.sql` | RLS script (local PG) | Migration not applied anywhere real. |
| Files / photos sync to cloud storage | M 5.2, P2 | NV | `src/data/filesync.ts`, `src/data/fileRefs.ts` | phase2-files.test.ts | Storage bucket never exercised (no Storage in the stand-in). |
| Old app versions must not damage synced data | L | PI | `docs/PHASE2.md` §3a, §7, §7a; `supabase/proposed/20261015000000_block_direct_writes.sql` | U56–U58; `supabase/tests/write-block-test.sh` (22 checks, local PG) | **Proposal written and rehearsed locally, deliberately not applied.** Until you approve and apply it (after all phones are updated, and after a Supabase test project run), an old APK can still overwrite newer records. |
| Whole-app backup file (ZIP) | L, M 5.3 | IT | `src/backup/zip.ts`, `backup.ts`, `BackupUI.tsx` | backup.test.ts B1–B7, U91 | Share/save on Android unproven. |
| Protected restore (checks, workspace guard, safety copy, never deletes, history keeps replaced versions) | M 5.4, L | IT in test environment | `src/backup/backup.ts` | B1–B7 restore an actual backup into a fresh store and into one with later edits (browser/Node store, **not** a phone) | Default mode is “missing only”; your decision is open (preview-first merge recommended). Per your rule: *restore has restored data in a test environment*, not on a phone or from Drive on a real account. |
| Daily Google Drive backup, 30 copies | M 5.3 (weekly), L (daily, 30) | NV | `src/backup/drive.ts`, `src/data/auth.ts`, `src/App.tsx` | drive.test.ts D1–D7, A4, U92 (stand-in Drive) | **Drive was never called for real.** Needs the Google OAuth `drive.file` scope added to your Google Cloud consent screen. The token lasts about an hour, so the app backs up only **while it is open**; a truly unattended daily backup needs a server job that is **not built** (NI). |
| Unattended server-side daily backup | L | NI | — | — | Needs Supabase Edge Function + stored refresh token + your approval. |
| Backup stored and restored on a second device | L | NI | — | — | Needs real phone. |
| Owner / admin / team roles, audit log | M 6 | PI | `supabase/migrations/20261012120000_workspaces_roles.sql` | RLS script | Five roles in the DB vs the two you need (**BD**: decision); not applied to a live project. |

### 2.2 Dashboard, theme, language, branding

| Requirement | Source | Status | Source files | Test evidence | Outstanding |
|---|---|---|---|---|---|
| Black / gold / white theme, visible borders, clear labels | M 2 | IT | `src/styles.css` | U-layout tests, screenshots | — |
| 15 cards, Agent Profile rename, order | M 4, P1 | IT | `src/App.tsx` | R4 | Subsale / Project stay “Coming Soon” by your decision. |
| Co-broke Opportunity Map | M 11 | BD | — | Coming Soon screen only | Your decision to build it. |
| Languages EN / BM / ZH, lint-enforced | M 20 | IT | `src/*/strings.ts`, `scripts/lint.mjs` | R2, R3, lint | Wording needs your review (**BD**). New code in this audit (backup, Drive, matching) has all three languages. |
| Gold-robot logo: phone icon and top-left menu icon; splash unchanged | L | IT; **NV** on a phone | `assets/icon-*.png`, `src/brand/*.webp`, `src/icons.tsx` | BR1–BR4 | Installed icon on a Samsung launcher not seen. |
| QA APK isolated from production | L | IT; **NV** | `scripts/android-setup.mjs`, `scripts/verify-apk.mjs`, `docs/QA.md` | QA1–QA4; CI built `qa-b10fbdc` | Needs the QA redirect URL added in Supabase (**BD**, live setting). |

### 2.3 Property, references, form

| Requirement | Source | Status | Source files | Test evidence | Outstanding |
|---|---|---|---|---|---|
| Reference prefixes, next-number dropdown, duplicates refused | M 8.1, D | IT | `src/domain/refs.ts` | domain.test.ts, U5 | **Decision open:** numbers unique across prefixes (current) vs per prefix (master). |
| Property fields, collapsible sections, “n filled”, field help | M 8.2, S3 | IT | `src/listing/*` | listing.test.ts, U37 | Storeys stored as `floors`; facilities is free text (PI by wording). |
| Residential land type | L | IT | `src/listing/model.ts`, `illustrations.ts`, `commands.ts` | P5 (listing), C-RL (commands) | — |
| Per-field verification | M 8.3, S3 | IT | `src/listing/verify.ts` | stage3.test.ts | The list of 20 facts needs your confirmation (**BD**). |
| Card preview (long press) | M 9, S3 | NV | `src/listing/ListingUI.tsx` | stage3.test.ts, U-preview | Touch feel unseen on a phone. |
| Duplicate-property detection | M 8.1 | IT | `src/domain/duplicates.ts`, `src/listing/dupStrings.ts`, `ListingForm.tsx` | DUP1–DUP4, U95 | Warns only (never blocks). Offline duplicate refs across devices rely on the server constraint (NV). |
| Global search / saved searches | M | NI | — | — | To build. |
| “Smart Capture” | earlier decisions | BD | removed in the current code | — | **Conflict:** original requirement vs removal. Not restored or discarded silently; you must say which decision is final. |

### 2.4 Contacts, buyers, vendors

| Requirement | Source | Status | Source files | Test evidence | Outstanding |
|---|---|---|---|---|---|
| Buyer list / Vendor list, vendor statuses | D, S3 | IT | `src/contacts/*` | U35 | — |
| Buyer statuses and Inactive → Dropped | P1 | IT | see section 1 | | |
| WhatsApp ID / alias; phonebook button | M 10, D | NV | `src/contacts/ContactsUI.tsx`, native picker | U31, U33 | Native picker on Android unproven. |
| Send Name Card gating | D | IT | `src/profile/ProfileUI.tsx` | U36, N1 | Share on Android unproven. |
| **Buyer requirements (types, areas, budget, beds, land, built-up, tenure, financing, adjoining units)** | M, S5 | IT (this session) | `src/data/types.ts`, `src/contacts/MatchUI.tsx`, `matchStrings.ts`, `ContactsUI.tsx` | M1–M9 (`matching.test.ts`), U93 | Unknown ≠ fit; adjoining units are shown as “cannot be verified from the record”. |
| **Buyer ↔ property matching with reason shown** | M, S5 | IT | `src/domain/matching.ts`, `src/voice/buyerSearch.ts` | M1–M9, U93, stage5-voice tests | — |
| Professional contacts directory (Pejabat Tanah by state, custom categories) | M | NI | — | — | To build. |
| Inactive-contact follow-up (configurable, never auto-inactivate) | M 19 | PI | `src/domain/followup.ts`, `src/contacts/followStrings.ts`, `App.tsx` (Notifications), `ProfileUI.tsx` (setting) | F1–F5, U94 | Reminds only; threshold 14/30/60/90 days or off. “Responsible negotiator” notification to a team member and admin summary: not built (needs team roles live). |

### 2.5 GPS

| Requirement | Source | Status | Source files | Test evidence | Outstanding |
|---|---|---|---|---|---|
| Four GPS cards, House Shopping, My Banner Location, My Property Map | M 11, D | NV | `src/gps/*`, `docs/GPS.md` | U13, U27, U29, U38, stage4/banners tests | **No real GPS reading has ever been checked.** Browser simulated positions only. |
| Google map display | M 11 | BD | — | FAKE_MAPS stand-in | Needs your Maps API key; no real map seen. |
| Screen-off / background GPS | M 11, S4 | NI | — | — | Needs a background-location plugin and permission, plus a new APK: your approval required. |
| Banner status per property | D | IT | `src/gps/BannersUI.tsx`, `src/gps/tracker.ts` | banners.test.ts | — |

### 2.6 Voice, calculator, PDFs

| Requirement | Source | Status | Source files | Test evidence | Outstanding |
|---|---|---|---|---|---|
| Voice command (English/Malay parse; results always reviewed) | M 13, S5 | NV | `src/voice/*` | voice.test.ts, speech.test.ts, stage5-voice.test.ts, U19, U32 | **Microphone never tested on the S23.** Typed text only. |
| Chinese voice commands | S5 | NI | — | — | Parser has no Chinese grammar. Decision recorded as open. |
| Calculator with saved calculations and PDF | M 14, S5 | IT; PDF share **NV** | `src/calculator/*`, `src/domain/calculator.ts` | stage5-calculator.test.ts, U71–U78 | Android PDF share unproven. |
| Buyer PDF | M 15, S5 | IT; share **NV** | `src/lib/pdfRender.ts` | stage5-buyerpdf.test.ts | Same. |
| Android PDF/image share | M, L | BD | — | — | Needs the free share/filesystem plugins and a new APK: your approval required. |

### 2.7 Photos, marketing, advertising

| Requirement | Source | Status | Source files | Test evidence | Outstanding |
|---|---|---|---|---|---|
| Photo Studio: enhance, crop, turn, hand-drawn privacy mask, copy/replace | M 12, S6 | IT | `src/photos/PhotoStudioUI.tsx` | stage6-photos.test.ts, U-photo | Real camera photos from the Samsung unseen. |
| Automatic detection of private details | M 12 | NI | — | — | Needs a decision on method. |
| AI decluttering | M 12 | BD | — | — | Needs an approved service, cost and consent wording; no paid API added. |
| Multi-photo batch processing | M 12 | NI | — | — | To build. |
| Marketing Studio: A4 flyer, square, portrait | M 16, S6 | IT | `src/marketing/*` | stage6-marketing.test.ts | Social sizes unverified against the platforms (**BD**). |
| Brochures, saved templates, AI copy | M 16 | NI | — | — | To build (templates, brochures); AI copy needs a decision. |
| Advertising tracker, fake listings, costs | M 17, S6 | IT | `src/adverts/*` | stage6-adverts.test.ts | — |
| Expiring-ad reminders on the phone | M 17 | NV | scheduled local notifications | stage6-adverts.test.ts | Not shown on a phone. |

### 2.8 Finance and deals

| Requirement | Source | Status | Source files | Test evidence | Outstanding |
|---|---|---|---|---|---|
| Deals, commission, share percentage | M | PI | `src/domain/finance.ts`, sample deals | domain.test.ts | **Open decision:** SST on deals / invoiced state not modelled. |
| Financial summaries / reports | M | PI | same | — | Needs your list of required reports. |

### 2.9 Calendar, tasks, notifications

| Requirement | Source | Status | Evidence | Outstanding |
|---|---|---|---|---|
| To-Do, Calendar, inquiries → viewings | M 19 | IT | U9, U11, U12 | — |
| In-app reminders | M 19 | IT | U44 | — |
| Notifications with the app closed | M 19 | NV | Plugin present; never checked on a phone | — |
| Push messages | P1 | BD | marked Coming Soon | Needs a service; none added. |

### 2.10 Other (security, performance, administration)

| Requirement | Source | Status | Evidence | Outstanding |
|---|---|---|---|---|
| No secrets in code | M 21 | IT | lint check | — |
| Pro label / entitlement | L | PI | config only | No payment or subscription added (needs approval). |
| Terms / Privacy placeholder | L | NI | — | Your legal text needed. |
| Action Centre / readiness | L | NI | — | To build. |
| Offline maps | L | BD | — | Decision open. |
| Services / Google Cloud dependency list | M 22 | PI | `docs/SETUP.md` | `docs/SERVICES.md`, promised in the earlier audit, **does not exist** in the repo: documentation gap. |

### 2.11 Requirements I cannot reconcile

- Master-requirements change items **#43–#53** from your consolidated list were in an attachment that is no longer available to me in full. I did not guess them. **Please resend them or confirm they are covered above.**
- The “OSM vs Google Maps” choice, “only two product roles vs five in the database” and “Settings / Market Intelligence placement” are recorded as open decisions, not resolved.

---

## 3. Conflicts and open decisions register

1. Smart Capture removed vs original requirement.
2. Reference numbers unique across prefixes vs per prefix.
3. Roles: five in the database vs two required.
4. OSM vs Google Maps for maps.
5. SST / invoiced on deals.
6. Database write-block for old APKs (PHASE2 §7).
7. Restore default: “missing only” (current) vs preview-first merge (recommended).
8. Voice behaviour in the background; banner GPS policy after manual correction.
9. Headline placement; the list of 20 verification facts.
10. Chinese voice commands; free share/filesystem plugins.
11. AI decluttering service, cost and consent.
12. Screen-off GPS plugin and permissions (new APK).
13. Terms / Privacy text; Pro entitlement.

---

## 4. Not verified on a real phone or live service

Everything marked NV: live Supabase (sync, RLS, Storage, bug-report bucket), real GPS, camera, microphone, notifications, Android file/PDF/image sharing, Samsung keyboard behaviour, Google Drive (real account), Google Maps (real key), launcher icon, and installing the QA APK. None of it can be claimed until it has been seen on the S23 Ultra or in a real test project.

## 5. Priorities requested, and where they stand

1. **Daily Drive backup, 30 copies, tested protected restore.** Built and tested against stand-ins (section 2.1). Not complete: no real Drive, no unattended job.
2. **Safe sync, history, conflict handling, workspace protection, old versions.** Built and tested locally; old-APK write block proposed, not built; live sync unproven.
3. **Controlled Phase 2 migration test on a separate Supabase test project.** **Needs you**: create a test project and give me its URL and anon key for the QA build only. Only local PostgreSQL 16 has been used (125 RLS checks and 18 rollback checks). Nothing is proposed for production.
4. **Core property/buyer/vendor/commission/financial.** Buyer requirements and matching now done. Professional contacts, inactive follow-up, duplicates, search, deal SST/invoicing remain.
5. **Voice, GPS, photos, marketing, notifications, Android sharing.** Mostly built and browser-tested; real-device proof missing; Chinese voice, batch photos, brochures/templates, screen-off GPS, Android sharing remain.
6. **Gold robot and Residential land.** Done and tested (section 2.2/2.3).

## 6. Test evidence on the latest commit

See section 8; filled in after the final run.
