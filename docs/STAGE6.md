# Stage 6 — Photo Studio, Marketing Studio and Advertising & Listing Tracker

Branch `feature/v2-stage6-marketing-images`, started from `feature/v2-stage5-calculator-pdfs-voice` @ `7549978de91b7a1c0172aa276918e8ffde81d177`.
Not merged, not deployed, no live Supabase change, no native change, no new permission. Stages 3, 4 and 5 are still awaiting
owner review; Stage 6 is **not approved**.

**Every statement below is about the code and browser tests (Chromium, 384 × 824 px). Nothing here has been run on the Samsung
S23 Ultra, and no real camera, Android share sheet, Android notification or real advertising platform was used.**

## 1. Audit checklist (against the code and the master document, 14 Oct 2026)

| Item (master §12–13) | Before Stage 6 | Now |
| --- | --- | --- |
| Automatic photo shrink on upload | DONE (`lib/images.ts`) | unchanged |
| Photo correction: brightness, clarity, straighten, crop, rotate | NOT DONE | DONE in browser (Photo Studio) |
| Preserve original; show Original / Enhanced / Masked as different things; compare and keep or reject | NOT DONE | DONE in browser: edited result is a **new** photo labelled "Enhanced / Privacy-masked copy"; Original ⇄ Edited toggle; nothing is saved until "Save as new photo" |
| Replace the original only when the agent chooses | NOT DONE | DONE: separate "Replace the original…" button with a confirmation |
| Manual privacy masks for house numbers, plates, faces, papers, signs | NOT DONE | DONE in browser (drag a rectangle; solid block or coarse blocks) |
| Automatic detection of private details | NOT DONE | **NOT BUILT, deliberately.** The screen says "Nothing is detected automatically". |
| Remove third-party watermarks | not requested | **NOT BUILT, deliberately** (master §12.2: only with rights). Cropping and masks are the lawful alternatives offered. |
| AI decluttering | NOT DONE | **NOT BUILT.** Needs an online AI image service and the agent's explicit consent; no service has been chosen or approved and no cost has been agreed. The Photo Studio says so. |
| Batch of 2–50 photos in one run | NOT DONE | **NOT BUILT.** One photo at a time (typical need is 6–10; a batch queue is a separate decision). |
| Perspective correction | NOT DONE | **NOT BUILT** (only turn / straighten / crop). |
| Marketing Studio: flyer, poster, social designs; choose details and photos; only the chosen format; PDF / PNG / JPG / WebP; A4, WhatsApp, Facebook, Instagram | NOT DONE | PARTIAL, DONE for three formats: **A4 flyer** (PDF, PNG, JPG), **square post** 1080 × 1080 and **portrait post** 1080 × 1350 (PNG, JPG, WebP). Not built: brochures (multi-page), reusable saved templates, AI-written copy, Facebook link-preview size (1200 × 630). |
| Advert tracker as its own screen from the property detail page | PARTIAL (small list inside the property form) | DONE |
| Platform, ad type, title, URL, platform reference, screenshot, notes, dates, cost | PARTIAL (platform, dates, reference, notes only) | DONE |
| Statuses planned / live / needs update / paused / expired | DONE in the model | DONE; a "live" advert past its end date is **shown** as Expired (saved status is changed only when the agent taps "Mark as expired") |
| Add Fake Listing, unmistakably labelled | NOT DONE | DONE |
| Expiry / needs-update reminders | NOT DONE | DONE in browser: "Needs attention" list (summary screen and Notifications); phone notifications are **scheduled** in the Android app (NOT PROVEN on the phone) |
| Cost summaries by property, platform and period | NOT DONE | DONE |
| Sample adverts kept out of real figures | NOT DONE | DONE |
| Real operation on the S23 Ultra | — | NOT PROVEN (see section 8) |

## 2. What is new, by area

**Advert tracker** (`adverts/AdTrackerUI.tsx`, `adverts/strings.ts`, `domain/adverts.ts`)
- Adverts stay inside the property record (`marketing.ads`), so the property form and the tracker show **one** set of data and old
  adverts keep working (new fields are all optional; test AD11).
- Added to each advert: type, title, URL, cost (RM), screenshot (compressed, kept on the phone), reminder days (default 3), `fake`.
- **Test (fake) listings** carry a red "TEST · not a real listing" label everywhere they appear (tracker, property detail, property form),
  are forced to start as *Planned*, and are **never** counted in costs or reminders.
- **Sample properties' adverts** are likewise never counted and never remind; the summary says how many were left out.
- The tracker only records. It never posts to a platform and says so. Making a Marketing Studio file does not create an advert.
- Cost summary: totals by property, platform and month of the published date, an optional From / To on that date; adverts without a cost
  are counted and shown as "without a cost entered (counted as RM 0)".
- Reminders: real, running adverts (live / needs update) with an end date appear under "Needs attention" from their reminder day, and
  expired / needs-update ones stay there. In the Android app they are also scheduled as phone notifications at 9:00 on the reminder day
  (same mechanism as to-do reminders). **Not proven on the phone.**

**Photo Studio** (`photos/PhotoStudioUI.tsx`, `lib/photoOps.ts`, `lib/photoStudio.ts`, `domain/photoStudio.ts`)
- Opens from the Photos section of a property's detail page. Improve tab: auto brightness, brightness, contrast, colour, clarity, turn,
  straighten (±10°, with the empty corners cropped away), crop (4:3, 16:9, square).
- Privacy masks tab: drag to cover an area. Masks are applied last, on the final pixels. A solid block, or coarse blocks too big to
  read text or faces. Turning / straightening / cropping clears the masks (the picture moved) and says so.
- Saving re-draws the picture as a new JPEG, so hidden camera data (such as GPS position) is not carried into the copy (checked in the browser test).
- **Nothing is detected automatically** and the screen says the agent must look over the whole photo.
- All pixel work is local; nothing is uploaded; no AI service.

**Marketing Studio** (`marketing/*`)
- Opens from the property detail page. The agent picks **one** format, the file type, black-and-gold or white-and-gold style, the language
  on the design, a headline, the details to show, up to the format's number of photos and which contact lines to print.
- Only the chosen format is drawn, and only when "Make preview" is pressed. After a change the screen says the file is out of date;
  it is remade only when the agent asks.
- Content rules: facts come from the record only; a ticked detail with no value is left off and listed; anything not marked
  *Confirmed* keeps a `*` and the design carries "* Not yet verified"; a sample property's design says SAMPLE; owner, vendor, commission,
  notes, tenancy, exact street / unit / lot and map position are never offered; no price → the screen says so and none is invented;
  the headline is the agent's own words or the property's advert title, else the type and area (never the street).
- Sizes and where they come from: A4 = ISO 216 (210 × 297 mm, drawn at 150 dpi = 1240 × 1754). 1080 × 1080 and 1080 × 1350 (4:5) are the
  Instagram feed sizes listed by a third-party 2026 guide (99dollarsocial.com, read 14 Oct 2026). **I did not verify them against
  Meta's own documentation, and found no verified WhatsApp or Facebook post specification**, so the square is offered as a general
  post image, not as a certified Facebook/WhatsApp size. Please check before relying on them.
- WebP is offered only when the phone's browser can write it.

## 3. A defect found and fixed in Stage 5

The Stage 5 buyer PDF used the address-style card title when a property had no advert title, so the **street and unit number could
appear as the PDF heading and in the PDF file name even though the exact address starts unticked**. It now uses the advert title, else
the type (and the area only if the location is ticked) — test BP11. If you already sent buyer PDFs made from Stage 5 for properties
with no advert title, check them.

## 4. Files changed

New: `src/adverts/{AdTrackerUI.tsx,strings.ts}`, `src/domain/{adverts.ts,photoStudio.ts}`, `src/lib/{photoOps.ts,photoStudio.ts}`,
`src/photos/{PhotoStudioUI.tsx,strings.ts}`, `src/marketing/{content.ts,render.ts,strings.ts,MarketingStudioUI.tsx}`,
`tests/stage6-{adverts,photos,marketing}.test.ts`, this file.
Changed: `src/listing/model.ts` (optional fields on `Advert` and `Photo`), `src/listing/{ListingUI.tsx,ListingForm.tsx,buyerPdf.ts,BuyerPdfUI.tsx}`,
`src/App.tsx`, `src/nav.ts`, `src/styles.css`, `tests/ui.test.mjs`, `tests/stage5-buyerpdf.test.ts`, `docs/AUDIT.md`.

**Database / native / permissions: none.** No migration (adverts and photos are fields inside existing property records; the record
merge already joins lists item by item). No plugin, no Android permission, no native version change.

## 5. Decisions for the owner (not made for you)

1. **AI decluttering**: whether to do it at all, which online service, who pays, and the wording of the consent screen. Nothing is chosen. A Stage 6 design would send the
   selected photo to that service, so it must never run without an explicit consent step and must label the result; it must not hide defects or change structure (master §12.3).
2. **Batch photo processing** (2–50 photos): build a queue, or keep one-at-a-time.
3. **Platforms list** in the tracker (PropertyGuru, iProperty, Mudah, The Edge Property, Facebook Ads, Facebook Marketplace): add others (e.g. Carousell, EdgeProp, WhatsApp broadcast)? The list can be edited by the agent per advert already (The tracker also takes a typed "Other" platform).
4. **Advert types** offered (normal, featured, boosted, social, other): confirm or rename.
5. **Marketing**: brochures (multi-page), saved templates, AI-written copy (needs an approved service), Facebook link-preview size.
6. **Social sizes**: confirm 1080 × 1080 and 1080 × 1350 against the platforms' own help pages.
7. Stage 3 decisions still open and untouched: headline placement, the verification field list (20 facts), loss of owner verification marks when a typed owner becomes a vendor contact. Stage 5's open decisions (buyer requirement fields, Chinese voice commands, share plugins) are also untouched.

## 6. Paid services / keys

None used or added. Local canvas drawing only. (Maps and the other services from earlier stages are unchanged.)

## 7. New APK?

**No new APK is needed for the Stage 6 code**: no native, plugin or permission change. As in Stage 5, saving or sharing a file *inside the Android app* is NOT PROVEN
(Web Share with a file, else a download); if it fails on the phone the fix is the free `@capacitor/filesystem` + `@capacitor/share` plugins, which need your approval and a new APK.

## 8. To test on the Samsung S23 Ultra

1. Photo Studio on real camera photos (large files): speed, memory, the drag-to-mask gesture with a finger (the browser test uses a mouse), scrolling vs drawing on the picture.
2. Photos taken with the phone's camera appear the right way up in Photo Studio, and the saved copy has no location data.
3. Marketing Studio: make each format, **Share** to WhatsApp / Instagram / Facebook, **Download**, and open the saved file; Chinese characters on the design; WebP supported?
4. Advert tracker: add a screenshot from the phone's gallery; open a link.
5. Expiry reminders: create a live advert ending in 2 days with "On the day" or "1 day before" and check the phone notification arrives at 9:00 (and not for test / sample adverts).
6. The three new screens in BM and 中文 at the phone's real font size.

## 9. Test results

Run 14 Oct 2026 in Claude's workspace (Chromium 384 × 824 px; no phone):

| Check | Result |
| --- | --- |
| Strict type check (`npm run typecheck`) | clean |
| Lint (`npm run lint`) | passed, 167 files |
| Unit tests | 254 of 254 (Stage 6 adds AD1–AD12, PH1–PH13, MK1–MK11 incl. MK3b, and BP11) |
| Production build | succeeded |
| Full screen suite, 3 complete runs on the final build | 87 of 87, 87 of 87, 87 of 87 (Stage 6 adds U79–U88) |
| Database / RLS tests | not run: no migration or database file changed (the Stage 5 totals 125 / 18 are expected unchanged) |

Intermittent failures: none seen in these 3 runs. During development one run of the Stage 5 suite had failed U50 once; that
was fixed in Stage 5 (the test waited for the restored draft). Everything above uses stand-ins (no real phone, camera, share
sheet, notification, Google or advertising platform).
