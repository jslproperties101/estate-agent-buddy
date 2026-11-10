// Billing webhooks (SANDBOX / TEST MODE ONLY). Stripe and Billplz call this address by themselves, so it is deployed WITHOUT
// the sign-in check and protects itself instead:
//   ?p=stripe   the Stripe-Signature header is checked with the endpoint's signing secret (replays older than 5 minutes refused)
//   ?p=fpx      Billplz callback. The X Signature is checked when its key is set, and then the bill is ALWAYS read back from Billplz
//               with the secret key: only that answer (paid, right collection, exact price) can grant anything.
//   ?p=google_play&k=<PLAY_RTDN_TOKEN>  Batch 5: Google Play's real-time developer notifications through Pub/Sub (renewals,
//               cancellations, expiry, refunds). The k secret only keeps strangers out cheaply; the notice itself is never
//               trusted: the purchase must already be linked to an agent (eab_play_purchases), it is read back from Google with
//               the service account, and only Google's answer is applied. A refunded token pack takes its tokens back
//               (eab_tokens_refund) after Google's voided-purchases list confirms it.
//   GET ?p=pay&i=<invoice>&t=<token>  Batch 5 part 2: the card link printed on an agency invoice. Opens a fresh Stripe page
//               for that invoice (Stripe pages expire after a day) and sends the browser there. Nothing is granted here.
// Agency payments (Batch 5 part 2: a Billplz bill or Stripe Checkout made for an agency invoice) go to eab_agency_apply, which
// checks the amount against the invoice and applies each payment once.
// Whatever the call says, the change is applied by the database function eab_billing_apply, once per provider event id.
import {
  BILLPLZ_SANDBOX, applyParams, isPlanId, liveRefusal, mapBillplzBill, mapPlaySubscription, mapStripeEvent, parsePlayNotice, playSubEventId,
  safeEqual, tokenPurchaseRef, verifyBillplzSignature, verifyStripeSignature, type Env, type Mapped,
} from '../_shared/billing.ts';
import { isVoided, playApi, playCfg } from '../_shared/play.ts';
import { agencyApplyParams, isPayToken, mapAgencyBill, mapAgencyStripe, stripeAgencyBody, type AgencyInvoice, type AgencyMapped } from '../_shared/agency.ts';

export interface Deps { env: (k: string) => string; fetch: typeof fetch; now: () => number }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const str = (x: unknown) => (typeof x === 'string' ? x : '');
const sha256Hex = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');

/** A database function called with the service key. Throws when the database does not answer 2xx. */
async function rpc(d: Deps, url: string, service: string, name: string, body: Record<string, unknown>): Promise<unknown> {
  const r = await d.fetch(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: service, authorization: `Bearer ${service}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`rpc ${name} ${r.status}`);
  return r.json();
}

/**
 * Batch 5: one Google Play notice. Answers 200 for anything that changes nothing (so Pub/Sub stops sending it) and 5xx when
 * Google or the database could not be reached (Pub/Sub then sends it again later).
 */
async function playNotice(req: Request, raw: string, d: Deps, url: string, service: string, allowLive: boolean): Promise<Response> {
  const secret = d.env('PLAY_RTDN_TOKEN');
  const cfg = playCfg(d.env);
  if (!secret || !cfg.packageName) return json({ error: 'not-configured' }, 503);
  if (!safeEqual(new URL(req.url).searchParams.get('k') ?? '', secret)) return json({ error: 'bad-token' }, 401);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ result: 'ignored', reason: 'not-json' }); }
  const n = parsePlayNotice(body, cfg.packageName);
  if ('bad' in n) return json({ result: 'ignored', reason: n.bad });
  if (n.kind === 'test') return json({ result: 'test' });
  if (n.kind === 'other') return json({ result: 'ignored', reason: n.what });

  const g = await playApi(d.fetch, d.now(), cfg);
  if ('error' in g) return g.error === 'not-configured' ? json({ error: 'not-configured' }, 503) : json({ error: 'google-auth' }, 502);
  const hash = await sha256Hex(n.token);
  try {
    // ---- a refunded / charged-back token pack (one-time product)
    if (n.kind === 'voided' && n.productType !== 1) {
      const owner = await rpc(d, url, service, 'eab_play_purchase_owner', { p_token_hash: hash }) as { kind?: string } | null;
      if (!owner || owner.kind !== 'inapp') return json({ result: 'ignored', reason: 'unknown-purchase' });
      const v = await isVoided(d.fetch, g, n.token, d.now());
      if (v === 'error') return json({ error: 'google' }, 502);
      if (!v) return json({ result: 'ignored', reason: 'not-voided' });
      return json({ result: await rpc(d, url, service, 'eab_tokens_refund', { p_ref: tokenPurchaseRef(hash) }) });
    }
    // ---- a subscription changed (renewed, cancelled, on hold, expired, revoked or refunded): read it back and apply it
    const gr = await d.fetch(`${g.base}/purchases/subscriptionsv2/tokens/${encodeURIComponent(n.token)}`, { headers: { authorization: `Bearer ${g.access}` } });
    if (gr.status === 400 || gr.status === 404 || gr.status === 410) return json({ result: 'ignored', reason: 'not-found' });
    if (!gr.ok) return json({ error: 'google' }, 502);
    type Sub = { lineItems?: { productId?: string }[]; linkedPurchaseToken?: string; latestOrderId?: string; subscriptionState?: string; externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string } };
    const sub = await gr.json().catch(() => null) as Sub | null;
    const planId = str(sub?.lineItems?.[0]?.productId);
    if (!isPlanId(planId)) return json({ result: 'ignored', reason: 'unknown-plan' });
    // Whose is it? A purchase the agent's phone already verified; or a new token that replaces one (upgrade, re-subscribe).
    let owner = await rpc(d, url, service, 'eab_play_purchase_owner', { p_token_hash: hash }) as { user_id?: string; kind?: string } | null;
    let linkNew = false;
    if (!owner && str(sub?.linkedPurchaseToken)) {
      owner = await rpc(d, url, service, 'eab_play_purchase_owner', { p_token_hash: await sha256Hex(str(sub?.linkedPurchaseToken)) }) as typeof owner;
      linkNew = !!owner;
    }
    if (!owner?.user_id || owner.kind !== 'subs') return json({ result: 'ignored', reason: 'unknown-purchase' });
    // Google must still name the same agent on the purchase.
    if (str(sub?.externalAccountIdentifiers?.obfuscatedExternalAccountId) !== await sha256Hex(owner.user_id)) return json({ result: 'ignored', reason: 'not-linked' });
    const m = mapPlaySubscription(sub, { userId: owner.user_id, planId, eventId: playSubEventId(hash, str(sub?.latestOrderId), str(sub?.subscriptionState)) }, d.now());
    if ('ignored' in m) return json({ result: 'ignored', reason: m.ignored });
    if (m.applied.env === 'live' && !allowLive) return json({ result: 'ignored', reason: 'live-refused' });
    const result = await rpc(d, url, service, 'eab_billing_apply', applyParams(m.applied));
    if (linkNew) await rpc(d, url, service, 'eab_play_purchase_link', { p_token_hash: hash, p_user: owner.user_id, p_kind: 'subs', p_product: planId });
    return json({ result, status: m.applied.status });
  } catch {
    return json({ error: 'database' }, 500);
  }
}

const text = (msg: string, status: number) => new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

/** The card link on an agency invoice: a fresh Stripe page for an open invoice whose token matches. */
async function payLink(req: Request, d: Deps, url: string, service: string): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const id = q.get('i') ?? ''; const token = q.get('t') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id) || !isPayToken(token)) return text('This payment link is not valid.', 404);
  const key = d.env('STRIPE_SECRET_KEY'); const ret = d.env('BILLING_RETURN_URL');
  if (!key || !/^https:\/\//.test(ret)) return text('Card payment is not set up yet.', 503);
  let inv: AgencyInvoice | null;
  try { inv = await rpc(d, url, service, 'eab_agency_invoice_get', { p_id: id, p_token: token }) as AgencyInvoice | null; }
  catch { return text('Please try again in a minute.', 503); }
  if (!inv) return text('This payment link is not valid.', 404);
  if (inv.status !== 'open') return text(inv.status === 'paid' ? 'This invoice is already paid. Thank you.' : 'This invoice was cancelled.', 410);
  const r = await d.fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(stripeAgencyBody(inv, ret)).toString() });
  const j = r.ok ? await r.json().catch(() => null) : null;
  const to = str(j?.url);
  if (!to.startsWith('https://')) return text('The card payment page could not be opened. Please try again.', 502);
  try { await rpc(d, url, service, 'eab_agency_invoice_links', { p_id: id, p_bill_id: null, p_fpx_url: null, p_session_id: str(j?.id) || null }); } catch { /* the link still works */ }
  return new Response(null, { status: 303, headers: { location: to, 'cache-control': 'no-store' } });
}

/** An agency payment: applied by the database against its invoice. 500 when the database could not be reached (retried). */
async function agencyPaid(m: AgencyMapped, d: Deps, url: string, service: string, allowLive: boolean): Promise<Response> {
  if (!m) return json({ error: 'not-agency' }, 400);
  if ('ignored' in m) return json({ result: 'ignored', reason: m.ignored });
  if (m.paid.env === 'live' && !allowLive) return json({ result: 'ignored', reason: 'live-refused' });
  try { return json({ result: await rpc(d, url, service, 'eab_agency_apply', agencyApplyParams(m.paid)) }); }
  catch { return json({ error: 'database' }, 500); }
}

export async function handleWebhook(req: Request, d: Deps): Promise<Response> {
  if (req.method === 'GET' && new URL(req.url).searchParams.get('p') === 'pay') {
    const u = d.env('SUPABASE_URL').replace(/\/+$/, ''); const sv = d.env('SUPABASE_SERVICE_ROLE_KEY');
    if (!u || !sv) return text('Not set up.', 503);
    return await payLink(req, d, u, sv);
  }
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

  if (provider === 'google_play') return await playNotice(req, raw, d, url, service, allowLive);

  if (provider === 'stripe') {
    const secret = d.env('STRIPE_WEBHOOK_SECRET');
    if (!secret) return json({ error: 'not-configured' }, 503);
    if (!await verifyStripeSignature(raw, req.headers.get('stripe-signature'), secret, d.now())) return json({ error: 'bad-signature' }, 400);
    let ev: unknown;
    try { ev = JSON.parse(raw); } catch { return json({ error: 'bad request' }, 400); }
    const agency = mapAgencyStripe(ev);
    if (agency) return await agencyPaid(agency, d, url, service, allowLive);
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
    const bill = await br.json().catch(() => null);
    const fpxEnv = (billplzBase === BILLPLZ_SANDBOX ? 'sandbox' : 'live') as Env;
    const agency = mapAgencyBill(bill, collection, fpxEnv);
    if (agency) return await agencyPaid(agency, d, url, service, allowLive);
    mapped = mapBillplzBill(bill, collection, fpxEnv);
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
