// JoyChange003 Changes 58 and 60-64: the AI Assisted Command screen's understanding, without a browser (so it is tested).
//  - 61: several commands in one sentence ("add buyer Lim 012 888 7777 and remind me to call him tomorrow at 3pm") are
//    split into parts; "him" / "her" / "dia" in a later part becomes the name said earlier.
//  - 61 / 64: follow-ups ("now set the price to 1.2 million", "WhatsApp this buyer") use the record chosen or changed last.
//  - 63: sentences that mix English and Bahasa Malaysia are read again with the Malay words put into English.
//  - 64: "open property list", "open vendor list" (or owner list), "open buyer list"; "WhatsApp this buyer and remind our
//    appointment" with suggested texts filled in from the saved records.
//  - 62: the last 10 commands, and suggestion chips from the saved data.
// Everything here only PROPOSES; the screen asks before anything is saved, and WhatsApp is never sent by the app.
import type { Lang } from '../i18n';
import type { Appointment, Contact, Inquiry, Task } from '../data/types';
import { BUYER_ROLES, VENDOR_ROLES } from '../data/types';
import { cardTitle, rm, type Listing } from '../listing/model';
import { parseAgenda } from './agenda';
import { followUpDue } from '../domain/followup';

// ---------- 61: several commands in one sentence ----------
/** Words that start a command. A new part begins only where one of these follows "and", "then", "dan", ";" or ". ". */
const VERB = String.raw`(?:please\s+)?(?:remind|add|create|new|schedule|book|set|change|update|mark|find|show|search|open|whats\s?app|wa|call|message|ingatkan|tambah|cipta|daftar|atur|buat|tetapkan|tukar|ubah|tandakan|cari|tunjuk|buka|hubungi|telefon|mesej)\b`;
const SPLIT = new RegExp(String.raw`\s*(?:[;]\s*|\.\s+|,?\s+(?:and\s+then|and\s+also|and|then|also|after\s+that|lepas\s+tu|selepas\s+itu|kemudian|dan\s+juga|dan)\s+)(?=${VERB})`, 'i');

/** One sentence → its commands, in order. A sentence with one command comes back as it is. */
export function splitCommands(text: string): string[] {
  const parts = text.split(SPLIT).map(x => x.trim().replace(/[.\s]+$/, '')).filter(Boolean);
  // "WhatsApp this buyer and remind our appointment": the reminder is what the message is about, not a new to-do
  // ("… and remind me to …" stays a to-do of its own).
  const out: string[] = [];
  for (const p of parts) {
    const prev = out[out.length - 1];
    if (prev && /^(?:please\s+)?(?:whats\s?app|wa|message|mesej|send\s+(?:a\s+)?whats\s?app|hantar\s+whats\s?app)\b/i.test(prev) && /^(?:remind|ingatkan)\b(?!\s+(?:me|saya)\b)/i.test(p)) out[out.length - 1] = `${prev} and ${p}`;
    else out.push(p);
  }
  return out;
}

const PRONOUN = /\b(him|her|them|dia|beliau)\b/gi;
/** "him" / "her" / "them" / "dia" in a later part → the name of the person added or named in an earlier part. */
export function resolvePronouns(parts: string[]): string[] {
  let name: string | undefined;
  return parts.map(p => {
    const a = parseAgenda(p);
    const out = name ? p.replace(PRONOUN, name) : p;
    if (a?.kind === 'contact' && a.name) name = a.name;
    else if (a?.kind === 'appointment' && a.who) name = a.who.replace(/^the\s+/i, '');
    return out;
  });
}

// ---------- 63: mixed English and Bahasa Malaysia ----------
/** Malay words and phrases → English, longest first. Used only when a sentence is not understood as it is. */
const BM_EN: [RegExp, string][] = ([
  ['ingatkan saya untuk', 'remind me to'], ['ingatkan saya', 'remind me to'], ['tolong', 'please'], ['tambah', 'add'], ['cipta', 'create'], ['daftar', 'add'],
  ['baharu', 'new'], ['baru', 'new'], ['pembeli', 'buyer'], ['penyewa', 'tenant'], ['penjual', 'vendor'], ['pemilik', 'owner'], ['tuan rumah', 'owner'],
  ['cari', 'find'], ['tunjuk', 'show'], ['buka', 'open'], ['senarai', 'list'], ['tukar', 'change'], ['ubah', 'change'], ['tetapkan', 'set'], ['tandakan', 'mark'],
  ['harga', 'price'], ['sewa', 'rent'], ['kepada', 'to'], ['jadi', 'to'], ['sebagai', 'as'], ['untuk dijual', 'for sale'], ['untuk disewa', 'for rent'],
  ['esok', 'tomorrow'], ['lusa', 'day after tomorrow'], ['hari ini', 'today'], ['minggu depan', 'next week'],
  ['temujanji', 'appointment'], ['lawatan', 'viewing'], ['mesyuarat', 'meeting'], ['tugasan', 'task'],
  ['telefon', 'call'], ['hubungi', 'call'], ['dengan', 'with'], ['untuk', 'for'], ['yang', 'who'], ['nak', 'want'], ['mahu', 'want'], ['cari rumah', 'looking for a house'],
  ['rumah teres', 'terrace house'], ['rumah berkembar', 'semi-d house'], ['kilang', 'factory'], ['gudang', 'warehouse'], ['tanah', 'land'], ['kedai', 'shoplot'],
  ['bilik tidur', 'bedrooms'], ['bilik air', 'bathrooms'], ['bilik', 'bedrooms'], ['juta', 'million'], ['ribu', 'thousand'],
  ['terjual', 'sold'], ['disewa', 'rented'], ['tersedia', 'available'], ['ini', 'this'], ['itu', 'that'], ['dia', 'him'],
] as [string, string][]).sort((a, b) => b[0].length - a[0].length).map(([bm, en]) => [new RegExp(`\\b${bm}\\b`, 'gi'), en]);

/** A mixed English / Malay sentence with the Malay command words put into English ("tukar price P1001 kepada 1.2 juta"
 *  → "change price P1001 to 1.2 million"). Times ("pukul 3 petang") are left as they are: the readers know them. */
export function mixToEnglish(text: string): string {
  let out = text;
  for (const [re, en] of BM_EN) out = out.replace(re, en);
  return out.replace(/\s+/g, ' ').trim();
}
/** True when the sentence has some Malay words (so reading it again in English may help). */
export const hasMalay = (text: string) => BM_EN.some(([re]) => { re.lastIndex = 0; const hit = re.test(text); re.lastIndex = 0; return hit; });

// ---------- 64: open a list ----------
export type ListKind = 'property' | 'vendor' | 'buyer';
/** "open property list", "show my buyer list", "open owner list", "buka senarai pembeli". */
export function parseOpenList(text: string): ListKind | null {
  const t = text.trim().toLowerCase().replace(/[.!]+$/, '');
  const m = /^(?:please\s+|tolong\s+)?(?:open|show|display|buka|tunjuk|papar)\s+(?:the\s+|my\s+)?(?:(property|properties|listing|listings|vendor|vendors|owner|owners|landlord|buyer|buyers|tenant|tenants)\s+list|senarai\s+(hartanah|harta|penjual|pemilik|tuan\s+rumah|pembeli|penyewa))$/.exec(t);
  if (!m) return null;
  const w = m[1] ?? m[2];
  if (/^(?:propert|listing|hartanah|harta)/.test(w)) return 'property';
  if (/^(?:vendor|owner|landlord|penjual|pemilik|tuan)/.test(w)) return 'vendor';
  return 'buyer';
}

// ---------- 64 / 63: WhatsApp and call ----------
export type WaTopic = 'appointment' | 'followup' | 'property' | 'price' | 'thanks' | 'update';
export interface WaCommand { kind: 'whatsapp' | 'call'; who?: string; topic?: WaTopic; thisOne: boolean }
/** "WhatsApp this buyer and remind our appointment", "WhatsApp Lim about the price", "call this owner", "whatsapp dia". */
export function parseContactAction(text: string): WaCommand | null {
  const t = text.trim().replace(/[.!]+$/, '');
  const m = /^(?:please\s+|tolong\s+)?(whats\s?app|wa|send\s+(?:a\s+)?whats\s?app(?:\s+(?:to|message\s+to))?|message|mesej|hantar\s+whats\s?app(?:\s+kepada)?|call|phone|ring|telefon|hubungi)\b\s*(.*)$/i.exec(t);
  if (!m) return null;
  const kind: WaCommand['kind'] = /^(?:call|phone|ring|telefon|hubungi)/i.test(m[1]) ? 'call' : 'whatsapp';
  let rest = m[2] ?? '';
  // "call him tomorrow at 3pm" is a to-do, not a call now.
  if (kind === 'call' && /\b(?:tomorrow|today|tonight|esok|lusa|at\s+\d|pukul|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(rest)) return null;
  const low = rest.toLowerCase();
  const topic: WaTopic | undefined = /remind|appointment|viewing|temujanji|lawatan|janji/.test(low) ? 'appointment'
    : /price|harga/.test(low) ? 'price' : /thank|terima\s+kasih/.test(low) ? 'thanks' : /follow|susulan|interest/.test(low) ? 'followup'
      : /update|news|perkembangan/.test(low) ? 'update' : /property|listing|hartanah|unit|house|rumah/.test(low) ? 'property' : undefined;
  rest = rest.replace(/\b(?:and|dan|to|untuk|about|tentang|regarding|mengenai)\b.*$/i, '').trim();
  const thisOne = !rest || /^(?:this|that|the|it|him|her|them|ini|itu|dia|beliau)\b/i.test(rest);
  const who = thisOne ? undefined : rest.replace(/^(?:buyer|vendor|owner|tenant|pembeli|penjual|pemilik)\s+/i, '').trim() || undefined;
  return { kind, who, topic, thisOne };
}

/** "this", "it", "now set…": a follow-up about the record chosen or changed last. */
export const refersBack = (text: string) => /\b(?:this|it|that|same|now|ini|itu|tersebut|tadi)\b/i.test(text);

/** Phone digits for WhatsApp and calling: a Malaysian 0… number gets the 60 country code. */
export function waDigits(raw?: string): string {
  const d = (raw ?? '').replace(/\D/g, '');
  if (!d) return '';
  return d.startsWith('0') ? '6' + d : d;
}
export const waLink = (phone: string | undefined, text: string) => `https://wa.me/${waDigits(phone)}?text=${encodeURIComponent(text)}`;

// ---------- 64: suggested WhatsApp texts ----------
export interface WaData { name?: string; property?: string; date?: string; time?: string; price?: string }

/** The saved details a message can use: the contact's next appointment (date, time, property), else the property chosen,
 *  else the property of the contact's latest inquiry. */
export function waDataFor(contact: Contact | undefined, chosen: Listing | undefined, s: { properties: Listing[]; appointments: Appointment[]; inquiries: Inquiry[] }, now = new Date()): WaData {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const next = contact ? s.appointments
    .filter(a => a.contactId === contact.id && a.start && a.start.slice(0, 10) >= today && a.status !== 'cancelled' && a.status !== 'completed')
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))[0] : undefined;
  const inq = contact ? s.inquiries.filter(i => i.contactId === contact.id && i.propertyId).sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))[0] : undefined;
  const prop = chosen ?? s.properties.find(p => p.id === next?.propertyId) ?? s.properties.find(p => p.id === inq?.propertyId);
  const name = contact?.name?.replace(/\s*\(sample\)\s*/i, '').trim();
  return {
    name: name || undefined,
    property: prop ? [prop.ref, cardTitle(prop)].filter(Boolean).join(', ') : undefined,
    date: next?.start?.slice(0, 10), time: next?.start?.slice(11, 16) || undefined,
    price: prop?.askingPrice ? rm(prop.askingPrice) : prop?.monthlyRent ? `${rm(prop.monthlyRent)}/month` : undefined,
  };
}

const hi = (lang: Lang, n?: string) => (lang === 'bm' ? `Hai${n ? ' ' + n : ''},` : lang === 'zh' ? `${n ? n + '，' : ''}您好！` : `Hi${n ? ' ' + n : ''},`);
const on = (lang: Lang, d: WaData) => {
  const when = [d.date && dateWords(d.date, lang), d.time && timeWords(d.time, lang)].filter(Boolean).join(lang === 'zh' ? ' ' : lang === 'bm' ? ' pukul ' : ' at ');
  return when;
};
function dateWords(ymd: string, lang: Lang): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(lang === 'bm' ? 'ms-MY' : lang === 'zh' ? 'zh-CN' : 'en-MY', { weekday: 'long', day: 'numeric', month: 'long' });
}
function timeWords(hm: string, lang: Lang): string {
  const [h, m] = hm.split(':').map(Number);
  if (lang === 'zh') return `${h}:${String(m).padStart(2, '0')}`;
  const h12 = h % 12 || 12;
  const tail = lang === 'bm' ? (h < 12 ? 'pagi' : h < 19 ? 'petang' : 'malam') : (h < 12 ? 'am' : 'pm');
  return `${h12}${m ? ':' + String(m).padStart(2, '0') : ''}${lang === 'bm' ? ' ' : ''}${tail}`;
}

export interface WaTemplate { id: string; topic: WaTopic; text: (d: WaData, lang: Lang) => string }
/** The built-in suggestions. Each one leaves out a detail that is not saved, so nothing is made up. */
export const WA_TEMPLATES: WaTemplate[] = [
  { id: 'appt', topic: 'appointment', text: (d, l) => {
    const when = on(l, d);
    if (l === 'bm') return `${hi(l, d.name)} sekadar peringatan tentang temujanji kita${d.property ? ` untuk ${d.property}` : ''}${when ? ` pada ${when}` : ''}. Jumpa nanti!`;
    if (l === 'zh') return `${hi(l, d.name)}提醒您我们的约见${d.property ? `（${d.property}）` : ''}${when ? `，时间：${when}` : ''}。到时见！`;
    return `${hi(l, d.name)} just a reminder of our appointment${d.property ? ` for ${d.property}` : ''}${when ? ` on ${when}` : ''}. See you then!`;
  } },
  { id: 'follow', topic: 'followup', text: (d, l) => l === 'bm' ? `${hi(l, d.name)} saya ingin bertanya khabar${d.property ? ` tentang ${d.property}` : ''}. Adakah anda masih berminat?`
    : l === 'zh' ? `${hi(l, d.name)}想跟进一下${d.property ? `关于 ${d.property} 的情况` : '您的需求'}。您还有兴趣吗？`
      : `${hi(l, d.name)} just following up${d.property ? ` on ${d.property}` : ''}. Are you still interested?` },
  { id: 'offer', topic: 'property', text: (d, l) => l === 'bm' ? `${hi(l, d.name)} saya ada hartanah yang mungkin sesuai untuk anda${d.property ? `: ${d.property}` : ''}${d.price ? ` (${d.price})` : ''}. Mahu atur lawatan?`
    : l === 'zh' ? `${hi(l, d.name)}我有一个可能适合您的房产${d.property ? `：${d.property}` : ''}${d.price ? `（${d.price}）` : ''}。要安排看房吗？`
      : `${hi(l, d.name)} I have a property that may suit you${d.property ? `: ${d.property}` : ''}${d.price ? ` (${d.price})` : ''}. Would you like to arrange a viewing?` },
  { id: 'price', topic: 'price', text: (d, l) => l === 'bm' ? `${hi(l, d.name)} makluman terkini${d.property ? ` tentang ${d.property}` : ''}: harga${d.price ? ` kini ${d.price}` : ' telah dikemas kini'}.`
    : l === 'zh' ? `${hi(l, d.name)}${d.property ? `${d.property} ` : ''}的最新价格${d.price ? `为 ${d.price}` : '已更新'}。`
      : `${hi(l, d.name)} an update${d.property ? ` on ${d.property}` : ''}: the price is${d.price ? ` now ${d.price}` : ' updated'}.` },
  { id: 'thanks', topic: 'thanks', text: (d, l) => l === 'bm' ? `${hi(l, d.name)} terima kasih kerana melawat${d.property ? ` ${d.property}` : ''}. Apa pendapat anda?`
    : l === 'zh' ? `${hi(l, d.name)}感谢您来看房${d.property ? `（${d.property}）` : ''}。您觉得怎么样？`
      : `${hi(l, d.name)} thank you for viewing${d.property ? ` ${d.property}` : ''}. What did you think?` },
  { id: 'update', topic: 'update', text: (d, l) => l === 'bm' ? `${hi(l, d.name)} ini perkembangan terkini${d.property ? ` tentang ${d.property}` : ''}: `
    : l === 'zh' ? `${hi(l, d.name)}${d.property ? `关于 ${d.property}` : ''}的最新进展：`
      : `${hi(l, d.name)} here is an update${d.property ? ` on ${d.property}` : ''}: ` },
];

/** The agent's own texts may use {name}, {property}, {date}, {time} and {price}; a detail that is not saved is left out. */
export function fillCustom(text: string, d: WaData, lang: Lang): string {
  const v: Record<string, string | undefined> = { name: d.name, property: d.property, date: d.date && dateWords(d.date, lang), time: d.time && timeWords(d.time, lang), price: d.price };
  return text.replace(/\{(name|property|date|time|price)\}/g, (_, k: string) => v[k] ?? '').replace(/\s+([,.!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

/** Suggestions in order: the one that fits what was said first, then the rest (vendors get the property update first). */
export function orderTemplates(topic: WaTopic | undefined, vendor: boolean): WaTemplate[] {
  const first = topic ?? (vendor ? 'update' : undefined);
  return [...WA_TEMPLATES].sort((a, b) => (b.topic === first ? 1 : 0) - (a.topic === first ? 1 : 0));
}

// ---------- 62: recent commands and smart chips ----------
export const RECENT_MAX = 10;
export function pushRecent(list: string[] | undefined, text: string): string[] {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return list ?? [];
  return [t, ...(list ?? []).filter(x => x.toLowerCase() !== t.toLowerCase())].slice(0, RECENT_MAX);
}

export type Chip =
  | { kind: 'follow'; contactId: string; name: string; days: number }
  | { kind: 'viewing'; apptId: string; contactId?: string; propertyId?: string; name?: string; time?: string; place?: string }
  | { kind: 'tasks'; count: number };
/** Up to four suggestions from the saved data: viewings and appointments tomorrow, buyers not contacted for 7 days or more,
 *  and to-dos due today. */
export function smartChips(s: { contacts: Contact[]; appointments: Appointment[]; tasks: Task[]; properties: Listing[] }, now = new Date(), followDays = 7): Chip[] {
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = ymd(now);
  const tmr = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const out: Chip[] = [];
  for (const a of s.appointments.filter(x => x.start?.slice(0, 10) === tmr && (x.status === 'scheduled' || x.status === 'pending')).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')).slice(0, 2)) {
    const c = s.contacts.find(x => x.id === a.contactId);
    const p = s.properties.find(x => x.id === a.propertyId);
    out.push({ kind: 'viewing', apptId: a.id, contactId: c?.id, propertyId: p?.id, name: c?.name, time: a.start?.slice(11, 16) || undefined, place: p ? (p.ref ?? cardTitle(p)) : a.title });
  }
  const buyers = s.contacts.filter(c => c.roles.some(r => BUYER_ROLES.includes(r)));
  for (const f of followUpDue(buyers, now.getTime(), followDays).slice(0, 2)) out.push({ kind: 'follow', contactId: f.contact.id, name: f.contact.name, days: f.quietDays });
  const due = s.tasks.filter(t => !t.done && t.due && t.due.slice(0, 10) <= today).length;
  if (due) out.push({ kind: 'tasks', count: due });
  return out.slice(0, 4);
}

export const isVendor = (c: Contact) => c.roles.some(r => VENDOR_ROLES.includes(r));
