// Supabase Edge Function: Buddy POS AI → LHDN MyInvois (Phase 1, sandbox first).
// The LHDN credentials stay here as secrets and never go into the app.
//   supabase secrets set MYINVOIS_ENV=preprod                       (preprod = sandbox; prod only after approval)
//   supabase secrets set MYINVOIS_CLIENT_ID=... MYINVOIS_CLIENT_SECRET=...
//   supabase secrets set MYINVOIS_SUPPLIER_TIN=C2xxxxxxxxxx         (only documents from this TIN are sent)
//   supabase secrets set MYINVOIS_ALLOW_UNSIGNED_V10=true           (sandbox testing only, see below)
//   supabase functions deploy myinvois
// Supabase checks the caller's sign-in token before this code runs.
//
// NOT DEPLOYED AND NOT TESTED AGAINST LHDN YET. Signing of v1.1 documents (the LHDN digital signature with the company
// certificate) is not built in Phase 1: without it, a document is sent as v1.0 unsigned when MYINVOIS_ALLOW_UNSIGNED_V10 is
// true, and refused with "signing-not-built" otherwise. Check with LHDN which versions the sandbox accepts before relying on it.

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

const ENV = (Deno.env.get('MYINVOIS_ENV') ?? 'preprod') === 'prod' ? 'prod' : 'preprod';
const API = ENV === 'prod' ? 'https://api.myinvois.hasil.gov.my' : 'https://preprod-api.myinvois.hasil.gov.my';
const CLIENT_ID = Deno.env.get('MYINVOIS_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('MYINVOIS_CLIENT_SECRET') ?? '';
const SUPPLIER_TIN = Deno.env.get('MYINVOIS_SUPPLIER_TIN') ?? '';
const ALLOW_V10 = Deno.env.get('MYINVOIS_ALLOW_UNSIGNED_V10') === 'true';

let token: { value: string; until: number } | null = null;
async function accessToken(): Promise<string> {
  if (token && token.until - Date.now() > 60_000) return token.value;
  const r = await fetch(`${API}/connect/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'client_credentials', scope: 'InvoicingAPI' }),
  });
  if (!r.ok) throw new Error(`token ${r.status}`);
  const j = await r.json();
  token = { value: j.access_token, until: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return token.value;
}
async function lhdn(path: string, init: RequestInit = {}) {
  const r = await fetch(`${API}${path}`, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' } });
  const text = await r.text();
  return { ok: r.ok, status: r.status, body: text ? JSON.parse(text) : null };
}
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
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

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!CLIENT_ID || !CLIENT_SECRET || !SUPPLIER_TIN) return json({ error: 'not-configured' }, 503);
  try {
    const body = await req.json();
    if (body.action === 'submit') {
      const doc = body.document;
      const inv = doc?.Invoice?.[0];
      const tin = inv?.AccountingSupplierParty?.[0]?.Party?.[0]?.PartyIdentification?.find((p: { ID: { schemeID: string }[] }) => p.ID?.[0]?.schemeID === 'TIN')?.ID?.[0]?._;
      if (!inv || typeof body.codeNumber !== 'string') return json({ error: 'bad request' }, 400);
      if (tin !== SUPPLIER_TIN) return json({ error: 'supplier-tin-mismatch' }, 403);
      if (!ALLOW_V10) return json({ error: 'signing-not-built' }, 501);
      inv.InvoiceTypeCode[0].listVersionID = '1.0';
      const text = JSON.stringify(doc);
      const hash = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
      const r = await lhdn('/api/v1.0/documentsubmissions', { method: 'POST', body: JSON.stringify({ documents: [{ format: 'JSON', documentHash: hash, codeNumber: body.codeNumber, document: b64(text) }] }) });
      if (!r.ok && r.status !== 202) return json({ error: 'lhdn', status: r.status, detail: r.body }, 502);
      const acc = r.body?.acceptedDocuments?.[0];
      if (!acc) return json({ status: 'invalid', env: ENV, submissionUid: r.body?.submissionUid, errors: (r.body?.rejectedDocuments ?? []).map((d: { error?: { message?: string } }) => d.error?.message ?? 'Rejected by LHDN') });
      return json({ status: 'submitted', env: ENV, submissionUid: r.body.submissionUid, uuid: acc.uuid });
    }
    if (body.action === 'status' && typeof body.uuid === 'string') {
      const r = await lhdn(`/api/v1.0/documents/${encodeURIComponent(body.uuid)}/details`);
      if (!r.ok) return json({ error: 'lhdn', status: r.status }, 502);
      const st = statusOf(r.body?.status);
      return json({ status: st, uuid: body.uuid, longId: r.body?.longID || undefined, ...(st === 'invalid' ? { errors: errorsOf(r.body) } : {}) });
    }
    if (body.action === 'cancel' && typeof body.uuid === 'string' && typeof body.reason === 'string' && body.reason.trim()) {
      const r = await lhdn(`/api/v1.0/documents/state/${encodeURIComponent(body.uuid)}/state`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled', reason: body.reason.slice(0, 300) }) });
      if (!r.ok) return json({ error: 'lhdn', status: r.status, detail: r.body }, 502);
      return json({ status: 'cancelled' });
    }
    return json({ error: 'bad request' }, 400);
  } catch (e) {
    return json({ error: 'failed', detail: String(e) }, 500);
  }
});
