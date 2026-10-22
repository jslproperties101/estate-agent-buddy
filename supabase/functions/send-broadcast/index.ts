// Supabase Edge Function "send-broadcast" (AdminBatch008, feature 64): sends a QUEUED Admin EAB broadcast.
//   POST /functions/v1/send-broadcast   { "broadcast_id": "<uuid>" }   with the admin's own sign-in (Owner or Admin).
// The database decides everything about who may send and to whom (eab_admin_broadcast_claim, with the caller's sign-in);
// this function only delivers and writes each result back with its own key (eab_bc_result / eab_bc_finish).
// Each person is sent to at most once per broadcast (only "pending" rows are sent and a result is written once).
//
// Email (Resend, https://resend.com). Secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY     required for email; without it email broadcasts answer 503 "email not set up"
//   EAB_EMAIL_FROM     e.g. "Estate Agent AI Buddy <news@your-domain.com>". Until a domain is verified in Resend, use
//                      "onboarding@resend.dev": Resend then only delivers to the Resend account's own address (others fail
//                      and are shown as failed with Resend's reason).
// WhatsApp Business (Meta Cloud API). All three needed, else WhatsApp answers 503 (use tap-to-send in Admin EAB):
//   WA_TOKEN             a permanent access token of the WhatsApp Business app
//   WA_PHONE_NUMBER_ID   the sender number's id (Meta → WhatsApp → API setup)
//   WA_TEMPLATE          name of an APPROVED template whose body has exactly one variable {{1}} (the message)
//   WA_TEMPLATE_LANGS    optional JSON, default {"en":"en","bm":"ms","zh":"zh_CN"} (the template's languages)
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
import { emailFor, waTemplateFor, type Broadcast, type Recipient } from '../_shared/eab-comms.ts';

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
const env = (k: string) => Deno.env.get(k) ?? '';
const URL_ = env('SUPABASE_URL'); const ANON = env('SUPABASE_ANON_KEY'); const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');

const asCaller = (auth: string, fn: string, body: unknown) => fetch(`${URL_}/rest/v1/rpc/${fn}`, {
  method: 'POST', headers: { apikey: ANON, authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const asService = (fn: string, body: unknown) => fetch(`${URL_}/rest/v1/rpc/${fn}`, {
  method: 'POST', headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface Claim { broadcast: Broadcast; recipients: Recipient[]; left: number }

async function claim(auth: string, id: string): Promise<{ ok: true; c: Claim } | { ok: false; res: Response }> {
  const r = await asCaller(auth, 'eab_admin_broadcast_claim', { p_id: id, p_limit: 100, p_device: 'send-broadcast' });
  if (r.ok) return { ok: true, c: await r.json() };
  const e = await r.json().catch(() => ({})) as { code?: string; message?: string };
  const status = e.code === '42501' ? 403 : e.code === '55P03' ? 409 : e.code === 'P0002' ? 404 : r.status === 401 ? 401 : 400;
  return { ok: false, res: json({ error: e.message ?? 'refused' }, status) };
}
async function result(id: number, ok: boolean, error?: string, provider?: string) {
  await asService('eab_bc_result', { p_recipient: id, p_ok: ok, p_error: error ?? null, p_provider_id: provider ?? null });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'not signed in' }, 401);
  let body: { broadcast_id?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad request' }, 400); }
  const id = body.broadcast_id && /^[0-9a-f-]{36}$/i.test(body.broadcast_id) ? body.broadcast_id : undefined;
  if (!id) return json({ error: 'bad request' }, 400);

  const first = await claim(auth, id);
  if (!first.ok) return first.res;
  const b = first.c.broadcast;
  const emailReady = !!env('RESEND_API_KEY');
  const waReady = !!(env('WA_TOKEN') && env('WA_PHONE_NUMBER_ID') && env('WA_TEMPLATE'));
  if ((b.channel === 'email' && !emailReady) || (b.channel === 'whatsapp' && !waReady)) {
    await asService('eab_bc_unclaim', { p_id: id });
    return json({ error: b.channel === 'email' ? 'email not set up' : 'WhatsApp Business not set up: use tap-to-send' }, 503);
  }

  const settings = await (await fetch(`${URL_}/rest/v1/rpc/eab_public_settings`, { method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' }, body: '{}' })).json().catch(() => ({})) as { company_name?: string };
  const company = settings.company_name || 'Estate Agent AI Buddy';
  const from = env('EAB_EMAIL_FROM') || `${company} <onboarding@resend.dev>`;
  const unsubscribeBase = `${URL_}/functions/v1/email-unsubscribe`;
  let langs: Record<string, string> = { en: 'en', bm: 'ms', zh: 'zh_CN' };
  try { if (env('WA_TEMPLATE_LANGS')) langs = { ...langs, ...JSON.parse(env('WA_TEMPLATE_LANGS')) }; } catch { /* keep default */ }

  const started = Date.now(); let sent = 0; let failed = 0;
  let c: Claim = first.c;
  // Up to ~100 seconds per call (Edge Functions stop after 150 s); the rest is sent by the next call.
  while (c.recipients.length) {
    if (b.channel === 'email') {
      const mails = c.recipients.map(r => emailFor(b, r, { from, company, unsubscribeBase }));
      const r = await fetch('https://api.resend.com/emails/batch', { method: 'POST',
        headers: { authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json', 'idempotency-key': `${b.id}-${c.recipients[0].id}` },
        body: JSON.stringify(mails) });
      const j = await r.json().catch(() => ({})) as { data?: { id: string }[]; message?: string; name?: string };
      for (let i = 0; i < c.recipients.length; i++) {
        const okOne = r.ok && !!j.data?.[i]?.id;
        await result(c.recipients[i].id, okOne, okOne ? undefined : `Resend ${r.status}: ${j.message ?? j.name ?? 'refused'}`, j.data?.[i]?.id);
        if (okOne) sent++; else failed++;
      }
      await sleep(600);   // Resend free plan: 2 requests a second
    } else {
      for (const rc of c.recipients) {
        const r = await fetch(`https://graph.facebook.com/v21.0/${env('WA_PHONE_NUMBER_ID')}/messages`, { method: 'POST',
          headers: { authorization: `Bearer ${env('WA_TOKEN')}`, 'content-type': 'application/json' },
          body: JSON.stringify(waTemplateFor(b, rc, { template: env('WA_TEMPLATE'), langs })) });
        const j = await r.json().catch(() => ({})) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
        const okOne = r.ok && !!j.messages?.[0]?.id;
        await result(rc.id, okOne, okOne ? undefined : `WhatsApp ${r.status}: ${j.error?.message ?? 'refused'}`, j.messages?.[0]?.id);
        if (okOne) sent++; else failed++;
      }
    }
    if (Date.now() - started > 100_000) break;
    const next = await claim(auth, id);
    if (!next.ok) break;
    c = next.c;
  }
  const fin = await asService('eab_bc_finish', { p_id: id });
  const status = fin.ok ? await fin.json() : 'sending';
  return json({ broadcast_id: id, sent, failed, status, more: status !== 'done' });
});
