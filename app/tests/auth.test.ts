// Google sign-in (Supabase PKCE): the parts that run on the phone, with Supabase answered by a stand-in.
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { challengeFor, newVerifier, authorizeUrl, handleCallback, takeDriveIntent } from '../src/data/auth';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(), key: () => null, length: 0,
} as Storage;
const cfg = { supabaseUrl: 'https://proj.supabase.co', supabaseAnonKey: 'anon' };

test('A1 PKCE: verifier format and S256 challenge (checked against Node crypto)', async () => {
  const v = newVerifier();
  assert.match(v, /^[A-Za-z0-9_-]{43,128}$/);
  assert.notEqual(newVerifier(), v);
  for (const x of [v, 'dBjftJeZ4CVP-mJ92K9qkLaxWx2u7O9eOTt1-c6Y8uw']) assert.equal(await challengeFor(x), createHash('sha256').update(x).digest('base64url'));
});

test('A2 the Google sign-in address asks Supabase for Google with PKCE and the right return address', () => {
  const u = new URL(authorizeUrl(cfg, 'com.jslproperties.estateagentbuddy://auth-callback', 'CH'));
  assert.equal(u.origin + u.pathname, 'https://proj.supabase.co/auth/v1/authorize');
  assert.equal(u.searchParams.get('provider'), 'google');
  assert.equal(u.searchParams.get('redirect_to'), 'com.jslproperties.estateagentbuddy://auth-callback');
  assert.equal(u.searchParams.get('code_challenge'), 'CH');
  assert.equal(u.searchParams.get('code_challenge_method'), 's256');
});

test('A3 return from Google: code exchanged with the saved verifier, role fetched; errors and cancels reported', async () => {
  const calls: { url: string; body?: string }[] = [];
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, body: init.body ? String(init.body) : undefined });
    if (url.includes('grant_type=pkce')) return new Response(JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_in: 3600, user: { id: 'u1', email: 'agent@gmail.com', user_metadata: { full_name: 'Agent J' } } }), { status: 200 });
    if (url.includes('eab_my_membership')) return new Response(JSON.stringify([{ workspace_id: 'w1', workspace_name: 'J team', role: 'owner' }]), { status: 200 });
    return new Response('', { status: 404 });
  }) as typeof fetch;

  assert.deepEqual(await handleCallback(cfg, 'https://localhost/', fetchFn), { kind: 'none' });

  localStorage.setItem('eab-pkce-verifier', 'VERIFIER-123');
  const r = await handleCallback(cfg, 'com.jslproperties.estateagentbuddy://auth-callback?code=abc', fetchFn);
  assert.equal(r.kind, 'signed-in');
  if (r.kind === 'signed-in') {
    assert.equal(r.session.email, 'agent@gmail.com');
    assert.equal(r.session.name, 'Agent J');
    assert.equal(r.session.role, 'owner');
    assert.equal(r.session.workspaceId, 'w1');
  }
  assert.deepEqual(JSON.parse(calls.find(c => c.url.includes('grant_type=pkce'))!.body!), { auth_code: 'abc', code_verifier: 'VERIFIER-123' });
  assert.equal(localStorage.getItem('eab-pkce-verifier'), null, 'verifier used once');

  const again = await handleCallback(cfg, 'https://localhost/?code=abc', fetchFn);
  assert.deepEqual(again, { kind: 'error', code: 'no-verifier' }, 'a code cannot be used twice');

  const cancelled = await handleCallback(cfg, 'https://localhost/?error=access_denied&error_description=User+cancelled', fetchFn);
  assert.deepEqual(cancelled, { kind: 'error', code: 'access_denied', message: 'User cancelled' });

  localStorage.setItem('eab-pkce-verifier', 'V2');
  const refused = await handleCallback(cfg, 'https://localhost/?code=bad', (async () => new Response('{"error":"invalid_grant"}', { status: 400 })) as typeof fetch);
  assert.equal(refused.kind, 'error');
});

test('A4 connecting Google Drive asks for the drive.file permission only; the Drive token comes back separately and a normal sign-in asks for nothing extra', async () => {
  const plain = new URL(authorizeUrl(cfg, 'r://cb', 'CH'));
  assert.equal(plain.searchParams.get('scopes'), null, 'ordinary sign-in is unchanged');
  const drive = new URL(authorizeUrl(cfg, 'r://cb', 'CH', { scopes: 'https://www.googleapis.com/auth/drive.file', prompt: 'consent' }));
  assert.equal(drive.searchParams.get('scopes'), 'https://www.googleapis.com/auth/drive.file');
  assert.equal(drive.searchParams.get('provider'), 'google');
  const fetchFn = (async (url: string) => {
    if (url.includes('grant_type=pkce')) return new Response(JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_in: 3600, provider_token: 'GOOGLE-TOKEN', user: { id: 'u1', email: 'agent@gmail.com' } }), { status: 200 });
    if (url.includes('eab_my_membership')) return new Response(JSON.stringify([{ workspace_id: 'w1', workspace_name: 'J team', role: 'owner' }]), { status: 200 });
    return new Response('', { status: 404 });
  }) as typeof fetch;
  localStorage.setItem('eab-pkce-verifier', 'V9');
  const r = await handleCallback(cfg, 'https://localhost/?code=zz', fetchFn);
  assert.equal(r.kind === 'signed-in' && r.providerToken, 'GOOGLE-TOKEN');
  if (r.kind === 'signed-in') assert.ok(!JSON.stringify(r.session).includes('GOOGLE-TOKEN'), 'the Google token is not part of the sign-in session');
  assert.equal(takeDriveIntent(), false);
  localStorage.setItem('eab-drive-intent', '1');
  assert.equal(takeDriveIntent(), true); assert.equal(takeDriveIntent(), false, 'the intent is used once');
});
