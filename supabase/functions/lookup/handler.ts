// Batch C: Oneharta lookups for the signed-in agent, paid with Ai Buddy Tokens (_shared/oneharta.ts has the prices and the
// rules). Called by the app with the agent's sign-in token. Actions (body.action):
//   prices                      free: what each lookup costs in tokens, and today's limits
//   ct_states, ct_districts, ct_mukims, ct_sections, sale_projects, rental_projects
//                               free: the dropdown lists, passed through from Oneharta
//   infosearch, ct_search, company, sale_search, sale_unlock, rental_search, rental_unlock
//                               paid: the most it can cost is taken from the agent's tokens first; Oneharta is asked; then
//                               3 tokens per credit really charged are kept and the rest given back at once
//   ct_record {lookupId}        free: reopens a land tax record this agent bought
//   company_status {lookupId}   free: the state of a company search this agent paid for, its details once ready; if Oneharta
//                               found no data (and refunded its credits) the agent's tokens are given back too
// Oneharta answers are passed to the agent as they are (they need them), but NOTHING personal is stored: the database keeps
// only the kind of lookup, a short note, the cost and the Oneharta reference. The API key never leaves this server.
import { isUuid } from '../_shared/billing.ts';
import {
  CREDITS_MAX, ONEHARTA_BASE, TOKENS_PER_CREDIT, buildFree, buildPaid, creditsCharged, isFreeKind, isPaidKind, recordRef, type PaidKind,
} from '../_shared/oneharta.ts';

export interface Deps { env: (k: string) => string; fetch: typeof fetch; now: () => number }

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
const str = (x: unknown) => (typeof x === 'string' ? x : '');
const posInt = (x: string, dflt: number) => { const n = Number(x); return x !== '' && Number.isInteger(n) && n >= 0 ? n : dflt; };

function config(d: Deps) {
  const allowLive = d.env('BILLING_ALLOW_LIVE') === 'true';
  return {
    env: (allowLive ? 'live' : 'sandbox') as 'sandbox' | 'live',
    url: d.env('SUPABASE_URL').replace(/\/+$/, ''), anon: d.env('SUPABASE_ANON_KEY'), service: d.env('SUPABASE_SERVICE_ROLE_KEY'),
    key: d.env('ONEHARTA_API_KEY'), base: (d.env('ONEHARTA_BASE_URL') || ONEHARTA_BASE).replace(/\/+$/, ''),
    // Daily limits in Oneharta credits (Malaysia day). Defaults: 30 per agent (MYR 37.50), 100 for the whole app (MYR 125).
    agentCap: posInt(d.env('ONEHARTA_AGENT_DAILY_CREDITS'), 30), appCap: posInt(d.env('ONEHARTA_APP_DAILY_CREDITS'), 100),
  };
}
type Cfg = ReturnType<typeof config>;

async function signedInUser(d: Deps, c: Cfg, req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') ?? '';
  if (!/^Bearer\s+\S+$/.test(auth) || !c.url) return null;
  const r = await d.fetch(`${c.url}/auth/v1/user`, { headers: { authorization: auth, apikey: c.anon } });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return isUuid(u?.id) ? u.id : null;
}

async function rpc(d: Deps, c: Cfg, name: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const r = await d.fetch(`${c.url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: c.service, authorization: `Bearer ${c.service}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`rpc ${name} ${r.status}`);
  return (await r.json()) as Record<string, unknown> | null;
}

/** One call to Oneharta. 'no-answer' when the call never got an answer (the cost is then unknown). */
async function oneharta(d: Deps, c: Cfg, method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; ok: boolean; body: unknown } | 'no-answer'> {
  try {
    const r = await d.fetch(`${c.base}${path}`, {
      method, headers: { authorization: `Bearer ${c.key}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, ok: r.ok, body: await r.json().catch(() => null) };
  } catch { return 'no-answer'; }
}

/** Oneharta's own error sentence (it is written to be shown as it is), or a plain one. */
const ohError = (b: unknown, status: number) => {
  const e = str((b as Record<string, unknown> | null)?.error) || str((b as Record<string, unknown> | null)?.message);
  return e.slice(0, 300) || (status === 429 ? 'Oneharta is busy; try again in a minute.' : `Oneharta answered ${status}.`);
};

/** Is there anything in this answer (a found record, results, a submitted company)? */
function found(kind: PaidKind, b: Record<string, unknown> | null): boolean {
  if (!b) return false;
  if (kind === 'ct_search') return b.record != null || b.selectionRequired === true;
  if (kind === 'infosearch' || kind === 'sale_search' || kind === 'rental_search') return Array.isArray(b.results) && b.results.length > 0;
  if (kind === 'company') return Number(b.submitted) > 0;
  return true;   // an unlock that answered ok
}

async function paid(d: Deps, c: Cfg, user: string, kind: PaidKind, body: Record<string, unknown>): Promise<Response> {
  const call = buildPaid(kind, body);
  if (typeof call === 'string') return json({ error: call }, 400);
  // A Cukai Tanah lot that matches several titles answers a free list of choices; the second call (with choiceId) is paid.
  const begin = await rpc(d, c, 'eab_lookup_begin', {
    p_user: user, p_env: c.env, p_kind: kind, p_credits_max: call.creditsMax, p_summary: call.summary, p_agent_cap: c.agentCap, p_global_cap: c.appCap,
  });
  if (begin?.result !== 'ok' || !isUuid(begin.id)) {
    const r = str(begin?.result) || 'refused';
    return json({ error: r, balance: begin?.balance, needed: begin?.needed }, r === 'not-enough-tokens' ? 402 : 429);
  }
  const id = begin.id as string;
  const a = await oneharta(d, c, call.method, call.path, call.body);
  if (a === 'no-answer') {
    // We cannot know whether Oneharta charged: the tokens stay held and the lookup is marked for the owner to check.
    await rpc(d, c, 'eab_lookup_finish', { p_id: id, p_credits: null, p_status: 'unknown', p_ref: null });
    return json({ error: 'no-answer', lookupId: id, tokensHeld: begin.held }, 504);
  }
  const b = a.body as Record<string, unknown> | null;
  const cost = creditsCharged(b, a.ok, call.creditsMax);
  const status = !a.ok ? 'failed' : found(kind, b) ? 'done' : 'empty';
  const fin = await rpc(d, c, 'eab_lookup_finish', { p_id: id, p_credits: cost.credits, p_status: status, p_ref: a.ok ? recordRef(kind, b, call) ?? null : null });
  const paidInfo = { lookupId: id, tokensCharged: fin?.tokens_charged ?? cost.credits * TOKENS_PER_CREDIT, balance: fin?.balance, costChecked: cost.trusted };
  if (!a.ok) return json({ ...paidInfo, error: ohError(b, a.status), ohStatus: a.status }, a.status === 429 ? 429 : a.status >= 500 ? 502 : 422);
  const { creditsCharged: _drop, ...result } = b ?? {};
  return json({ ...paidInfo, result });
}

async function owned(d: Deps, c: Cfg, user: string, body: Record<string, unknown>, kind: PaidKind) {
  const id = str(body.lookupId);
  if (!isUuid(id)) return null;
  const l = await rpc(d, c, 'eab_lookup_owned', { p_id: id, p_user: user });
  return l && l.kind === kind && typeof l.oh_ref === 'string' && l.oh_ref ? l : null;
}

export async function handleLookup(req: Request, d: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const c = config(d);
  const user = await signedInUser(d, c, req);
  if (!user) return json({ error: 'not signed in' }, 401);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return json({ error: 'bad request' }, 400);
  const action = body.action;
  if (action === 'prices') {
    return json({ tokensPerCredit: TOKENS_PER_CREDIT, tokens: Object.fromEntries(Object.entries(CREDITS_MAX).map(([k, v]) => [k, v * TOKENS_PER_CREDIT])), agentDailyCredits: c.agentCap, configured: !!c.key });
  }
  if (!c.key) return json({ error: 'not-configured' }, 503);
  try {
    if (isFreeKind(action)) {
      const f = buildFree(action, body);
      if (typeof f === 'string') return json({ error: f }, 400);
      const a = await oneharta(d, c, 'GET', f.path);
      if (a === 'no-answer') return json({ error: 'no-answer' }, 504);
      return a.ok ? json({ result: a.body }) : json({ error: ohError(a.body, a.status) }, a.status === 429 ? 429 : 502);
    }
    if (isPaidKind(action)) return await paid(d, c, user, action, body);
    if (action === 'ct_record') {
      const l = await owned(d, c, user, body, 'ct_search');
      if (!l) return json({ error: 'not yours' }, 404);
      const a = await oneharta(d, c, 'GET', `/cukai-tanah/records/${encodeURIComponent(String(l.oh_ref))}`);
      if (a === 'no-answer') return json({ error: 'no-answer' }, 504);
      return a.ok ? json({ result: a.body }) : json({ error: ohError(a.body, a.status) }, 502);
    }
    if (action === 'company_status') {
      const l = await owned(d, c, user, body, 'company');
      if (!l) return json({ error: 'not yours' }, 404);
      const reg = String(l.oh_ref);
      const a = await oneharta(d, c, 'GET', `/company?${new URLSearchParams({ q: reg })}`);
      if (a === 'no-answer') return json({ error: 'no-answer' }, 504);
      if (!a.ok) return json({ error: ohError(a.body, a.status) }, 502);
      const rows = (a.body as { searches?: { registrationNo?: string; status?: string }[] } | null)?.searches ?? [];
      const row = rows.find(r => r.registrationNo === reg);
      if (!row) {
        // Oneharta drops a number it found no data for from the list and refunds it; the agent gets their tokens back once.
        const age = d.now() - Date.parse(String(l.created_at));
        if (!(age > 120_000)) return json({ status: 'pending' });   // give a fresh search a moment to appear in the list
        const r = await rpc(d, c, 'eab_lookup_refund', { p_id: l.id });
        return json({ status: 'no-data', refunded: Number(r?.refunded ?? 0) });
      }
      if (row.status !== 'success') return json({ status: 'pending' });
      const det = await oneharta(d, c, 'GET', `/company/${encodeURIComponent(reg)}`);
      if (det === 'no-answer') return json({ error: 'no-answer' }, 504);
      return det.ok ? json({ status: 'ready', result: det.body }) : json({ error: ohError(det.body, det.status) }, 502);
    }
  } catch (e) {
    return json({ error: 'server', detail: e instanceof Error ? e.message.slice(0, 120) : '' }, 500);
  }
  return json({ error: 'unknown action' }, 400);
}
