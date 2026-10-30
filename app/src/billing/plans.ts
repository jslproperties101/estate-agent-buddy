// Billing: the plan list and the rules around it. SANDBOX / TEST MODE ONLY for now (docs/MONETISATION_PLAN.md).
//  - The amounts are PROPOSALS until the owner approves them. The server holds its own copy
//    (supabase/functions/_shared/billing.ts) and never trusts an amount from the phone; a test keeps the two lists equal.
//  - Only what the owner decided is gated (FEATURE_PRODUCT). What is free and what needs Pro is the owner's decision.
//    Until a feature is listed here it works for everybody, exactly as before; with billing switched off nothing is gated.
//  - Batch A (30 Oct 2026, owner's request): 'news' = the Market News and Intelligence "access" plans, USD 1 a month or
//    USD 9 a year, sold ONLY through Google Play (no card, no FPX). They unlock that one screen and nothing else.
//    GOOGLE PLAY: each Play Console subscription product id MUST be exactly the plan id below (news_monthly, news_yearly).
//    The phone asks Play for the plan id and the server checks Google's answer against it; a different id never grants.
export type Product = 'pro' | 'pos' | 'news';
export type PlanId = 'pro_monthly' | 'pro_yearly' | 'pos_monthly' | 'news_monthly' | 'news_yearly';
export type PayProvider = 'stripe' | 'fpx' | 'google_play';
/** MYR plans are priced in sen, USD plans in cents: amountSen is the amount in the plan's currency's smallest unit. */
export type Currency = 'MYR' | 'USD';

export interface Plan { id: PlanId; product: Product; interval: 'month' | 'year'; amountSen: number; days: number; currency?: Currency }

export const PLANS: Plan[] = [
  { id: 'pro_monthly', product: 'pro', interval: 'month', amountSen: 4900, days: 30 },
  { id: 'pro_yearly', product: 'pro', interval: 'year', amountSen: 49000, days: 365 },
  { id: 'pos_monthly', product: 'pos', interval: 'month', amountSen: 3900, days: 30 },
  // Play Console subscription ids: news_monthly, news_yearly (exactly these).
  { id: 'news_monthly', product: 'news', interval: 'month', amountSen: 100, days: 30, currency: 'USD' },
  { id: 'news_yearly', product: 'news', interval: 'year', amountSen: 900, days: 365, currency: 'USD' },
];
export const planById = (id: string): Plan | undefined => PLANS.find(p => p.id === id);
export const plansOf = (product: Product): Plan[] => PLANS.filter(p => p.product === product);

/** Sandbox purchases count as access while this is false. Set true only when the owner approves going live (and re-check every provider key). */
export const BILLING_LIVE = false;
export const TRIAL_DAYS = 14;
/** A late payment keeps access this long after the period ends (past_due), so a failed card does not lock someone out at once. */
export const GRACE_DAYS = 7;

/** The ways each product may be paid for. 'news' is Google Play only (owner's request, Batch A). */
export const PRODUCT_PROVIDERS: Record<Product, PayProvider[]> = { pro: ['fpx', 'stripe', 'google_play'], pos: ['fpx', 'stripe', 'google_play'], news: ['google_play'] };

/** feature key → the product that unlocks it. Only what the owner decided is listed; anything else works for everybody. */
export const FEATURE_PRODUCT: Partial<Record<string, Product>> = {
  marketNews: 'news',   // Batch A: Market News and Intelligence needs an active news plan (only while billing is switched on)
};

export const rm = (sen: number): string => `RM ${(sen / 100).toLocaleString('en-MY', { minimumFractionDigits: sen % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
/** A plan's price as written on screen: "RM 49" for MYR plans (unchanged), "USD 9" for USD plans. */
export const price = (p: Plan): string => (p.currency === 'USD'
  ? `USD ${(p.amountSen / 100).toLocaleString('en-US', { minimumFractionDigits: p.amountSen % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`
  : rm(p.amountSen));
/** How much a yearly plan saves against paying the monthly plan for 12 months, in whole percent (0 when it saves nothing). */
export const yearlySaving = (monthly: Plan, yearly: Plan): number => {
  const twelve = monthly.amountSen * 12;
  return twelve > 0 && yearly.amountSen < twelve ? Math.round((1 - yearly.amountSen / twelve) * 100) : 0;
};
