// Batch 5 part 2 (10 Nov 2026): the agency licence as the app sees it. One licence per agency (team workspace) covers Pro for the
// agents who hold a seat. It is bought OUTSIDE the Android app (website checkout by FPX or card, or an invoice from the platform
// owner): Google Play's rules do not allow other ways to pay inside the Android app, and Malaysia is not in Google's
// billing-choice programmes. So on Android this shows the licence and its seats only: no prices, no pay buttons, no links.
// Server: supabase/proposed/20261110100000_agency_licences.sql and the billing function (action agency_checkout).
import type { Store } from '../data/store';
import type { SyncConfig } from '../data/sync';
import { platform } from '../native/native';
import { rpc } from '../team/api';
import { billingCall, type CheckoutAnswer } from './api';

type FetchFn = typeof fetch;
export type AgencyPlan = 'agency_seat_monthly' | 'agency_seat_yearly' | 'agency_monthly' | 'agency_yearly';
export interface AgencyPrice { plan: AgencyPlan; style: 'seats' | 'agency'; amount_sen: number; days: number; seats_included: number | null }
export interface AgencyLicence { plan: AgencyPlan; style: 'seats' | 'agency'; seats: number; status: 'active' | 'canceled' | 'expired'; env: 'sandbox' | 'live'; period_end: string; provider: string; in_force: boolean }
export interface AgencyMember { user_id: string; email: string; role: string; seat: boolean }
export interface AgencyInvoiceRow { id: string; no: string; plan: AgencyPlan; seats: number; amount_sen: number; days: number; status: 'open' | 'paid' | 'void'; created_at: string; paid_at: string | null; origin: 'checkout' | 'invoice'; fpx_url: string | null; pay_token: string | null }
export interface MyAgency { role: string; licence: AgencyLicence | null; my_seat: boolean; seats_used: number; members?: AgencyMember[]; invoices?: AgencyInvoiceRow[] }

/** Buying and paying are offered on the website (laptop) only, never inside the Android app. */
export const agencyPaysHere = () => platform() !== 'android';
export const isBoss = (a: MyAgency | null) => a?.role === 'owner' || a?.role === 'admin';

export const readAgency = (store: Store, cfg: SyncConfig, workspaceId: string, fetchFn: FetchFn = fetch) =>
  rpc<MyAgency>(store, cfg, 'eab_my_agency', { p_ws: workspaceId }, fetchFn);
export const agencyPrices = (store: Store, cfg: SyncConfig, fetchFn: FetchFn = fetch) =>
  rpc<AgencyPrice[]>(store, cfg, 'eab_agency_price_list', {}, fetchFn);
export const setSeat = (store: Store, cfg: SyncConfig, workspaceId: string, userId: string, on: boolean, fetchFn: FetchFn = fetch) =>
  rpc<number>(store, cfg, 'eab_agency_seat_set', { p_ws: workspaceId, p_user: userId, p_on: on }, fetchFn);

export type AgencyCheckout = CheckoutAnswer & { invoice?: { id: string; no: string; amount_sen: number; seats: number; days: number } };
/** Website only: the server makes the invoice and answers the payment page (FPX or card) to open. */
export function startAgencyCheckout(store: Store, cfg: SyncConfig, workspaceId: string, plan: AgencyPlan, seats: number, provider: 'fpx' | 'stripe', fetchFn: FetchFn = fetch): Promise<AgencyCheckout> {
  if (!agencyPaysHere()) return Promise.reject(new Error('not-in-app'));
  return billingCall<AgencyCheckout>(store, cfg, { action: 'agency_checkout', workspaceId, plan, seats, provider }, fetchFn);
}

/** What the price list asks for this plan and number of agents (the server works it out again; this is only shown). */
export function agencyTotal(p: AgencyPrice, seats: number): { seats: number; sen: number } {
  const n = p.style === 'agency' ? (p.seats_included ?? 1) : Math.max(1, Math.min(500, Math.floor(seats) || 1));
  return { seats: n, sen: p.style === 'agency' ? p.amount_sen : p.amount_sen * n };
}

/** The card link of an open invoice (opens a fresh Stripe page; the server checks the invoice and its token). */
export const invoiceCardLink = (cfg: SyncConfig, inv: AgencyInvoiceRow): string | null =>
  inv.status === 'open' && inv.pay_token ? `${cfg.supabaseUrl.replace(/\/+$/, '')}/functions/v1/billing-webhook?p=pay&i=${encodeURIComponent(inv.id)}&t=${encodeURIComponent(inv.pay_token)}` : null;
