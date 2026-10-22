# Batch I: four more games in the Games tile (v1buddychange015)

Asked by Joe on 22 Oct 2026 ("3 more games, 2 in 3D", then "keep both" Buddy Walks). Built with Opus 5.5 on
`feature/qa-games-2`, on top of Games-1 (`feature/qa-games-1`, commit a78293c). The QA APK is built by CI on push.

| Game | Key | What it is | Round | Max score |
|---|---|---|---|---|
| Buddy Walk: Streets | `buddyStreets` | First-person walk through an endless 3D neighbourhood; price the practice listing behind each gold For Sale sign (3 choices) | 2 min | 2500 |
| Viewing Rush | `viewingRush` | Chase-camera drive through the same 3D town to each buyer's viewing beacon; +10 s per viewing, bonus for beating par time | 60 s + 10 s per viewing | 3000 |
| Open House Tour | `openHouse` | First-person walk through a 3-bedroom show unit; tap the gold sparkle on each feature on the buyer's wishlist (3 of 8); wrong = -5 s, all 3 = +15 s and a new buyer | 90 s | 3000 |
| Match the Buyer | `matchBuyer` | Swipe (or Match / Skip) practice listings against a buyer brief: budget, two areas, type, bedrooms; every miss is explained | 60 s | 4000 |

The existing **Buddy Walk** (gallery of the agent's own listings) is unchanged; Streets is the endless-street version
from the Batch H prototype, added as its own game.

## How the 3D works
- `src/games/gl3d/`: a small WebGL drawer written for these games (`gl.ts`), the matrix and ray maths (`math.ts`),
  the endless town (`city.ts`), and the full-screen frame with the start / pause cards and walking controls (`shell.ts`).
  No 3D library is added, so the APK needs no new download and works offline.
- Battery: the picture is drawn only while a round runs and stops when the app goes to the background (the round
  pauses). Pixel density is capped at 1.5x. Only the 5 x 5 town blocks around the player exist at a time.
- A 3D game covers the whole screen and hides the bottom advert while open (`useImmersive`), like the PDF preview.
- If a phone cannot start WebGL, the game shows a short message and a Back to Games button instead of a blank screen.
- Scores, streak and badges use the existing Games-1 scores (this phone only). "Tried every game" now needs all seven.
- All buyers, listings and prices are invented practice data (`src/games/sample.ts`); nothing reads or changes the
  agent's records.

## Tests
- `tests/games-batchI.test.ts`: ray / wall / arrow maths, sign listings (stable, 3 distinct choices, one right),
  Match the Buyer listings (fit or miss exactly one need; reasons in EN/BM/ZH), viewing placement (on a road, 2+ blocks
  away) and bonus, Open House scoring, words in 3 languages.
- `tests/ui-games-batchI.test.mjs` (Chromium at 384 x 824, software WebGL): all seven games listed; each 3D game opens
  full screen, starts, draws, pauses, finishes into the result card and leaves no layer behind; walking to the first
  sign and pricing it; Match / Skip / swipe and Finish; BM and ZH; no text under 14 px or button under 44 px (U21).
- `tests/games-shell.test.ts` GS7 now expects the seven games in order.

Not proven until tried on a phone: smoothness and heat on the S23 Ultra, two-thumb control feel, tapping sparkles.
Phone checklist: `docs/BatchI-BuddyGames2-TestChecklist.txt`.
