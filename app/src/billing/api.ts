// Billing: the phone's side of the billing server functions (supabase/functions/billing). The phone never holds a payment
// provider key and never sends a price: it names a plan and a provider, and the server answers with a page address to open.
// Until the functions are deployed with the TEST keys every call answers "not-configured" and nothing pretends to be paid.
import type { Store } from '../data/store';
import { fresh, supabaseCall, supabaseHeaders, SyncError, configured, type SyncConfig } from '../data/sync';
import { rpc, TeamError } from '../team/api';
import { resolveEntitlement, type BillingRow, type Entitlement } from './entitlement';
import type { PayProvider, PlanId, Product } from './plans';

type FetchFn = typeof fetch;
export class BillingError extends Error {
  constructor(public code: 'not-configured' | 'not-signed-in' | 'network' | 'refused' | 'not-linked' | 'other', message?: string) { super(message ?? code); }
}

export type CheckoutAnswer = { url: string; env: 'sandbox' | 'live' };
export type TrialAnswer = { result: 'started' | 'already-used' | 'unknown-user' };
export type PlayAnswer = { result: string; status: string; env: 'sandbox' | 'live' };

async function call<T>(store: Store, cfg: SyncConfig, body: Record<string, unknown>, fetchFn: FetchFn): Promise<T> {
  if (!configured(cfg)) throw new BillingError('not-configured');
  const s0 = store.getState().meta.syncSession;
  if (!s0) throw new BillingError('not-signed-in');
  try {
    const s = await fresh(cfg, s0, fetchFn);
    if (s !== s0) store.setSingleton('meta', { syncSession: s });
    const r = await supabaseCall(fetchFn, `${cfg.supabaseUrl}/functions/v1/billing`, { method: 'POST', headers: supabaseHeaders(cfg, s.accessToken), body: JSON.stringify(body) });
    return (await r.json()) as T;
  } catch (e) {
    if (e instanceof BillingError) throw e;
    if (e instanceof SyncError) {
      if (e.code === 'network') throw new BillingError('network');
      if (/^404\b/.test(e.message) || /not-configured/.test(e.message)) throw new BillingError('not-configured');
      if (/not-linked/.test(e.message)) throw new BillingError('not-linked');
      throw new BillingError('refused', e.message);
    }
    throw new BillingError('other', String(e));
  }
}

export const startCheckout = (store: Store, cfg: SyncConfig, provider: 'stripe' | 'fpx', planId: PlanId, fetchFn: FetchFn = fetch) =>
  call<CheckoutAnswer>(store, cfg, { action: 'checkout', provider, planId }, fetchFn);
export const startTrial = (store: Store, cfg: SyncConfig, product: Product, fetchFn: FetchFn = fetch) =>
  call<TrialAnswer>(store, cfg, { action: 'trial', product }, fetchFn);
export const verifyPlayPurchase = (store: Store, cfg: SyncConfig, planId: PlanId, purchaseToken: string, fetchFn: FetchFn = fetch) =>
  call<PlayAnswer>(store, cfg, { action: 'play_verify', planId, purchaseToken }, fetchFn);

const PROVIDERS: PayProvider[] = ['stripe', 'fpx', 'google_play'];
const isRow = (r: unknown): r is BillingRow => {
  const x = r as Record<string, unknown> | null;
  return !!x && (x.product === 'pro' || x.product === 'pos') && typeof x.status === 'string'
    && (x.provider === 'trial' || PROVIDERS.includes(x.provider as PayProvider)) && (x.env === 'sandbox' || x.env === 'live');
};

/** Reads this account's plans from the database and keeps them (for the account signed in now). False when nothing could be read. */
export async function refreshBilling(store: Store, cfg: SyncConfig, fetchFn: FetchFn = fetch): Promise<boolean> {
  const s = store.getState().meta.syncSession;
  if (!s || !configured(cfg)) return false;
  try {
    const j = await rpc<unknown>(store, cfg, 'eab_my_billing', {}, fetchFn);
    if (store.getState().meta.syncSession?.userId !== s.userId) return false;   // signed out or switched meanwhile
    store.setSingleton('meta', { billing: { userId: s.userId, rows: Array.isArray(j) ? j.filter(isRow) : [], at: Date.now() } });
    return true;
  } catch (e) {
    // The function is not on this database: no plans (the app as before). Offline or refused: keep the last answer.
    if (e instanceof TeamError && e.code === 'unavailable') store.setSingleton('meta', { billing: { userId: s.userId, rows: [], at: Date.now() } });
    return false;
  }
}

/** The plans last heard for the person signed in now (another account's are never used). */
export function cachedRows(store: Store): BillingRow[] {
  const st = store.getState(); const b = st.meta.billing; const me = st.meta.syncSession?.userId;
  return b && me && b.userId === me ? b.rows : [];
}
export const cachedEntitlement = (store: Store, now = Date.now()): Entitlement => resolveEntitlement(cachedRows(store), now);
