// Batch A: the subscription box shown INSTEAD of Market News and Intelligence when billing is switched on and this account
// has no active 'news' plan (billing/access.ts, FEATURE_PRODUCT.marketNews). SANDBOX / TEST MODE ONLY.
//  - Two Google Play subscriptions, USD 1 a month or USD 9 a year (billing/plans.ts). Google Play is the only way to pay for
//    them: no card, no FPX.
//  - Subscribe asks the native PlayBilling plugin to buy the plan id, then sends the purchase token to the server
//    (play_verify), which checks it with Google, writes the entitlement and acknowledges it. Nothing here grants access:
//    the news appears only after the database says the plan is active.
//  - Restore / Refresh reads the plans from the database again.
import { useState } from 'react';
import type { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { config } from '../config';
import { BillingError, cachedEntitlement, refreshBilling } from './api';
import { plansOf, price, yearlySaving } from './plans';
import { availability, startPayment } from './providers';
import { billingStrings } from './strings';

type Msg = { text: string; tone: 'ok' | 'error' | 'info' } | null;

export function NewsPaywall({ lang }: { lang: Lang }) {
  const { state, store } = useApp();
  const s = billingStrings[lang]; const p = s.paywall;
  const cfg = config(state.settings);
  const me = state.meta.syncSession;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const plans = plansOf('news');
  const monthly = plans.find(x => x.interval === 'month'); const yearly = plans.find(x => x.interval === 'year');
  const saving = monthly && yearly ? yearlySaving(monthly, yearly) : 0;
  const avail = availability('google_play');

  const failText = (e: unknown): Msg => {
    const code = (e as { code?: unknown } | null)?.code; const text = e instanceof Error ? e.message : String(e ?? '');
    if (code === 'USER_CANCELED' || /cancel/i.test(text)) return { text: p.cancelled, tone: 'info' };
    if (code === 'PENDING' || /pending/i.test(text)) return { text: p.pending, tone: 'info' };
    if (e instanceof BillingError) {
      if (e.code === 'other' && (text === 'android-only' || text === 'plugin-missing')) return { text: s.unavailable[text], tone: 'error' };
      return { text: s.err[e.code] ?? s.err.other, tone: 'error' };
    }
    return { text: s.err.other, tone: 'error' };
  };

  const subscribe = async (planId: string) => {
    if (busy) return;
    setBusy(true); setMsg({ text: p.checking, tone: 'info' });
    try {
      const r = await startPayment(store, cfg, 'google_play', planId);
      await refreshBilling(store, cfg);
      // Only the server's answer counts: "active" from play_verify, and the plan read back from the database.
      const ok = r.kind === 'verified' && r.status === 'active';
      setMsg(ok ? { text: p.done, tone: 'ok' } : { text: p.notYet, tone: 'info' });
    } catch (e) { setMsg(failText(e)); }
    setBusy(false);
  };

  const restore = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    const read = await refreshBilling(store, cfg);
    if (!read) setMsg({ text: s.refreshFailed, tone: 'error' });
    else if (!cachedEntitlement(store).news.active) setMsg({ text: p.noneFound, tone: 'info' });
    setBusy(false);
  };

  return (
    <div className="card stack-sm" data-testid="news-paywall">
      <div className="card-title" data-testid="news-paywall-title">{p.title}</div>
      <p className="small" data-testid="news-paywall-unlocks">{p.unlocks}</p>
      <small className="muted" data-testid="news-paywall-banner">{s.banner}</small>
      {!me ? <p className="small muted" data-testid="news-paywall-signin">{s.signIn}</p> : (
        <>
          {plans.map(plan => (
            <div className="between" key={plan.id} data-testid={`news-plan-${plan.id}`}>
              <div className="stack-sm">
                <strong>{s.planName[plan.id]}</strong>
                <small className="muted" data-testid={`news-price-${plan.id}`}>{price(plan)} {s.per[plan.interval]}</small>
                {plan.interval === 'year' && saving > 0 && <small className="ok-text" data-testid="news-saving">{p.saves(saving)}</small>}
              </div>
              <button type="button" className="btn small primary" data-testid={`news-subscribe-${plan.id}`} disabled={busy || !avail.ok} onClick={() => void subscribe(plan.id)}>{p.subscribe}</button>
            </div>
          ))}
          {!avail.ok && <small className="muted" data-testid="news-paywall-unavailable">{s.unavailable[avail.reason]}</small>}
          <small className="muted">{p.via}</small>
        </>
      )}
      {msg && <p className={`small ${msg.tone === 'ok' ? 'ok-text' : msg.tone === 'error' ? 'error' : 'muted'}`} role="status" data-testid="news-paywall-msg">{msg.text}</p>}
      {me && <button type="button" className="btn small secondary" data-testid="news-paywall-refresh" disabled={busy} onClick={() => void restore()}>{p.restore}</button>}
    </div>
  );
}
