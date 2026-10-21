# JoyChange010-Main — running list of Joe's new changes (started 21 Oct 2026)

Numbers are 010-01, 010-02, ... Dropbox record: `/Estate Agent AI Buddy/JoyChange010-Main.txt` (NOT created yet; Joe says when).
Status words: Planned / In progress / Implemented / Automated tests passed / CI verified / Device verified / Released.

| No. | Change | Status |
|---|---|---|
| 010-01 | First-login screen: the Country box (saved country or Malaysia chosen; tap opens the searchable list) is shown whenever the Terms/consent screen appears, even if the account already has a country. Joe's answer: "Always show it when this consent screen appears". Reported from the phone test of build 6f4bd59 (screenshot: heading "Where Do You Work?" with only the two tick boxes). | Automated tests passed (179 screen tests, 21 Oct); not on a phone |
| 010-02 | Track My Sales: "Rented - Pending TA Signing" now appears as its own stage (just before Rented), but earns no commission in the totals and shows no deadlines until the Tenancy Agreement is signed and the property becomes plain Rented. Joe's answer: "Show it, but not in totals". Settles the open question in HANDOVER_JOYCHANGE006.md. | Automated tests passed (593 unit, 7 Track-My-Sales screen tests, 21 Oct); not on a phone |
| 010-03 | Push alerts for Admin EAB posts (Market News, Projects, announcements) with sent / delivered / opened counts per post. Joe chose this batch on 21 Oct. Detail: `docs/JOYCHANGE010_03_PUSH.md`. | Automated tests passed (database 33/33 on a local copy, sender 13/13 with fakes, 596 unit; 21 Oct). Not on EAB-QA-Test, not deployed, not on a phone |
| 010-04 | Share to the app: when a document or photo is shared from WhatsApp (or any app), Estate Agent AI Buddy appears in the phone's share list as a document upload. Shared files land in a new "Shared Documents" folder in the app; from there the agent moves each file to the right property (picked from a list) and into that property's folder (Title, Floor plans, Brochures, Owner correspondence, Rental or sales documents, Other). In a property's Documents section files can also be moved easily between folders (e.g. Floor plans to Title to Others). Requested 21 Oct 2026 with a screenshot of the Android share sheet (a land title image). Joe confirmed 21 Oct: NOT Dropbox — everything happens inside the app: the app appears in the phone's share list so a file goes straight into the app, and files can be moved between the app's own document folders. | Planned (not started) |

## 010-01 detail
- File: `app/src/App.tsx` (screen shown when `country.ask || terms.ask`; the country box now follows `country.ask || terms.ask`; the country is saved only if it changed or was being asked).
- Test: `ui-mainforadmin-b.test.mjs` MB3 now expects the country box (Malaysia chosen) on the Terms screen.
- Not changed: properties already saved keep their address; the choice only sets the Country of NEW properties.

## 010-02 detail
- Files: `app/src/deals/model.ts` (new stage `rentpending`; `stageOf`, `commissionOf`, `upcoming`), `app/src/deals/DealUI.tsx` (tapping it opens the Rental details; the property shows the Rental link), `app/src/ui/cc001Strings.ts` (EN / BM / 中文 stage name).
- Test: `app/tests/joychange010.test.ts` (4 unit).
- Not changed: the status itself, filters and dashboards counting; Admin EAB counts by the stored status code `rented_pending_ta`.
