# Monetisation: plans, payments and the revenue-model comparison

Branch `v3-updates-v42.26.10281931abGh68fltB4j9dCsaXFh`, started from `feature/qa-acc-buddy-ai` at `eaa4ad1` (28 Oct 2026).
Scope given by the owner on 28 Oct 2026: start monetising; the payment gateway integration starts now, for **all three**
providers (FPX, Stripe, Google Play); compare the revenue models. **Test mode only.** The earlier decision stands that nothing
live is switched on: no real money, no production migration, no merge to `main` without the owner's approval.

## What is in this phase

| Area | What it does | Status |
|---|---|---|
| Feature switch | Off by default. On from Settings → "Plans and payments (test feature)", or from Admin EAB with the test feature `beta.billing`. With it off the app behaves exactly as before and the database is never asked for plans. | IMPLEMENTED |
| Plans | Pro (monthly RM49, yearly RM490) and the AI Buddy POS add-on (monthly RM39), in MYR. **The prices are my proposals, not decisions.** The server holds the only price list it trusts (`supabase/functions/_shared/billing.ts`); the phone never sends an amount, and a test keeps the phone's copy equal to the server's. | IMPLEMENTED (prices PROPOSED) |
| Access rules | Trial, active, cancelled-until-period-end, late with 7 days' grace, expired; a row that cannot be trusted gives no access; sandbox (test) purchases stop counting when `BILLING_LIVE` is set true. | IMPLEMENTED |
| Gating | **Nothing is gated.** The list of "feature → product" is empty on purpose (`FEATURE_PRODUCT`), so every feature works for everybody until you decide what needs Pro (see the proposal below). | NOT DONE (waiting for your decision) |
| Free trial | 14 days, one per person per product, ever, started by the server (the phone cannot start or extend one). | IMPLEMENTED |
| Database | `eab_billing_entitlements` and `eab_billing_events`, three functions, no direct table access for the phone, one change per provider event id, an older event never overwrites a newer one, one-time payments stack. File: `supabase/proposed/20261028000000_billing_sandbox.sql` (+ rollback + SQL test). | IMPLEMENTED, run on a local PostgreSQL 16 only (see tests). Not applied to any Supabase project. |
| FPX (Billplz sandbox) | `billing` function makes a bill for the server's price, naming the agent and plan. `billing-webhook` checks the X Signature, then **reads the bill back from Billplz** and grants only if it is paid, in our collection, for exactly the plan's price. A one-time payment for one period (30 or 365 days); it does not renew by itself. | IMPLEMENTED BUT NOT PROVEN (never called Billplz; the X Signature rule is written from Billplz's description and not checked against their sandbox) |
| Card (Stripe, test mode) | Checkout Session in subscription mode with the agent's id in the metadata; the webhook checks the Stripe signature (5-minute replay window) and applies subscription created / updated / deleted. | IMPLEMENTED BUT NOT PROVEN (never called Stripe) |
| Google Play | Server side: checks a purchase with Google (service account), requires that it was made for this agent (a hash of the agent's id is put on the purchase), applies it once, acknowledges it. Phone side: the interface to a native `PlayBilling` plugin. | **Server side IMPLEMENTED BUT NOT PROVEN. The Android plugin is NOT DONE**: no Android code was added, so the Google Play button says "this APK does not include Google Play Billing yet". |
| Safety rails | A live Stripe key or the live Billplz address is refused by both functions unless `BILLING_ALLOW_LIVE=true` is set on purpose; the Billplz callback without its X Signature key is refused in live mode; return addresses must be https or the app's own scheme; no secrets in the phone's code (a test checks it); no logging of tokens. | IMPLEMENTED |
| Screens | A "Plans (test mode)" card in Settings: test-mode banner, state per product, trial button, provider choice, plans with prices, Pay (test), Refresh. English, Malay, Chinese. | IMPLEMENTED |
| One Harta API | You answered "One harta api" to the first question and did not say what it is; I could not find it online. **Nothing was built for it.** | NOT DONE (needs your explanation) |

## Which features to charge for: a proposal, nothing is gated yet

The app has no limits today, so a paywall would take something away from people who have it free. Two ways, both need your decision:

1. **Charge for what is new, not for what exists.** Keep every current feature free. Pro = new features built from now on (for example the Admin/Owner reports, sharper market tools); the **AI Buddy POS add-on** = the accounting suite you are building (it is already behind its own switch and has the most obvious value to an agency).
2. **Free with limits.** Free = a cap on something countable (for example properties or contacts); Pro = no cap. Needs a decision on the cap and a plan for people who are already over it.

My leaning: option 1, with the POS add-on as the first thing to charge for. To gate a feature, add one line to `FEATURE_PRODUCT` in `app/src/billing/plans.ts` and call `featureAllowed(store, '<feature>')` where it opens.

## Revenue models compared (Malaysian property agents)

| | Per-agent subscription (Pro) | Free core + paid AI Buddy POS add-on | Per-agency / team licence |
|---|---|---|---|
| Who pays | each agent | the agent or the agency, only if they want accounting | the owner / principal, for the team |
| Fit | agents are mostly independent contractors (commission-only): they pay for tools that clearly earn or save money | the accounting suite is the part with a clear business value and competitors (Bukku and others) to price against | agencies already pay for portals and tools centrally; one decision-maker |
| Strength | simple to explain; recurring | no paywall on what people already use; easy to start; the add-on can be sold to non-agents too | larger tickets; fewer, longer relationships; matches your Owner/User roles and workspaces |
| Weakness | hardest to justify for an app that is free today; churn among individual agents | smaller revenue per user until the suite is proven | slow sales; needs seat management and invoicing, which the app does not have yet |
| Needs from the app | what is in this phase | what is in this phase | seats, invoices for the agency, a billing contact: **not built** |
| First step | | **start here** (my leaning) | add after 10 to 20 paying agents |

Suggested order: free core + paid POS add-on first, Pro for new premium features second, agency licences when agencies ask for them.
Annual billing (two months free) is in the plan list for Pro; it lowers churn and payment fees.

## The three gateways compared

Fees change; check each provider's current price list before deciding. Not stated here on purpose.

| | FPX via Billplz | Stripe (cards) | Google Play Billing |
|---|---|---|---|
| Best for | Malaysian bank-transfer customers (most agents have an online banking account) | recurring card subscriptions, strongest tooling | in-app subscriptions on Android |
| Recurring | no: one payment per period, the agent pays again | yes | yes |
| Account needed | a Billplz account and a collection (sandbox is separate) | a Stripe account with Malaysia support, products and prices in MYR | a Play developer account and the app published on Play (at least a test track) |
| Rule to check first | Billplz's own terms for subscriptions-like use | Stripe Malaysia availability | Google's payments policy generally requires Play Billing for digital subscriptions sold inside an app distributed on Play; check the current policy for your region before using FPX or Stripe inside a Play-distributed app. A hand-installed QA APK is not affected. |

## How to try it on the TEST Supabase project (not done yet; needs your accounts)

1. Apply `supabase/proposed/20261028000000_billing_sandbox.sql` on the TEST project; run `supabase/tests/billing_sandbox_test.sql` there (needs two users).
2. Set the secrets listed in `supabase/functions/billing/index.ts` (Stripe **test** key and price ids, Billplz **sandbox** key, collection id and X Signature key, return address; Play service account only if you try Google Play).
3. Deploy `billing`, and `billing-webhook` with `--no-verify-jwt`. In Stripe add the webhook endpoint `…/functions/v1/billing-webhook?p=stripe` for subscription created / updated / deleted.
4. In the QA app: Settings → tick "Plans and payments (test feature)" → pay with a Stripe test card or a Billplz sandbox bank → tap Refresh.

## Known limits and risks

- Nothing has been called against Stripe, Billplz, Google Play or a Supabase project. Every provider answer in the tests is a stand-in written from the providers' documentation.
- The Billplz X Signature rule is from my reading of Billplz's description; the full signature section could not be read. A wrong rule would reject real callbacks (it fails closed), not grant access.
- One active provider per product: someone who pays by FPX while a Stripe subscription runs is blocked in the app; the database does not enforce it.
- A one-time FPX payment has no reminder before it ends; add a reminder before going live.
- Payments, tax and receipts for **your own** sales (service tax, e-Invoice for business customers, refunds, terms and privacy text) need an accountant's check before going live.
- Going live needs: your approval, the prices, `BILLING_ALLOW_LIVE=true`, live keys, `BILLING_LIVE = true` in `app/src/billing/plans.ts`, the Play Billing plugin if Android in-app is wanted, and a test of every path on a real phone.

## Tests run on 28 Oct 2026

| What | Result |
|---|---|
| `npm test` (typecheck, lint, all unit tests, build, all browser tests) | passed: typecheck clean, lint 359 files, unit 662 / 662, browser 209 / 209 |
| New unit tests `tests/billing.test.ts` (access rules, switch, phone calls, signatures, provider-answer mapping, both server functions against stand-in providers) | 35 / 35. Four deliberate breakages of the code were tried; the tests caught three, and the fourth line is redundant (the next check also fails closed). |
| New browser tests `tests/ui-billing.test.mjs` (Chromium at phone width, stand-in server) | 10 / 10 |
| SQL test `supabase/tests/billing_sandbox_test.sql` and the migration run twice, rollback run twice | 20 / 20 on a local PostgreSQL 16 with stand-ins for Supabase's roles and `auth.users`. **Not run on Supabase.** |
| Real Stripe, Billplz, Google Play, Supabase project, Android phone | **not tested** |

The run used the project's pinned esbuild, TypeScript and React, but Playwright 1.63 instead of the pinned 1.56 (the package registry was not reachable from the test machine).
