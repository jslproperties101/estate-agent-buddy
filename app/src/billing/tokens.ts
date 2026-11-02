// Batch B: the Ai Buddy Token wallet on the phone (SANDBOX / TEST MODE ONLY). 1 token = USD 0.25, bought in packs through
// Google Play (one-time products). The phone never decides how many tokens anyone has:
//   buy      Google Play sells the pack -> the server checks the purchase with Google, credits the pack's tokens once in the
//            database and consumes the purchase -> the phone reads the balance back from the database.
//   restore  asks Google Play for purchases that were paid but never reached the server (no connection, app closed) and sends
//            each one to the server; a purchase already credited is only consumed, never credited again.
//   refresh  reads the balance and the last 20 changes (eab_my_tokens).
// Spending tokens (Oneharta lookups) is Batch C.
import type { Store } from '../data/store';
import type { SyncConfig } from '../data/sync';
import { configured } from '../data/sync';
import { plugin } from '../native/native';
import { rpc, TeamError } from '../team/api';
import { BillingError, verifyTokenPurchase, type TokenAnswer } from './api';
import { BILLING_LIVE, packById, TOKEN_PACKS } from './plans';
import { availability, sha256Hex, type PlayBillingPlugin } from './providers';

type FetchFn = typeof fetch;
type Env = 'sandbox' | 'live';

export interface TokenEntry { delta: number; kind: 'purchase' | 'spend' | 'refund' | 'adjust'; pack_id: string | null; env: Env; created_at: string }
export interface TokenCache { userId: string; balances: Partial<Record<Env, number>>; history: TokenEntry[]; at: number }

/** Which balance counts: test-mode tokens while billing is not live, real ones once it is (they never mix). */
export const walletEnv = (live: boolean = BILLING_LIVE): Env => (live ? 'live' : 'sandbox');

const KINDS = ['purchase', 'spend', 'refund', 'adjust'];
const isEntry = (x: unknown): x is TokenEntry => {
  const e = x as Record<string, unknown> | null;
  return !!e && Number.isInteger(e.delta) && KINDS.includes(e.kind as string) && (e.env === 'sandbox' || e.env === 'live') && typeof e.created_at === 'string';
};
const count = (x: unknown): number | undefined => (Number.isInteger(x) && (x as number) >= 0 ? (x as number) : undefined);

/** Reads this account's wallet from the database and keeps it. False when nothing could be read (the last answer stays). */
export async function refreshTokens(store: Store, cfg: SyncConfig, fetchFn: FetchFn = fetch): Promise<boolean> {
  const s = store.getState().meta.syncSession;
  if (!s || !configured(cfg)) return false;
  try {
    const j = await rpc<{ balances?: Record<string, unknown>; history?: unknown[] } | null>(store, cfg, 'eab_my_tokens', {}, fetchFn);
    if (store.getState().meta.syncSession?.userId !== s.userId) return false;   // signed out or switched meanwhile
    const b = j?.balances ?? {};
    const balances: TokenCache['balances'] = {};
    for (const env of ['sandbox', 'live'] as const) { const n = count(b[env]); if (n !== undefined) balances[env] = n; }
    store.setSingleton('meta', { tokens: { userId: s.userId, balances, history: (Array.isArray(j?.history) ? j!.history : []).filter(isEntry).slice(0, 20), at: Date.now() } });
    return true;
  } catch (e) {
    // The wallet is not on this database yet: an empty wallet. Offline or refused: keep the last answer.
    if (e instanceof TeamError && e.code === 'unavailable') store.setSingleton('meta', { tokens: { userId: s.userId, balances: {}, history: [], at: Date.now() } });
    return false;
  }
}

/** The wallet last heard for the person signed in now (another account's is never shown). */
export function cachedTokens(store: Store): TokenCache | undefined {
  const st = store.getState(); const t = st.meta.tokens; const me = st.meta.syncSession?.userId;
  return t && me && t.userId === me ? t : undefined;
}
export const tokenBalance = (store: Store, live: boolean = BILLING_LIVE): number => cachedTokens(store)?.balances[walletEnv(live)] ?? 0;

function playPlugin(store: Store): { pb: PlayBillingPlugin; me: string } {
  const a = availability('google_play');
  if (!a.ok) throw new BillingError('other', a.reason);
  const me = store.getState().meta.syncSession?.userId;
  if (!me) throw new BillingError('not-signed-in');
  const pb = plugin<PlayBillingPlugin>('PlayBilling');
  if (!pb) throw new BillingError('other', 'plugin-missing');
  return { pb, me };
}

export type BuyResult = { kind: 'credited'; tokens: number; env: Env } | { kind: 'already' } | { kind: 'pending' };
const asResult = (a: TokenAnswer): BuyResult => {
  if (a.reason === 'pending') return { kind: 'pending' };
  if (a.result === 'applied' && typeof a.tokens === 'number') return { kind: 'credited', tokens: a.tokens, env: a.env === 'live' ? 'live' : 'sandbox' };
  if (a.result === 'duplicate') return { kind: 'already' };
  throw new BillingError('refused', a.error ?? a.result ?? 'no answer');
};

/** Buys one pack through Google Play, then lets the server check and credit it. The tokens come from the server's answer. */
export async function buyTokens(store: Store, cfg: SyncConfig, packId: string, fetchFn: FetchFn = fetch): Promise<BuyResult> {
  const pack = packById(packId);
  if (!pack || !TOKEN_PACKS.includes(pack)) throw new BillingError('other', 'unknown pack');
  const { pb, me } = playPlugin(store);
  // The purchase carries a hash of the agent's id; the server only credits a purchase made for the agent who sends it.
  const { purchaseToken } = await pb.purchase({ productId: pack.id, obfuscatedAccountId: await sha256Hex(me), type: 'inapp' });
  const r = asResult(await verifyTokenPurchase(store, cfg, pack.id, purchaseToken, fetchFn));
  await refreshTokens(store, cfg, fetchFn);
  return r;
}

/**
 * Sends every token-pack purchase Google Play still holds to the server (paid, but never credited or never consumed), then
 * reads the wallet again. Answers how many tokens were added now. A purchase that fails is left for the next try.
 */
export async function restoreTokens(store: Store, cfg: SyncConfig, fetchFn: FetchFn = fetch): Promise<{ added: number; checked: number; failed: number }> {
  const { pb } = playPlugin(store);
  if (!pb.owned) throw new BillingError('other', 'plugin-missing');
  const { purchases } = await pb.owned({ type: 'inapp' });
  let added = 0; let checked = 0; let failed = 0;
  for (const p of purchases ?? []) {
    if (!packById(p.productId)) continue;   // not one of our packs
    checked++;
    try { const r = asResult(await verifyTokenPurchase(store, cfg, p.productId, p.purchaseToken, fetchFn)); if (r.kind === 'credited') added += r.tokens; }
    catch { failed++; }
  }
  await refreshTokens(store, cfg, fetchFn);
  return { added, checked, failed };
}
