# JoyChange006 Part 2 — Batch 3: Splash (E), New status (F), Check-status colours (G)

Branch: `joychange006-batch1` (continues Batches 1-2). Not pushed, no QA build yet.

## E. Splash screen redesign
- `src/App.tsx`, `src/startup/startup.ts`, `src/startup/strings.ts`, `src/styles.css`.
- Centred "Estate Agent" / "AI Buddy" wordmark above the rotating logo (words only, bigger than the header's own mark).
- Logo spins at half the earlier speed (2 s per turn); progress bar fills smoothly over 10 seconds, no percentage.
- Five messages with animated "." / ".." / "..." dots, timed exactly to the agreed table (Encrypting data is the
  longest, on purpose).
- **Joe's choice (asked this batch): if the app is still not ready after the full 10 seconds**, the cover is removed
  anyway instead of waiting indefinitely. In the rare case the phone's storage genuinely isn't open yet at that point,
  a small plain screen with the real message ("taking longer than usual" / "could not be opened") and Try Again replaces
  the splash's logo and bar (which have already done their 10-second job). This only matters for a very slow phone or a
  real failure; on an ordinary phone nothing changes except that the cover never outlasts its own 10 seconds.
- BM/ZH wording for the five messages is Claude's suggestion, carried over from the spec file — **not yet confirmed by
  Joe**, same flag as before.

## F. New Availability status "Rented - Pending TA Signing"
- Added as its own stored status (not just a label), positioned just before "Rented" in the Availability picker, the
  filter list and every other place statuses are listed (`src/listing/model.ts`, `cc001.ts`, `cc001Strings.ts`,
  `listing/strings.ts`).
- Hidden by default in the Subsale List, same as Sold / Rented / Withdrawn (Change 41).
- **Joe's choice (asked this batch): does not count as available** — `src/domain/matching.ts`'s `offerable()` now
  excludes it, so it is never matched or offered to a buyer, same as a fully Rented property.
- **Open question for Joe (not asked this batch, flagging per the master instructions' "ask when it could materially
  affect behaviour" rule):** Track My Sales / commission (`src/deals/model.ts`) currently only recognises plain
  `'rented'` as a completed rental deal. A property marked "Rented - Pending TA Signing" will not show a deal stage or
  commission there until it is changed to plain "Rented". That seemed the safer default (the TA isn't signed yet), but
  I did not change deal/commission logic without your sign-off. Say if you want it treated as a rental deal already at
  this stage.
- No colour was given to the new status badge on cards (not discussed in the spec); it uses the same plain style every
  other non-"Available" status already uses (Booked, Sold, Rented, Withdrawn all share one look).

## G. Check-status pop-up colours
- `src/ui/Select.tsx`, `src/styles.css`. The Check-status pop-up (Confirmed / Owner Stated / Need to Check) now colours
  each option's own text the same green / orange / red already used on the field, the detail screen and lists — text
  colour only, no dot or side bar, exactly as asked.
- Fixed one inconsistency found while checking "every place a check status is shown" (point 3 of Change G): the
  Subsale List card's "N to check" badge was amber, not the same red as everywhere else. It is now red, matching.

## Tests
- `tests/joychange006-batch2.test.ts` (keyboard timing math, from Batch 2) unaffected.
- `tests/joychange006-batch3.test.ts` (unit: new status ordering, round-trip, hidden-by-default, not offerable, wording).
- `tests/ui-batch006-3.test.mjs` (screen: new option present and ordered correctly in the form; pop-up option colours
  match the field's colours; an ordinary dropdown is never coloured).
- Updated two pre-existing tests whose fixed lists needed the new status added: `tests/claude-changes001.test.ts`
  (CC10), `tests/joychange002.test.ts` (J41-1).
- `tests/phase1.test.ts` and `tests/ui.test.mjs` (U39b, U40, U42) updated for the new 10-second/5-message splash timing.
