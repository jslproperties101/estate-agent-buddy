// Supabase Edge Function: billing for the signed-in agent (SANDBOX / TEST MODE ONLY). The logic is in handler.ts so the unit
// tests can run it. Supabase checks the caller's sign-in token before this code runs.
//   supabase secrets set STRIPE_SECRET_KEY=sk_test_...                      (a live key is refused unless BILLING_ALLOW_LIVE=true)
//   supabase secrets set STRIPE_PRICE_PRO_MONTHLY=price_... STRIPE_PRICE_PRO_YEARLY=price_... STRIPE_PRICE_POS_MONTHLY=price_...
//   supabase secrets set BILLPLZ_API_KEY=... BILLPLZ_COLLECTION_ID=... BILLPLZ_BASE_URL=https://www.billplz-sandbox.com
//   supabase secrets set BILLING_RETURN_URL=https://...                     (where the agent lands after paying)
//   supabase secrets set PLAY_PACKAGE_NAME=com.jslproperties.eaaibuddy.qa PLAY_SERVICE_ACCOUNT_EMAIL=... PLAY_SERVICE_ACCOUNT_PRIVATE_KEY=...
//   supabase functions deploy billing
// NOT DEPLOYED AND NEVER CALLED AGAINST STRIPE, BILLPLZ OR GOOGLE YET: deploy it to the TEST Supabase project only.
import { handleBilling } from './handler.ts';

Deno.serve(req => handleBilling(req, { env: k => Deno.env.get(k) ?? '', fetch, now: () => Date.now() }));
