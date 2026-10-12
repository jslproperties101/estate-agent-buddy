# Estate Agent Buddy — setup steps for the owner

Everything below is done in your own accounts. No password or secret is ever typed into the code or into chat.

## 1. Google Maps (needed for real maps in the app)

**Why a website key:** the app shows Google's web map inside the Android app (and on the web), so the key is
restricted by **website address**, not by Android package/SHA-1 (that restriction is only for Google's native Android
Maps SDK, which the app does not use). The Android app's address is `https://localhost`.

In **Google Cloud Console** (console.cloud.google.com), project that owns your key:

1. **APIs & Services → Library** — enable these four (and nothing else is needed):
   Maps JavaScript API · Geocoding API · Places API (New) · Routes API.
   (Directions API and the old Places API are "Legacy" for new projects; the app does not need them.)
2. **Billing** — the project must be linked to a billing account (Google requires it for Maps). Each API has a free
   monthly usage allowance; set a **budget alert** (Billing → Budgets & alerts) so you are warned before any charge.
3. **APIs & Services → Credentials → your key**
   - Application restrictions: **Websites**, add
     `https://localhost/*` (Android app) and `https://jslproperties101.github.io/*` (web version).
   - API restrictions: **Restrict key** → tick the four APIs above.
   - Save. Changes can take a few minutes.
4. **Rotate the key (recommended):** the key was pasted into a chat. After restricting it, it only works from the
   addresses above, but creating a fresh key (Credentials → Create credentials → API key, same restrictions) and
   deleting the old one removes any doubt. Use the new key in step 5.
5. **GitHub → repository → Settings → Secrets and variables → Actions → New repository secret**
   Name `EAB_GOOGLE_MAPS_API_KEY`, value = the key. Every APK and the web version built after this include it.
   (Until then you can paste the key on the phone: Agent Profile → Settings → Google Maps key → Save settings.)
6. **Check:** Agent Profile → Settings → **Check Google Maps**. Each Google service shows Working or the exact setting
   to change. Each APK release on GitHub also carries a `maps-check.png` screenshot from a real Google map.

## 2. Google sign-in (Supabase)

1. **Supabase** (supabase.com, free plan) → New project, region **Singapore**.
2. **SQL Editor** → run, in this order, the files from the repository:
   `supabase/migrations/20261012000000_eab_records.sql`, then `supabase/migrations/20261012120000_workspaces_roles.sql`.
3. **Google Cloud → APIs & Services → OAuth consent screen**: External, app name "Estate Agent Buddy", your support
   email; while in Testing, add the Google accounts allowed to sign in under **Test users** (or Publish the app).
4. **Google Cloud → Credentials → Create credentials → OAuth client ID → Web application**
   Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback` (shown in step 5).
5. **Supabase → Authentication → Sign In / Providers → Google**: Enable, paste the **Client ID** and **Client secret**
   from step 4 (the secret goes only into Supabase), Save. The callback URL to use in step 4 is shown here.
6. **Supabase → Authentication → URL Configuration**
   - Site URL: `https://jslproperties101.github.io/estate-agent-buddy/`
   - Redirect URLs (add both): `com.jslproperties.estateagentbuddy://auth-callback` and
     `https://jslproperties101.github.io/estate-agent-buddy/**`
7. **Supabase → Project Settings → API**: copy the Project URL and the **anon public** key into GitHub secrets
   `EAB_SUPABASE_URL` and `EAB_SUPABASE_ANON_KEY` (as in 1.5). Never use the service_role key in the app.
8. The next APK then opens with **Continue with Google**. The first person to sign in becomes **Owner** of their own
   team; add others in Agent Profile → Settings → Team and access (by their Google email and role).

## 3. Web version (GitHub Pages)

1. GitHub → repository → **Settings → Pages** → Source: **GitHub Actions**.
2. **Settings → Environments → github-pages → Deployment branches**: allow `feature/v2-full-update` (or merge the
   pull request into `main`).
3. The site appears at `https://jslproperties101.github.io/estate-agent-buddy/` after the next build.

## 4. Installing the Android app

On the phone, open the latest release (github.com/jslproperties101/estate-agent-buddy/releases), tap the
`EstateAgentBuddy-…-debug.apk`, allow your browser to install apps when Android asks, then Install. Later APKs install
over it (same signing key) and keep your data. Open **Estate Agent Buddy** from its icon; allow Location when asked.

Debug signing key fingerprint (only needed if Google's native Android services are added later):
SHA-1 `1A:F9:28:D6:59:1C:90:C7:02:CD:67:D3:E9:54:3F:34:3C:DD:94:64`, package `com.jslproperties.estateagentbuddy`.
