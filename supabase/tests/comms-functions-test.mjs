// Tests for the AdminBatch008 Edge Functions (send-broadcast, email-unsubscribe, weekly-report), run under Node with a
// fake database, fake Resend, fake WhatsApp (Meta) and fake storage — no network, no keys. Uses the real pdf-lib.
// Usage (from the repo root, after `npm install` in app/):   node supabase/tests/comms-functions-test.mjs
// Good = "FUNCTION TESTS: n passed, 0 failed"
import { build } from '../../app/node_modules/esbuild/lib/main.js';
import { mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const here = dirname(fileURLToPath(import.meta.url));
const req = createRequire(join(here, '../../app/package.json'));
const PDF = req('pdf-lib');
const tmp = mkdtempSync(join(tmpdir(), 'comms-'));
const npmPdf = { name: 'npm-pdf-lib', setup(b) { b.onResolve({ filter: /^npm:pdf-lib/ }, () => ({ path: 'pdf-lib', namespace: 'pdflib' }));
  b.onLoad({ filter: /.*/, namespace: 'pdflib' }, () => ({ contents: 'export const { PDFDocument, StandardFonts, rgb } = globalThis.__pdflib;', loader: 'js' })); } };
globalThis.__pdflib = PDF;
async function load(name) {
  const out = join(tmp, `${name}.mjs`);
  await build({ entryPoints: [join(here, `../functions/${name}/index.ts`)], bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'warning', plugins: [npmPdf] });
  let handler; globalThis.Deno = { env: { get: k => env[k] }, serve: h => { handler = h; } };
  await import(pathToFileURL(out).href + `?v=${Math.random()}`);
  return handler;
}
let env = {};
const R = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

// ---------------------------------------------------------------- send-broadcast
const B = id => ({ id, ref: 'BC-2026-0007', channel: 'email', kind: 'news', subject_en: 'Launch', subject_bm: 'Pelancaran', body_en: 'New launch\nTonight', body_bm: 'Pelancaran baharu' });
let db; let calls;
function fakeDb() {
  db = { batches: [], results: {}, unclaimed: 0, finished: 0, channel: 'email' };
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    url = String(url); const h = init.headers ?? {}; const body = init.body ? (typeof init.body === 'string' ? JSON.parse(init.body) : init.body) : null;
    calls.push({ url, h, body });
    const fn = url.split('/rpc/')[1];
    if (fn === 'eab_public_settings') return R({ company_name: 'JSL Global Trading' });
    if (fn === 'eab_admin_broadcast_claim') {
      if (h.apikey !== 'ANON') return R({ message: 'must be caller' }, 500);
      if (h.authorization === 'Bearer AGENT') return R({ code: '42501', message: 'not allowed' }, 403);
      const b = { ...B(body.p_id), channel: db.channel };
      return R({ broadcast: b, recipients: db.batches.shift() ?? [], left: db.batches.flat().length });
    }
    if (['eab_bc_result', 'eab_bc_finish', 'eab_bc_unclaim'].includes(fn) && h.apikey !== 'SERVICE') return R({ message: 'service only' }, 403);
    if (fn === 'eab_bc_result') { db.results[body.p_recipient] = body; return R(true); }
    if (fn === 'eab_bc_finish') { db.finished++; return R('done'); }
    if (fn === 'eab_bc_unclaim') { db.unclaimed++; return R(true); }
    if (url === 'https://api.resend.com/emails/batch') {
      if (db.resendDown) return R({ name: 'validation_error', message: 'You can only send testing emails to your own email address' }, 403);
      return R({ data: body.map((_, i) => ({ id: `re_${i}` })) });
    }
    if (url.includes('graph.facebook.com')) {
      if (body.to === '60199999999') return R({ error: { message: 'Recipient phone number not in allowed list', code: 131030 } }, 400);
      return R({ messages: [{ id: 'wamid.1' }] });
    }
    return R({ unexpected: url }, 599);
  };
}
const ID = '11111111-1111-4111-8111-111111111111';
const post = (h, auth, body) => h(new Request('https://f/x', { method: 'POST', headers: auth ? { authorization: auth } : {}, body: JSON.stringify(body) }));
const tok = n => String(n).repeat(32).slice(0, 32);

env = { SUPABASE_URL: 'https://db', SUPABASE_ANON_KEY: 'ANON', SUPABASE_SERVICE_ROLE_KEY: 'SERVICE' };
let send = await load('send-broadcast');
fakeDb();
let r = await post(send, null, { broadcast_id: ID }); ok(r.status === 401, 'no sign-in refused');
r = await post(send, 'Bearer OWNER', { broadcast_id: 'x' }); ok(r.status === 400, 'bad id');
r = await post(send, 'Bearer AGENT', { broadcast_id: ID }); ok(r.status === 403, 'agent refused');
db.batches = [[{ id: 1, address: 'x@a.my', lang: 'bm', token: tok(1) }]];
r = await post(send, 'Bearer OWNER', { broadcast_id: ID });
ok(r.status === 503 && db.unclaimed === 1 && !calls.some(c => c.url.includes('resend')), 'email not set up: 503, handed back, nothing sent');

env = { ...env, RESEND_API_KEY: 'RK', EAB_EMAIL_FROM: 'EAB <news@jsl.test>' };
send = await load('send-broadcast');
fakeDb();
db.batches = [[{ id: 1, address: 'x@a.my', lang: 'bm', token: tok(1) }, { id: 2, address: 'y@a.my', lang: 'en', token: tok(2) }], [{ id: 3, address: 'z@a.my', lang: 'zh', token: tok(3) }]];
r = await post(send, 'Bearer OWNER', { broadcast_id: ID }); let j = await r.json();
const batches = calls.filter(c => c.url.endsWith('/emails/batch'));
ok(r.status === 200 && j.sent === 3 && j.failed === 0 && j.status === 'done', 'email sent in two batches ' + JSON.stringify(j));
ok(batches.length === 2 && batches[0].h.authorization === 'Bearer RK' && batches[0].h['idempotency-key'] === `${ID}-1`, 'Resend batches with idempotency key');
const m0 = batches[0].body[0];
ok(m0.from === 'EAB <news@jsl.test>' && m0.subject === 'Pelancaran' && m0.text.startsWith('Pelancaran baharu'), 'agent language (BM)');
ok(batches[1].body[0].subject === 'Launch' && batches[1].body[0].text.startsWith('New launch'), 'empty ZH falls back to English');
ok(m0.text.includes(`https://db/functions/v1/email-unsubscribe?t=${tok(1)}`) && m0.headers['List-Unsubscribe'] === `<https://db/functions/v1/email-unsubscribe?t=${tok(1)}>`, 'unsubscribe link + header');
ok(/berita & tawaran daripada JSL Global Trading/.test(m0.text) && m0.html.includes('&lt;') === false, 'news footer with company name');
ok(db.results[1].p_ok === true && db.results[1].p_provider_id === 're_0' && db.results[3].p_ok === true, 'results written with provider id');
ok(calls.filter(c => c.url.includes('/rpc/eab_bc_result')).every(c => c.h.apikey === 'SERVICE'), 'results written with the service key');

fakeDb(); db.resendDown = true;
db.batches = [[{ id: 7, address: 'other@a.my', lang: 'en', token: tok(7) }]];
r = await post(send, 'Bearer ADMIN', { broadcast_id: ID }); j = await r.json();
ok(j.failed === 1 && db.results[7].p_ok === false && /Resend 403: You can only send testing emails/.test(db.results[7].p_error), 'Resend refusal recorded as failed with reason');

fakeDb(); db.channel = 'whatsapp';
db.batches = [[{ id: 9, address: '60123456789', lang: 'bm', token: tok(9) }]];
r = await post(send, 'Bearer OWNER', { broadcast_id: ID });
ok(r.status === 503 && db.unclaimed === 1 && !calls.some(c => c.url.includes('facebook')), 'WhatsApp API not set up: 503, handed back');

env = { ...env, WA_TOKEN: 'WT', WA_PHONE_NUMBER_ID: '555', WA_TEMPLATE: 'eab_notice' };
send = await load('send-broadcast');
fakeDb(); db.channel = 'whatsapp';
db.batches = [[{ id: 9, address: '60123456789', lang: 'bm', token: tok(9) }, { id: 10, address: '60199999999', lang: 'en', token: tok(10) }]];
r = await post(send, 'Bearer OWNER', { broadcast_id: ID }); j = await r.json();
const wa = calls.filter(c => c.url.includes('graph.facebook.com/v21.0/555/messages'));
ok(wa.length === 2 && wa[0].h.authorization === 'Bearer WT', 'WhatsApp API called per person');
ok(wa[0].body.template.name === 'eab_notice' && wa[0].body.template.language.code === 'ms' && wa[1].body.template.language.code === 'en', 'template + language codes');
ok(wa[1].body.template.components[0].parameters[0].text === 'New launch · Tonight', 'no new lines in the template variable');
ok(j.sent === 1 && j.failed === 1 && /not in allowed list/.test(db.results[10].p_error), 'WhatsApp failure recorded');

// ---------------------------------------------------------------- email-unsubscribe
const unsub = await load('email-unsubscribe');
globalThis.fetch = async (url, init = {}) => {
  const b = JSON.parse(init.body); if (init.headers.apikey !== 'SERVICE') return R({}, 403);
  return R(b.p_token === tok(4) ? { ok: true, lang: 'bm' } : { ok: false });
};
r = await unsub(new Request(`https://f/u?t=${tok(4)}`)); let html = await r.text();
ok(r.status === 200 && html.includes('Anda tidak akan menerima berita') && html.includes('lang="ms"'), 'unsubscribe page in BM');
r = await unsub(new Request(`https://f/u?t=${tok(5)}`)); ok(r.status === 404 && (await r.text()).includes('not valid'), 'unknown token');
r = await unsub(new Request('https://f/u?t=<script>')); ok(r.status === 404, 'bad token never reaches the database');
r = await unsub(new Request(`https://f/u?t=${tok(4)}`, { method: 'POST' })); ok(r.status === 200, 'one-click POST');

// ---------------------------------------------------------------- weekly-report
const DATA = { ref: 'RPT-2026-W43', from: '2026-10-19', to: '2026-10-25', company: 'JSL Global Trading', made_at: '2026-10-26T01:35:00Z',
  agents_total: 12, agents_new: 2, agents_active: 7, active_by_day: ['19', '20', '21', '22', '23', '24', '25'].map((d, i) => ({ day: `2026-10-${d}`, agents: i + 1 })),
  listings: 40, listings_new: 5, closed: 2, sync_runs: 90, sync_fails: 1, tickets_new: 1, tickets_open: 2, posts_published: 3, broadcasts_sent: 1,
  accounts_not_active: 0, licences_unverified: 4, admin_actions: 30, admin_views: 55, log_chain_ok: true };
let rep;
function fakeReportDb(opts = {}) {
  rep = { uploads: [], stored: null, finished: null, mails: [], due: opts.due ?? true };
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    url = String(url); const h = init.headers ?? {}; calls.push({ url, h });
    const fn = url.split('/rpc/')[1];
    if (fn === 'eab_admin_report_claim') {
      if (h.authorization === 'Bearer AGENT') return R({ code: '42501', message: 'not allowed' }, 403);
      return R({ id: 'run-m', ref: 'RPT-2026-W43-M261010', period_from: '2026-10-19', period_to: '2026-10-25', recipients: ['c@jsl.test'] });
    }
    if (h.apikey !== 'SERVICE' && url.includes('/rest/')) return R({ message: 'service only' }, 403);
    if (fn === 'eab_report_claim_scheduled') return R(rep.due ? { id: 'run-s', ref: 'RPT-2026-W43', period_from: '2026-10-19', period_to: '2026-10-25', recipients: ['o@jsl.test', 'c@jsl.test'] } : null);
    if (fn === 'eab_report_data') return R(DATA);
    if (url.includes('/storage/v1/object/eab-vault/')) {
      if (opts.uploadFails) return R({ message: 'bucket' }, 500);
      rep.uploads.push({ url, h, bytes: new Uint8Array(init.body) }); return R({ Key: 'x' });
    }
    if (fn === 'eab_report_stored') { rep.stored = JSON.parse(init.body); return R({}); }
    if (fn === 'eab_report_finished') { rep.finished = JSON.parse(init.body); return R({ status: rep.finished.p_emailed_to.length ? 'emailed' : 'stored', error: rep.finished.p_error }); }
    if (url === 'https://api.resend.com/emails') { rep.mails.push(JSON.parse(init.body)); return R({ id: 're_r' }); }
    return R({ unexpected: url }, 599);
  };
}
env = { SUPABASE_URL: 'https://db', SUPABASE_ANON_KEY: 'ANON', SUPABASE_SERVICE_ROLE_KEY: 'SERVICE', REPORT_CRON_SECRET: 'S3CRET-long', RESEND_API_KEY: 'RK' };
let weekly = await load('weekly-report');
const cronCall = (secret) => weekly(new Request('https://f/w', { method: 'POST', headers: { 'x-cron-secret': secret }, body: '{}' }));
fakeReportDb();
r = await cronCall('wrong-secret'); ok(r.status === 403 && !calls.length, 'wrong scheduler secret refused');
fakeReportDb({ due: false });
r = await cronCall('S3CRET-long'); j = await r.json(); ok(j.skipped === 'not due' && !rep.uploads.length, 'not due: nothing made');
fakeReportDb();
r = await cronCall('S3CRET-long'); j = await r.json();
const up = rep.uploads[0]; const sha = up && createHash('sha256').update(up.bytes).digest('hex');
ok(r.status === 200 && up && up.url === `https://db/storage/v1/object/eab-vault/reports/run-s/${sha}` && up.h['x-upsert'] === 'false', 'PDF kept at reports/<run>/<sha256>, never overwritten');
ok(String.fromCharCode(...up.bytes.slice(0, 5)) === '%PDF-', 'a real PDF');
const doc = await PDF.PDFDocument.load(up.bytes); ok(doc.getPageCount() === 1 && doc.getTitle() === 'Weekly summary RPT-2026-W43', 'PDF opens: 1 page, titled');
ok(rep.stored.p_sha256 === sha && rep.stored.p_bytes === up.bytes.length && rep.stored.p_file_name === 'EAB-weekly-RPT-2026-W43.pdf', 'stored with fingerprint');
const mail = rep.mails[0];
ok(mail && mail.to.join() === 'o@jsl.test,c@jsl.test' && mail.attachments[0].filename === 'EAB-weekly-RPT-2026-W43.pdf'
   && Buffer.from(mail.attachments[0].content, 'base64').equals(Buffer.from(up.bytes)) && mail.text.includes(sha), 'emailed with the same PDF attached');
ok(rep.finished.p_emailed_to.length === 2 && rep.finished.p_error === null, 'finished: emailed');
fakeReportDb();
r = await weekly(new Request('https://f/w', { method: 'POST', headers: { authorization: 'Bearer AGENT' }, body: '{"reason":"x"}' })); ok(r.status === 403 && !rep.uploads.length, 'non-admin cannot start it');
r = await weekly(new Request('https://f/w', { method: 'POST', headers: { authorization: 'Bearer COMPLIANCE' }, body: '{"reason":"Check now"}' })); j = await r.json();
ok(r.status === 200 && rep.uploads[0].url.includes('/reports/run-m/') && rep.mails[0].to.join() === 'c@jsl.test', 'manual run by Compliance');
r = await weekly(new Request('https://f/w', { method: 'POST', body: '{}' })); ok(r.status === 401, 'no sign-in, no secret');
env = { ...env, RESEND_API_KEY: '' }; weekly = await load('weekly-report');
fakeReportDb(); r = await cronCall('S3CRET-long');
ok(rep.uploads.length === 1 && !rep.mails.length && /email not set up/.test(rep.finished.p_error), 'without Resend: kept, not emailed, said why');
fakeReportDb({ uploadFails: true }); r = await cronCall('S3CRET-long');
ok(r.status === 500 && rep.stored === null && /upload 500/.test(rep.finished.p_error), 'upload failure: run marked failed with the reason');

console.log(`FUNCTION TESTS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
