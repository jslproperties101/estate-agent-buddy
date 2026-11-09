// AI Buddy POS → LHDN MyInvois. The logic of the myinvois function, kept here so the unit tests can run it with a stand-in
// LHDN (app/tests/batch7-myinvois.test.ts). See index.ts for the secrets.
import { certProblems, importKey, readCert, signDocument, sha256Hex, textBase64, type CertInfo } from '../_shared/myinvois_sign.ts';

export interface Deps {
  env: (k: string) => string;
  fetch: typeof fetch;
  now: () => number;
  /** Reads a .p12 / .pfx (base64) with its password into PEM certificate and key (index.ts uses node-forge). */
  p12?: (base64: string, password: string) => Promise<{ certPem: string; keyPem: string }>;
}
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function config(d: Deps) {
  const env = d.env('MYINVOIS_ENV') === 'prod' ? 'prod' as const : 'preprod' as const;
  return {
    env, api: env === 'prod' ? 'https://api.myinvois.hasil.gov.my' : 'https://preprod-api.myinvois.hasil.gov.my',
    clientId: d.env('MYINVOIS_CLIENT_ID'), clientSecret: d.env('MYINVOIS_CLIENT_SECRET'), tin: d.env('MYINVOIS_SUPPLIER_TIN'),
    allowed: d.env('MYINVOIS_ALLOWED_USERS').split(/[\s,]+/).filter(x => UUID.test(x)).map(x => x.toLowerCase()),
    certPem: d.env('MYINVOIS_CERT_PEM').replace(/\\n/g, '\n'), keyPem: d.env('MYINVOIS_KEY_PEM').replace(/\\n/g, '\n'),
    p12: d.env('MYINVOIS_P12_BASE64'), p12Pass: d.env('MYINVOIS_P12_PASSWORD'),
    // Sandbox only: send unsigned v1.0 documents when no certificate is set (never in prod).
    allowV10: env === 'preprod' && d.env('MYINVOIS_ALLOW_UNSIGNED_V10') === 'true',
    url: d.env('SUPABASE_URL').replace(/\/+$/, ''), anon: d.env('SUPABASE_ANON_KEY'),
  };
}
type Cfg = ReturnType<typeof config>;

// Kept while the function instance lives: the LHDN token and the loaded certificate.
let token: { key: string; value: string; until: number } | null = null;
let signer: { key: string; cert: CertInfo; priv: CryptoKey } | null = null;
export function resetForTests() { token = null; signer = null; }

async function accessToken(d: Deps, c: Cfg): Promise<string> {
  const k = `${c.api}|${c.clientId}`;
  if (token && token.key === k && token.until - d.now() > 60_000) return token.value;
  const r = await d.fetch(`${c.api}/connect/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: 'client_credentials', scope: 'InvoicingAPI' }),
  });
  if (!r.ok) throw new Error(`LHDN token ${r.status}`);
  const j = await r.json();
  token = { key: k, value: j.access_token, until: d.now() + (j.expires_in ?? 3600) * 1000 };
  return token.value;
}
async function lhdn(d: Deps, c: Cfg, path: string, init: RequestInit = {}) {
  const r = await d.fetch(`${c.api}${path}`, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${await accessToken(d, c)}`, 'content-type': 'application/json' } });
  const text = await r.text();
  let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = { text: text.slice(0, 500) }; }
  return { ok: r.ok, status: r.status, body };
}
/** The certificate and key from the secrets (PEM pair, or a .p12 with its password); null when none is set. */
async function loadSigner(d: Deps, c: Cfg) {
  const k = `${c.certPem.length}|${c.keyPem.length}|${c.p12.length}`;
  if (signer && signer.key === k) return signer;
  let certPem = c.certPem, keyPem = c.keyPem;
  if (!(certPem && keyPem) && c.p12) {
    if (!d.p12) throw new Error('p12 reader not available');
    ({ certPem, keyPem } = await d.p12(c.p12, c.p12Pass));
  }
  if (!(certPem && keyPem)) return null;
  signer = { key: k, cert: readCert(certPem), priv: await importKey(keyPem) };
  return signer;
}
async function caller(d: Deps, c: Cfg, req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') ?? '';
  if (!/^Bearer\s+\S+$/.test(auth) || !c.url) return null;
  const r = await d.fetch(`${c.url}/auth/v1/user`, { headers: { authorization: auth, apikey: c.anon } });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return typeof u?.id === 'string' && UUID.test(u.id) ? u.id.toLowerCase() : null;
}

// deno-lint-ignore no-explicit-any
const errorsOf = (x: any): string[] => {
  const out: string[] = [];
  // deno-lint-ignore no-explicit-any
  const walk = (e: any) => { if (!e) return; if (e.error ?? e.message) out.push(String(e.error?.message ?? e.message ?? e.error)); (e.details ?? e.innerError ?? []).forEach?.(walk); };
  // deno-lint-ignore no-explicit-any
  (x?.validationResults?.validationSteps ?? []).filter((s: any) => s.status === 'Invalid').forEach((s: any) => walk(s.error));
  return out.length ? out : ['LHDN marked the document invalid.'];
};
const statusOf = (s: string) => (({ Valid: 'valid', Invalid: 'invalid', Cancelled: 'cancelled', Submitted: 'submitted' } as Record<string, string>)[s] ?? 'submitted');

export async function handleMyinvois(req: Request, d: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const c = config(d);
  if (!c.clientId || !c.clientSecret || !c.tin) return json({ error: 'not-configured', missing: 'credentials' }, 503);
  if (!c.allowed.length) return json({ error: 'not-configured', missing: 'MYINVOIS_ALLOWED_USERS' }, 503);
  const who = await caller(d, c, req);
  if (!who) return json({ error: 'not-signed-in' }, 401);
  if (!c.allowed.includes(who)) return json({ error: 'not-allowed' }, 403);
  try {
    const body = await req.json().catch(() => null);
    if (body?.action === 'submit') {
      const doc = body.document;
      const inv = doc?.Invoice?.[0];
      if (!inv || typeof body.codeNumber !== 'string' || !body.codeNumber.trim() || body.codeNumber.length > 50) return json({ error: 'bad request' }, 400);
      const tin = inv.AccountingSupplierParty?.[0]?.Party?.[0]?.PartyIdentification?.find((p: { ID: { schemeID: string }[] }) => p.ID?.[0]?.schemeID === 'TIN')?.ID?.[0]?._;
      if (tin !== c.tin) return json({ error: 'supplier-tin-mismatch' }, 403);
      const s = await loadSigner(d, c);
      let text: string, hash: string, version: '1.0' | '1.1';
      if (s) {
        const problems = certProblems(s.cert, c.tin);
        if (problems.length) return json({ error: 'certificate', problems }, 500);
        const signed = await signDocument(doc, s.priv, s.cert, d.now());
        text = signed.text; hash = signed.hash; version = '1.1';
      } else if (c.allowV10) {
        inv.InvoiceTypeCode[0].listVersionID = '1.0';
        text = JSON.stringify(doc); hash = await sha256Hex(text); version = '1.0';
      } else return json({ error: 'not-configured', missing: 'certificate' }, 503);
      const r = await lhdn(d, c, '/api/v1.0/documentsubmissions', { method: 'POST', body: JSON.stringify({ documents: [{ format: 'JSON', documentHash: hash, codeNumber: body.codeNumber, document: textBase64(text) }] }) });
      if (!r.ok && r.status !== 202) return json({ error: 'lhdn', status: r.status, detail: r.body }, 502);
      const acc = r.body?.acceptedDocuments?.[0];
      if (!acc) return json({ status: 'invalid', env: c.env, version, submissionUid: r.body?.submissionUid, errors: (r.body?.rejectedDocuments ?? []).map((x: { error?: { message?: string; details?: { message?: string }[] } }) => [x.error?.message, ...(x.error?.details ?? []).map(y => y.message)].filter(Boolean).join(' – ') || 'Rejected by LHDN') });
      return json({ status: 'submitted', env: c.env, version, submissionUid: r.body.submissionUid, uuid: acc.uuid });
    }
    if (body?.action === 'status' && typeof body.uuid === 'string') {
      const r = await lhdn(d, c, `/api/v1.0/documents/${encodeURIComponent(body.uuid)}/details`);
      if (!r.ok) return json({ error: 'lhdn', status: r.status }, 502);
      const st = statusOf(r.body?.status);
      return json({ status: st, uuid: body.uuid, longId: r.body?.longID || undefined, ...(st === 'invalid' ? { errors: errorsOf(r.body) } : {}) });
    }
    if (body?.action === 'cancel' && typeof body.uuid === 'string' && typeof body.reason === 'string' && body.reason.trim()) {
      const r = await lhdn(d, c, `/api/v1.0/documents/state/${encodeURIComponent(body.uuid)}/state`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled', reason: body.reason.slice(0, 300) }) });
      if (!r.ok) return json({ error: 'lhdn', status: r.status, detail: r.body }, 502);
      return json({ status: 'cancelled' });
    }
    return json({ error: 'bad request' }, 400);
  } catch (e) {
    return json({ error: 'failed', detail: String(e instanceof Error ? e.message : e).slice(0, 300) }, 500);
  }
}
