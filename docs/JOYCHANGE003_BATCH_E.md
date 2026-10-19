# JoyChange003 - Batch E (19 Oct 2026)

Voice fix and the AI Assisted Command screen (Changes 55-65), plus corrections to Batches D and F. Model: Opus 5.5 (Joe: "Go on opus and take your time"). Read after `HANDOVER_JOYCHANGE003.md`.

Before building, the handover was checked against the original discussion (chat "Remove pencil and x icons from form"). Some details had been lost in the handover, so a few things built in Batches D and F did not match what Joe agreed. They are corrected here (see the end).

## Change 55 - voice fix (phone test needed)
- Cause found in the community speech plugin's Android code: with live words on, `start()` is answered at once, so a later "no speech", "busy" or "network" error goes to an answer already given and never reaches the app. The app then waits (looks frozen) and finally says nothing was captured. The plugin also destroys and re-makes Android's recogniser on every start, which some phones refuse while the previous one is still closing (no start sound).
- Fix: the app's own small speech plugin, `EabSpeechPlugin.java`, written by `scripts/android-setup.mjs` next to `MainActivity` and registered there. It keeps ONE recogniser, made when the AI Assisted Command screen opens (`prepare`), closes the previous session before a new one, and reports every step as an event tagged with a session number: ready (the start sound has played), speaking, end of speech, live words, final words, error.
- App side (`src/voice/recognizer.ts` `listenEab`, `prepareVoice`): one listener for all sessions; "Getting ready… wait for the sound" until Android says ready, then "Listening… speak now"; a "busy" before listening began is retried once with a fresh recogniser; stopping before the microphone opened closes quietly; clear messages for no speech, no permission, network. The microphone permission still comes from the community plugin. Older APKs (without the new plugin) keep the old path.
- The Java was compile-checked here against stub classes; the real check is the QA build. Please test: tap the mic several times in a row, speak after the sound, stop early, and report "worked" or "failed" with what you saw.

## Changes 56 / 59 - layout
- Full-width text box; under it, centred in one row: microphone, **Clear**, gold **AI Process** (EN / BM / 中文).
- Clear empties the box and the results, stops any recording and forgets the selected record, at once (no question).

## Change 57 - How to use and examples
- 8 sections, each with 8 or more examples: Add a new property, Change a property, To-do and calendar, Buyers and contacts, **Search and find** (new), Lists / WhatsApp / calls, Several at once, English and Malay together. In English and Bahasa Malaysia; the Chinese screen shows Chinese titles with the English examples (Chinese commands are not understood yet, as agreed).
- Shiny soft-gold example boxes, a larger gap between sections and between examples.
- Every example is checked by a unit test (E57-1) to be a command the app really understands.

## Change 58 - smarter commands
- Places: the built-in place lists now include common Kuala Lumpur areas (Sungai Besi, Cheras, Bukit Jalil, …). A place said in lower case ("in sungai besi") is understood, and the address chain above it is filled (township → city → state).
- Owner names said in lower case are written properly ("ahmad bin ali" → "Ahmad bin Ali").
- A price or rent said without "RM" ("asking price 500k", "rental 1800 per month") is understood; a small number ("3 bedrooms") is never taken as a price.
- "Search and find": price range (under / above / between), at least N bedrooms, freehold / leasehold, available / sold / rented, all passed to the property list filters.
- A new listing still opens the prefilled form to review (nothing saved automatically); the matching saved property and contact are offered first (Change 50), with "Create new".
- A new contact whose name or phone is already saved shows "already saved, open it instead?".

## Change 60 - confirm card and Undo
- Each command becomes a card saying what was understood. To-dos, appointments and contacts are saved only on **Confirm** ("Edit in the form" opens the form instead). Property changes keep the tick list and **Apply change**.
- After a save, **Undo** stays for 10 seconds (it removes the new record, or puts the property back as it was).

## Change 61 - several commands and follow-ups
- One sentence can hold several commands ("Add a new buyer Lim 012 888 7777 and remind me to call him tomorrow at 3pm"); each gets its own card ("Command 1 of 2"). "him" / "her" / "dia" becomes the name said earlier; a to-do that names a contact confirmed in the same sentence is linked to that new contact.
- Follow-ups ("Now change the price of this to RM1.2 million") are about the record chosen or changed last, only when the sentence points back to it ("this", "it", "now", "ini"…). A plain "Set the price to RM3 million" still asks which property.

## Change 62 - recent commands and suggestions
- The last 10 commands (this phone), under "Recent commands": tap one to put it in the box, or "Run again".
- Up to four suggestions from the saved data: viewings tomorrow, buyers not contacted for 7 days or more, to-dos due. Tapping one selects the person and opens the WhatsApp texts (or the to-do list).
- Both show only when nothing else is open, so the screen stays minimal.

## Change 63 - mixed language and quick actions
- Sentences mixing English and Malay ("Tukar price P1001 to RM3 juta", "Buka buyer list") are understood.
- People found or chosen get one-tap **Call** and **WhatsApp**.

## Change 64 - open lists, selected record, WhatsApp texts
- "Open property list" / "open vendor list" (or owner list) / "open buyer list" (and BM "buka senarai …") shows that list, with a search box, right under the three buttons. The one chosen becomes the **Selected** record (shown with Call, WhatsApp, Open and ✕).
- "WhatsApp this buyer and remind our appointment" (or "WhatsApp this owner about the price", "WhatsApp Lim about the property") opens the suggested messages, filled in from the saved records (name, property, appointment date and time, price); a detail that is not saved is left out, never made up. The one that fits what was said is first.
- Own texts: **+ Add New**, and the pencil and X inside the list (as in Change 51). They may use {name}, {property}, {date}, {time}, {price}.
- Picking a text shows it to change, then **Open WhatsApp** opens WhatsApp to that person with the text typed in. The app never sends it.
- Own texts follow the account to the other phones and the website since Batch B2 (`JOYCHANGE003_BATCH_B2.md`).

## Change 65 - logo on the AI Assisted Command page
- The logo and app name (as on the main screen) sit under the title bar and its gold line, centred, about 10% of the screen, with the text box right under; they scroll away with the page.

## Corrections to Batches D and F (agreed wording restored)
- **65:** was put on the main page by mistake in Batch D; the main page is back as before (logo and wording in the top bar), and the strip is on the AI page as above.
- **72:** Remind me later offers **1 hour, tonight (8 pm), tomorrow (9 am)**; History is at the **bottom** of the Notifications screen; the red number on the bell leaves out **every** dismissed or snoozed notification (not only invitations), counts only what needs attention now (due reminders, follow-ups, reviews, invitations, a failed sync…), and no longer counts reminders coming up later.
- **75:** the A4 flyer takes up to **8 photos in total** (main + 7 in the strip).
- **76:** the "Address and size extras" group as agreed: unit/lot, street, **neighbourhood**, storeys, frontage, depth and **price per sq ft** (worked out from the asking price and the built-up size, else the land size). Ceiling height, power and loading bays were removed.
- **77:** pictures go to the **Gallery** only, in an "Estate Agent AI Buddy" album; PDFs and other files go to **Downloads** only.
- **78 / 79:** the icon row and its one control sit **right under** the pinned photo; moving to another photo with unsaved edits asks **Save as new photo / Discard changes / Cancel**; on the Improve tab the picture follows the finger sideways.
- **82** (every phone pick list as the app's gold centre pop-up, about 60 of them) was never built. Recorded as its own batch, **Batch G**.

## Tests
- Unit: `tests/joychange003-batchE.test.ts` (E57-1 every example understood; E61-1..3; E64-1..3; E62-1/2; E63-1; E58-1; E55-1..3 with a fake Android plugin). Updated: `tests/commands.test.ts` C1 (state from the address chain), `tests/stage5-voice.test.ts` VS1 (examples now in c056Strings), D72-3 and the Batch F unit tests for the corrections.
- Browser: `tests/ui-batchE.test.mjs` BE1-BE8. Updated in `tests/ui.test.mjs`: U19, U61, U62, U77 (AI Process and the confirm card), U124 (Clear and AI Process). `tests/ui-batchD.test.mjs` / `ui-batchF.test.mjs` updated for the corrections.
