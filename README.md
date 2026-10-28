# Malaysia Welcome AI Buddy

Android app for MM2H families moving to Malaysia. Package `com.jslproperties.malaysiawelcome`.

## Menus
1 Welcome Home · 2 Application Tracker · 3 Visa & Pass Renewals · 4 Family Members · 5 Documents Vault ·
6 Fixed Deposit & Finance · 7 Housing · 8 Schools & Education · 9 Healthcare & Insurance · 10 Settling In Checklist ·
11 Local Life Guide · 12 AI Buddy Chat · 13 Services Directory · 14 Tasks & Calendar · 15 Settings ·
16 Future Integrations · 17 News · 18 Hotspots · 19 Coupons

## How it works
- Plain HTML/CSS/JavaScript in `web/` (no framework, no build step beyond copying to `dist/`), wrapped as an Android app with Capacitor 7.
- All data is stored on the phone (localStorage; document photos in IndexedDB). Nothing is sent to a server.
- News is the only online feature: Google News RSS, fetched through Capacitor's native HTTP on the phone.
- AI Buddy answers from built-in offline knowledge. A live AI model needs an approved API key (listed in menu 16).
- MM2H figures are reference only, checked 29 Oct 2026 against mm2h.gov.my and a 23 Oct 2026 summary; confirm on the official portal.

## Build
GitHub Actions (`.github/workflows/android.yml`) runs the tests on every push, then builds a debug APK and attaches it
to a pre-release named `android-<commit>`. The APK is signed with `android-config/debug.keystore` every time, so new
builds install over old ones.

Local: `npm install --omit=optional`, `npx playwright install chromium`, `npm test`, `npm run serve`.
