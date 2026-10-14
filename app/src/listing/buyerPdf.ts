// Buyer-facing property PDF: which details can be offered, how each is written, and the document built from the agent's
// choices. Only facts that are in the record are written; a detail that is missing is left out, or (if the agent ticks it)
// shown as "To be confirmed" — never guessed. Owner, commission, internal notes, tenancy, documents and exact map
// position are never offered. Each important fact keeps its check-status label (Confirmed / Owner stated / Need to
// check / Unknown / Not marked), and anything not confirmed is marked, so unverified facts cannot pass as confirmed.
import type { Lang } from '../i18n';
import type { Profile } from '../data/types';
import { Listing, rm, landText, sqft, placeName, yearsRemaining, thisYear, unitLot, restrictionValue } from './model';
import { listingStrings, ListingStrings, typeLabel } from './strings';
import { isVerifiable, shownState } from './verify';
import { fmtDate, monthText } from '../lib/dates';
import type { Doc, Block } from '../lib/pdf';
import { titled3 } from '../lib/titleCase';

export type BuyerGroup = 'basics' | 'location' | 'size' | 'money' | 'tenure' | 'condition' | 'features';
export const BUYER_GROUPS: BuyerGroup[] = ['basics', 'location', 'size', 'money', 'tenure', 'condition', 'features'];

/** Details the agent can choose, in the order they appear. */
export const BUYER_KEYS: { key: keyof Listing; group: BuyerGroup; /** ticked at first when it has a value */ on: boolean }[] = [
  { key: 'ref', group: 'basics', on: true }, { key: 'type', group: 'basics', on: true }, { key: 'purpose', group: 'basics', on: true }, { key: 'status', group: 'basics', on: false },
  { key: 'township', group: 'location', on: true }, { key: 'city', group: 'location', on: true }, { key: 'state', group: 'location', on: true },
  { key: 'street', group: 'location', on: false }, { key: 'unitNo', group: 'location', on: false },
  { key: 'bedrooms', group: 'size', on: true }, { key: 'bathrooms', group: 'size', on: true }, { key: 'floors', group: 'size', on: true }, { key: 'parking', group: 'size', on: true },
  { key: 'landSqft', group: 'size', on: true }, { key: 'builtUpSqft', group: 'size', on: true }, { key: 'frontageFt', group: 'size', on: true }, { key: 'depthFt', group: 'size', on: true },
  { key: 'lotType', group: 'size', on: true }, { key: 'furnishing', group: 'size', on: true }, { key: 'ceilingFt', group: 'size', on: true }, { key: 'powerKva', group: 'size', on: true },
  { key: 'loadingBays', group: 'size', on: true }, { key: 'specs', group: 'size', on: true }, { key: 'zoning', group: 'size', on: true }, { key: 'approvals', group: 'size', on: false },
  { key: 'currentUse', group: 'size', on: true }, { key: 'roadAccess', group: 'size', on: true },
  { key: 'askingPrice', group: 'money', on: true }, { key: 'negotiable', group: 'money', on: true }, { key: 'monthlyRent', group: 'money', on: true },
  { key: 'securityDepositMonths', group: 'money', on: true }, { key: 'utilityDepositMonths', group: 'money', on: true }, { key: 'maintenanceFee', group: 'money', on: true },
  { key: 'tenure', group: 'tenure', on: true }, { key: 'leaseExpiryYear', group: 'tenure', on: true }, { key: 'titleType', group: 'tenure', on: true },
  { key: 'landUse', group: 'tenure', on: true }, { key: 'restriction', group: 'tenure', on: true },
  { key: 'availability', group: 'condition', on: true }, { key: 'availableFrom', group: 'condition', on: true }, { key: 'condition', group: 'condition', on: true },
  { key: 'features', group: 'features', on: true },
];

/** Never offered in a buyer PDF, whatever the agent ticks. */
export const NEVER_SHARED: string[] = [
  'ownerName', 'ownerPhone', 'ownerWhatsapp', 'vendorId', 'commissionPct', 'commissionFlat', 'commissionType', 'rentCommissionMonths', 'rentCommissionFlat', 'rentCommissionType', 'arrangement', 'arrangementNote', 'notes', 'handledBy', 'tenancy', 'documents',
  'marketing', 'history', 'filledFrom', 'verification', 'lat', 'lng', 'placeId', 'geoSource', 'geoAccuracy', 'photos',
];

export interface BuyerField { key: keyof Listing; group: BuyerGroup; label: string; value?: string; /** check-status label, for the facts that have one */ status?: string; confirmed?: boolean; on: boolean }

const has = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== '';

/** How one detail is written for buyers. Returns undefined when the record has no value (nothing is invented). */
export function valueOf(l: Listing, key: keyof Listing, s: ListingStrings, lang: Lang, year = thisYear()): string | undefined {
  // One Unit/Lot Number (Change 009): older records with a separate lot number show both together.
  const v = key === 'unitNo' ? unitLot(l) : key === 'restriction' ? restrictionValue(l.restriction) : l[key];
  if (!has(v)) return undefined;
  switch (key) {
    case 'type': return typeLabel(s, String(v));
    case 'purpose': return s.purpose[String(v)] ?? String(v);
    case 'status': return s.status[String(v)] ?? String(v);
    case 'askingPrice': case 'monthlyRent': case 'maintenanceFee': return rm(Number(v)) + (key === 'monthlyRent' || key === 'maintenanceFee' ? ` ${s.perMonth}` : '');
    case 'landSqft': return landText(Number(v));
    case 'builtUpSqft': return sqft(Number(v));
    case 'frontageFt': case 'depthFt': case 'ceilingFt': return `${v} ft`;
    case 'powerKva': return `${v} kVA`;
    case 'securityDepositMonths': case 'utilityDepositMonths': return s.months(Number(v));
    case 'tenure': return s.tenure[String(v)] ?? String(v);
    case 'leaseExpiryYear': { const y = yearsRemaining(l, year); return y !== undefined ? `${v} (${s.yearsLeft(y)})` : String(v); }
    case 'titleType': return s.titleTypes[String(v)] ?? String(v);
    case 'landUse': return s.landUse[String(v)] ?? String(v);
    case 'restriction': return s.restrictions[String(v)] ?? String(v);
    case 'lotType': return s.lotType[String(v)] ?? String(v);
    case 'furnishing': return s.furnishing[String(v)] ?? String(v);
    case 'negotiable': return s.negotiable[String(v)] ?? String(v);
    case 'availability': return s.availability[String(v)] ?? String(v);
    case 'condition': return s.condition[String(v)] ?? String(v);
    case 'availableFrom': return monthText(String(v), lang) || fmtDate(String(v), lang);
    default: return String(v);
  }
}

/** All details the agent can choose from, with their written value (if any) and check status. */
export function buyerFields(l: Listing, lang: Lang, year = thisYear()): BuyerField[] {
  const s = listingStrings[lang];
  return BUYER_KEYS.map(({ key, group, on }) => {
    const value = valueOf(l, key, s, lang, year);
    const field: BuyerField = { key, group, label: s.l[key as string] ?? String(key), value, on: on && value !== undefined };
    if (value !== undefined && isVerifiable(String(key))) {
      // Not marked = Need to check (Change 009): nothing is presented as confirmed unless it was marked so.
      const st = shownState(l, String(key)) ?? 'check';
      field.status = s.verify[st];
      field.confirmed = st === 'confirmed';
    }
    return field;
  });
}

/** What is ticked at first: every detail that has a value and is normally shared. */
export const defaultSelection = (fields: BuyerField[]): Record<string, boolean> => Object.fromEntries(fields.filter(f => f.on).map(f => [String(f.key), true]));

export interface AgentChoice { name: boolean; agency: boolean; regNo: boolean; phone: boolean; email: boolean }
export const defaultAgentChoice = (p: Pick<Profile, 'fullName' | 'agency' | 'regNo' | 'phone' | 'email'>): AgentChoice => ({ name: !!p.fullName, agency: !!p.agency, regNo: false, phone: !!p.phone, email: false });
export const agentLines = (p: Pick<Profile, 'fullName' | 'agency' | 'regNo' | 'phone' | 'email'>, c: AgentChoice): string[] =>
  [c.name && p.fullName, c.agency && p.agency, c.regNo && p.regNo && `${p.regNo}`, c.phone && p.phone, c.email && p.email].filter((x): x is string => !!x && !!String(x).trim());

/** The most photos one PDF takes (keeps the file small enough to send by WhatsApp or email). */
export const MAX_PDF_PHOTOS = 12;

/** A title that is safe to print or use as a file name: the advert title, else the property type (and the area when the agent allows the location), else a plain word.
 *  It is NEVER built from the street, unit or lot number: those are only shown when the agent ticks them. (Stage 6 fix: the Stage 5 buyer PDF used the address-style card title.) */
export function publicTitle(l: Listing, s: ListingStrings, withPlace: boolean, fallback: string): string {
  const own = l.headline?.trim();
  if (own) return own;
  const kind = l.type ? typeLabel(s, l.type) : '';
  const area = withPlace ? placeName(l) : '';
  return [kind, area].filter(Boolean).join(', ') || fallback;
}

export interface BuyerDocInput {
  lang: Lang;
  listing: Listing;
  fields: BuyerField[];
  /** key → ticked */
  selected: Record<string, boolean>;
  photos: { src: string; w: number; h: number; caption?: string }[];
  agent?: Pick<Profile, 'fullName' | 'agency' | 'regNo' | 'phone' | 'email'>;
  agentChoice?: AgentChoice;
  now: number;
}

export function buildBuyerDoc(i: BuyerDocInput): Doc {
  const s = listingStrings[i.lang];
  const b = buyerStrings[i.lang];
  const l = i.listing;
  const blocks: Block[] = [];
  const place = [l.township, l.city, l.state].filter(has).join(', ');
  const heading = publicTitle(l, s, !!(i.selected['township'] || i.selected['city']), b.untitled);
  const sub = [l.purpose ? s.purpose[l.purpose] : '', i.selected['township'] || i.selected['city'] ? place : ''].filter(Boolean).join(' · ');
  blocks.push({ t: 'title', text: l.sample ? `${heading} (${b.sample})` : heading, sub: sub || undefined });
  const photos = i.photos.slice(0, MAX_PDF_PHOTOS);
  if (photos.length) {
    blocks.push({ t: 'photos', items: photos.slice(0, 1), cols: 1 });
    if (photos.length > 1) blocks.push({ t: 'photos', items: photos.slice(1), cols: photos.length > 4 ? 3 : 2 });
  }
  let anyChecked = false, anyUnconfirmed = false;
  for (const g of BUYER_GROUPS) {
    const rows = i.fields.filter(f => f.group === g && i.selected[String(f.key)]).map(f => {
      if (f.value === undefined) return { k: f.label, v: b.toBeConfirmed, warn: true };
      if (f.status !== undefined) { anyChecked = true; if (!f.confirmed) anyUnconfirmed = true; }
      return { k: f.label, v: f.value, ...(f.status !== undefined ? { tag: f.status, warn: !f.confirmed } : {}) };
    });
    if (!rows.length) continue;
    blocks.push({ t: 'heading', text: b.groups[g] }, { t: 'rows', rows });
  }
  const lines = i.agent && i.agentChoice ? agentLines(i.agent, i.agentChoice) : [];
  if (lines.length) {
    blocks.push({ t: 'heading', text: b.contact });
    lines.forEach((x, n) => blocks.push({ t: 'text', text: x, bold: n === 0 }));
  }
  if (anyChecked) blocks.push({ t: 'space', h: 4 }, { t: 'text', small: true, text: anyUnconfirmed ? b.legendUnconfirmed : b.legendAll });
  blocks.push({ t: 'text', small: true, text: b.disclaimer });
  return { blocks, footer: `${b.footer} · ${fmtDate(i.now, i.lang)}` };
}

// ---------- text in the three languages ----------
const en = {
  open: 'Buyer PDF', title: 'Buyer PDF', intro: 'Choose what the buyer sees. Only ticked details and photos go into the PDF. Owner details, commission, internal notes and tenancy are never included.',
  language: 'PDF language', details: 'Details to include', notProvided: 'Not provided yet', missingHelp: 'Not in the record. Tick one to show “To be confirmed”; otherwise it is left out.',
  all: 'Tick all with a value', none: 'Clear all', contact: 'Your contact details', contactNone: 'Add your name and phone under Agent Profile to print them here.', photos: 'Photos',
  photosNone: 'This property has no photos yet. The PDF will have no pictures.', photosHelp: (n: number) => `Tick the photos to include (up to ${n}). The first one is shown large.`,
  preview: 'Preview PDF', untitled: 'Property', sample: 'Sample', toBeConfirmed: 'To be confirmed',
  skipped: (n: number) => `${n} photo${n === 1 ? '' : 's'} could not be loaded and ${n === 1 ? 'was' : 'were'} left out.`, count: (n: number, t: number) => `${n} of ${t} ticked`, selectedPhotos: (n: number) => `${n} photo${n === 1 ? '' : 's'} ticked`,
  groups: { basics: 'Property', location: 'Location', size: 'Size and layout', money: 'Price', tenure: 'Tenure and title', condition: 'Condition and availability', features: 'Features' } as Record<BuyerGroup, string>,
  legendAll: 'Marks beside a detail show its check status. All marked details are confirmed.',
  legendUnconfirmed: 'Marks beside a detail show its check status. Details marked anything other than “Confirmed” have not been verified yet: please confirm them before relying on them.',
  disclaimer: 'Information is supplied by the agent and is not guaranteed. Please verify the details and take professional advice before you decide.',
  footer: 'Property information', fileName: 'property', noProperty: 'This property no longer exists.',
};
export type BuyerStrings = typeof en;
const bm: BuyerStrings = {
  open: 'PDF pembeli', title: 'PDF pembeli', intro: 'Pilih apa yang pembeli lihat. Hanya butiran dan foto yang ditanda masuk ke dalam PDF. Butiran pemilik, komisen, nota dalaman dan penyewaan tidak pernah dimasukkan.',
  language: 'Bahasa PDF', details: 'Butiran untuk dimasukkan', notProvided: 'Belum diberi', missingHelp: 'Tiada dalam rekod. Tanda satu untuk menunjukkan “Akan disahkan”; jika tidak ia ditinggalkan.',
  all: 'Tanda semua yang ada nilai', none: 'Kosongkan semua', contact: 'Butiran hubungan anda', contactNone: 'Tambah nama dan telefon anda di bawah Profil Ejen untuk dicetak di sini.', photos: 'Foto',
  photosNone: 'Hartanah ini belum ada foto. PDF tidak akan mempunyai gambar.', photosHelp: (n: number) => `Tanda foto untuk dimasukkan (sehingga ${n}). Yang pertama ditunjukkan besar.`,
  preview: 'Pratonton PDF', untitled: 'Hartanah', sample: 'Contoh', toBeConfirmed: 'Akan disahkan',
  skipped: (n: number) => `${n} foto tidak dapat dimuatkan dan ditinggalkan.`, count: (n: number, t: number) => `${n} daripada ${t} ditanda`, selectedPhotos: (n: number) => `${n} foto ditanda`,
  groups: { basics: 'Hartanah', location: 'Lokasi', size: 'Saiz dan susun atur', money: 'Harga', tenure: 'Pegangan dan hak milik', condition: 'Keadaan dan ketersediaan', features: 'Ciri-ciri' },
  legendAll: 'Tanda di sebelah butiran menunjukkan status semakan. Semua butiran bertanda telah disahkan.',
  legendUnconfirmed: 'Tanda di sebelah butiran menunjukkan status semakan. Butiran yang bertanda selain “Disahkan” belum disahkan: sila sahkan sebelum bergantung padanya.',
  disclaimer: 'Maklumat dibekalkan oleh ejen dan tidak dijamin. Sila sahkan butiran dan dapatkan nasihat profesional sebelum anda membuat keputusan.',
  footer: 'Maklumat hartanah', fileName: 'hartanah', noProperty: 'Hartanah ini sudah tiada.',
};
const zh: BuyerStrings = {
  open: '买家 PDF', title: '买家 PDF', intro: '选择买家能看到的内容。只有勾选的资料和照片会放入 PDF。屋主资料、佣金、内部备注和租约绝不会包含在内。',
  language: 'PDF 语言', details: '要包含的资料', notProvided: '尚未提供', missingHelp: '记录中没有。勾选可显示“待确认”；否则会省略。',
  all: '勾选所有有内容的项目', none: '全部取消', contact: '您的联系方式', contactNone: '请在“代理资料”中添加姓名和电话，以便印在这里。', photos: '照片',
  photosNone: '此房产还没有照片。PDF 将没有图片。', photosHelp: (n: number) => `勾选要包含的照片（最多 ${n} 张）。第一张会放大显示。`,
  preview: '预览 PDF', untitled: '房产', sample: '示例', toBeConfirmed: '待确认',
  skipped: (n: number) => `${n} 张照片无法载入，已省略。`, count: (n: number, t: number) => `已勾选 ${n}/${t}`, selectedPhotos: (n: number) => `已勾选 ${n} 张照片`,
  groups: { basics: '房产', location: '位置', size: '面积与格局', money: '价格', tenure: '地契与产权', condition: '状况与可用性', features: '特色' },
  legendAll: '资料旁的标记显示其核实状态。所有已标记的资料均已确认。',
  legendUnconfirmed: '资料旁的标记显示其核实状态。标记不是“已确认”的资料尚未核实：请先确认后再依赖。',
  disclaimer: '资料由代理提供，不作保证。请在作决定前核实详情并咨询专业意见。',
  footer: '房产资料', fileName: '房产', noProperty: '这个房产已不存在。',
};
export const buyerStrings: Record<Lang, BuyerStrings> = titled3({ en, bm, zh });
