// Billing: the three ways to pay, behind one interface (SANDBOX / TEST MODE ONLY). Each provider only turns "this plan, this
// agent" into a first step; what the agent actually has is written by the server after the provider confirms it.
//   stripe       card subscription (Stripe test mode): opens Stripe's own page in the browser
//   fpx          Malaysian online banking through Billplz (sandbox): a one-time payment for one period, not a subscription
//   google_play  in-app subscription through Google Play Billing: needs the native PlayBilling plugin, which is NOT built yet
import type { Store } from '../data/store';
import type { SyncConfig } from '../data/sync';
import { openInBrowser, platform, plugin, pluginMissing } from '../native/native';
import { startCheckout, verifyPlayPurchase, BillingError } from './api';
import { PLANS, planById, type PayProvider, type Plan } from './plans';

type FetchFn = typeof fetch;

export const PROVIDER_IDS: PayProvider[] = ['fpx', 'stripe', 'google_play'];

export type Availability = { ok: true } | { ok: false; reason: 'android-only' | 'plugin-missing' };

/** Can this provider be used on this phone right now? (The server decides whether it is configured.) */
export function availability(id: PayProvider): Availability {
  if (id !== 'google_play') return { ok: true };
  if (platform() !== 'android') return { ok: false, reason: 'android-only' };
  return pluginMissing('PlayBilling') ? { ok: false, reason: 'plugin-missing' } : { ok: true };
}

export type PayStep = { kind: 'opened'; env: 'sandbox' | 'live' } | { kind: 'verified'; status: string; env: 'sandbox' | 'live' };

/** The native side of Google Play Billing (to be built as an Android plugin). */
export interface PlayBillingPlugin { purchase(o: { productId: string; obfuscatedAccountId: string }): Promise<{ purchaseToken: string }> }

export const sha256Hex = async (s: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');

export async function startPayment(store: Store, cfg: SyncConfig, id: PayProvider, planId: string, fetchFn: FetchFn = fetch): Promise<PayStep> {
  const plan: Plan | undefined = planById(planId);
  if (!plan || !PLANS.includes(plan)) throw new BillingError('other', 'unknown plan');
  const a = availability(id);
  if (!a.ok) throw new BillingError('other', a.reason);
  if (id === 'google_play') {
    const me = store.getState().meta.syncSession?.userId;
    if (!me) throw new BillingError('not-signed-in');
    const pb = plugin<PlayBillingPlugin>('PlayBilling');
    if (!pb) throw new BillingError('other', 'plugin-missing');
    // The purchase carries a hash of the agent's id; the server only accepts a purchase made for the agent who sends it.
    const { purchaseToken } = await pb.purchase({ productId: plan.id, obfuscatedAccountId: await sha256Hex(me) });
    const r = await verifyPlayPurchase(store, cfg, plan.id, purchaseToken, fetchFn);
    return { kind: 'verified', status: r.status, env: r.env };
  }
  const r = await startCheckout(store, cfg, id, plan.id, fetchFn);
  if (!/^https:\/\//.test(r.url) || !(await openInBrowser(r.url))) throw new BillingError('other', 'could not open the payment page');
  return { kind: 'opened', env: r.env };
}
