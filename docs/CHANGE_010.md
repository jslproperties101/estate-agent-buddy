# Change 010 — Team Workspace, Audit History & Export Management: requirement → code → test

Branch `feature/change-010-team-audit-exports`, based on `feature/qa-changes-001-009` (`5037b41`). Local commits only:
nothing pushed, deployed, or applied to any Supabase project.

**Status key.** **IT** = implemented and covered by automated tests (Node unit tests, Chromium at 384 × 824 against
stand-in clouds, and/or local PostgreSQL 16). **NV** = built and automatically tested, but *not verified* on a live
Supabase project or a real Android phone. **PI** = partial. **BD** = blocked / owner decision needed.
Every Change 010 server rule is in a **proposal** (`supabase/proposed/20261016000000_change010_team_sharing_audit.sql`,
rollback beside it) that has only ever run on local PostgreSQL 16. Until it is applied to a project, the app says
plainly that Team Workspace is not switched on, and everything else keeps working (tests S1, C8).

## Test layers
| Layer | Where | What it proves |
|---|---|---|
| Database | `supabase/tests/change010-test.sh` (122 checks); `rls-test.sh` re-run with the proposal on top (`EAB_WITH_CHANGE010=1`, 126) | The SQL rules themselves, with Supabase's auth stand-ins. Not a real Supabase project (no Storage, no real Google sign-in). |
| Unit (Node) | `tests/change010-access.test.ts` (A1–A13), `change010-sharing.test.ts` (S1–S14), `change010-audit.test.ts` (AU1–AU9), `change010-exports.test.ts` (R1–R7, E1–E4) | Access policy, sync of shared records between two phones, audit model/sync, report/PDF/XLSX rules, saved-export lifecycle. Stand-in cloud: `tests/support/fakeTeamCloud.ts`. |
| Browser | `tests/ui-change010.test.mjs` (C1–C12) | The screens, two phones in two browser contexts sharing one stand-in cloud; real PDF/XLSX downloads (XLSX also opened with openpyxl, PDF rendered with pdftoppm during development). |
| Device | — | **None.** Nothing in Change 010 has been run on the S23 Ultra. |

## C. Team Workspace and permissions
| Requirement | Status | Code | Tests |
|---|---|---|---|
| Personal ↔ Team switch without signing out; other Google account needs sign-out (unchanged) | IT, NV | `team/access.ts` (`currentView`, `visible`), `team/TeamUI.tsx` `WorkspaceSwitch`, `settings.workspaceView` | A9, S14, C4 |
| Max two people; one active Team Workspace per person | IT, NV | SQL `eab_team_invite`/`eab_team_accept` (row lock + count), unique index `eab_team_members_one_active` | DB "team is full", S3 |
| Invite by Google email or link; accept/decline after Google sign-in | IT, NV | SQL invite/accept/decline; `team/api.ts`; Team screen; `?team-invite=` captured on start | DB, S2, S3, C1, C2 |
| 7-day expiry; sender may reissue; sender cancels any time, link stops working | IT, NV | SQL `expires_at`, `eab_find_invite`, `eab_team_cancel_invite`; token stored only as SHA-256 | DB expiry/cancel checks, S3, C1 |
| End with the exact warning text | IT | `team/strings.ts` `EXACT` (kept out of Title Case), Team screen | C7, A13 |
| Ending revokes immediately; reconnect needs new invitation; old permissions never return | IT, NV | SQL `eab_end_team`; phone forgets shared records at once (`dropAllShared`, `Store.forgetRecord`) | DB leave/remove/rejoin, S10, S11, C7 |
| Leaver keeps own personal listings; nothing transfers; departure deletes nothing | IT, NV | no transfer anywhere; only shared-in copies are forgotten | DB "B keeps own records", S10, C7 |
| Disabled Google account: permissions revoked at once; on return nothing comes back | IT (DB stand-in), NV | trigger `eab_users_disabled` on `auth.users` + `eab_account_ok` in every check; phone drops shared on `no-access` | DB disabled checks, S12 |
| Audit kept indefinitely; former member's past edits stay in the record and its trail; team owner reviews former members' actions | IT, NV | no cloud expiry; `eab_audit_events` immutable; read policy | DB, AU8 |
| Two-way, independent, owner-chosen, not transitive; joining reveals nothing | IT, NV | `eab_shared_level`, `eab_share_set` (owner only, own workspace) | DB, S2, S9 |
| Selected sharing; add/remove later; Share All (existing + future) with confirmation; turning off revokes only Share All access | IT, NV | `eab_share_all_set`; Manage Sharing (confirm dialog) | DB, S8, C3 |
| View Only / View and Edit per recipient; immediate, no acceptance, no notification | IT, NV | SQL levels + RLS `eab shared read/update`; store `AccessError` | DB, A2–A4, S4, S5, C4 |
| Manage Sharing with gear icon; search recipients and listings; who can access what | IT | `ManageSharingScreen` | C3 |
| No onward sharing | IT, NV | `eab_share_set` refuses non-owner; `can('share')` | DB, S9 |
| Categories: properties, buyers, vendors, To-Do, Calendar; Calculator private | IT, NV | `SHAREABLE`, `scopesOf`, SQL check constraints | A6, A7, DB |
| Only own listings can be shared; owner leaves → access ends, no transfer | IT, NV | as above | DB, S10 |
| Creator name (email fallback) bottom-right in a distinctive colour on shared cards; created-by in details | IT | `CreatorTag` (teal), `SharingLine` | C4 |
| Shared To-Do/Calendar: owner and editor may edit/delete; audited | IT, NV | `can('delete')` for tasks/appointments; SQL rule | A4, S7, DB |
| Delete property → Archived section at the end, less prominent, recoverable indefinitely | IT | `Listing.archived`, Property List archived section, detail Restore | C5, C6 |
| Restore subject to permissions; archived keeps View History incl. delete/restore | IT | `actionFor` archive/restore; ViewHistory on archived detail | AU3, C6 |
| View Only cannot delete/restore; editor edits/restores; only owner permanently deletes | IT, NV | `can`, store guard, SQL `eab_shared_write_rules` | A2, A3, S6, DB |
| Editor requests deletion; owner approves | IT, NV | `eab_request_delete`/`eab_decide_delete`; Team screen | DB, S6, C5 |
| Others' private listings hidden; archived only own or authorised | IT, NV | RLS; `visible()` | DB, S4 |

## D. Audit History
| Requirement | Status | Code | Tests |
|---|---|---|---|
| Field edits, deletions, restorations, permission and membership changes, exports recorded; views not logged | IT, NV | `Store.recordAudit`, SQL `eab_log`, `recordExport` | AU2, AU3, AU7, R7, C9 |
| Exact before/after; one grouped entry per save, expandable | IT | `audit/model.ts` `diffFields` | AU1, AU2, C9 |
| Actor name, email fallback; newest first; "15 Oct 2026, 4:30 PM (MYT, UTC+8)" | IT | `fmtMyt` (fixed UTC+8), `actorLabel` | AU4, AU5, C9 |
| View History at the bottom, collapsed: properties, buyers/vendors, To-Do, Calendar, saved calculations | IT | `audit/AuditUI.tsx` `ViewHistory` | C9 |
| Anyone currently authorised may view; former members cannot | IT, NV | read policy via `eab_can_read`; local cache forgotten | DB, AU8 |
| Kept indefinitely; corrections never erase entries | IT | insert-only + immutable trigger | DB |
| Owner deletes old entries after warning; copies kept in a backup not readable from the app; never auto-deleted | IT (local + DB), NV | `eab_audit_delete` → `eab_audit_backup` (no policy/grant); local `auditbak:` keys never shown | DB, AU9 |
| Search/filter across authorised records | IT | `AuditSearchScreen` | C9 |
| Previous-version **field** restore | **BD** | not built (see decisions); Phase 2's whole-version restore is unchanged | — |

## D. Search/export scope, E. reports
| Requirement | Status | Code | Tests |
|---|---|---|---|
| Export current record or authorised search results; PDF and XLSX | IT | `exports/generate.ts`, `AuditExportScreen` | R2, C10 |
| Person filter; action types (all selected by default) | IT | `applyAuditFilters`, export screen | AU6, R2 |
| All available history always; no date truncation (dates only filter the search view) | IT | no date input on export; `dateHint` on search | R2 |
| History-only / with snapshot; snapshot privacy safeguards | IT | `snapshotOf` (confidential documents, IC/NRIC/passport/bank withheld; photos counted) | R4 |
| Archived records exportable without restoring | IT | archived records are still visible | (archived in C5/C6; export path same as R2) |
| Record ID, export date, exporter, unique reference (+ "does not prove unaltered" note) | IT | `buildReport`, `newExportRef` | R1, R5, C10 |
| Permission summary and history (subject to authorisation) | IT | `ReportRecord.permissions` | R5 |
| Totals by action type; earliest/latest; MYT | IT | `buildReport` | R2 |
| Standard confidentiality warning (no extra confirmation) | IT | `EXACT_EXPORT` | C10, R6 |
| PDF: branding + logo, title, date; header/footer every page; watermark; no agency/TOC/signature; headings once | IT | `exports/pdfReport.ts`, `renderPagesToPdf` | R5, C10 |
| XLSX: 3 sheets (snapshot optional), filters + frozen header, action colours with labels, CONFIDENTIAL + warning every sheet | IT | `exports/xlsx.ts` | R6, C10 (opened with openpyxl) |
| File name template and extension; no copy-reference button | IT | `exportFileName` | R1, C10 |
| Preview (scope, filters, count, estimated size) + confirmation; large warning; progress; cancel; no false success | IT | export screen | C10 |
| Save/share to phone; keep in app | IT (browser download); **NV** on Android | `shareOrDownload`, `keepExport` | C10 |
| Every export recorded in each record's trail (multi-record too) | IT, NV | `recordExport` — one event per record, so no model gap | R7, C10 |

## E. Saved and Deleted Exports (Q103–Q120)
| Q | Status | Tests |
|---|---|---|
| 103 confirm with count · 104 audit every deletion (count, refs) · 105 one retry, keep and name failures, retry | IT | E1, E2, E4, C11 |
| 106 Deleted Exports recoverable · 107 confirm permanent delete, owner only · 108 bulk restore with results | IT | E1–E3, C11 |
| 109 restore without extra confirmation · 110 search/filters · 111 details · 112 exact retention text · 113 count inside the section | IT | C11 |
| 114 newest deletion first · 115 no Restore All · 116 select all matching · 117 selection cleared on change | IT | C11 |
| 118 permission recheck, name inaccessible files, continue with the rest · 119 brief notification, actionable failures | IT | E3, E4, C11 |
| 120 remember the section (not search/filters) | IT | C11 |

## Bugs found during the regression pass (fixed, with tests)
- Reference-number checks counted properties shared by the other agent, so an agent's own P1001 could not be saved
  when the partner's P1001 was shared (C12 fails without the fix).
- The fix above first introduced a crash in New Property (variable used before definition); caught by the existing
  browser tests U4–U8, fixed, suite green.
- Archived properties are kept out of buyer matching, advert reminders, maps, property pickers and voice updates.

## Test results on the final commit (this machine)
| Check | Result |
|---|---|
| TypeScript (strict) | 0 errors |
| Lint (incl. EN/BM/ZH coverage) | passed, 216 files |
| Unit tests (Node) | 367 / 367 (319 before Change 010) |
| Browser tests (Chromium 384 × 824, stand-ins) | 115 / 115 (103 existing + 12 Change 010) |
| DB: existing RLS / rollback / write-block | 125 / 125 · 18 / 18 · 22 / 22 |
| DB: Change 010 proposal | 122 / 122 |
| DB: existing RLS with the proposal applied on top | 126 / 126 |
| Android / live Supabase | not run |

## Decisions I made (please confirm or change)
1. **Team owner** = the agent who created the Team Workspace (sent the first invitation).
2. **One active Team Workspace per person**; leaving or removing the other person **ends** it for both.
3. **Personal Workspace** shows my own records; **Team Workspace** shows what I share plus what is shared with me.
4. **Saved export copies stay on the phone that made them** (not synced). Taken literally, Q107/E-rules mean only the record's owner may delete a copy, so a recipient cannot delete their own copy of the owner's record. Implemented literally; please confirm.
5. **Multi-record file name** uses `MULTI<n>` as the record part; every record ID is listed inside the report.
6. **Export reference** format `EXP` + 8 random characters (e.g. `EXP7K2M9QX4`).
7. **Deleting a property** now archives it (old behaviour: removed, 30 days in Recently deleted). Permanent delete from the archive uses the old path (still 30 days in Recently deleted on that phone).
8. **Deleted audit entries' backup**: cloud table `eab_audit_backup` (no API access) and hidden `auditbak:` keys on the phone. Not added to the backup ZIP (Change 006 untouched).
9. **Report language** follows the app language; the English texts are the approved wording; BM/ZH are drafts.

## Owner decisions still open (BD)
- Previous-version **field** restore (not finalised in the requirements; not built).
- Whether audit history should be part of the whole-app backup ZIP (would change Change 006's area; not done).
- Recipient-made export copies of an owner's record (decision 4).

## Known gaps
- **Nothing is applied to Supabase.** Next step: apply the proposal to a separate Supabase **test** project, then test two real Google accounts on two phones.
- Disabled-account revocation depends on a trigger on `auth.users`; verified only on the local stand-in.
- Files (photos) of shared records use the same storage rules as the records; no Storage exists in the stand-ins, so this is unverified.
- No push notifications (none required).
- Android share/save of PDF/XLSX unverified (same limitation as earlier PDFs).
