// Supabase Edge Function "weekly-report" (AdminBatch008, feature 70): the weekly summary PDF.
//   Every hour, the database scheduler (ops/weekly-report-schedule.sql) calls it with the header x-cron-secret. It makes
//   the week's report once, when the schedule in Admin EAB says (day + hour, Malaysia time); otherwise it does nothing.
//   An Owner or Compliance admin can also start it by hand from Admin EAB:
//     POST /functions/v1/weekly-report   { "reason": "..." }   with their own sign-in.
// Steps: the numbers (totals only, no names) → PDF → kept in the private vault bucket (reports/<run>/<sha256>; never
// changed or deleted) → emailed as an attachment to the Owner / Compliance admins chosen in Admin EAB.
// Secrets: REPORT_CRON_SECRET (the same long random text as in ops/weekly-report-schedule.sql), RESEND_API_KEY and
// EAB_EMAIL_FROM (see send-broadcast; without them the report is still made and kept, just not emailed).
// DEPLOY WITHOUT SIGN-IN CHECK (the scheduler has no sign-in; this function checks the secret or the admin itself):
//   supabase functions deploy weekly-report --no-verify-jwt
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';
import { buildReportPdf, sha256Hex, type ReportData } from '../_shared/eab-comms.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const URL_ = env('SUPABASE_URL'); const ANON = env('SUPABASE_ANON_KEY'); const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
const service = (fn: string, body: unknown) => fetch(`${URL_}/rest/v1/rpc/${fn}`, {
  method: 'POST', headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** Constant-time comparison for the scheduler's secret. */
function same(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

interface Run { id: string; ref: string; period_from: string; period_to: string; recipients: string[] }

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let run: Run | null = null;
  const cron = req.headers.get('x-cron-secret') ?? '';
  if (cron) {
    if (!same(cron, env('REPORT_CRON_SECRET'))) return json({ error: 'not allowed' }, 403);
    const r = await service('eab_report_claim_scheduled', {});
    if (!r.ok) return json({ error: 'database' }, 502);
    run = await r.json();
    if (!run) return json({ skipped: 'not due' });
  } else {
    const auth = req.headers.get('authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'not signed in' }, 401);
    const body = await req.json().catch(() => ({})) as { reason?: string };
    const r = await fetch(`${URL_}/rest/v1/rpc/eab_admin_report_claim`, { method: 'POST',
      headers: { apikey: ANON, authorization: auth, 'content-type': 'application/json' },
      body: JSON.stringify({ p_reason: body.reason ?? '', p_device: 'weekly-report' }) });
    if (!r.ok) { const e = await r.json().catch(() => ({})) as { code?: string; message?: string };
      return json({ error: e.message ?? 'refused' }, e.code === '42501' ? 403 : 400); }
    run = await r.json();
  }
  const id = run!.id;
  try {
    const data = await (await service('eab_report_data', { p_run: id })).json() as ReportData;
    const contentSha = await sha256Hex(new TextEncoder().encode(JSON.stringify(data)));
    const pdf = await buildReportPdf({ PDFDocument, StandardFonts, rgb }, data, contentSha);
    const sha = await sha256Hex(pdf);
    const fileName = `EAB-weekly-${run!.ref}.pdf`;
    const up = await fetch(`${URL_}/storage/v1/object/eab-vault/reports/${id}/${sha}`, { method: 'POST',
      headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/pdf', 'x-upsert': 'false' }, body: pdf });
    if (!up.ok) throw new Error(`upload ${up.status}`);
    const st = await service('eab_report_stored', { p_run: id, p_file_name: fileName, p_sha256: sha, p_bytes: pdf.length });
    if (!st.ok) throw new Error(`stored ${st.status}`);
    const to = (run!.recipients ?? []).filter(Boolean);
    let emailed: string[] = []; let note: string | null = null;
    if (!env('RESEND_API_KEY')) note = 'email not set up (kept in the vault only)';
    else if (!to.length) note = 'nobody chosen to receive it';
    else {
      const company = data.company || 'Estate Agent AI Buddy';
      const m = await fetch('https://api.resend.com/emails', { method: 'POST',
        headers: { authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json', 'idempotency-key': `report-${id}` },
        body: JSON.stringify({ from: env('EAB_EMAIL_FROM') || `${company} <onboarding@resend.dev>`, to,
          subject: `${company}: weekly summary ${data.from} to ${data.to}`,
          text: `The weekly summary for ${data.from} to ${data.to} is attached (${run!.ref}).\nIt is also kept in Admin EAB → Scheduled Reports for 7 years.\nFile fingerprint (SHA-256): ${sha}`,
          attachments: [{ filename: fileName, content: b64(pdf) }] }) });
      if (m.ok) emailed = to; else note = `email ${m.status}: ${((await m.json().catch(() => ({}))) as { message?: string }).message ?? 'refused'}`;
    }
    const fin = await (await service('eab_report_finished', { p_run: id, p_emailed_to: emailed, p_error: note })).json();
    return json({ run: fin });
  } catch (e) {
    await service('eab_report_finished', { p_run: id, p_emailed_to: [], p_error: String((e as Error).message ?? e).slice(0, 900) });
    return json({ error: 'the report could not be made', run_id: id }, 500);
  }
});
