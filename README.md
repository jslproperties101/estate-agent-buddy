# Estate Agent Buddy

Field app for a Malaysian property negotiator working mainly in Nilai and Sepang (formerly "Property Explorer").
Target: a native Android app (Capacitor) for the Samsung S23 Ultra, with Supabase (Singapore) as the cloud backend.

## Master instruction progress (12 Oct 2026)

Work now follows the consolidated **Master Development Instruction**. The full audit, the status of every section and
the staged plan are in [`docs/AUDIT.md`](docs/AUDIT.md).

**Stage 1 (done):** visible form borders and clearer labels on every form; 15-card dashboard (Subsale, Project,
Co-broke added; "Profile & Name Card" renamed **Agent Profile**); explorer progress strip from real data; one shared
RM formatter and money box for every money field.

**Owner requests (12 Oct, done):** reference-number dropdown (used numbers red, free ones selectable); **My Banner
Location** in GPS Assistance (four cards now) with a **Banner placed?** status on every property.

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
| Cloud sync to Supabase | Code and table ready; not tested against a live project |
| Android app | Not built |
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
