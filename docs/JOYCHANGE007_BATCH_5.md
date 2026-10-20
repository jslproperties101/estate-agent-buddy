# JoyChange007 — Batch 5: House Shopping revamp

Branch: `joychange006-batch1` (continues Batches 1-4).

## Decisions (Joe answered "no preference" on 21 Oct 2026, so Claude's recommendations were used)
- A marked position stays in the journey; each mark has **Save as property** (one tap, pre-filled, "Needs check").
- **Continue this journey** does not count the break as driving time.
- A journey and a single marked position can be **deleted**, after a confirmation.

## What changed (spec section → result)
- 2.1 Information box (screen-on note and driving warning) removed.
- 2.2 Map and the buttons under it fill the screen (measured below the title bar and above the advert); the page still
  scrolls to the cards. House Shopping no longer has the 10% top gap of Change 74.
- 2.3 Hybrid only, no Map / Satellite / Hybrid buttons. 2.4 Starts at zoom 20 (about 55 m across on a phone).
- 2.6 "Mark property here" under the map, with Pause / Stop. 2.7 "Marked" count replaces GPS points.
- 2.8 "Places passed through" card removed — and its Google lookup every 300 m is gone (fewer Google charges).
- 2.9 No "saved properties within 100 m" card; the map shows only this journey's marks (empty at each start).
- 3 Mark form: Banner type (Agent / Owner / Maybe Owner Banner), banner phone, For Sale / For Rent / Both, the matching
  price(s) — all required, checked on Save — and optional comments. No property type. Position and time are taken from
  where the agent stands; "Move to the right spot" corrects it later.
- 4.1 Stop saves the journey (also with 0 marks) and stays on the screen. 4.3 Cards show only the area, date / time
  and "N marked" (distance and time are still stored and shown inside the journey).
- 4.4 Area name: the nearest saved property's neighbourhood / township / town within 1.5 km (no Google call); otherwise
  ONE Google reverse-geocoding lookup per journey.
- 4.5 / 4.6 A journey shows only its own route and marks, with **Continue this journey** and **Start new journey**.
- 6.2-6.3 Tracking: moves under 10 m ignored; the route is thinned to about one point every 45 m plus turns; batches of
  up to 100 thinned points go to Google Roads "Snap to Roads" with `interpolate=true` (verified in Google's
  documentation, 21 Oct 2026), overlapping 3 points so pieces join; the rest is sent at Stop. The phone draws the plain
  GPS line at once and the road line replaces it batch by batch. After 3 failed requests in a row, nothing more is sent.
- 6.5 Every Roads request is written to the existing usage log (Change 19) with points sent and estimated cost
  (US$0.01 each); reverse geocoding and web map loads were already logged. No coordinates are ever logged.

## Not done / for Joe
- **Native Android map (6.1)**: needs a new native map plugin; packages cannot be installed from the build workspace.
  The APK keeps the web map (billed per map load).
- **Two-finger rotate (2.5)**: Google's web map can only rotate its vector maps, which cannot show satellite / hybrid.
  Comes with the native Android map.
- **Roads API key**: snapping uses the same Google key as the map. A key restricted to websites may be refused by the
  Roads API, and the Roads API must be enabled in Google Cloud. If refused, the plain GPS line is kept (no crash).
  To check on the phone.
- The API usage log goes to the developer usage database; Admin EAB's API Usage screen needs the backend batch (parked).
- Privacy (section 8): banner phone numbers are other people's personal data — for the Privacy Notice and the lawyer.

## Tests
- `tests/joychange007.test.ts` (unit: 10 m rule, thinning, turns, batches, joining, continue, area, drawn line, Roads
  request with a fake Google). `tests/ui.test.mjs` U13 / U13b / U38 rewritten for the new screen.
