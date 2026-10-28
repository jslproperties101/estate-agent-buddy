// Shared, pure billing logic for the two billing server functions (billing, billing-webhook). No Deno or network calls
// here, so the unit tests run it under Node. SANDBOX / TEST MODE ONLY for now: nothing in this file moves real money, and
// liveRefusal() makes the functions refuse any live key unless BILLING_ALLOW_LIVE=true is set by the owner.
//
// The price list below is the ONLY price the server trusts. The phone never sends an amount. The amounts are PROPOSALS
// (docs/MONETISATION_PLAN.md) until the owner approves them; app/src/billing/plans.ts has a copy, and a test keeps the two
// the same.

export type Product = 'pro' | 'pos';
export type PlanId = 'pro_monthly' | 'pro_yearly' | 'pos_monthly';
export type Status = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
export type Provider = 'trial' | 'fpx' | 'stripe' | 'google_play';
export type Env = 'sandbox' | 'live';

export interface PlanDef { id: PlanId; product: Product; interval: 'month' | 'year'; amountSen: number; days: number }
export const PLANS: Record<PlanId, PlanDef> = {
  pro_monthly: { id: 'pro_monthly', product: 'pro', interval: 'month', amountSen: 4900, days: 30 },
  pro_yearly: { id: 'pro_yearly', product: 'pro', interval: 'year', amountSen: 49000, days: 365 },
  pos_monthly: { id: 'pos_monthly', product: 'pos', interval: 'month', amountSen: 3900, days: 30 },
};
export const TRIAL_DAYS = 14;
export const isPlanId = (x: unknown): x is PlanId => typeof x === 'string' && Object.prototype.hasOwnProperty.call(PLANS, x);
export const isProduct = (x: unknown): x is Product => x === 'pro' || x === 'pos';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (x: unknown): x is string => typeof x === 'string' && UUID.test(x);

// ── signatures ──────────────────────────────────────────────────────────────────────────────────────────────────────
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

/** Compares two strings without stopping at the first difference. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * Stripe webhook check: the Stripe-Signature header is "t=<unix seconds>,v1=<hex>[,v1=<hex>]"; v1 is the HMAC-SHA256 of
 * "<t>.<raw body>" with the endpoint's signing secret. A signature older or newer than the tolerance is refused (replay).
 */
export async function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowMs: number, toleranceSec = 300): Promise<boolean> {
  if (!header || !secret) return false;
  let t = '';
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim(); const v = part.slice(i + 1).trim();
    if (k === 't') t = v; else if (k === 'v1') v1.push(v);
  }
  const ts = Number(t);
  if (!Number.isInteger(ts) || ts <= 0 || v1.length === 0) return false;
  if (Math.abs(nowMs / 1000 - ts) > toleranceSec) return false;
  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`);
  return v1.some(s => safeEqual(s.toLowerCase(), expected));
}

/**
 * Billplz X Signature, as described in Billplz's documentation: every parameter except x_signature becomes "<key><value>",
 * the pieces are sorted ascending (case-insensitive) and joined with "|", and the HMAC-SHA256 (hex) of that text with the
 * account's X Signature key is the signature.
 * NOT PROVEN against the Billplz sandbox. The billing-webhook function never trusts a callback on this alone: it always
 * asks Billplz for the bill itself with the secret key before granting anything.
 */
export function billplzSourceString(params: Record<string, string>): string {
  return Object.entries(params)
    .filter(([k]) => k !== 'x_signature')
    .map(([k, v]) => `${k}${v}`)
    .sort((a, b) => { const x = a.toLowerCase(); const y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; })
    .join('|');
}
export async function verifyBillplzSignature(params: Record<string, string>, key: string): Promise<boolean> {
  const got = params.x_signature;
  if (!got || !key) return false;
  return safeEqual(got.toLowerCase(), await hmacSha256Hex(key, billplzSourceString(params)));
}

// ── sandbox guard ───────────────────────────────────────────────────────────────────────────────────────────────────
export const BILLPLZ_SANDBOX = 'https://www.billplz-sandbox.com';
export const BILLPLZ_LIVE = 'https://www.billplz.com';
export const stripeKeyMode = (k: string): 'test' | 'live' | 'unknown' => /^(sk|rk)_test_/.test(k) ? 'test' : /^(sk|rk)_live_/.test(k) ? 'live' : 'unknown';

/**
 * Why this configuration must be refused (or null when it is sandbox / test only). Live keys and the live Billplz address
 * are refused unless the owner set BILLING_ALLOW_LIVE=true on purpose.
 */
export function liveRefusal(c: { allowLive: boolean; stripeKey?: string; billplzBase?: string; playTestOnly?: boolean }): string | null {
  if (c.allowLive) return null;
  if (c.stripeKey && stripeKeyMode(c.stripeKey) !== 'test') return 'stripe-key-not-test';
  if (c.billplzBase && c.billplzBase.replace(/\/+$/, '') !== BILLPLZ_SANDBOX) return 'billplz-not-sandbox';
  return null;
}

/** Only an https address (or the app's own scheme) may be used as a return address after paying. */
export function safeReturnUrl(u: string | undefined): string | null {
  if (!u) return null;
  if (/^com\.jslproperties\.[a-z0-9.]+:\/\/\S*$/i.test(u)) return u;
  try { const p = new URL(u); return p.protocol === 'https:' && !p.username && !p.password ? p.toString() : null; } catch { return null; }
}

// ── provider answers → one change to apply ────────────────────────────────────────────────────────────────────────────
export interface Applied {
  provider: Provider; eventId: string; userId: string; kind: string;
  product: Product; planId: PlanId; status: Status; env: Env;
  /** An exact end of the paid period, when the provider says it. */
  periodEndMs?: number;
  /** One-time payment: add this many days to the current period (or to now when none is running). */
  extendDays?: number;
  cancelAtPeriodEnd: boolean;
  ref?: string; amountSen?: number; eventAtMs: number;
}
export type Mapped = { applied: Applied } | { ignored: string };

// deno-lint-ignore no-explicit-any
type J = any;
const str = (x: unknown): string => (typeof x === 'string' ? x : '');
const secToMs = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.round(x * 1000) : undefined);

const STRIPE_STATUS: Record<string, Status | undefined> = {
  trialing: 'trialing', active: 'active', past_due: 'past_due', unpaid: 'past_due', paused: 'canceled',
  canceled: 'expired', incomplete_expired: 'expired',
};

/** Stripe subscription events (created / updated / deleted). Other events change nothing. */
export function mapStripeEvent(ev: J): Mapped {
  const type = str(ev?.type);
  if (!/^customer\.subscription\.(created|updated|deleted)$/.test(type)) return { ignored: type || 'no-type' };
  const sub = ev?.data?.object;
  const md = sub?.metadata ?? {};
  const userId = str(md.user_id); const planId = md.plan_id;
  if (!isUuid(userId) || !isPlanId(planId)) return { ignored: 'no-app-metadata' };
  if (PLANS[planId].product !== md.product) return { ignored: 'plan-product-mismatch' };
  const status = type.endsWith('.deleted') ? 'expired' : STRIPE_STATUS[str(sub?.status)];
  if (!status) return { ignored: `status-${str(sub?.status) || 'none'}` };
  // Newer Stripe API versions keep the period on the subscription item, older ones on the subscription.
  const periodEndMs = secToMs(sub?.items?.data?.[0]?.current_period_end) ?? secToMs(sub?.current_period_end) ?? secToMs(sub?.trial_end);
  const id = str(ev?.id);
  if (!id) return { ignored: 'no-event-id' };
  return {
    applied: {
      provider: 'stripe', eventId: id, userId, kind: type, product: PLANS[planId].product, planId, status,
      env: ev?.livemode === true ? 'live' : 'sandbox', periodEndMs,
      cancelAtPeriodEnd: sub?.cancel_at_period_end === true, ref: str(sub?.id) || undefined,
      amountSen: undefined, eventAtMs: secToMs(ev?.created) ?? 0,
    },
  };
}

/**
 * A Billplz bill as read back from Billplz itself (never from the callback). Granted only when it is paid, in the right
 * collection, and for exactly the price this server holds for the plan.
 */
export function mapBillplzBill(bill: J, collectionId: string, env: Env): Mapped {
  const id = str(bill?.id);
  const userId = str(bill?.reference_1); const planId = bill?.reference_2;
  if (!id) return { ignored: 'no-bill-id' };
  if (!isUuid(userId) || !isPlanId(planId)) return { ignored: 'no-app-reference' };
  if (str(bill?.collection_id) !== collectionId) return { ignored: 'other-collection' };
  if (bill?.paid !== true || bill?.state !== 'paid') return { ignored: 'not-paid' };
  const plan = PLANS[planId];
  const amount = Number(bill?.paid_amount ?? bill?.amount);
  if (!Number.isInteger(amount) || amount !== plan.amountSen) return { ignored: 'amount-mismatch' };
  const paidAt = Date.parse(str(bill?.paid_at)) || 0;
  return {
    applied: {
      provider: 'fpx', eventId: id, userId, kind: 'billplz.bill.paid', product: plan.product, planId, status: 'active', env,
      extendDays: plan.days, cancelAtPeriodEnd: true, ref: id, amountSen: amount, eventAtMs: paidAt,
    },
  };
}

/**
 * Google Play subscription (subscriptionsv2 answer) for one purchase the phone sent. Access follows Google's state; a
 * licence-tester purchase (testPurchase present) is a sandbox purchase.
 */
export function mapPlaySubscription(sub: J, ctx: { userId: string; planId: PlanId; eventId: string }, nowMs: number): Mapped {
  const plan = PLANS[ctx.planId];
  const line = sub?.lineItems?.[0];
  if (str(line?.productId) !== ctx.planId) return { ignored: 'plan-mismatch' };
  const state = str(sub?.subscriptionState);
  const map: Record<string, Status | undefined> = {
    SUBSCRIPTION_STATE_ACTIVE: 'active', SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'past_due', SUBSCRIPTION_STATE_CANCELED: 'canceled',
    SUBSCRIPTION_STATE_ON_HOLD: 'expired', SUBSCRIPTION_STATE_PAUSED: 'expired', SUBSCRIPTION_STATE_EXPIRED: 'expired',
  };
  const status = map[state];
  if (!status) return { ignored: `state-${state || 'none'}` };
  const periodEndMs = Date.parse(str(line?.expiryTime)) || undefined;
  return {
    applied: {
      provider: 'google_play', eventId: ctx.eventId, userId: ctx.userId, kind: `play.${state.replace('SUBSCRIPTION_STATE_', '').toLowerCase()}`,
      product: plan.product, planId: ctx.planId, status, env: sub?.testPurchase ? 'sandbox' : 'live',
      periodEndMs, cancelAtPeriodEnd: line?.autoRenewingPlan?.autoRenewEnabled === false || status === 'canceled', ref: str(sub?.latestOrderId) || undefined, eventAtMs: nowMs,
    },
  };
}

/** Parameters for the database function that applies one change (see supabase/proposed/20261028000000_billing_sandbox.sql). */
export function applyParams(a: Applied): Record<string, unknown> {
  return {
    p_provider: a.provider, p_event_id: a.eventId, p_user: a.userId, p_kind: a.kind, p_product: a.product, p_plan: a.planId,
    p_status: a.status, p_env: a.env, p_period_end: a.periodEndMs ? new Date(a.periodEndMs).toISOString() : null,
    p_extend_days: a.extendDays ?? null, p_cancel_at_end: a.cancelAtPeriodEnd, p_ref: a.ref ?? null, p_amount_sen: a.amountSen ?? null,
    p_event_at: new Date(a.eventAtMs || Date.now()).toISOString(),
  };
}

// ── Google service-account sign-in (Play Developer API) ──────────────────────────────────────────────────────────────
const b64url = (b: ArrayBuffer | string) => {
  const bytes = typeof b === 'string' ? enc.encode(b) : new Uint8Array(b);
  let s = ''; for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
/** A signed JWT (RS256) that a Google service account trades for an access token. */
export async function googleServiceJwt(clientEmail: string, privateKeyPem: string, scope: string, nowSec: number, aud = 'https://oauth2.googleapis.com/token'): Promise<string> {
  const der = Uint8Array.from(atob(privateKeyPem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: clientEmail, scope, aud, iat: nowSec, exp: nowSec + 3300 }));
  return `${head}.${body}.${b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${head}.${body}`)))}`;
}
