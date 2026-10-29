# Batch L1 — Launch Essentials (main app)

Branch `feature/qa-l1-launch-essentials`, built on `v3-updates-v42.26.10281931abGh68fltB4j9dCsaXFh` (the newest main-app
line: JoyChange003–010, MainForAdmin-B to G, AI Buddy POS behind a switch, billing sandbox behind a switch).
Model: Opus 5.5, High (Joe's choice, 29 Oct 2026).

## What L1 covers, and where each part is

| Launch item | State before L1 | Done in L1 |
| --- | --- | --- |
| Terms and Conditions + country picker at first login | Built in MainForAdmin-B (Terms v1.1-draft, still to be checked by a lawyer) | No change |
| Login lockout (30 failed sign-ins per phone, then 1 hour) | Built in MainForAdmin-B | No change |
| Keyboard keeps the typed field ~30% from the top; pop-ups lift | Built in JoyChange006 Batch 2 | No change |
| One dropdown look, search bar in every pick list, + Add New | Built in JoyChange003 Batch B/B2/G and JoyChange006 Batch 1 | No change |
| Voice command fix (Changes 55–65) | Built in JoyChange003 Batch E | No change |
| Crash reporting | Missing: only screen errors were counted; a crash that closes the app was never seen | **Firebase Crashlytics added** |

## Crash reporting (new)

- Native crashes (the app closes by itself) are reported by Firebase Crashlytics and appear in the Firebase console
  (project `estate-agent-ai-buddy-a7ac7`, the same one used for push alerts) after the app is opened again.
- Errors inside screens that do not close the app are sent as non-fatal reports with the screen code.
- Privacy: only the account id is attached (no name, email or phone); email addresses and phone numbers are removed from
  error messages; at most 10 reports a minute. Access refusals (view-only records) are not reported.
- Browser, laptop website and older APKs: nothing happens.
- New native part (`@capacitor-firebase/crashlytics`), so **nativeVersion 6 → 7**: older APKs are told to install the new APK.
- Files: `app/src/native/crash.ts`, `app/src/App.tsx`, `app/src/usage/logger.ts` (`screenForCrash()`),
  `app/scripts/android-setup.mjs` (Crashlytics Gradle plugin 3.0.3), `.github/workflows/android.yml` (plugin check),
  `app/tests/batch-l1-crash.test.ts`, `app/tests/ui.test.mjs` (U30 expects native 7).

## Not in L1
- Database changes: none. Production Supabase is still far behind EAB-QA-Test; bringing it up to date is a separate
  release step that needs Joe's approval.
- The Terms text still needs a Malaysian lawyer's check before real agents sign up.
