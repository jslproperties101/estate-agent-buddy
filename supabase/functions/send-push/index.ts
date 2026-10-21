// Supabase Edge Function "send-push" (JoyChange002 Change 25): tells a phone about a Team Workspace invitation, or tells
// the sender that it was answered, through Firebase Cloud Messaging, so it arrives even when the app is closed.
//
// The app calls it right after sending, accepting or declining an invitation:
//   POST /functions/v1/send-push   { "kind": "invite", "invite_id": "<uuid>" }   (by the sender)
//   POST /functions/v1/send-push   { "kind": "answer", "invite_id": "<uuid>" }   (by the person who answered; invite_id
//                                                                                   may be left out after accepting a link)
// Who may trigger what is checked here against the database, with the caller's own sign-in:
//  - "invite": only the person who sent that invitation, while it is still waiting, and only for an email invitation;
//  - "answer": only the person who answered it.
// Each invitation is pushed at most once per kind (table eab_push_sent), however often this is called.
//
// JoyChange010-03: push alerts for Admin EAB posts (Market News, Projects, announcements with "send alert" on):
//   POST /functions/v1/send-push   { "kind": "feed", "item_id": "<uuid>" }   one post
//   POST /functions/v1/send-push   { "kind": "feed" }                        every post waiting to be sent
// Called by Admin EAB with the ADMIN'S sign-in. The post is claimed with that sign-in (eab_push_feed_claim: Owner or
// Admin only, written to the admin audit log, at most once per post). Each agent who may see the post gets it on every
// registered phone, in the phone's language; the result per agent (sent / failed / no phone) is recorded for the
// sent / delivered / opened counts (eab_admin_push_report). Answer: { "items": [ { item_id, targeted, sent, failed, no_phone } ] }.
// Secrets (Supabase → Edge Functions → Secrets):
//   FCM_SERVICE_ACCOUNT   the whole Firebase service-account JSON (Firebase console → Project settings → Service accounts
//                         → Generate new private key). Required; without it the function answers 503 "not set up".
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

const TEXT: Record<string, { inviteTitle: string; inviteBody: (who: string) => string; acceptedTitle: string; declinedTitle: string; answerBody: (who: string) => string }> = {
  en: { inviteTitle: 'Team Workspace invitation', inviteBody: w => `${w} invited you to their Team Workspace. Open the app to answer.`,
    acceptedTitle: 'Invitation accepted', declinedTitle: 'Invitation declined', answerBody: w => `${w} answered your Team Workspace invitation.` },
  bm: { inviteTitle: 'Jemputan Ruang Kerja Pasukan', inviteBody: w => `${w} menjemput anda ke Ruang Kerja Pasukan mereka. Buka aplikasi untuk menjawab.`,
    acceptedTitle: 'Jemputan diterima', declinedTitle: 'Jemputan ditolak', answerBody: w => `${w} telah menjawab jemputan Ruang Kerja Pasukan anda.` },
  zh: { inviteTitle: '团队工作区邀请', inviteBody: w => `${w} 邀请您加入他们的团队工作区。打开应用回复。`,
    acceptedTitle: '邀请已接受', declinedTitle: '邀请已拒绝', answerBody: w => `${w} 已回复您的团队工作区邀请。` },
};

const URL_ = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = (path: string, init: RequestInit = {}) => fetch(`${URL_}/rest/v1/${path}`, {
  ...init, headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
});
const q = encodeURIComponent;
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
// A database function run with the CALLER'S sign-in (so the database checks the caller's role itself).
const asCaller = (auth: string, fn: string, body: unknown) => fetch(`${URL_}/rest/v1/rpc/${fn}`, {
  method: 'POST', headers: { apikey: ANON, authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const asService = (fn: string, body: unknown) => admin(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(body) });

// ---------- Firebase: a short-lived access token from the service account ----------
const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b));
  let s = ''; for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
let cached: { token: string; until: number } | null = null;
async function googleToken(sa: { client_email: string; private_key: string; token_uri?: string }): Promise<string> {
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claim}`));
  const r = await fetch(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${q('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${head}.${claim}.${b64url(sig)}`,
  });
  if (!r.ok) throw new Error(`google token ${r.status}`);
  const j = await r.json();
  cached = { token: j.access_token, until: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cached.token;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const saText = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!saText) return json({ error: 'not set up' }, 503);
  let sa: { project_id: string; client_email: string; private_key: string; token_uri?: string };
  try { sa = JSON.parse(saText); } catch { return json({ error: 'service account is not valid JSON' }, 503); }

  // Who is calling (Supabase has already checked the token is genuine).
  const auth = req.headers.get('authorization') ?? '';
  const me = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: SERVICE, authorization: auth } });
  if (!me.ok) return json({ error: 'not signed in' }, 401);
  const caller = await me.json() as { id: string; email?: string; user_metadata?: { full_name?: string; name?: string } };
  const callerName = caller.user_metadata?.full_name || caller.user_metadata?.name || caller.email || '';

  let body: { kind?: string; invite_id?: string; item_id?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad request' }, 400); }
  const kind = body.kind;
  if (kind === 'feed') return sendFeed(sa, auth, body.item_id);
  const id = body.invite_id && /^[0-9a-f-]{36}$/i.test(body.invite_id) ? body.invite_id : undefined;
  if (kind !== 'invite' && kind !== 'answer') return json({ error: 'bad request' }, 400);

  // The invitation, as only the caller may use it.
  let inv: { id: string; email: string | null; invited_by: string; status: string } | undefined;
  if (kind === 'invite') {
    if (!id) return json({ error: 'bad request' }, 400);
    const r = await admin(`eab_team_invites?id=eq.${q(id)}&invited_by=eq.${q(caller.id)}&status=eq.pending&select=id,email,invited_by,status`);
    inv = (await r.json())[0];
  } else {
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const r = await admin(`eab_team_invites?responded_by=eq.${q(caller.id)}&status=in.(accepted,declined)${id ? `&id=eq.${q(id)}` : `&responded_at=gte.${q(since)}`}&order=responded_at.desc&limit=1&select=id,email,invited_by,status`);
    inv = (await r.json())[0];
  }
  if (!inv) return json({ sent: 0, reason: 'no such invitation for you' }, 404);
  if (kind === 'invite' && !inv.email) return json({ sent: 0, reason: 'link invitation: no address to send to' });

  // Where to send it (looked up first, so an invitation is not marked as sent when there was nowhere to send it).
  const who = kind === 'invite' ? `email=eq.${q(inv.email!)}` : `user_id=eq.${q(inv.invited_by)}`;
  const tokens = await (await admin(`eab_push_tokens?${who}&select=token,lang`)).json() as { token: string; lang: string }[];
  if (!tokens.length) return json({ sent: 0, reason: 'the other person has no phone registered yet' });

  // Once per invitation and kind.
  const mark = await admin('eab_push_sent', { method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ invite_id: inv.id, kind }) });
  if (!mark.ok || !(await mark.json()).length) return json({ sent: 0, reason: 'already sent' });

  const access = await googleToken(sa);
  let sent = 0;
  for (const t of tokens) {
    const x = TEXT[t.lang] ?? TEXT.en;
    const title = kind === 'invite' ? x.inviteTitle : inv.status === 'accepted' ? x.acceptedTitle : x.declinedTitle;
    const text = kind === 'invite' ? x.inviteBody(callerName) : x.answerBody(callerName);
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST', headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message: {
        token: t.token, notification: { title, body: text }, data: { kind, invite_id: inv.id },
        android: { priority: 'high', notification: { channel_id: 'invites' } },
      } }),
    });
    if (r.ok) { sent++; continue; }
    // A phone that uninstalled the app or turned notifications off for good: forget its address.
    const err = await r.text();
    if (r.status === 404 || /UNREGISTERED/.test(err)) await admin(`eab_push_tokens?token=eq.${q(t.token)}`, { method: 'DELETE' });
  }
  return json({ sent });
});

// ---------- JoyChange010-03: push alerts for Admin EAB posts ----------
type Recipient = { user_id: string; token: string | null; lang: string; title: string; body: string };
type Outcome = { user_id: string; status: 'sent' | 'failed' | 'no_phone'; error?: string };

async function sendFeed(sa: { project_id: string; client_email: string; private_key: string; token_uri?: string }, auth: string, itemId?: string): Promise<Response> {
  const uuid = /^[0-9a-f-]{36}$/i;
  let ids: string[];
  if (itemId !== undefined) {
    if (!uuid.test(itemId)) return json({ error: 'bad request' }, 400);
    ids = [itemId];
  } else {
    const r = await asCaller(auth, 'eab_push_feed_queued', {});
    if (r.status === 401 || r.status === 403) return json({ error: 'not allowed' }, 403);
    if (!r.ok) return json({ error: 'not allowed' }, 403);   // the database refuses anyone who is not Owner or Admin
    ids = ((await r.json()) as string[] | null) ?? [];
  }
  const items: unknown[] = [];
  for (const id of ids) {
    const c = await asCaller(auth, 'eab_push_feed_claim', { p_item: id, p_device: 'send-push' });
    if (!c.ok) return json({ error: 'not allowed', items }, 403);
    if ((await c.json()) !== true) { items.push({ item_id: id, skipped: 'already sent, withdrawn, alert off or not yet due' }); continue; }
    const rr = await asService('eab_push_feed_recipients', { p_item: id });
    if (!rr.ok) { items.push({ item_id: id, error: 'could not list recipients' }); continue; }   // claim expires after 15 minutes: try again then
    const rows = await rr.json() as Recipient[];
    const access = rows.some(x => x.token) ? await googleToken(sa) : '';
    const byUser = new Map<string, Recipient[]>();
    for (const x of rows) byUser.set(x.user_id, [...(byUser.get(x.user_id) ?? []), x]);
    const outcomes: Outcome[] = [];
    const users = [...byUser.entries()];
    for (let i = 0; i < users.length; i += 20) {   // 20 agents at a time
      outcomes.push(...await Promise.all(users.slice(i, i + 20).map(([user, phones]) => sendToAgent(sa, access, id, user, phones))));
    }
    const f = await asService('eab_push_feed_finish', { p_item: id, p_results: outcomes });
    items.push({ item_id: id, ...(f.ok ? await f.json() : { error: 'could not save the result' }) });
  }
  return json({ items });
}

async function sendToAgent(sa: { project_id: string }, access: string, itemId: string, user: string, phones: Recipient[]): Promise<Outcome> {
  const live = phones.filter(p => p.token);
  if (!live.length) return { user_id: user, status: 'no_phone' };
  let ok = false; let error: string | undefined;
  for (const p of live) {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST', headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message: {
        token: p.token, notification: { title: p.title, ...(p.body ? { body: p.body } : {}) }, data: { kind: 'feed', item_id: itemId },
        android: { priority: 'high', notification: { channel_id: 'news' } },
      } }),
    });
    if (r.ok) { ok = true; continue; }
    const err = await r.text();
    error = (/"status":\s*"([A-Z_]+)"/.exec(err)?.[1] ?? `http_${r.status}`).toLowerCase();
    if (r.status === 404 || /UNREGISTERED/.test(err)) await admin(`eab_push_tokens?token=eq.${q(p.token!)}`, { method: 'DELETE' });
  }
  return ok ? { user_id: user, status: 'sent' } : { user_id: user, status: 'failed', error };
}
