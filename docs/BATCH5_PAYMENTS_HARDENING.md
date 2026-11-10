# Batch 5 — payments hardening, part 1 (9 Nov 2026)

SANDBOX / TEST MODE ONLY. Nothing here moves real money. Branch `feature/qa-batch5-payments`.

## 1. Google Play's payment rules (checked 9 Nov 2026) and what they mean here

- Google Play Payments policy: an app distributed on Google Play must use **Google Play Billing** for digital goods and
  services bought inside the app (subscriptions, news access, tokens, app features), and must not lead people inside the app
  to another way to pay for them. Exceptions that matter to us: physical goods and real-world services, and content bought
  outside the app (the app may then let people use it).
- Google's billing-choice programmes (alternative billing / external offers) name the **US, UK and EEA** (expanded June 2026).
  **Malaysia is not in them.** If that changes, this section must be read again.
- Joe's decision D-7N-4 fits these rules: **inside the Android app: Google Play only** (Market News plan, Ai Buddy Tokens, and
  Pro / POS add-on when they are switched on). **FPX (Billplz) and card (Stripe): only outside the app** — the website (laptop)
  and agency sales / invoices. The app recognises what was bought outside it, but never mentions or links to those ways.

What changed in the app:
- `offeredProviders()` (app/src/billing/providers.ts): Android → Google Play only; website → FPX and card. FPX / card inside
  the Android app are refused before any payment page is asked for (`not-in-app`). Test A-1.
- The Plans card shows only the ways offered on that device. No text points to the website or another way to pay.

## 2. Market News hidden on the server

Until now only the phone hid Market News from agents without a plan. Now the database does too, once the Owner switches
**news is paid** on (`eab_billing_settings.news_paid`, off by default — nothing changes until then):
- `eab_feed_visible` (used by the agent's feed, read marks, invitation-code counts and **push recipients**) leaves news posts
  out for agents without a news plan. Same plan rules as the app (trial / paid period, 7 days' grace, cancelled runs to its end,
  sandbox purchases do not count while `live` is on).
- The app reads the switch (`eab_billing_public`) when Market News opens and then shows the subscription box even with the
  phone's own test switch off. Tests A-2, NP10; database test 34/34 (dry run on EAB-QA-Test, rolled back).
- Owner switch: `eab_admin_billing_settings_set('{"news_paid": true}', '<reason>')` (Owner only, logged). Admin EAB screen: later.

## 3. Renewals, cancellations and refunds from Google Play

Google Play sends real-time developer notifications (RTDN) through Google Cloud Pub/Sub to
`billing-webhook?p=google_play&k=<PLAY_RTDN_TOKEN>`. Nothing in a notice is trusted:
1. the `k` secret keeps strangers out cheaply;
2. the purchase must already belong to an agent (`eab_play_purchases`, written by the billing function when the agent's
   phone verified it — a SHA-256 of Google's purchase token, never the token);
3. the purchase is read back from Google with the service account; only Google's answer is applied, with the same event id
   the phone's check uses (never applied twice);
4. a new token that replaces an old one (upgrade, re-subscribe) follows the old token's agent and is linked.

Refunds: a refunded **subscription** reads back as expired. A refunded **token pack** is confirmed in Google's voided-purchases
list (last 30 days) and then `eab_tokens_refund` takes its tokens back: whatever is left, never below zero, once; any shortfall
(tokens already spent) is recorded in `eab_token_refunds` for the Owner.
Answers: 200 for anything that changes nothing; 5xx when Google or the database could not be reached (Pub/Sub retries).
Tests P-1 … P-10.

## 4. Google Play Billing in the APK

Checked in the QA APK built by GitHub (842447f, `EAB_PLAY_BILLING=1`): it contains Google's Billing Library
(`com.android.billingclient`), the app's `PlayBilling` plugin, the `com.android.vending.BILLING` permission and Google's
purchase screens. So the native part compiles. **Not proven:** a purchase on a phone (needs the Play Console products and a
licence tester — section 6).

## 5. Files

- `supabase/proposed/20261109100000_batch5_news_gate_play_events.sql` (+ `_rollback.sql`), test
  `supabase/tests/batch5_news_gate_test.sql`
- `supabase/functions/_shared/billing.ts` (notice parsing), `_shared/play.ts` (Google sign-in, voided list),
  `billing/handler.ts` (remembers purchase owners), `billing-webhook/handler.ts` (`?p=google_play`)
- `app/src/billing/{providers,api,access,entitlement,BillingUI,strings}.ts(x)`, `app/src/feed/FeedUI.tsx`
- Tests: `app/tests/batch5.test.ts` (new), `tokens.test.ts` T-4, `ui-billing.test.mjs` BU2, `ui-news-paywall.test.mjs` NP1, NP10

## 6. Owner steps before this can be tried end to end (TEST project only)

1. Apply billing_sandbox + tokens_sandbox (done 9 Nov) and this Batch 5 SQL to EAB-QA-Test.
2. Play Console (test track, package `com.jslproperties.eaaibuddy.qa` once it exists in Play): create subscriptions
   `news_monthly`, `news_yearly` and one-time products `tokens_20/100/400/1000`; add licence testers.
3. Google Cloud: a service account with Play Console access "View financial data" + "Manage orders and subscriptions";
   function secrets `PLAY_PACKAGE_NAME`, `PLAY_SERVICE_ACCOUNT_EMAIL`, `PLAY_SERVICE_ACCOUNT_PRIVATE_KEY`.
4. Pub/Sub: topic `play-rtdn`; give `google-play-developer-notifications@system.gserviceaccount.com` the Publisher role on it;
   push subscription to `https://talksazsqsgjriamwxdp.supabase.co/functions/v1/billing-webhook?p=google_play&k=<PLAY_RTDN_TOKEN>`;
   Play Console → Monetisation setup → Real-time developer notifications → the topic → "Send test notification".
5. Deploy `billing` and `billing-webhook` (`--no-verify-jwt` for the webhook) to the TEST project.

## 7. Not in part 1

- Agency licences sold by FPX / card outside the app (seats, invoices) — next part of Batch 5.
- Admin EAB screen for the news switch and the token refund shortfalls.
- Batch C (Oneharta lookups paid by tokens).

---

# Batch 5 — part 2: agency licences (10 Nov 2026, branch `feature/qa-agency-payments`)

SANDBOX / TEST MODE ONLY. Joe's answers (10 Nov): charge **both** ways (per agent seat, and one price for the whole agency);
pay **both** ways (a checkout page on the website, and an invoice with a pay link). "New branch": built on a new branch; the
SQL was tested on a local PostgreSQL only, because EAB-QA-Test is paused (the free plan's second slot is held by "Aura Beauty").

## Google Play rules, checked again on 10 Nov 2026
Google's billing choice programme (support.google.com/googleplay/android-developer/answer/17161464) covers the UK and EEA
(30 Jun 2026), Australia and Japan (30 Sep 2026), and the US under its own programmes. **Malaysia is still not covered.** So
nothing changes from part 1: inside the Android app only Google Play is offered; agency licences are sold on the website and
by invoice, and the Android app shows the licence and its seats but **no prices, pay buttons, links or invoices**.

## How it works
- One licence per agency (team workspace): `seats` (N agents bought, RM per agent) or `agency` (one price, covers up to a set
  number of agents). 30 or 365 days per payment, added after the current period. Nothing renews by itself.
- Every payment starts as an invoice row (`eab_agency_invoices`, numbered AGI-00001…): the website checkout makes one, and
  the platform owner raises one in Admin EAB (Company Money → Agency licences). The amount the provider reports must equal the
  invoice's; each provider event applies once; a payment for a void or already-paid invoice, or of the wrong amount, is
  recorded for the owner to refund (`eab_admin_agency_problems`).
- Seats: filled automatically from the agency's members when a payment is applied (owner and admins first; 'limited'
  members never); the agency owner or an admin moves seats in Settings → Plans → Agency licence. A seat counts as Pro
  (`eab_billing_has`, `eab_my_billing` row with provider `agency`); not the POS add-on.
- Ways to pay an invoice: FPX (a Billplz bill, link does not expire), card (a link to `billing-webhook?p=pay&i=…&t=…` that
  opens a fresh Stripe page each time), or **marked paid by the owner** after a bank transfer (with the bank reference).
- Prices are PLACEHOLDERS (RM 49 per agent a month, RM 490 a year; RM 399 a month / RM 3,990 a year for up to 15 agents)
  until Joe sets them in Admin EAB.

## Files
- `supabase/proposed/20261110100000_agency_licences.sql` (+ `_rollback.sql`); test `supabase/tests/agency_licences_test.sql`
  (local: `supabase/tests/local/run-agency.sh` with `local/agency_stubs.sql`).
- `supabase/functions/_shared/agency.ts`; `billing/handler.ts` (agency_checkout, agency_invoice);
  `billing-webhook/handler.ts` (agency FPX bills and Stripe Checkout; GET `?p=pay`).
- App: `app/src/billing/{agency.ts, AgencyUI.tsx, agencyStrings.ts}`, `entitlement.ts` (best line wins; no personal Pro sold
  on top of an agency seat), `api.ts`, `BillingUI.tsx`, `strings.ts`. Tests `app/tests/batch5b-agency.test.ts`, `ui-billing.test.mjs` BU-A1…A3.
- Admin EAB (`feature/admin-batch-014`): Money → Agency licences (invoices, raise, mark paid, void, problems, prices).

## Owner steps (TEST project only)
1. Free a Supabase slot for EAB-QA-Test (pause "Aura Beauty" or upgrade the plan), then apply this SQL there and run its test.
2. Deploy `billing` and `billing-webhook` to EAB-QA-Test with the Billplz sandbox and Stripe test secrets (part 1, section 6);
   in Stripe add the events `checkout.session.completed` and `checkout.session.async_payment_succeeded` to the webhook.
3. Set the real prices in Admin EAB before selling anything.

## Not in part 2
- Batch C (One Harta lookups paid with tokens): needs One Harta's API documents, an API key and the token price of each lookup.
- Automatic renewal (subscriptions) for agencies; e-mailing invoices (send the links yourself); pro-rata for seats bought mid-period
  (raise an invoice with your own amount).
