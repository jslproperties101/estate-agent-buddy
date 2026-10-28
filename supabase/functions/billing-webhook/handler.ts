// Billing webhooks (SANDBOX / TEST MODE ONLY). Stripe and Billplz call this address by themselves, so it is deployed WITHOUT
// the sign-in check and protects itself instead:
//   ?p=stripe   the Stripe-Signature header is checked with the endpoint's signing secret (replays older than 5 minutes refused)
//   ?p=fpx      Billplz callback. The X Signature is checked when its key is set, and then the bill is ALWAYS read back from Billplz
//               with the secret key: only that answer (paid, right collection, exact price) can grant anything.
// Whatever the call says, the change is applied by the database function eab_billing_apply, once per provider event id.
import {
  BILLPLZ_SANDBOX, applyParams, liveRefusal, mapBillplzBill, mapStripeEvent, verifyBillplzSignature, verifyStripeSignature, type Env, type Mapped,
} from '../_shared/billing.ts';

export interface Deps { env: (k: string) => string; fetch: typeof fetch; now: () => number }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export async function handleWebhook(req: Request, d: Deps): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const allowLive = d.env('BILLING_ALLOW_LIVE') === 'true';
  const url = d.env('SUPABASE_URL').replace(/\/+$/, ''); const service = d.env('SUPABASE_SERVICE_ROLE_KEY');
  const billplzBase = (d.env('BILLPLZ_BASE_URL') || BILLPLZ_SANDBOX).replace(/\/+$/, '');
  if (!url || !service) return json({ error: 'not-configured' }, 503);
  const refusal = liveRefusal({ allowLive, stripeKey: d.env('STRIPE_SECRET_KEY') || undefined, billplzBase: d.env('BILLPLZ_API_KEY') ? billplzBase : undefined });
  if (refusal) return json({ error: refusal }, 503);

  const provider = new URL(req.url).searchParams.get('p');
  const raw = await req.text();
  let mapped: Mapped;

  if (provider === 'stripe') {
    const secret = d.env('STRIPE_WEBHOOK_SECRET');
    if (!secret) return json({ error: 'not-configured' }, 503);
    if (!await verifyStripeSignature(raw, req.headers.get('stripe-signature'), secret, d.now())) return json({ error: 'bad-signature' }, 400);
    let ev: unknown;
    try { ev = JSON.parse(raw); } catch { return json({ error: 'bad request' }, 400); }
    mapped = mapStripeEvent(ev);
  } else if (provider === 'fpx') {
    const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;
    const xkey = d.env('BILLPLZ_XSIGNATURE_KEY');
    if (xkey) { if (!await verifyBillplzSignature(params, xkey)) return json({ error: 'bad-signature' }, 400); }
    else if (allowLive) return json({ error: 'xsignature-key-required' }, 503);   // sandbox may rely on the read-back alone; live may not
    const id = params.id ?? '';
    const key = d.env('BILLPLZ_API_KEY'); const collection = d.env('BILLPLZ_COLLECTION_ID');
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) return json({ error: 'bad request' }, 400);
    if (!key || !collection) return json({ error: 'not-configured' }, 503);
    const br = await d.fetch(`${billplzBase}/api/v3/bills/${encodeURIComponent(id)}`, { headers: { authorization: `Basic ${btoa(`${key}:`)}` } });
    if (!br.ok) return json({ error: 'billplz', status: br.status }, 502);   // Billplz retries a callback that is not answered 200
    mapped = mapBillplzBill(await br.json().catch(() => null), collection, (billplzBase === BILLPLZ_SANDBOX ? 'sandbox' : 'live') as Env);
  } else {
    return json({ error: 'bad request' }, 400);
  }

  // Answer 200 to anything that changes nothing, so the provider does not keep retrying it.
  if ('ignored' in mapped) return json({ result: 'ignored', reason: mapped.ignored });
  if (mapped.applied.env === 'live' && !allowLive) return json({ result: 'ignored', reason: 'live-refused' });
  try {
    const r = await d.fetch(`${url}/rest/v1/rpc/eab_billing_apply`, { method: 'POST', headers: { apikey: service, authorization: `Bearer ${service}`, 'content-type': 'application/json' }, body: JSON.stringify(applyParams(mapped.applied)) });
    if (!r.ok) return json({ error: 'database' }, 500);   // a 500 makes the provider retry later
    return json({ result: await r.json() });
  } catch {
    return json({ error: 'database' }, 500);
  }
}
