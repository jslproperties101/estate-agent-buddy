// Billing (sandbox / test mode) is behind a feature switch: off by default. It is on when this phone's Settings switch is on, or
// when Admin EAB turned on the test feature beta.billing for this agent (feed/flags.ts). With the switch off the app behaves
// exactly as before: nothing is gated and no billing screen is shown.
import type { Store } from '../data/store';
import { betaOn, myFlags } from '../feed/flags';
import { cachedEntitlement, serverNewsPaid } from './api';
import { canUse } from './entitlement';

export const BILLING_FLAG = 'billing';
export const billingEnabled = (store: Store) => store.getState().settings.billing === true || betaOn(myFlags(store), BILLING_FLAG);

/** May this signed-in agent use this feature, going by the last plans heard from the database? True while billing is off.
 *  Batch 5: Market News is also gated when the server's "news is paid" switch is on (the server then leaves news out anyway). */
export function featureAllowed(store: Store, feature: string, now = Date.now()): boolean {
  const gated = billingEnabled(store) || (feature === 'marketNews' && serverNewsPaid(store));
  return canUse(feature, cachedEntitlement(store, now), gated);
}
