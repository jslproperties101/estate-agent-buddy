# ClaudeChanges001 — owner's agreed list of 17 Oct 2026 (changes 1–12)

Branch `feature/qa-claude-changes-001`, based on `2.0.26.10.17.1` (`edaea24`). The branch name contains `qa`, so CI
builds only the isolated QA APK (`com.jslproperties.estateagentbuddy.qa`, "EAB QA"). No production data, Supabase
project, migration, schema, secret or deployment was touched. The agreed list itself is in the owner's Dropbox
(`/Estate Agent AI Buddy/ClaudeChanges001.txt`).

**No database change was needed.** Every new detail (co-broke agent, Booking / Sale / Rental details, the deal files'
link) is a field on the existing property record, which is stored and synced as one JSON record; the Calendar reminders
are ordinary appointment records; remembered dropdown values are the existing option lists.

**Status key.** **IT** = implemented and covered by automated tests (Node unit tests and Chromium at 384 × 824).
**NV** = not verified on a real Android phone.

| # | Change | Status | Code | Tests |
|---|---|---|---|---|
| 1 | Section 1 "Basic Info and Availability" (original font size); "Reference" → "ID"; Sale or Rent label kept; order ID, Availability, Property Type, Sale or Rent, Arrangement | IT, NV | `listing/ListingForm.tsx`, `listing/strings.ts` | CC1, X1, U5, U60 |
| 2 | No "Saved on This Phone" line anywhere; one banner on the main page (below the header line, above the cards) when sync fails: "3 listings not synced · Retrying in 60s", counting down to the automatic try every 60 s, no button. Also shown for a phone-storage failure and for conflicts (tap → review). Nothing on listings | IT, NV | `ui/SyncBanner.tsx`, `data/syncRunner.ts`, `App.tsx`, `sync/SyncUI.tsx` | CC2, X2, U1, U43, U54 |
| 3 | "Commission (RM)" (flat) / "Commission (%)"; Need to Check removed from Commission, and a stored mark is removed on save | IT | `listing/strings.ts`, `listing/verify.ts`, `ListingForm.tsx` save | CC3, X1, C14-1 |
| 4 | "Others…" on the property form's value lists (Land Use, Lot Type, Furnishing, Condition join the lists that had it), saved per agent, ✕ deletes custom ones, built-ins fixed, duplicates ignored (any capitals); fixed fields stay fixed | IT | `ui/OptionSelect.tsx`, `ListingForm.tsx` | U7, X5 |
| 5 | Location chain Country → State → City → Township → Neighbourhood → Street; each level's options are saved under the filled levels above (a blank level is skipped); changing a level clears the levels below (Unit/Lot stays); Street is a dropdown; a blank level stays blank in the record and is left out of every address | IT | `listing/cc001.ts` (`locationListKey`, `clearBelow`), `ListingForm.tsx` `Loc` | CC5, X5, C15-8 |
| 6 | No "Saved by You" on custom options; ✕ kept | IT | `ui/OptionSelect.tsx` | X5, CC-src |
| 7 | Edit Property photos one per row, smaller ⠿ and ⋮ (44 px touch area kept), menu "Set as Main Photo" / red "Delete" (asks first); tap opens a full-screen viewer (pinch zoom, drag, double-tap, swipe, arrows, Esc); Property page layout unchanged, tap opens the same viewer; advert hidden while the viewer is open | IT, NV | `ui/PhotoViewer.tsx`, `ListingForm.tsx`, `ListingUI.tsx`, `styles.css` | X7 |
| 8 | Availability moved into section 1 without check status; Special Features deleted; "Availability and Condition" section deleted | IT | `ListingForm.tsx`, `ListingUI.tsx`, `listing/verify.ts` | X1, U6, U37 |
| 9 | Contact box: Phone and "WhatsApp Username" each on their own full line, phone book on the name and the phone rows (either fills both), "@" inside the box; the number is used for calls and WhatsApp everywhere; Linked Vendor is one searchable list (name or number); typed / picked tenants and co-broke agents are kept as contacts once per person; every option list has a search box | IT, NV (phone book) | `ui/ContactBox.tsx`, `ui/ContactPick.tsx`, `deals/contacts.ts` | CC9, X9 |
| 10 | Arrangement Co-broke / Direct below Sale or Rent; Co-broke shows agent name, agency and contact; Status merged into Availability (Available Now · Available From · Booked · Sold · Rented · Withdrawn); "Listing Arrangement and Status" section deleted | IT | `listing/cc001.ts` (`availChoice`, `availPatch`), `ListingForm.tsx` | CC10, X1 |
| 11 | Booked → "Fill in booking details now?"; Sold → "Sold by you or by others?" (by others: agency and price; by me: the sale page); Rented → rental page. All agreed fields, people as contacts, files as confidential transaction documents, "Add my own fields". Also opened from the property page | IT, NV | `deals/model.ts` (field lists), `deals/DealUI.tsx` | CC11, CC11b, X11, X11b |
| 12 | Card 1 "Calendar & To-Do" asks which; card 2 "Track My Sales" (deals by stage, commission received / pending / this month / this year, deadlines in the next 60 days, tap opens the deal); deal dates become Calendar appointments at 9:00 with reminders 3 days and 1 day before (moved or removed when the deal changes) | IT, NV (phone notifications) | `deals/model.ts`, `deals/reminders.ts`, `deals/DealUI.tsx`, `App.tsx`, `icons.tsx` | CC12, CC12b, CC12c, CC12d, X11, U1 |

## Decisions taken while building (for the owner to confirm)
- **Condition** was in the deleted "Availability and Condition" section but was not discussed; it moved to Property
  Details instead of being deleted (built property types only).
- **Change 4 scope:** applied to the property form's value lists. The fixed fields stay fixed (Sale or Rent, Commission
  Type, Tenure, Prefix, Negotiable, the check statuses) and so do Banner Placed?, Advertised and the advert status,
  because the app's banner map and advert reminders depend on their values. Dropdowns on other screens (contact roles,
  to-do priority, appointment kind, lead status) are statuses the app's logic uses and were left as they are.
- **Search on every list (change 9):** every remembered-value list and the Linked Vendor list has a search box. The
  short fixed lists (two or three choices) are phone-native pickers without a search box. The search box does not open
  the keyboard by itself.
- **Sync banner:** besides "N listings not synced", it also shows when the phone's own storage failed and when records
  need a conflict decision (both would otherwise be invisible without the status line).
- **Record History:** the record line on a detail page now holds only its History button (no status words), so earlier
  versions can still be restored.
- **Old values:** a stored "Referral" / "Other" arrangement, "Needs check" status, Special Features and Handled By are
  no longer shown or editable; Special Features and Handled By are removed from a property when it is saved again (no
  active users, owner's instruction). Old Neighbourhood options saved without a parent are not offered any more.
- **Track My Sales commission:** "pending" uses the Agreed Commission from the booking, else the property's own
  commission; "received" needs the amount and a received (or invoice paid) date.
- **Rent due reminders:** the next 12 due dates within the tenancy.

## Not verified on a device
Pinch, drag and swipe in the photo viewer on the S23 Ultra, the phone book picker on the phone row, Calendar
notifications for deal dates on the phone, the sync banner with a real failed sync, and the layout of the new pages
on the phone. These need the owner's phone check of the QA APK.
