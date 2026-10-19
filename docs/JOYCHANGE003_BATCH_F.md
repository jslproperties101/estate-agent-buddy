# JoyChange003 - Batch F (19 Oct 2026)

Marketing Studio, downloads and Photo Studio. Model: Opus 5.5 (Joe asked for my suggestion; Batch F was his pick). Read after `HANDOVER_JOYCHANGE003.md`.

## Change 75 - poster photo strip and footer gap
- `src/marketing/render.ts`, `src/marketing/content.ts`.
- A4 flyer: the strip under the text now takes every ticked photo after the main one, up to 8 (`STRIP_MAX`), 4 to a row, so a flyer shows up to 9 photos (was 4). With 5-8 strip photos it uses two rows; when space is short it falls back to one row, then none (as before).
- A clear gap (`FOOT_GAP` = 36 px) between the last section and the gold line of the bottom bar. The gold line is kept.
- Portrait post: up to 4 small photos in a row (was 2), so up to 5 photos. The square post stays 1 photo.

## Change 76 - Details to Show
- `src/marketing/content.ts` `MARKETING_KEYS`: added Address (Unit/Lot Number and Street) and the size extras (Floors, Frontage, Depth, Ceiling height, Power, Loading bays). All are unticked at first; they appear on the design only when ticked.
- A ticked address leads the place line ("12, Jalan Mawar 3, Taman Indah, Nilai"). The automatic headline still never uses the street or unit number.
- This reverses the earlier rule "street / unit never offered" (Stage 6, test MK2 updated), as Joe asked.

## Change 77 - downloads land in Gallery and Downloads, with Open
- `scripts/android-setup.mjs` now writes a small native plugin `EabFilesPlugin.java` next to `MainActivity` and registers it.
  - Every downloaded file goes to `Download/Estate Agent Buddy` (the Files app's Downloads). Pictures (PNG/JPG/WebP) are also written to `Pictures/Estate Agent Buddy`, so they show in the Gallery. PDFs go to Downloads only (the Gallery does not list PDFs).
  - Android 10 and newer: written through MediaStore (no permission needed). Android 9 and older: written to the public folders and scanned.
  - `open()` hands the saved file to the app that shows it (Gallery, PDF viewer).
- `src/lib/pdfRender.ts` `saveFile` uses the plugin first, and falls back to the old `Documents/Estate Agent Buddy` when the plugin is missing (an older APK) or the write fails.
- `src/ui/FileActions.tsx`: a short message ("Saved to Gallery and Downloads." / "Saved to Downloads.") with an **Open** button. This covers every Download button that uses FileActions (Marketing Studio and the PDF previews).
- The Java was compile-checked here against stub classes only; the real check is the QA build. **Phone test needed.**

## Changes 78 / 79 - Photo Studio
- `src/photos/PhotoStudioUI.tsx`, `src/photos/strings.ts`, `src/styles.css`.
- 79: the screen opens on a grid of the property's photos, 2 to a row, with the "Enhanced copy" / "Privacy-masked copy" label below the picture (not on it). Tap a photo to edit it on its own. In the editor: "All photos" goes back to the grid, ‹ › and a sideways swipe on the picture move to the previous/next photo (on the Improve tab; on Privacy masks a drag draws a mask). With unsaved changes it stays and says "Save or reset your changes first".
- 78: the adjustments are a row of 7 icons (Brightness, Contrast, Colour, Clarity, Straighten, Turn, Crop). The selected icon shows its one control (a slider, the two turn buttons, or the crop choices). Auto brightness stays as a tick. The picture is pinned at the top of the screen (sticky) so the effect is visible while the slider moves.
- The Photo Studio button on a property opens the grid (the photo shown on the property is marked in it).

## Change 81 - poster styles
- `src/marketing/render.ts` (`THEMES`, `PALETTE`), `src/marketing/strings.ts`, `src/marketing/MarketingStudioUI.tsx`.
- Eight styles: Black and gold, White and gold (the two older ones), Navy and gold, Burgundy and gold, Charcoal and silver, Cream and gold, Minimal black and white, Sky blue and white.
- The picker is no longer a dropdown: a black box with a darker gold border holding style tiles (2 to a row), each with a colour swatch and a lighter gold border; the chosen tile has a bright gold border.

## Tests
- `tests/joychange003-batchF.test.ts` (unit F75-1, F76-1/2, F77-1, F81-1, F78-1), `tests/ui-batchF.test.mjs` (BF1 Marketing Studio, BF2 Photo Studio).
- Updated: `tests/stage6-marketing.test.ts` MK2/MK7 (Change 76), `tests/ui.test.mjs` U81/U82/U83 and the screen tour (grid first, icons), U84 (style tile instead of the dropdown), U85 (address offered but unticked), U86 (portrait ticks 4 photos).
