# Estate Agent Buddy — app (Version 2.0)

React + TypeScript, built with esbuild. Runs in Chrome on the phone today and is structured to be wrapped as the
Android app (Capacitor) later. Screens are in English, Bahasa Malaysia and Chinese.

## Commands

```
npm test          # type check (all files) + lint + unit tests + build + browser screen tests
npm run build     # builds into dist/ (reads EAB_* settings from the environment or app/.env)
npm run single    # one self-contained HTML file for opening on a phone (after build)
```

## Code layout

| Folder | What it holds |
| --- | --- |
| `src/data/` | Data layer: record types, IndexedDB storage (records + photo/document files), store, optional Supabase sync, sample data |
| `src/domain/` | Application rules, no screen code: references, location matching, To-Do/Calendar/reminders, inquiry→viewing, finance, calculator, journeys, name card, Ask Expert |
| `src/maps/` | Google Maps Platform: loader, geocoding, Places search, route preview, map view, location picker |
| `src/listing/`, `src/contacts/`, `src/agenda/`, `src/gps/`, `src/finance/`, `src/calculator/`, `src/profile/`, `src/expert/`, `src/voice/` | Screens and their text (EN/BM/ZH) |
| `src/ui/` | Shared pieces: dropdown with remembered values, section card with Edit, reminders picker, speech box |
| `types/react-shim.d.ts` | Minimal React types so every screen is type-checked here (see below) |
| `tests/` | Unit tests (`*.test.ts`) and browser screen tests (`ui.test.mjs`, screenshots in `tests/screens/`) |

## External services (no keys in the code)

All are optional; the app works without them and says clearly what is missing. Set them as environment variables
when building (copy `.env.example` to `.env`, which Git ignores, or use GitHub Actions secrets), or type them on the
phone in **Profile & Name Card → Settings**.

| Variable | Needed for | Set up |
| --- | --- | --- |
| `EAB_GOOGLE_MAPS_API_KEY` | Maps, Add from Google Map, address search, place names on House Shopping, route preview | Google Cloud project with billing; enable **Maps JavaScript API**, **Places API (New)**, **Geocoding API**, and **Directions API** (or **Routes API**). Restrict the key to the app's web address / Android package. |
| `EAB_SUPABASE_URL`, `EAB_SUPABASE_ANON_KEY` | Optional cloud copy ("Sync now") | Supabase project; run `../supabase/migrations/*.sql`; create a user (email + password) for the agent. |
| `EAB_EXPERT_API_URL` | Optional AI answers in Ask Expert | Deploy `../supabase/functions/ask-expert` with the secret `ANTHROPIC_API_KEY` (pay-per-use; set a spending limit). |

Navigation to a property ("Navigate") opens the Google Maps app with a universal link and needs no key.

## Notes on the build environment

The package registry could not be reached where this was built, so packages come from the machine's global
install (linked into `node_modules`). `@types/react` and ESLint could not be installed: every file is instead
type-checked with a small React type shim (`types/react-shim.d.ts`, strict mode, unused code reported), and
`scripts/lint.mjs` runs the project checks. With normal internet, add `@types/react`, `@types/react-dom` and ESLint
and delete the shim.
