// Supabase Edge Function "email-unsubscribe" (AdminBatch008): the link at the bottom of every Admin EAB email.
//   GET  /functions/v1/email-unsubscribe?t=<token>   → a small page in the agent's language
//   POST /functions/v1/email-unsubscribe?t=<token>   → one-click unsubscribe from the mail app (List-Unsubscribe-Post)
// It turns the agent's "news & offers" answer OFF (the same as the switch in the app; kept as history). Service notices
// about the account still arrive. Nothing else can be done with the link.
// DEPLOY WITHOUT SIGN-IN CHECK (people click it from their mailbox):  supabase functions deploy email-unsubscribe --no-verify-jwt
import { unsubscribePage, type Lang } from '../_shared/eab-comms.ts';

const URL_ = Deno.env.get('SUPABASE_URL') ?? ''; const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async req => {
  if (req.method !== 'GET' && req.method !== 'POST') return new Response('method', { status: 405 });
  const t = new URL(req.url).searchParams.get('t') ?? '';
  let ok = false; let lang: Lang = 'en';
  if (/^[0-9a-f]{32}$/.test(t)) {
    const r = await fetch(`${URL_}/rest/v1/rpc/eab_bc_unsubscribe`, { method: 'POST',
      headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' }, body: JSON.stringify({ p_token: t }) });
    const j = r.ok ? await r.json() as { ok?: boolean; lang?: Lang } : {};
    ok = !!j.ok; if (j.lang === 'bm' || j.lang === 'zh') lang = j.lang;
  }
  if (req.method === 'POST') return new Response(null, { status: ok ? 200 : 404 });
  return new Response(unsubscribePage(ok, lang), { status: ok ? 200 : 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
});
