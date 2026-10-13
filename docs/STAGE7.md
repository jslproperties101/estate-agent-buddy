# Stage 7 — Final verification (for owner review)

Branch `feature/v2-stage7-final-verification`, started from `feature/v2-stage6-marketing-images` @ `7e6943edc6712d5393cfc0ffc64e192fc9bbb011`
(clean tree). Not merged, not deployed, no web update published, no live Supabase change, no native change, no new permission or plugin,
no paid service. `main` is unchanged (`e9367695`). Stages 3, 4, 5 and 6 are **not approved**. **This is not a production-readiness
statement.**

Date of this work: 14 Oct 2026. Labels used (as requested): **PASS** verified with appropriate evidence · **FAIL** defect reproduced ·
**BLOCKED** needs a service, credential or setup that is not available · **NOT PROVEN** automated tests pass but real-world operation
has not been shown · **NOT BUILT**.

> **No test was run on the Samsung S23 Ultra in this stage.** I have no access to the phone. Every "NOT PROVEN" below is waiting for
> your phone. Section 3 is the list of steps, and section 2 explains how to do them safely.

## 1. What was found first (read this before anything else)

| # | Finding | Evidence | Status |
| --- | --- | --- | --- |
| F1 | **GitHub's automatic test job was red on every branch from Phase 1 to Stage 6** (14 runs). My own earlier reports quoted only local runs; I had not looked at the GitHub results. | GitHub Actions: run `38452169593` (Stage 6) and every earlier run of `Build` on `feature/v2-phase1/2`, Stage 3, 4, 5 show `test = failure`. `database` and `android` jobs were green. | Partly fixed here; see F2–F4 and the result in section 5 |
| F2 | **Real app defect (FAIL → fixed): a due-reminder banner was drawn on top of open dialogs and covered their buttons** (for example "Download PDF"), so the button could not be pressed while a reminder was showing. | Reproduced locally with a UTC clock (test U73 timed out because the banner "intercepts pointer events"). New test **U89** fails on the old CSS and passes on the fix. | **Fixed** (`z-index` of the banner 25 → 18, below dialogs at 20). Needs a phone look. |
| F3 | The automatic **Google Maps check** in the build has not completed in any build since 13 Oct: the first-start "sample data?" dialog blocks it (its screenshot in release `android-7e6943e` shows that dialog). So **Google Maps with your restricted key has not been checked by anything.** | Release notes of all six APK builds say "Check could not finish: locator.click Timeout"; screenshot downloaded and viewed. | Script fixed (answers the dialog; ran locally without a key and now reaches the five checks). The real result is **BLOCKED until the next GitHub build with your key secret reports**. |
| F4 | Four screen tests (U13, U57, U70, U71) failed on GitHub every time but passed in my workspace. They read the screen at once or wait a fixed second, which is not enough on a slower machine. I reproduced the same class of failure locally by slowing the browser's CPU (6–8×). | CI annotations; local throttled runs (original vs fixed tests). | Test waits fixed. **Proof is the GitHub run — see section 5.** |
| F5 | **A Stage 6 (or any feature-branch) APK would silently replace itself with the old production bundle**, so a phone test could be testing different code. | See section 2. | **Needs your decision** |
| F7 | **Unsupported platform claim on the Marketing Studio screen (FAIL → fixed).** The square size's help text said "Instagram, Facebook and WhatsApp posts" and the portrait text said "Instagram feed", although the sizes come from a third-party guide and no platform's own specification was verified. My Stage 6 notes had said the opposite ("offered as a general post image"), so the notes and the screen disagreed. | Read in `src/marketing/strings.ts` (EN, BM, 中文). | **Fixed**: all three languages now say "a common size for social posts — check each platform's own size guide"; new unit test MK12 forbids platform names in that text. |
| F8 | **Photo privacy edge case (observation, not changed).** A large camera photo is re-drawn on upload, so its location data is dropped and it is turned upright (proved with a real GPS-tagged, sideways JPEG, test U90). But a **small photo that would not get smaller keeps its own bytes, including any GPS block** (`compressImage`: "keep the original if compression would not make it smaller"). The app never shares photo files directly (PDFs and designs are re-drawn), and the Photo Studio copy is always clean (U90), but cloud sync uploads the stored file to your team's storage. | U90 | Your decision: strip the data from small originals too (a small change), or accept. |
| F6 | The repository is **public**, so every prerelease APK and its notes can be downloaded by anyone. The APKs contain the Supabase URL and anon key and the website-restricted Google Maps key (these are designed to be visible in an app, but anyone can reuse the Maps key's quota). | `gh api repos/...` → `private:false`; APK inspected (section 2). | Owner decision (private repo, or quota/billing alerts on the Maps key). |

## 2. The safe phone-testing route (task 2)

What I inspected: `capacitor.config.json`, `.github/workflows/android.yml`, `src/native/updates.ts`, `docs/SETUP.md` §4–6, and the actual
Stage 6 APK (`EstateAgentBuddy-7e6943e-debug.apk`, 12.3 MB, downloaded from the release and unpacked).

**How an installed app gets new code**
1. Every push to a `feature/**` branch builds a debug APK and publishes it as a **public prerelease `android-<sha>`**. A release for exactly `7e6943e` exists (build 21). Pushing does **not** publish a web update: the Pages/update job runs only for `main` and `feature/v2-full-update`.
2. The installed app (every build, including that one) reads **one fixed address**, `https://jslproperties101.github.io/estate-agent-buddy/updates/latest.json` (written in `updates.ts` and found inside the APK's `main.js`).
3. Production currently serves build **`48d029e`** (deployed 12 Oct 18:06 UTC from `feature/v2-full-update`). It contains none of Phase 2 or Stages 3–6.
4. `decide()` says "download" whenever the published `sha` differs from the app's own and the native version is not higher. The app then downloads `48d029e`'s bundle, marks it for the next start, and shows "Restart now".

**Consequence.** If you install the Stage 6 APK (native version 3, same as production) it will, within moments of opening, fetch the old production bundle and switch to it at the next start or on "Restart now". You would then be testing the old code while believing it is Stage 6. Settings → About shows the build: if it reads `7e6943e` you are on Stage 6; if it later reads `48d029e` the updater has swapped it.

**Second hazard.** The APK uses the same package name and signing key as your current app, so it installs **over** it and keeps its data (`com.jslproperties.estateagentbuddy`, https://localhost storage). There is **no whole-app backup or restore** (section 4.9), so testing on the phone that holds your real records puts them under unproven code.

**What is needed — an isolated QA APK (recommended; not built, needs your approval):**
- a different Android package name (for example `…estateagentbuddy.qa`) and app name, so it installs **beside** the real app with its own empty data;
- the update check **switched off** in that build only (the production address and production build are untouched);
- built from this exact commit and labelled with the commit in Settings → About;
- Google sign-in on it needs **one owner action**: add `com.jslproperties.estateagentbuddy.qa://auth-callback` to Supabase → Authentication → Redirect URLs, and use a **test Google account** (its records go to its own workspace); the Maps key already works because it is restricted by website address (`https://localhost/*`), not by package.
- none of this adds a native plugin or a permission; it does change the Android project settings (package name, app name) and the build workflow, so I did not do it unasked.

**If you prefer not to build a QA APK**, the least risky way to try Stage 6 on the phone is the single-file browser copy (`estate-agent-buddy-prototype.html`): it cannot update itself and does not touch the app's data — but it is **not** the Android app, so camera, share sheet, notifications, contacts, speech and the native GPS stay unproven.

**What I verified statically in the Stage 6 APK:** bundle build info `sha 7e6943e · version 2.1.0 · native 3` (so that APK does contain Stage 6 code); plugins App, Browser, StatusBar, SplashScreen, LocalNotifications, Capgo Updater, SpeechRecognition, Contacts; permissions ACCESS_COARSE/FINE_LOCATION, CAMERA, READ_CONTACTS, RECORD_AUDIO, POST_NOTIFICATIONS, INTERNET, WAKE_LOCK, FOREGROUND_SERVICE (from a library), RECEIVE_BOOT_COMPLETED; **no** background-location permission (consistent with screen-off recording NOT BUILT); updater `autoUpdate:false`, `updateUrl:""`.
Your installed app's native version is not visible to me: if it is older than 3 the app will say "A new Android app is needed".

## 3. Verification matrix (task 3 and 4)

Method key: **U** = unit test (node:test, 254), **B** = browser screen test (Playwright/Chromium 141 at 384 × 824, stand-ins for Maps, GPS, speech, share sheet, contacts), **DB** = local PostgreSQL 16 (throwaway, not your Supabase), **S** = static inspection of code/APK, **V** = I looked at the produced file.
"Phone" = nothing run on the S23 Ultra.

### 3.1 Phone and core workflows

| Feature | Label | Method and evidence | What is missing |
| --- | --- | --- | --- |
| Install / update / startup of the APK | NOT PROVEN | S: APK contents (section 2). B: startup, slow storage, storage failure (U39–U42) | Install over the old app, first launch, "native" number in About |
| Sign-in (Google via Supabase) | BLOCKED | B: login screen, return from Google, role, sign-out (U28, U55–U58) with a stand-in. Build says Supabase configured (release notes), but I have no test Google account and the workspace cannot reach Google | Needs a test account, ideally on the QA APK |
| Data retention across close/reopen and storage upgrade | PASS (browser storage) · phone NOT PROVEN | B: U4, U43, U52; U: store and history tests | Same on the phone |
| Property create / edit / save / retrieve | PASS (browser) · phone NOT PROVEN | B: U4–U8, U37, U50–U51, U60 | Samsung keyboard feel |
| Contact create / edit | PASS (browser) · phone NOT PROVEN | B: U31, U35, U66, U67 | |
| Phonebook selection; refused / cancelled handling | NOT PROVEN | B with a stand-in picker: U31, U33, U66 (refusal, cancel, unsupported messages). APK declares READ_CONTACTS and the Contacts plugin | Real permission prompt and picker |
| Form usability, keyboard responsiveness, long-press / Preview | NOT PROVEN | B: U23, U37, U65 (long-press, Preview button). 13 Oct typing-lag analysis only measured in Chromium | Real thumb long-press; typing/Backspace speed with Samsung keyboard |
| EN / BM / 中文 screens | PASS (layout, browser, with Noto CJK font) · phone NOT PROVEN | B: U20, U42, U46, U69, U78, U83, U87 (no clipped/overlapping text, 14 px text, 44 px buttons U21). BM and 中文 wording is still a draft for your review | Phone font size and real Chinese font |

### 3.2 GPS

| Feature | Label | Method and evidence | What is missing |
| --- | --- | --- | --- |
| Real GPS readings and My Location | NOT PROVEN | B with simulated positions: U13, U29, U38. App asks for a fresh reading on every press (15 s limit then a message) | Real fix outdoors, after screen-off |
| My Property Map, layers, markers, navigation | NOT PROVEN / BLOCKED | B with a stand-in map: U14, U27, U29. **Real Google Maps with your key has never been checked** (F3) | Real map on the phone; the next GitHub build's Maps check |
| Banner placement by GPS, map tap, typed coordinates | NOT PROVEN | B: U27, U38, U70 | Finger tap on a real map |
| Banner movement history, photo, take-down history | PASS (browser) · phone NOT PROVEN | B/U: U27, U70, banners.test | |
| House Shopping start / pause / resume / stop / save journey | NOT PROVEN | B with simulated route: U13 | Real walk/drive |
| Screen-off recording | NOT BUILT | Plan only in `docs/GPS.md` §3 (needs a plugin, 3 permissions and a new APK) | |
| Co-broke Opportunity Map | NOT BUILT (Coming Soon screen) | B: U25, U27 | |

### 3.3 Calculator, PDFs and voice

| Feature | Label | Method and evidence | What is missing |
| --- | --- | --- | --- |
| Calculator formulas (purchase, rental, sale/RPGT, commission, stamp duty tiers) | PASS (logic) | U: calculator.test, stage5-calculator.test | Tax rates should be checked by you or your accountant against current law |
| Saved calculations, history, deletion, reviewable property update | PASS (browser) · phone NOT PROVEN | B: U71, U72 (U71 wait fixed, see F4); U: CB tests | |
| Calculator PDF and Buyer PDF: generation, field and photo selection | PASS (browser; PDF structure checked: header, page count, images, EOF) | B: U73–U75, U78 | Opening the saved file on the phone |
| Exact-address privacy defaults; no invented facts | PASS (logic and file) | U: stage5-buyerpdf BP1–BP11; BP11 covers the Stage 5 title leak fixed in Stage 6 | |
| Android sharing / download of a PDF or image | NOT PROVEN | S: uses Web Share with a file, else a browser download; an Android WebView may ignore both. Free fix if needed: `@capacitor/filesystem` + `@capacitor/share` (needs your approval and a new APK) | The whole point of the test |
| Voice diagnostics | NOT PROVEN | B with stand-in recogniser: U76. APK has the plugin and RECORD_AUDIO | Real microphone and speech service, EN / BM / 中文 |
| Each new voice command (set price, change to Sold, find buyers) with a review step before saving | PASS (parser + review, typed text) · phone NOT PROVEN | U: stage5-voice; B: U77 | Spoken, not typed |
| Chinese voice commands | NOT BUILT | Speech turns into Chinese text, but commands are not parsed in Chinese (stated on screen) | Decision |

### 3.4 Photo Studio and Marketing Studio

| Feature | Label | Method and evidence | What is missing |
| --- | --- | --- | --- |
| Photo improve (brightness, contrast, colour, clarity, turn, straighten, crop) | PASS (pixel logic and browser) · phone NOT PROVEN | U: stage6-photos PH1–PH13; B: U82 | Real large camera photos: speed, memory, orientation |
| Finger-drawn privacy masks; masks in the exported pixels | PASS in browser with a mouse · finger NOT PROVEN | U: mask pixel tests; B: U81 reads the saved copy's pixels and finds the covered area replaced | A finger drag vs page scroll on the phone |
| Original kept; edited copy handling; Replace asks first | PASS (browser) | B: U81, U82 (soft delete of the replaced original) | |
| Location (EXIF) data removed; photo turned upright | PASS (browser, with a JPEG that carries a real EXIF block: "turned a quarter" + GPS 2.49 N, 101.8 E) · NOT PROVEN with a real phone photo | B: **U90** — large photo: stored picture has no camera-data block, is upright and ≥3× smaller; Photo Studio copy of a small photo: no camera-data block, upright, original unchanged. Edge case F8 documented | A real phone photo, camera and orientation |
| Automatic detection of private details, AI declutter, batch, perspective, watermark removal | NOT BUILT | Deliberate (docs/STAGE6.md §1) | Decisions |
| Marketing: A4 (PDF/PNG/JPG), square and portrait (PNG/JPG/WebP) | PASS (files: sizes, types, one-page PDF) · phone NOT PROVEN | B: U84–U86; V: I opened `full-a4`, `lang-zh-a4`, `lang-bm-square` PNGs | Share / download on the phone; WebP support there |
| Chinese and Bahasa Malaysia rendering on the designs | PASS in this workspace (Noto CJK font) · phone NOT PROVEN | V: viewed A4 中文 and square BM exports — labels, disclaimer and footnote render; agent-typed text stays as typed | Phone fonts. *Observation, not a defect:* white headline text over a very bright photo may be hard to read in the square design (only checked with flat test colours) |
| No unsupported claim about platform sizes | **FAIL → fixed (F7)** | S: the old square/portrait help text named Instagram, Facebook and WhatsApp. Now neutral in EN/BM/中文; U: MK12 | Check the sizes against each platform's own help pages before naming any platform |
| Brochures, saved templates, AI copy, Facebook link-preview size | NOT BUILT | | Decisions |

### 3.5 Advertising and Listing Tracker

| Feature | Label | Method and evidence | What is missing |
| --- | --- | --- | --- |
| Add / edit / retrieve ads with dates, cost, URL, screenshot | PASS (browser) · phone NOT PROVEN | U: AD1–AD12; B: U79, U88 (kept after closing the app) | Gallery picker on the phone |
| Cost summaries by property, platform, period | PASS (logic) | U: AD tests; B: U80 | |
| Expiry and needs-update behaviour | PASS (logic and screen) | U/B: AD, U80 | |
| Test (fake) and sample ads never count as costs or reminders | PASS (logic) | U: AD tests; B: U80 | |
| Android notifications for expiring ads | NOT PROVEN | Scheduled with the same code as to-do reminders; never delivered on a phone. No device test was performed | Phone test (section 6) |

### 3.6 Services and data safety

| Feature | Label | Method and evidence | What is missing |
| --- | --- | --- | --- |
| Google Maps with the configured restricted key | BLOCKED | No key in this workspace; the build's own check never completed (F3). Not claimed | Next GitHub build with the fixed check; phone |
| Google sign-in and Supabase sync (live) | BLOCKED | No test account/credentials here. Sync logic only with stand-ins: U: phase2-sync; B: U54–U58 | Test account on the QA APK |
| Database roles and row-level security | PASS (local PostgreSQL 16, throwaway; **not** your Supabase project) | DB: `rls-test.sh` **125 passed, 0 failed**; `rollback-test.sh` **18 passed, 0 failed** | The same against a Supabase *test* project if you want a live check; no migration was applied to your project |
| Permission failure messages | PASS (browser) · phone NOT PROVEN | B with stand-ins: location denied (U29), contacts refused / cancelled / unsupported (U33, U66), microphone blocked (U76) | Real denial prompts |
| Per-record history, restore a version, Recently deleted | PASS (browser, sample records) | U: phase2-history; B: U53 | |
| Whole-app backup / restore; weekly Google Drive backup | NOT BUILT | S: no Drive code or function; `data/manifest.ts` only *describes* data. Nothing could be tested "safely" because it does not exist | **Real risk: no backup of the phone's data exists anywhere except the Supabase sync you have configured** |
| No request leaves the phone unconfigured; no console errors | PASS (browser) | B: U22 | |

## 4. Defects found, fixes, regression results

| ID | Defect | Fix | Test | Result |
| --- | --- | --- | --- | --- |
| D1 | Reminder banner covered dialog buttons (F2) | `src/styles.css`: `.alerts` z-index 25 → 18 | U89 (fails before, passes after); U73 passes with UTC clock | fixed, local; GitHub result in section 5 |
| D2 | Maps check script blocked by the start dialog (F3) | `scripts/maps-check.mjs` answers "Start Without Sample Data" first | run locally without a key: reaches all five checks | script fixed; real outcome pending |
| D3 | Four tests racing the screen (F4) | waits added in U13, U57, U70, U71 (tests only, no app code) | repeated runs | see section 5 |
| D4 | Unsupported social-platform wording (F7) | `src/marketing/strings.ts` (3 languages), comment in `content.ts` | MK12 | fixed; unit 255/255 |
| — | New verification test, no defect found: photo camera data and orientation (F8) | none (test only) | U90 | passes |

## 5. Automated regression results

See the final report for the totals (filled in after the last run). Commands: `npm run typecheck`, `npm run lint`, `node scripts/test-unit.mjs`,
`node scripts/build.mjs --no-env`, `node --test tests/ui.test.mjs` (three full runs), DB scripts on a local PostgreSQL 16.

## 6. Steps for the S23 Ultra (when a safe build is chosen)

Do these only on a QA APK or a phone whose data you can lose. Tick what works, note what does not.
1. Install, open Settings → About: build must read the commit you expect and must **not** change after a restart (updater check).
2. Create a property and a contact with the Samsung keyboard; close and reopen; long-press a card.
3. Contacts: phone-book button; deny once, allow once, back out once.
4. GPS: My Location outdoors, My Property Map, a banner by GPS and by tapping the map, House Shopping for 5 minutes (screen on), then with the screen off (expect gaps).
5. Camera photo into a property → Photo Studio → improve, finger-draw a mask over a house number, save as new → open the saved copy and check the number is covered; check the location is not in the file's details.
6. Calculator PDF, Buyer PDF, one marketing design in each size: Share to WhatsApp, Download, open the saved file; look at Chinese and Malay text.
7. Voice diagnostics → Test recognition; say each new command in English and Malay.
8. Advert tracker: add a live ad ending in 2 days with reminder "1 day before" and a test ad; confirm a notification at 09:00 for the live one only.
9. With a test Google account: sign in, sync, edit on a second device, check conflicts.
10. Turn the phone's language to BM and 中文 and look at the new Stage 3–6 screens.

## 7. Decisions and owner actions still open (not resolved here)

- **Stage 3**: headline placement (Marketing section vs. top); the list of 20 verification facts; loss of owner verification marks when a typed owner becomes a vendor contact.
- **Stage 5**: buyer requirement fields (budget, area, type, bedrooms); Chinese voice-command parsing; adding the free share/filesystem plugins.
- **Stage 6**: AI decluttering (service, cost, consent wording); batch photo processing; marketing formats/templates/brochures; verifying the social sizes with the platforms; platform and ad-type lists.
- **Stage 4**: whether to build screen-off GPS (plugin, 3 permissions, new APK).
- **Stage 7**: QA APK (section 2); public repository; Maps-key quota alert; whole-app backup; whether Stage 2–6 should ever be deployed as a web update (not done, not requested).
- **Owner actions if a QA APK is approved**: add one Supabase redirect URL; use a test Google account.

## 8. New APK?

- **Production APK**: not needed for any change in this stage (no native, plugin or permission change; `nativeVersion` stays 3). Your installed app must already be native version 3.
- **QA APK**: recommended before any phone test (section 2). Not built.
- A further APK with the share/filesystem plugins is needed only if the Android share test in section 6 fails.
