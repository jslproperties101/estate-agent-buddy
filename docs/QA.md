# QA build (isolated test app)

The QA APK installs **beside** the real app and cannot touch it.

| | Real app | QA app |
|---|---|---|
| Package | `com.jslproperties.estateagentbuddy` | `com.jslproperties.estateagentbuddy.qa` |
| Name on phone | Estate Agent AI Buddy | EAB QA |
| Version name | `2.1.0-n3` | `2.1.0-qa-n3` |
| Storage (IndexedDB, files, settings) | its own | its own (a different package has a separate sandbox) |
| Update check | on | **off**: the code returns before any request, and the Check button is disabled |
| Sign-in return link | `<package>://auth-callback` | `com.jslproperties.estateagentbuddy.qa://auth-callback` |
| Release tag | `android-<sha7>` | `qa-<sha7>` |

How it is built: CI builds the QA leg only on branches whose name contains `qa`, with `EAB_QA=1`. `scripts/verify-apk.mjs` then opens the APK and fails the build if the package, name, icons, splash, bundle commit/QA flag or `autoUpdate:false` are wrong.

Identify it on the phone: an orange bar at the top shows `QA · <commit>`, and Settings → About shows the commit and "QA test build".

Both builds use the same debug signing key; they coexist only because the package names differ. QA data starts empty: it does not read the real app's records.

## Owner set-up (one time)
1. In Supabase → Authentication → URL configuration, add the redirect URL `com.jslproperties.estateagentbuddy.qa://auth-callback`. Without it, Google sign-in in the QA app cannot return. (Not done by Claude: it changes live settings.)
2. Use a test Google account, so no real workspace data is involved.

## Unverified until tried on a real phone
Install beside the real app, sign-in return, GPS, camera, microphone, notifications, sharing.
