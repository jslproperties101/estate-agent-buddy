# Estate Agent Buddy

Field app for a Malaysian property negotiator working mainly in Nilai and Sepang (formerly "Property Explorer").
Target: a native Android app (Capacitor) for the Samsung S23 Ultra, with Supabase (Singapore) as the cloud backend.

## Current state (Version 2.0, 12 Oct 2026)

Version 2.0 turns the v1L prototype into a working app that keeps its data. Smart Capture has been removed
completely; property information is captured by voice.

| What | Status |
| --- | --- |
| Saving data permanently on the phone | **Done** (IndexedDB: records, photos, documents, name cards) |
| Dashboard, 12 tiles | Done: To-Do, Calendar, Opportunities, Property List, Vendor List, Buyer List, GPS Assistance, Agent Financial (8), Property Calculator (9), Profile & Name Card (10), Ask Expert (11), Voice Command (12) |
| Property List, detail page, form | Done: Grid first/default, Large cards, refs hidden on cards, per-section Edit, agreed edit order |
| References (prefix + unique number) | Done |
| Location (Country → Jalan), Malaysia default, Add from Google Map with discrepancy check | Done (Google needs a key) |
| Dropdowns with remembered, removable custom values | Done |
| English / Bahasa Malaysia / Chinese | Done (BM and Chinese wording are drafts for checking) |
| Inquiry History, Viewing History, Convert to Viewing, lead colours | Done |
| To-Do, Calendar, appointments, reminders (incl. 3 and 7 days before) | Done; phone notifications while closed need the Android app |
| GPS Assistance: House Shopping tracker and property Map | Done; Google map display needs a key; background tracking needs the Android app |
| Agent Financial, Property Calculator, Profile & Name Card, Ask Expert, Voice Command | Done |
| Opportunities (matching, stages) | Not built (screen says so) |
| Cloud sync to Supabase | Code and table ready; not tested against a live project |
| Android app | Not built |
| Phone testing | Not done |

### Automated checks (12 Oct 2026, Claude's workspace, Chromium at 384 × 824)

| Stage | Result |
| --- | --- |
| Type check (every file, strict) | Passed |
| Lint (project checks) | Passed |
| Unit tests | 36 / 36 |
| Build | Passed |
| Screen tests | 22 / 22 |

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
