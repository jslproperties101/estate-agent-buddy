// Billing: what this account may use, worked out from the rows the database holds (eab_my_billing). Pure functions only.
// The database is the only place access is written; the phone just reads it and keeps the last answer for offline use.
import { BILLING_LIVE, FEATURE_PRODUCT, GRACE_DAYS, type PayProvider, type PlanId, type Product } from './plans';

export type RowStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
export interface BillingRow {
  product: Product; plan_id: PlanId | null; status: RowStatus; provider: PayProvider | 'trial'; env: 'sandbox' | 'live';
  trial_end: string | null; period_end: string | null; cancel_at_period_end: boolean;
}
export interface BillingCache { userId: string; rows: BillingRow[]; at: number }

/**
 * none      nothing bought or tried
 * trialing  free trial running
 * active    paid, renews by itself (Stripe, Google Play)
 * canceling paid until `until`, then it stops (cancelled, or a one-time payment such as FPX)
 * grace     the period ended without a payment; still allowed for GRACE_DAYS
 * expired   not allowed
 */
export type LineState = 'none' | 'trialing' | 'active' | 'canceling' | 'grace' | 'expired';
export interface Line { product: Product; state: LineState; active: boolean; until?: number; provider?: BillingRow['provider']; planId?: PlanId; sandbox: boolean }
export interface Entitlement { pro: Line; pos: Line }

const DAY = 86_400_000;
const ms = (x: string | null): number | undefined => { const t = x ? Date.parse(x) : NaN; return Number.isFinite(t) ? t : undefined; };

export function resolveLine(rows: BillingRow[], product: Product, now: number, live: boolean = BILLING_LIVE): Line {
  const none: Line = { product, state: 'none', active: false, sandbox: false };
  // While the app is live, a sandbox (test) purchase never counts.
  const row = rows.find(r => r.product === product && (!live || r.env === 'live'));
  if (!row) return none;
  const base = { product, provider: row.provider, planId: row.plan_id ?? undefined, sandbox: row.env === 'sandbox' };
  const expired: Line = { ...base, state: 'expired', active: false };
  const trialEnd = ms(row.trial_end); const periodEnd = ms(row.period_end);
  switch (row.status) {
    case 'trialing': {
      const until = trialEnd ?? periodEnd;
      return until !== undefined && now < until ? { ...base, state: 'trialing', active: true, until } : expired;
    }
    case 'active':
      if (periodEnd === undefined) return expired;                      // an active row with no end is not trusted
      if (now < periodEnd) return { ...base, state: row.cancel_at_period_end ? 'canceling' : 'active', active: true, until: periodEnd };
      return now < periodEnd + GRACE_DAYS * DAY ? { ...base, state: 'grace', active: true, until: periodEnd + GRACE_DAYS * DAY } : expired;
    case 'past_due':
      if (periodEnd === undefined) return expired;
      return now < periodEnd + GRACE_DAYS * DAY ? { ...base, state: 'grace', active: true, until: periodEnd + GRACE_DAYS * DAY } : expired;
    case 'canceled':
      return periodEnd !== undefined && now < periodEnd ? { ...base, state: 'canceling', active: true, until: periodEnd } : expired;
    default:
      return expired;
  }
}

export function resolveEntitlement(rows: BillingRow[], now: number, live: boolean = BILLING_LIVE): Entitlement {
  return { pro: resolveLine(rows, 'pro', now, live), pos: resolveLine(rows, 'pos', now, live) };
}

/**
 * May this feature be used? When billing is switched off (the default) everything works as before. A feature that is not in
 * the table (nothing is, yet) is free.
 */
export function canUse(feature: string, ent: Entitlement, billingOn: boolean, table: Partial<Record<string, Product>> = FEATURE_PRODUCT): boolean {
  if (!billingOn) return true;
  const need = table[feature];
  return need ? ent[need].active : true;
}

/**
 * May this person start paying for this product by this provider now? Not while another provider already holds an active paid
 * period (so nobody pays twice for the same thing); a one-time FPX payment can be paid again to add another period.
 */
export function canPurchase(line: Line, provider: PayProvider): boolean {
  if (!line.active || line.provider === 'trial' || line.state === 'grace') return true;
  if (line.provider === 'fpx') return provider === 'fpx';
  return false;
}
