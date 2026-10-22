// MainForAdmin-F: the agent's own Contact number (Agent Profile) goes to the company's database (eab_set_my_phone), so
// Admin EAB can send WhatsApp broadcasts. A stand-in answers like the database; no real Supabase project is used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { checkAccount, phoneForServer } from '../src/security/account';

const cfg = { supabaseUrl: 'https://mf-test.supabase.co', supabaseAnonKey: 'anon' };

async function signedIn(user = 'u1', phone?: string) {
  const store = await Store.open(new MemoryBackend());
  store.setSingleton('settings', { supabaseUrl: cfg.supabaseUrl, supabaseAnonKey: cfg.supabaseAnonKey });
  store.setSingleton('meta', { syncSession: { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 3600_000, email: `${user}@x.c`, userId: user, signedInAt: Date.now() } });
  if (phone !== undefined) store.setSingleton('profile', { phone });
  return store;
}

/** Replaces fetch with a fake database. phone: 'ok' | 'missing' (older database) | 'refuse' | 'offline'. */
function fakeDb(phone: 'ok' | 'missing' | 'refuse' | 'offline' = 'ok') {
  const calls: { fn: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const fn = String(url).split('/rpc/')[1];
    const body = JSON.parse(String(init.body || '{}'));
    calls.push({ fn, body });
    if (fn === 'eab_my_account') return Response.json({ status: 'active', terms: null, marketing: null, licence: null });
    if (fn === 'eab_set_my_phone') {
      if (phone === 'offline') throw new TypeError('Failed to fetch');
      if (phone === 'missing') return new Response('{"code":"PGRST202","message":"Could not find the function"}', { status: 404 });
      if (phone === 'refuse') return new Response('{"code":"22023","message":"invalid phone number"}', { status: 400 });
      return Response.json(true);
    }
    return Response.json(true);
  }) as typeof fetch;
  return { calls, sent: () => calls.filter(c => c.fn === 'eab_set_my_phone').map(c => c.body.p_phone) };
}

test('F-1 the number is cleaned like the database does; anything that is not a phone number is not sent', () => {
  assert.equal(phoneForServer('+60 12-345 6789'), '+60123456789');
  assert.equal(phoneForServer('(012) 345.6789'), '0123456789');
  assert.equal(phoneForServer(''), '');
  assert.equal(phoneForServer(undefined), '');
  assert.equal(phoneForServer('   '), '');
  assert.equal(phoneForServer('call me'), undefined);
  assert.equal(phoneForServer('1234567'), undefined, 'too short');
  assert.equal(phoneForServer('+1234567890123456'), undefined, 'too long');
});

test('F-2 sent once after sign-in, not again while unchanged, again when it changes', async () => {
  const db = fakeDb();
  const store = await signedIn('u1', '012-345 6789');
  assert.equal(await checkAccount(store, cfg), 'ok');
  assert.deepEqual(db.sent(), ['0123456789']);
  await checkAccount(store, cfg);
  assert.deepEqual(db.sent(), ['0123456789'], 'unchanged: not sent again');
  store.setSingleton('profile', { phone: '+60 11 2222 3333' });
  await checkAccount(store, cfg);
  assert.deepEqual(db.sent(), ['0123456789', '+601122223333']);
  store.setSingleton('profile', { phone: '' });
  await checkAccount(store, cfg);
  assert.deepEqual(db.sent(), ['0123456789', '+601122223333', null], 'number removed: the company copy is cleared');
});

test('F-3 an empty profile never sends anything; a non-number is not sent', async () => {
  const db = fakeDb();
  const store = await signedIn('u1');
  await checkAccount(store, cfg);
  store.setSingleton('profile', { phone: 'ask office' });
  await checkAccount(store, cfg);
  assert.deepEqual(db.sent(), []);
});

test('F-4 another person signing in on the same phone sends the number for that person', async () => {
  const db = fakeDb();
  const store = await signedIn('u1', '0123456789');
  await checkAccount(store, cfg);
  store.setSingleton('meta', { syncSession: { ...store.getState().meta.syncSession!, userId: 'u2' } });
  await checkAccount(store, cfg);
  assert.deepEqual(db.sent(), ['0123456789', '0123456789']);
});

test('F-5 offline: tried again next time; older database or a refused number: not asked again until it changes', async () => {
  let db = fakeDb('offline');
  const store = await signedIn('u1', '0123456789');
  assert.equal(await checkAccount(store, cfg), 'ok', 'the account check still finishes');
  assert.equal(store.getState().meta.phoneSent, undefined);
  db = fakeDb('ok');
  await checkAccount(store, cfg);
  assert.deepEqual(db.sent(), ['0123456789'], 'sent once back online');

  for (const kind of ['missing', 'refuse'] as const) {
    db = fakeDb(kind);
    const s2 = await signedIn('u1', '0199999999');
    assert.equal(await checkAccount(s2, cfg), 'ok', `${kind}: the app keeps working`);
    await checkAccount(s2, cfg);
    assert.equal(db.sent().length, 1, `${kind}: asked once only`);
  }
});
