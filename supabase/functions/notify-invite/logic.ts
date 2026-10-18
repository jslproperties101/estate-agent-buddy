// Change 25: the part of the notify-invite function that does the work, kept free of Deno so the app's Node tests can
// check it with a fake Google and a fake database (app/tests/change024-025.test.ts). index.ts only wires it to Deno.
//
// Flow: the caller is the signed-in agent whose phone has just sent an invitation ('invite') or answered one ('answer').
//  1. Supabase checked the caller's sign-in token before this code runs; we ask Supabase Auth who it is.
//  2. eab_push_claim (database, service role only) checks the caller may announce it, marks it announced (once only) and
//     returns the FCM addresses of the ONE person to tell, their app language and a display name.
//  3. Google OAuth (service account, signed here) gives a short-lived FCM access token; one message per address.
//  4. An address Google no longer knows (app uninstalled) is removed.
// Nothing is sent when the FCM service account secret is not set: the answer says so and the app carries on.

export interface Env { SUPABASE_URL: string; SUPABASE_ANON_KEY: string; SUPABASE_SERVICE_ROLE_KEY: string; FCM_SERVICE_ACCOUNT?: string }
export interface Result { status: number; body: Record<string, unknown> }
type FetchFn = typeof fetch;
interface Target { token: string; lang: string; kind: string; who: string }

export const TEXT: Record<string, { invite: [string, (w: string) => string]; accepted: [string, (w: string) => string]; declined: [string, (w: string) => string] }> = {
  en: {
    invite: ['Team invitation', w => `${w} invited you to a Team Workspace. Open the app to answer.`],
    accepted: ['Invitation accepted', w => `${w} answered your Team Workspace invitation. Open the app to see.`],
    declined: ['Invitation declined', w => `${w} answered your Team Workspace invitation. Open the app to see.`],
  },
  bm: {
    invite: ['Jemputan pasukan', w => `${w} menjemput anda ke Ruang Kerja Pasukan. Buka aplikasi untuk menjawab.`],
    accepted: ['Jemputan diterima', w => `${w} telah menjawab jemputan Ruang Kerja Pasukan anda. Buka aplikasi untuk melihat.`],
    declined: ['Jemputan ditolak', w => `${w} telah menjawab jemputan Ruang Kerja Pasukan anda. Buka aplikasi untuk melihat.`],
  },
  zh: {
    invite: ['团队邀请', w => `${w} 邀请您加入团队工作区。请打开应用回复。`],
    accepted: ['邀请已接受', w => `${w} 已回复您的团队工作区邀请。请打开应用查看。`],
    declined: ['邀请被拒绝', w => `${w} 已回复您的团队工作区邀请。请打开应用查看。`],
  },
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Text shown in the phone notification (the language the app was set to when the phone registered). */
export function messageFor(t: Target): { title: string; body: string } {
  const L = TEXT[t.lang] ?? TEXT.en;
  const k = t.kind === 'invite' ? L.invite : t.kind === 'accepted' ? L.accepted : L.declined;
  const who = t.who || (t.lang === 'bm' ? 'Seorang ejen' : t.lang === 'zh' ? '一位代理' : 'An agent');
  return { title: k[0], body: k[1](who) };
}

export async function handle(authHeader: string | null, payload: unknown, env: Env, fetchFn: FetchFn = fetch, now = Date.now()): Promise<Result> {
  const p = (payload ?? {}) as { invite_id?: unknown; kind?: unknown };
  if (typeof p.invite_id !== 'string' || !UUID.test(p.invite_id) || (p.kind !== 'invite' && p.kind !== 'answer')) return { status: 400, body: { error: 'bad request' } };
  if (!authHeader?.startsWith('Bearer ')) return { status: 401, body: { error: 'not signed in' } };
  // 1. who is calling
  const who = await fetchFn(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { authorization: authHeader, apikey: env.SUPABASE_ANON_KEY } });
  if (!who.ok) return { status: 401, body: { error: 'not signed in' } };
  const caller = ((await who.json()) as { id?: string }).id;
  if (!caller || !UUID.test(caller)) return { status: 401, body: { error: 'not signed in' } };
  // 2. whom to tell (checked, marked once, by the database)
  const svc = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json' };
  const claim = await fetchFn(`${env.SUPABASE_URL}/rest/v1/rpc/eab_push_claim`, { method: 'POST', headers: svc, body: JSON.stringify({ p_invite: p.invite_id, p_kind: p.kind, p_caller: caller }) });
  if (!claim.ok) return { status: 502, body: { error: `database ${claim.status}` } };
  const targets = ((await claim.json()) ?? []) as Target[];
  if (!targets.length) return { status: 200, body: { sent: 0 } };
  if (!env.FCM_SERVICE_ACCOUNT) return { status: 200, body: { sent: 0, reason: 'push not configured' } };
  // 3. Google
  let sa: { project_id: string; client_email: string; private_key: string; token_uri?: string };
  try { sa = JSON.parse(env.FCM_SERVICE_ACCOUNT); } catch { return { status: 500, body: { error: 'push secret is not valid JSON' } }; }
  const access = await googleToken(sa, fetchFn, now);
  let sent = 0; let dropped = 0; let failed = 0;
  for (const t of targets) {
    const m = messageFor(t);
    const r = await fetchFn(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`, {
      method: 'POST', headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message: {
        token: t.token,
        notification: m,
        data: { type: 'team-invite', kind: t.kind, invite_id: p.invite_id },
        android: { priority: 'HIGH', notification: { tag: `eab-${p.kind}-${p.invite_id}` } },
      } }),
    });
    if (r.ok) { sent++; continue; }
    const err = await r.text();
    // 4. an address that no longer exists
    if (r.status === 404 || /UNREGISTERED|registration-token-not-registered/i.test(err)) {
      await fetchFn(`${env.SUPABASE_URL}/rest/v1/rpc/eab_push_drop`, { method: 'POST', headers: svc, body: JSON.stringify({ p_token: t.token }) });
      dropped++;
    } else failed++;
  }
  return { status: 200, body: { sent, dropped, failed } };
}

const b64url = (b: Uint8Array | string) => {
  const bytes = typeof b === 'string' ? new TextEncoder().encode(b) : b;
  let s = ''; for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** A Google access token for FCM from the service account (an RS256-signed JWT exchanged at Google's token address). */
export async function googleToken(sa: { client_email: string; private_key: string; token_uri?: string }, fetchFn: FetchFn, now = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 }));
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claims}`)));
  const r = await fetchFn(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${b64url(sig)}` }).toString(),
  });
  if (!r.ok) throw new Error(`google token ${r.status}`);
  const tok = ((await r.json()) as { access_token?: string }).access_token;
  if (!tok) throw new Error('google token missing');
  return tok;
}
