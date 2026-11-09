// Shared, pure billing logic for the two billing server functions (billing, billing-webhook). No Deno or network calls
// here, so the unit tests run it under Node. SANDBOX / TEST MODE ONLY for now: nothing in this file moves real money, and
// liveRefusal() makes the functions refuse any live key unless BILLING_ALLOW_LIVE=true is set by the owner.
//
// The price list below is the ONLY price the server trusts. The phone never sends an amount. The amounts are PROPOSALS
// (docs/MONETISATION_PLAN.md) until the owner approves them; app/src/billing/plans.ts has a copy, and a test keeps the two
// the same.

// Batch A (30 Oct 2026): 'news' = Market News and Intelligence access, USD 1 a month / USD 9 a year, Google Play ONLY.
// The Play Console subscription product ids MUST equal these plan ids (news_monthly, news_yearly): play_verify grants only
// when Google's answer names exactly the plan id the phone asked for.
export type Product = 'pro' | 'pos' | 'news';
export type PlanId = 'pro_monthly' | 'pro_yearly' | 'pos_monthly' | 'news_monthly' | 'news_yearly';
export type Status = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
export type Provider = 'trial' | 'fpx' | 'stripe' | 'google_play';
export type Env = 'sandbox' | 'live';

/** amountSen: the amount in the plan's currency's smallest unit (sen for MYR, the default; cents for USD). */
export interface PlanDef { id: PlanId; product: Product; interval: 'month' | 'year'; amountSen: number; days: number; currency?: 'MYR' | 'USD' }
export const PLANS: Record<PlanId, PlanDef> = {
  pro_monthly: { id: 'pro_monthly', product: 'pro', interval: 'month', amountSen: 4900, days: 30 },
  pro_yearly: { id: 'pro_yearly', product: 'pro', interval: 'year', amountSen: 49000, days: 365 },
  pos_monthly: { id: 'pos_monthly', product: 'pos', interval: 'month', amountSen: 3900, days: 30 },
  news_monthly: { id: 'news_monthly', product: 'news', interval: 'month', amountSen: 100, days: 30, currency: 'USD' },
  news_yearly: { id: 'news_yearly', product: 'news', interval: 'year', amountSen: 900, days: 365, currency: 'USD' },
};
export const TRIAL_DAYS = 14;
export const isPlanId = (x: unknown): x is PlanId => typeof x === 'string' && Object.prototype.hasOwnProperty.call(PLANS, x);
export const isProduct = (x: unknown): x is Product => x === 'pro' || x === 'pos' || x === 'news';
/** Products with the server's free trial. 'news' has none (the owner asked for paid access only). */
export const isTrialProduct = (x: unknown): x is 'pro' | 'pos' => x === 'pro' || x === 'pos';
/** May this plan be paid by card (Stripe) or FPX (Billplz)? Only the MYR Pro / POS plans; 'news' is Google Play only. */
export const webPayable = (id: PlanId): boolean => PLANS[id].product !== 'news' && (PLANS[id].currency ?? 'MYR') === 'MYR';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (x: unknown): x is string => typeof x === 'string' && UUID.test(x);

// ── Batch B (3 Nov 2026): Ai Buddy Tokens ─────────────────────────────────────────────────────────────────────────
// 1 token = USD 0.25 (owner's price). Sold in four packs as Google Play ONE-TIME (in-app, consumable) products, Google Play
// only. The Play Console product ids MUST equal these pack ids. The token count and price come from this list only (and the
// database function holds the same list and refuses anything else); the phone never sends an amount or a token count.
export type PackId = 'tokens_20' | 'tokens_100' | 'tokens_400' | 'tokens_1000';
export interface PackDef { id: PackId; tokens: number; amountCents: number; currency: 'USD' }
export const TOKEN_USD_CENTS = 25;
export const TOKEN_PACKS: Record<PackId, PackDef> = {
  tokens_20: { id: 'tokens_20', tokens: 20, amountCents: 500, currency: 'USD' },
  tokens_100: { id: 'tokens_100', tokens: 100, amountCents: 2500, currency: 'USD' },
  tokens_400: { id: 'tokens_400', tokens: 400, amountCents: 10000, currency: 'USD' },
  tokens_1000: { id: 'tokens_1000', tokens: 1000, amountCents: 25000, currency: 'USD' },
};
export const isPackId = (x: unknown): x is PackId => typeof x === 'string' && Object.prototype.hasOwnProperty.call(TOKEN_PACKS, x);

export interface TokenCredit { userId: string; packId: PackId; tokens: number; amountCents: number; env: Env; ref: string; consumed: boolean }
export type TokenMapped = { credit: TokenCredit } | { ignored: string };

/**
 * Google Play one-time purchase (purchases.products.get answer) for one token pack the phone says it bought. Credited only
 * when Google says it is purchased (not pending, not cancelled), for exactly this pack, quantity 1. A licence-tester purchase
 * (purchaseType 0) is a sandbox purchase. ref is a hash of the purchase token: the same purchase never credits twice.
 */
export function mapPlayProduct(p: J, ctx: { userId: string; packId: PackId; ref: string }): TokenMapped {
  const pack = TOKEN_PACKS[ctx.packId];
  if (p?.productId !== undefined && str(p.productId) !== ctx.packId) return { ignored: 'pack-mismatch' };
  const state = p?.purchaseState;
  if (state === 1) return { ignored: 'canceled' };
  if (state === 2) return { ignored: 'pending' };
  if (state !== 0) return { ignored: 'not-purchased' };
  const qty = p?.quantity === undefined ? 1 : Number(p.quantity);
  if (qty !== 1) return { ignored: 'quantity' };
  return {
    credit: {
      userId: ctx.userId, packId: ctx.packId, tokens: pack.tokens, amountCents: pack.amountCents,
      env: p?.purchaseType === 0 ? 'sandbox' : 'live', ref: ctx.ref, consumed: p?.consumptionState === 1,
    },
  };
}

/** Parameters for eab_tokens_credit (supabase/proposed/20261103000000_tokens_sandbox.sql). */
export function creditParams(c: TokenCredit): Record<string, unknown> {
  return { p_user: c.userId, p_pack: c.packId, p_tokens: c.tokens, p_amount_cents: c.amountCents, p_env: c.env, p_provider: 'google_play', p_ref: c.ref };
}

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
  if (!webPayable(planId)) return { ignored: 'not-a-card-plan' };
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
  if (!webPayable(planId)) return { ignored: 'not-an-fpx-plan' };
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

// ── Batch 5 (9 Nov 2026): Google Play real-time developer notifications (RTDN) ──────────────────────────────────────
// Google Play sends them through Google Cloud Pub/Sub, which POSTs { message: { data: base64(JSON) } } to billing-webhook
// ?p=google_play. A notice is only a nudge: billing-webhook reads the purchase back from Google before changing anything,
// and only for a purchase already linked to an agent (eab_play_purchases). Nothing in the notice itself is trusted.
export type PlayNotice =
  | { kind: 'test' }
  | { kind: 'subscription'; token: string; productId: string; type: number }
  | { kind: 'voided'; token: string; productType: number; orderId: string }
  | { kind: 'other'; what: string };
const PLAY_TOKEN = /^[\w.-]{20,4000}$/;

/** The decoded notice, or why it cannot be used. packageName must be this app's package. */
export function parsePlayNotice(body: J, packageName: string): PlayNotice | { bad: string } {
  const data = str(body?.message?.data);
  if (!data) return { bad: 'no-data' };
  let n: J;
  try { n = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(data.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)))); }
  catch { return { bad: 'not-json' }; }
  if (!packageName || str(n?.packageName) !== packageName) return { bad: 'other-package' };
  if (n?.testNotification) return { kind: 'test' };
  const s = n?.subscriptionNotification;
  if (s) {
    if (!PLAY_TOKEN.test(str(s.purchaseToken))) return { bad: 'token' };
    return { kind: 'subscription', token: s.purchaseToken, productId: str(s.subscriptionId), type: Number(s.notificationType) || 0 };
  }
  const v = n?.voidedPurchaseNotification;
  if (v) {
    if (!PLAY_TOKEN.test(str(v.purchaseToken))) return { bad: 'token' };
    return { kind: 'voided', token: v.purchaseToken, productType: Number(v.productType) || 0, orderId: str(v.orderId) };
  }
  if (n?.oneTimeProductNotification) return { kind: 'other', what: 'one-time-product' };   // the phone's tokens_verify handles purchases
  return { kind: 'other', what: 'unknown' };
}

/** The ledger reference of a token-pack purchase (same as the billing function's tokens_verify). */
export const tokenPurchaseRef = (tokenHashHex: string) => `gp:${tokenHashHex.slice(0, 40)}`;
/** The event id of one state of one Google Play subscription (same as play_verify, so the two never apply it twice). */
export const playSubEventId = (tokenHashHex: string, latestOrderId: string, state: string) => `${tokenHashHex.slice(0, 32)}:${latestOrderId}:${state}`;
