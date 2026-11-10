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
| Gating | Only **Market News and Intelligence** is gated (Batch A, your request of 30 Oct 2026: `FEATURE_PRODUCT.marketNews = 'news'`), and only while the billing switch is on. Everything else works for everybody until you decide what needs Pro (see the proposal below). | IMPLEMENTED for Market News only |
| Free trial | 14 days, one per person per product, ever, started by the server (the phone cannot start or extend one). | IMPLEMENTED |
| Database | `eab_billing_entitlements` and `eab_billing_events`, three functions, no direct table access for the phone, one change per provider event id, an older event never overwrites a newer one, one-time payments stack. File: `supabase/proposed/20261028000000_billing_sandbox.sql` (+ rollback + SQL test). | IMPLEMENTED, run on a local PostgreSQL 16 only (see tests). Not applied to any Supabase project. |
| FPX (Billplz sandbox) | `billing` function makes a bill for the server's price, naming the agent and plan. `billing-webhook` checks the X Signature, then **reads the bill back from Billplz** and grants only if it is paid, in our collection, for exactly the plan's price. A one-time payment for one period (30 or 365 days); it does not renew by itself. | IMPLEMENTED BUT NOT PROVEN (never called Billplz; the X Signature rule is written from Billplz's description and not checked against their sandbox) |
| Card (Stripe, test mode) | Checkout Session in subscription mode with the agent's id in the metadata; the webhook checks the Stripe signature (5-minute replay window) and applies subscription created / updated / deleted. | IMPLEMENTED BUT NOT PROVEN (never called Stripe) |
| Google Play | Server side: checks a purchase with Google (service account), requires that it was made for this agent (a hash of the agent's id is put on the purchase), applies it once, acknowledges it. Phone side: the interface to a native `PlayBilling` plugin. | **Server side IMPLEMENTED BUT NOT PROVEN. The Android plugin is NOT DONE**: no Android code was added, so the Google Play button says "this APK does not include Google Play Billing yet". |
| Safety rails | A live Stripe key or the live Billplz address is refused by both functions unless `BILLING_ALLOW_LIVE=true` is set on purpose; the Billplz callback without its X Signature key is refused in live mode; return addresses must be https or the app's own scheme; no secrets in the phone's code (a test checks it); no logging of tokens. | IMPLEMENTED |
| Screens | A "Plans (test mode)" card in Settings: test-mode banner, state per product, trial button, provider choice, plans with prices, Pay (test), Refresh. English, Malay, Chinese. | IMPLEMENTED |
| One Harta API | Explained by the owner on 30 Oct 2026 (oneharta.com API). **Batch C (10 Nov 2026)**: land tax, company, sale / rental and InfoSearch lookups, paid with Ai Buddy Tokens at 3 tokens per Oneharta credit (section below). Owner confirmed with Oneharta that lookups may be resold to the app's agents through the API. | BUILT (test mode; not deployed) |

## Batch A (30 Oct 2026): Market News and Intelligence "access" plans

| | |
|---|---|
| Plans | `news_monthly` USD 1.00 / 30 days, `news_yearly` USD 9.00 / 365 days (the yearly note "saves about 25%" is computed from the two prices). Same list on the phone and the server; a test keeps them equal. Existing MYR plans unchanged. |
| How to pay | **Google Play only** (no card, no FPX, no free trial). The phone buys the plan id through the app's own `PlayBilling` plugin; the server (`play_verify`) checks it with Google, writes the entitlement and acknowledges it. |
| Play Console ids | The subscription product ids **must be exactly** `news_monthly` and `news_yearly`. |
| Screen | Billing switch on and no active news plan: a subscription box replaces the news list (no titles, bodies or unread number; the Home badge is hidden). Switch off: exactly as before. |
| Native plugin | Written into `scripts/android-setup.mjs`, built only with `EAB_PLAY_BILLING=1` (set for the QA APK only). **Never compiled with the real Billing Library here and never run on a phone.** |
| Not done | Server-side hiding of paid posts (the feed and the push alert text still reach every agent the post is for: see "Known limits"); Google's real-time notifications for renewals and cancellations (the plan is read again only when the agent buys or taps Restore / Refresh). |

## Batch B (3 Nov 2026): Ai Buddy Tokens

| | |
|---|---|
| Price | 1 token = **USD 0.25** (owner's price). Packs: `tokens_20` USD 5, `tokens_100` USD 25, `tokens_400` USD 100, `tokens_1000` USD 250. The same list is held on the phone (`app/src/billing/plans.ts`), the server (`_shared/billing.ts`) and in the database function `eab_tokens_credit`; a test keeps the three equal. |
| How to pay | **Google Play only**, as one-time (consumable, "in-app") products. The phone buys the pack through the `PlayBilling` plugin (`type: 'inapp'`); the server (`billing` function, action `tokens_verify`) checks the purchase with Google, requires that it was made for this agent, credits the pack's tokens once through `eab_tokens_credit`, then **consumes** the purchase (which also acknowledges it and lets the agent buy the same pack again). The phone never sends a token count or an amount. |
| Play Console ids | The in-app product ids **must be exactly** `tokens_20`, `tokens_100`, `tokens_400`, `tokens_1000`. |
| Database | `supabase/proposed/20261103000000_tokens_sandbox.sql` (+ rollback + `supabase/tests/tokens_sandbox_test.sql`): `eab_token_ledger` (every change; one credit per purchase), `eab_token_balances` (per agent **and per environment**, never below zero), `eab_my_tokens()` for the phone, `eab_tokens_credit()` for the server only. Test-mode tokens never become real tokens. Not applied to any Supabase project. |
| Screen | Settings, below the Plans card, only while the billing switch is on: balance, the four packs with USD prices, Buy, **Restore purchases** (sends any paid purchase Google Play still holds to the server, e.g. after a lost connection; never credits twice), Refresh balance, last changes. English, Malay and Chinese (Malay and Chinese are drafts). |
| Not done | **Spending tokens** (Batch C: Oneharta lookups, each charged in tokens on the server). Google's real-time notifications for refunds (a refunded pack is not taken back from the balance yet). A bonus on larger packs (owner to decide). |

## Batch C (10 Nov 2026): Oneharta property lookups, paid with Ai Buddy Tokens

| | |
|---|---|
| Price | **3 Ai Buddy Tokens per Oneharta credit** really charged (owner's choice, 10 Nov 2026). One credit costs the owner MYR 1.25; 3 tokens are USD 0.75. Most per lookup: InfoSearch, Sale search, Rental search 3 tokens; Cukai Tanah (one lot or title), Company (one number), Sale names, Rental names 9 tokens. Nothing found = nothing charged. |
| How it is paid | The new `lookup` server function holds the most the lookup can cost (`eab_lookup_begin`), asks Oneharta with the owner's key, then keeps 3 tokens per credit Oneharta says it charged and gives the rest back at once (`eab_lookup_finish`). A company Oneharta later finds no data for (and refunds) gives the tokens back too (`eab_lookup_refund`). If Oneharta never answers, the tokens stay held and the lookup is marked "unknown" for the office to check in Oneharta's call log. |
| Limits | Per Malaysia day, counted in Oneharta credits: **30 per agent** (`ONEHARTA_AGENT_DAILY_CREDITS`) and **100 for the whole app** (`ONEHARTA_APP_DAILY_CREDITS`). Every lookup spends real credits even while tokens are in test mode, so these limits protect the owner's Oneharta balance. |
| Not offered | Title-number ranges, map parcels and batches (an HSD / HSM title costs 20 to 50 credits), Request Search. |
| Personal data | Results (owner names, IC numbers, phones) are shown on the phone only and kept in that screen's memory: never stored in the database, on the phone or synced. The database keeps the kind of lookup, a short note without personal details, the cost, and the Oneharta reference needed to reopen a land tax record or company for free. The screen carries a PDPA notice. |
| Where | Settings, token card, "Property lookups"; and the top of Market News and Intelligence. Both only while the billing switch is on. (Not on the home grid: the 15 home buttons are fixed; the owner can decide to add one.) |
| Files | `supabase/functions/lookup/`, `_shared/oneharta.ts`, `supabase/proposed/20261110200000_oneharta_lookups.sql` (+ rollback, + `supabase/tests/oneharta_lookups_test.sql`), `app/src/lookups/`. Not deployed; the key is a function secret (`ONEHARTA_API_KEY`) and never goes into the app. |

## Batch D (10–11 Nov 2026): Admin EAB tools for tokens and lookups; one home button; bonus tokens

| | |
|---|---|
| Admin EAB | Money › **Tokens & lookups** (Admin EAB repo, branch feature/admin-batch-014): Oneharta credits used today and per day with their cost at RM 1.25 a credit, tokens sold, today's busiest agents, recent lookups, every agent's token balance and last 100 changes. |
| Settling | A lookup Oneharta never answered ("unknown"), or one left running more than 10 minutes, holds the agent's tokens. Owner or Admin checks Oneharta's call log and records "charged N credits" (agent pays 3 x N tokens, gets the rest back) or "not charged" (all back). Reason required; logged. |
| Add / take tokens | **Owner only**, with a reason, never below zero, at most 10,000 at a time; test and real tokens kept apart; logged. A Google refund of a pack is still taken back by itself (Batch 5). |
| Database | `supabase/proposed/20261110300000_admin_lookups_tokens.sql` (+ rollback, + `supabase/tests/admin_lookups_tokens_test.sql`); local run of all token / lookup / admin SQL tests: `supabase/tests/local/run-lookups.sh`. |
| Bonus tokens | Owner's choice (11 Nov 2026): **+5% / +10% / +15%** on the bigger packs: USD 5 = 20, USD 25 = **105**, USD 100 = **440**, USD 250 = **1,150** tokens. Google Play product ids unchanged. One list in the database (`eab_token_packs()` in `supabase/proposed/20261111100000_token_pack_bonus.sql`, + rollback), the same on the server and in the app (a test keeps the three equal). Packs bought before keep what they got; a Google refund takes back exactly what its purchase added. The wallet shows e.g. "100 + 5 bonus (+5%)". |
| Home button | While billing is switched on, the home **Market News** button asks "Market News or Property Lookups?" (like Calendar & To-Do). Billing off: it opens Market News as before. The grid keeps 15 buttons; the button inside Market News (Batch C) was removed. |

## Which features to charge for: a proposal (only Market News is gated, Batch A)

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
- Batch A paywall is enforced **on the phone only**: `eab_my_feed` still sends news posts to non-subscribers (kept in the phone's storage, not shown) and `send-push` still puts the post's title and text in the alert. Before charging real money, the database and `send-push` must leave news out for agents without an active news plan.
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
