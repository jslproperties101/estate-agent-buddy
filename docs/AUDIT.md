# Estate Agent Buddy — Audit against the Master Development Instruction

Audited: 12 Oct 2026, branch `feature/v2-full-update` (PR #1), commit `2828bc0` ("Version 2.0").
Checkpoint before any change: tag `checkpoint/pre-v2.1`.

## How this audit was done

- Every source module under `app/src` was read (data layer, domain rules, screens, adapters), plus `supabase/`,
  `schema.sql`, the scripts and the tests.
- The existing checks were run in Claude's workspace before changing anything: type check (strict) passed, project
  lint passed, unit tests 36/36, build passed, browser screen tests 22/22 (Chromium at 384 × 824 px).
- The package registry is blocked in this workspace (HTTP 403), so the same machine-installed versions of React 19.2.8,
  TypeScript 6.0.3, esbuild 0.28.2 and Playwright 1.56.0 were linked, as in the previous build.
- Nothing was tested on a real phone, and no live Google, Supabase or AI service was used.

Status labels: **DONE** (implemented and verified by a test), **PARTIAL**, **NOT DONE**, **NOT PROVEN** (code exists,
real operation not demonstrated), **BLOCKED** (needs credentials, a decision or a device).

## Architecture found

| Layer | What exists | Assessment |
| --- | --- | --- |
| Framework | React 19 + TypeScript (strict), esbuild, one code base for phone browser and desktop | Keep. Suitable for Android/iOS through Capacitor; no reason to change framework. |
| Local database | IndexedDB (`records` + `files` stores), one row per record, memory fallback with a visible warning | Keep. Survives reloads (test U4). |
| Store | Single store, writes queued per change, stable device-made UUIDs, dirty list + tombstones for sync | Keep; extend with revision history and save-state indicator. |
| Cloud | Supabase table `eab_records` (JSON per record, row-level security per user), manual "Sync now", newest-wins | Keep and complete; not yet multi-user or role-aware. |
| Long-term schema | `schema.sql`: 48 relational tables incl. workspaces, members, audit_log, backup_runs, sync_conflicts | Design only, not applied. Good basis for roles/audit. |
| Platform adapters | `lib/phonebook` (Contact Picker API), `lib/notify` (Capacitor LocalNotifications if present), `voice/recognizer` (Web Speech API), `gps/tracker` (Geolocation + wake lock), `maps/google` (Maps JS loader) | Browser adapters exist; **no Capacitor project exists yet**, so Android/iOS native paths are unproven. |
| i18n | EN / BM / ZH string modules per feature; lint enforces all three | Keep. BM/ZH are drafts for the owner to check. |

## Section-by-section status

### 1. Audit first — DONE (this document)

### 2. Design theme
| Item | Status | Notes |
| --- | --- | --- |
| Black / shiny gold / white theme | DONE | CSS tokens in `styles.css`. |
| 2.1 Form borders visible | NOT DONE → Stage 1 | Field border `#4A4231` on `#0E0E10` is too dark (~1.9:1). No hover, disabled, read-only or error states. Styles are already shared (one rule for all inputs/selects/textareas + `.opt-btn`), so the fix can be global. |
| 2.2 Labels clearer | PARTIAL → Stage 1 | Labels are 14 px, muted `#BEB7A6`, weight 600 — readable but close to helper text and placeholder colour. |
| 2.3 Explorer-style dashboard, progress near top | PARTIAL → Stage 1 | Tiles have the gold explorer look; there is no explorer progress strip. |

### 3. Cross-platform — PARTIAL
Shared React/TS code works in mobile and desktop browsers (tested at phone width only). The layout is capped at
720 px. No Capacitor Android or iOS project exists; native contacts, background GPS, local notifications and file
sharing on Android/iOS are **NOT PROVEN**. Browser fallbacks exist for phonebook (typing), notifications (in-app),
speech (typing). **BLOCKED** for real-device testing until the Android/iOS shells are built and you test on phones.

### 4. Dashboard, 15 cards
| Item | Status |
| --- | --- |
| 12 existing cards, 3 × 4 | DONE |
| Subsale, Project, Co-broke cards | NOT DONE → Stage 1 |
| Rename to "Agent Profile" | NOT DONE → Stage 1 |
| Coming Soon labels | PARTIAL (Opportunities says "Not built yet") |

### 5. Database, saving, sync, Drive backup
| Item | Status | Notes |
| --- | --- | --- |
| 5.1 Persistent local database | DONE | IndexedDB; reload test U4. |
| 5.1 Automatic saving | PARTIAL | Every *store* change is written at once, but forms (property, contact, task…) need a Save tap; unsaved form edits are lost if the app closes. Needs draft autosave with debounce. |
| 5.1 Visible save / sync state | NOT DONE | Only a storage-failure toast. |
| 5.2 Cloud sync | NOT PROVEN | Supabase code + table exist; manual "Sync now" only; no automatic retry; never run against a live project. |
| 5.2 Images/files to cloud storage | NOT DONE | Photos and documents stay on the phone. |
| 5.3 Weekly Google Drive backup | NOT DONE | No code. Needs a server-side scheduled job + Google OAuth (owner authorisation). |
| 5.4 Restore with safety checks | NOT DONE | |
| 5.5 Latest save wins + earlier edit kept in history | PARTIAL | Newest-wins exists; the overwritten version is **not** kept. |

### 6. Owner / admin / team roles — NOT DONE
Single-user app. Supabase RLS is per user only. `schema.sql` has workspaces/members/audit_log but is not applied.
Server-side roles, audit log, deactivation: NOT DONE. Inactive-contact rule (notify responsible negotiator; admins see
summary): NOT DONE (no "responsible negotiator" field yet).

### 7. Sample data — PARTIAL
~10 sample properties, vendors/buyers, inquiries, viewings, tasks, deals; all flagged `sample`, loaded and removed only
from Settings; real records are untouched. Photos are drawn illustrations, clearly labelled "Sample picture".
Missing: advertising records per section 17, saved calculations, a clear "demo data" marker on every list row.

### 8. Property references and records
| Item | Status | Notes |
| --- | --- | --- |
| 8.1 Prefixes P, A, B, C, D, I, INT, ZA + custom | DONE | Test U5. |
| 8.1 Next number suggestion, duplicates refused, manual entry | DONE | Owner rule (12 Oct) makes the number unique **across all prefixes**; master says "next unused number for the chosen prefix". Both give P1003 in the P1001/P1002 example. **Decision needed** if you want numbers to repeat across prefixes (P1003 and A1003 both allowed). Kept as is until you decide. |
| 8.1 "Available" label | DONE (not shown) | |
| 8.1 Offline duplicate protection across devices | NOT DONE | Needs a server-side unique constraint once team sync exists. |
| 8.2 Fields | PARTIAL | All listed fields exist except **number of storeys** is stored as `floors` (label check), and **facilities** is a free-text "features" field. |
| 8.2 Headline lower in the form | DONE (Stage 3, branch `feature/v2-stage3-property-contacts`) | Moved to the top of Marketing (see Stage 3 status below; the master copy in the repo has no field-order list, so this placement needs your confirmation). |
| 8.2 "Fill by Voice" centred and larger | DONE (Stage 3) | Big centred button; voice-filled fields must be reviewed before saving. |
| 8.3 Per-field verification (Confirmed / Owner stated / Need to check / Unknown) | DONE (Stage 3) | Stored on the record (`verification`), so it syncs, merges and appears in history. |

### 9. Card tap / long-press preview — PARTIAL
Tap opens details (DONE). Long-press preview and a visible Preview button: DONE in Stage 3 (browser-tested; real-phone touch feel not yet checked).

### 10. Contacts
| Item | Status |
| --- | --- |
| Phonebook icon beside the phone field | DONE (13 Oct picker; Stage 3 puts an icon beside the contact phone box and the property owner phone box, with clear messages for refused / cancelled / unsupported) |
| Native contact picker on Android/iOS app | NOT PROVEN / BLOCKED (no native shell) |
| WhatsApp ID / Alias field | DONE (13 Oct) and re-checked in Stage 3: kept separate from the phone, never turned into a number, searchable; Call/WhatsApp links need a usable number (9+ digits) |

### 11. GPS Assistance
| Item | Status | Notes |
| --- | --- | --- |
| Four cards | DONE (browser) | House Shopping, My Banner Location, My Property Map, Co-broke Opportunity Map (Coming Soon). |
| House Shopping: start/pause/resume/stop, distance, time, route sketch, saved journeys, marks, save property on the way | DONE in browser (test U13 with simulated positions) / NOT PROVEN on a phone | |
| Google map display | BLOCKED | Needs your Maps API key. Without it the app says so and draws a route sketch only. |
| Background / screen-off tracking | NOT DONE / BLOCKED (needs native app) | Limitation is shown in the app. |
| My Banner Location | DONE in browser / NOT PROVEN on a phone | Banner positions, dates, photos, history; per-property banner status. Map display needs your Google key. |
| Rename Map → My Property Map | DONE |
| Co-broke Opportunity Map (Coming Soon) | DONE (Coming Soon screen) |

### 12. Photo enhancement, privacy masking, AI declutter — NOT DONE
Only automatic resize/compression on upload.

### 13. Voice command — NOT PROVEN (Stage 5: diagnostics and the three missing commands built; see docs/STAGE5.md)
Web Speech API recogniser, on-device command parser for property create/find, to-dos, appointments, contacts; spoken
numbers ("five hundred thousand", BM equivalents) parsed; results always open a form for checking (nothing saved
silently). Tested with typed text only (U19); real microphone never tested. Likely reasons it "doesn't work" for you:
(1) opened from a file or http page — browsers allow the microphone only on https or localhost; (2) Web Speech is not
available in Samsung Internet, Firefox, or an Android WebView without a native speech plugin; (3) permission denied
earlier. Missing commands: "set the asking price to…", "change status to Sold", "find buyers looking for…".
→ Stage 5 (diagnostics screen + missing commands + native plugin plan). **Built in Stage 5, browser-tested only; microphone on the S23 Ultra still unproven.**

### 14. Property calculator — DONE in Stage 5 (browser-tested; PDF share on the phone NOT PROVEN)
Purchase (deposit, loan, repayments, MOT/stamp duty tiers, legal fees, SST, disbursements), rental yield/ROI, sale
with RPGT, agent commission; rates editable under Assumptions. Missing: searchable property dropdown inside the
calculator (only opens pre-filled from a property), client selection, saved calculations and history, "Update Property
Record", Share/Download PDF. → Stage 5: all built (docs/STAGE5.md).

### 15. Buyer PDF / share — DONE in Stage 5 (local, picture-based PDF; share/download inside the Android app NOT PROVEN)
### 16. Marketing Studio — NOT DONE
### 17. Advertising & Listing Tracker — PARTIAL
Per-property "adverts" list exists inside the property form (platform, status planned/live/needs update/paused/expired,
dates, ref, notes). Missing: own tracker on the detail page, cost, ad type incl. fake/dummy/test, title, URL,
screenshot, statuses per section 17, expiry reminders, cost summaries, "Add Fake Listing". → Stage 6.

### 18. RM formatting — PARTIAL → Stage 1
Display is consistent (`rm()` → "RM 500,000"). Typing is not: money fields show "500000" with no separators, and four
screens each have their own number parser. → one shared parser/formatter and money input.

### 19. Inactive contacts, notifications, calendar
To-Do, Calendar, inquiries → viewings, reminders: DONE in browser (U9, U11, U12). Notifications with app closed: NOT
PROVEN (needs native app). Inactive-contact reminders: NOT DONE (contacts have `lastInteraction` but nothing checks it).

### 20. Languages — DONE (EN/BM/ZH screens; lint enforces all three). BM and ZH wording still needs your review.
### 21. Security — PARTIAL
No secrets in code (lint check), keys only from env or Settings, RLS per user. Missing: roles, server-side
authorisation for teams, audit log, backup protection.

### 22. Google Cloud / services dependency list — see `docs/SERVICES.md` (written in Stage 2).

### 23. Performance — PARTIAL
Photos compressed; GPS only while recording; no AI on calculations. No pagination yet (fine at current volumes).

### 24. Testing — PARTIAL
Good automated base (36 unit + 22 browser tests). No real-device or live-service tests.

## Contradictions found (master instruction wins unless you decide otherwise)

1. **Reference numbers**: unique across all prefixes (current, your 12 Oct rule) vs "next unused number for the
   chosen prefix" (master). Not changed yet — please confirm which you want.
2. **Property form saving**: explicit Save button (current) vs automatic saving (master 5.1). Plan: keep Save, add an
   automatic draft that survives closing the app, plus a visible "Saved on this phone / Syncing / Synced / Failed" state.
3. **README target**: "native Android app for Samsung S23 Ultra" vs master "Android + iOS + web from the start". Plan:
   one Capacitor project with both Android and iOS shells.

## Prioritised implementation checklist

**Stage 1 — foundations (now)**
1. Global form-control styles: visible borders, hover, gold focus, disabled/read-only, error, open dropdown.
2. Clearer labels across all forms.
3. Dashboard: 15 cards (Subsale, Project, Co-broke), "Agent Profile" rename, explorer progress strip from real data.
4. Shared RM formatter/parser + money input used by every money field.
5. Re-verify persistence; update tests; push.

**Stage 2 — data, roles, backup**: save-state indicator; form draft autosave; record revision history (earlier edit
kept); automatic background sync with retry; workspace/roles/audit-log migration with RLS; Google Drive weekly backup
via Supabase scheduled Edge Function + owner OAuth; restore with dry-run and duplicate/newer-data protection;
`docs/SERVICES.md` and `docs/BACKUP.md`.

**Stage 3 — property & contacts**: headline lower; Fill by Voice centred button; per-field verification; long-press
preview; phonebook icon beside phone fields; WhatsApp ID / Alias; demo data completion.

**Stage 4 — GPS**: four cards; My Property Map rename; My Banner Location (after your spec); Co-broke Opportunity
Map (Coming Soon); Capacitor background-location plan.

**Stage 5 — calculator, PDFs, voice**: calculator property/client pickers, saved history, Update Property Record,
calculator PDF; buyer PDF with field checklist and photo choice; voice diagnostics and missing commands.

**Stage 6 — marketing & images**: local photo enhance + manual privacy masking (automatic detection optional);
AI declutter behind an explicit consent step; Marketing Studio (one format at a time, verified specs); Advertising &
Listing Tracker with Add Fake Listing, expiry reminders and cost summaries.

**Stage 7 — final verification** on your devices and live services.

## Decisions (owner, 12 Oct 2026, 17:31)

1. **Reference numbers** — the number box is now a dropdown: used numbers in red (with the property using each),
   free numbers selectable; typing still works. The existing rule (number unique across all prefixes) is kept, so
   a number used as A1004 also shows red for P. If you want numbers to repeat across prefixes (P1004 and A1004
   both allowed), that is a one-line change in `domain/refs.ts`.
2. **Subsale and Project** — stay empty ("Coming Soon") for now.
3. **My Banner Location** — built: each banner put up is recorded with its position (phone GPS at the banner, a tap
   on Google Maps, or typed), date, note and optional photo, with Navigate; taking it down keeps it as history.
   Every property has **Banner placed?**: Yes / No / Not yet / Owner doesn't allow / Removed, shown on the detail
   page (own section with Edit), on My Banner Location (one card per property, coloured by status, filter by
   status) and on the property's card in My Property Map. Adding a banner sets Yes; taking down the last one sets
   Removed. GPS Assistance now has its four cards.

## 13 Oct 2026 update

Owner's 21-point list, implemented as one change on `feature/v2-full-update`. Checkpoint before it: branch
`checkpoint/pre-oct13` (commit `a4950d9`). Status labels as above. **Nothing below has been tested on the phone yet**;
"DONE" means implemented and verified by an automated test in Chromium at 384 × 824 px with stand-ins for Google Maps,
GPS, the speech service and the contact picker.

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| 1 | Voice: text after End recording | DONE (browser) · NOT PROVEN (phone) | Cause found: after the recording ended the app stopped listening 250–400 ms later, before Android delivered the final words; phones whose recogniser gives no live words showed nothing. Now waits up to 8 s for the final words, shows "Recognising your words…", and explains "No words were recognised" instead of silence. Unit tests SR1–SR5, screen test U32. Gold card unchanged. |
| 2, 12 | Phone book (contact form, Send Name Card) | DONE (browser) · NOT PROVEN (phone) | Name card button ignored a refused permission (unhandled error = "nothing happens"). One shared button now: asks permission, opens the picker, fills editable name and number, and always says what happened (refused, cancelled, not in this APK, not in this browser). The APK build now fails if the speech or contacts plugin is missing. U31, U33, N4. |
| 3, 15, 20 | Logo, name, startup animation | DONE | Owner's artwork, white border removed (`app/assets/brand/`), larger in header (46 px) and sign-in (132 px); app icon and splash regenerated; ~1 s spin then the app (U39). Android splash now hides as soon as the app draws. |
| 4 | Typing / Backspace lag | PARTIAL — needs the phone | Measured in Chromium (CPU ×6): no lag reproduced; per keystroke the property form did ~6 ms JS work. Likely phone cause found in the Android config: `captureInput: true` replaces the WebView's keyboard connection with a minimal one (Capacitor source: `BaseInputConnection(this, false)`), so Samsung/Gboard send every key and Backspace one by one. Removed. Also: closed form sections are not drawn, the speech box no longer redraws on every key, and a page-level `overflow` setting that broke sticky bars was corrected. Paint per keystroke halved in the trace. Must be confirmed on the S23 with the new APK. |
| 5 | My Location recentre | DONE (browser) · NOT PROVEN (phone) | Every press now asks the GPS for a fresh reading and restarts live updates that went quiet (Android stops them after the screen was off); previously it re-used the last watched position. U29, U38 (live updates stopped after the first reading, three presses). |
| 6 | Map / Satellite / Hybrid | DONE (unchanged, re-verified) | Same map object; position, zoom and markers kept (U29). |
| 7 | Location selection | DONE (browser) · NOT PROVEN (phone) | Banner: tap / drag / GPS / typed, and **Change location** later (same record). House Shopping: mark at a tapped spot, **Move to the right spot** later; no position is invented without GPS. Property: picker GPS errors shown; location editable later (U27, U38, U8). Pick maps start at your own position. |
| 8 | Sample data + new-user choice | DONE | First start on an empty phone (after the first sync when signed in): "Populate with Sample Data (Recommended)" or "Start Without Sample Data"; asked once. 47 records (10 properties, 18 contacts incl. 10 vendors with statuses, 6 to-dos, 5 calendar events incl. viewings, 3 inquiries, 3 deals, 2 expenses), all marked Sample / "(sample)". Sample records are never uploaded or downloaded (N3), so they cannot mix with the team's real data. U34. |
| 9 | Contacts: Buyers / Vendors; vendor statuses | DONE | One Contacts card → Buyers / Vendors. Vendor status: Pending Property Info, Pending Follow-up, Listed, Negotiating, On Hold, Closed (Sold / Rented), Withdrawn — separate field from buyer lead colours (unchanged). U35. |
| 10, 16–19 | Dashboard, Notifications, News, Co-broke | DONE | 15 cards, Voice Command = 15 (bright gold). Freed places filled with existing screens: **Inquiries & Viewings** (6) and **Settings** (14) — owner to confirm or swap. Notifications (top): reminders for the next 7 days; push messages marked Coming Soon. Co-broke (top): marked Coming Soon; still lists properties set to Co-broke. U1, U25. |
| 11 | Send Name Card activation | DONE | Required: full name, registration type, registration number, agency, contact number (≥ 9 digits) — marked * in Edit profile; the button stays off with the message until complete, then switches on. Card text from the saved profile. U36, N1. |
| 13 | New Property form | DONE | Every section collapsible (closed at first; Edit from a detail card opens that section; voice fill opens the filled sections); header shows "n filled"; Save bar fixed at the bottom of the screen; everything entered is saved (U37). |
| 14 | Field help | DONE | "?" with What / Enter / Example / Why on property fields, profile registration, WhatsApp alias, buyer and vendor status (28 topics, EN/BM/ZH; BM/ZH drafts). N5. |
| 21 | Testing | Automated DONE · phone NOT DONE | Type check, lint (102 files), unit 59/59, screen 39/39. |

### Needs a new APK (native version 3)

Removing `captureInput` (typing), app name, launcher icon and splash, the splash timing, and the plugin check in the
build. Everything else also arrives by the automatic update, but install the new APK once so all of it applies.

### To test on the S23 Ultra (owner)

1. Voice Command: Start speaking → "Test 1 2 3" → End recording → the words appear (also try saying nothing).
2. Contact form and Send Name Card → Choose from phone book: permission prompt, picker, name/number filled and editable.
3. Agent Profile: Send Name Card off with the message → fill the * fields → on.
4. GPS: My Property Map → move the map → My Location (several times, also after the screen was off). Banner: tap the
   map, save, Change location. House Shopping: Mark here → tap the spot → later Move.
5. New Property: sections open/close, Save from the middle of the form, "?" help.
6. Typing and Backspace speed in long fields (headline, notes) with the Samsung keyboard.
7. Startup: logo spin, then sign-in / dashboard. First start on a clean install: the sample-data choice.

## Stage 3 status — Property & Contacts (branch `feature/v2-stage3-property-contacts`, from `feature/v2-phase2` @ `586d6a5`)

Awaiting your review. Not merged, not deployed, no live Supabase change, Stage 4 not started.

| Item | Result |
| --- | --- |
| Headline lower | Headline now first in **Marketing** (the advert title). Section 1 is retitled **Type & Purpose**. The detail screen shows it under Marketing. **Decision needed:** the repo's `Property_Explorer.docx` is master v1A and has no field-order list, so this placement is my reading of "lower"; tell me the exact order if different. |
| Fill by Voice | Large centred button at the top of the form (opens the same voice box; the existing speech fixes are untouched). Fields filled from words are marked "from your words". A notice asks you to check them; **I have checked them** clears it; pressing Save first asks "Save without checking?". Works for the voice-command prefill too, and still applies after a restored draft. Only empty fields are ever filled, as before. |
| Verification | Four states (Confirmed, Owner stated, Need to check, Unknown) on 20 facts (prices, fees, commission, tenure/title/land use/restriction, sizes, rooms, parking, furnishing, condition, availability, owner name/phone). A word + symbol is shown beside the value (not colour alone) on the detail screen and key facts; "n to check" is listed in the Still-missing card. An empty field may be marked Unknown. Marks of fields that no longer apply (e.g. sale price after switching to rent) are removed on save. Stored on the record, so they sync, merge field by field (a clash is a normal conflict) and appear in history. |
| Card preview | Long-press (about 0.5 s) on a grid or large card opens a preview sheet; a visible **Preview** button does the same (no long-press needed); Esc closes; the sheet offers Open details / Delete (asks first) / Cancel. A normal tap still opens details. |
| Phonebook | Icon beside the contact phone box and a new one beside the property owner phone box (fills name + number; asks before replacing different typed values). Refused permission, picker closed without a choice, contact without a number, unsupported browser and missing plugin each show a message under the box. |
| WhatsApp alias | Re-checked, no change needed. |
| Phone links | Call / WhatsApp links appear only for a number of 9+ digits; shorter ones explain why. (Master §6.3.) |
| Demo data | All sample records already carried a Sample mark in the list views; now also the to-do, appointment, inquiry, deal, expense and income rows. Example verification marks (all four states) on sample properties; example WhatsApp aliases (one alias-only). Still `sample: true`, never synced, removed only from Settings. |

Tests added: `tests/stage3.test.ts` (12 unit) and U60–U69 in `tests/ui.test.mjs` (10 screen). Browser simulations only: real Android touch,
the real contact permission prompt, and the real speech service are **not** covered.

### Still to test on the S23 Ultra (Stage 3)
1. Long-press a property card: preview opens, releasing does not open details; Samsung keyboard/TalkBack still reach the Preview button.
2. Fill by Voice: tap the big button, speak, check the review notice and the Save question.
3. Phonebook icon on a contact and on the property owner: permission prompt, Don't allow, back-button cancel.
4. Verification pickers with the Samsung keyboard; reading of the chips on the detail screen outdoors.

## Stage 4 status — GPS Assistance (branch `feature/v2-stage4-gps`, from Stage 3 @ `e2a6b01`)

Awaiting your review; Stage 3 is also still awaiting review. Full checklist, changes and the screen-off plan: `docs/GPS.md`.
Gaps found and fixed: banner position history (`moves`), banners on sample properties now flagged sample (never synced), "Remove
photo" on a banner. Screen-off recording is **not built** (plan only, needs a new APK and your approval). Everything else in the
GPS audit was already present and is only browser-tested; none of it is proven on a phone.

