// Supabase Edge Function: billing webhooks for Stripe (test mode) and Billplz (sandbox). Called by the providers, not by the
// app, so it is deployed without the sign-in check; handler.ts checks every call itself.
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...  BILLPLZ_XSIGNATURE_KEY=...
//   (plus the secrets listed in supabase/functions/billing/index.ts)
//   supabase functions deploy billing-webhook --no-verify-jwt
//   Stripe: add an endpoint  https://<project>.supabase.co/functions/v1/billing-webhook?p=stripe  for customer.subscription.created,
//           customer.subscription.updated and customer.subscription.deleted.
//   Billplz: the bill's callback address is set by the billing function (?p=fpx).
// NOT DEPLOYED AND NEVER CALLED BY STRIPE OR BILLPLZ YET: deploy it to the TEST Supabase project only.
import { handleWebhook } from './handler.ts';

Deno.serve(req => handleWebhook(req, { env: k => Deno.env.get(k) ?? '', fetch, now: () => Date.now() }));
