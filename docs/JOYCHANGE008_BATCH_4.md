# JoyChange008 — Batch 4: Location lists (parent-child) and Malaysia town list

Branch: `joychange006-batch1` (continues Batches 1-3). Not pushed, no QA build yet.

## Decisions taken with Joe (21 Oct 2026)
- **Township kept as its own level** (Joe chose this after an explanation): Country > State > City / Town > Township >
  Neighbourhood > Street. Nothing already saved moves. The form label stays "City" (Change 015 removed "City / town").
- **State and City / Town list:** the open GitHub copy `AsyrafHussin/malaysia-postcodes` (MIT, updated Mar 2026):
  16 states and federal territories, 444 cities / towns. data.gov.my, OpenStreetMap and Geofabrik cannot be reached from
  the build workspace. To swap to the official MCMC file later: put `postcodes.csv` from data.gov.my in Dropbox, then run
  `node scripts/build-my-places.mjs postcodes.csv "MCMC via data.gov.my (CC BY 4.0)"` — the credits line follows.
- **Neighbourhood and Street:** agent-added for now ("+ Add New", remembered under the places above). OpenStreetMap
  neighbourhoods and streets come in a later batch (streets need Supabase, which is parked until Joe approves).
- Accepted 008 suggestions: changing a level clears the levels below (with a question first); the delete warning wording;
  House Shopping journey names from the neighbourhood list (Batch 5).

## What changed
- `scripts/build-my-places.mjs` → `src/domain/myPlacesData.ts` (6 KB, ships in the app, works offline).
- `src/domain/places.ts`: `citiesFor(state)` = official towns of THAT state + the app's earlier short list for it, A to Z;
  `townshipsFor(city)` = only that town's townships. The old fall-back to "every city / township in Malaysia" when a
  state or town had no short list — the reason the lists looked unrelated — is gone. `allMalaysiaTowns()` is used to
  match names Google gives back (map picker, House Shopping); voice commands keep the short list (some official town
  names, e.g. "Rasa", are everyday words).
- `src/listing/ListingForm.tsx`: choosing a new State / City / Township when places below are filled asks first
  ("Change State? City, Township below it will be cleared…"); Cancel keeps everything.
- `src/ui/OptionSelect.tsx`: deleting a place (X) shows the 008 warning (EN/BM/ZH) and **saved properties keep their place
  names** (this replaces JoyChange002 Change 36, which cleared that part of the address on saved properties).
  Places the agent added under it are removed with it. Built-in places have no X. Rename (pencil) unchanged.
- About (Settings) shows a credits line for the place list.

## Not done / for Joe
- **Locking a lower level until its parent is chosen** (008 suggestion 3.2) is built but switched OFF
  (`LOCK_UNTIL_PARENT` in `src/listing/cc001.ts`): agents (and many saved properties) enter only a street with no town,
  which locking would block. Lists are parent-only either way. Joe to decide.
- **"Private to the agent":** places an agent adds are kept per workspace and sync with it. In a personal workspace that
  is private; in a shared team workspace, team members would see them. Making them per-person needs a sync change.
- **008 "pencil to add":** adding a missing place is "+ Add New" / "Add: …" at the bottom of every list (Change 51); the
  pencil on an entry renames it (Change 36). No separate pencil button was added beside the field.
- OSM neighbourhoods and streets; migration of old place names to the list (old names stay as text and still show).

## Tests
- `tests/joychange008.test.ts` (unit), `tests/ui-batch006-4.test.mjs` (screen, added to `test:ui`).
- `tests/ui.test.mjs` U123 updated for the new delete warning (Rename instead still works).
