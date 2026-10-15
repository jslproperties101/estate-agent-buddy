# Changes 001–009: requirement → code → test

Branch `feature/qa-changes-001-009`, based on `feature/qa-settings-recovery` (feb769a; itself `feature/v2-complete-and-qa` af30adb + the QA sign-in recovery fix). Checkpoint before the work: `checkpoint/pre-changes-001-009`.

Status words: DONE (built and covered by automated tests) · BLOCKED · DESIGN ONLY. "Tested" below means browser tests (Chromium, phone-sized), not a real phone.

| Change | Status | Where in the code | Automated tests |
|---|---|---|---|
| 001 First-start sample-data popup higher | DONE (placement only; timing and actions unchanged) | `src/styles.css` `.start-scrim` | U98 (384×824 and 320×568) |
| 002 / 002a Replace the red-bordered logo | DONE with the artwork the owner supplied on 15 Oct (`assets/brand/logo-002a-source.jpg`): header, sign-in and first-start logo. Launcher icon and splash unchanged | `src/brand/logo-256.webp`, `logo-512.webp`, `assets/brand/logo.png`, `src/icons.tsx` | BR5 (byte check that launcher/splash files are unchanged), U1, U28, U98 |
| 003 Remove the top-middle "Soon" item | DONE | `src/App.tsx` header (Co-broke button removed) | U1, U25 |
| 004 Remove the main-screen To-Do popup | DONE; due reminders are now listed in Notifications ("Due in the last 24 hours"), the bell still counts them, phone notifications unchanged | `src/App.tsx` Shell + Notifications | U9 (reminder test), U89 |
| 005 Old preview popup | SUPERSEDED by 008/009 — not built | — | U65 asserts it is absent |
| 006 Four-layer backup | **DESIGN ONLY** here — implemented later on `feature/v2.0.10-integrated`: see `docs/CHANGE_006.md` and `docs/INTEGRATED_2.0.010.md` | — | — |
| 007 Remove the orange QA banner | DONE; About still says QA; save/sync line kept; no gap | `src/App.tsx`, `src/styles.css`, `docs/QA.md` | U99 (builds a real QA bundle) |
| 008 Single tap; no long press / preview eye | DONE (the only long-press and preview code was the Property List) | `src/listing/ListingUI.tsx` | U65 |
| 009 Property List cards | DONE (grid cards kept short, owner 15 Oct) | `src/listing/ListingUI.tsx`, `src/styles.css` | U65, U104 |
| 009 Form fields, dropdowns, Title Case | DONE (see notes) | `src/listing/model.ts`, `strings.ts`, `ListingForm.tsx`, `src/ui/OptionSelect.tsx`, `src/lib/titleCase.ts`, `src/domain/places.ts` | C9-1, C9-8, C9-9, U7, U101, U103 |
| 009 Photos | DONE | `ListingForm.tsx` (`addPhotos`, `reorder`, `dragProps`), `model.ts` (`orderedPhotos`, `movePhoto`) | C9-5, U102 |
| 009 Location / Google Maps link | DONE | `ListingForm.tsx`, `src/maps/LocationPicker.tsx` (`pointOnly`), `model.ts` (`parseMapsLink`) | C9-6, U8, U29 |
| 009 Price, Tenure and Title Info; commission | DONE | `ListingForm.tsx`, `model.ts` (`rentCommissionRm`), `src/finance/FinanceUI.tsx` (`dealStart`), `src/calculator/*` | C9-4, U100 |
| 009 Details order, Extra Comments | DONE | `ListingForm.tsx`, `ListingUI.tsx` | U100, U65 |
| 009 Tenant / owner / phone book / WhatsApp | DONE in the browser; native picker not tried on a phone | `src/ui/ContactBox.tsx`, `ListingForm.tsx` | C9-11, U66, U104 |
| 009 Banner location | DONE | `ListingForm.tsx` (save → `buildBanner`) | U104 |
| 009 Verification colours | DONE | `src/listing/verify.ts` (`shownState`), `ListingUI.tsx` (`VVal`), `buyerPdf.ts` | C9-7, U63, U104 |

## Data compatibility (no destructive migration)
Nothing is rewritten in bulk. Older records are mapped when shown, and when the agent next saves them:
- `lotNo` → shown together with `unitNo` (`unitLot`); the form edits one field and saves it there.
- `restriction: "No restriction"` → shown and edited as "NON Bumiputera".
- `mainPhotoId` that is not the first photo → that photo is shown first and becomes first on save.
- No verification mark → shown as Need to Check (never as Confirmed); the stored marks are unchanged.
- New optional fields: `mapsLink`, `extraComments`, `rentCommissionMonths`, `ownerWhatsapp`, `tenancy.tenantPhone`, `tenancy.tenantWhatsapp`. No Supabase migration is needed: records are stored as JSON.

## Decisions to confirm with the owner
1. **002 logo**: done with the supplied artwork. It replaces the in-app logo that had the red border (header, sign-in, first-start choice). The phone's launcher icon (home-screen icon) was left as it is: say if that should change too (it needs a new APK).
2. **003**: removing the top-bar item removes the only entry to the Co-broke Opportunities list screen (the GPS "Co-broke Opportunity Map" Coming Soon card is unchanged). Keep it unreachable, or add an entry elsewhere?
3. **Rental commission**: fixed choices 1, 1.5 and 2 months. A custom value was not added.
4. **Grid cards** also show tenure/restriction, storeys/lot type and the full Extra Comments, so the 3-column grid cards can be tall.
5. **Places list**: main towns for every state were added as a useful starting list, not an official register; townships are still a short list (typed ones are remembered).
6. **Title Case** was applied to the Property List, property form and detail labels (English and Malay). Other modules keep their current labels; extending it app-wide is a separate pass. There are no Tamil strings in the app.
7. **Calculator**: for a rent-only property, the commission tab starts with rent × months at 100%.

## Not changed
Change 006 (backup architecture), Supabase settings, migrations, Google Drive, production data, main, deployment.

## Owner answers, 15 Oct 2026 (applied)
1. Logo: in the app only; the phone's home-screen icon stays as it is.
2. Co-broke Opportunities opens from the Opportunities card (`App.tsx`; U25).
3. Commission: sale = Percentage (%) or Flat Fee (RM); rent = Months of Rent (1, 1.5, 2 or Custom…) or Flat Fee (RM). Only the chosen kind is kept on save; Agent Financial and the calculator never read months or a flat fee as a percentage (`model.ts` `commissionRm`/`rentCommissionRm`, `FinanceUI.tsx` `dealStart`, `calculator/saved.ts`; C9-12, U100).
4. Grid (small) cards show only photo, price, address, type and status; Large cards keep tenure, restriction, storeys, lot type and Extra Comments.
5. Town list kept as the best-effort starting list.
6. Title Case across the whole app (English and Malay): every string table passes through `titled3` (`src/lib/titleCase.ts`). A text is treated as a label when it starts with a capital, has at most 6 words and does not end like a sentence; sentences, help text, fragments ("beds", "/ month"), codes, links, word lists and counted messages are unchanged. Chinese is unchanged (C9-13).
