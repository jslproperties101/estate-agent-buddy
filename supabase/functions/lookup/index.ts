// Supabase Edge Function: Oneharta lookups for the signed-in agent, paid with Ai Buddy Tokens (Batch C). The logic is in
// handler.ts so the unit tests can run it. Supabase checks the caller's sign-in token before this code runs.
//   supabase secrets set ONEHARTA_API_KEY=ohk_...              (from oneharta.com Home -> Credits history; NEVER put it in the app)
//   supabase secrets set ONEHARTA_AGENT_DAILY_CREDITS=30       (optional; credits one agent may use per Malaysia day)
//   supabase secrets set ONEHARTA_APP_DAILY_CREDITS=100        (optional; credits the whole app may use per Malaysia day)
//   supabase functions deploy lookup
// Needs supabase/proposed/20261103000000_tokens_sandbox.sql and 20261110200000_oneharta_lookups.sql on the database.
// NOT DEPLOYED AND NEVER CALLED AGAINST ONEHARTA YET: every call spends the owner's real Oneharta credits (MYR 1.25 each),
// even while tokens are in test mode. Deploy it to the TEST Supabase project only.
import { handleLookup } from './handler.ts';

Deno.serve(req => handleLookup(req, { env: k => Deno.env.get(k) ?? '', fetch, now: () => Date.now() }));
