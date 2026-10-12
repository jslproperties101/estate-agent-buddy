// "Continue with Google": Google sign-in through Supabase Auth with PKCE (no secret on the phone).
//  Web:     the page goes to Google and comes back to the same address with ?code=…; the code is exchanged here.
//  Android: Google opens in the phone's browser tab (Google does not allow sign-in inside an app's web view) and
//           returns to com.jslproperties.estateagentbuddy://auth-callback?code=…, which opens the app again.
// Needs: Supabase URL + anon key, the Google provider switched on in Supabase, and the return addresses in the
// Supabase redirect list (docs/SETUP.md). Nothing here pretends: a session exists only after Supabase issued one.
import { isNative, openInBrowser, closeBrowser, AUTH_CALLBACK } from '../native/native';
import { SyncConfig, SyncError, Session, TokenResponse, toSession, supabaseCall, supabaseHeaders, configured, membership } from './sync';

type FetchFn = typeof fetch;
const PKCE_KEY = 'eab-pkce-verifier';

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A random PKCE code verifier (43–128 characters from the unreserved set). */
export function newVerifier(): string {
  const a = new Uint8Array(48);
  crypto.getRandomValues(a);
  return b64url(a);
}
/** S256 code challenge for a verifier. */
export async function challengeFor(verifier: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(d));
}

/** Where Google sign-in returns to: the app link on Android/iOS, this page's own address on the web. */
export function redirectUrl(): string {
  if (isNative()) return AUTH_CALLBACK;
  return `${window.location.origin}${window.location.pathname}`;
}
/** The web version can sign in only from a real web address (not a file opened from the phone's storage). */
export const canSignInHere = () => isNative() || /^https?:$/.test(window.location.protocol);

export function authorizeUrl(cfg: SyncConfig, redirect: string, challenge: string): string {
  const q = new URLSearchParams({ provider: 'google', redirect_to: redirect, code_challenge: challenge, code_challenge_method: 's256' });
  return `${cfg.supabaseUrl}/auth/v1/authorize?${q}`;
}

const store = {
  set: (v: string) => { try { localStorage.setItem(PKCE_KEY, v); } catch { /* storage blocked */ } },
  get: () => { try { return localStorage.getItem(PKCE_KEY); } catch { return null; } },
  clear: () => { try { localStorage.removeItem(PKCE_KEY); } catch { /* ignore */ } },
};

/** Opens Google sign-in. Resolves once Google has been opened (the result arrives through handleCallback). */
export async function startGoogleSignIn(cfg: SyncConfig): Promise<void> {
  if (!configured(cfg)) throw new SyncError('not-configured');
  const verifier = newVerifier();
  store.set(verifier);
  const url = authorizeUrl(cfg, redirectUrl(), await challengeFor(verifier));
  if (!(await openInBrowser(url))) throw new SyncError('network');
}

export type CallbackResult = { kind: 'none' } | { kind: 'error'; code: string; message?: string } | { kind: 'signed-in'; session: Session }

/** Reads ?code= / ?error= from the return address and turns a code into a session (with the team role). */
export async function handleCallback(cfg: SyncConfig, url: string, fetchFn: FetchFn = fetch): Promise<CallbackResult> {
  let u: URL;
  try { u = new URL(url); } catch { return { kind: 'none' }; }
  const params = new URLSearchParams(u.search);
  // Supabase sometimes reports errors in the #fragment.
  if (u.hash.length > 1) for (const [k, v] of new URLSearchParams(u.hash.slice(1))) if (!params.has(k)) params.set(k, v);
  const code = params.get('code');
  const error = params.get('error') || params.get('error_code');
  if (!code && !error) return { kind: 'none' };
  await closeBrowser();
  if (error) { store.clear(); return { kind: 'error', code: error, message: params.get('error_description') ?? undefined }; }
  const verifier = store.get();
  if (!verifier) return { kind: 'error', code: 'no-verifier' };
  try {
    const r = await supabaseCall(fetchFn, `${cfg.supabaseUrl}/auth/v1/token?grant_type=pkce`, {
      method: 'POST', headers: supabaseHeaders(cfg), body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    });
    store.clear();
    const session = toSession((await r.json()) as TokenResponse);
    return { kind: 'signed-in', session: await membership(cfg, session, fetchFn) };
  } catch (e) {
    store.clear();
    return { kind: 'error', code: e instanceof SyncError ? e.code : 'network', message: e instanceof Error ? e.message.slice(0, 200) : undefined };
  }
}

/** Removes ?code=… from the web address after sign-in, so a reload does not try to use it again. */
export function cleanWebAddress(): void {
  if (isNative()) return;
  try { window.history.replaceState(window.history.state, '', `${window.location.origin}${window.location.pathname}`); } catch { /* ignore */ }
}

/** Signs out on the server (best effort) — the caller removes the session on the phone. */
export async function signOutRemote(cfg: SyncConfig, s: Session, fetchFn: FetchFn = fetch): Promise<void> {
  try { await fetchFn(`${cfg.supabaseUrl}/auth/v1/logout`, { method: 'POST', headers: supabaseHeaders(cfg, s.accessToken) }); } catch { /* offline: the phone still forgets the session */ }
}
