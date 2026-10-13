// "Find buyers looking for a factory in Salak Tinggi under RM3 million".
// The app does not keep a structured "requirements" form for buyers, so the match uses what IS recorded, on the phone:
//   - the buyer's notes and source (what the agent typed about what they want), and
//   - the properties the buyer asked about or was booked to view (type, place, price, bedrooms).
// Only what was said in the command is used as a condition. The result is a list to review; nothing is changed.
// Whether buyers should get proper requirement fields is an open product decision (docs/STAGE5.md).
import { BUYER_ROLES, Contact, Inquiry, Appointment, LeadStatus } from '../data/types';
import { Listing } from '../listing/model';
import { prepare, readDetails } from '../listing/commands';

export interface BuyerQuery {
  /** Words for the kind of property, e.g. "factory", "terrace", "condo". */
  type?: string;
  area?: string;
  purpose?: 'sale' | 'rent';
  maxPrice?: number;
  bedrooms?: number;
}
export interface BuyerMatch { contact: Contact; score: number; reasons: string[] }

const NOUNS: [RegExp, string][] = [
  [/\bfactor(?:y|ies)\b|\bkilang\b/i, 'factory'], [/\bwarehouses?\b|\bgudang\b/i, 'warehouse'], [/\bsemi[-\s]?d\b|\bberkembar\b/i, 'semi-d'],
  [/\bterrace(?:d)?\b|\bteres\b/i, 'terrace'], [/\bbungalows?\b|\bbanglo\b/i, 'bungalow'], [/\bcondo(?:minium)?s?\b|\bapartments?\b|\bpangsapuri\b|\bkondominium\b/i, 'condo'],
  [/\bshop\s?lots?\b|\bkedai\b/i, 'shop'], [/\boffices?\b|\bpejabat\b/i, 'office'], [/\bland\b|\btanah\b/i, 'land'], [/\btown\s?houses?\b/i, 'townhouse'],
];

/** True when the text asks for buyers (or tenants) by what they want. Returns null otherwise. */
export function parseBuyerQuery(text: string, places: string[] = []): { query: BuyerQuery; any: boolean } | null {
  const raw = text.trim();
  if (!/^(?:please\s+)?(?:find|show|search|list|look\s+for|who|cari|tunjuk|senarai|siapa)\b/i.test(raw)) return null;
  if (!/\b(?:buyers?|tenants?|clients?|investors?|pembeli|penyewa|pelanggan|pelabur)\b/i.test(raw)) return null;
  if (/\b(?:appointments?|tasks?|to-?dos?|viewings?|temujanji|tugasan|lawatan)\b/i.test(raw)) return null;
  const p = prepare(raw);
  const low = p.toLowerCase();
  const d = readDetails(p, places);
  const val = (k: string) => d.changes.find(c => c.key === k)?.value;
  const q: BuyerQuery = {};
  q.type = NOUNS.find(([re]) => re.test(low))?.[1];
  const area = (val('township') ?? val('city')) as string | undefined;
  if (area) q.area = area;
  if (/\b(?:tenants?|penyewa|for\s+rent|to\s+rent|untuk\s+disewa|rental|sewa(?:an)?)\b/i.test(low)) q.purpose = 'rent';
  else if (/\b(?:for\s+sale|to\s+buy|untuk\s+dijual|beli)\b/i.test(low)) q.purpose = 'sale';
  const budget = /\b(?:under|below|up\s+to|max(?:imum)?|budget(?:\s+of)?|within|bawah|kurang\s+daripada|bajet|sehingga)\s*(?:rm|ringgit)?\s*([\d]+(?:\.\d+)?)/i.exec(low);
  if (budget) q.maxPrice = parseFloat(budget[1]);
  const beds = /(\d+)\s*(?:bed(?:room)?s?\b|bilik\s+tidur)/i.exec(low);
  if (beds) q.bedrooms = Number(beds[1]);
  return { query: q, any: Object.values(q).some(v => v !== undefined) };
}

const typeHit = (t: string | undefined, noun: string) => !!t && t.toLowerCase().replace(/[_-]/g, ' ').includes(noun.replace('-', ' '));
const has = (hay: string, needle: string) => hay.toLowerCase().includes(needle.toLowerCase());
const LEAD_ORDER: Record<LeadStatus, number> = { hot: 0, warm: 1, cold: 2, booked: 3, dropped: 4 };

/** Buyers / tenants / investors that fit the query, best first. A buyer needs at least one match; every match is listed as a reason. */
export function findBuyers(q: BuyerQuery, contacts: Contact[], inquiries: Inquiry[], appointments: Appointment[], properties: Listing[]): BuyerMatch[] {
  const byId = new Map(properties.map(p => [p.id, p]));
  const out: BuyerMatch[] = [];
  for (const c of contacts) {
    if (!c.roles.some(r => BUYER_ROLES.includes(r))) continue;
    if (q.purpose === 'rent' && !c.roles.some(r => r === 'tenant' || r === 'buyer' || r === 'investor')) continue;
    const reasons: string[] = [];
    const notes = `${c.notes ?? ''} ${c.source ?? ''}`;
    if (q.type && has(notes, q.type)) reasons.push(`notes: ${q.type}`);
    if (q.area && has(notes, q.area)) reasons.push(`notes: ${q.area}`);
    if (q.bedrooms !== undefined && new RegExp(`\\b${q.bedrooms}\\s*[- ]?(?:bed|br\\b|bilik)`, 'i').test(notes)) reasons.push(`notes: ${q.bedrooms} bed`);
    if (q.purpose === 'rent' && /\b(?:rent|sewa|tenant|penyewa)/i.test(notes)) reasons.push('notes: rent');
    const seen = new Set<string>();
    const linked = [...inquiries.filter(i => i.contactId === c.id), ...appointments.filter(a => a.contactId === c.id)].map(x => x.propertyId).filter((x): x is string => !!x);
    for (const pid of linked) {
      const p = byId.get(pid);
      if (!p || seen.has(pid)) continue;
      seen.add(pid);
      const label = p.ref || p.township || p.type || 'property';
      if (q.type && typeHit(p.type, q.type)) reasons.push(`asked about ${label}: ${q.type}`);
      if (q.area && (has(p.township ?? '', q.area) || has(p.city ?? '', q.area))) reasons.push(`asked about ${label}: ${q.area}`);
      if (q.maxPrice !== undefined && q.maxPrice > 0 && ((p.askingPrice ?? Infinity) <= q.maxPrice || (q.purpose === 'rent' && (p.monthlyRent ?? Infinity) <= q.maxPrice))) reasons.push(`asked about ${label}: within budget`);
      if (q.bedrooms !== undefined && p.bedrooms === q.bedrooms) reasons.push(`asked about ${label}: ${q.bedrooms} bed`);
    }
    if (reasons.length) out.push({ contact: c, score: reasons.length, reasons });
  }
  return out.sort((a, b) => b.score - a.score || LEAD_ORDER[a.contact.leadStatus ?? 'cold'] - LEAD_ORDER[b.contact.leadStatus ?? 'cold'] || a.contact.name.localeCompare(b.contact.name));
}
