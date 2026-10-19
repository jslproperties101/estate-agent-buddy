# JoyChange003 - Batch C: Photos (19 Oct 2026)

Changes 53, 54, 67, 68. Model chosen: Sonnet 5.5 + High (suggested by Claude, Joe said "start next batch and suggest model").

## Change 54 - empty photo boxes (8 photos showed 2 empty boxes)
Cause was not reproducible here; two weak spots were found and fixed (`src/data/store.ts`, `src/ui/common.tsx`):
- Two boxes asking for the same picture at the same moment could each make a different web address, and one of them was later cancelled when the file was written again. Now there is ONE address per file (`fileUrl` shares the lookup).
- A picture still on screen lost its address the moment its file was written again. The old address is now cancelled 30 seconds later.
- Safety net: a picture that fails to draw asks once for a fresh address (`StoredImage` + `store.refreshFileUrl`), instead of staying empty.
NOT confirmed on a phone: if empty boxes still appear, tell me how many photos, and whether they were just added, reopened after Save, or after a sync.

## Change 53 - smooth, flowy photo swipes
- Photo viewer (`src/ui/PhotoViewer.tsx`): the photo follows the finger; a quick flick (speed over 0.45 px/ms) or a drag past 60 px moves on, and the next photo glides in from the side with the flick's offset (about 0.3 s). A short drag springs back (0.26 s). Arrows and the keyboard glide too. Reduced-motion phones get no animation.
- Large property card (`src/listing/ListingUI.tsx`, `useCardSwipe`): the picture follows the finger; same flick rule; the next picture glides in; arrows glide.
- Not done: other places where pictures are shown but not swiped (the grid card, the property page strip) are unchanged. Feel on a real phone (momentum) must be tested by Joe.

## Change 67 - Add Pictures: menu and Reorder screen
- The 3-dot menu now has: Set as Main Photo, Reorder Photos, Delete (red, asks first). Reorder is disabled with one picture.
- The inline drag handle and its hint were removed from the Add Pictures list.
- Reorder Photos (`src/listing/PhotoReorder.tsx`) is a full screen: 4 pictures per row, nothing drawn on them (no icons, labels or delete), the text "Click to enlarge, drag to move order" (BM and Chinese too), Done button and X.
- Tap a picture: it opens large with an X (the photo viewer). Drag: mouse or pen after 6 px; a finger after a short press-and-hold (0.22 s) so swiping still scrolls the page. The screen scrolls by itself within 72 px of the top or bottom edge (faster nearer the edge). Dropping on another picture puts it in that place; the first picture becomes the main one.

## Change 68 - "Main" label
"Main" (BM "Utama", Chinese "主图") lies along the bottom of the main picture, centred, 22 px, only on the Add Pictures list. Not shown on the Reorder screen.

## Tests
- Unit: `tests/joychange003-batchC.test.ts` (shared picture address, delayed cancel, refresh, movePhoto, auto-scroll speed).
- Browser: `tests/ui-batchC.test.mjs` BC1-BC4; `tests/ui.test.mjs` (photo test now drags on the Reorder screen) and `tests/ui-cc001.test.mjs` (menu items) updated.
- Add to the browser command: `tests/ui-batchC.test.mjs`.
