# Handover: JoyChange003 (written 19 Oct 2026)

Paste the "Start prompt" at the bottom into a new chat. Read `docs/HANDOVER_JOYCHANGE002.md` first: its "Who and how", "Branches and builds" and "Environments" sections still apply.

## Where things are
- Work branch: `joychange003` (pushed; a push to it does not build). QA build branch: `feature/qa-joychange003` (contains "qa", so it builds the QA APK `com.jslproperties.estateagentbuddy.qa`; release tag `qa-<short commit>`). Push both with `git push origin HEAD:refs/heads/joychange003 HEAD:refs/heads/feature/qa-joychange003`.
- Last commit: `5d8dbb8`. QA build for it was pushed and is building; check the Actions run finished green and the `beta-updates` branch appeared.
- Batch A is DONE, committed, pushed, all local checks green (tsc, lint, 500 unit, 157 browser; the 2 old buyer-order tests were updated to the new order).
- Joe will test Batch A on the QA APK and report "worked"/"failed". Do not start Batch B until he says which batch and model.

## New this session: QA app updates itself
- The QA build now checks its OWN list (`QA_UPDATE_MANIFEST` in `src/native/updates.ts`, = raw.githubusercontent.com/.../beta-updates/latest.json). CI step "Update list for the QA app" (QA variant) force-pushes a fresh orphan branch `beta-updates` with `latest.json` + `bundle-<sha>.zip` each build. Branch name deliberately has no "qa" (so it never starts a build). The real app's list (GitHub Pages) is never touched.
- Joe must install the next QA APK ONCE (the old one has updates off). After that QA builds arrive by themselves unless nativeVersion goes up.
- NOT tested end to end (only runs in CI). If the QA app does not offer an update after the next QA push, check the manifest URL, the `beta-updates` branch, and CORS/redirect behaviour.

## Batch A (done): Changes 52, 70, 73/83/85/87, 74, 80, 84, 86
- 52: all help "?" icons and help text removed (FieldHelp.tsx, help.ts deleted).
- 73/83/85/87: one light-gold border token `--box-line: #D8B95C` on every grouped box/card/row.
- 74 (replaces 69): menu and list screens get a 10dvh gap at the top (`.content:is([data-screen=...])` rule in styles.css).
- 70: Buyers status pills in a 3-per-row grid, Hot-first order (hot, warm, cold, booked, dropped).
- 80: every radio and tick box is a fixed 28px gold style (global rule in styles.css).
- 84: key facts read "Label - Value" side by side (`.kf` in styles.css). Only the property key facts so far; other label/value places may still need the dash.
- 86: all add buttons at the top, gold, "+ Add New ..." wording (Inquiry, Viewing, To-do, Buyer, Vendor, Project) in EN/BM/zh.

## Remaining batches (each needs Joe's go-ahead and a model choice; he usually picks Sonnet + Medium)
B, C, D1, D2, E, F, G1, G2, G3, H. They cover Changes 51, 53-69, 71-72, 75-79, 81-82, 85 (as discussed in chat, numbered 51-87). Joe's decisions per change (from the discussion):
- 51: tap opens list; "Not Set" in list; pencil/X only inside dropdowns, other options become "+ Add New"; new items remembered on the account across devices; clear child fields when parent changes (country > state > city > ... > street).
- 53: smooth, flowy photo swipes everywhere (slide with momentum).
- 54: 8 photos show 2 empty boxes (random). Cause unconfirmed (StoredImage / useFileUrl / store.fileUrl object URLs); Joe has not tried the "Save" check.
- 55: voice is buggy (Google sound sometimes, freezes, "nothing captured"). Likely cause: `src/voice/recognizer.ts` native path does available > checkPermissions > two addListener > start before listening. Needs phone testing.
- 56-64: AI Assisted Command screen: full-width text box, mic and "AI Process" button centred, "Clear text" button between record and AI Process (clears text and results, no confirm), gold shiny box, 8+ examples per section with gaps between sections (plus Search and find), smarter commands using saved data (addresses like "new listing in Sungai Besi", contact names), new commands "open property list / vendor list / buyer list" (dropdown below the 3 icons, then "OK now change the price..." or "WhatsApp this buyer..." opens prefilled WhatsApp text list with custom entries via pencil/X), all four idea groups for enhancements.
- 65: logo and app name at top (about 10% of screen), scrolls away.
- 66/71: keyboard must never hide text: extra spare scroll room at the page end app-wide (`src/ui/keyboardAlign.ts` lacks it); lists must scroll while the keyboard is open.
- 67: Add Pictures: 3-dot menu has delete, make main, reorder; reorder opens a new screen with 4 tiles per row, tap to enlarge with X, drag to reorder, auto-scroll while dragging, no icons on pictures, no delete there; instruction text "Click to enlarge, drag to move order". 68: "Main" label along the bottom of the main picture only on the Add Pictures list, centred and bigger.
- 72: Notifications: own box per notification, clear Dismiss and "Remind me later" (pick snooze time), gap between boxes, keep History; sync messages leave notifications and show in Settings only; a failed sync appears in notifications, success never does.
- 75: Marketing poster: grow the photo strip beyond 4 pictures (cause: `imgs.slice(1, 4)` in `src/marketing/render.ts`), keep the gold footer line but with a gap.
- 76: Marketing "Details to Show": add Address and size extras only (fields list in `src/marketing/content.ts`).
- 77: Downloads must land in Gallery and Downloads (currently written to Documents/Estate Agent Buddy by `lib/pdfRender.ts`, which Android does not list); short message with an Open button.
- 78: Photo Studio: adjustments as icons with one slider driven by the selected icon, pinned photo so the effect is visible (all seven adjustments). 79: grid 2 per row, swipe; tap enlarges to edit one at a time; "Enhanced" label below the picture, not on it.
- 81: poster style picker: gold border, black, darker/lighter gold for main box and item box; styles to add: Navy and Gold, Burgundy and Gold, Charcoal and Silver, Cream and Gold, Minimal Black and White, Sky Blue and White. 82: every dropdown opens as a centre pop-up.
- 85: same light gold border at every nesting level.

## Other open items
- Create the Dropbox record `/Estate Agent AI Buddy/JoyChange003.txt` for the batches (ask first; Dropbox tools cannot edit, only create new).
- Carried over from the JoyChange002 handover: phone testing of Changes 13-50, going-live decision (live Supabase never touched without Joe's explicit confirmation), app label rename, JoyChange002 Dropbox correction.

## Start prompt (paste into the new chat)
> I'm Joe Matthew, product owner of the Estate Agent AI Buddy app (repo jslproperties101/estate-agent-buddy). Read `docs/HANDOVER_JOYCHANGE003.md` (and `docs/HANDOVER_JOYCHANGE002.md`) first and follow them. Batch A is built and on the QA APK; I'm testing it on my phone. Here is what I found: ...
