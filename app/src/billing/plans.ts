// Billing: the plan list and the rules around it. SANDBOX / TEST MODE ONLY for now (docs/MONETISATION_PLAN.md).
//  - The amounts are PROPOSALS until the owner approves them. The server holds its own copy
//    (supabase/functions/_shared/billing.ts) and never trusts an amount from the phone; a test keeps the two lists equal.
//  - Nothing is gated yet: FEATURE_PRODUCT is empty on purpose. What is free and what needs Pro is the owner's decision.
//    Until a feature is listed here it works for everybody, exactly as before.
export type Product = 'pro' | 'pos';
export type PlanId = 'pro_monthly' | 'pro_yearly' | 'pos_monthly';
export type PayProvider = 'stripe' | 'fpx' | 'google_play';

export interface Plan { id: PlanId; product: Product; interval: 'month' | 'year'; amountSen: number; days: number }

export const PLANS: Plan[] = [
  { id: 'pro_monthly', product: 'pro', interval: 'month', amountSen: 4900, days: 30 },
  { id: 'pro_yearly', product: 'pro', interval: 'year', amountSen: 49000, days: 365 },
  { id: 'pos_monthly', product: 'pos', interval: 'month', amountSen: 3900, days: 30 },
];
export const planById = (id: string): Plan | undefined => PLANS.find(p => p.id === id);
export const plansOf = (product: Product): Plan[] => PLANS.filter(p => p.product === product);

/** Sandbox purchases count as access while this is false. Set true only when the owner approves going live (and re-check every provider key). */
export const BILLING_LIVE = false;
export const TRIAL_DAYS = 14;
/** A late payment keeps access this long after the period ends (past_due), so a failed card does not lock someone out at once. */
export const GRACE_DAYS = 7;

/** feature key → the product that unlocks it. Empty on purpose: nothing is gated until the owner decides. */
export const FEATURE_PRODUCT: Partial<Record<string, Product>> = {};

export const rm = (sen: number): string => `RM ${(sen / 100).toLocaleString('en-MY', { minimumFractionDigits: sen % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
