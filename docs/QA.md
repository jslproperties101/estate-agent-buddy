# QA build (isolated test app)

The QA APK installs **beside** the real app and cannot touch it.

| | Real app | QA app |
|---|---|---|
| Package | `com.jslproperties.estateagentbuddy` | `com.jslproperties.estateagentbuddy.qa` |
| Name on phone | Estate Agent AI Buddy | EAB QA |
| Version name | `2.2.0-n3` | `2.2.0-qa-n3` |
| Release label (About, display only) | 2.0.010 | 2.0.010 |
| Supabase project built in | the production project (repository secrets) | **never production**: the test project's `EAB_QA_SUPABASE_URL` / `EAB_QA_SUPABASE_ANON_KEY` if set, otherwise none (type the TEST project under Connection settings on the sign-in screen) |
| Storage (IndexedDB, files, settings) | its own | its own (a different package has a separate sandbox) |
| Update check | on | **off**: the code returns before any request, and the Check button is disabled |
| Sign-in return link | `<package>://auth-callback` | `com.jslproperties.estateagentbuddy.qa://auth-callback` |
| Release tag | `android-<sha7>` | `qa-<sha7>` |

How it is built: on a branch whose name contains `qa` (and matches `feature/**`, e.g. `feature/qa-v2.0.10-integrated`), CI builds ONLY the QA APK, with `EAB_QA=1`; no normal-package APK is built or published there. `scripts/verify-apk.mjs` then opens the APK and fails the build if the package, name, icons, splash, bundle commit/QA flag or `autoUpdate:false` are wrong.

Identify it on the phone: the app name on the phone is **EAB QA**, and Agent Profile → Settings → About shows the commit and "QA test build". (The orange QA bar under the header was removed by Change 007; QA isolation itself is unchanged.)

Both builds use the same debug signing key; they coexist only because the package names differ. QA data starts empty: it does not read the real app's records.

## Owner set-up (one time)
1. In the separate TEST Supabase project (never production) → Authentication → URL configuration, add the redirect URL `com.jslproperties.estateagentbuddy.qa://auth-callback`. Without it, Google sign-in in the QA app cannot return. (Not done by Claude: it changes live settings.)
2. Use a test Google account, so no real workspace data is involved.

## Unverified until tried on a real phone
Install beside the real app, sign-in return, Google Drive backups and restore, GPS, camera, microphone, notifications, sharing.
