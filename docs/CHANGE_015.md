# Change 015 — Subsale List cards, archive Delete, location, Add Location popup, photo menu, counts, fixed advert layout

Branch `feature/qa-change-015`, based on `feature/qa-changes-011-014` (`6b1b400`). The branch name contains `qa`, so CI
builds only the isolated QA APK (`com.jslproperties.estateagentbuddy.qa`, "EAB QA"). No production data, Supabase
project, migration, secret, signing key, store listing or deployment was touched.

**Status key.** **IT** = implemented and covered by automated tests (Node unit tests and Chromium at 384 × 824).
**NV** = built and automatically tested, but *not verified* on a real Android phone. **OD** = owner decision noted.

## B1. Subsale List cards (Grid and Large)
| Requirement | Status | Code | Tests |
|---|---|---|---|
| Small square gold gear at the far right of the title row; stays on line 1 when the title wraps; title not shortened; label "Edit property: …" | IT, NV | `listing/ListingUI.tsx` `SubsaleCard`; `styles.css` `.sc-side` (float) / `.sc-gear` (44 × 44 touch area) | U115 |
| Gear opens that property's form with its values; never also opens the card | IT | `editIt` (permission-checked, Change 010), `stopPropagation` | U115 |
| FOR SALE / FOR RENT right-aligned under the gear from the real purpose; both = two labels, FOR SALE above | IT | `listing/change015.ts` `transactionLabels` | C15-1, U115 |
| No purpose badge on the photo; status (green AVAILABLE) at the photo's top right | IT | `.sc-status` | U115 |
| Spec order: type, storeys, lot (e.g. Terrace House, 2.5 storeys, Corner); bedrooms + bathrooms; land; built-up; only real values | IT | `specLines` | C15-2, C15-3, U115, U65 |
| No card Delete / Open buttons; card body opens; "Click to open" plain text, bottom centre | IT | `.sc-card onClick`; `.sc-open` (keyboard / screen reader); `.sc-hint` | U115, U65, U69 |
| Price, photo, tenure, restriction, comments, owner, creator tag, in-feed ads, search / filters kept | IT | same component | U3, U63, U101, U68 |

Buyer Matching still uses its own `GridCardButton` (unchanged).

## B2. Delete → recoverable archive
Delete on the property page was already the Change 010 archive (`archived` mark, `can()` checks, Restore). Change 015
only removed the card path; no second archive implementation. | IT | `ListingDetails` (unchanged) | U116, U101, C5, C6 |

## B3. Location labels and order
| Requirement | Status | Code | Tests |
|---|---|---|---|
| Country → State → City → Township → Neighborhood → Street → Unit/Lot on the form and the property page | IT | `ListingForm.tsx` section 3; `ListingUI.tsx` location view; `LOCATION_ORDER` | C15-8, U117, U7 |
| City / Town → City; Jalan / Street (…) → Street; Neighborhood label; EN / BM / ZH | IT | `listing/strings.ts`, `maps/strings.ts` | C15-8 |
| Stored values, IDs, geocoding untouched; Unit/Lot unchanged | IT | — | U117, U101 (older records) |

**OD:** the app had one field (`township`, BM label "Taman / kawasan"); the prompt lists Township *and* Neighborhood.
Added an optional `neighborhood` text field (JSON record field; no schema change, no migration) and renamed BM Township
to "Kawasan" (Neighborhood is "Kejiranan / Taman"; ZH 区 / 社区 / 花园). Existing township values stay where they are.

## B4. Location buttons
"Use my current location" removed from the form **and** from the Add Location popup (same label there). Remove
Position kept, unchanged. The map's own ◎ recentre control is kept. | IT | C15-9, U117 |

## B5. Add Location popup
| Requirement | Status | Code | Tests |
|---|---|---|---|
| Larger, not full screen, near the top, ends above the fixed advert (which now stays visible; supersedes Change 011's hide) | IT, NV | `maps/LocationPicker.tsx`, `.lp-scrim` / `.lp-sheet`, `usePopupMapHeight` | U118 |
| Title + X close; no search field / button; no `searchPlaces` path from this popup | IT | search UI and effect removed (library function `maps/google.ts` untouched) | C15-9, U118 |
| Much larger map; smaller Map / Satellite / Hybrid buttons (32 px) | IT | `MapView compactTypes` | U118 |
| Opening asks for nothing: no geocoding (point-only mode), GPS only if already allowed (existing hook) | IT | `position.ts` unchanged | U118 |
| Cancel / X keep the saved position | IT | `onCancel` | U118 |

## B6. Photo editor
Per-photo ⋮ menu with exactly **Make as Main Photo** and **Remove**; arrows and the Remove button gone; drag handle kept.
Main photo → position 1 (`makeMainPhoto`); Remove follows the existing rule (file removed on save; first remaining
photo becomes main; none left = empty section with Add photos). | IT | C15-6, C15-7, U119, U89 |

## B7. Counts
Card: "* N to check" and "* N not filled", no field names, hidden at zero. Details: one row per field in each list.
An empty field counts once, as *not filled* (Change 015 "no double counting"); Change 009 states unchanged.
| IT | `checkAndMissing`, `cardCounts` | C15-4, C15-5, U115, U63 |

## B8. Fixed advert and Android navigation area
| Requirement | Status | Code | Tests |
|---|---|---|---|
| One scrolling region; advert is the last row (not over content); no page scroll; no extra 120 px gap (kept only on pages with the floating Save) | IT | `styles.css` `.shell` / `.content` / `.ad-bar`; `App.tsx` `scrollTop` | U120, U101 |
| Black system navigation area; content (web page + AdMob banner) above the system bars on edge-to-edge Android | NV | `scripts/android-setup.mjs` step 5 (theme `navigationBarColor`, `MainActivity` insets padding) | C15-10 |
| PDF preview still hides the advert and restores it | IT | `ui/PdfPreview.tsx` (unchanged) | U120, U101 |

**Not verified on a device:** the black navigation area, the banner position relative to the gesture bar, and the
popup on the S23 Ultra. These need the owner's phone check of the QA APK.
