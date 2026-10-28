// Billing (sandbox / test mode): the "Plans" card in Settings. Shown only when the billing switch is on (billing/access.ts).
// It shows what this account has, starts the one free trial, and starts a TEST payment by the chosen provider. What the account
// actually has is written by the server after the provider confirms; the buttons here never grant anything by themselves.
import { useEffect, useState } from 'react';
import type { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { config } from '../config';
import { fmtDate } from '../lib/dates';
import { useToast } from '../ui/toast';
import { BillingError, cachedRows, refreshBilling, startTrial } from './api';
import { canPurchase, resolveEntitlement, type Line } from './entitlement';
import { PLANS, TRIAL_DAYS, plansOf, rm, type PayProvider, type Product } from './plans';
import { PROVIDER_IDS, availability, startPayment } from './providers';
import { billingStrings, type BillingStrings } from './strings';

const PRODUCTS: Product[] = ['pro', 'pos'];

function lineText(s: BillingStrings, l: Line, lang: Lang): string {
  const d = fmtDate(l.until, lang);
  switch (l.state) {
    case 'trialing': return s.state.trialing(d);
    case 'active': return s.state.active(d);
    case 'canceling': return s.state.canceling(d);
    case 'grace': return s.state.grace(d);
    case 'expired': return s.state.ended;
    default: return s.state.none;
  }
}

export function BillingCard({ lang }: { lang: Lang }) {
  const { state, store } = useApp();
  const toast = useToast();
  const s = billingStrings[lang];
  const cfg = config(state.settings);
  const me = state.meta.syncSession;
  const [provider, setProvider] = useState<PayProvider>('fpx');
  const [busy, setBusy] = useState(false);
  const ent = resolveEntitlement(cachedRows(store), Date.now());

  useEffect(() => { if (me) void refreshBilling(store, cfg); }, [me?.userId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (e: unknown) => toast(s.err[e instanceof BillingError ? e.code : 'other'] ?? s.err.other, 'error');
  const refresh = async () => { setBusy(true); toast((await refreshBilling(store, cfg)) ? s.refreshed : s.refreshFailed); setBusy(false); };
  const trial = async (p: Product) => {
    setBusy(true);
    try {
      const a = await startTrial(store, cfg, p);
      toast(a.result === 'started' ? s.trialStarted : s.trialUsed);
      await refreshBilling(store, cfg);
    } catch (e) { fail(e); }
    setBusy(false);
  };
  const pay = async (planId: string) => {
    setBusy(true);
    try {
      const r = await startPayment(store, cfg, provider, planId);
      toast(r.kind === 'opened' ? s.opened : s.verified);
      if (r.kind === 'verified') await refreshBilling(store, cfg);
    } catch (e) { fail(e); }
    setBusy(false);
  };

  const avail = availability(provider);
  return (
    <div className="card stack-sm" data-testid="billing-card">
      <div className="card-title">{s.title}</div>
      <small className="muted" data-testid="billing-banner">{s.banner}</small>
      {!me ? <small className="muted" data-testid="billing-signin">{s.signIn}</small> : (
        <>
          {PRODUCTS.map(p => {
            const l = ent[p];
            return (
              <div className="between" key={p} data-testid={`billing-line-${p}`}>
                <div className="stack-sm">
                  <strong>{s.products[p]}</strong>
                  <small className="muted" data-testid={`billing-state-${p}`}>{lineText(s, l, lang)}{l.sandbox && l.state !== 'none' ? ` · ${s.testTag}` : ''}</small>
                </div>
                {l.state === 'none' && <button className="btn small secondary" data-testid={`billing-trial-${p}`} disabled={busy} onClick={() => trial(p)}>{s.startTrial(TRIAL_DAYS)}</button>}
              </div>
            );
          })}
          <div className="card-title">{s.payWith}</div>
          <div className="seg" role="group" aria-label={s.payWith}>
            {PROVIDER_IDS.map(id => <button key={id} data-testid={`billing-provider-${id}`} aria-pressed={provider === id} onClick={() => setProvider(id)}>{s.providers[id]}</button>)}
          </div>
          <small className="muted" data-testid="billing-provider-note">{avail.ok ? s.providerNote[provider] : s.unavailable[avail.reason]}</small>
          {PRODUCTS.flatMap(p => plansOf(p)).map(plan => {
            const allowed = avail.ok && canPurchase(ent[plan.product], provider);
            return (
              <div className="between" key={plan.id}>
                <div className="stack-sm"><strong>{s.planName[plan.id]}</strong><small className="muted">{rm(plan.amountSen)} {s.per[plan.interval]}</small></div>
                <button className="btn small primary" data-testid={`billing-pay-${plan.id}`} disabled={busy || !allowed} onClick={() => pay(plan.id)}>{s.pay(rm(plan.amountSen))}</button>
              </div>
            );
          })}
          {avail.ok && PLANS.some(p => !canPurchase(ent[p.product], provider)) && <small className="muted">{s.alreadyPaid}</small>}
          <small className="muted">{s.proposal}</small>
          <button className="btn small secondary" data-testid="billing-refresh" disabled={busy} onClick={refresh}>{s.refresh}</button>
        </>
      )}
    </div>
  );
}
