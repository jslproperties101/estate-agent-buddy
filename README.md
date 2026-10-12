# Estate Agent AI Buddy

Field app for a Malaysian property negotiator working mainly in Nilai and Sepang (formerly "Estate Agent Buddy" and
"Property Explorer"). The Android package id stays `com.jslproperties.estateagentbuddy`, so new APKs install over the old one.
Target: a native Android app (Capacitor) for the Samsung S23 Ultra, with Supabase (Singapore) as the cloud backend.

## Update of 13 Oct 2026 (version 2.1.0, native version 3 — needs the new APK)

One coordinated update from the owner's 21-point list. Details, test evidence and what still needs the phone:
[`docs/AUDIT.md` → "13 Oct 2026 update"](docs/AUDIT.md#13-oct-2026-update).

- **Name and logo:** Estate Agent AI Buddy; the owner's logo (white outer border removed) in the header, sign-in,
  app icon, splash, and a ~1 s spinning startup animation.
- **Dashboard (15 cards):** To-Do, Calendar, Opportunities, Property List, **Contacts** (Buyers + Vendors),
  Inquiries & Viewings, GPS Assistance, Agent Financial, Property Calculator, Agent Profile, Ask Expert, **News**,
  Project (Coming Soon), Settings, **Voice Command (15, bright gold)**. Top bar: **Co-broke Opportunities (Coming
  Soon)** and **Notifications** (replaces Big News).
- **Vendors** have their own status (Pending Property Info, Pending Follow-up, Listed, Negotiating, On Hold, Closed,
  Withdrawn); buyer lead colours unchanged.
- **Voice:** after End recording the app waits for Android's final words (it used to stop listening too early) and
  explains when nothing was recognised. **Phone book** buttons (contact form, Send Name Card) always say what
  happened; picked name and number stay editable.
- **Agent Profile:** required fields marked; Send Name Card switches on when they are complete.
- **New Property form:** collapsible sections (closed at first), floating Save bar, "?" field help.
- **GPS:** My Location takes a fresh reading every press; tap-to-select and later change for banners, House Shopping
  marks and property location.
- **Sample data:** new users choose "Populate with Sample Data (Recommended)" or "Start Without Sample Data"; sample
  records are marked and never sent to the cloud.
- **Typing lag:** `captureInput` removed from the Android config (it replaced the keyboard connection with a simple
  key-by-key one); less work per keystroke in the property form.

## Master instruction progress (12 Oct 2026)

Work now follows the consolidated **Master Development Instruction**. The full audit, the status of every section and
the staged plan are in [`docs/AUDIT.md`](docs/AUDIT.md).

**Stage 1 (done):** visible form borders and clearer labels on every form; 15-card dashboard (Subsale, Project,
Co-broke added; "Profile & Name Card" renamed **Agent Profile**); explorer progress strip from real data; one shared
RM formatter and money box for every money field.

**Owner requests (12 Oct, done):** reference-number dropdown (used numbers red, free ones selectable); **My Banner
Location** in GPS Assistance (four cards now) with a **Banner placed?** status on every property.

**Android app, Google Maps, Google sign-in (12 Oct, built):** installable Android app (Capacitor), built on every
push by GitHub Actions and attached to a GitHub Release; real Google Maps with "Check Google Maps" diagnostics and your
GPS position on the maps; Google sign-in through Supabase with team roles enforced by the database (tested on
PostgreSQL). What you still need to set up is in [`docs/SETUP.md`](docs/SETUP.md).

**Updates without reinstalling (12 Oct, built):** from native version 2 the installed app downloads new versions by
itself from GitHub Pages and keeps all its data; a new APK is needed only for new phone permissions or plugins
(docs/SETUP.md §6). Explorer Progress removed from the dashboard (owner, 12 Oct). Maps: always-visible My Location
button that recentres after moving the map, Map / Satellite / Hybrid. Voice and phonebook use Android's own services
in the app; WhatsApp ID / Alias on contacts.

## Current state (Version 2.0, 12 Oct 2026)

Version 2.0 turns the v1L prototype into a working app that keeps its data. Smart Capture has been removed
completely; property information is captured by voice.

| What | Status |
| --- | --- |
| Saving data permanently on the phone | **Done** (IndexedDB: records, photos, documents, name cards) |
| Dashboard, 15 cards (3 × 5) | Done: To-Do, Calendar, Opportunities, Property List, Vendor List, Buyer List, GPS Assistance, Agent Financial, Property Calculator, Agent Profile, Ask Expert, Voice Command, Subsale (Coming Soon), Project (Coming Soon), Co-broke |
| Property List, detail page, form | Done: Grid first/default, Large cards, refs hidden on cards, per-section Edit, agreed edit order |
| References (prefix + unique number) | Done |
| Location (Country → Jalan), Malaysia default, Add from Google Map with discrepancy check | Done (Google needs a key) |
| Dropdowns with remembered, removable custom values | Done |
| English / Bahasa Malaysia / Chinese | Done (BM and Chinese wording are drafts for checking) |
| Inquiry History, Viewing History, Convert to Viewing, lead colours | Done |
| To-Do, Calendar, appointments, reminders (incl. 3 and 7 days before) | Done; phone notifications while closed need the Android app |
| GPS Assistance: House Shopping tracker and property Map | Done; Google map display needs a key; background tracking needs the Android app |
| Agent Financial, Property Calculator, Agent Profile, Ask Expert, Voice Command | Done in the browser (voice not tested with a real microphone) |
| Opportunities (matching, stages) | Not built (screen says so) |
| Google sign-in and cloud sync (Supabase) | Built; roles and security tested on PostgreSQL; needs your Supabase project (docs/SETUP.md) |
| Android app | Built by GitHub Actions on every push (debug APK in Releases); not yet tested on a phone by the owner |
| Phone testing | Not done |

### Automated checks (12 Oct 2026, after Stage 1, Claude’s workspace, Chromium at 384 × 824)

| Stage | Result |
| --- | --- |
| Type check (every file, strict) | Passed |
| Lint (project checks) | Passed |
| Unit tests | 42 / 42 |
| Build | Passed |
| Screen tests | 27 / 27 |

Screen tests use a stand-in for Google Maps and simulated GPS positions. They do not prove real Google Maps,
real GPS, speech recognition, WhatsApp or notifications on the phone.

## Layout

| Path | What it is |
| --- | --- |
| `app/` | The app (see `app/README.md` for commands, code layout and API setup) |
| `supabase/migrations/` | Table for the optional cloud sync (row-level security per user) |
| `supabase/functions/ask-expert/` | Server function for optional Ask Expert AI answers (holds the AI key) |
| `schema.sql` | Full relational database design (48 tables), the long-term target; not applied |
| `Property_Explorer.docx`, `build_doc.py`, `img/`, `img_small/`, `prototype/` | Earlier documents and prototypes, kept for reference |

## Checkpoints

`checkpoint/v1I`, `checkpoint/v1L` and `checkpoint/pre-v2` (the code before Version 2.0).

## Rules for this project

- No paid services, subscriptions or API keys without the owner's explicit approval. Google Maps Platform was
  requested by the owner on 12 Oct 2026; it needs the owner's Google Cloud project and billing account.
- No keys or secrets in the code: build-time environment variables or Settings on the phone only.
- Nothing is called working until it is tested, and nothing is called tested on the phone until the owner reports it.
- A Git checkpoint before every major change.
