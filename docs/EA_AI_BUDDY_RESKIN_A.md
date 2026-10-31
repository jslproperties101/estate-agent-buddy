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
| Phase B (Projects, Property Details, Contacts, Inquiries & Viewings) and Phase C (Calendar, Calculator, News, Track My Sales, AI Assistant) | NOT DONE (next phases, after review) |

## What stays the same on purpose

- Google Drive backup folders (`Estate Agent AI Buddy`, `Estate Agent AI Buddy backups`), the phone's
  `Documents/Estate Agent Buddy` save folder and the Gallery album keep their names, so existing backups and files are
  still found.
- The 15 home cards keep their order, numbers and keys; Admin EAB tile switches still work.
- The home numbers are real: commission received this month and active deals (sample data left out, as Track My Sales),
  inquiries in the last 7 days, viewings in the next 7 days, open tasks and appointments today. "Property views" from the
  mockup is not shown because the app does not record it.
- The hero house photo is cut from the owner's own mockup (app/src/brand/hero-house.webp).

## Owner steps needed before the new package works fully

1. **Firebase** (project `estate-agent-ai-buddy-a7ac7`): Add app → Android → `com.jslproperties.eaaibuddy` and
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
