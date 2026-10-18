// Add / edit property form. Sections in the agreed order: 1 Type & Purpose (the headline is the advert title and sits in Marketing), 2 Tenure & Title, 3 Location (Change 014), 4 Photos,
// then the remaining property information, 5 Documents at the end. Every section can be opened and closed (closed at
// first, owner 13 Oct 2026); a floating Save works from anywhere. Opening it with a section (from the Edit button of
// a detail card) opens and scrolls to that section. Every input has data-field so voice can fill it for review.
// ClaudeChanges001 (owner, 17 Oct 2026): section 1 is "Basic Info and Availability" (ID, Availability, Property Type, Sale
// or Rent, Arrangement); Status is merged into Availability and the Availability and Condition / Listing Arrangement and
// Status sections are gone (Condition moved to Property Details, Special Features deleted). Choosing Booked, Sold or
// Rented offers the deal page. Location options belong to the level above. Photos are one per row and open full screen.
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
  Listing, TYPES, TENURES, LOT_TYPES, TITLE_TYPES, PURPOSES, CONDITIONS,
  FURNISHING, LAND_USES, RESTRICTIONS, DOC_CATEGORIES, CONFIDENTIAL_DOCS, PLATFORMS, AD_STATUSES, MAX_CUSTOM_FIELDS, BANNER_STATUSES,
  rm, yearsRemaining, commissionRm, rentCommissionRm, normalisePhone, Photo, Doc, DocCategory, Advert, fieldsFor, FormField, forRent, forSale,
  ALL_FORM_FIELDS, hasPosition, cardTitle, forEditing, movePhoto, RENT_COMMISSION_MONTHS, SALE_COMMISSION_TYPES, RENT_COMMISSION_TYPES,
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
import { MoneyInput } from '../ui/MoneyInput';
import { BUILTIN_PREFIXES, checkRef, defaultPrefix, makeRef, nextNumber, checkPrefix, numberChoices } from '../domain/refs';
import { COUNTRIES, DEFAULT_COUNTRY, MY_STATES, citiesFor, townshipsFor } from '../domain/places';
import { LocationPicker, LocationResult } from '../maps/LocationPicker';
import { c15Strings } from '../ui/c015Strings';
import { makeMainPhoto, removePhoto } from './change015';
import { ContactBox, ContactValue, aliasValue } from '../ui/ContactBox';
import type { PickedContact } from '../lib/phonebook';
import type { Contact } from '../data/types';
import { buildBanner, activeBanners } from '../domain/banners';
import { ymd } from '../lib/dates';
import { contactStrings } from '../contacts/strings';
import { VERIFY_STATES, VerifyState, isVerifiable, shownState, withVerification } from './verify';
import { can, isForeign, myId } from '../team/access';
import { teamStrings } from '../team/strings';
import { FakeBadge } from '../adverts/AdTrackerUI';
import { ChoiceDialog } from '../ui/common';
import { cc001Strings } from '../ui/cc001Strings';
import { AVAIL_CHOICES, AvailChoice, availChoice, availPatch, isBookedChoice, ARRANGEMENT_CHOICES, LocationLevel, locationListKey, clearBelow } from './cc001';
import { PhotoViewer } from '../ui/PhotoViewer';
import { ContactPick } from '../ui/ContactPick';
import type { Screen, DealKind } from '../nav';
import { saveTypedContact } from '../deals/contacts';

/** Sections of the form, in order, and the details each one holds (for the "n filled" line on a closed section). */
const SECTION_IDS = ['basics', 'tenure', 'location', 'photos', 'details', 'tenancy', 'owner', 'specs', 'banner', 'marketing', 'notes', 'docs'];
const SECTION_KEYS: Record<string, string[]> = {
  basics: ['availability', 'type', 'purpose', 'arrangement'],
  tenure: ['askingPrice', 'negotiable', 'commissionPct', 'commissionFlat', 'monthlyRent', 'rentCommissionMonths', 'rentCommissionFlat', 'securityDepositMonths', 'utilityDepositMonths',
    'tenure', 'leaseExpiryYear', 'titleType', 'landUse', 'restriction'],
  location: ['country', 'state', 'city', 'township', 'neighborhood', 'street', 'unitNo', 'lat'],
  details: ['landSqft', 'builtUpSqft', 'frontageFt', 'depthFt', 'bedrooms', 'bathrooms', 'floors', 'parking', 'lotType', 'furnishing', 'condition', 'extraComments', 'maintenanceFee'],
  specs: ['ceilingFt', 'powerKva', 'loadingBays', 'zoning', 'approvals', 'currentUse', 'roadAccess', 'specs'],
  owner: ['vendorId', 'ownerName', 'ownerPhone', 'ownerWhatsapp'],
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
  const startSection = section === 'money' ? 'tenure' : section === 'availability' || section === 'arrangement' ? 'basics' : section;
  // Change 010: reference numbers belong to each agent's own workspace; records shared by the other agent never count.
  const ownProps = useMemo(() => state.properties.filter(p => !isForeign(state, 'properties', p.id)), [state]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [d, setD] = useState<Listing>(() => {
    // JoyChange002 Change 50: a voice command can open an existing property with the details that were said, marked "from
    // your words" for checking; nothing is saved until Save.
    if (initial) { const e = forEditing(initial); return prefill ? { ...e, ...prefill, id: e.id, filledFrom: { ...(e.filledFrom ?? {}), ...(prefill.filledFrom ?? {}) } } : e; }
    const prefix = defaultPrefix(state.options.refPrefix, state.settings.lastPrefix);
    const no = nextNumber(ownProps);
    return { id: newId(), created: Date.now(), updated: Date.now(), photos: [], country: state.settings.country || DEFAULT_COUNTRY, refPrefix: prefix, refNo: no, ...prefill };
  });
  const dups = useMemo(() => possibleDuplicates(d, state.properties), [d.street, d.unitNo, d.lotNo, d.township, d.city, d.id, state.properties]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [refNoText, setRefNoText] = useState(String(d.refNo ?? ''));
  const refNoInit = useRef(refNoText);
  const [busy, setBusy] = useState(false);
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
  const [bannerPicker, setBannerPicker] = useState(false);
  const [bannerPick, setBannerPick] = useState<{ lat: number; lng: number } | null>(null);
  const [tenantPick, setTenantPick] = useState<PickedContact | null>(null);
  // A months value that is not 1, 1.5 or 2 is shown in the "Custom…" box.
  const [monthsCustom, setMonthsCustom] = useState(d.rentCommissionMonths !== undefined && !(RENT_COMMISSION_MONTHS as readonly number[]).includes(d.rentCommissionMonths));
  const allOpen = SECTION_IDS.every(x => open.has(x));
  const toggle = (sid: string) => setOpen(o => { const n = new Set(o); if (n.has(sid)) n.delete(sid); else n.add(sid); return n; });
  const addedFiles = useRef<string[]>([]);
  const removedFiles = useRef<string[]>([]);
  const c15 = c15Strings[lang];
  const x1 = cc001Strings[lang];
  /** Change 7: the photo open full screen (index), and the photo waiting for "Delete this photo?". */
  const [viewer, setViewer] = useState<number | null>(null);
  const [askPhotoDelete, setAskPhotoDelete] = useState<string | null>(null);
  /** Change 11: Booked / Sold / Rented was just chosen; ask whether to fill in the details now. */
  const [dealAsk, setDealAsk] = useState<AvailChoice | null>(null);
  const afterSave = useRef<Screen | null>(null);
  /** "Sold by me / by others", answered in the Sold question; written with the save. */
  const soldByRef = useRef<'me' | 'others' | undefined>(undefined);
  /** Change 015: the photo whose small menu is open (one at a time); any tap elsewhere closes it. */
  const [photoMenu, setPhotoMenu] = useState<string | null>(null);
  useEffect(() => {
    if (!photoMenu) return;
    const close = () => setPhotoMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [photoMenu]);
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
    const target = list?.querySelector<HTMLElement>('[aria-selected="true"]') ?? list?.querySelector<HTMLElement>(`[data-no="${nextNumber(ownProps, d.id)}"]`);
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
        {/* Change 014: no separate "Check status" text; the dropdown shows the status itself, as tall and wide as the field above. */}
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
      <span className="between"><span>{s.l[k as string]}</span>{fromWords(k)}</span>
      {money ? <MoneyInput data-field={k as string} value={d[k] as number | undefined} onChange={n => set(k, n as never)} /> : area
        ? <textarea data-field={k} rows={3} value={(d[k] as string) ?? ''} onChange={e => set(k, (e.target.value || undefined) as never)} />
        : <input data-field={k} inputMode={numeric ? 'decimal' : undefined} placeholder={hint}
            value={numeric ? (shownNum(k as string, d[k]) as string) : ((d[k] as string | undefined) ?? '')}
            onChange={e => { if (numeric) setRaw(r => ({ ...r, [k]: e.target.value })); set(k, (numeric ? num(e.target.value) : e.target.value || undefined) as never); }} />}
    </label>
  ));
  const Select = ({ k, options, labels }: { k: keyof Listing; options: readonly string[]; labels?: Record<string, string> }) => withVp(k as string, (
    <label className="ff" key={k}>
      <span className="between"><span>{s.l[k as string]}</span>{fromWords(k)}</span>
      <select data-field={k} value={(d[k] as string) ?? ''} onChange={e => set(k, (e.target.value || undefined) as never)}>
        <option value="">{s.notSet}</option>
        {options.map(o => <option key={o} value={o}>{labels ? labels[o] : o}</option>)}
      </select>
    </label>
  ));
  const Opt = ({ k, listKey, builtIns, labels, onPick }: { k: keyof Listing; listKey: string; builtIns: readonly string[]; labels?: Record<string, string>; onPick?: (v: string | undefined) => void }) => withVp(k as string, (
    <OptionSelect key={k} lang={lang} label={s.l[k as string]} listKey={listKey} testId={`opt-${String(k)}`}
      builtIns={builtIns.map(v => ({ value: v, label: labels?.[v] ?? v }))} value={d[k] as string | undefined} savedValue={initial?.[k] as string | undefined}
      onChange={v => (onPick ? onPick(v) : set(k, v as never))} />
  ));
  /** Change 5: one level of the location chain. Its remembered options are the ones saved under the level above; choosing
   *  a different value clears every level below it. */
  const Loc = (k: LocationLevel, builtIns: readonly string[], labels?: Record<string, string>) => Opt({
    k, listKey: locationListKey(d, k), builtIns, labels,
    onPick: v => setD(prev => {
      if ((prev[k] ?? undefined) === (v ?? undefined)) return prev;
      return { ...prev, ...clearBelow(k), [k]: v, filledFrom: { ...(prev.filledFrom ?? {}), [k]: 'typed' } };
    }),
  });
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

  /** Add Location (Change 009): only the chosen map point is saved. The typed address is never read back or changed. */
  function applyLocation(r: LocationResult) {
    setD(prev => ({ ...prev, lat: r.lat, lng: r.lng, placeId: undefined, geoSource: 'google', geoAccuracy: undefined }));
    setPicker(false);
  }
  /** Google Maps Link: kept as typed. If the link itself holds the point, the map position is taken from it as well. */

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
  const refProblem = checkRef(ownProps, d.id, d.refPrefix ?? '', refNo);
  const suggestion = nextNumber(ownProps, d.id);
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
    // Change 010: checked again at the moment of saving (sharing can change while the form is open).
    if (initial && !can(store.getState(), 'edit', 'properties', initial.id)) { setRefErr(teamStrings[lang].notAllowed); return; }
    if (needsReview && !skipReview) { setAskUnchecked(true); return; }
    if (refProblem) { setRefErr(refText(refProblem)); setOpen(o => new Set([...o, 'basics'])); setTimeout(() => document.getElementById('sec-basics')?.scrollIntoView({ block: 'start' }), 0); return; }
    const clean: Listing = { ...d, refNo, ref: makeRef(d.refPrefix!, refNo!), refPrefix: d.refPrefix!.toUpperCase() };
    for (const k of ALL_FORM_FIELDS) if (!vf.has(k)) delete clean[k];
    if (!forSale(clean)) { delete clean.askingPrice; delete clean.negotiable; delete clean.commissionPct; delete clean.commissionFlat; delete clean.commissionType; }
    if (!forRent(clean)) { delete clean.monthlyRent; delete clean.rentCommissionMonths; delete clean.rentCommissionFlat; delete clean.rentCommissionType; delete clean.securityDepositMonths; delete clean.utilityDepositMonths; }
    // Only the commission of the chosen kind is kept, so an old figure of the other kind can never be used by mistake.
    if (clean.commissionType === 'flat') delete clean.commissionPct; else { delete clean.commissionFlat; delete clean.commissionType; }
    if (clean.rentCommissionType === 'flat') delete clean.rentCommissionMonths; else { delete clean.rentCommissionFlat; delete clean.rentCommissionType; }
    // One Unit/Lot Number (Change 009); the first photo is the main photo.
    delete clean.lotNo;
    clean.mainPhotoId = clean.photos[0]?.id;
    // A neighborhood typed before it became a dropdown is remembered too, so it is offered next time.
    if (clean.neighborhood?.trim() && !(state.options[locationListKey(clean, 'neighborhood')] ?? []).some(o => o.value === clean.neighborhood)) store.addOption(locationListKey(clean, 'neighborhood'), clean.neighborhood.trim());
    if (!clean.extraComments?.trim()) delete clean.extraComments;
    // ClaudeChanges001: Special Features and Handled By are gone from the form (changes 8 and 10), so they go from the record.
    delete clean.features; delete clean.handledBy;
    if (soldByRef.current) { clean.deal = { ...(clean.deal ?? {}), soldBy: soldByRef.current }; soldByRef.current = undefined; }
    if (clean.arrangement !== 'cobroke') delete clean.cobroke;
    // The neighbourhood typed before it became a dropdown: see above. A street typed here is remembered under its parents (change 5).
    if (clean.street?.trim() && !(state.options[locationListKey(clean, 'street')] ?? []).some(o => o.value === clean.street)) store.addOption(locationListKey(clean, 'street'), clean.street.trim());
    let next: Listing = {
      ...clean, ownerPhone: linked ? undefined : normalisePhone(d.ownerPhone), ownerName: linked ? undefined : d.ownerName,
      ownerWhatsapp: linked ? undefined : aliasValue(d.ownerWhatsapp),
      leaseExpiryYear: d.tenure === 'leasehold' ? d.leaseExpiryYear : undefined,
      availableFrom: d.availability === 'from_date' ? d.availableFrom : undefined,
      arrangementNote: d.arrangement && d.arrangement !== 'direct' && d.arrangement !== 'cobroke' ? d.arrangementNote : undefined,
    };
    // Changes 3 and 8: Commission (RM) and Availability have no check status; a mark saved before is removed with the save.
    if (next.verification && ('commissionFlat' in next.verification || 'availability' in next.verification)) {
      const v = { ...next.verification }; delete v.commissionFlat; delete v.availability;
      next = { ...next, verification: Object.keys(v).length ? v : undefined };
    }
    // Change 35: an old "Unknown" mark is saved as "Need to check" (Unknown is no longer a choice).
    if (next.verification && Object.values(next.verification).includes('unknown')) {
      next = { ...next, verification: Object.fromEntries(Object.entries(next.verification).map(([k, v]) => [k, v === 'unknown' ? 'check' : v])) };
    }
    // Change 9: a tenant or co-broke agent typed or picked here is saved as a contact (once per phone number) for next time.
    const own = !(initial && isForeign(store.getState(), 'properties', initial.id));
    if (own && next.tenancy?.tenant) saveTypedContact(store, { name: next.tenancy.tenant, phone: next.tenancy.tenantPhone, whatsapp: next.tenancy.tenantWhatsapp }, 'tenant');
    if (own && next.cobroke?.name) {
      const cid = saveTypedContact(store, { name: next.cobroke.name, phone: next.cobroke.phone, whatsapp: next.cobroke.whatsapp }, 'other', next.cobroke.agency);
      next = { ...next, cobroke: { ...next.cobroke, contactId: cid } };
    }
    // Marks that no longer apply go with the field they described (an empty field keeps its mark).
    if (next.verification) {
      const dropped = (k: string) => (ALL_FORM_FIELDS as readonly string[]).includes(k) && !vf.has(k as FormField)
        || (['askingPrice', 'commissionPct', 'commissionFlat'].includes(k) && !forSale(clean)) || (['monthlyRent', 'rentCommissionMonths', 'rentCommissionFlat'].includes(k) && !forRent(clean))
        || (k === 'commissionPct' && clean.commissionPct === undefined) || (k === 'commissionFlat' && clean.commissionFlat === undefined)
        || (k === 'rentCommissionMonths' && clean.rentCommissionMonths === undefined) || (k === 'rentCommissionFlat' && clean.rentCommissionFlat === undefined)
        || (k === 'leaseExpiryYear' && d.tenure !== 'leasehold') || ((k === 'ownerName' || k === 'ownerPhone') && !!linked);
      let v = next;
      for (const k of Object.keys(next.verification)) if (dropped(k)) v = withVerification(v, k, undefined);
      next = v;
    }
    // A typed owner becomes a vendor record in the Vendor List, so there is one record per person.
    if (!next.vendorId && next.ownerName && !(initial && isForeign(store.getState(), 'properties', initial.id))) {
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
    const then = afterSave.current;
    afterSave.current = null;
    if (then) go(then);
    else if (isNew) go({ name: 'listingDetail', id: next.id }); else back();
  }
  /** Change 11: save the property, then open its Booking / Sale / Rental page. */
  function saveAndOpen(kind: DealKind, soldBy?: 'me' | 'others') {
    setDealAsk(null);
    soldByRef.current = soldBy;
    afterSave.current = { name: 'deal', propertyId: d.id, kind };
    save();
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

      {/* Owner, 17 Oct 2026: no "Fill with voice" button on the form (voice commands elsewhere are unchanged). */}
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

      {/* 1. Basic Info and Availability (ClaudeChanges001): ID, Availability, Property Type, Sale or Rent, Arrangement. */}
      <Sec id="basics" title={`1 · ${s.sec.basics}`} testId="sec-basics-form" {...secProps('basics')}>
        <div className="ref-row">
          <OptionSelect lang={lang} label={s.l.refPrefix} listKey="refPrefix" testId="ref-prefix" allowEmpty={false}
            builtIns={BUILTIN_PREFIXES.map(v => ({ value: v }))} value={d.refPrefix}
            normalise={v => v.trim().toUpperCase()} validate={v => (checkPrefix(v) ? s.refProblem.invalidPrefix : null)}
            onChange={v => { if (v) { setD(p => ({ ...p, refPrefix: v.toUpperCase() })); setRefErr(null); } }} />
          <div className="ff">
            <span><label htmlFor="ref-no-input">{s.l.refNo}</label></span>
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
            {numberChoices(ownProps, d.id).map(ch => {
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
        {/* Change 8 / 10: Availability, with Status merged into it, no check status. */}
        <label className="ff">
          <span>{x1.avail.label}</span>
          <select data-field="availability" value={availChoice(d) ?? ''} onChange={e => {
            const v = (e.target.value || undefined) as AvailChoice | undefined;
            setD(prev => ({ ...prev, ...availPatch(v, prev.availableFrom), filledFrom: { ...(prev.filledFrom ?? {}), availability: 'typed', status: 'typed' } }));
            if (v === 'rented') setOpen(o => new Set([...o, 'tenancy']));
            // Change 40: any of the five Booked stages asks "Fill in booking details now?" (as plain Booked did).
            if (isBookedChoice(v)) setDealAsk('booked'); else if (v === 'sold' || v === 'rented') setDealAsk(v);
          }}>
            <option value="">{s.notSet}</option>
            {/* Change 40: an older plain Booked still shows, but cannot be chosen again. */}
            {availChoice(d) === 'booked' && <option value="booked" disabled>{x1.avail.booked}</option>}
            {AVAIL_CHOICES.map(o => <option key={o} value={o}>{x1.avail[o]}</option>)}
          </select>
        </label>
        {availChoice(d) === 'available_from' && (
          <label className="ff">{x1.avail.fromMonth}<input data-field="availableFrom" type="month" value={d.availableFrom ?? ''} onChange={e => set('availableFrom', e.target.value || undefined)} /></label>
        )}
        {Opt({ k: 'type', listKey: 'type', builtIns: TYPES, labels: s.types })}
        {!d.type && <small className="muted">{s.chooseTypeFirst}</small>}
        {Select({ k: 'purpose', options: PURPOSES, labels: s.purpose })}
        {/* Change 10: Co-broke or Direct; for Co-broke the other agent's name, agency and contact. */}
        <label className="ff">
          <span>{s.l.arrangement}</span>
          <select data-field="arrangement" value={d.arrangement === 'cobroke' || d.arrangement === 'direct' ? d.arrangement : ''}
            onChange={e => set('arrangement', (e.target.value || undefined) as Listing['arrangement'])}>
            <option value="">{s.notSet}</option>
            {ARRANGEMENT_CHOICES.map(o => <option key={o} value={o}>{x1.arrangement[o]}</option>)}
          </select>
        </label>
        {d.arrangement === 'cobroke' && (
          <div className="sub-card stack-sm" data-testid="cobroke-details">
            <ContactBox lang={lang} idPrefix="cobroke" contacts={state.contacts} fields={{ name: 'cobroke.name', phone: 'cobroke.phone', whatsapp: 'cobroke.whatsapp' }}
              labels={{ name: x1.cobroke.agent, phone: x1.cobroke.phone, whatsapp: x1.cobroke.whatsapp }}
              value={{ name: d.cobroke?.name, phone: d.cobroke?.phone, whatsapp: d.cobroke?.whatsapp }}
              onChange={patch => setD(prev => ({ ...prev, cobroke: { ...(prev.cobroke ?? {}), ...patch } }))}
              onPicked={p => setD(prev => ({ ...prev, cobroke: { ...(prev.cobroke ?? {}), name: p.name || prev.cobroke?.name, phone: normalisePhone(p.tel) ?? prev.cobroke?.phone } }))}
              onSuggest={c => setD(prev => ({ ...prev, cobroke: { name: c.name, phone: c.phone, whatsapp: c.whatsapp, agency: c.company ?? prev.cobroke?.agency, contactId: c.id } }))}
              pickLabel={x1.pickPhone} suggestLabel={s.n9.fromContacts} useLabel={s.n9.suggestionUse} phonePh={s.n9.phonePh} whatsappPh={s.n9.whatsappPh} />
            <label className="ff">{x1.cobroke.agency}
              <input data-field="cobroke.agency" value={d.cobroke?.agency ?? ''} onChange={e => setD(prev => ({ ...prev, cobroke: { ...(prev.cobroke ?? {}), agency: e.target.value || undefined } }))} />
            </label>
          </div>
        )}
      </Sec>

      {/* 2. Price, Tenure and Title Info (Change 009): price, commission and rent first, then tenure and title. */}
      <Sec id="tenure" title={`2 · ${s.sec.tenure}`} testId="sec-tenure-form" {...secProps('tenure')}>
        {saleMode && <>
          {Text({ k: 'askingPrice', money: true })}
          {Select({ k: 'negotiable', options: ['yes', 'no'], labels: s.negotiable })}
          {/* Sale commission (owner, 15 Oct): a percentage of the price, or a flat fee in RM. */}
          <div className="two">
            <label className="ff">{s.l.commissionType}
              <select data-field="commissionType" value={d.commissionType ?? 'pct'} onChange={e => set('commissionType', e.target.value as Listing['commissionType'])}>
                {SALE_COMMISSION_TYPES.map(x => <option key={x} value={x}>{x === 'pct' ? s.n9.typePct : s.n9.typeFlat}</option>)}
              </select>
            </label>
            {(d.commissionType ?? 'pct') === 'pct' ? Text({ k: 'commissionPct', numeric: true }) : Text({ k: 'commissionFlat', money: true })}
          </div>
          {comm !== undefined && <small className="muted" data-testid="form-commission">{s.commission(rm(comm))}</small>}
        </>}
        {rentMode && <>
          {Text({ k: 'monthlyRent', money: true })}
          {/* Rental commission (owner, 15 Oct): months of rent (1, 1.5, 2 or any number typed), or a flat fee in RM. Never a %. */}
          <label className="ff">{s.l.rentCommissionType}
            <select data-field="rentCommissionType" value={d.rentCommissionType ?? 'months'} onChange={e => set('rentCommissionType', e.target.value as Listing['rentCommissionType'])}>
              {RENT_COMMISSION_TYPES.map(x => <option key={x} value={x}>{x === 'months' ? s.n9.typeMonths : s.n9.typeFlat}</option>)}
            </select>
          </label>
          {(d.rentCommissionType ?? 'months') === 'months' ? withVp('rentCommissionMonths', (
            <div className="ff" key="rentCommissionMonths">
              <label htmlFor="rent-months">{s.l.rentCommissionMonths}</label>
              <select id="rent-months" data-field="rentCommissionMonths" value={monthsCustom ? 'custom' : d.rentCommissionMonths ?? ''}
                onChange={e => {
                  if (e.target.value === 'custom') { setMonthsCustom(true); return; }
                  setMonthsCustom(false); set('rentCommissionMonths', e.target.value ? Number(e.target.value) : undefined);
                }}>
                <option value="">{s.notSet}</option>
                {RENT_COMMISSION_MONTHS.map(m => <option key={m} value={m}>{s.n9.rentMonths(m)}</option>)}
                <option value="custom">{s.n9.customMonths}</option>
              </select>
              {monthsCustom && (
                <input data-field="rentCommissionMonthsCustom" inputMode="decimal" aria-label={s.n9.monthsInput} placeholder={s.n9.monthsInput}
                  value={raw.rentMonths ?? (d.rentCommissionMonths ?? '')}
                  onChange={e => { setRaw(r => ({ ...r, rentMonths: e.target.value })); const n = num(e.target.value); set('rentCommissionMonths', n !== undefined && n > 0 && n <= 24 ? n : undefined); }} />
              )}
              <small className="muted">{s.n9.rentCommissionHint}</small>
            </div>
          )) : Text({ k: 'rentCommissionFlat', money: true })}
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
        {show('landUse') && Opt({ k: 'landUse', listKey: 'landUse', builtIns: LAND_USES, labels: s.landUse })}
        {Opt({ k: 'restriction', listKey: 'restriction', builtIns: RESTRICTIONS, labels: s.restrictions })}
      </Sec>

      {/* 3. Location (Change 014: straight after section 2; street first, then the unit/lot number) */}
      <Sec id="location" title={`3 · ${s.sec.location}`} testId="sec-location" {...secProps('location')}>
        {/* ClaudeChanges001 change 5: Country → State → City → Township → Neighborhood → Street. Each level offers the values
            saved under the level above it (a blank level is skipped); choosing a different value clears the levels below. */}
        {Loc('country', COUNTRIES, s.countries)}
        {Loc('state', (d.country ?? DEFAULT_COUNTRY) === 'Malaysia' ? MY_STATES : [])}
        {Loc('city', (d.country ?? DEFAULT_COUNTRY) === 'Malaysia' ? citiesFor(d.state) : [])}
        {Loc('township', (d.country ?? DEFAULT_COUNTRY) === 'Malaysia' ? townshipsFor(d.city) : [])}
        {Loc('neighborhood', [])}
        {Loc('street', [])}
        {Text({ k: 'unitNo' })}
        <div className="between"><button className="btn primary gmap-btn grow" onClick={() => setPicker(true)} data-testid="gmap-add">📍 {s.n9.addLocation}</button></div>
        <p className={`small ${hasPosition(d) ? 'ok-text' : 'muted'}`} data-testid="pos-text">{hasPosition(d) ? `✓ ${s.n9.locationSaved}${d.geoSource ? ` (${s.geoSource[d.geoSource]})` : ''}` : s.n9.noLocation}</p>
        {/* Change 015: no "Use my current location" here; Remove Position works as before. */}
        <button className="btn secondary" data-testid="remove-position" onClick={() => setD(prev => ({ ...prev, lat: undefined, lng: undefined, geoSource: undefined, placeId: undefined, geoAccuracy: undefined }))} disabled={!hasPosition(d)}>{s.clearPosition}</button>
        {/* Owner, 17 Oct 2026: no Google Maps link field; a link saved before stays on the record, unchanged. */}
      </Sec>
      {picker && <LocationPicker lang={lang} current={d} pointOnly title={s.n9.addLocation} onCancel={() => setPicker(false)} onApply={applyLocation} />}

      {/* 4. Photos */}
      <Sec id="photos" title={`4 · ${s.sec.photos}`} {...secProps('photos')}>
        <small className="muted">{s.photosNote}</small>
        {d.photos.length > 1 && <small className="muted" data-testid="drag-hint">{s.n9.dragHint}</small>}
        {d.photos.length > 0 && (
          <div className="photo-grid photo-list" data-testid="photo-grid">
            {d.photos.map((p, i) => (
              <div key={p.id} data-photo-index={i}
                className={`pg-item ${i === 0 ? 'main' : ''} ${dragFrom === i ? 'dragging' : ''} ${dragFrom !== null && dragOver === i && dragFrom !== i ? 'drop-target' : ''}`}
                data-testid="form-photo" data-photo-id={p.id}>
                {/* Change 7: one photo per row; a tap on the picture opens it full screen (pinch to zoom, swipe between photos). */}
                <button type="button" className="pg-open" aria-label={x1.photo.open(i + 1)} data-testid="photo-open" onClick={() => setViewer(i)}>
                  <StoredImage fileId={p.fileId} url={p.url} />
                </button>
                <button type="button" className="pg-handle" aria-label={s.n9.dragLabel(i + 1)} title={s.n9.dragHint} data-testid="photo-drag" {...dragProps(i)}>⠿</button>
                {i === 0 && <span className="pg-main" data-testid="photo-main">{s.mainPhoto}</span>}
                {/* Change 015: one small menu per photo, with exactly Make as Main Photo and Remove (no arrows, no Remove button). */}
                <div className="pg-menu-wrap">
                  <button type="button" className="pg-menu-btn" aria-haspopup="menu" aria-expanded={photoMenu === p.id} disabled={busy}
                    aria-label={c15.photo.menu(i + 1)} data-testid="photo-menu" onClick={e => { e.stopPropagation(); setPhotoMenu(m => (m === p.id ? null : p.id)); }}>⋮</button>
                  {photoMenu === p.id && (
                    <div className="pg-menu" role="menu" data-testid="photo-menu-list" onClick={e => e.stopPropagation()}>
                      <button type="button" role="menuitem" data-testid="photo-make-main" disabled={i === 0} onClick={() => {
                        setPhotoMenu(null);
                        setD(prev => ({ ...prev, ...makeMainPhoto(prev.photos, p.id) }));
                      }}>{x1.photo.setMain}</button>
                      {/* Change 7: Delete, in red, asks first. */}
                      <button type="button" role="menuitem" className="danger-text" data-testid="photo-remove" onClick={() => { setPhotoMenu(null); setAskPhotoDelete(p.id); }}>{x1.photo.delete}</button>
                    </div>
                  )}
                </div>
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


      <Sec id="details" title={s.formSec.details} testId="sec-details" {...secProps('details')}>
        {pair(show('landSqft') && Text({ k: 'landSqft', numeric: true }), show('builtUpSqft') && Text({ k: 'builtUpSqft', numeric: true }))}
        {pair(show('frontageFt') && Text({ k: 'frontageFt', numeric: true }), show('depthFt') && Text({ k: 'depthFt', numeric: true }))}
        {/* Change 014: Lot Type directly under Frontage and Depth, each with its own check status. */}
        {show('lotType') && Opt({ k: 'lotType', listKey: 'lotType', builtIns: LOT_TYPES, labels: s.lotType })}
        {pair(show('bedrooms') && Text({ k: 'bedrooms', numeric: true }), show('bathrooms') && Text({ k: 'bathrooms', numeric: true }))}
        {pair(show('floors') && Text({ k: 'floors', numeric: true }), show('parking') && Text({ k: 'parking', numeric: true }))}
        {show('furnishing') && Opt({ k: 'furnishing', listKey: 'furnishing', builtIns: FURNISHING, labels: s.furnishing })}
        {/* ClaudeChanges001: Condition moved here when the Availability and Condition section was removed. */}
        {show('condition') && Opt({ k: 'condition', listKey: 'condition', builtIns: CONDITIONS, labels: s.condition })}
        <label className="ff">
          <span>{s.l.extraComments}</span>
          <textarea data-field="extraComments" className="big-text" rows={5} value={d.extraComments ?? ''} onChange={e => set('extraComments', e.target.value || undefined)} />
        </label>
        {show('maintenanceFee') && Text({ k: 'maintenanceFee', money: true })}
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
        {/* Change 9: the saved contacts in one searchable list (name or number). */}
        <ContactPick lang={lang} label={s.l.vendorId} contacts={vendors}
          value={d.vendorId} noneLabel={x1.vendorNone} onChange={v => set('vendorId', v)} testId="vendor-pick" field="vendorId" />
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
        <Sec id="specs" title={show('ceilingFt') || (show('specs') && !show('roadAccess')) ? s.sec.building : s.formSec.land} testId="sec-specs" {...secProps('specs')}>
          {pair(show('ceilingFt') && Text({ k: 'ceilingFt', numeric: true }), show('powerKva') && Text({ k: 'powerKva', numeric: true }))}
          {show('loadingBays') && Text({ k: 'loadingBays', numeric: true })}
          {show('zoning') && Text({ k: 'zoning' })}
          {show('approvals') && Text({ k: 'approvals' })}
          {show('currentUse') && Text({ k: 'currentUse' })}
          {show('roadAccess') && Text({ k: 'roadAccess' })}
          {show('specs') && Text({ k: 'specs', area: true })}
        </Sec>
      )}


      <Sec id="banner" title={s.formSec.banner} testId="sec-banner-form" {...secProps('banner')}>
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

      {initial && can(state, 'archive', 'properties', initial.id) && <button className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}>{s.deleteProperty}</button>}

      {/* Save from anywhere: this bar floats at the bottom of the screen while the long form scrolls under it. */}
      <div className="save-bar floating" data-testid="save-floating">
        <div className="two">
          <button className="btn secondary" onClick={cancel}>{s.cancel}</button>
          <button className="btn primary" disabled={busy} onClick={() => save()} data-testid="save-property">{s.save}</button>
        </div>
      </div>

      {confirmDelete && initial && (
        <Confirm lang={lang} title={teamStrings[lang].archiveQ} body={teamStrings[lang].archiveBody} okLabel={c.delete} onCancel={() => setConfirmDelete(false)}
          onOk={() => {
            // Change 010: deleting archives the property (recoverable from the Archived section); only its owner may.
            const cur = store.getState().properties.find(x => x.id === initial.id);
            if (cur && can(store.getState(), 'archive', 'properties', cur.id)) { draft.clear(); store.upsert('properties', { ...cur, archived: { at: Date.now(), by: myId(store.getState()) } }); }
            go({ name: 'listing' });
          }} />
      )}
      {askUnchecked && <Confirm lang={lang} title={s.reviewQ} body={s.reviewBody(unchecked.length)} danger={false} okLabel={s.reviewSave}
        onCancel={() => { setAskUnchecked(false); afterSave.current = null; soldByRef.current = undefined; setOpen(o => new Set([...o, ...SECTION_IDS.filter(x => (SECTION_KEYS[x] ?? []).some(k => unchecked.includes(k)))])); }}
        onOk={() => { setAskUnchecked(false); save(true); }} />}
      {tenantPick && <Confirm lang={lang} title={contactStrings[lang].replaceQ} danger={false} okLabel={contactStrings[lang].replaceOk}
        body={contactStrings[lang].replaceBody([tenant.name, tenant.phone].filter(Boolean).join(' · '), [tenantPick.name, tenantPick.tel].filter(Boolean).join(' · '))}
        onCancel={() => setTenantPick(null)} onOk={() => { applyTenant(tenantPick); setTenantPick(null); }} />}
      {dealAsk === 'sold' && (
        <ChoiceDialog lang={lang} title={x1.deal.soldQ} body={x1.deal.soldBody} testId="deal-ask" cancelLabel={x1.deal.later} onCancel={() => setDealAsk(null)}
          choices={[
            { label: x1.deal.byMe, primary: true, testId: 'deal-by-me', onPick: () => saveAndOpen('sale', 'me') },
            { label: x1.deal.byOthers, testId: 'deal-by-others', onPick: () => saveAndOpen('others', 'others') },
          ]} />
      )}
      {(dealAsk === 'booked' || dealAsk === 'rented') && (
        <ChoiceDialog lang={lang} title={dealAsk === 'booked' ? x1.deal.bookedQ : x1.deal.rentedQ} body={dealAsk === 'booked' ? x1.deal.bookedBody : x1.deal.rentedBody}
          testId="deal-ask" cancelLabel={x1.deal.later} onCancel={() => setDealAsk(null)}
          choices={[{ label: x1.deal.fillNow, primary: true, testId: 'deal-fill-now', onPick: () => saveAndOpen(dealAsk === 'booked' ? 'booking' : 'rental') }]} />
      )}
      {askPhotoDelete && (
        <Confirm lang={lang} title={x1.photo.deleteQ} body={x1.photo.deleteBody} okLabel={x1.photo.delete} onCancel={() => setAskPhotoDelete(null)}
          onOk={() => {
            const pid = askPhotoDelete; setAskPhotoDelete(null);
            const p = d.photos.find(x => x.id === pid);
            // Same as before: the file is only removed from the phone when the property is saved.
            if (p?.fileId) removedFiles.current.push(p.fileId);
            setD(prev => { const r = removePhoto(prev.photos, pid); return { ...prev, photos: r.photos, mainPhotoId: r.mainPhotoId }; });
          }} />
      )}
      {viewer !== null && d.photos.length > 0 && <PhotoViewer lang={lang} photos={d.photos} start={viewer} onClose={() => setViewer(null)} />}
      {ownerPick && <Confirm lang={lang} title={contactStrings[lang].replaceQ} danger={false} okLabel={contactStrings[lang].replaceOk}
        body={contactStrings[lang].replaceBody([d.ownerName, d.ownerPhone].filter(Boolean).join(' · '), [ownerPick.name, ownerPick.tel].filter(Boolean).join(' · '))}
        onCancel={() => setOwnerPick(null)} onOk={() => { applyOwner(ownerPick); setOwnerPick(null); }} />}
    </section>
  );
}

