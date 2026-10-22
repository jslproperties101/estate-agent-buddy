# MainForAdmin-F — the agent's own Contact number goes to the company (for Admin EAB WhatsApp broadcasts)

Written 23 Oct 2026. Branch `feature/qa-mainforadmin-f` (from `feature/qa-mainforadmin-e` @ 4ada52f). Pushing it builds
the isolated QA APK (`qa-<commit>`). Needs the AdminBatch008 database file
(`20261025000000_admin_batch_008_comms.sql`, branch `feature/admin-batch-008-db`), which adds `eab_set_my_phone`.

## Joe's decision (22 Oct 2026)
- Yes, send the agent's own phone number to the company database. Only Owner / Admin / Compliance see it (in Admin EAB
  broadcast lists); nobody else in the company.

## What the phone does (`src/security/account.ts`)
- With the account check (app opening and after every sync), the Contact number from Agent Profile is cleaned the same
  way the database cleans it (spaces, dashes, brackets, dots removed; 8–15 digits, optional +) and sent with
  `eab_set_my_phone` — only when it changed for that account (`meta.phoneSent` = account|number).
- Number removed from the profile → the company copy is cleared (sent as empty). An empty profile never sends.
- Something that is not a phone number (e.g. "ask office") → nothing is sent.
- Offline → tried again next time. Older database without the function, or a number it refuses → not asked again until
  the number changes. The app keeps working in every case.
- Agent Profile → Edit shows one line under the phone box while signed in: the number is also sent to the company so it
  can send WhatsApp messages; only Owner, Admin and Compliance staff can see it (English, BM, Chinese).

## Not done / still needed
- Privacy Notice / Terms line about this (needs Joe's lawyer). The note under the phone box is not a legal text.
- Not tested against the real test database from a phone (the cloud test box cannot reach Supabase from the app).

## Tests
- `tests/mainforadmin-f.test.ts` (F-1 … F-5): cleaning; sent once / not again / again on change / cleared; empty and
  non-numbers not sent; another account on the same phone; offline retry; older database and refused number asked once.
