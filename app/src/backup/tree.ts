// Change 006 Layer 2: what the readable Google Drive folders hold, worked out from the app's records (pure: no Drive
// calls here; driveTree.ts writes it). The person opens these folders in Drive like any others: text files, CSV files,
// photos and documents. It is a VIEW for the person, not a backup format (restore points are Layer 3).
//
//   Estate Agent AI Buddy/
//     README.txt · Export Status.txt · Index.csv            (written by driveTree.ts)
//     Settings/                                             Current Settings.txt, Custom Values.txt
//     Property Listing/<Country>/<State>/<Town>/<Township>/<Unit/Lot + street>/<Owner>/
//        Property Details.txt, Owner Details.txt, Pictures/01-…, Documents/<category>/…, Buyers/<name>/Buyer Details.txt,
//        Tenancy/Tenant Details.txt, Adverts/Adverts.txt + screenshots, Banners/Banner Details.txt + photos
//     Property Listing/Archived/…                           archived (Change 010 "deleted") properties, same layout
//     To-Do/ · Calendar/ · Contacts/Buyers|Vendors|Other/ · Inquiries and Viewings/ · GPS Assistance/ ·
//     Agent Financial/ · Property Calculator/ · Agent Profile/ · Ask Expert/      (only when they hold something)
//
// What goes in (owner decision of 16 Oct 2026: this is the owner's own trusted Google Drive, and an incomplete backup
// defeats its purpose):
//  - Every field of the owner's records, identity numbers included, and every attached document, confidential ones
//    included (Documents/Property Title, Owner Correspondence, Agreements…). No extra app-level encryption: Google Drive's
//    own access control and secure connections (owner decision).
//  - Only this account's own records: never a record another agent shares in (Change 010), never sample data. Team
//    sharing is a separate boundary (data/fileRefs.ts): nothing here is ever shared by the app.
//  - No settings secrets: the Maps key, the Supabase address and key, and the Ask Expert address are never written.
//  - Records changed on the phone but not yet confirmed by the cloud are marked `waiting`: their previous Drive copy
//    stays until the change has synced (design: the Drive layers are written from cloud-confirmed data).
//
// Content and names are in English whatever the app language, so switching language never rewrites every file.
// Names use the record's current values; empty levels are "… Not Recorded"; identity always comes from the stable ID in
// each file's header and in Index.csv, never from a folder name. Two items that would get the same name in one folder:
// the later one (by creation, then id) gets " [first 8 characters of its id]".
import type { AppState, Appointment, CollectionName, Contact, Deal, ExpertThread, Expense, Income, Inquiry, Journey, Target, Task, Calculation, Banner } from '../data/types';
import type { Project } from '../projects/model';
import { BUYER_ROLES, VENDOR_ROLES } from '../data/types';
import { Listing, orderedPhotos, unitLot } from '../listing/model';
import { fieldLabel } from '../sync/SyncUI';
import { showValue } from '../audit/model';
import { hash53 } from '../data/hash';
import { cleanName, mytIso } from './driveApi';

export interface TreeEntry {
  /** Stable key: the same item always has the same key, whatever its name or folder. */
  key: string;
  /** The record ("collection:id") the item belongs to, or a module key ("finance", "settings", "profile"). */
  group: string;
  /** Folders below the app's root folder. */
  path: string[];
  name: string;
  mime: string;
  /** Text content (text and CSV files). */
  text?: string;
  /** A stored file (photo, document, screenshot). */
  fileId?: string;
  /** Changes whenever the content changes. */
  hash: string;
  /** The folder that holds this record's whole group (moved to Recovery as a unit when the record goes). */
  groupRoot?: string[];
  /** The record has unsynced changes: keep the previous Drive copy for now. */
  waiting?: boolean;
}

const photosN = (n: number) => `${n} photo${n === 1 ? '' : 's'}`;
const DOC_FOLDER: Record<string, string> = { brochure: 'Brochures and Floor Plans', floorplan: 'Brochures and Floor Plans', other: 'Other', title: 'Property Title', correspondence: 'Owner Correspondence', transaction: 'Agreements' };
const MOD = {
  props: 'Property Listing', todo: 'To-Do', cal: 'Calendar', contacts: 'Contacts', inq: 'Inquiries and Viewings', gps: 'GPS Assistance',
  fin: 'Agent Financial', calc: 'Property Calculator', profile: 'Agent Profile', expert: 'Ask Expert', settings: 'Settings', projects: 'Projects',
};
/** Settings fields that are never written to Drive (keys and addresses). */
const SECRET_SETTINGS = new Set(['mapsApiKey', 'supabaseUrl', 'supabaseAnonKey', 'expertApiUrl']);

const ext = (name: string | undefined, fallback: string) => { const m = /\.([A-Za-z0-9]{1,5})$/.exec(name ?? ''); return m ? m[1].toLowerCase() : fallback; };
export function mimeFor(name: string): string {
  const e = ext(name, '');
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } as Record<string, string>)[e] ?? 'application/octet-stream';
}
const id8 = (id: string) => id.replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || id.slice(0, 8);
const pad2 = (n: number) => String(n).padStart(2, '0');
const indent = (v: string) => v.replace(/\r?\n/g, '\n    ');

function textDoc(title: string, id: string | undefined, updated: number | undefined, lines: [string, string][], extra = ''): string {
  const head = [title, ...(id ? [`Record ID: ${id}`] : []), ...(updated ? [`Last changed: ${mytIso(updated)}`] : []), ''];
  return [...head, ...lines.map(([k, v]) => `${k}: ${indent(v)}`)].join('\n') + '\n' + (extra ? `\n${extra}` : '');
}
/** Every current field of a record, labelled in English (nothing withheld: the owner's own Drive). Photos are counted
 *  (they are in Pictures/); documents are listed by name and category (they are in Documents/). */
function snap(c: CollectionName, rec: unknown): [string, string][] {
  const out: [string, string][] = [];
  const walk = (v: unknown, path: string) => {
    if (path === 'photos' && Array.isArray(v)) { out.push([path, photosN(v.length)]); return; }
    if (path === 'documents' && Array.isArray(v)) { v.forEach((d, i) => { const doc = d as { name?: string; category?: string }; out.push([`documents.${i + 1}`, `${doc.name ?? ''}${doc.category ? ` (${doc.category})` : ''}`]); }); return; }
    if (v && typeof v === 'object' && !Array.isArray(v)) { for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, path ? `${path}.${k}` : k); return; }
    if (v === undefined || v === null || v === '') return;
    out.push([path, showValue(v)]);
  };
  for (const [k, v] of Object.entries(rec as Record<string, unknown>)) { if (k === 'id' || k === 'sample' || k === 'history') continue; walk(v, k); }
  return out.map(([p, v]) => [p.includes('.') ? `${fieldLabel('en', c, p)} (${p})` : fieldLabel('en', c, p), v] as [string, string]).sort((a, b) => a[0].localeCompare(b[0]));
}

const csvCell = (v: unknown) => { const s = v === undefined || v === null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const csv = (header: string[], rows: unknown[][]) => [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

/** Folder/file names unique within each folder, decided in a fixed order so reruns give the same names. */
class Names {
  private used = new Map<string, Set<string>>();
  claim(path: string[], wanted: string, id: string, extension = ''): string {
    const k = path.join('/');
    const set = this.used.get(k) ?? new Set<string>(); this.used.set(k, set);
    let name = `${wanted}${extension}`;
    if (set.has(name.toLowerCase())) name = `${wanted} [${id8(id)}]${extension}`;
    let n = 2; while (set.has(name.toLowerCase())) name = `${wanted} [${id8(id)}-${n++}]${extension}`;
    set.add(name.toLowerCase());
    return name;
  }
}

const byAge = <T extends { created: number; id: string }>(a: T, b: T) => a.created - b.created || (a.id < b.id ? -1 : 1);

export interface TreeOptions { /** Records with changes the cloud has not confirmed ("collection:id"). */ waiting?: Set<string> }

export function buildTree(state: AppState, opts: TreeOptions = {}): TreeEntry[] {
  const shared = state.meta.shared ?? {};
  const mine = <T extends { id: string; sample?: boolean }>(c: CollectionName, list: T[]) => list.filter(r => !r.sample && !shared[`${c}:${r.id}`]);
  const waiting = opts.waiting ?? new Set<string>();
  const isWaiting = (...keys: string[]) => keys.some(k => waiting.has(k));
  const out: TreeEntry[] = [];
  const names = new Names();
  const add = (e: Omit<TreeEntry, 'hash'> & { hash?: string }) => out.push({ ...e, hash: e.hash ?? (e.fileId ? `file:${e.fileId}` : hash53(e.text ?? '')) });

  const props = mine('properties', state.properties).slice().sort(byAge) as Listing[];
  const contacts = mine('contacts', state.contacts).slice().sort(byAge) as Contact[];
  const contactById = new Map(contacts.map(c => [c.id, c]));
  const inquiries = mine('inquiries', state.inquiries) as Inquiry[];
  const appts = mine('appointments', state.appointments) as Appointment[];
  const banners = mine('banners', state.banners).slice().sort(byAge) as Banner[];
  const propTitle = (id?: string) => { const p = props.find(x => x.id === id); return p ? [p.ref, [unitLot(p), p.street].filter(Boolean).join(' ') || p.headline].filter(Boolean).join(' · ') : undefined; };

  // ---------- Property Listing ----------
  for (const p of props) {
    const key = `properties:${p.id}`;
    const w = isWaiting(key);
    const owner = (p.vendorId && contactById.get(p.vendorId)?.name) || p.ownerName;
    const loc = [
      cleanName(p.country, 'Country Not Recorded'), cleanName(p.state, 'State Not Recorded'), cleanName(p.city, 'Town Not Recorded'),
      cleanName(p.township, 'Township Not Recorded'), cleanName([unitLot(p), p.street].filter(Boolean).join(' '), 'Address Not Recorded'),
    ];
    const parent = [MOD.props, ...(p.archived ? ['Archived'] : []), ...loc];
    const root = [...parent, names.claim(parent, cleanName(owner, 'Owner Not Recorded'), p.id)];
    const grp = { group: key, groupRoot: root, waiting: w };
    const archivedLine: [string, string][] = p.archived ? [['Archived', mytIso(p.archived.at)]] : [];
    add({ key: `${key}:details`, path: root, name: 'Property Details.txt', mime: 'text/plain', text: textDoc('Property Details', p.id, p.updated, [...archivedLine, ...snap('properties', p)]), ...grp });
    const vendor = p.vendorId ? contactById.get(p.vendorId) : undefined;
    const ownerLines: [string, string][] = vendor ? snap('contacts', vendor) : ([['Name', p.ownerName], ['Phone', p.ownerPhone], ['WhatsApp', p.ownerWhatsapp]] as [string, string | undefined][]).filter((x): x is [string, string] => !!x[1]);
    if (ownerLines.length) add({ key: `${key}:owner`, path: root, name: 'Owner Details.txt', mime: 'text/plain', text: textDoc('Owner Details', vendor?.id, vendor?.updated, ownerLines), ...grp, waiting: w || (!!vendor && isWaiting(`contacts:${vendor.id}`)) });
    orderedPhotos(p).forEach((ph, i) => {
      if (!ph.fileId) return;
      const base = cleanName((ph.name ?? '').replace(/\.[A-Za-z0-9]{1,5}$/, ''), 'photo');
      add({ key: `${key}:photo:${ph.fileId}`, path: [...root, 'Pictures'], name: `${pad2(i + 1)}-${base}.${ext(ph.name, 'jpg')}`, mime: mimeFor(`x.${ext(ph.name, 'jpg')}`), fileId: ph.fileId, ...grp });
    });
    const docNames = new Names();
    for (const d of (p.documents ?? []).slice().sort((a, b) => a.added - b.added || (a.id < b.id ? -1 : 1))) {
      if (!d.fileId) continue;                                                       // confidential ones included (owner decision)
      const folder = [...root, 'Documents', DOC_FOLDER[d.category] ?? 'Other'];
      const e = ext(d.name, 'pdf');
      add({ key: `${key}:doc:${d.fileId}`, path: folder, name: docNames.claim(folder, cleanName(d.name.replace(/\.[A-Za-z0-9]{1,5}$/, ''), 'document'), d.id, `.${e}`), mime: d.mime || mimeFor(`x.${e}`), fileId: d.fileId, ...grp });
    }
    // buyers who enquired about or viewed this property
    const linked = new Map<string, { inq: Inquiry[]; appt: Appointment[] }>();
    for (const q of inquiries) if (q.propertyId === p.id && contactById.has(q.contactId)) { const x = linked.get(q.contactId) ?? { inq: [], appt: [] }; x.inq.push(q); linked.set(q.contactId, x); }
    for (const a of appts) if (a.propertyId === p.id && a.contactId && contactById.has(a.contactId)) { const x = linked.get(a.contactId) ?? { inq: [], appt: [] }; x.appt.push(a); linked.set(a.contactId, x); }
    for (const c of contacts) {
      const x = linked.get(c.id); if (!x) continue;
      const folder = [...root, 'Buyers'];
      const name = names.claim(folder, cleanName(c.name, 'Buyer Not Named'), c.id);
      const hist = [
        ...x.inq.sort((a, b) => (a.at < b.at ? -1 : 1)).map(q => `Inquiry ${q.at} (${q.channel})${q.message ? `: ${q.message}` : ''}`),
        ...x.appt.sort((a, b) => ((a.start ?? '') < (b.start ?? '') ? -1 : 1)).map(a => `${a.kind === 'viewing' ? 'Viewing' : 'Appointment'} ${a.start ?? 'time not set'} (${a.status})${a.outcome ? `: ${a.outcome}` : ''}`),
      ];
      add({ key: `${key}:buyer:${c.id}`, path: [...folder, name], name: 'Buyer Details.txt', mime: 'text/plain', text: textDoc('Buyer Details (for this property)', c.id, c.updated, snap('contacts', c), `Inquiries and viewings for this property:\n${hist.map(h => `- ${indent(h)}`).join('\n')}\n`), ...grp, waiting: w || isWaiting(`contacts:${c.id}`, ...x.inq.map(q => `inquiries:${q.id}`), ...x.appt.map(a => `appointments:${a.id}`)) });
    }
    const t = p.tenancy;
    if (t && Object.values(t).some(v => v !== undefined && v !== '')) add({ key: `${key}:tenancy`, path: [...root, 'Tenancy'], name: 'Tenant Details.txt', mime: 'text/plain', text: textDoc('Tenant Details', p.id, p.updated, ([['Tenant', t.tenant], ['Phone', t.tenantPhone], ['WhatsApp', t.tenantWhatsapp], ['Start', t.start], ['End', t.end], ['Rent (RM)', t.rent], ['Notes', t.notes]] as [string, unknown][]).filter(x => x[1] !== undefined && x[1] !== '').map(([k, v]) => [k, String(v)] as [string, string])), ...grp });
    const ads = p.marketing?.ads ?? [];
    if (ads.length) {
      const lines = ads.map((a, i) => [`Advert ${i + 1}${a.fake ? ' [TEST - not a real listing]' : ''}`, [a.platform, a.type, a.status, a.title, a.start && `from ${a.start}`, a.end && `to ${a.end}`, a.ref && `ref ${a.ref}`, a.url, a.cost !== undefined && `RM ${a.cost}`, a.notes].filter(Boolean).join(' · ')] as [string, string]);
      add({ key: `${key}:adverts`, path: [...root, 'Adverts'], name: 'Adverts.txt', mime: 'text/plain', text: textDoc('Adverts', p.id, p.updated, lines), ...grp });
      ads.forEach((a, i) => { if (a.screenshotFileId) add({ key: `${key}:adshot:${a.screenshotFileId}`, path: [...root, 'Adverts'], name: `${pad2(i + 1)}-${cleanName(a.platform, 'advert').replace(/\s+/g, '-')}${a.fake ? '-TEST' : ''}.jpg`, mime: 'image/jpeg', fileId: a.screenshotFileId, ...grp }); });
    }
    const pb = banners.filter(b => b.propertyId === p.id);
    if (pb.length) {
      const lines = pb.map((b, i) => [`Banner ${i + 1}`, [`placed ${b.placedOn}`, b.removedOn && `removed ${b.removedOn}`, `at ${b.lat.toFixed(6)}, ${b.lng.toFixed(6)} (${b.source}${b.acc ? `, ±${Math.round(b.acc)} m` : ''})`, b.moves?.length && `moved ${b.moves.length} time(s)`, b.note].filter(Boolean).join(' · ')] as [string, string]);
      add({ key: `${key}:banners`, path: [...root, 'Banners'], name: 'Banner Details.txt', mime: 'text/plain', text: textDoc('Banner Details', p.id, Math.max(...pb.map(b => b.updated)), lines), ...grp, waiting: w || isWaiting(...pb.map(b => `banners:${b.id}`)) });
      pb.forEach((b, i) => { if (b.photoFileId) add({ key: `banners:${b.id}:photo`, path: [...root, 'Banners'], name: `${pad2(i + 1)}-banner-${cleanName(b.placedOn, 'date')}.jpg`, mime: 'image/jpeg', fileId: b.photoFileId, group: key, groupRoot: root, waiting: w || isWaiting(`banners:${b.id}`) }); });
    }
  }

  // ---------- one text file per record ----------
  const perRecord = <T extends { id: string; created: number; updated: number }>(c: CollectionName, list: T[], folder: string[], label: (r: T) => string, title: string, extra?: (r: T) => string) => {
    for (const r of list.slice().sort(byAge)) {
      const key = `${c}:${r.id}`;
      const name = names.claim(folder, cleanName(label(r), 'Untitled'), r.id, '.txt');
      add({ key, group: key, path: folder, name, mime: 'text/plain', text: textDoc(title, r.id, r.updated, snap(c, r), extra?.(r)), waiting: isWaiting(key) });
    }
  };
  const tasks = mine('tasks', state.tasks) as Task[];
  perRecord('tasks', tasks, [MOD.todo], t => `${t.done ? 'Done - ' : ''}${t.title}`, 'To-Do');
  perRecord('appointments', appts, [MOD.cal], a => [a.start?.replace('T', ' ').replace(':', '.'), a.title || a.kind].filter(Boolean).join(' '), 'Calendar', a => [propTitle(a.propertyId) && `Property: ${propTitle(a.propertyId)}`, a.contactId && contactById.get(a.contactId) && `Contact: ${contactById.get(a.contactId)!.name}`].filter(Boolean).join('\n') + '\n');
  perRecord('inquiries', inquiries, [MOD.inq], q => `${q.at.replace('T', ' ').replace(':', '.')} ${contactById.get(q.contactId)?.name ?? 'Unknown contact'}`, 'Inquiry', q => [propTitle(q.propertyId) && `Property: ${propTitle(q.propertyId)}`, contactById.get(q.contactId) && `Contact: ${contactById.get(q.contactId)!.name}`].filter(Boolean).join('\n') + '\n');
  for (const c of contacts) {
    const key = `contacts:${c.id}`;
    const kind = c.roles.some(r => VENDOR_ROLES.includes(r)) ? ['Vendors', 'Vendor Details.txt'] : c.roles.some(r => BUYER_ROLES.includes(r)) ? ['Buyers', 'Buyer Details.txt'] : ['Other', 'Contact Details.txt'];
    const folder = [MOD.contacts, kind[0]];
    const root = [...folder, names.claim(folder, cleanName(c.name, 'Name Not Recorded'), c.id)];
    add({ key, group: key, groupRoot: root, path: root, name: kind[1], mime: 'text/plain', text: textDoc(kind[1].replace('.txt', ''), c.id, c.updated, snap('contacts', c)), waiting: isWaiting(key) });
  }
  const journeys = (mine('journeys', state.journeys) as Journey[]).filter(j => j.status === 'saved');
  for (const j of journeys.slice().sort(byAge)) {
    const key = `journeys:${j.id}`; const folder = [MOD.gps, 'House Shopping Journeys'];
    const name = names.claim(folder, cleanName(`${mytIso(j.startedAt).slice(0, 16).replace('T', ' ').replace(':', '.')} ${j.title ?? 'Journey'}`, 'Journey'), j.id, '.txt');
    const table = csv(['time', 'latitude', 'longitude', 'accuracy_m'], j.points.map(p => [mytIso(p.t), p.lat, p.lng, Math.round(p.acc)]));
    const { points: _pts, ...rest } = j; void _pts;
    add({ key, group: key, path: folder, name, mime: 'text/plain', text: textDoc('House Shopping Journey', j.id, j.updated, [...snap('journeys', rest), ['Route points', String(j.points.length)]], `Route points (time, latitude, longitude, accuracy in metres):\n${table}`), waiting: isWaiting(key) });
  }
  if (banners.length) add({ key: 'banners:all', group: 'banners', path: [MOD.gps], name: 'Banner Locations.txt', mime: 'text/plain', text: textDoc('Banner Locations', undefined, undefined, banners.map(b => [propTitle(b.propertyId) ?? 'Property not found', `${b.lat.toFixed(6)}, ${b.lng.toFixed(6)} · placed ${b.placedOn}${b.removedOn ? ` · removed ${b.removedOn}` : ''}`] as [string, string])), waiting: isWaiting(...banners.map(b => `banners:${b.id}`)) });

  // ---------- Agent Financial (tables) ----------
  const deals = mine('deals', state.deals) as Deal[]; const expenses = mine('expenses', state.expenses) as Expense[];
  const incomes = mine('incomes', state.incomes) as Income[]; const targets = mine('targets', state.targets) as Target[];
  const fin = (c: CollectionName, list: { id: string }[]) => isWaiting(...list.map(r => `${c}:${r.id}`));
  if (deals.length) add({ key: 'finance:deals', group: 'finance', path: [MOD.fin], name: 'Deals.csv', mime: 'text/csv', text: csv(['id', 'date', 'title', 'property', 'side', 'value_rm', 'commission_pct', 'commission_rm', 'my_share_pct', 'status', 'received_date', 'received_rm', 'notes'], deals.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map(d => [d.id, d.date, d.title, propTitle(d.propertyId), d.side, d.value, d.commissionPct, d.commission, d.sharePct, d.status, d.receivedDate, d.receivedAmount, d.notes])), waiting: fin('deals', deals) });
  if (expenses.length) add({ key: 'finance:expenses', group: 'finance', path: [MOD.fin], name: 'Expenses.csv', mime: 'text/csv', text: csv(['id', 'date', 'category', 'amount_rm', 'property', 'note'], expenses.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map(e => [e.id, e.date, e.category, e.amount, propTitle(e.propertyId), e.note])), waiting: fin('expenses', expenses) });
  if (incomes.length) add({ key: 'finance:incomes', group: 'finance', path: [MOD.fin], name: 'Income.csv', mime: 'text/csv', text: csv(['id', 'date', 'source', 'amount_rm', 'note'], incomes.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map(e => [e.id, e.date, e.source, e.amount, e.note])), waiting: fin('incomes', incomes) });
  if (targets.length) add({ key: 'finance:targets', group: 'finance', path: [MOD.fin], name: 'Targets.txt', mime: 'text/plain', text: textDoc('Targets', undefined, undefined, targets.slice().sort((a, b) => (a.key < b.key ? -1 : 1)).map(t => [`${t.period === 'year' ? 'Year' : 'Month'} ${t.key}`, `RM ${t.amount}`] as [string, string])), waiting: fin('targets', targets) });

  perRecord('projects', mine('projects', state.projects) as Project[], [MOD.projects], p => p.name || 'Project', 'Project',
    p => `Unit types:\n${p.unitTypes.map(u => `- ${u.name}${u.priceFrom !== undefined ? ` RM ${u.priceFrom}` : ''}${u.priceTo !== undefined ? ` to RM ${u.priceTo}` : ''}${u.units !== undefined ? `, ${u.units} units` : ''}`).join('\n')}\nBookings:\n${p.bookings.map(b => `- ${b.unitNo} ${b.status}${b.buyerName ? ` ${b.buyerName}` : ''}${b.bookedOn ? ` ${b.bookedOn}` : ''}`).join('\n')}\n`);
  perRecord('calculations', mine('calculations', state.calculations) as Calculation[], [MOD.calc], c => `${c.title || c.kind} ${mytIso(c.created).slice(0, 10)}`, 'Saved Calculation');
  perRecord('expertThreads', mine('expertThreads', state.expertThreads) as ExpertThread[], [MOD.expert], t => `${t.expert} - ${t.question.slice(0, 50)}`, 'Ask Expert', t => `Messages:\n${t.messages.map(m => `- ${mytIso(m.at)} ${m.from}: ${indent(m.text)}`).join('\n')}\n`);

  // ---------- Agent Profile ----------
  const pr = state.profile;
  const prLines = ([['Full name', pr.fullName], ['Registration', [pr.regType, pr.regNo].filter(Boolean).join(' ')], ['Agency', pr.agency], ['Phone', pr.phone], ['Email', pr.email]] as [string, string | undefined][]).filter((x): x is [string, string] => !!x[1]);
  if (prLines.length) add({ key: 'profile:text', group: 'profile', path: [MOD.profile], name: 'Profile.txt', mime: 'text/plain', text: textDoc('Agent Profile', undefined, undefined, prLines) });
  for (const [k, n] of [['photoFileId', 'Photo'], ['cardFrontFileId', 'Name Card Front'], ['cardBackFileId', 'Name Card Back']] as const) if (pr[k]) add({ key: `profile:${k}`, group: 'profile', path: [MOD.profile], name: `${n}.jpg`, mime: 'image/jpeg', fileId: pr[k] });

  // ---------- Settings (never keys or addresses) ----------
  const st = state.settings as unknown as Record<string, unknown>;
  const setLines = Object.keys(st).filter(k => !SECRET_SETTINGS.has(k) && st[k] !== undefined && st[k] !== '').sort().map(k => [k, typeof st[k] === 'object' ? JSON.stringify(st[k]) : String(st[k])] as [string, string]);
  add({ key: 'settings:current', group: 'settings', path: [MOD.settings], name: 'Current Settings.txt', mime: 'text/plain', text: textDoc('Current Settings', undefined, undefined, setLines) });
  const opt = Object.entries(state.options ?? {}).filter(([, v]) => v?.length).sort(([a], [b]) => (a < b ? -1 : 1));
  if (opt.length) add({ key: 'settings:options', group: 'settings', path: [MOD.settings], name: 'Custom Values.txt', mime: 'text/plain', text: textDoc('Custom Values (remembered dropdown values)', undefined, undefined, opt.map(([k, v]) => [k, v.map(o => o.value).join(' | ')] as [string, string])) });
  return out;
}

/** Records with changes the cloud has not confirmed yet (dirty or waiting deletions), as "collection:id". */
export function waitingKeys(state: AppState): Set<string> {
  const s = new Set<string>([...state.meta.dirty, ...state.meta.tombstones]);
  for (const c of state.meta.conflicts ?? []) s.add(c.key);
  return s;
}

