// "Share with MM2H office": optional link from the family's phone to the MM2H office database (Admin MM2H).
// Nothing is sent until the family signs in with Google AND ticks the consent box. What is sent: family name, the
// principal's nationality, state, arrival date, each member's name, relationship and MM2H pass expiry, and the current
// application step. Passport numbers, dates of birth, documents, photos and money details are NEVER sent.
// The family can stop at any time: "Stop sharing" deletes everything about them on the server.
// Also read here (no sign-in needed): maintenance, minimum version, announcement banner and the office's published
// content (hotspots, coupons, services, guides, lists, AI Buddy answers, rules, integration status).
import { BUILD, OFFICE } from './build-info.js';

const K = { session: 'mwab:office:session', share: 'mwab:office:share', pkce: 'mwab:office:pkce', content: 'mwab:office:content',
  status: 'mwab:office:status', errors: 'mwab:office:errors', last: 'mwab:office:last' };
const APP_ID = 'com.jslproperties.malaysiawelcome';
export const CALLBACK = `${APP_ID}://auth-callback`;

const get = (k, d = null) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const put = (k, v) => { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

const cfg = () => (OFFICE && OFFICE.url && OFFICE.key ? OFFICE : null);
export const available = () => !!cfg();
export const session = () => get(K.session);
export const sharing = () => !!get(K.share) && !!session();
export const lastShared = () => get(K.last);

const isNative = () => !!globalThis.Capacitor?.isNativePlatform?.();
const plugins = () => globalThis.Capacitor?.Plugins ?? {};
const headers = token => ({ apikey: cfg().key, Authorization: `Bearer ${token || cfg().key}`, 'Content-Type': 'application/json' });

async function http(path, { method = 'POST', body, token } = {}) {
  const r = await fetch(`${cfg().url}${path}`, { method, headers: headers(token), body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!r.ok) { const e = new Error(data?.message || data?.msg || `HTTP ${r.status}`); e.status = r.status; e.code = data?.code; throw e; }
  return data;
}
const toSession = t => ({ token: t.access_token, refresh: t.refresh_token, exp: t.expires_at ? t.expires_at * 1000 : Date.now() + (t.expires_in || 3600) * 1000, email: t.user?.email || '' });

async function fresh() {
  let s = session();
  if (!s) throw Object.assign(new Error('Sign in first'), { status: 401 });
  if (s.exp - Date.now() < 60_000) {
    try { s = toSession(await http('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: s.refresh } })); put(K.session, s); }
    catch (e) { if (e.status === 400 || e.status === 401) { put(K.session, null); put(K.share, null); } throw e; }
  }
  return s;
}
async function rpc(fn, args = {}, signedIn = true) {
  if (!available()) throw new Error('not available');
  const token = signedIn ? (await fresh()).token : undefined;
  return http(`/rest/v1/rpc/${fn}`, { body: args, token });
}

// ---------- Google sign-in (PKCE; no secret on the phone) ----------
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function redirect() { return isNative() ? CALLBACK : `${location.origin}${location.pathname}?office=1`; }

export async function signIn() {
  const v = b64url(crypto.getRandomValues(new Uint8Array(48)));
  put(K.pkce, v);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))));
  const q = new URLSearchParams({ provider: 'google', redirect_to: redirect(), code_challenge: challenge, code_challenge_method: 's256' });
  const url = `${cfg().url}/auth/v1/authorize?${q}`;
  if (isNative() && plugins().Browser) await plugins().Browser.open({ url });
  else location.assign(url);
}

/** Finishes the sign-in when Google sends the family back. Returns true when a session was made. */
export async function finishSignIn(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  const code = u.searchParams.get('code');
  if (!code || !(url.startsWith(CALLBACK) || u.searchParams.get('office') === '1')) return false;
  try { await plugins().Browser?.close?.(); } catch { /* already closed */ }
  const verifier = get(K.pkce);
  put(K.pkce, null);
  if (!verifier) throw new Error('Sign-in expired. Try again.');
  put(K.session, toSession(await http('/auth/v1/token?grant_type=pkce', { body: { auth_code: code, code_verifier: verifier } })));
  if (!isNative()) history.replaceState(history.state, '', `${location.origin}${location.pathname}${location.hash}`);
  return true;
}
export function onReturn(fn) {
  try { plugins().App?.addListener?.('appUrlOpen', e => { if (e?.url?.startsWith(CALLBACK)) fn(e.url); }); } catch { /* not native */ }
}

// ---------- sharing ----------
/** What the office receives. Kept small on purpose; see the comment at the top. */
export function payload(state) {
  const principal = state.family.find(m => m.relation === 'Principal') || state.family[0];
  const next = state.stages.find(s => s.status !== 'done');
  const done = state.stages.filter(s => s.status === 'done').length;
  return {
    consent: true,
    app_version: BUILD.version,
    family: { family_name: state.profile.familyName || '', nationality: principal?.nationality || '', city: state.profile.state || '',
      email: session()?.email || '', arrival_date: state.profile.arrival || '' },
    members: state.family.map(m => ({ id: m.id, name: m.name || '', relation: m.relation || '',
      pass_type: state.profile.tier && state.profile.tier !== 'Undecided' ? `MM2H ${state.profile.tier}` : '', pass_expiry: m.passExpiry || '' })),
    applications: [{ id: 'main', stage: next ? next.title : 'All steps done', notes: `${done} of ${state.stages.length} steps done` }],
  };
}
export async function share(state) {
  const r = await rpc('mm2h_sync', { p: payload(state) });
  put(K.share, true); put(K.last, r?.at || new Date().toISOString());
  await flushErrors();
  return r;
}
export async function stopSharing() {
  try { await rpc('mm2h_forget_me'); } finally {
    const s = session();
    if (s) { try { await http('/auth/v1/logout', { token: s.token }); } catch { /* offline */ } }
    put(K.session, null); put(K.share, null); put(K.last, null);
  }
}
export const requestData = (kind, note) => rpc('mm2h_request', { p_kind: kind, p_note: note || '' });
export const reportProblem = (subject, body) => rpc('eab_app_ticket', { p_app: 'mm2h', p_subject: subject, p_body: body });

// ---------- errors (kept on the phone; sent only while signed in to the office) ----------
export function noteError(message, screen) {
  const q = get(K.errors, []);
  q.push({ message: String(message).slice(0, 500), screen: screen || '', app_version: BUILD.version, platform: isNative() ? 'android' : 'web', at: new Date().toISOString() });
  put(K.errors, q.slice(-50));
}
export async function flushErrors() {
  const q = get(K.errors, []);
  if (!q.length || !session()) return;
  try { await rpc('eab_app_report_errors', { p_app: 'mm2h', p_events: q }); put(K.errors, []); } catch { /* try next time */ }
}

// ---------- read at start-up (no sign-in) ----------
export const cachedStatus = () => get(K.status);
export const cachedContent = () => get(K.content, []);
export async function refresh() {
  if (!available()) return { status: null, content: [] };
  const [status, content] = await Promise.all([
    rpc('eab_app_status', { p_app: 'mm2h' }, false).catch(() => cachedStatus()),
    rpc('mm2h_content_list', {}, false).catch(() => cachedContent()),
  ]);
  put(K.status, status); put(K.content, Array.isArray(content) ? content : []);
  return { status, content };
}
export const contentOf = kind => cachedContent().filter(c => c.kind === kind);

/** True when this version is older than the office's minimum (1.2.0 style). */
export function needsUpdate(min, have = BUILD.version) {
  if (!min) return false;
  const a = String(have).split('.').map(n => parseInt(n, 10) || 0), b = String(min).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0); }
  return false;
}

/** An office "AI Buddy Knowledge" answer for a question, if one matches well enough. */
export function officeAnswer(q) {
  const words = s => String(s).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3);
  const asked = new Set(words(q));
  let best = null, score = 0;
  for (const k of contentOf('knowledge')) {
    const n = words(k.title).filter(w => asked.has(w)).length;
    if (n > score) { best = k; score = n; }
  }
  return score >= 2 || (best && score >= 1 && words(best.title).length <= 2) ? best : null;
}
