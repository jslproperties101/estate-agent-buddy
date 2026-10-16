# 2.0.26.10.17.1 — Subsale List card and property form (owner, 17 Oct 2026)

Branch `2.0.26.10.17.1`, based on `feature/qa-change-015` (`5a79281`). CI treats branches starting with `2.` as QA
builds: only the isolated QA APK (`com.jslproperties.estateagentbuddy.qa`, "EAB QA") is built, with test-project
secrets only. No production data, Supabase project, migration, schema, secret or deployment was touched.

**Status key.** **IT** = implemented and covered by automated tests (Node unit tests and Chromium at 384 × 824).
**NV** = not verified on a real Android phone.

## A. Subsale List card
| # | Requirement | Status | Code | Tests |
|---|---|---|---|---|
| A2 | Edit button is a pencil, still gold | IT, NV | `icons.tsx` `IconPencil`; `ListingUI.tsx` `SubsaleCard` | U115, D17-3 |
| A3 | Title = Unit/Lot, Street, **Neighbourhood**, Township, City (each once), used everywhere a property is named; neighbourhood also searchable | IT | `model.ts` `title`, `addressLine`, `applyFilters` | D17-1 |
| A4 | Type line (Terrace House  2.5 Storeys  Corner) and Land + Built-Up on one line: wider space, no commas | IT | `change015.ts` `specLines` (`spaced`); `.sc-spec.spaced` | C15-2, U115 |
| A5 | No parking line, no "Available Now" on the card | IT | `SubsaleCard` | D17-3, U115 |
| A6 | Tenure / restriction line between the type line and the bedrooms line | IT | `SubsaleCard` | U115 |
| A7 | Title Case: card wording, counts, "Click to Open"; addresses shown in Title Case including after "/" and "(" (display only; stored values unchanged; capitals typed on purpose such as BBN kept; after a hyphen left as typed) | IT | `addressCase`; `c015Strings.ts` | D17-2, U121 |
| A8 | FOR SALE / FOR RENT at the photo's top left; removed from under the title | IT | `.sc-txs` | U115 |
| A9 | Location button at the right of the counts row, two lines tall (empty line, then the counts), aligned under the pencil. Set: menu with Share Location (buyers / vendors list with search → WhatsApp with the title and the Google Maps link; or a new person from the phone book → send on WhatsApp and Save as New Contact) and Open in Google Maps. Not set: "Location Not Set" bubble for 1.5 s | IT, NV | `listing/LocationMenu.tsx`; `LOCATION_BUBBLE_MS`; `change015.ts` `mapsUrl`, `shareLocationLink` | D17-4, D17-5, U121, U101 |

## B. Property form
| # | Requirement | Status | Code | Tests |
|---|---|---|---|---|
| B1 | No "Fill with Voice" button (Voice Command card and its review flow unchanged) | IT | `ListingForm.tsx` | U2, U61, D17-7 |
| B2 | Asking Price and Monthly Rent have no check status (no picker, not "to check", no mark or * in Buyer PDF / Marketing Studio); old marks stay on records, unshown | IT | `verify.ts` `VERIFIABLE_FIELDS` | D17-6, U63, U64, U74, U85, BP5, MK5 |
| B3 | Add Location: Hybrid only, no Map / Satellite / Hybrid buttons, a search bar (Places suggestions, plain address look-up as fallback; nothing is requested until Search) | IT, NV | `maps/LocationPicker.tsx`; `MapView` `fixedType` | U118, U121, D17-7 |
| B4 | No Google Maps link field on the form (a link saved earlier stays on the record and is still shown on the property page) | IT | `ListingForm.tsx` | U8, D17-7 |

## Decisions taken while building (for the owner to confirm)
- The Add Location popup used for a banner's location gets the same Hybrid-only view and search bar (same component).
- Bedrooms / Bathrooms keep their comma (only the type line and the area line were asked to change).
- Phone-book share: the person is not saved automatically; the agent taps **Save as New Contact** (contact form opens
  pre-filled, role chosen there).
- Sample data: the four price marks were moved off the prices (no check status any more).

## Not verified on a device
Real Google Places search with the QA key, WhatsApp opening from the share links, Google Maps opening, the phone-book
picker, and the card layout on the S23 Ultra. These need the owner's phone check of the QA APK.
