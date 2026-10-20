# JoyChange006 — Batch 1: Look fixes

Branch: `joychange006-batch1` (from `joychange003` @ 89d1713). Not pushed, no QA build yet.

## A. Text overlapping text (whole app)
- Cause: scrolling lists made of flex columns squeezed cards shorter than their text.
- Fix: cards never shrink below their text (`flex-shrink: 0`), long words wrap. Also the "FOR SALE" / "Booked" badges on the Subsale List card no longer collide (BM, large font).

## B. One dropdown look (whole app)
- Property button in the calculator, Client dropdown, `Select`, property pickers all share the tokens `--dd-line`, `--dd-bg`, `--dd-inner` at the end of `styles.css`. Change the colour once there.
- Empty property wording: "No Property Selected" / "Tiada Hartanah Dipilih" / "未选择房产".

## C. Search bar in every pick list
- `src/ui/pickSearch.tsx`: one rule (`matchesText`) and one box (`PickSearch`) + "No results".
- Added to: all `Select` pop-ups (name or phone), PropertyPicker, review-area property and contact pickers.
- Not given a search (short or free-typing lists): reference-number combo box, WhatsApp message templates.

## Tests
- `tests/joychange006-batch1.test.ts` (unit), `tests/ui-batch006-1.test.mjs` (screen; added to `test:ui`).
