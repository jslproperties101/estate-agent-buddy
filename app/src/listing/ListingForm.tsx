// Add / edit property form. Sections in the agreed order: 1 Type & Purpose (the headline is the advert title and sits in Marketing), 2 Tenure & Title, 3 Photos,
// 4 the remaining property information, 5 Documents at the end. Every section can be opened and closed (closed at
// first, owner 13 Oct 2026); a floating Save works from anywhere. Opening it with a section (from the Edit button of
// a detail card) opens and scrolls to that section. Every input has data-field so voice can fill it for review.
// Fields that may not be obvious have a "?" (ui/FieldHelp).
// Change 009 (owner, Oct 2026): section 2 is "Price, Tenure and Title Info" (asking price, commission, negotiable, rent,
// deposits, tenure, title); the old "Price, rental and fees" section is gone and Maintenance Fee is in Property Details,
// with a large Extra Comments box under Furnishing. One Unit/Lot Number field. Add Location saves only a map point (the
// address is never rewritten) and a Google Maps Link can be pasted; no latitude/longitude boxes. Photos are reordered by
// dragging; the first is the main photo. Owner and tenant use the same contact box (phone book at the end of the name row,
// "+" phone, "@" WhatsApp). Banner Placed shows Choose Location, saved to My Banner Map. Verification has no "Not marked":
// an unmarked fact counts as Need to check.
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Lang, strings } from '../i18n';
import { listingStrings } from './strings';
import {
  Listing, TYPES, TENURES, LOT_TYPES, STATUSES, TITLE_TYPES, PURPOSES, ARRANGEMENTS, AVAILABILITY, CONDITIONS,
  FURNISHING, LAND_USES, RESTRICTIONS, DOC_CATEGORIES, CONFIDENTIAL_DOCS, PLATFORMS, AD_STATUSES, MAX_CUSTOM_FIELDS, BANNER_STATUSES,
  rm, yearsRemaining, commissionRm, rentCommissionRm, normalisePhone, Photo, Doc, DocCategory, Advert, fieldsFor, FormField, forRent, forSale,
  ALL_FORM_FIELDS, hasPosition, cardTitle, forEditing, movePhoto, parseMapsLink, RENT_COMMISSION_MONTHS,
} from './model';
import { useDraft } from '../ui/useDraft';
import { DraftBanner } from '../ui/DraftBanner';
import { compressImage } from '../lib/images';
import { useApp } from '../data/useStore';
import { possibleDuplicates } from '../domain/duplicates';
import { dupStrings } from './dupStrings';
import { newId } from '../data/store';
import { Go, FormSection } from '../nav';
import { OptionSelect } from '../ui/OptionSelect';
import { StoredImage, Confirm } from '../ui/common';
import { SpeechBox } from '../ui/SpeechBox';
import { MoneyInput } from '../ui/MoneyInput';
import { readDetails, ChangeKey } from './commands';
import { BUILTIN_PREFIXES, checkRef, defaultPrefix, makeRef, nextNumber, checkPrefix, numberChoices } from '../domain/refs';
import { COUNTRIES, DEFAULT_COUNTRY, MY_STATES, citiesFor, townshipsFor } from '../domain/places';
import { LocationPicker, LocationResult } from '../maps/LocationPicker';
import { FieldHelp } from '../ui/FieldHelp';
import { ContactBox, ContactValue, aliasValue } from '../ui/ContactBox';
import type { PickedContact } from '../lib/phonebook';
import type { Contact } from '../data/types';
import { buildBanner, activeBanners } from '../domain/banners';
import { ymd } from '../lib/dates';
import { contactStrings } from '../contacts/strings';
import { VERIFY_STATES, VerifyState, isVerifiable, shownState, withVerification } from './verify';
import { deleteListing } from './deleteListing';
import { IconMic } from '../icons';
import { FakeBadge } from '../adverts/AdTrackerUI';

/** Sections of the form, in order, and the details each one holds (for the "n filled" line on a closed section). */
const SECTION_IDS = ['basics', 'tenure', 'photos', 'location', 'details', 'availability', 'tenancy', 'owner', 'specs', 'arrangement', 'banner', 'marketing', 'notes', 'docs'];
const SECTION_KEYS: Record<string, string[]> = {
  basics: ['type', 'purpose'],
  tenure: ['askingPrice', 'negotiable', 'commissionPct', 'monthlyRent', 'rentCommissionMonths', 'securityDepositMonths', 'utilityDepositMonths',
    'tenure', 'leaseExpiryYear', 'titleType', 'landUse', 'restriction'],
  location: ['country', 'state', 'city', 'township', 'unitNo', 'street', 'mapsLink', 'lat'],
  details: ['landSqft', 'builtUpSqft', 'frontageFt', 'depthFt', 'bedrooms', 'bathrooms', 'floors', 'parking', 'lotType', 'furnishing', 'extraComments', 'maintenanceFee'],
  specs: ['ceilingFt', 'powerKva', 'loadingBays', 'zoning', 'approvals', 'currentUse', 'roadAccess', 'specs'],
  availability: ['availability', 'availableFrom', 'condition', 'features'],
  owner: ['vendorId', 'ownerName', 'ownerPhone', 'ownerWhatsapp'],
  arrangement: ['arrangement', 'arrangementNote', 'status', 'handledBy'],
  banner: ['bannerStatus'],
  marketing: ['headline'],
  notes: ['notes'],
};

/** One collapsible section of the form. Closed sections keep everything entered (it lives in the form's state). */
function Sec({ id, title, testId, open, onToggle, summary, children }: {
  id: string; title: string; testId?: string; open: boolean; onToggle: () => void; summary: string; children: ReactNode;
}) {
  return (
    <div className={`card stack-sm form-sec ${open ? 'open' : ''}`} id={`sec-${id}`} data-testid={testId} data-open={open ? 'yes' : 'no'}>
      <button type="button" className="sec-head" aria-expanded={open} aria-controls={`sec-${id}-body`} onClick={onToggle} data-sec={id}>
        <span className="card-title">{title}</span>
        <span className="sec-sum">{summary}</span>
        <span className="sec-caret" aria-hidden="true">▾</span>
      </button>
      {open && <div id={`sec-${id}-body`} className="stack-sm sec-body">{children}</div>}
    </div>
  );
}

const num = (v: string) => { const x = parseFloat(v.replace(/[^\d.]/g, '')); return Number.isFinite(x) ? x : undefined; };

export function ListingForm({ lang, id, prefill, section, go, back }: {
  lang: Lang; id?: string; prefill?: Partial<Listing>; section?: FormSection; go: Go; back: () => void;
}) {
  const { state, store } = useApp();
  const s = listingStrings[lang];
  const c = strings[lang].c;
  const initial = id ? state.properties.find(x => x.id === id) : undefined;
  // "money" was its own section before Change 009; links to it now open Price, Tenure and Title Info.
  const startSection = section === 'money' ? 'tenure' : section;
  const [d, setD] = useState<Listing>(() => {
    if (initial) return forEditing(initial);
    const prefix = defaultPrefix(state.options.refPrefix, state.settings.lastPrefix);
    const no = nextNumber(state.properties);
    return { id: newId(), created: Date.now(), updated: Date.now(), photos: [], country: DEFAULT_COUNTRY, refPrefix: prefix, refNo: no, ...prefill };
  });
  const dups = useMemo(() => possibleDuplicates(d, state.properties), [d.street, d.unitNo, d.lotNo, d.township, d.city, d.id, state.properties]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [refNoText, setRefNoText] = useState(String(d.refNo ?? ''));
  const refNoInit = useRef(refNoText);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [posErr, setPosErr] = useState(false);
  const [words, setWords] = useState('');
  const [wordsMsg, setWordsMsg] = useState('');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [checked, setChecked] = useState(false);       // the agent pressed "I have checked them" for the voice-filled fields
  const [askUnchecked, setAskUnchecked] = useState(false);
  const [ownerPick, setOwnerPick] = useState<PickedContact | null>(null);
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [newField, setNewField] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [refErr, setRefErr] = useState<string | null>(null);
  const [refOpen, setRefOpen] = useState(false);
  // Collapsible sections: closed at first (the form is long); opening from a detail card's Edit opens that section.
  const [open, setOpen] = useState<Set<string>>(() => new Set(startSection ? [startSection] : []));
  const [photoMsg, setPhotoMsg] = useState<{ text: string; error: boolean }[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [mapsLinkText, setMapsLinkText] = useState(d.mapsLink ?? '');
  const [bannerPicker, setBannerPicker] = useState(false);
  const [bannerPick, setBannerPick] = useState<{ lat: number; lng: number } | null>(null);
  const [tenantPick, setTenantPick] = useState<PickedContact | null>(null);
  const allOpen = SECTION_IDS.every(x => open.has(x));
  const toggle = (sid: string) => setOpen(o => { const n = new Set(o); if (n.has(sid)) n.delete(sid); else n.add(sid); return n; });
  const addedFiles = useRef<string[]>([]);
  const removedFiles = useRef<string[]>([]);
  // Draft autosave: what is typed here survives closing the app; it is not a saved record until Save is pressed.
  const draft = useDraft<Listing>({
    collection: 'properties', existing: initial, value: d, apply: setD, extra: refNoText, variant: prefill,
    applyExtra: e => setRefNoText(typeof e === 'string' ? e : refNoInit.current),
    onDiscard: dv => {   // pictures and documents added only for the draft go with it
      const kept = new Set([...(initial?.photos ?? []).map(p => p.fileId), ...(initial?.documents ?? []).map(x => x.fileId)]);
      for (const f of [...dv.photos.map(p => p.fileId), ...(dv.documents ?? []).map(x => x.fileId)]) if (f && !kept.has(f)) store.discardFile(f);
      addedFiles.current = [];
    },
  });
  const shownNum = (k: string, v: unknown) => (raw[k] !== undefined && num(raw[k]) === v ? raw[k] : v ?? '');
  const vf = fieldsFor(d.type);
  const show = (k: FormField) => vf.has(k);
  const fieldDefs = (state.options['marketingFields'] ?? []).map(o => o.value);

  // When the number list opens, scroll the list itself (not the page) to the chosen or suggested number.
  useEffect(() => {
    if (!refOpen) return;
    const list = document.querySelector<HTMLElement>('[data-testid="ref-no-list"]');
    const target = list?.querySelector<HTMLElement>('[aria-selected="true"]') ?? list?.querySelector<HTMLElement>(`[data-no="${nextNumber(state.properties, d.id)}"]`);
    if (list && target) list.scrollTop = target.offsetTop - list.clientHeight / 2;
  }, [refOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!startSection) return;
    const el = document.getElementById(`sec-${startSection}`);
    if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
  }, [startSection]);

  const set = <K extends keyof Listing>(k: K, v: Listing[K] | undefined) =>
    setD(prev => ({ ...prev, [k]: v, filledFrom: { ...(prev.filledFrom ?? {}), [k]: 'typed' } }));
  const fromWords = (k: keyof Listing) => d.filledFrom?.[k] === 'words' ? <span className="chip stated small-chip">{s.fromWords}</span> : null;

  // Per-field verification: a small status picker under a field (Confirmed / Owner Stated / Need to Check / Unknown).
  // There is no "Not marked" (Change 009): a fact without a mark shows as Need to Check until someone marks it. The state
  // is kept on the record (Listing.verification); here the word is always shown with its colour.
  const vsel = (k: string, label: string) => {
    const cur = shownState(d, k) ?? 'check';
    return (
      <label className={`vp vp-${cur}`}>
        <span className="vp-label">{s.verify.label}</span>
        <select data-verify={k} aria-label={s.verify.aria(label)} value={cur} className={`vc-sel vc-${cur}`}
          onChange={e => setD(prev => withVerification(prev, k, e.target.value as VerifyState))}>
          {VERIFY_STATES.map(v => <option key={v} value={v}>{s.verify[v]}</option>)}
        </select>
      </label>
    );
  };
  const withVp = (k: string, el: JSX.Element) => isVerifiable(k) ? <div className="fv" key={k}>{el}{vsel(k, s.l[k] ?? k)}</div> : el;

  // Called as functions (not components) so inputs keep focus while typing.
  const Text = ({ k, numeric, area, hint, money }: { k: keyof Listing; numeric?: boolean; area?: boolean; hint?: string; money?: boolean }) => withVp(k as string, (
    <label className="ff" key={k}>
      <span className="between"><span>{s.l[k as string]}<FieldHelp lang={lang} topic={k as string} label={s.l[k as string]} /></span>{fromWords(k)}</span>
      {money ? <MoneyInput data-field={k as string} value={d[k] as number | undefined} onChange={n => set(k, n as never)} /> : area
        ? <textarea data-field={k} rows={3} value={(d[k] as string) ?? ''} onChange={e => set(k, (e.target.value || undefined) as never)} />
        : <input data-field={k} inputMode={numeric ? 'decimal' : undefined} placeholder={hint}
            value={numeric ? (shownNum(k as string, d[k]) as string) : ((d[k] as string | undefined) ?? '')}
            onChange={e => { if (numeric) setRaw(r => ({ ...r, [k]: e.target.value })); set(k, (numeric ? num(e.target.value) : e.target.value || undefined) as never); }} />}
    </label>
  ));
  const Select = ({ k, options, labels }: { k: keyof Listing; options: readonly string[]; labels?: Record<string, string> }) => withVp(k as string, (
    <label className="ff" key={k}>
      <span className="between"><span>{s.l[k as string]}<FieldHelp lang={lang} topic={k as string} label={s.l[k as string]} /></span>{fromWords(k)}</span>
      <select data-field={k} value={(d[k] as string) ?? ''} onChange={e => set(k, (e.target.value || undefined) as never)}>
        <option value="">{s.notSet}</option>
        {options.map(o => <option key={o} value={o}>{labels ? labels[o] : o}</option>)}
      </select>
    </label>
  ));
  const Opt = ({ k, listKey, builtIns, labels }: { k: keyof Listing; listKey: string; builtIns: readonly string[]; labels?: Record<string, string> }) => withVp(k as string, (
    <OptionSelect key={k} lang={lang} label={s.l[k as string]} listKey={listKey} testId={`opt-${String(k)}`}
      builtIns={builtIns.map(v => ({ value: v, label: labels?.[v] ?? v }))} value={d[k] as string | undefined}
      onChange={v => set(k, v as never)} help={<FieldHelp lang={lang} topic={k as string} label={s.l[k as string]} />} />
  ));
  const pair = (...els: (JSX.Element | null | false)[]) => {
    const xs = els.filter(Boolean) as JSX.Element[];
    if (!xs.length) return null;
    return xs.length === 1 ? xs[0] : <div className="two">{xs}</div>;
  };

  /** Adds pictures one by one with a visible spinner and count (they are shrunk first, which can take a moment on a phone).
   *  A file that is not a picture, or cannot be read, is reported by name; the rest are still added. Save and the photo
   *  controls wait until it is finished. The first photo is always the main photo. */
  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files];
    setBusy(true); setPhotoMsg([]); setProgress({ done: 0, total: list.length });
    const added: Photo[] = [];
    const problems: { text: string; error: boolean }[] = [];
    try {
      for (const f of list) {
        try {
          if (!f.type.startsWith('image/')) throw new Error('not an image');
          let blob: Blob = f;
          try { blob = (await compressImage(f)).blob; } catch { /* keep the original */ }
          const fileId = await store.putFile(blob);
          addedFiles.current.push(fileId);
          added.push({ id: newId(), name: f.name, fileId, bytes: blob.size });
        } catch { problems.push({ text: s.n9.photoFailed(f.name), error: true }); }
        setProgress(p => (p ? { ...p, done: p.done + 1 } : p));
      }
      setD(prev => { const photos = [...prev.photos, ...added]; return { ...prev, photos, mainPhotoId: photos[0]?.id }; });
    } finally {
      setBusy(false); setProgress(null);
      setPhotoMsg([...(added.length ? [{ text: s.n9.photosDone(added.length), error: false }] : []), ...problems]);
    }
  }
  /** New order of the photos; the first one is the main photo. */
  const reorder = (from: number, to: number) => setD(prev => { const photos = movePhoto(prev.photos, from, to); return { ...prev, photos, mainPhotoId: photos[0]?.id }; });
  /** Drag by the ⠿ handle (finger, pen or mouse): the photo under the pointer is where it goes. The move and release are
   *  followed on the whole window, so a finger that slides off the small handle still drops the photo in the right place. */
  const dragProps = (i: number) => ({
    onPointerDown: (e: { preventDefault(): void }) => {
      if (busy) return;
      e.preventDefault();
      let over = i;
      setDragFrom(i); setDragOver(i);
      const move = (ev: PointerEvent) => {
        const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-photo-index]');
        const to = el ? Number(el.getAttribute('data-photo-index')) : NaN;
        if (Number.isFinite(to)) { over = to; setDragOver(to); }
      };
      const end = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
        if (ev.type === 'pointerup' && over !== i) reorder(i, over);
        setDragFrom(null); setDragOver(null);
      };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    },
  });
  async function addDocs(category: DocCategory, files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const added: Doc[] = [];
    for (const f of [...files]) {
      const fileId = await store.putFile(f);
      addedFiles.current.push(fileId);
      added.push({ id: newId(), category, name: f.name, fileId, bytes: f.size, mime: f.type, added: Date.now() });
    }
    setD(prev => ({ ...prev, documents: [...(prev.documents ?? []), ...added] }));
    setBusy(false);
  }

  function locate() {
    setPosErr(false);
    if (!('geolocation' in navigator)) { setPosErr(true); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      p => { setLocating(false); setD(prev => ({ ...prev, lat: p.coords.latitude, lng: p.coords.longitude, geoAccuracy: Math.round(p.coords.accuracy), geoSource: 'gps' })); },
      () => { setLocating(false); setPosErr(true); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  }
  /** Add Location (Change 009): only the chosen map point is saved. The typed address is never read back or changed. */
  function applyLocation(r: LocationResult) {
    setD(prev => ({ ...prev, lat: r.lat, lng: r.lng, placeId: undefined, geoSource: 'google', geoAccuracy: undefined }));
    setPicker(false);
  }
  /** Google Maps Link: kept as typed. If the link itself holds the point, the map position is taken from it as well. */
  function setMapsLink(text: string) {
    setMapsLinkText(text);
    const v = text.trim() || undefined;
    const at = parseMapsLink(v);
    setD(prev => ({ ...prev, mapsLink: v, ...(at ? { lat: at.lat, lng: at.lng, geoSource: 'manual' as const, geoAccuracy: undefined, placeId: undefined } : {}) }));
  }
  const linkPoint = parseMapsLink(d.mapsLink);

  /** Voice fill: only empty fields, each marked "from your words". */
  function fillFromWords() {
    if (!words.trim()) return;
    const places = [...(state.options.township ?? []), ...(state.options.city ?? [])].map(o => o.value);
    const { changes } = readDetails(words.trim(), places);
    const filled: ChangeKey[] = [];
    setChecked(false);
    setD(prev => {
      const next: Listing = { ...prev, filledFrom: { ...(prev.filledFrom ?? {}) } };
      const rec = next as unknown as Record<string, unknown>;
      for (const ch of changes) {
        if (ch.key.startsWith('tenancy.') || ch.key === 'notes') continue;
        if (rec[ch.key] !== undefined && rec[ch.key] !== '') continue;
        rec[ch.key] = ch.value;
        (next.filledFrom as Record<string, string>)[ch.key] = 'words';
        filled.push(ch.key);
      }
      return next;
    });
    setTimeout(() => {
      setWordsMsg(s.wordsDone(filled.length));
      // Open the sections that received details, so the agent can check them.
      const secs = SECTION_IDS.filter(x => (SECTION_KEYS[x] ?? []).some(k => filled.includes(k as ChangeKey)));
      if (secs.length) setOpen(o => new Set([...o, ...secs]));
    }, 0);
  }

  const setTen = (k: keyof NonNullable<Listing['tenancy']>, v: string | number | undefined) => setD(prev => {
    const t = { ...(prev.tenancy ?? {}), [k]: v };
    if (v === undefined || v === '') delete (t as Record<string, unknown>)[k];
    return { ...prev, tenancy: Object.keys(t).length ? t : undefined };
  });
  const mk = d.marketing ?? { ads: [], custom: {} };
  const setMk = (patch: Partial<NonNullable<Listing['marketing']>>) => setD(prev => ({ ...prev, marketing: { ads: [], custom: {}, ...(prev.marketing ?? {}), ...patch } }));
  const setAd = (adId: string, patch: Partial<Advert>) => setMk({ ads: mk.ads.map(a => (a.id === adId ? { ...a, ...patch } : a)) });

  // Voice-filled fields the agent has not looked at yet: marked "from words" now but not in the saved record. Derived from the
  // data itself, so it still applies after a restored draft or when the form was opened pre-filled by a voice command.
  const unchecked = Object.entries(d.filledFrom ?? {}).filter(([k, v]) => v === 'words' && initial?.filledFrom?.[k as keyof Listing] !== 'words').map(([k]) => k);
  const needsReview = unchecked.length > 0 && !checked;

  const yrs = yearsRemaining(d);
  const comm = commissionRm(d);
  const rentComm = rentCommissionRm(d);
  const rentMode = forRent(d);
  const saleMode = forSale(d);
  const depositRm = d.monthlyRent !== undefined ? d.monthlyRent * ((d.securityDepositMonths ?? 0) + (d.utilityDepositMonths ?? 0)) : undefined;
  const vendors = state.contacts.filter(x => x.roles.some(r => r === 'vendor' || r === 'landlord') || x.id === d.vendorId);
  const linked = state.contacts.find(v => v.id === d.vendorId);
  const refNo = num(refNoText);
  const refProblem = checkRef(state.properties, d.id, d.refPrefix ?? '', refNo);
  const suggestion = nextNumber(state.properties, d.id);
  const refText = (p: ReturnType<typeof checkRef>) => (p === 'numberTaken' || p === 'refTaken' ? s.refProblem[p](suggestion) : p ? s.refProblem[p] : null);

  /** How many details a section holds, shown on its closed header so nothing entered is hidden from view. */
  const filled = (sid: string): number => {
    const rec = d as unknown as Record<string, unknown>;
    const has = (k: string) => rec[k] !== undefined && rec[k] !== '' && rec[k] !== null;
    switch (sid) {
      case 'photos': return d.photos.length;
      case 'docs': return (d.documents ?? []).length;
      case 'tenancy': return Object.keys(d.tenancy ?? {}).length;
      case 'marketing': return (d.headline ? 1 : 0) + (d.marketing?.ads.length ?? 0) + Object.values(d.marketing?.custom ?? {}).filter(Boolean).length + (d.marketing?.advertised ? 1 : 0);
      default: return (SECTION_KEYS[sid] ?? []).filter(has).length;
    }
  };
  const secProps = (sid: string) => { const n = filled(sid); return { open: open.has(sid), onToggle: () => toggle(sid), summary: n ? s.secFilled(n) : s.secEmpty }; };

  /** Owner chosen from the phone book: fills name and number; if something different is already typed, ask before replacing it. */
  function pickOwner(p: PickedContact) {
    const differs = (d.ownerName && p.name && d.ownerName !== p.name) || (d.ownerPhone && p.tel && normalisePhone(p.tel) !== normalisePhone(d.ownerPhone));
    if (differs) setOwnerPick(p); else applyOwner(p);
  }
  const applyOwner = (p: PickedContact) => setD(prev => ({
    ...prev, ownerName: p.name || prev.ownerName, ownerPhone: normalisePhone(p.tel) ?? prev.ownerPhone,
    filledFrom: { ...(prev.filledFrom ?? {}), ownerName: 'typed', ownerPhone: 'typed' },
  }));
  const setOwner = (patch: ContactValue) => setD(prev => {
    const next = { ...prev, filledFrom: { ...(prev.filledFrom ?? {}) } };
    if ('name' in patch) { next.ownerName = patch.name; next.filledFrom.ownerName = 'typed'; }
    if ('phone' in patch) { next.ownerPhone = patch.phone; next.filledFrom.ownerPhone = 'typed'; }
    if ('whatsapp' in patch) next.ownerWhatsapp = patch.whatsapp;
    return next;
  });
  /** A saved contact chosen for the owner: link that vendor record instead of typing the same person again. */
  const linkOwner = (c: Contact) => setD(prev => ({ ...prev, vendorId: c.id, ownerName: undefined, ownerPhone: undefined, ownerWhatsapp: undefined }));
  // Tenant (Change 009): same contact box, kept with the tenancy.
  const tenant: ContactValue = { name: d.tenancy?.tenant, phone: d.tenancy?.tenantPhone, whatsapp: d.tenancy?.tenantWhatsapp };
  const setTenant = (patch: ContactValue) => {
    if ('name' in patch) setTen('tenant', patch.name);
    if ('phone' in patch) setTen('tenantPhone', patch.phone);
    if ('whatsapp' in patch) setTen('tenantWhatsapp', patch.whatsapp);
  };
  const applyTenant = (p: PickedContact) => setTenant({ name: p.name || tenant.name, phone: normalisePhone(p.tel) ?? tenant.phone });
  function pickTenant(p: PickedContact) {
    const differs = (tenant.name && p.name && tenant.name !== p.name) || (tenant.phone && p.tel && normalisePhone(p.tel) !== normalisePhone(tenant.phone));
    if (differs) setTenantPick(p); else applyTenant(p);
  }

  function save(skipReview = false) {
    if (needsReview && !skipReview) { setAskUnchecked(true); return; }
    if (refProblem) { setRefErr(refText(refProblem)); setOpen(o => new Set([...o, 'basics'])); setTimeout(() => document.getElementById('sec-basics')?.scrollIntoView({ block: 'start' }), 0); return; }
    const clean: Listing = { ...d, refNo, ref: makeRef(d.refPrefix!, refNo!), refPrefix: d.refPrefix!.toUpperCase() };
    for (const k of ALL_FORM_FIELDS) if (!vf.has(k)) delete clean[k];
    if (!forSale(clean)) { delete clean.askingPrice; delete clean.negotiable; delete clean.commissionPct; }
    if (!forRent(clean)) { delete clean.monthlyRent; delete clean.rentCommissionMonths; delete clean.securityDepositMonths; delete clean.utilityDepositMonths; }
    // One Unit/Lot Number (Change 009); the first photo is the main photo.
    delete clean.lotNo;
    clean.mainPhotoId = clean.photos[0]?.id;
    if (!clean.extraComments?.trim()) delete clean.extraComments;
    let next: Listing = {
      ...clean, ownerPhone: linked ? undefined : normalisePhone(d.ownerPhone), ownerName: linked ? undefined : d.ownerName,
      ownerWhatsapp: linked ? undefined : aliasValue(d.ownerWhatsapp),
      handledBy: d.status === 'in_progress' ? d.handledBy : undefined,
      leaseExpiryYear: d.tenure === 'leasehold' ? d.leaseExpiryYear : undefined,
      availableFrom: d.availability === 'from_date' ? d.availableFrom : undefined,
      arrangementNote: d.arrangement && d.arrangement !== 'direct' ? d.arrangementNote : undefined,
    };
    // Marks that no longer apply go with the field they described (an empty field keeps its mark: "Unknown" is meaningful).
    if (next.verification) {
      const dropped = (k: string) => (ALL_FORM_FIELDS as readonly string[]).includes(k) && !vf.has(k as FormField)
        || (['askingPrice', 'commissionPct'].includes(k) && !forSale(clean)) || (['monthlyRent', 'rentCommissionMonths'].includes(k) && !forRent(clean))
        || (k === 'leaseExpiryYear' && d.tenure !== 'leasehold') || ((k === 'ownerName' || k === 'ownerPhone') && !!linked);
      let v = next;
      for (const k of Object.keys(next.verification)) if (dropped(k)) v = withVerification(v, k, undefined);
      next = v;
    }
    // A typed owner becomes a vendor record in the Vendor List, so there is one record per person.
    if (!next.vendorId && next.ownerName) {
      const now = Date.now();
      const v = store.upsert('contacts', { id: newId(), created: now, updated: now, name: next.ownerName, phone: next.ownerPhone, whatsapp: next.ownerWhatsapp, roles: ['vendor'] });
      next = { ...next, vendorId: v.id, ownerName: undefined, ownerPhone: undefined, ownerWhatsapp: undefined };
    }
    const isNew = !initial;
    next = { ...next, history: [{ at: Date.now(), source: (prefill ? 'voice' : 'form') as 'voice' | 'form', summary: '' }, ...(next.history ?? [])].slice(0, 50) };
    store.upsert('properties', next);
    // Banner Placed → Choose Location: the point goes into the banner records that My Banner Map shows (Change 009).
    if (bannerPick && next.bannerStatus === 'yes') {
      const now = Date.now();
      store.upsert('banners', buildBanner(newId(), next, { lat: bannerPick.lat, lng: bannerPick.lng, source: 'map' }, { placedOn: ymd(new Date(now)) }, now));
    }
    draft.clear();
    for (const f of removedFiles.current) store.removeFile(f);
    if (isNew) store.setSingleton('settings', { lastPrefix: next.refPrefix });
    if (next.refPrefix && !(BUILTIN_PREFIXES as readonly string[]).includes(next.refPrefix)) store.touchOption('refPrefix', next.refPrefix);
    if (isNew) go({ name: 'listingDetail', id: next.id }); else back();
  }
  function cancel() {
    // Leaving without saving keeps the draft (and the pictures it uses) so it can be picked up again; with no draft the
    // pictures added in this visit are dropped as before.
    if (!draft.flush()) for (const f of addedFiles.current) store.discardFile(f);
    back();
  }

  return (
    <section className="stack listing" data-testid="listing-form">
      <DraftBanner lang={lang} draft={draft} />
      <p className="notice">{s.allOptional}</p>
      <div className="between form-tools">
        <small className="muted">{s.formTip}</small>
        <button type="button" className="btn small ghost" data-testid="toggle-all" onClick={() => setOpen(allOpen ? new Set() : new Set(SECTION_IDS))}>{allOpen ? s.collapseAll : s.expandAll}</button>
      </div>

      <div className="voice-hero" data-testid="voice-fill">
        <button type="button" className="btn primary big voice-hero-btn" aria-expanded={voiceOpen} aria-controls="voice-panel" data-testid="voice-fill-btn" onClick={() => setVoiceOpen(o => !o)}>
          <IconMic /> {s.voiceBig}
        </button>
        <small className="muted voice-hero-hint">{s.voiceBigHint}</small>
        {voiceOpen && (
          <div id="voice-panel" className="card stack-sm words" data-testid="voice-panel">
            <small className="muted">{s.voiceFillHint}</small>
            <SpeechBox lang={lang} value={words} onChange={setWords} label={s.voice.textLabel} />
            <button className="btn secondary" disabled={!words.trim()} onClick={fillFromWords} data-testid="voice-fill-apply">{s.voiceFillBtn}</button>
            {wordsMsg && <small role="status" className="ok-text">{wordsMsg}</small>}
          </div>
        )}
      </div>
      {dups.length > 0 && (
        <div className="notice" role="status" data-testid="duplicate-warning">
          <strong>{dupStrings[lang].title}</strong>
          {dups.slice(0, 3).map(x => <small key={x.property.id} data-testid="duplicate-row">{[x.property.ref, cardTitle(x.property)].filter(Boolean).join(' · ')} ({dupStrings[lang][x.reason]})</small>)}
          <small className="muted">{dupStrings[lang].help}</small>
        </div>
      )}
      {unchecked.length > 0 && (
        <div className="notice review-banner" role="status" data-testid="review-banner" data-checked={checked ? 'yes' : 'no'}>
          {checked ? <span>✓ {s.reviewDone}</span> : <>
            <span>{s.reviewBanner(unchecked.length)}</span>
            <button type="button" className="btn small secondary" data-testid="review-done" onClick={() => setChecked(true)}>{s.reviewDone}</button>
          </>}
        </div>
      )}

      {/* 1. Type & Purpose (with the reference) */}
      <Sec id="basics" title={`1 · ${s.sec.basics}`} testId="sec-basics-form" {...secProps('basics')}>
        <div className="ref-row">
          <OptionSelect lang={lang} label={s.l.refPrefix} listKey="refPrefix" testId="ref-prefix" allowEmpty={false} help={<FieldHelp lang={lang} topic="refPrefix" label={s.l.refPrefix} />}
            builtIns={BUILTIN_PREFIXES.map(v => ({ value: v }))} value={d.refPrefix}
            normalise={v => v.trim().toUpperCase()} validate={v => (checkPrefix(v) ? s.refProblem.invalidPrefix : null)}
            onChange={v => { if (v) { setD(p => ({ ...p, refPrefix: v.toUpperCase() })); setRefErr(null); } }} />
          <div className="ff">
            <span><label htmlFor="ref-no-input">{s.l.refNo}</label><FieldHelp lang={lang} topic="refNo" label={s.l.refNo} /></span>
            <div className="combo">
              <input id="ref-no-input" data-field="refNo" inputMode="numeric" aria-invalid={!!(refErr || refProblem)} value={refNoText}
                onChange={e => { setRefNoText(e.target.value.replace(/\D/g, '')); setRefErr(null); }} />
              <button type="button" className="combo-btn" aria-haspopup="listbox" aria-expanded={refOpen} aria-label={s.refPick.listLabel}
                data-testid="ref-no-open" onClick={() => setRefOpen(o => !o)}>▾</button>
            </div>
          </div>
        </div>
        {refOpen && (
          <div className="opt-list ref-list" role="listbox" aria-label={s.refPick.listLabel} data-testid="ref-no-list">
            <small className="ref-legend">{s.refPick.legend}</small>
            {numberChoices(state.properties, d.id).map(ch => {
              const used = ch.usedBy.length > 0;
              const chosen = ch.no === refNo;
              return (
                <button key={ch.no} type="button" role="option" aria-selected={chosen} aria-disabled={used} disabled={used}
                  className={`opt-item ref-opt ${used ? 'used' : 'free'}`} data-no={ch.no} data-used={used || undefined}
                  onClick={() => { if (used) return; setRefNoText(String(ch.no)); setRefErr(null); setRefOpen(false); }}>
                  <strong>{makeRef(d.refPrefix ?? '', ch.no)}</strong>
                  <small>{used ? s.refPick.used(ch.usedBy.join(', ')) : ch.current ? s.refPick.current : s.refPick.free}</small>
                </button>
              );
            })}
          </div>
        )}
        <small className="muted">{s.refHint}</small>
        <strong className="ref-preview" data-testid="ref-preview">{s.refPreview(makeRef(d.refPrefix ?? '', refNo ?? 0))}</strong>
        {(refErr || refProblem) && (
          <div className="stack-sm">
            <p className="error" role="alert" data-testid="ref-error">{refErr ?? refText(refProblem)}</p>
            {(refProblem === 'numberTaken' || refProblem === 'refTaken') && <button className="btn small secondary" onClick={() => { setRefNoText(String(suggestion)); setRefErr(null); }}>{s.useSuggested(suggestion)}</button>}
          </div>
        )}
        {Opt({ k: 'type', listKey: 'type', builtIns: TYPES, labels: s.types })}
        {!d.type && <small className="muted">{s.chooseTypeFirst}</small>}
        {Select({ k: 'purpose', options: PURPOSES, labels: s.purpose })}
      </Sec>

      {/* 2. Price, Tenure and Title Info (Change 009): price, commission and rent first, then tenure and title. */}
      <Sec id="tenure" title={`2 · ${s.sec.tenure}`} testId="sec-tenure-form" {...secProps('tenure')}>
        {saleMode && <>
          {Text({ k: 'askingPrice', money: true })}
          <div className="two">
            {Select({ k: 'negotiable', options: ['yes', 'no'], labels: s.negotiable })}
            {Text({ k: 'commissionPct', numeric: true })}
          </div>
          {comm !== undefined && <small className="muted" data-testid="form-commission">{s.commission(rm(comm))}</small>}
        </>}
        {rentMode && <>
          {Text({ k: 'monthlyRent', money: true })}
          {withVp('rentCommissionMonths', (
            <label className="ff" key="rentCommissionMonths">
              <span>{s.l.rentCommissionMonths}<FieldHelp lang={lang} topic="commissionPct" label={s.l.rentCommissionMonths} /></span>
              <select data-field="rentCommissionMonths" value={d.rentCommissionMonths ?? ''} onChange={e => set('rentCommissionMonths', e.target.value ? Number(e.target.value) : undefined)}>
                <option value="">{s.notSet}</option>
                {RENT_COMMISSION_MONTHS.map(m => <option key={m} value={m}>{s.n9.rentMonths(m)}</option>)}
                {d.rentCommissionMonths !== undefined && !(RENT_COMMISSION_MONTHS as readonly number[]).includes(d.rentCommissionMonths) && <option value={d.rentCommissionMonths}>{s.n9.rentMonths(d.rentCommissionMonths)}</option>}
              </select>
              <small className="muted">{s.n9.rentCommissionHint}</small>
            </label>
          ))}
          {rentComm !== undefined && <small className="muted" data-testid="form-rent-commission">{s.n9.rentCommission(rm(rentComm))}</small>}
          {pair(Text({ k: 'securityDepositMonths', numeric: true }), Text({ k: 'utilityDepositMonths', numeric: true }))}
          {depositRm ? <small className="muted" data-testid="form-deposit">{s.depositRm(rm(depositRm))}</small> : null}
        </>}
        {Select({ k: 'tenure', options: TENURES, labels: s.tenure })}
        {d.tenure === 'leasehold' && (
          <>
            {Text({ k: 'leaseExpiryYear', numeric: true })}
            {yrs !== undefined && <p className="ok-text" data-testid="form-years-left">{s.yearsLeft(yrs)}</p>}
          </>
        )}
        {Opt({ k: 'titleType', listKey: 'titleType', builtIns: TITLE_TYPES, labels: s.titleTypes })}
        {show('landUse') && Select({ k: 'landUse', options: LAND_USES, labels: s.landUse })}
        {Opt({ k: 'restriction', listKey: 'restriction', builtIns: RESTRICTIONS, labels: s.restrictions })}
      </Sec>

      {/* 3. Photos */}
      <Sec id="photos" title={`3 · ${s.sec.photos}`} {...secProps('photos')}>
        <small className="muted">{s.photosNote}</small>
        {d.photos.length > 1 && <small className="muted" data-testid="drag-hint">{s.n9.dragHint}</small>}
        {d.photos.length > 0 && (
          <div className="photo-grid" data-testid="photo-grid">
            {d.photos.map((p, i) => (
              <div key={p.id} data-photo-index={i}
                className={`pg-item ${i === 0 ? 'main' : ''} ${dragFrom === i ? 'dragging' : ''} ${dragFrom !== null && dragOver === i && dragFrom !== i ? 'drop-target' : ''}`}
                data-testid="form-photo" data-photo-id={p.id}>
                <StoredImage fileId={p.fileId} url={p.url} />
                <button type="button" className="pg-handle" aria-label={s.n9.dragLabel(i + 1)} title={s.n9.dragHint} data-testid="photo-drag" {...dragProps(i)}>⠿</button>
                {i === 0 && <span className="pg-main" data-testid="photo-main">{s.mainPhoto}</span>}
                <div className="pg-moves">
                  <button type="button" className="btn small secondary" disabled={busy || i === 0} aria-label={s.n9.moveEarlier(i + 1)} onClick={() => reorder(i, i - 1)}>◀</button>
                  <button type="button" className="btn small secondary" disabled={busy || i === d.photos.length - 1} aria-label={s.n9.moveLater(i + 1)} onClick={() => reorder(i, i + 1)}>▶</button>
                </div>
                <button className="btn small secondary danger-text" disabled={busy} onClick={() => {
                  if (p.fileId) removedFiles.current.push(p.fileId);
                  setD(prev => { const photos = prev.photos.filter(x => x.id !== p.id); return { ...prev, photos, mainPhotoId: photos[0]?.id }; });
                }}>{s.remove}</button>
              </div>
            ))}
          </div>
        )}
        {progress && (
          <div className="busy-line" role="status" aria-live="polite" data-testid="photo-progress">
            <span className="spinner" aria-hidden="true" /><span>{s.n9.photosBusy(progress.done, progress.total)}</span>
          </div>
        )}
        {photoMsg.map((m, i) => <p key={i} className={m.error ? 'error small' : 'ok-text small'} role={m.error ? 'alert' : 'status'} data-testid="photo-msg">{m.text}</p>)}
        <label className={`btn secondary ${busy ? 'disabled' : ''}`} aria-busy={busy} aria-disabled={busy}>
          {s.addPhotos}
          <input data-testid="photo-input" className="file-input" type="file" accept="image/*" multiple disabled={busy} onChange={e => { void addPhotos(e.target.files); e.currentTarget.value = ''; }} />
        </label>
      </Sec>

      {/* 4. Remaining property information */}
      <Sec id="location" title={`4 · ${s.sec.location}`} testId="sec-location" {...secProps('location')}>
        {Opt({ k: 'country', listKey: 'country', builtIns: COUNTRIES, labels: s.countries })}
        {Opt({ k: 'state', listKey: 'state', builtIns: (d.country ?? DEFAULT_COUNTRY) === 'Malaysia' ? MY_STATES : [] })}
        {Opt({ k: 'city', listKey: 'city', builtIns: (d.country ?? DEFAULT_COUNTRY) === 'Malaysia' ? citiesFor(d.state) : [] })}
        {Opt({ k: 'township', listKey: 'township', builtIns: (d.country ?? DEFAULT_COUNTRY) === 'Malaysia' ? townshipsFor(d.city) : [] })}
        {Text({ k: 'unitNo' })}
        {Text({ k: 'street' })}
        <div className="between"><button className="btn primary gmap-btn grow" onClick={() => setPicker(true)} data-testid="gmap-add">📍 {s.n9.addLocation}</button><FieldHelp lang={lang} topic="location" label={s.sec.location} /></div>
        <p className={`small ${hasPosition(d) ? 'ok-text' : 'muted'}`} data-testid="pos-text">{hasPosition(d) ? `✓ ${s.n9.locationSaved}${d.geoSource ? ` (${s.geoSource[d.geoSource]})` : ''}` : s.n9.noLocation}</p>
        <div className="two">
          <button className="btn secondary" onClick={locate} disabled={locating}>{locating ? s.locating : s.useMyLocation}</button>
          <button className="btn secondary" onClick={() => setD(prev => ({ ...prev, lat: undefined, lng: undefined, geoSource: undefined, placeId: undefined, geoAccuracy: undefined }))} disabled={!hasPosition(d)}>{s.clearPosition}</button>
        </div>
        {posErr && <p className="error" role="alert">{s.posError}</p>}
        <label className="ff">
          <span>{s.l.mapsLink}</span>
          <input data-field="mapsLink" type="url" inputMode="url" autoComplete="off" placeholder={s.n9.mapsLinkPh} value={mapsLinkText} onChange={e => setMapsLink(e.target.value)} />
          <small className="muted">{s.n9.mapsLinkHint}</small>
        </label>
        {d.mapsLink && <small className={linkPoint ? 'ok-text' : 'muted'} data-testid="maps-link-note">{linkPoint ? s.n9.linkPosition : s.n9.linkNoPosition}</small>}
        {d.mapsLink && /^https?:\/\//i.test(d.mapsLink) && <a className="btn small secondary" href={d.mapsLink} target="_blank" rel="noreferrer" data-testid="open-maps-link">🗺 {s.n9.openMapsLink}</a>}
      </Sec>
      {picker && <LocationPicker lang={lang} current={d} pointOnly title={s.n9.addLocation} onCancel={() => setPicker(false)} onApply={applyLocation} />}

      <Sec id="details" title={s.sec.details} testId="sec-details" {...secProps('details')}>
        {pair(show('landSqft') && Text({ k: 'landSqft', numeric: true }), show('builtUpSqft') && Text({ k: 'builtUpSqft', numeric: true }))}
        {pair(show('frontageFt') && Text({ k: 'frontageFt', numeric: true }), show('depthFt') && Text({ k: 'depthFt', numeric: true }))}
        {pair(show('bedrooms') && Text({ k: 'bedrooms', numeric: true }), show('bathrooms') && Text({ k: 'bathrooms', numeric: true }))}
        {pair(show('floors') && Text({ k: 'floors', numeric: true }), show('parking') && Text({ k: 'parking', numeric: true }))}
        {pair(show('lotType') && Select({ k: 'lotType', options: LOT_TYPES, labels: s.lotType }), show('furnishing') && Select({ k: 'furnishing', options: FURNISHING, labels: s.furnishing }))}
        <label className="ff">
          <span>{s.l.extraComments}</span>
          <textarea data-field="extraComments" className="big-text" rows={5} value={d.extraComments ?? ''} onChange={e => set('extraComments', e.target.value || undefined)} />
        </label>
        {show('maintenanceFee') && Text({ k: 'maintenanceFee', money: true })}
      </Sec>

      <Sec id="availability" title={s.sec.availability} {...secProps('availability')}>
        {withVp('availability', (
          <label className="ff" key="availability">
            <span>{s.l.availability}<FieldHelp lang={lang} topic="availability" label={s.l.availability} /></span>
            <select data-field="availability" value={d.availability ?? ''} onChange={e => {
              const v = (e.target.value || undefined) as Listing['availability'];
              set('availability', v);
              // Tenanted reveals the tenant's contact box straight away (Change 009).
              if (v === 'tenanted') setOpen(o => new Set([...o, 'tenancy']));
            }}>
              <option value="">{s.notSet}</option>
              {AVAILABILITY.map(o => <option key={o} value={o}>{s.availability[o]}</option>)}
            </select>
          </label>
        ))}
        {d.availability === 'from_date' && (
          <label className="ff">{s.l.availableFrom}<input data-field="availableFrom" type="month" value={d.availableFrom ?? ''} onChange={e => set('availableFrom', e.target.value || undefined)} /></label>
        )}
        {show('condition') && Select({ k: 'condition', options: CONDITIONS, labels: s.condition })}
        {Text({ k: 'features', area: true })}
      </Sec>

      {(rentMode || d.availability === 'tenanted' || d.tenancy) && (
        <Sec id="tenancy" title={s.sec.tenancy} testId="sec-tenancy" {...secProps('tenancy')}>
          <ContactBox lang={lang} idPrefix="tenant" contacts={state.contacts} fields={{ name: 'tenancy.tenant', phone: 'tenancy.tenantPhone', whatsapp: 'tenancy.tenantWhatsapp' }}
            labels={{ name: s.l.tenant, phone: s.l.tenantPhone, whatsapp: s.l.tenantWhatsapp }} value={tenant} onChange={setTenant}
            onPicked={pickTenant} onSuggest={c => setTenant({ name: c.name, phone: c.phone, whatsapp: c.whatsapp })}
            pickLabel={contactStrings[lang].pickFromPhone} suggestLabel={s.n9.fromContacts} useLabel={s.n9.suggestionUse} phonePh={s.n9.phonePh} whatsappPh={s.n9.whatsappPh} />
          <div className="two">
            <label className="ff">{s.l.tStart}<input data-field="tenancy.start" type="month" value={d.tenancy?.start ?? ''} onChange={e => setTen('start', e.target.value || undefined)} /></label>
            <label className="ff">{s.l.tEnd}<input data-field="tenancy.end" type="month" value={d.tenancy?.end ?? ''} onChange={e => setTen('end', e.target.value || undefined)} /></label>
          </div>
          <label className="ff">{s.l.tRent}<MoneyInput data-field="tenancy.rent" value={d.tenancy?.rent} onChange={n => setTen('rent', n)} /></label>
          <label className="ff">{s.l.tNotes}<textarea data-field="tenancy.notes" rows={2} value={d.tenancy?.notes ?? ''} onChange={e => setTen('notes', e.target.value || undefined)} /></label>
        </Sec>
      )}

      <Sec id="owner" title={s.sec.owner} testId="sec-owner" {...secProps('owner')}>
        <label className="ff"><span>{s.l.vendorId}<FieldHelp lang={lang} topic="vendorId" label={s.l.vendorId} /></span>
          <select data-field="vendorId" value={d.vendorId ?? ''} onChange={e => set('vendorId', e.target.value || undefined)}>
            <option value="">{s.vendorNone}</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        {linked ? <small className="muted">{s.vendorLinked}{linked.phone ? ` ${linked.phone}` : ''}{linked.whatsapp ? ` · ${linked.whatsapp}` : ''}</small> : <>
          <ContactBox lang={lang} idPrefix="owner" fields={{ name: 'ownerName', phone: 'ownerPhone', whatsapp: 'ownerWhatsapp' }} contacts={state.contacts.filter(x => x.roles.some(r => r === 'vendor' || r === 'landlord'))}
            labels={{ name: s.l.ownerName, phone: s.l.ownerPhone, whatsapp: s.l.ownerWhatsapp }}
            value={{ name: d.ownerName, phone: d.ownerPhone, whatsapp: d.ownerWhatsapp }} onChange={setOwner} onPicked={pickOwner} onSuggest={linkOwner}
            pickLabel={s.pickOwner} suggestLabel={s.n9.fromContacts} useLabel={s.n9.suggestionUse} phonePh={s.n9.phonePh} whatsappPh={s.n9.whatsappPh} />
          {(fromWords('ownerName') || fromWords('ownerPhone')) && <span className="row-gap">{fromWords('ownerName') ?? fromWords('ownerPhone')}</span>}
          {(isVerifiable('ownerName') || isVerifiable('ownerPhone')) && (d.ownerName || d.ownerPhone) && <div className="two">{d.ownerName && vsel('ownerName', s.l.ownerName)}{d.ownerPhone && vsel('ownerPhone', s.l.ownerPhone)}</div>}
          {d.ownerName && <small className="muted">{s.vendorNew}</small>}
        </>}
      </Sec>

      {(show('ceilingFt') || show('specs') || show('zoning') || show('currentUse') || show('roadAccess')) && (
        <Sec id="specs" title={show('ceilingFt') || (show('specs') && !show('roadAccess')) ? s.sec.building : s.sec.land} testId="sec-specs" {...secProps('specs')}>
          {pair(show('ceilingFt') && Text({ k: 'ceilingFt', numeric: true }), show('powerKva') && Text({ k: 'powerKva', numeric: true }))}
          {show('loadingBays') && Text({ k: 'loadingBays', numeric: true })}
          {show('zoning') && Text({ k: 'zoning' })}
          {show('approvals') && Text({ k: 'approvals' })}
          {show('currentUse') && Text({ k: 'currentUse' })}
          {show('roadAccess') && Text({ k: 'roadAccess' })}
          {show('specs') && Text({ k: 'specs', area: true })}
        </Sec>
      )}


      <Sec id="arrangement" title={s.sec.arrangement} {...secProps('arrangement')}>
        {Select({ k: 'arrangement', options: ARRANGEMENTS, labels: s.arrangement })}
        {d.arrangement && d.arrangement !== 'direct' && Text({ k: 'arrangementNote' })}
        {Select({ k: 'status', options: STATUSES, labels: s.status })}
        {d.status === 'in_progress' && (
          <label className="ff"><span>{s.l.handledBy}</span>
            <input data-field="handledBy" placeholder={s.handledByHint} value={d.handledBy ?? ''} onChange={e => set('handledBy', e.target.value || undefined)} />
          </label>
        )}
      </Sec>

      <Sec id="banner" title={s.sec.banner} testId="sec-banner-form" {...secProps('banner')}>
        {Select({ k: 'bannerStatus', options: BANNER_STATUSES, labels: s.banner })}
        {d.bannerStatus === 'yes' && (
          <div className="stack-sm" data-testid="banner-location">
            <button type="button" className="btn primary" data-testid="banner-choose-location" onClick={() => setBannerPicker(true)}>📍 {s.n9.chooseBannerLocation}</button>
            {bannerPick && <small className="ok-text" role="status" data-testid="banner-picked">✓ {s.n9.bannerLocationNew}</small>}
            {!bannerPick && activeBanners(state.banners, d.id).length > 0 && <small className="muted">{s.n9.bannerLocationSaved(activeBanners(state.banners, d.id).length)}</small>}
          </div>
        )}
      </Sec>
      {bannerPicker && <LocationPicker lang={lang} current={d} pointOnly title={s.n9.bannerPickTitle} start={bannerPick ?? (hasPosition(d) ? { lat: d.lat!, lng: d.lng! } : undefined)}
        onCancel={() => setBannerPicker(false)} onApply={r => { setBannerPick({ lat: r.lat, lng: r.lng }); setBannerPicker(false); }} />}

      <Sec id="marketing" title={s.sec.marketing} testId="sec-marketing" {...secProps('marketing')}>
        {Text({ k: 'headline' })}
        <label className="ff">{s.l.advertised}
          <select data-field="advertised" value={mk.advertised ?? ''} onChange={e => setMk({ advertised: (e.target.value || undefined) as 'yes' | 'no' | undefined })}>
            <option value="">{s.notSet}</option><option value="yes">{s.yesNo.yes}</option><option value="no">{s.yesNo.no}</option>
          </select>
        </label>
        {mk.ads.map((a, i) => (
          <div key={a.id} className="sub-card stack-sm" data-testid="ad-editor">
            {a.fake && <FakeBadge lang={lang} />}
            <OptionSelect lang={lang} label={`${s.l.platform} ${i + 1}`} listKey="platform" allowEmpty={false} builtIns={PLATFORMS.map(p => ({ value: p }))} value={a.platform} onChange={v => setAd(a.id, { platform: v ?? PLATFORMS[0] })} />
            <label className="ff">{s.l.adStatus}
              <select aria-label={`${s.l.adStatus} ${i + 1}`} value={a.status ?? ''} onChange={e => setAd(a.id, { status: (e.target.value || undefined) as Advert['status'] })}>
                <option value="">{s.notSet}</option>{AD_STATUSES.map(x => <option key={x} value={x}>{s.adStatus[x]}</option>)}
              </select>
            </label>
            <div className="two">
              <label className="ff">{s.l.adStart}<input type="date" value={a.start ?? ''} onChange={e => setAd(a.id, { start: e.target.value || undefined })} /></label>
              <label className="ff">{s.l.adEnd}<input type="date" value={a.end ?? ''} onChange={e => setAd(a.id, { end: e.target.value || undefined })} /></label>
            </div>
            <label className="ff">{s.l.adRef}<input aria-label={`${s.l.adRef} ${i + 1}`} value={a.ref ?? ''} onChange={e => setAd(a.id, { ref: e.target.value || undefined })} /></label>
            <label className="ff">{s.l.adNotes}<input value={a.notes ?? ''} onChange={e => setAd(a.id, { notes: e.target.value || undefined })} /></label>
            <button className="btn small secondary danger-text" onClick={() => setMk({ ads: mk.ads.filter(x => x.id !== a.id) })}>{s.removeAdvert}</button>
          </div>
        ))}
        <button className="btn secondary" onClick={() => setMk({ advertised: 'yes', ads: [...mk.ads, { id: newId(), platform: PLATFORMS[0], status: 'planned' }] })}>+ {s.addAdvert}</button>

        <div className="sub-card stack-sm" data-testid="custom-fields">
          <strong>{s.customTitle}</strong>
          {fieldDefs.length === 0 && <small className="muted">{s.customNone}</small>}
          {fieldDefs.map(fd => (
            <label key={fd} className="ff">{fd}
              <input data-field={`custom.${fd}`} value={mk.custom[fd] ?? ''} onChange={e => setMk({ custom: { ...mk.custom, [fd]: e.target.value } })} />
            </label>
          ))}
          {newField !== null && (
            <div className="stack-sm">
              <label className="ff">{s.fieldName}<input autoFocus value={newField} onChange={e => setNewField(e.target.value)} /></label>
              <div className="two">
                <button className="btn secondary" onClick={() => setNewField(null)}>{s.cancel}</button>
                <button className="btn primary" disabled={!newField.trim()} onClick={() => { if (fieldDefs.length < MAX_CUSTOM_FIELDS) store.addOption('marketingFields', newField.trim()); setNewField(null); }}>{s.createField}</button>
              </div>
            </div>
          )}
          {fieldDefs.length >= MAX_CUSTOM_FIELDS
            ? <small className="warn-text" data-testid="custom-full">{s.customFull}</small>
            : newField === null && <button className="btn ghost" onClick={() => setNewField('')}>+ {s.addField}</button>}
          {fieldDefs.length > 0 && <small className="muted">{s.customMax(fieldDefs.length)}</small>}
        </div>
      </Sec>

      <Sec id="notes" title={s.sec.notes} {...secProps('notes')}>
        {Text({ k: 'notes', area: true })}
      </Sec>

      {/* 5. Documents at the end */}
      <Sec id="docs" title={`5 · ${s.sec.docs}`} testId="sec-docs" {...secProps('docs')}>
        <small className="muted">{s.docsNote}</small>
        {DOC_CATEGORIES.map(cat => {
          const list = (d.documents ?? []).filter(x => x.category === cat);
          return (
            <div key={cat} className="sub-card stack-sm" data-testid={`doc-${cat}`}>
              <div className="between"><strong>{s.docCat[cat]}</strong><span className="count">{list.length}</span></div>
              {CONFIDENTIAL_DOCS.includes(cat) && <small className="sens">{s.confidential}</small>}
              {list.map(x => (
                <div key={x.id} className="doc-row"><span>{x.name}</span>
                  <button className="btn small secondary danger-text" onClick={() => { if (x.fileId) removedFiles.current.push(x.fileId); setD(prev => ({ ...prev, documents: (prev.documents ?? []).filter(y => y.id !== x.id) })); }}>{s.remove}</button>
                </div>
              ))}
              <label className="btn small secondary">
                + {s.addFiles}
                <input data-testid={`doc-input-${cat}`} className="file-input" type="file" multiple
                  accept={cat === 'floorplan' || cat === 'correspondence' ? 'image/*,application/pdf' : 'image/*,application/pdf,.doc,.docx'}
                  onChange={e => { void addDocs(cat, e.target.files); e.currentTarget.value = ''; }} />
              </label>
            </div>
          );
        })}
      </Sec>

      {initial && <button className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}>{s.deleteProperty}</button>}

      {/* Save from anywhere: this bar floats at the bottom of the screen while the long form scrolls under it. */}
      <div className="save-bar floating" data-testid="save-floating">
        <div className="two">
          <button className="btn secondary" onClick={cancel}>{s.cancel}</button>
          <button className="btn primary" disabled={busy} onClick={() => save()} data-testid="save-property">{s.save}</button>
        </div>
      </div>

      {confirmDelete && initial && (
        <Confirm lang={lang} title={`${s.deleteProperty}?`} body={s.deleteBody} okLabel={c.delete} onCancel={() => setConfirmDelete(false)}
          onOk={() => { deleteListing(store, state, initial); go({ name: 'listing' }); }} />
      )}
      {askUnchecked && <Confirm lang={lang} title={s.reviewQ} body={s.reviewBody(unchecked.length)} danger={false} okLabel={s.reviewSave}
        onCancel={() => { setAskUnchecked(false); setOpen(o => new Set([...o, ...SECTION_IDS.filter(x => (SECTION_KEYS[x] ?? []).some(k => unchecked.includes(k)))])); }}
        onOk={() => { setAskUnchecked(false); save(true); }} />}
      {tenantPick && <Confirm lang={lang} title={contactStrings[lang].replaceQ} danger={false} okLabel={contactStrings[lang].replaceOk}
        body={contactStrings[lang].replaceBody([tenant.name, tenant.phone].filter(Boolean).join(' · '), [tenantPick.name, tenantPick.tel].filter(Boolean).join(' · '))}
        onCancel={() => setTenantPick(null)} onOk={() => { applyTenant(tenantPick); setTenantPick(null); }} />}
      {ownerPick && <Confirm lang={lang} title={contactStrings[lang].replaceQ} danger={false} okLabel={contactStrings[lang].replaceOk}
        body={contactStrings[lang].replaceBody([d.ownerName, d.ownerPhone].filter(Boolean).join(' · '), [ownerPick.name, ownerPick.tel].filter(Boolean).join(' · '))}
        onCancel={() => setOwnerPick(null)} onOk={() => { applyOwner(ownerPick); setOwnerPick(null); }} />}
    </section>
  );
}

