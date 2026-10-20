# JoyChange006 — Batch 2: Keyboard (Change D)

Branch: `joychange006-batch1` (continues Batch 1). Not pushed, no QA build yet.

- `src/ui/keyboardAlign.ts`: the field being typed in lands ~30% from the top of the visible screen (`FIELD_AT`), never under
  the title bar or above a pop-up's top; tall text boxes show their bottom; never scrolls the page behind a pop-up.
- `src/styles.css`: while the keyboard is open, pop-ups move to the top of the visible screen; scrolling pop-ups and sheets get
  spare room at the end; sticky Continue stays visible.
- `src/adverts/AdBar.tsx`: bottom advert (and the native AdMob banner) hidden while the keyboard is open, back after.
- Tests: `tests/joychange006-batch2.test.ts`, `tests/ui-batch006-2.test.mjs` (keyboard imitated by shrinking the screen to
  470 px, as Android does). Real keyboards (SwiftKey) only checked on the phone.
