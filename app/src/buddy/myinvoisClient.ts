// Buddy POS AI: the phone's side of LHDN MyInvois. The phone never holds LHDN credentials: it asks the company's own
// server function (supabase/functions/myinvois) to sign and send the document, and saves only what that function answers.
// Until the function is deployed with the MyInvois sandbox credentials, every call answers "not-configured" and the
// e-Invoice stays Ready to submit; nothing pretends it was sent.
import type { Store } from '../data/store';
import { fresh, supabaseCall, supabaseHeaders, SyncError, configured, type SyncConfig } from '../data/sync';
import type { AcctEinvoice, AcctProfile } from './model';
import { buildUBL } from './einvoice';

type FetchFn = typeof fetch;
export class MyinvoisError extends Error { constructor(public code: 'not-configured' | 'not-signed-in' | 'network' | 'refused' | 'other', message?: string) { super(message ?? code); } }

export interface SubmitAnswer { status: 'submitted' | 'valid' | 'invalid'; submissionUid?: string; uuid?: string; longId?: string; errors?: string[]; env: 'preprod' | 'prod' }
export interface StatusAnswer { status: 'submitted' | 'valid' | 'invalid' | 'cancelled'; uuid?: string; longId?: string; errors?: string[] }

async function call<T>(store: Store, cfg: SyncConfig, body: Record<string, unknown>, fetchFn: FetchFn): Promise<T> {
  if (!configured(cfg)) throw new MyinvoisError('not-configured');
  const s0 = store.getState().meta.syncSession;
  if (!s0) throw new MyinvoisError('not-signed-in');
  try {
    const s = await fresh(cfg, s0, fetchFn);
    if (s !== s0) store.setSingleton('meta', { syncSession: s });
    const r = await supabaseCall(fetchFn, `${cfg.supabaseUrl}/functions/v1/myinvois`, { method: 'POST', headers: supabaseHeaders(cfg, s.accessToken), body: JSON.stringify(body) });
    return (await r.json()) as T;
  } catch (e) {
    if (e instanceof MyinvoisError) throw e;
    if (e instanceof SyncError) {
      if (e.code === 'network') throw new MyinvoisError('network');
      if (e.code === 'auth') throw new MyinvoisError('refused', e.message);
      if (/^404\b/.test(e.message) || /not-configured/.test(e.message)) throw new MyinvoisError('not-configured');
      throw new MyinvoisError('refused', e.message);
    }
    throw new MyinvoisError('other', String(e));
  }
}

export const submitEinvoice = (store: Store, cfg: SyncConfig, e: AcctEinvoice, co: AcctProfile, fetchFn: FetchFn = fetch) =>
  call<SubmitAnswer>(store, cfg, { action: 'submit', codeNumber: e.refNo, document: buildUBL(e, co) }, fetchFn);
export const einvoiceStatus = (store: Store, cfg: SyncConfig, e: AcctEinvoice, fetchFn: FetchFn = fetch) =>
  call<StatusAnswer>(store, cfg, { action: 'status', uuid: e.uuid, submissionUid: e.submissionUid }, fetchFn);
export const cancelEinvoice = (store: Store, cfg: SyncConfig, e: AcctEinvoice, reason: string, fetchFn: FetchFn = fetch) =>
  call<{ status: 'cancelled' }>(store, cfg, { action: 'cancel', uuid: e.uuid, reason }, fetchFn);

/** The e-Invoice after an answer from the function (status fields only; its content never changes). */
export function applyAnswer(e: AcctEinvoice, a: SubmitAnswer | StatusAnswer, now: number): AcctEinvoice {
  const env = 'env' in a ? a.env : e.env;
  return {
    ...e, status: a.status, env,
    submissionUid: ('submissionUid' in a && a.submissionUid) || e.submissionUid,
    uuid: a.uuid ?? e.uuid, longId: a.longId ?? e.longId,
    submittedAt: e.submittedAt ?? now,
    validatedAt: a.status === 'valid' ? e.validatedAt ?? now : e.validatedAt,
    cancelledAt: a.status === 'cancelled' ? now : e.cancelledAt,
    errors: a.status === 'invalid' ? a.errors ?? [] : undefined,
  };
}
