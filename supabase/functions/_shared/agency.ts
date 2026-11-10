// Batch 5 part 2 (10 Nov 2026): agency licences paid OUTSIDE the Android app, by FPX (Billplz) or card (Stripe), for an
// invoice the database made first (supabase/proposed/20261110100000_agency_licences.sql). Pure helpers, shared by the
// billing function (starting a payment) and billing-webhook (a payment arriving). The amount is never taken from the
// provider alone: eab_agency_apply compares it with the invoice's.
import { isUuid, type Env } from './billing.ts';

export const AGENCY_PLANS = ['agency_seat_monthly', 'agency_seat_yearly', 'agency_monthly', 'agency_yearly'] as const;
export type AgencyPlan = typeof AGENCY_PLANS[number];
export const isAgencyPlan = (x: unknown): x is AgencyPlan => typeof x === 'string' && (AGENCY_PLANS as readonly string[]).includes(x);
/** Billplz reference label that marks a bill as an agency invoice payment (reference_1 holds the invoice id). */
export const AGENCY_REF_LABEL = 'agency_invoice';
export const isPayToken = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x);

/** What the database's eab_agency_open_checkout / eab_admin_agency_invoice_create answer (the parts used here). */
export interface AgencyInvoice { id: string; no: string; plan: string; seats: number; amount_sen: number; days: number; status?: string; workspace?: string; pay_token?: string }

export interface AgencyPaid { provider: 'fpx' | 'stripe'; eventId: string; invoiceId: string; env: Env; ref: string; amountSen: number; eventAtMs: number }
/** null: not an agency payment (the personal-plan code handles it). */
export type AgencyMapped = { paid: AgencyPaid } | { ignored: string } | null;

// deno-lint-ignore no-explicit-any
type J = any;
const str = (x: unknown): string => (typeof x === 'string' ? x : '');

/** A Billplz bill read back from Billplz (never the callback itself): paid, in our collection, for an agency invoice. */
export function mapAgencyBill(bill: J, collectionId: string, env: Env): AgencyMapped {
  if (str(bill?.reference_1_label) !== AGENCY_REF_LABEL) return null;
  const id = str(bill?.id); const invoiceId = str(bill?.reference_1);
  if (!id) return { ignored: 'no-bill-id' };
  if (!isUuid(invoiceId)) return { ignored: 'no-invoice' };
  if (str(bill?.collection_id) !== collectionId) return { ignored: 'other-collection' };
  if (bill?.paid !== true || bill?.state !== 'paid') return { ignored: 'not-paid' };
  const amount = Number(bill?.paid_amount ?? bill?.amount);
  if (!Number.isInteger(amount) || amount < 100) return { ignored: 'no-amount' };
  return { paid: { provider: 'fpx', eventId: `billplz:${id}`, invoiceId, env, ref: id, amountSen: amount, eventAtMs: Date.parse(str(bill?.paid_at)) || 0 } };
}

/**
 * A Stripe Checkout Session for an agency invoice (one payment, mode 'payment'). Counted when Stripe says it is paid:
 * checkout.session.completed with payment_status 'paid', or checkout.session.async_payment_succeeded. Ringgit only. The
 * event id is the session's, so the two events for one session apply once.
 */
export function mapAgencyStripe(ev: J): AgencyMapped {
  const type = str(ev?.type);
  if (!/^checkout\.session\./.test(type)) return null;
  const s = ev?.data?.object;
  const invoiceId = str(s?.metadata?.agency_invoice);
  if (!invoiceId) return null;
  if (!isUuid(invoiceId)) return { ignored: 'no-invoice' };
  if (type !== 'checkout.session.completed' && type !== 'checkout.session.async_payment_succeeded') return { ignored: type };
  if (str(s?.mode) !== 'payment') return { ignored: 'not-a-payment' };
  if (str(s?.payment_status) !== 'paid') return { ignored: 'not-paid' };
  if (str(s?.currency).toLowerCase() !== 'myr') return { ignored: 'not-ringgit' };
  const amount = Number(s?.amount_total);
  const id = str(s?.id);
  if (!id || !Number.isInteger(amount) || amount < 100) return { ignored: 'no-amount' };
  return { paid: { provider: 'stripe', eventId: `stripe:${id}`, invoiceId, env: ev?.livemode === true ? 'live' : 'sandbox', ref: id, amountSen: amount, eventAtMs: (Number(ev?.created) || 0) * 1000 } };
}

/** Parameters for eab_agency_apply. */
export function agencyApplyParams(p: AgencyPaid): Record<string, unknown> {
  return { p_provider: p.provider, p_event_id: p.eventId, p_invoice: p.invoiceId, p_env: p.env, p_ref: p.ref, p_amount_sen: p.amountSen,
    p_event_at: new Date(p.eventAtMs || Date.now()).toISOString() };
}

/** The words on the provider's payment page. */
export const agencyDescription = (inv: AgencyInvoice) =>
  `EA AI Buddy agency licence ${inv.no}: ${inv.seats} agent${inv.seats === 1 ? '' : 's'}, ${inv.days} days`.slice(0, 200);

/** Stripe Checkout (one payment) for an invoice: the form body. */
export function stripeAgencyBody(inv: AgencyInvoice, returnUrl: string, email?: string): Record<string, string> {
  const b: Record<string, string> = {
    mode: 'payment', 'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'myr',
    'line_items[0][price_data][unit_amount]': String(inv.amount_sen), 'line_items[0][price_data][product_data][name]': agencyDescription(inv),
    client_reference_id: inv.id, 'metadata[agency_invoice]': inv.id, 'metadata[invoice_no]': inv.no,
    'payment_intent_data[metadata][agency_invoice]': inv.id, success_url: returnUrl, cancel_url: returnUrl,
  };
  if (email) b.customer_email = email;
  return b;
}

/** Billplz bill (FPX) for an invoice: the form body. */
export function billplzAgencyBody(inv: AgencyInvoice, collection: string, callbackUrl: string, returnUrl: string, email: string, name: string): Record<string, string> {
  return {
    collection_id: collection, email, name: (name || 'EA AI Buddy agency').slice(0, 100), amount: String(inv.amount_sen),
    callback_url: callbackUrl, redirect_url: returnUrl, description: agencyDescription(inv),
    reference_1_label: AGENCY_REF_LABEL, reference_1: inv.id, reference_2_label: 'invoice_no', reference_2: inv.no,
  };
}

/** The card link printed on an invoice: opens a fresh Stripe page each time (Stripe pages expire after a day). */
export const cardPayLink = (supabaseUrl: string, invoiceId: string, token: string) =>
  `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/billing-webhook?p=pay&i=${encodeURIComponent(invoiceId)}&t=${encodeURIComponent(token)}`;
