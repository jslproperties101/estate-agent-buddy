# AI Buddy POS — Phase 1

Branch `feature/qa-acc-buddy-ai`, started from `feature/qa-mainforadmin-g` at `422cf4c` (24 Oct 2026).
Scope approved by the owner on 24 Oct 2026: everything in the prototype, data on the phone plus the existing sync,
behind a feature switch.

## What is in this phase

| Area | What it does | Status |
|---|---|---|
| Feature switch | Off by default. On from Settings → "AI Buddy POS (test feature)", or from Admin EAB with the test feature `beta.buddy-pos-ai`. When on, Agent Financial shows "Open AI Buddy POS". No home tile is added or moved. | IMPLEMENTED |
| Ledger | Double-entry chart of accounts for an estate agency (21 accounts). Journal entries: draft → posted (numbered JV-0001…) → reversed by a new posted entry. Debits must equal credits. | IMPLEMENTED |
| Locks | The store itself refuses: editing or deleting a posted journal, rewriting an issued invoice, deleting a POS receipt, changing a submitted e-Invoice's content, changing or deleting a payroll run (`buddy/locks.ts`, `data/store.ts`). | IMPLEMENTED |
| Invoices | Draft, post (receivable, income, 8% service tax), record payment (bank), create e-Invoice. | IMPLEMENTED |
| POS | Service buttons, cart, cash / card / DuitNow QR, posts straight to the ledger. Buyer details asked when the buyer wants an e-Invoice, and required above RM10,000. | IMPLEMENTED |
| Reports | Profit and loss (this month, last month, this year, all), balance sheet with balance check, trial balance. Posted entries only. | IMPLEMENTED |
| e-Invoice | UBL 2.1 JSON in the MyInvois format, checks before sending (TINs, BRN, MSIC, addresses, RM10,000 rule), monthly consolidated POS e-Invoice (due 7 days after month end), 72-hour cancel window, validation link. | IMPLEMENTED |
| MyInvois sandbox | `supabase/functions/myinvois`: token, submit, status, cancel against `preprod-api.myinvois.hasil.gov.my`; only documents with the company's own TIN; credentials as function secrets only. | IMPLEMENTED BUT NOT PROVEN (not deployed, never called LHDN) |
| Document signing (v1.1) | Not built. The function refuses with `signing-not-built` unless `MYINVOIS_ALLOW_UNSIGNED_V10=true` (sandbox testing only). | NOT DONE |
| Customers | Leads pipeline (New → Contacted → Viewing → Offer → Won / Lost), follow-up dates, Won lead → draft invoice, customer totals from posted invoices. | IMPLEMENTED |
| People | Staff list, clock in / clock out per day, monthly payroll preview and posting (salaries, employer contributions, EPF / SOCSO / EIS / PCB payable, net pay from bank). | IMPLEMENTED |
| Payroll rates | Flat-rate ESTIMATES (EPF 11% / 13% or 12% above RM5,000; SOCSO 0.5% / 1.75% and EIS 0.2% / 0.2% up to RM6,000; PCB typed per person). Not the official schedules. | PARTIALLY DONE |
| Insights | Rule-based on the phone: overdue invoices, receivables, follow-ups, e-Invoice items waiting, cash runway, payroll not posted, SST collected. | IMPLEMENTED |
| Sync | Ten new collections (`acctJournals`, `acctInvoices`, `acctSales`, `acctEinvoices`, `acctLeads`, `acctStaff`, `acctAttendance`, `acctPayruns`, `acctProducts`, `acctProfile`) go through the existing `eab_records` sync. No database migration. | IMPLEMENTED BUT NOT PROVEN (no sync against a Supabase project was run) |
| Drive backup | A "AI Buddy POS" folder with CSV files (journal, invoices, receipts, e-Invoices, leads, staff, attendance, payroll). | IMPLEMENTED |
| Example data | "Load example data" fills every tab with marked sample records that never sync; "Remove example data" takes them away. | IMPLEMENTED |
| Languages | English, Bahasa Malaysia and Chinese for every screen text and account name. | IMPLEMENTED |

## Known limits and risks

- Numbers (JV, INV, POS) are one above the highest number this phone knows. Two phones posting while offline can
  produce the same number until they sync; a server-side sequence is needed before more than one phone posts.
- Payroll figures are estimates; do not pay staff from them.
- The myinvois function has never run. Before testing it: register on the MyInvois sandbox, set the secrets listed in
  the function file, deploy it to the TEST Supabase project only.
- Staff salaries sync like other records and are visible to anyone the records are shared with. Buddy records are not
  in the shareable list (Team sharing does not offer them).
- Going live with LHDN production needs the owner's approval and the v1.1 signing.

## How to try it (QA APK)

1. Settings → tick "AI Buddy POS (test feature)".
2. Agent Financial → Open AI Buddy POS → Load example data.
3. POS: tap a service, Charge. Journal: the POS entry is there. Reports: trial balance debits = credits.
4. Journal: New journal entry; it cannot be posted until it balances; Reverse a posted entry.
5. e-Invoice: Submit says the LHDN sandbox is not connected (no function deployed). Nothing turns Valid.
6. Remove example data when done.

## Standalone AI Buddy POS app (QA branches)

A second Android app built from the same code with `EAB_POS=1`: package `com.jslproperties.aibuddypos`, app name "AI Buddy POS",
release tag `pos-<commit>`, file `AIBuddyPOS-<commit>-debug.apk`. It installs beside the real app and the QA app, with its own
storage (its own books; nothing is shared with the QA app on the phone). It opens straight into AI Buddy POS with the switch
always on; Back goes to the normal Estate Agent AI Buddy home underneath. It uses the TEST Supabase project and never checks for
updates (install each new APK by hand).

Not done / not proven: push alerts (the app is not registered in Firebase; the build borrows the QA entry), Google sign-in return
(`com.jslproperties.aibuddypos://auth-callback` is not in the Supabase redirect list), and nothing tested on a phone.

## Batch 7 — go-live basics (9 Nov 2026, branch feature/qa-pos-golive)

Joe's answers: numbering "All" (three ways, chosen per business), payroll "All" (official EPF / SOCSO / EIS tables and the PCB
formula), MyInvois "Login and certificate".

### Document numbers (7a)
- `supabase/proposed/20261109200000_buddy_pos_numbering.sql` (+ rollback; test `supabase/tests/buddy_pos_numbering_test.sql`).
  Applied to EAB-QA-Test on 9 Nov 2026 (18/0 there, rolled back). NOT on production.
- Each business picks one way (Setup → Document numbers; owner or admin only):
  - own series per phone (default): `INV-A-0001` on one phone, `INV-B-0001` on another; works offline after the first time;
  - blocks: one series `INV-0001…`, 50 numbers handed to a phone at a time, topped up below 10;
  - server: one series, each number from the server when posting (needs internet).
- Every hand-out is logged (`eab_acct_blocks`). Numbers count as used only when the entry posts.
- A phone not signed in to a business numbers on its own, as before. A business database without the functions: same.
  A phone in a business that has never reached the server cannot post (it does not know the business's way).
- Switching to one series starts above the highest one-series number in this phone's books (which hold the business's
  synced records).

### Payroll (7b) — `app/src/buddy/payroll.ts`
- EPF Third Schedule (RM20 / RM100 steps, rounded up); 60+ 0% / 4%; foreign workers 2% / 2%.
- PCB by LHDN's computerised formula (categories 1–3, children, OKU, spouse OKU, zakat, TP1 reliefs per month); tested
  against LHDN's worked example (RM110.00). Older staff records keep the hand-entered PCB until a category is chosen.
- SKBBK (Lindung 24 Jam) 0.75% from June 2026 wages, employee only, ceiling RM6,000; opt-out tick; paid with SOCSO (2310).
- Zakat through payroll goes to new account 2340 Zakat payable.
- SOCSO and EIS use a rule worked out from published PERKESO rows (step middle; 2.25% total to 5 sen, ties to even). It
  must be checked against the official PERKESO table before real pay; wages of RM1,000 and below are marked.
- Not covered: bonus / additional pay, pay from an earlier employer this year, BIK / VOLA. A business that starts payroll
  here after January has no earlier months in the books, so PCB for that year is lower than it should be.

### MyInvois v1.1 signing (7c)
- `supabase/functions/_shared/myinvois_sign.ts` signs as LHDN's SDK "Signature" page describes; `myinvois/handler.ts` uses it.
- Deployed to EAB-QA-Test (function `myinvois`). It answers "not connected" until these secrets are set there (Supabase
  dashboard → Edge Functions → Secrets; never in chat or git): `MYINVOIS_ENV=preprod`, `MYINVOIS_CLIENT_ID`,
  `MYINVOIS_CLIENT_SECRET`, `MYINVOIS_SUPPLIER_TIN`, `MYINVOIS_ALLOWED_USERS` (your Supabase user id), and the certificate as
  `MYINVOIS_P12_BASE64` + `MYINVOIS_P12_PASSWORD` (or `MYINVOIS_CERT_PEM` + `MYINVOIS_KEY_PEM`).
- The certificate's subject must hold the company TIN (organizationIdentifier) and BRN (serialNumber); the function checks
  this before sending anything.
- Tested with a self-made certificate and a stand-in LHDN only. Whether LHDN's sandbox accepts the signature is not known
  until the first real sandbox submission.

### Sync proof (7d)
- `supabase/tests/buddy_pos_sync_test.sql`: all 10 accounting collections pushed by an agent through `eab_push_records`,
  retried without duplicates, edited, refused on a stale edit, pulled by the owner, deleted, and invisible to an outsider.
  12/0 on EAB-QA-Test (rolled back). Not tested between two real phones.
