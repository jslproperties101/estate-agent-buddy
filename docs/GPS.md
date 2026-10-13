# GPS Assistance — Stage 4 audit, changes and the screen-off plan

Branch `feature/v2-stage4-gps`, started from `feature/v2-stage3-property-contacts` @ `e2a6b01`. Not merged, not deployed, no live
Supabase change. **Every statement about GPS below is about the code and browser tests. Nothing here has been run on a phone.**
The tests use simulated GPS positions and a stand-in for Google Maps (see `tests/ui.test.mjs`); they prove the screens and rules,
not real GPS, real Google Maps or screen-off tracking.

## 1. Audit checklist (against the code, 14 Oct 2026)

| Item | Status | Evidence |
| --- | --- | --- |
| GPS Assistance has four cards: House Shopping, My Banner Location, My Property Map, Co-broke Opportunity Map (Coming Soon) | DONE | `gps/GpsUI.tsx` `GpsHome`; test U27 checks the four names and the Coming Soon badge. |
| Co-broke Opportunity Map clearly Coming Soon, not operational | DONE | Card is greyed, badge + aria-label say Coming Soon, tapping opens the Coming Soon page ("not built yet") in EN/BM/ZH. U25, U27. |
| "My Property Map" name | DONE | `gps/strings.ts` `map`. |
| My Location button, Map / Satellite / Hybrid, markers, property locations | DONE (browser) · NOT PROVEN (phone) | `maps/MapView.tsx`; U29, U38, U13, U14. |
| Property Map selected-property card with Banner placed? status, banner count, Navigate | DONE (browser) | U27. |
| Banner position by GPS, by tapping the map, by typed coordinates | DONE (browser) · NOT PROVEN (phone) | `AddBannerSheet`; U27, U38. |
| Change a saved banner position later | DONE | "Change location" edits the same record; U38. |
| Placement date, note, optional photo | DONE | U27. |
| Take down keeps the banner as history with its date; status → Removed when none is left | DONE | `domain/banners.ts`; B1, U27. |
| Banner placed? on the property record, detail page and map card | DONE | U27. |
| Navigate uses the saved position | DONE | `navigationUrl`; U27, U70 now checks the changed position. |
| Banner photo can be removed after it was added | **MISSING → fixed** | Only "Change photo" existed. |
| Earlier position visible after a position change | **PARTIAL → fixed** | The old position was only in the generic record history (Phase 2). Now kept on the banner (`moves`). |
| Banner on a sample property flagged sample | **MISSING → fixed** | The banner was a normal record, so it would have been uploaded as real data pointing at a property that is never uploaded. |
| Removal date chosen by the agent | PARTIAL, not changed | Taking a banner down stamps today's date. Not in the brief; say if you want a date picker. |
| Screen-off / background GPS | **NOT BUILT** | See section 3. The app records only while open with the screen on (wake lock); it says so on the House Shopping screen. |
| Real Google Maps, real GPS, Samsung behaviour | NOT PROVEN | Needs the S23 Ultra and your Google Maps key. |

## 2. What changed in Stage 4

* `Banner.moves` (new, optional): when a banner's position is changed, where it stood before is appended (id, time, latitude,
  longitude, accuracy, source). Shown under the banner ("Position changed n times" → "Was at … until …"), also after it is taken down.
  Entries have ids, so two phones' entries merge item by item and a clash on the position itself is an ordinary conflict.
* A banner on a sample property is itself flagged `sample`, so it is never sent to the team and is removed with the sample data.
* "Remove photo" on the banner sheet (new or saved banner). The stored picture is deleted when the banner is saved.
* No new permission, plugin, service, key or database change. No migration.

## 3. Screen-off / background GPS — plan (not built, needs your approval)

**Today.** `gps/tracker.ts` uses the WebView's `navigator.geolocation.watchPosition` plus a screen wake lock. In the Android app
the manifest has only `ACCESS_COARSE_LOCATION` and `ACCESS_FINE_LOCATION`. When the screen turns off or the app is backgrounded,
Android may stop WebView location updates, so a route can have gaps. `MapView`'s ◎ button and `useLivePosition` restart the
watch on demand, which helps the map but does not record a route in the background.

**What is needed.** A native Android *foreground service* of type location that keeps the GPS running and hands points to the
existing `addPoint` logic (accuracy and jitter checks stay in `domain/journey.ts`).
* Plugin: a Capacitor background-location plugin (for example the community `background-geolocation` plugin; compatibility with
  Capacitor 7 and its licence must be checked before choosing — some commercial plugins are paid, which needs your approval).
* Permissions (to be added by `scripts/android-setup.mjs`): `ACCESS_BACKGROUND_LOCATION` (Android 10+, asked separately and only
  after foreground location), `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_LOCATION` (Android 14+). `POST_NOTIFICATIONS` already
  exists (the service must show a persistent notification while recording).
* Native version: raise `nativeVersion` 3 → 4 — **a new APK is then required** (new plugin and permissions cannot arrive by the
  web update).
* Play Store: publishing with background location needs a declaration/review; side-loaded builds do not.

**Lifecycle.** Start → ask foreground permission → ask background permission (explain why) → start service + notification →
points flow to the tracker → Pause stops the service → Stop saves the journey and stops the service. If the app is killed, the
service ends; on next open the journey is offered for resume (the tracker already restores an open journey).

**Battery.** Continuous high-accuracy GPS is the main drain. Mitigations: ~5 s / 10 m distance filter, stop on Pause/Stop, a visible
notification with a Stop action, a warning after a long session. Samsung "Put unused apps to sleep" and battery optimisation can
still stop the service: the app must guide the agent to set Estate Agent AI Buddy to Unrestricted.

**Errors to handle.** Foreground permission refused, background permission refused (record while open only, and say so),
GPS switched off, no signal (keep the journey, show a gap), service killed by the system (mark the journey as interrupted), Android
14 service-type rejection.

**Test plan (real device only).** S23 Ultra, release APK: (1) walk/drive 10 min with screen off, check point density and route;
(2) lock/unlock mid-journey; (3) deny background permission, confirm the message and foreground-only recording; (4) kill the app
from recents; (5) battery use over 30 min; (6) Unrestricted vs Optimised battery setting; (7) airplane mode (GPS still works);
(8) the notification Stop action. Until these pass, the screen keeps saying that screen-off recording is untested.

## 4. Is a new APK required for Stage 4?

**No.** Stage 4 changes only web code and text; nothing native changed (`nativeVersion` stays 3, no new plugin or permission).
It arrives through the normal update. If the S23 does not yet run an APK with native version 3 (the 13 Oct update), that APK is
still needed once. Screen-off recording would require a new APK (section 3).
