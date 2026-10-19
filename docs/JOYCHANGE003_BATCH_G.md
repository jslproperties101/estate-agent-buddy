# JoyChange003 - Batch G (19 Oct 2026)

Change 82: every pick list opens as the app's own gold list in the middle of the screen. Model: Opus 5.5 + High (Joe: "Go on opus high"). Read after `HANDOVER_JOYCHANGE003.md`.

## What changed
- Batch B rebuilt the remembered-value dropdowns (`OptionSelect`) only. The other 56 pick lists (status, yes/no, file type, priority, appointment kind, commission type, verification state, language, poster output and so on, in 23 screens) still opened the phone's own grey picker with teal radio buttons. They now all open the same gold centre pop-up: the field name on top, an X, the current choice marked, a tap outside or Escape closes it.
- `src/ui/Select.tsx` (new) is a drop-in for `<select>`. The real list stays in the page with the app's field look (so the chosen value, screen readers, the keyboard and the tests are unchanged), with a clear tap area over it. A tap opens the gold pop-up; choosing sets the list exactly as the phone's picker would, so each screen's own code is unchanged. Enter, Space or Alt+Down on the focused field also open it.
- Every `<select>` in the screens was swapped for `<Select>` (in `ListingForm.tsx` it is imported as `PickList`, because that file has its own `Select` helper). Styles: `.sel-wrap`, `.sel-tap` in `src/styles.css`.

## Tests
- `tests/ui-batchG.test.mjs`: BG1 (tap opens the centred gold list with the same choices, current one marked, choosing sets and saves the field, X and a tap outside close), BG2 (no list left with the phone's picker on the property form and the calendar; the tap area covers the field exactly), BG3 (keyboard opens it, Escape closes, the close button speaks Bahasa Malaysia).
- All earlier browser tests still pass unchanged (they set lists the normal way).

## To test on the phone
- Tap any pick list (for example Property Type, Sale or Rent, Arrangement, a to-do's priority, the poster file type): the gold list opens in the middle of the screen, never the grey phone picker. Choose a value and check it shows in the field.

## CI fix
- The QA build first failed on browser test C14 (`tests/ui-change010.test.mjs`), the one that failed on and off since Batch A. Cause: its two to-dos were due today at 8:00 and 9:00; between 8 and 9 o'clock one is overdue and the other is not, so the To-Do screen opened on the Overdue tab and the test could not see the other one. Not an app bug. Both now use the same time. Checked by running the test on UTC time at 08:19 (fails before the fix, passes after).
