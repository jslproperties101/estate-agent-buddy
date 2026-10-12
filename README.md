# Estate Agent Buddy

Field app for a Malaysian property negotiator working mainly in Nilai and Sepang (formerly "Property Explorer").
Target: a native Android app (Capacitor) for the Samsung S23 Ultra, with Supabase (Singapore) as the backend,
OpenFreeMap maps and GitHub Actions builds, as approved in the master document (Version 1D, decisions D5–D7).

## Current state (12 Oct 2026)

The code in `app/` is the **Version 1L browser prototype**, imported unchanged from the owner's ZIP.
It is not yet a working business app:

| What | Status |
| --- | --- |
| Android app | Not built |
| Supabase database, login, team access | Not created |
| Saving data permanently | Not implemented: data lasts only while the page is open |
| Background GPS | Not built, never tested on the phone |
| Vendor List, Buyer List, matching | Not built (tiles only) |
| Phone testing of any screen | Not done |

### Automated tests: verified 12 Oct 2026

The full suite (`npm test`) was re-run on the imported code, with the exact pinned package versions:

| Stage | Result |
| --- | --- |
| Type check (logic files) | Passed |
| Rule tests | 11 / 11 |
| Local-reading tests | 12 / 12 |
| Voice tests | 8 / 8 |
| Property listing tests | 9 / 9 |
| Command tests | 5 / 5 |
| Build | Passed |
| Screen tests (Chromium, 384 × 824) | 28 / 28 |
| **Total** | **73 / 73** |

Notes:
- On the first run, screen test U13 failed only because `tests/fixtures/photo_large.png` (15 MB) is excluded by
  `.gitignore`. It is created by `tests/fixtures/make_fixtures.py`. With the file recreated, U13 passed.
- These tests use sample data and a simulated speech service. They prove the prototype's rules and screens, not
  phone behaviour, real speech recognition or permanent storage.

## Layout

| Path | What it is |
| --- | --- |
| `app/` | Version 1L prototype: React + TypeScript, built with esbuild; `npm test`, `npm run build`, `npm run single` |
| `app/dist/` | Built page from the ZIP |
| `schema.sql` | Database design (48 tables), tested on a PostgreSQL 16 test server only; not applied to Supabase |
| `Property_Explorer.docx`, `build_doc.py`, `img/`, `img_small/` | Earlier document export and wireframe images |
| `prototype/property-explorer-prototype-v1I.html` | Older Version 1I single-file build, kept for reference |

## Checkpoints

Git tags could not be pushed from Claude's workspace, so checkpoints are branches:
`checkpoint/v1I` (first commit) and `checkpoint/v1L` (the v1L import, before any change).
The ZIP had no Git history, so the earlier tags v1I–v1L from Claude's workspace are not here.

## Source of truth

- Master document: Google Doc "Property Explorer" in the owner's Google Drive (Versions 1A–1L).
- Requirements audit against the code (12 Oct 2026):
  https://claude.ai/code/artifact/14385105-6804-4bdd-ac48-abbbec8e9a9c

## Next milestone (waiting for the owner's choice)

Either **M1 – GPS Test app** (Version 1D order) or **M1 – Core databases** (decision D32, 11 Oct 2026).

## Rules for this project

- No paid services, subscriptions or API keys without the owner's explicit approval.
- Nothing is called working until it is tested, and nothing is called tested on the phone until the owner reports it.
- A Git checkpoint before every major change.
