// Changes 24 and 25: the live invitation connection, push registration, and the notify-invite function.
// Fake WebSocket, fake cloud (tests/support/fakeTeamCloud.ts), fake Google. NOT Supabase Realtime, NOT Firebase, NOT a phone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveInvites, joinMessage, socketUrl, HEARTBEAT_MS, RETRY_MS, TOPIC, WebSocketLike } from '../src/team/live';
import { announce, pushActive, registerToken, setPushTokenForTest, unregisterPush, REREGISTER_MS } from '../src/native/push';
import { signOutRemote } from '../src/data/auth';
import { acceptInvite, declineInvite, sendInvite } from '../src/team/api';
import { handle, messageFor, googleToken, Env } from '../../supabase/functions/notify-invite/logic';
import { FakeTeamCloud, cfg, agentPhone } from './support/fakeTeamCloud';

// ---------------------------------------------------------------- a fake WebSocket and clock
class FakeSocket implements WebSocketLike {
  readyState = 0; sent: Record<string, unknown>[] = []; closed = false;
  onopen: ((ev: unknown) => void) | null = null; onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null; onerror: ((ev: unknown) => void) | null = null;
  constructor(public url: string) {}
  send(d: string) { this.sent.push(JSON.parse(d)); }
  close() { if (this.closed) return; this.closed = true; this.readyState = 3; this.onclose?.({}); }
  open() { this.readyState = 1; this.onopen?.({}); }
  server(m: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify(m) }); }
  dropByServer() { this.readyState = 3; this.closed = true; this.onclose?.({}); }
}
function rig(tokens: string[] = ['T1']) {
  const sockets: FakeSocket[] = []; const timers: { fn: () => void; ms: number; id: number; off?: boolean }[] = []; let n = 0;
  const changes: number[] = []; const states: boolean[] = []; let ti = 0;
  const live = new LiveInvites({
    url: 'https://proj.supabase.co', anonKey: 'ANON KEY',
    token: async () => tokens[Math.min(ti++, tokens.length - 1)],
    onChange: () => changes.push(1), onState: v => states.push(v),
    makeSocket: u => { const s = new FakeSocket(u); sockets.push(s); return s; },
    setTimer: (fn, ms) => { const t = { fn, ms, id: ++n }; timers.push(t); return t.id; },
    clearTimer: id => { const t = timers.find(x => x.id === id); if (t) t.off = true; },
  });
  const fire = async (ms: number) => { const t = timers.find(x => !x.off && x.ms === ms); assert.ok(t, `a timer of ${ms} ms`); t.off = true; t.fn(); await tick(); };
  return { live, sockets, timers, changes, states, fire };
}
const tick = () => new Promise(r => setTimeout(r, 0));
const joinOk = (s: FakeSocket) => { const j = s.sent.find(m => m.event === 'phx_join')!; s.server({ topic: TOPIC, event: 'phx_reply', ref: j.ref, payload: { status: 'ok', response: { postgres_changes: [{ id: 1 }] } } }); };

test('L1 the connection address and the join message follow the Supabase Realtime protocol', () => {
  assert.equal(socketUrl('https://proj.supabase.co/', 'A K'), 'wss://proj.supabase.co/realtime/v1/websocket?apikey=A%20K&vsn=1.0.0');
  const j = joinMessage('JWT', '3') as { topic: string; event: string; payload: { access_token: string; config: { postgres_changes: unknown[]; private: boolean } } };
  assert.equal(j.topic, 'realtime:eab-team-invites'); assert.equal(j.event, 'phx_join');
  assert.equal(j.payload.access_token, 'JWT', 'the sign-in token: the database decides who hears what');
  assert.deepEqual(j.payload.config.postgres_changes, [{ event: '*', schema: 'public', table: 'eab_team_invites' }]);
});

test('L2 joined: one look at once (to catch up), then one look per change; heartbeat every 25 s', async () => {
  const r = rig(); r.live.start(); await tick();
  const s = r.sockets[0]; s.open();
  assert.equal(s.sent[0].event, 'phx_join');
  joinOk(s);
  assert.deepEqual(r.states, [true]); assert.equal(r.live.connected, true);
  assert.equal(r.changes.length, 1, 'catch-up look when connected');
  s.server({ topic: TOPIC, event: 'postgres_changes', payload: { ids: [1], data: { type: 'INSERT', table: 'eab_team_invites' } } });
  assert.equal(r.changes.length, 2);
  s.server({ topic: 'realtime:something-else', event: 'postgres_changes', payload: {} });
  s.server({ topic: TOPIC, event: 'presence_state', payload: {} });
  s.onmessage!({ data: 'not json' });
  assert.equal(r.changes.length, 2, 'other topics, other events and garbage are ignored');
  await r.fire(HEARTBEAT_MS);
  assert.ok(s.sent.some(m => m.topic === 'phoenix' && m.event === 'heartbeat'));
});

test('L3 a renewed sign-in token is handed to the open channel without reconnecting', async () => {
  const r = rig(['T1', 'T2']); r.live.start(); await tick();
  const s = r.sockets[0]; s.open(); joinOk(s);
  await r.fire(HEARTBEAT_MS);
  const at = s.sent.find(m => m.event === 'access_token') as { payload: { access_token: string } } | undefined;
  assert.equal(at?.payload.access_token, 'T2'); assert.equal(r.sockets.length, 1);
});

test('L4 lost connection: it connects again after 2 s, 5 s, 15 s, 30 s, then every minute; a good join resets that', async () => {
  const r = rig(); r.live.start(); await tick();
  for (let i = 0; i < 6; i++) { r.sockets[r.sockets.length - 1].dropByServer(); await r.fire(RETRY_MS[Math.min(i, RETRY_MS.length - 1)]); }
  assert.equal(r.sockets.length, 7);
  const s = r.sockets[6]; s.open(); joinOk(s);
  s.dropByServer();
  assert.ok(r.timers.some(t => !t.off && t.ms === RETRY_MS[0]), 'back to 2 s after a good connection');
  assert.equal(r.live.connected, false);
});

test('L5 a refused join or a channel error closes and reconnects; stop() closes and never reconnects', async () => {
  const r = rig(); r.live.start(); await tick();
  let s = r.sockets[0]; s.open();
  const j = s.sent[0];
  s.server({ topic: TOPIC, event: 'phx_reply', ref: j.ref, payload: { status: 'error', response: { reason: 'InvalidJWTExpiration: Token has expired' } } });
  assert.equal(s.closed, true); await r.fire(RETRY_MS[0]);
  s = r.sockets[1]; s.open(); joinOk(s);
  s.server({ topic: TOPIC, event: 'system', payload: { status: 'error', extension: 'system', message: 'Server requested disconnect' } });
  assert.equal(s.closed, true, 'a channel error ends the socket');
  s = r.sockets.length > 2 ? r.sockets[2] : s;
  r.live.stop();
  assert.ok(r.timers.every(t => t.off), 'no timer left after stop (no battery use in the background)');
  const before = r.sockets.length;
  await tick();
  assert.equal(r.sockets.length, before);
  r.live.start(); await tick();
  assert.equal(r.sockets.length, before + 1, 'starting again (app back on screen) connects again');
});

test('L6 a postgres_changes error (not a channel error) does not drop the connection', async () => {
  const r = rig(); r.live.start(); await tick();
  const s = r.sockets[0]; s.open(); joinOk(s);
  s.server({ topic: TOPIC, event: 'system', payload: { status: 'error', extension: 'postgres_changes', message: 'Too many database timeouts' } });
  assert.equal(s.closed, false);
});

// ---------------------------------------------------------------- push registration on the phone
test('P1 the phone gives its address to the cloud once a week, again when another person signs in; a refusal is not remembered', async () => {
  const cloud = new FakeTeamCloud();
  const a = await agentPhone(cloud, 'a@x.com', 'Aina');
  const calls: { path: string; body: Record<string, unknown> }[] = []; let ok = true;
  const f = (async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname;
    if (path === '/rest/v1/rpc/eab_push_register') { calls.push({ path, body: JSON.parse(String(init.body)) }); return new Response(null, { status: ok ? 204 : 404 }); }
    return cloud.fetch(url, init);
  }) as typeof fetch;
  const T = 'fcm-token-1234567890abcdef';
  ok = false;
  assert.equal(await registerToken(a.store, cfg, T, 'bm', f, 1000), false, 'SQL not applied yet');
  assert.equal(a.store.getState().meta.push, undefined, 'not remembered: tried again next time');
  ok = true;
  assert.equal(await registerToken(a.store, cfg, T, 'bm', f, 2000), true);
  assert.deepEqual(calls[1].body, { p_token: T, p_platform: 'android', p_lang: 'bm' });
  await registerToken(a.store, cfg, T, 'bm', f, 3000);
  assert.equal(calls.length, 2, 'unchanged: not sent again');
  await registerToken(a.store, cfg, T, 'en', f, 4000);
  assert.equal(calls.length, 3, 'language changed: sent again');
  await registerToken(a.store, cfg, T, 'en', f, 4000 + REREGISTER_MS);
  assert.equal(calls.length, 4, 'a week later: sent again');
  a.store.setSingleton('meta', { syncSession: { ...a.store.getState().meta.syncSession!, userId: 'someone-else' } });
  await registerToken(a.store, cfg, T, 'en', f, 4001 + REREGISTER_MS);
  assert.equal(calls.length, 5, 'another person signed in: sent again (the address moves to them)');
});

test('P2 push counts as active only for the person it was registered for, and only in a push build (or marked as a test)', async () => {
  const cloud = new FakeTeamCloud();
  const a = await agentPhone(cloud, 'a@x.com', 'Aina');
  assert.equal(pushActive(a.store), false);
  const uid = a.store.getState().meta.syncSession!.userId;
  a.store.setSingleton('meta', { push: { token: 'x'.repeat(30), userId: uid, lang: 'en', at: Date.now() } });
  assert.equal(pushActive(a.store), false, 'this test build has no Firebase settings');
  a.store.setSingleton('meta', { push: { token: 'x'.repeat(30), userId: uid, lang: 'en', at: Date.now(), test: true } });
  assert.equal(pushActive(a.store), true);
  assert.equal(pushActive(a.store, Date.now() + 5 * REREGISTER_MS), false, 'a very old registration does not count');
  a.store.setSingleton('meta', { syncSession: { ...a.store.getState().meta.syncSession!, userId: 'other' } });
  assert.equal(pushActive(a.store), false, 'registered for someone else');
});

test('P3 sending, accepting and declining ask the notify-invite function; a link invitation does not; a missing function changes nothing', async () => {
  const cloud = new FakeTeamCloud();
  const a = await agentPhone(cloud, 'a@x.com', 'Aina');
  const b = await agentPhone(cloud, 'b@x.com', 'Badrul');
  const asked: { kind: string; invite: string; auth: string }[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    if (new URL(url).pathname === '/functions/v1/notify-invite') {
      const j = JSON.parse(String(init.body)); asked.push({ kind: j.kind, invite: j.invite_id, auth: new Headers(init.headers).get('authorization') ?? '' });
      return new Response('not found', { status: 404 });                  // not deployed: must not matter
    }
    return cloud.fetch(url, init);
  }) as typeof fetch;
  const r = await sendInvite(a.store, cfg, 'b@x.com', f);
  await tick();
  assert.deepEqual(asked.map(x => x.kind), ['invite']); assert.equal(asked[0].invite, r.invite_id);
  assert.match(asked[0].auth, /^Bearer /, 'as the signed-in sender');
  await acceptInvite(b.store, cfg, { inviteId: r.invite_id }, f);
  await tick();
  assert.deepEqual(asked.map(x => x.kind), ['invite', 'answer']);
  assert.ok((b.store.getState().meta.team?.members ?? []).length >= 1, 'accepted as usual although the function is missing');
  await sendInvite(a.store, cfg, null, f).catch(() => undefined);
  await tick();
  assert.equal(asked.length, 2, 'a link invitation names nobody: nothing to announce');
  assert.equal(await announce(a.store, cfg, r.invite_id, 'invite', (async () => { throw new TypeError('offline'); }) as typeof fetch), false, 'offline: no error');
  void declineInvite;
});

test('P4 signing out removes this phone\'s address first (with the session that is ending)', async () => {
  const seen: string[] = [];
  const f = (async (url: string, init: RequestInit = {}) => { seen.push(`${new URL(url).pathname} ${String(init.body ?? '')}`); return new Response(null, { status: 204 }); }) as typeof fetch;
  setPushTokenForTest('fcm-token-abcdefghijklmnop');
  const s = { accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 3600_000, email: 'a@x.com', userId: 'u1', workspaceId: 'w1' };
  await signOutRemote(cfg, s as never, f);
  assert.deepEqual(seen, ['/rest/v1/rpc/eab_push_unregister {"p_token":"fcm-token-abcdefghijklmnop"}', '/auth/v1/logout ']);
  await unregisterPush(cfg, s as never, (async () => { throw new TypeError('offline'); }) as typeof fetch);   // never throws
  setPushTokenForTest(undefined);
});

// ---------------------------------------------------------------- the notify-invite function (server)
const UID_A = 'aaaaaaaa-0000-0000-0000-000000000001'; const INV = '11111111-2222-3333-4444-555555555555';
async function serviceAccount() {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  const b64 = Buffer.from(der).toString('base64').replace(/(.{64})/g, '$1\n');
  return { kp, json: JSON.stringify({ type: 'service_account', project_id: 'eab-qa', client_email: 'fcm@eab-qa.iam.gserviceaccount.com', private_key: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n` }) };
}
function fakeServer(targets: { token: string; lang: string; kind: string; who: string }[], opts: { user?: string | null; fcm?: (token: string) => Response } = {}) {
  const log: { url: string; body: string; auth: string }[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    const h = new Headers(init.headers); const body = String(init.body ?? '');
    log.push({ url, body, auth: h.get('authorization') ?? '' });
    if (url.endsWith('/auth/v1/user')) return opts.user === null ? new Response('no', { status: 401 }) : new Response(JSON.stringify({ id: opts.user ?? UID_A }), { status: 200 });
    if (url.endsWith('/rest/v1/rpc/eab_push_claim')) return new Response(JSON.stringify(targets), { status: 200 });
    if (url.endsWith('/rest/v1/rpc/eab_push_drop')) return new Response(null, { status: 204 });
    if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'GOOGLE-AT' }), { status: 200 });
    if (url.startsWith('https://fcm.googleapis.com/')) return opts.fcm ? opts.fcm(JSON.parse(body).message.token) : new Response('{}', { status: 200 });
    return new Response('?', { status: 500 });
  }) as typeof fetch;
  return { f, log };
}
const env = (sa?: string): Env => ({ SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'ANON', SUPABASE_SERVICE_ROLE_KEY: 'SERVICE', FCM_SERVICE_ACCOUNT: sa });

test('F1 the function refuses bad requests and callers who are not signed in, before touching the database', async () => {
  const s = fakeServer([]);
  assert.equal((await handle('Bearer x', { invite_id: 'not-a-uuid', kind: 'invite' }, env(), s.f)).status, 400);
  assert.equal((await handle('Bearer x', { invite_id: INV, kind: 'spam' }, env(), s.f)).status, 400);
  assert.equal((await handle(null, { invite_id: INV, kind: 'invite' }, env(), s.f)).status, 401);
  const n = fakeServer([], { user: null });
  assert.equal((await handle('Bearer bad', { invite_id: INV, kind: 'invite' }, env(), n.f)).status, 401);
  assert.ok(!s.log.concat(n.log).some(x => x.url.includes('eab_push_claim')), 'the database is never asked');
});

test('F2 the database is asked with the CALLER\'s id (from Supabase Auth), using the service key; nothing to send = nothing sent', async () => {
  const s = fakeServer([]);
  const r = await handle('Bearer USERJWT', { invite_id: INV, kind: 'invite', p_caller: 'someone-else' }, env('{}'), s.f);
  assert.deepEqual(r, { status: 200, body: { sent: 0 } });
  const who = s.log.find(x => x.url.endsWith('/auth/v1/user'))!; assert.equal(who.auth, 'Bearer USERJWT');
  const claim = s.log.find(x => x.url.endsWith('eab_push_claim'))!;
  assert.deepEqual(JSON.parse(claim.body), { p_invite: INV, p_kind: 'invite', p_caller: UID_A }, 'a caller cannot claim to be someone else');
  assert.equal(claim.auth, 'Bearer SERVICE');
  assert.ok(!s.log.some(x => x.url.includes('googleapis')));
});

test('F3 without the Firebase secret it says so and sends nothing', async () => {
  const s = fakeServer([{ token: 'T1', lang: 'en', kind: 'invite', who: 'Aina' }]);
  assert.deepEqual(await handle('Bearer U', { invite_id: INV, kind: 'invite' }, env(undefined), s.f), { status: 200, body: { sent: 0, reason: 'push not configured' } });
});

test('F4 one message per phone, in that phone\'s language, signed by the service account; unknown addresses are removed', async () => {
  const { kp, json } = await serviceAccount();
  const s = fakeServer([{ token: 'TOK-B1', lang: 'bm', kind: 'invite', who: 'Aina' }, { token: 'TOK-GONE', lang: 'zh', kind: 'invite', who: 'Aina' }, { token: 'TOK-ERR', lang: 'en', kind: 'invite', who: '' }],
    { fcm: t => (t === 'TOK-GONE' ? new Response('{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}', { status: 404 }) : t === 'TOK-ERR' ? new Response('busy', { status: 503 }) : new Response('{}', { status: 200 })) });
  const r = await handle('Bearer U', { invite_id: INV, kind: 'invite' }, env(json), s.f, Date.UTC(2026, 9, 18));
  assert.deepEqual(r, { status: 200, body: { sent: 1, dropped: 1, failed: 1 } });
  const sends = s.log.filter(x => x.url.startsWith('https://fcm.googleapis.com/v1/projects/eab-qa/messages:send'));
  assert.equal(sends.length, 3); assert.equal(sends[0].auth, 'Bearer GOOGLE-AT');
  const m = JSON.parse(sends[0].body).message;
  assert.equal(m.token, 'TOK-B1');
  assert.deepEqual(m.notification, { title: 'Jemputan pasukan', body: 'Aina menjemput anda ke Ruang Kerja Pasukan. Buka aplikasi untuk menjawab.' });
  assert.deepEqual(m.data, { type: 'team-invite', kind: 'invite', invite_id: INV }, 'no invitation link or secret in the message');
  assert.equal(JSON.stringify(m).includes('token_hash'), false);
  assert.deepEqual(JSON.parse(s.log.find(x => x.url.endsWith('eab_push_drop'))!.body), { p_token: 'TOK-GONE' });
  // the Google sign-in: a JWT signed with the service account's key, for the FCM scope only
  const form = new URLSearchParams(s.log.find(x => x.url === 'https://oauth2.googleapis.com/token')!.body);
  assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  const [h, c, sig] = form.get('assertion')!.split('.');
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
  assert.equal(claims.iss, 'fcm@eab-qa.iam.gserviceaccount.com'); assert.equal(claims.scope, 'https://www.googleapis.com/auth/firebase.messaging');
  assert.equal(claims.exp - claims.iat, 3600);
  assert.equal(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', kp.publicKey, Buffer.from(sig, 'base64url'), new TextEncoder().encode(`${h}.${c}`)), true, 'valid RS256 signature');
});

test('F5 message wording in each language, for an invitation and both answers', () => {
  assert.deepEqual(messageFor({ token: 't', lang: 'en', kind: 'accepted', who: 'Badrul' }), { title: 'Invitation accepted', body: 'Badrul answered your Team Workspace invitation. Open the app to see.' });
  assert.equal(messageFor({ token: 't', lang: 'zh', kind: 'declined', who: 'b@x.com' }).title, '邀请被拒绝');
  assert.equal(messageFor({ token: 't', lang: 'xx', kind: 'invite', who: '' }).body, 'An agent invited you to a Team Workspace. Open the app to answer.', 'unknown language: English; no name: "An agent"');
});

test('F6 a broken secret or a Google refusal is reported, never crashes silently', async () => {
  const s = fakeServer([{ token: 'T', lang: 'en', kind: 'invite', who: 'A' }]);
  assert.equal((await handle('Bearer U', { invite_id: INV, kind: 'invite' }, env('not json'), s.f)).status, 500);
  const { json } = await serviceAccount();
  const bad = (async () => new Response('denied', { status: 403 })) as typeof fetch;
  await assert.rejects(googleToken(JSON.parse(json), bad), /google token 403/);
});
