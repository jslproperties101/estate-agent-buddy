# EA AI Buddy — rename + reskin Phase A (main app)

Branch `feature/qa-ea-ai-buddy-reskin-a`, built on `feature/qa-l1-launch-essentials` (706f3a8, the newest main-app line).
Owner's choices (31 Oct 2026): rename everything including the package ID; reskin in phases following the 12-screen
mockups; advert directly above the new tab bar; header "EA AI Buddy" + tagline with the gold robot-house logo.

## Status

| Item | State |
| --- | --- |
| Name "EA AI Buddy" on every screen, PDF report header, share-sheet label, terms, start-up, sign-in (EN / BM / ZH) | DONE |
| Logo, splash and in-app logo artwork: first line "ESTATE AGENT" → "EA" (rest of the artwork untouched; launcher icon has no text and is unchanged) | DONE |
| Package `com.jslproperties.eaaibuddy` (QA `com.jslproperties.eaaibuddy.qa`), sign-in return link, push app id, CI checks, APK file names | IMPLEMENTED BUT NOT PROVEN (needs the steps below, then a phone test) |
| Native version 7 → 8 (older APKs never take this web bundle; they are told a new APK is needed) | DONE |
| Home dashboard: greeting card, four live numbers, Quick Access cards with short lines, AI Assisted Command banner, wide Calendar & To-Do / Subsale List cards | DONE (browser-tested) |
| Bottom tab bar: Home, Projects, AI Buddy (centre), Inquiries, More; advert directly above it | DONE in browser; native AdMob banner position NOT PROVEN on a phone |
| More screen: profile card, Settings, Notifications, Team Workspace, Send Feedback, About | DONE |
| Phase B (Projects, Property Details, Contacts, Inquiries & Viewings) | IMPLEMENTED (look and layout only; browser-tested, not yet seen on a phone) — see below |
| Phase C (Calendar, Calculator, News, Track My Sales, AI Assistant) | IMPLEMENTED 9 Nov 2026 (look and layout only; browser-tested, not yet seen on a phone) — see below |

## What stays the same on purpose

- Google Drive backup folders (`Estate Agent AI Buddy`, `Estate Agent AI Buddy backups`), the phone's
  `Documents/Estate Agent Buddy` save folder and the Gallery album keep their names, so existing backups and files are
  still found.
- The 15 home cards keep their order, numbers and keys; Admin EAB tile switches still work.
- The home numbers are real: commission received this month and active deals (sample data left out, as Track My Sales),
  inquiries in the last 7 days, viewings in the next 7 days, open tasks and appointments today. "Property views" from the
  mockup is not shown because the app does not record it.
- The hero house photo is cut from the owner's own mockup (app/src/brand/hero-house.webp).

## Phase C (9 Nov 2026) — what changed

From the owner's mockups 4, 5, 6, 9 and 10 (sent 9 Nov). Look and layout only; no data, saving, sync or rules changed.
Branch `feature/qa-reskin-c` (on `feature/qa-batch5-payments`).
- Track My Sales: gold-edged card with the commission received this year and a gold bar for each month so far (the month
  names alternate on a narrow phone because of the 14 px rule; the spoken label names every month); the change against the
  same months last year when there is one; this month / pending / all-time received under it; four tiles (Deals Closed =
  completed sales and rentals, In Progress, New Inquiries 7 days, Viewings next 7 days; the last two open their lists);
  deadlines and deals as gold-edged rows with a chevron. Sample records stay out of the money, as before.
- AI Assistant (AI Assisted Command): the gold robot beside "Your Personal Real Estate Assistant" in the strip under the
  title bar (still about a tenth of the screen, Change 65); the box, mic, Clear and AI Process as before; then one gold-edged
  row per kind of command (from "How to use and examples"); a tap puts its example in the box.
- Calendar & To-Do: gold Month / Week switch, days without boxes and the chosen day as a gold circle, the status filter as
  pills, the day's entries on a gold time line.
- Property Calculator: section pills (they wrap to a second line, never scroll sideways); label and box on one line; the monthly instalment in a gold card with the
  loan, total interest and total payment under it (same figures as the list below).
- Market News: Latest / Unread pills; each post a row with its picture (or a news icon) on the left, title, date and "New";
  tapping opens the full picture, text and links as before.
- Fix found on the way: a chosen filter pill lost its gold fill (Phase B rule order), also on Projects.
- Not done on purpose (the app has no data or feature for them): Track My Sales month / period pickers and "Recent
  Activities" feed, the Calendar's Day view and type filter (All / Viewings / Meetings / Tasks), the calculator's
  Affordability tab, News categories (Analysis / Tips / Videos) and an Add button on News, and an open chat on the AI page
  (it understands commands, not free questions). The mockup's figures (e.g. RM 2,026 a month) are illustrations; the app
  shows its own sums (RM 450,000 over 35 years at 4.5% is RM 2,129.66).
- Tests: `app/tests/ui-reskin-c.test.mjs` (EC1–EC4), `ui-news-paywall.test.mjs` NP11, `app/tests/reskin-c.test.ts` (RC1–RC3).

## Owner steps needed before the new package works fully

**Batch 3 status (9 Nov 2026).** Step 3 is DONE on the TEST project (EAB-QA-Test, `talksazsqsgjriamwxdp`) together with
the billing and token sandbox files: migrations `ea_ai_buddy_app_ids`, `billing_sandbox`, `tokens_sandbox` (same code as
`supabase/proposed/`, checked function by function; their own tests run there: billing 28/28, tokens 21/21, rolled back).
Production untouched. Steps 1, 2 and the push sender below are the owner's; step 4 is Batch 5 (the `billing` and
`billing-webhook` functions are not deployed to the test project yet). Checklist: `docs/Batch3-NewPackage_TestChecklist.txt`.

**Push sender (found in Batch 3).** `send-push` signs in to ONE Firebase project, from the secret `FCM_SERVICE_ACCOUNT`.
Phones running the new package register with the new Firebase project `eaai-buddy`, so on the test project that secret
must hold an `eaai-buddy` service-account key (Firebase → Project settings → Service accounts → Generate new private key;
then Supabase → Edge Functions → Secrets). After that, phones still on the OLD QA app (old Firebase project) stop getting
push alerts from the test project. Production keeps the old key until the new app is live there.

1. **Firebase** (the owner's new project `eaai-buddy`; the old project was `estate-agent-ai-buddy-a7ac7`): Add app → Android → `com.jslproperties.eaaibuddy` and
   `com.jslproperties.eaaibuddy.qa`, each with the debug key SHA-1 (same as the current apps). Download the new
   `google-services.json` and replace `app/android-config/google-services.json`. Until then the build borrows the old
   entries under the new names: the APK builds and runs, but **push alerts and crash reports are not expected to work**.
2. **Google sign-in / Supabase Auth**: add `com.jslproperties.eaaibuddy://auth-callback` and
   `com.jslproperties.eaaibuddy.qa://auth-callback` to Supabase → Authentication → URL Configuration → Redirect URLs
   (test project first). Without this, Google sign-in cannot return to the new app.
3. **Database (proposed, not applied)**: `supabase/proposed/20261031000000_ea_ai_buddy_app_ids.sql` lets push sign-ups
   from the new packages through (`eab_push_tokens.app_id` check). Run on the TEST project first; production only with
   approval. Rollback file beside it.
4. **Billing sandbox secrets** (when used): `PLAY_PACKAGE_NAME` and `BILLING_RETURN_URL` must use the new package.
5. **Google Play**: a new package is a new Play listing; the old listing cannot be renamed to this package.

## Files

- Rename: `app/capacitor.config.json`, `app/src/native/native.ts`, `app/scripts/android-setup.mjs` (borrows old
  Firebase entries until replaced), `app/scripts/verify-apk.mjs`, `.github/workflows/android.yml`, string files,
  `app/scripts/rename-logo.py` (one-off artwork edit), images in `app/assets` and `app/src/brand`.
- Reskin: `app/src/App.tsx` (Home, header, tab handling, Back to a deeper place), `app/src/ui/TabBar.tsx`,
  `app/src/ui/homeStats.ts`, `app/src/ui/reskinStrings.ts`, `app/src/adverts/AdBar.tsx`, `app/src/adverts/admob.ts`
  (banner lifted by the tab bar's height), `app/src/styles.css`, `app/src/nav.ts`.
- Tests: `app/tests/ea-reskin.test.ts` (new), updated U1, U30, U39b, U91, U101, U120, BR3, BR5, QA2, QA3, W1, R5, J25-2.
- Database: `supabase/proposed/20261031000000_ea_ai_buddy_app_ids.sql` (+ rollback).

## Phase B (3 Nov 2026) — what changed

Look and layout only; no data, saving, sync or rules changed.
- Projects: status filter chips (All, Upcoming, Launched, ...) above the list; dark cards with a gold edge and gold price.
- Subsale List cards and the property page: card edge and headline price styling; for-sale / for-rent labels on large cards raised to 14 px.
- Contacts: a round initial beside each person, and Call + WhatsApp buttons (WhatsApp uses the phone number, like the contact page).
- Inquiries & Viewings: full-width gold segmented switch; rounded cards with a gold edge.
- Tests: `app/tests/ui-reskin-b.test.mjs` (EB1-EB4). EB3 finds no projects in the sample data, so the filter itself is NOT exercised yet.
- Not done on purpose: the mockup's Map View, Floor Plan / Gallery tabs on a property and a photo on every Projects card (they need
  data the app does not have or new features). The existing gap under the title bar on list screens (Change 74) is unchanged.
