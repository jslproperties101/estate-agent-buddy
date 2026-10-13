// The sign-in screen: "Continue with Google". Shown before the app when sign-in is set up (Supabase URL + anon key)
// and nobody is signed in on this phone. Handles the return from Google on the web (?code= in the address) and in
// the Android app (app link), a cancelled sign-in, errors, and a sign-in that is not set up.
import { useEffect, useRef, useState } from 'react';
import { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { config } from '../config';
import { configured } from '../data/sync';
import { startGoogleSignIn, handleCallback, cleanWebAddress, canSignInHere, takeDriveIntent } from '../data/auth';
import { onAppUrlOpen, onBrowserClosed, isNative, AUTH_CALLBACK } from '../native/native';
import { authStrings } from './strings';
import { IconLogo } from '../icons';

type Phase = 'idle' | 'opening' | 'waiting' | 'exchanging';

/** The return from Google, for both the web address and the Android app link. Used by the sign-in screen and by
 *  Settings (signing in again later). */
export function useGoogleReturn(onDone: (error: string | null) => void): void {
  const { state, store } = useApp();
  const cfg = config(state.settings);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const finish = async (url: string) => {
      const r = await handleCallback(cfg, url);
      if (r.kind === 'none') return;
      cleanWebAddress();
      if (r.kind === 'signed-in') {
        const drive = takeDriveIntent();
        store.setSingleton('meta', { syncSession: r.session, offlineOnly: false, syncError: undefined });
        // Google's token for Drive lasts about an hour; it is kept on this phone only, and only when the person asked to connect Drive.
        if (drive && r.providerToken) store.setSingleton('meta', { drive: { token: r.providerToken, expiresAt: Date.now() + 55 * 60_000, connectedAt: Date.now() } });
        done.current(null);
      }
      else { takeDriveIntent(); done.current(r.code); }
    };
    if (!isNative() && /[?&#](code|error)=/.test(window.location.href)) void finish(window.location.href);
    let l: { remove: () => unknown } | null = null;
    void onAppUrlOpen(url => { if (url.startsWith(AUTH_CALLBACK)) void finish(url); }).then(x => { l = x; });
    return () => { void l?.remove(); };
  }, [cfg.supabaseUrl, cfg.supabaseAnonKey]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function LoginScreen({ lang }: { lang: Lang }) {
  const { state } = useApp();
  const a = authStrings[lang];
  const cfg = config(state.settings);
  const [phase, setPhase] = useState<Phase>(() => (/[?&](code)=/.test(typeof window !== 'undefined' ? window.location.search : '') ? 'exchanging' : 'idle'));
  const [err, setErr] = useState<string | null>(state.meta.syncError === 'expired' || state.meta.syncError === 'no-access' ? state.meta.syncError : null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useGoogleReturn(e => { setPhase('idle'); setErr(e); });

  // Android: the person closed the Google tab without finishing.
  useEffect(() => {
    let l: { remove: () => unknown } | null = null;
    void onBrowserClosed(() => {
      setTimeout(() => { if (phaseRef.current === 'waiting') { setPhase('idle'); setErr('cancelled'); } }, 1500);
    }).then(x => { l = x; });
    return () => { void l?.remove(); };
  }, []);

  async function go() {
    setErr(null); setPhase('opening');
    try { await startGoogleSignIn(cfg); setPhase(isNative() ? 'waiting' : 'opening'); }
    catch { setPhase('idle'); setErr('network'); }
  }

  const ready = configured(cfg);
  return (
    <div className="shell login" data-testid="login">
      <section className="login-card stack">
        <span className="login-logo"><IconLogo size={132} big /></span>
        <h1 className="login-title">{a.welcome}</h1>
        <p className="muted">{a.sub}</p>
        {!ready ? (
          <div className="notice warn" role="status" data-testid="login-not-set-up"><strong>{a.notSetUpTitle}</strong><br />{a.notSetUp}</div>
        ) : !canSignInHere() ? (
          <div className="notice warn" role="status">{a.fileMode}</div>
        ) : (
          <>
            <button className="btn google-btn big" onClick={() => void go()} disabled={phase !== 'idle'} data-testid="google-sign-in">
              <GoogleG /> {phase === 'opening' ? a.opening : phase === 'exchanging' ? a.signingIn : phase === 'waiting' ? a.opening : a.google}
            </button>
            {phase === 'waiting' && <small className="muted" role="status">{a.waiting}</small>}
          </>
        )}
        {err && <p className="error" role="alert" data-testid="login-error">{a.err[err] ?? `${a.err.other} (${err})`}</p>}
      </section>
    </div>
  );
}

/** Google's "G" (official colours), for the sign-in button. */
function GoogleG() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
