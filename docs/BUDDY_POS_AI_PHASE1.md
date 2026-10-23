# Buddy POS AI — Phase 1

Branch `feature/qa-acc-buddy-ai`, started from `feature/qa-mainforadmin-g` at `422cf4c` (24 Oct 2026).
Scope approved by the owner on 24 Oct 2026: everything in the prototype, data on the phone plus the existing sync,
behind a feature switch.

## What is in this phase

| Area | What it does | Status |
|---|---|---|
| Feature switch | Off by default. On from Settings → "Buddy POS AI (test feature)", or from Admin EAB with the test feature `beta.buddy-pos-ai`. When on, Agent Financial shows "Open Buddy POS AI". No home tile is added or moved. | IMPLEMENTED |
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
| Drive backup | A "Buddy POS AI" folder with CSV files (journal, invoices, receipts, e-Invoices, leads, staff, attendance, payroll). | IMPLEMENTED |
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

1. Settings → tick "Buddy POS AI (test feature)".
2. Agent Financial → Open Buddy POS AI → Load example data.
3. POS: tap a service, Charge. Journal: the POS entry is there. Reports: trial balance debits = credits.
4. Journal: New journal entry; it cannot be posted until it balances; Reverse a posted entry.
5. e-Invoice: Submit says the LHDN sandbox is not connected (no function deployed). Nothing turns Valid.
6. Remove example data when done.
