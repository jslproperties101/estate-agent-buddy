# MainForAdmin-E — main app reads Admin EAB feature flags; a tapped push alert opens the post

Written 22 Oct 2026. Branch `feature/qa-mainforadmin-e` (from `joychange006` @ 42cd72c, same code as the QA build
`feature/qa-joychange006` @ 2943d53 plus docs). Pushing it builds the isolated QA APK (`qa-<commit>`).
No database change: it uses `eab_my_flags()` from AdminBatch006 (`20261023100000_admin_batch_006_ops.sql`, on
EAB-QA-Test, 41/41 there on 22 Oct 2026) and the feed functions from MainForAdmin-D and JoyChange010-03.

## Joe's decisions (22 Oct 2026)
1. Flags control home tiles **and** hidden test features.
2. Tapping an alert opens **that exact post**.
3. A post that is gone: open the list with a short message.
4. Batch name MainForAdmin-E.

## What the phone does

### Feature flags (`src/feed/flags.ts`)
- After every automatic sync (with the account check and the feed), the app calls `eab_my_flags()` and keeps the answer
  for the signed-in account (`meta.flags`). Another account on the same phone never uses it.
- `tile.<key>` OFF → that home card is hidden for these agents. ON or no such flag → shown as before. The other cards
  keep their numbers. Keys: project, sales, opportunities, creative, contacts, activity, gps, finance, calculator,
  matching, expert, market, agenda, property, voice (as in `TILES`, App.tsx).
- `beta.<name>` ON → a test feature is shown (`betaOn(flags, name)`). **No feature uses a beta key yet**; the switch is
  ready for the next feature that should be piloted with a group first.
- Any other key: kept, changes nothing.
- Offline: the last answer is kept. A database without `eab_my_flags`: no switches (the app as before).
- Hiding a card hides the card only; it does not block the screen behind it (e.g. a push alert still opens Market
  News). It is not a permission and keeps no data from the agent.

### Tapped push alert (`src/feed/tap.ts`, `src/native/push.ts`, App.tsx)
- The tap is noted for the open/delivered counts as before (JoyChange010-03), then the feed is read again and:
  - Market News post → Market News with that post open (marked read, scrolled to)
  - Project → Projects with that project open
  - Announcement → Home with it shown as a pop-up, even a banner closed before. OK on a tapped banner only closes the
    pop-up (not counted as acknowledged); OK on a tapped pop-up counts as acknowledged as before.
  - Not in the feed and the feed was just read → Market News, "This post is no longer available."
  - Not in the feed and the feed could not be read (offline) → Market News, "This post could not be loaded. Connect to
    the internet…" (an agent is never told a post is gone when the phone simply has not received it).
- A tap that starts a closed app waits until the app's screens are ready.
- Words in EN / BM / ZH (BM / ZH to be checked by a native speaker).

## Not done / limits
- Android only (iPhone push not registered — unchanged).
- Not tested on a real phone. A browser cannot receive a push alert: the screen tests use a stand-in that exists only
  in the screen-test build (`__EAB_TEST__`, `scripts/build.mjs --no-env`), never in the APK or the website.
- Admin EAB's Feature Flags screen still shows "The main app does not read these switches yet" — that note should be
  changed in Admin EAB once this build is installed (Admin EAB repo, not this branch).
