# JoyChange010-Main — running list of Joe's new changes (started 21 Oct 2026)

Numbers are 010-01, 010-02, ... Dropbox record: `/Estate Agent AI Buddy/JoyChange010-Main.txt` (NOT created yet; Joe says when).
Status words: Planned / In progress / Implemented / Automated tests passed / CI verified / Device verified / Released.

| No. | Change | Status |
|---|---|---|
| 010-01 | First-login screen: the Country box (saved country or Malaysia chosen; tap opens the searchable list) is shown whenever the Terms/consent screen appears, even if the account already has a country. Joe's answer: "Always show it when this consent screen appears". Reported from the phone test of build 6f4bd59 (screenshot: heading "Where Do You Work?" with only the two tick boxes). | Automated tests passed (179 screen tests, 21 Oct); not on a phone |

## 010-01 detail
- File: `app/src/App.tsx` (screen shown when `country.ask || terms.ask`; the country box now follows `country.ask || terms.ask`; the country is saved only if it changed or was being asked).
- Test: `ui-mainforadmin-b.test.mjs` MB3 now expects the country box (Malaysia chosen) on the Terms screen.
- Not changed: properties already saved keep their address; the choice only sets the Country of NEW properties.
