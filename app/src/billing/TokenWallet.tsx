// Batch B: the Ai Buddy Token wallet card in Settings (SANDBOX / TEST MODE ONLY). Shown only when the billing switch is on
// (billing/access.ts), next to the Plans card. It shows the balance the database holds, the four packs (Google Play only),
// Restore purchases and the last changes. Nothing here adds tokens: only the server's answer and the database do.
import { useEffect, useState } from 'react';
import type { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { config } from '../config';
import { fmtDateTime } from '../lib/dates';
import { BillingError } from './api';
import { TOKEN_PACKS, packBonus, usd } from './plans';
import { availability } from './providers';
import { billingStrings } from './strings';
import { LookupsEntry } from '../lookups/LookupsUI';
import { buyTokens, cachedTokens, refreshTokens, restoreTokens, tokenBalance, walletEnv } from './tokens';

type Msg = { text: string; tone: 'ok' | 'error' | 'info' } | null;

export function TokenWallet({ lang, onLookups }: { lang: Lang; onLookups?: () => void }) {
  const { state, store } = useApp();
  const s = billingStrings[lang]; const t = s.tokens;
  const cfg = config(state.settings);
  const me = state.meta.syncSession;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const avail = availability('google_play');
  const wallet = cachedTokens(store);
  const env = walletEnv();
  const history = (wallet?.history ?? []).filter(h => h.env === env);

  useEffect(() => { if (me) void refreshTokens(store, cfg); }, [me?.userId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const failText = (e: unknown): Msg => {
    const code = (e as { code?: unknown } | null)?.code; const text = e instanceof Error ? e.message : String(e ?? '');
    if (code === 'USER_CANCELED' || /cancel/i.test(text)) return { text: t.cancelled, tone: 'info' };
    if (code === 'PENDING' || /pending/i.test(text)) return { text: t.pending, tone: 'info' };
    if (e instanceof BillingError) {
      if (e.code === 'other' && (text === 'android-only' || text === 'plugin-missing')) return { text: s.unavailable[text], tone: 'error' };
      return { text: s.err[e.code] ?? s.err.other, tone: 'error' };
    }
    return { text: s.err.other, tone: 'error' };
  };

  const run = async (f: () => Promise<Msg>, first: Msg = null) => {
    if (busy) return;
    setBusy(true); setMsg(first);
    try { setMsg(await f()); } catch (e) { setMsg(failText(e)); }
    setBusy(false);
  };
  const buy = (packId: string) => run(async () => {
    const r = await buyTokens(store, cfg, packId);
    return r.kind === 'credited' ? { text: t.credited(r.tokens), tone: 'ok' } : r.kind === 'already' ? { text: t.already, tone: 'info' } : { text: t.pending, tone: 'info' };
  }, { text: t.checking, tone: 'info' });
  const restore = () => run(async () => {
    const r = await restoreTokens(store, cfg);
    return r.failed > 0 ? { text: t.restoreFailed, tone: 'error' } : { text: t.restored(r.added), tone: r.added > 0 ? 'ok' : 'info' };
  });
  const refresh = () => run(async () => ((await refreshTokens(store, cfg)) ? null : { text: s.refreshFailed, tone: 'error' }));

  return (
    <div className="card stack-sm" data-testid="token-wallet">
      <div className="card-title">{t.title}</div>
      <small className="muted" data-testid="token-banner">{s.banner}</small>
      <small className="muted" data-testid="token-what">{t.what}</small>
      {!me ? <small className="muted" data-testid="token-signin">{s.signIn}</small> : (
        <>
          <strong data-testid="token-balance">{t.balance(tokenBalance(store))}</strong>
          {TOKEN_PACKS.map(p => (
            <div className="between" key={p.id} data-testid={`token-pack-${p.id}`}>
              <div className="stack-sm">
                <strong>{t.pack(p.tokens)}</strong>
                <small className="muted" data-testid={`token-price-${p.id}`}>{usd(p.amountCents)}</small>
                {packBonus(p) > 0 && <small className="ok-text" data-testid={`token-bonus-${p.id}`}>{t.bonus(p.tokens - packBonus(p), packBonus(p))}</small>}
              </div>
              <button type="button" className="btn small primary" data-testid={`token-buy-${p.id}`} disabled={busy || !avail.ok} onClick={() => void buy(p.id)}>{t.buy}</button>
            </div>
          ))}
          {!avail.ok && <small className="muted" data-testid="token-unavailable">{s.unavailable[avail.reason]}</small>}
          <small className="muted">{t.via}</small>
          <div className="btn-row">
            <button type="button" className="btn small secondary" data-testid="token-restore" disabled={busy || !avail.ok} onClick={() => void restore()}>{t.restore}</button>
            <button type="button" className="btn small secondary" data-testid="token-refresh" disabled={busy} onClick={() => void refresh()}>{t.refresh}</button>
          </div>
          {onLookups && <LookupsEntry lang={lang} onOpen={onLookups} />}
          <div className="card-title">{t.history}</div>
          {history.length === 0 ? <small className="muted" data-testid="token-history-empty">{t.noHistory}</small> : (
            <div className="stack-sm" data-testid="token-history">
              {history.map((h, i) => (
                <div key={`${h.created_at}-${i}`} className="between small" data-testid="token-history-row">
                  <span>{t.kind[h.kind] ?? h.kind} · {fmtDateTime(h.created_at, lang)}</span>
                  <strong>{h.delta > 0 ? `+${h.delta}` : h.delta}</strong>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {msg && <p className={`small ${msg.tone === 'ok' ? 'ok-text' : msg.tone === 'error' ? 'error' : 'muted'}`} role="status" data-testid="token-msg">{msg.text}</p>}
    </div>
  );
}
