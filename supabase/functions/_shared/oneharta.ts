// Batch C (10 Nov 2026): Oneharta lookups paid with Ai Buddy Tokens. The rules shared by the lookup function and its tests.
//
// Prices (owner's decision): an agent pays 3 Ai Buddy Tokens for every Oneharta credit the lookup really costs (Oneharta's
// answer carries creditsCharged). One Oneharta credit costs the owner MYR 1.25; 3 tokens are USD 0.75. Before a lookup runs,
// the most it can cost is taken from the agent's tokens; afterwards anything not charged by Oneharta is given back at once
// (a search that finds nothing is free on both sides).
//
// Only these lookups are offered (each one number / one record at a time, so the most a call can cost is known first):
//   infosearch     InfoSearch by name, IC, phone or address                     at most 1 credit  -> 3 tokens
//   ct_search      Cukai Tanah (land tax) by one lot or one title number         at most 3 credits -> 9 tokens
//   company        Company search, one 12-digit registration number               at most 3 credits -> 9 tokens
//   sale_search    Sale transactions                                              at most 1 credit  -> 3 tokens
//   sale_unlock    vendor and purchaser names of one sale                         at most 3 credits -> 9 tokens
//   rental_search  Rental transactions                                            at most 1 credit  -> 3 tokens
//   rental_unlock  owner and tenant names of one rental                          at most 3 credits -> 9 tokens
// Not offered: title-number ranges, map parcels and batches (HSD / HSM titles cost 20 to 50 credits), Request Search.
// The ONEHARTA_API_KEY never leaves the server.

export const ONEHARTA_BASE = 'https://oneharta.com/api/v1';
export const TOKENS_PER_CREDIT = 3;

export type PaidKind = 'infosearch' | 'ct_search' | 'company' | 'sale_search' | 'sale_unlock' | 'rental_search' | 'rental_unlock';
export const CREDITS_MAX: Record<PaidKind, number> = {
  infosearch: 1, ct_search: 3, company: 3, sale_search: 1, sale_unlock: 3, rental_search: 1, rental_unlock: 3,
};
export const tokensFor = (credits: number) => credits * TOKENS_PER_CREDIT;
export const isPaidKind = (x: unknown): x is PaidKind => typeof x === 'string' && Object.prototype.hasOwnProperty.call(CREDITS_MAX, x);

/** Lists Oneharta answers for free (an active Oneharta package is still needed). */
export type FreeKind = 'ct_states' | 'ct_districts' | 'ct_mukims' | 'ct_sections' | 'sale_projects' | 'rental_projects';
export const isFreeKind = (x: unknown): x is FreeKind =>
  typeof x === 'string' && ['ct_states', 'ct_districts', 'ct_mukims', 'ct_sections', 'sale_projects', 'rental_projects'].includes(x);

export const SALE_REGIONS = ['Kuala Lumpur', 'Selangor', 'Ipoh', 'Seremban', 'Johor', 'Melaka', 'Kulim', 'Penang'];
export const RENTAL_STATES = ['', 'Selangor', 'Kuala Lumpur', 'Johor', 'Penang', 'Negeri Sembilan', 'Perak', 'Melaka', 'Putrajaya'];
export const TITLE_TYPES = ['GRN', 'HSD', 'HSM', 'GM', 'PM', 'PN'];

type J = Record<string, unknown>;
const s = (x: unknown, max = 200) => (typeof x === 'string' ? x.trim().slice(0, max) : '');
const has = (x: string) => x.length > 0;

/** What one call to Oneharta is: its address, method and body, the most it can cost, and a short note for the agent's history. */
export interface OhCall { method: 'GET' | 'POST'; path: string; body?: J; creditsMax: number; summary: string; ref?: string }

/**
 * Turns what the phone asked for into one Oneharta call, or answers why not ('bad request: ...'). Only the fields listed here
 * are passed on; anything else the phone sends is dropped. The history note never holds an IC number, a phone number or a name.
 */
export function buildPaid(kind: PaidKind, b: J): OhCall | string {
  const creditsMax = CREDITS_MAX[kind];
  switch (kind) {
    case 'infosearch': {
      const q = { name: s(b.name, 120), identityNo: s(b.identityNo, 20).replace(/[\s-]/g, ''), phone: s(b.phone, 20).replace(/[\s-]/g, ''), address: s(b.address, 200) };
      if (!Object.values(q).some(has)) return 'bad request: give a name, IC, phone or address';
      if (has(q.identityNo) && !/^[0-9A-Za-z]{6,14}$/.test(q.identityNo)) return 'bad request: IC';
      if (has(q.phone) && !/^\+?[0-9]{7,15}$/.test(q.phone)) return 'bad request: phone';
      if (has(q.name) && q.name.length < 3) return 'bad request: name too short';
      const used = (['name', 'identityNo', 'phone', 'address'] as const).filter(k => has(q[k])).map(k => (k === 'identityNo' ? 'IC' : k)).join(', ');
      return { method: 'POST', path: '/infosearch', body: q, creditsMax, summary: `InfoSearch by ${used}` };
    }
    case 'ct_search': {
      const state = s(b.state, 60); const district = s(b.district, 80); const mukim = s(b.mukim, 80); const section = s(b.section, 80);
      if (!state || !district || !mukim) return 'bad request: state, district and mukim';
      const searchBy = b.searchBy === 'titleNo' ? 'titleNo' : b.searchBy === 'lotNo' ? 'lotNo' : '';
      const number = s(b.number, 20);
      if (!searchBy || !/^[0-9A-Za-z]{1,12}$/.test(number)) return 'bad request: one lot or title number';
      const body: J = { state, district, mukim, section, searchBy };
      if (searchBy === 'titleNo') {
        const titleType = s(b.titleType, 4).toUpperCase();
        if (!TITLE_TYPES.includes(titleType)) return 'bad request: title type';
        body.titleType = titleType; body.number = number;   // one number only: a range could cost up to 603 credits
      } else body.number = number;
      const choiceId = s(b.choiceId, 200);
      if (choiceId) body.choiceId = choiceId;
      return { method: 'POST', path: '/cukai-tanah/search', body, creditsMax, summary: `Land tax ${searchBy === 'lotNo' ? 'lot' : `${body.titleType} title`} ${number}, ${mukim}, ${state}` };
    }
    case 'company': {
      const reg = s(b.registrationNo, 20).replace(/[\s-]/g, '');
      if (!/^\d{12}$/.test(reg)) return 'bad request: a 12-digit registration number';
      return { method: 'POST', path: '/company', body: { registrationNos: [reg] }, creditsMax, summary: `Company ${reg}`, ref: reg };
    }
    case 'sale_search': {
      const region = s(b.region, 40);
      if (!SALE_REGIONS.includes(region)) return 'bad request: region';
      const body: J = { region };
      for (const k of ['address', 'project', 'district', 'mukim', 'lotNo', 'titleNo', 'category']) { const v = s(b[k], 120); if (v) body[k] = v; }
      if (Object.keys(body).length < 2) return 'bad request: give an address, project, district, mukim, lot, title or category';
      return { method: 'POST', path: '/transactions/sale/search', body, creditsMax, summary: `Sale search, ${region}${body.project ? `, ${body.project}` : body.address ? `, ${body.address}` : ''}` };
    }
    case 'rental_search': {
      const state = s(b.state, 40);
      if (!RENTAL_STATES.includes(state)) return 'bad request: state';
      const address = s(b.address, 120); const project = s(b.project, 120);
      if (!address && !project) return 'bad request: give an address or project';
      return { method: 'POST', path: '/transactions/rental/search', body: { state, address, project }, creditsMax, summary: `Rental search, ${state || 'all states'}, ${project || address}` };
    }
    case 'sale_unlock': case 'rental_unlock': {
      const id = Number(b.id);
      if (!Number.isSafeInteger(id) || id <= 0) return 'bad request: record id';
      const what = kind === 'sale_unlock' ? 'sale' : 'rental';
      return { method: 'POST', path: `/transactions/${what}/unlock`, body: { id }, creditsMax, summary: `${what === 'sale' ? 'Sale' : 'Rental'} names, record ${id}`, ref: String(id) };
    }
  }
}

/** The free list calls (dropdowns). */
export function buildFree(kind: FreeKind, b: J): { path: string } | string {
  const q = new URLSearchParams();
  const need = (keys: string[]) => { for (const k of keys) { const v = s(b[k], 80); if (!v) return false; q.set(k, v); } return true; };
  switch (kind) {
    case 'ct_states': return { path: '/cukai-tanah/states' };
    case 'ct_districts': return need(['state']) ? { path: `/cukai-tanah/districts?${q}` } : 'bad request: state';
    case 'ct_mukims': return need(['state', 'district']) ? { path: `/cukai-tanah/mukims?${q}` } : 'bad request: state, district';
    case 'ct_sections': return need(['state', 'district', 'mukim']) ? { path: `/cukai-tanah/sections?${q}` } : 'bad request: state, district, mukim';
    case 'sale_projects': {
      const region = s(b.region, 40); const term = s(b.q, 60);
      if (!SALE_REGIONS.includes(region) || term.length < 3) return 'bad request: region and 3+ letters';
      return { path: `/transactions/sale/projects?${new URLSearchParams({ region, q: term })}` };
    }
    case 'rental_projects': {
      const state = s(b.state, 40); const term = s(b.q, 60);
      if (!RENTAL_STATES.includes(state) || term.length < 3) return 'bad request: state and 3+ letters';
      return { path: `/transactions/rental/projects?${new URLSearchParams({ state, q: term })}` };
    }
  }
}

/**
 * How many credits Oneharta's answer says the call cost. A missing or odd value on a successful answer counts as the most the
 * call could cost (the owner's credits are protected; the agent can ask the owner to check). Never more than creditsMax.
 */
export function creditsCharged(answer: unknown, ok: boolean, creditsMax: number): { credits: number; trusted: boolean } {
  const c = (answer as J | null)?.creditsCharged;
  // Oneharta: a refused call (4xx) or a 5xx charges nothing unless its answer says so.
  if (!ok) return typeof c === 'number' && Number.isInteger(c) && c > 0 ? { credits: Math.min(c, creditsMax), trusted: c <= creditsMax } : { credits: 0, trusted: true };
  if (typeof c === 'number' && Number.isInteger(c) && c >= 0) return { credits: Math.min(c, creditsMax), trusted: c <= creditsMax };
  return { credits: creditsMax, trusted: false };
}

/** The Oneharta record this lookup can be reopened by for free later (a land tax record token), if any. */
export function recordRef(kind: PaidKind, answer: unknown, call: OhCall): string | undefined {
  if (kind === 'ct_search') { const t = (answer as J | null)?.record as J | null; return typeof t?.token === 'string' ? t.token.slice(0, 120) : undefined; }
  return call.ref;
}
