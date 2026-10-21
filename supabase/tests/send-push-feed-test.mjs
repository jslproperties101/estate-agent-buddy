// Tests for the send-push Edge Function's "feed" mode (JoyChange010-03), run under Node with a fake database and a fake
// Firebase (no network, no keys). Usage (from the repo root, after `npm install` in app/):
//   node supabase/tests/send-push-feed-test.mjs        Good = "FUNCTION TESTS: n passed, 0 failed"
import { build } from '../../app/node_modules/esbuild/lib/main.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const out = join(mkdtempSync(join(tmpdir(), 'send-push-')), 'fn.mjs');
await build({ entryPoints: [join(here, '../functions/send-push/index.ts')], format: 'esm', platform: 'neutral', outfile: out, logLevel: 'warning' });
import { generateKeyPairSync } from 'node:crypto';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
let handler; const env = { SUPABASE_URL: 'https://db', SUPABASE_SERVICE_ROLE_KEY: 'SERVICE', SUPABASE_ANON_KEY: 'ANON',
  FCM_SERVICE_ACCOUNT: JSON.stringify({ project_id: 'p', client_email: 'x@y', private_key: pem }) };
globalThis.Deno = { env: { get: k => env[k] }, serve: h => { handler = h; } };
const calls = []; let claimed = new Set(); const finished = {};
const role = { 'Bearer OWNER': 'owner', 'Bearer AGENT': null };
const R = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
globalThis.fetch = async (url, init = {}) => {
  url = String(url); const h = init.headers ?? {}; calls.push({ url, h, body: init.body });
  if (url.endsWith('/auth/v1/user')) return h.authorization === 'Bearer AGENT' ? R({ id: 'u-a' }) : R({ id: 'u-o' });
  if (url.includes('oauth2')) return R({ access_token: 'GT', expires_in: 3600 });
  const fn = url.split('/rpc/')[1];
  if (fn) {
    const b = JSON.parse(init.body);
    if (['eab_push_feed_queued', 'eab_push_feed_claim'].includes(fn)) {
      if (h.apikey !== 'ANON') return R({ message: 'must be caller' }, 500);
      if (!role[h.authorization]) return R({ code: '42501', message: 'not allowed' }, 403);
      if (fn === 'eab_push_feed_queued') return R(['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']);
      if (claimed.has(b.p_item)) return R(false); claimed.add(b.p_item); return R(true);
    }
    if (h.apikey !== 'SERVICE') return R({ message: 'service only' }, 403);
    if (fn === 'eab_push_feed_recipients') return R([
      { user_id: 'u-a', token: 'tok-good', lang: 'bm', title: 'Kadar naik', body: 'OPR' },
      { user_id: 'u-a', token: 'tok-dead', lang: 'bm', title: 'Kadar naik', body: 'OPR' },
      { user_id: 'u-d', token: 'tok-bad', lang: 'en', title: 'Rates', body: '' },
      { user_id: 'u-o', token: null, lang: 'en', title: 'Rates', body: '' }]);
    if (fn === 'eab_push_feed_finish') { finished[b.p_item] = b.p_results; const c = s => b.p_results.filter(x => x.status === s).length;
      return R({ targeted: b.p_results.length, sent: c('sent'), failed: c('failed'), no_phone: c('no_phone') }); }
  }
  if (url.includes('fcm.googleapis.com')) {
    const m = JSON.parse(init.body).message;
    if (m.token === 'tok-good') return R({ name: 'ok' });
    if (m.token === 'tok-dead') return R({ error: { status: 'UNREGISTERED' } }, 404);
    return R({ error: { code: 503, status: 'UNAVAILABLE' } }, 503);
  }
  if (url.includes('eab_push_tokens') && init.method === 'DELETE') return new Response(null, { status: 204 });
  return R({ unexpected: url }, 599);
};
await import(pathToFileURL(out).href);
const call = (auth, body) => handler(new Request('https://f/send-push', { method: 'POST', headers: { authorization: auth }, body: JSON.stringify(body) }));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
let r = await call('Bearer AGENT', { kind: 'feed' }); ok(r.status === 403, 'agent refused (all)');
r = await call('Bearer AGENT', { kind: 'feed', item_id: '11111111-1111-1111-1111-111111111111' }); ok(r.status === 403, 'agent refused (one)');
ok(!calls.some(c => c.url.includes('fcm')), 'nothing sent for agent');
r = await call('Bearer OWNER', { kind: 'feed', item_id: 'nope' }); ok(r.status === 400, 'bad id');
r = await call('Bearer OWNER', { kind: 'feed', item_id: '11111111-1111-1111-1111-111111111111' }); let j = await r.json();
ok(r.status === 200 && j.items[0].sent === 1 && j.items[0].failed === 1 && j.items[0].no_phone === 1 && j.items[0].targeted === 3, 'counts ' + JSON.stringify(j));
const res = finished['11111111-1111-1111-1111-111111111111'];
ok(res.find(x => x.user_id === 'u-d').error === 'unavailable', 'error code ' + JSON.stringify(res));
ok(calls.some(c => c.url.includes('eab_push_tokens?token=eq.tok-dead') ), 'dead token removed');
const fcm = calls.filter(c => c.url.includes('fcm')).map(c => JSON.parse(c.body).message);
ok(fcm.every(m => m.data.kind === 'feed' && m.data.item_id && m.android.notification.channel_id === 'news'), 'payload');
ok(fcm.find(m => m.token === 'tok-good').notification.title === 'Kadar naik', 'language title');
ok(!('body' in fcm.find(m => m.token === 'tok-bad').notification), 'empty body left out');
r = await call('Bearer OWNER', { kind: 'feed', item_id: '11111111-1111-1111-1111-111111111111' }); j = await r.json();
ok(j.items[0].skipped, 'second send skipped');
r = await call('Bearer OWNER', { kind: 'feed' }); j = await r.json();
ok(j.items.length === 2 && j.items[0].skipped && j.items[1].sent === 1, 'queued: one skipped, one sent ' + JSON.stringify(j));
r = await call('Bearer OWNER', { kind: 'invite' }); ok(r.status === 400, 'invite path unchanged (no id = 400)');
console.log(`FUNCTION TESTS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
