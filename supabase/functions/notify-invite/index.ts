// Supabase Edge Function (Change 25): phone notifications for Team Workspace invitations and their answers.
// The app calls it right after sending, accepting or declining an invitation. See logic.ts for what it does and checks.
//
// Setup on the TEST project (EAB-QA-Test) first:
//   1. Paste supabase/proposed/20261018210000_change025_push.sql in the SQL Editor.
//   2. Edge Functions > Secrets: FCM_SERVICE_ACCOUNT = the whole Firebase service-account JSON file (Firebase console >
//      Project settings > Service accounts > Generate new private key). Never put it in the app or the repository.
//   3. Deploy this folder as "notify-invite" (Supabase checks the caller's sign-in token before this code runs).
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
import { handle } from './logic.ts';

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: cors });
  let body: unknown = null;
  try { body = await req.json(); } catch { /* handled as a bad request */ }
  try {
    const r = await handle(req.headers.get('authorization'), body, {
      SUPABASE_URL: Deno.env.get('SUPABASE_URL') ?? '', SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', FCM_SERVICE_ACCOUNT: Deno.env.get('FCM_SERVICE_ACCOUNT') ?? undefined,
    });
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { ...cors, 'content-type': 'application/json' } });
  } catch (e) {
    console.error('notify-invite', e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: 'push failed' }), { status: 502, headers: { ...cors, 'content-type': 'application/json' } });
  }
});
