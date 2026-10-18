# JoyChange003 - Batch B (19 Oct 2026)

Record of what Batch B changed, and of the new changes Joe added while it was being built. Read after `HANDOVER_JOYCHANGE003.md`.

## Batch B: dropdowns and keyboard (Changes 51, 82, 66, 71)
Model chosen by Joe: Sonnet 5.5 + High.

### Done
- **82 + 51 (look and tap)** - `src/ui/OptionSelect.tsx`, `src/styles.css`
  - Tapping a dropdown opens its list as a pop-up card in the middle of the screen (the same `.scrim` / `.dialog` card every dialog uses), with the field name on top and a close button. Escape or a tap outside also closes it.
  - The pencil and the X are no longer beside the closed field. They live only inside the list, on remembered entries (pencil first, then X).
  - The Change 36 lock (a saved value opened only with its pencil) is gone: one tap always opens the list. "Not Set" in the list empties the field.
  - The last entry reads "+ Add New" (was "Others…"), in English, Bahasa Malaysia ("+ Tambah Baharu") and Chinese ("+ 添加新项"): `c.others` in `src/i18n.ts` and `src/ui/cc001Strings.ts`.
  - Native `<select>` controls (about 60 of them, mostly fixed choices such as status or yes/no) are NOT changed; Android already shows those as its own centre dialog. Only the remembered-value dropdown (`OptionSelect`) was rebuilt.
- **51 (clear children)** - already worked for the address chain (`clearBelow` in `src/listing/cc001.ts`: country > state > city > township > neighborhood > street). No other parent/child dropdown chain exists.
- **66 + 71 (keyboard)** - `src/ui/keyboardAlign.ts`, `src/styles.css`
  - While the keyboard is open the page gets spare room under its last field (`html.kb-open`, `--kb-room` = 85% of the visible height), so even the last field can be scrolled up clear of the keyboard.
  - `touch-action: pan-y` on `.content`, `.opt-list` and `.dialog` so lists keep scrolling with the keyboard open. NOT confirmed on a phone: the original cause of "lists will not scroll with the keyboard open" is unknown, so please test it.

### NOT done (needs a decision)
- **51: "new items remembered on the account across devices".** Remembered dropdown values are saved on the phone only (the `options` singleton in `src/data/store.ts`; the sync engine in `src/data/sync.ts` only carries the record collections). Making them follow the account needs either a new synced collection (touches types, sync merge, team access, backup, tests, and cannot be tested end to end here) or the account metadata used for the country (Change 46; the metadata travels inside the sign-in token, so a long list is risky). Recommendation: do it as its own step (call it Batch B2) with a collection-based design, after Batch B is tested on the phone.

## New changes from Joe, added during Batch B
- **88 - Country picker: shorter list, Continue visible.** On the first-login "Where do you work?" screen the Continue button was hidden under the ad. Fixed in `src/styles.css` (`.start-scrim .sheet` height now leaves room for the ad, `.country-list` about 26% of the screen height, Continue stays at the bottom of the card) and a smaller logo in `src/ui/CountryChoice.tsx`. Test: K1 in `tests/ui-change046.test.mjs` checks the button is on the screen above the ad and the list is short.
- **89 - First load: choose sample data or empty.** The screen ("Populate with Sample Data - Recommended" / "Start Without Sample Data", `src/ui/StartChoice.tsx`) is still in the app and is shown right after the country is chosen, but ONLY while the phone holds no records at all and the choice was never made on it. Why Joe may not have seen it: (1) the Continue button of the country screen was hidden, so he could not get past it (fixed by Change 88); (2) a signed-in account whose test data is already on the cloud brings records down at the first sync, so the workspace is not empty and the question is skipped on purpose. Sample data can also be loaded any time in Settings -> Sample data. Status: no code change yet for 89; to be confirmed after Joe retests on a fresh install. If he wants the question shown even when the account already has data, say so (that changes the rule).

## Tests added or changed
- `tests/joychange003-batchB.test.ts` (new): keyboard room, "+ Add New" strings.
- `tests/ui.test.mjs`: "Others…" renamed to "+ Add New"; U123 now checks the Change 51 behaviour (no pencil or X beside the field, centre pop-up, pencil then X inside the list, Not Set, + Add New, close button) instead of the Change 36 lock.
- `tests/ui-change046.test.mjs` K1: Change 88 checks.
