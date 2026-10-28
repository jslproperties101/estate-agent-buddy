// Billing, the signed-in agent's side (SANDBOX / TEST MODE ONLY). Called by the app with the agent's sign-in token; Supabase
// checks that token before index.ts runs. Actions:
//   trial        start the one free trial of Pro or the POS add-on
//   checkout     start a Stripe (test) Checkout or a Billplz (sandbox) FPX bill; answers the page address to open
//   play_verify  check a Google Play purchase with Google and apply it
// The price always comes from this server (_shared/billing.ts), never from the app. Provider keys are function secrets and
// never go into the app. Nothing here grants access from a card or bank answer alone: access is written by
// billing-webhook (Stripe, Billplz) or by the verified Google answer below.
import {
  BILLPLZ_SANDBOX, PLANS, TRIAL_DAYS, applyParams, googleServiceJwt, isPlanId, isProduct, isUuid, liveRefusal, mapPlaySubscription,
  safeReturnUrl, type Env, type Product,
} from '../_shared/billing.ts';

export interface Deps { env: (k: string) => string; fetch: typeof fetch; now: () => number }

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
const str = (x: unknown) => (typeof x === 'string' ? x : '');
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const sha256Hex = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');

function config(d: Deps) {
  const allowLive = d.env('BILLING_ALLOW_LIVE') === 'true';
  return {
    allowLive, env: (allowLive ? 'live' : 'sandbox') as Env,
    url: d.env('SUPABASE_URL').replace(/\/+$/, ''), anon: d.env('SUPABASE_ANON_KEY'), service: d.env('SUPABASE_SERVICE_ROLE_KEY'),
    stripeKey: d.env('STRIPE_SECRET_KEY'),
    stripePrice: { pro_monthly: d.env('STRIPE_PRICE_PRO_MONTHLY'), pro_yearly: d.env('STRIPE_PRICE_PRO_YEARLY'), pos_monthly: d.env('STRIPE_PRICE_POS_MONTHLY') },
    billplzKey: d.env('BILLPLZ_API_KEY'), billplzCollection: d.env('BILLPLZ_COLLECTION_ID'), billplzBase: (d.env('BILLPLZ_BASE_URL') || BILLPLZ_SANDBOX).replace(/\/+$/, ''),
    returnUrl: safeReturnUrl(d.env('BILLING_RETURN_URL')),
    playPackage: d.env('PLAY_PACKAGE_NAME'), playEmail: d.env('PLAY_SERVICE_ACCOUNT_EMAIL'), playKey: d.env('PLAY_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n'),
  };
}
type Cfg = ReturnType<typeof config>;

async function signedInUser(d: Deps, c: Cfg, req: Request): Promise<{ id: string; email: string } | null> {
  const auth = req.headers.get('authorization') ?? '';
  if (!/^Bearer\s+\S+$/.test(auth) || !c.url) return null;
  const r = await d.fetch(`${c.url}/auth/v1/user`, { headers: { authorization: auth, apikey: c.anon } });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return isUuid(u?.id) ? { id: u.id, email: str(u.email) } : null;
}

async function rpc(d: Deps, c: Cfg, name: string, body: Record<string, unknown>): Promise<unknown> {
  const r = await d.fetch(`${c.url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: c.service, authorization: `Bearer ${c.service}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`rpc ${name} ${r.status}`);
  return r.json();
}

async function stripeCheckout(d: Deps, c: Cfg, user: { id: string; email: string }, planId: keyof typeof PLANS): Promise<Response> {
  const price = c.stripePrice[planId];
  if (!c.stripeKey || !price || !c.returnUrl) return json({ error: 'not-configured' }, 503);
  const plan = PLANS[planId];
  const body: Record<string, string> = {
    mode: 'subscription', 'line_items[0][price]': price, 'line_items[0][quantity]': '1', client_reference_id: user.id,
    'subscription_data[metadata][user_id]': user.id, 'subscription_data[metadata][product]': plan.product, 'subscription_data[metadata][plan_id]': planId,
    success_url: c.returnUrl, cancel_url: c.returnUrl,
  };
  if (user.email) body.customer_email = user.email;
  const r = await d.fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { authorization: `Bearer ${c.stripeKey}`, 'content-type': 'application/x-www-form-urlencoded' }, body: form(body) });
  if (!r.ok) return json({ error: 'stripe', status: r.status }, 502);
  const j = await r.json().catch(() => null);
  const url = str(j?.url);
  return url.startsWith('https://') ? json({ url, env: c.env }) : json({ error: 'stripe' }, 502);
}

async function fpxBill(d: Deps, c: Cfg, user: { id: string; email: string }, planId: keyof typeof PLANS): Promise<Response> {
  if (!c.billplzKey || !c.billplzCollection || !c.returnUrl || !c.url) return json({ error: 'not-configured' }, 503);
  const plan = PLANS[planId];
  const r = await d.fetch(`${c.billplzBase}/api/v3/bills`, {
    method: 'POST', headers: { authorization: `Basic ${btoa(`${c.billplzKey}:`)}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: form({
      collection_id: c.billplzCollection, email: user.email, name: (user.email.split('@')[0] || 'EAB agent').slice(0, 100), amount: String(plan.amountSen),
      callback_url: `${c.url}/functions/v1/billing-webhook?p=fpx`, redirect_url: c.returnUrl,
      description: `Estate Agent AI Buddy ${planId.replace('_', ' ')} (${plan.days} days)`.slice(0, 200),
      reference_1_label: 'user', reference_1: user.id, reference_2_label: 'plan', reference_2: planId,
    }),
  });
  if (!r.ok) return json({ error: 'billplz', status: r.status }, 502);
  const j = await r.json().catch(() => null);
  const url = str(j?.url);
  return url.startsWith(`${c.billplzBase}/`) ? json({ url, env: c.billplzBase === BILLPLZ_SANDBOX ? 'sandbox' : 'live' }) : json({ error: 'billplz' }, 502);
}

async function playVerify(d: Deps, c: Cfg, user: { id: string }, planId: keyof typeof PLANS, token: string): Promise<Response> {
  if (!c.playPackage || !c.playEmail || !c.playKey || !c.url) return json({ error: 'not-configured' }, 503);
  const jwt = await googleServiceJwt(c.playEmail, c.playKey, 'https://www.googleapis.com/auth/androidpublisher', Math.floor(d.now() / 1000));
  const tr = await d.fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
  if (!tr.ok) return json({ error: 'google-auth', status: tr.status }, 502);
  const access = str((await tr.json().catch(() => null))?.access_token);
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(c.playPackage)}`;
  const gr = await d.fetch(`${base}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`, { headers: { authorization: `Bearer ${access}` } });
  if (!gr.ok) return json({ error: 'google', status: gr.status }, gr.status === 404 || gr.status === 400 ? 404 : 502);
  const sub = await gr.json().catch(() => null);
  // The purchase must have been made for THIS agent: the app puts a hash of the agent's id on the purchase, and Google returns it.
  if (str(sub?.externalAccountIdentifiers?.obfuscatedExternalAccountId) !== await sha256Hex(user.id)) return json({ error: 'not-linked' }, 403);
  const eventId = `${(await sha256Hex(token)).slice(0, 32)}:${str(sub?.latestOrderId)}:${str(sub?.subscriptionState)}`;
  const m = mapPlaySubscription(sub, { userId: user.id, planId, eventId }, d.now());
  if ('ignored' in m) return json({ error: 'not-applicable', reason: m.ignored }, 422);
  if (m.applied.env === 'live' && !c.allowLive) return json({ error: 'live-refused' }, 403);
  const result = await rpc(d, c, 'eab_billing_apply', applyParams(m.applied));
  if (sub?.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING' && (m.applied.status === 'active' || m.applied.status === 'trialing')) {
    await d.fetch(`${base}/purchases/subscriptions/${encodeURIComponent(planId)}/tokens/${encodeURIComponent(token)}:acknowledge`, { method: 'POST', headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' }, body: '{}' });
  }
  return json({ result, status: m.applied.status, env: m.applied.env });
}

export async function handleBilling(req: Request, d: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const c = config(d);
  if (!c.url || !c.service) return json({ error: 'not-configured' }, 503);
  const refusal = liveRefusal({ allowLive: c.allowLive, stripeKey: c.stripeKey, billplzBase: c.billplzKey ? c.billplzBase : undefined });
  if (refusal) return json({ error: refusal }, 503);
  const user = await signedInUser(d, c, req);
  if (!user) return json({ error: 'not-signed-in' }, 401);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'bad request' }, 400); }
  try {
    if (body.action === 'trial') {
      if (!isProduct(body.product)) return json({ error: 'bad request' }, 400);
      const result = await rpc(d, c, 'eab_billing_start_trial', { p_user: user.id, p_product: body.product as Product, p_days: TRIAL_DAYS, p_env: c.env });
      return json({ result });
    }
    if (body.action === 'checkout') {
      if (!isPlanId(body.planId)) return json({ error: 'bad request' }, 400);
      if (body.provider === 'stripe') return await stripeCheckout(d, c, user, body.planId);
      if (body.provider === 'fpx') return await fpxBill(d, c, user, body.planId);
      return json({ error: 'bad request' }, 400);
    }
    if (body.action === 'play_verify') {
      const token = str(body.purchaseToken);
      if (!isPlanId(body.planId) || !/^[\w.-]{20,4000}$/.test(token)) return json({ error: 'bad request' }, 400);
      return await playVerify(d, c, user, body.planId, token);
    }
    return json({ error: 'unknown action' }, 400);
  } catch {
    return json({ error: 'server' }, 500);
  }
}
