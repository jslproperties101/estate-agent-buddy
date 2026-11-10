// Batch C: the phone's side of the lookup server function (supabase/functions/lookup). The phone never talks to Oneharta
// and never holds its key: it names a lookup and its fields; the server takes the tokens, asks Oneharta, gives back what
// was not charged, and answers. Results are shown on screen and kept only in memory (never saved on the phone or synced).
import type { Store } from '../data/store';
import { configured, fresh, supabaseHeaders, type SyncConfig } from '../data/sync';
import { rpc } from '../team/api';

type FetchFn = typeof fetch;
export type PaidKind = 'infosearch' | 'ct_search' | 'company' | 'sale_search' | 'sale_unlock' | 'rental_search' | 'rental_unlock';
export type FreeKind = 'ct_states' | 'ct_districts' | 'ct_mukims' | 'ct_sections';

/** The most each lookup can cost in tokens (3 per Oneharta credit). The server decides; this is what the screen shows first. */
export const MAX_TOKENS: Record<PaidKind, number> = { infosearch: 3, ct_search: 9, company: 9, sale_search: 3, sale_unlock: 9, rental_search: 3, rental_unlock: 9 };

export class LookupError extends Error {
  constructor(public code: 'not-configured' | 'not-signed-in' | 'network' | 'not-enough-tokens' | 'agent-limit' | 'app-limit' | 'busy' | 'no-answer' | 'refused' | 'bad-request' | 'other',
    message?: string, public detail: Record<string, unknown> = {}) { super(message ?? code); }
}

export type PaidAnswer<T = Record<string, unknown>> = { lookupId: string; tokensCharged: number; balance?: number; costChecked: boolean; result: T };

async function call<T>(store: Store, cfg: SyncConfig, body: Record<string, unknown>, fetchFn: FetchFn): Promise<T> {
  if (!configured(cfg)) throw new LookupError('not-configured');
  const s0 = store.getState().meta.syncSession;
  if (!s0) throw new LookupError('not-signed-in');
  let r: Response;
  try {
    const s = await fresh(cfg, s0, fetchFn);
    if (s !== s0) store.setSingleton('meta', { syncSession: s });
    r = await fetchFn(`${cfg.supabaseUrl}/functions/v1/lookup`, { method: 'POST', headers: supabaseHeaders(cfg, s.accessToken), body: JSON.stringify(body) });
  } catch { throw new LookupError('network'); }
  const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
  if (r.ok) return j as T;
  const e = typeof j?.error === 'string' ? j.error : '';
  const detail = j ?? {};
  if (r.status === 404 && !j) throw new LookupError('not-configured');   // the function is not deployed
  if (r.status === 503 || e === 'not-configured') throw new LookupError('not-configured');
  if (r.status === 401) throw new LookupError('not-signed-in');
  if (e === 'not-enough-tokens') throw new LookupError('not-enough-tokens', e, detail);
  if (e === 'agent-limit' || e === 'app-limit') throw new LookupError(e, e, detail);
  if (e === 'no-answer') throw new LookupError('no-answer', e, detail);
  if (r.status === 429) throw new LookupError('busy', e, detail);
  if (r.status === 400) throw new LookupError('bad-request', e, detail);
  throw new LookupError('refused', e || `${r.status}`, detail);   // Oneharta's own sentence, shown as it is
}

export const paidLookup = <T = Record<string, unknown>>(store: Store, cfg: SyncConfig, kind: PaidKind, fields: Record<string, unknown>, fetchFn: FetchFn = fetch) =>
  call<PaidAnswer<T>>(store, cfg, { ...fields, action: kind }, fetchFn);
export const freeList = <T = Record<string, unknown>>(store: Store, cfg: SyncConfig, kind: FreeKind, fields: Record<string, unknown> = {}, fetchFn: FetchFn = fetch) =>
  call<{ result: T }>(store, cfg, { ...fields, action: kind }, fetchFn).then(a => a.result);
export const reopenLandTax = (store: Store, cfg: SyncConfig, lookupId: string, fetchFn: FetchFn = fetch) =>
  call<{ result: Record<string, unknown> }>(store, cfg, { action: 'ct_record', lookupId }, fetchFn).then(a => a.result);
export type CompanyStatus = { status: 'pending' } | { status: 'no-data'; refunded: number } | { status: 'ready'; result: Record<string, unknown> };
export const companyStatus = (store: Store, cfg: SyncConfig, lookupId: string, fetchFn: FetchFn = fetch) =>
  call<CompanyStatus>(store, cfg, { action: 'company_status', lookupId }, fetchFn);

export interface LookupRow { id: string; kind: PaidKind; summary: string; status: string; tokens: number; reopen: boolean; created_at: string }
/** The agent's own last 30 lookups (what they were and what they cost; never the results). */
export async function myLookups(store: Store, cfg: SyncConfig, fetchFn: FetchFn = fetch): Promise<LookupRow[]> {
  const j = await rpc<unknown>(store, cfg, 'eab_my_lookups', {}, fetchFn);
  return Array.isArray(j) ? (j as LookupRow[]).filter(r => r && typeof r.id === 'string' && typeof r.summary === 'string') : [];
}
