// Add / edit property form. Sections in the agreed order: 1 Type & Headline, 2 Tenure & Title, 3 Photos,
// 4 the remaining property information, 5 Documents at the end. Opening it with a section (from the Edit button of
// a detail card) scrolls straight to that section. Every input has data-field so voice can fill it for review.
import { useEffect, useRef, useState } from 'react';
import { Lang, strings } from '../i18n';
import { listingStrings } from './strings';
import { mapStrings } from '../maps/strings';
import {
  Listing, TYPES, TENURES, LOT_TYPES, STATUSES, TITLE_TYPES, PURPOSES, ARRANGEMENTS, AVAILABILITY, CONDITIONS,
  FURNISHING, LAND_USES, RESTRICTIONS, DOC_CATEGORIES, CONFIDENTIAL_DOCS, PLATFORMS, AD_STATUSES, MAX_CUSTOM_FIELDS, BANNER_STATUSES,
  rm, yearsRemaining, commissionRm, normalisePhone, Photo, Doc, DocCategory, Advert, fieldsFor, FormField, forRent, forSale,
  ALL_FORM_FIELDS, hasPosition,
} from './model';
import { compressImage } from '../lib/images';
import { useApp } from '../data/useStore';
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

const num = (v: string) => { const x = parseFloat(v.replace(/[^\d.]/g, '')); return Number.isFinite(x) ? x : undefined; };

export function ListingForm({ lang, id, prefill, section, go, back }: {
  lang: Lang; id?: string; prefill?: Partial<Listing>; section?: FormSection; go: Go; back: () => void;
}) {
  const { state, store } = useApp();
  const s = listingStrings[lang];
  const c = strings[lang].c;
  const initial = id ? state.properties.find(x => x.id === id) : undefined;
  const [d, setD] = useState<Listing>(() => {
    if (initial) return { ...initial, photos: [...initial.photos] };
    const prefix = defaultPrefix(state.options.refPrefix, state.settings.lastPrefix);
    const no = nextNumber(state.properties);
    return { id: newId(), created: Date.now(), updated: Date.now(), photos: [], country: DEFAULT_COUNTRY, refPrefix: prefix, refNo: no, ...prefill };
  });
  const [refNoText, setRefNoText] = useState(String(d.refNo ?? ''));
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [posErr, setPosErr] = useState(false);
  const [words, setWords] = useState('');
  const [wordsMsg, setWordsMsg] = useState('');
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [newField, setNewField] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [refErr, setRefErr] = useState<string | null>(null);
  const [refOpen, setRefOpen] = useState(false);
  const addedFiles = useRef<string[]>([]);
  const removedFiles = useRef<string[]>([]);
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
    if (!section) return;
    const el = document.getElementById(`sec-${section}`);
    if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
  }, [section]);

  const set = <K extends keyof Listing>(k: K, v: Listing[K] | undefined) =>
    setD(prev => ({ ...prev, [k]: v, filledFrom: { ...(prev.filledFrom ?? {}), [k]: 'typed' } }));
  const fromWords = (k: keyof Listing) => d.filledFrom?.[k] === 'words' ? <span className="chip stated small-chip">{s.fromWords}</span> : null;

  // Called as functions (not components) so inputs keep focus while typing.
  const Text = ({ k, numeric, area, hint, money }: { k: keyof Listing; numeric?: boolean; area?: boolean; hint?: string; money?: boolean }) => (
    <label className="ff" key={k}>
      <span className="between"><span>{s.l[k as string]}</span>{fromWords(k)}</span>
      {money ? <MoneyInput data-field={k as string} value={d[k] as number | undefined} onChange={n => set(k, n as never)} /> : area
        ? <textarea data-field={k} rows={3} value={(d[k] as string) ?? ''} onChange={e => set(k, (e.target.value || undefined) as never)} />
        : <input data-field={k} inputMode={numeric ? 'decimal' : undefined} placeholder={hint}
            value={numeric ? (shownNum(k as string, d[k]) as string) : ((d[k] as string | undefined) ?? '')}
            onChange={e => { if (numeric) setRaw(r => ({ ...r, [k]: e.target.value })); set(k, (numeric ? num(e.target.value) : e.target.value || undefined) as never); }} />}
    </label>
  );
  const Select = ({ k, options, labels }: { k: keyof Listing; options: readonly string[]; labels?: Record<string, string> }) => (
    <label className="ff" key={k}>
      <span className="between"><span>{s.l[k as string]}</span>{fromWords(k)}</span>
      <select data-field={k} value={(d[k] as string) ?? ''} onChange={e => set(k, (e.target.value || undefined) as never)}>
        <option value="">{s.notSet}</option>
        {options.map(o => <option key={o} value={o}>{labels ? labels[o] : o}</option>)}
      </select>
    </label>
  );
  const Opt = ({ k, listKey, builtIns, labels }: { k: keyof Listing; listKey: string; builtIns: readonly string[]; labels?: Record<string, string> }) => (
    <OptionSelect key={k} lang={lang} label={s.l[k as string]} listKey={listKey} testId={`opt-${String(k)}`}
      builtIns={builtIns.map(v => ({ value: v, label: labels?.[v] ?? v }))} value={d[k] as string | undefined}
      onChange={v => set(k, v as never)} />
  );
  const pair = (...els: (JSX.Element | null | false)[]) => {
    const xs = els.filter(Boolean) as JSX.Element[];
    if (!xs.length) return null;
    return xs.length === 1 ? xs[0] : <div className="two">{xs}</div>;
  };

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const added: Photo[] = [];
    for (const f of [...files]) {
      if (!f.type.startsWith('image/')) continue;
      let blob: Blob = f;
      try { blob = (await compressImage(f)).blob; } catch { /* keep the original */ }
      const fileId = await store.putFile(blob);
      addedFiles.current.push(fileId);
      added.push({ id: newId(), name: f.name, fileId, bytes: blob.size });
    }
    setD(prev => ({ ...prev, photos: [...prev.photos, ...added], mainPhotoId: prev.mainPhotoId ?? added[0]?.id }));
    setBusy(false);
  }
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
  function manualPos(which: 'lat' | 'lng', text: string) {
    const next = { ...raw, [`pos_${which}`]: text };
    setRaw(next);
    const lat = parseFloat(next.pos_lat ?? String(d.lat ?? ''));
    const lng = parseFloat(next.pos_lng ?? String(d.lng ?? ''));
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) setD(prev => ({ ...prev, lat, lng, geoSource: 'manual', geoAccuracy: undefined, placeId: undefined }));
  }
  function applyLocation(r: LocationResult) {
    setD(prev => ({ ...prev, ...r.fields, lat: r.lat, lng: r.lng, placeId: r.placeId, geoSource: 'google', geoAccuracy: undefined }));
    setRaw(x => { const y = { ...x }; delete y.pos_lat; delete y.pos_lng; return y; });
    setPicker(false);
  }

  /** Voice fill: only empty fields, each marked "from your words". */
  function fillFromWords() {
    if (!words.trim()) return;
    const places = [...(state.options.township ?? []), ...(state.options.city ?? [])].map(o => o.value);
    const { changes } = readDetails(words.trim(), places);
    const filled: ChangeKey[] = [];
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
    setTimeout(() => setWordsMsg(s.wordsDone(filled.length)), 0);
  }

  const setTen = (k: keyof NonNullable<Listing['tenancy']>, v: string | number | undefined) => setD(prev => {
    const t = { ...(prev.tenancy ?? {}), [k]: v };
    if (v === undefined || v === '') delete (t as Record<string, unknown>)[k];
    return { ...prev, tenancy: Object.keys(t).length ? t : undefined };
  });
  const mk = d.marketing ?? { ads: [], custom: {} };
  const setMk = (patch: Partial<NonNullable<Listing['marketing']>>) => setD(prev => ({ ...prev, marketing: { ads: [], custom: {}, ...(prev.marketing ?? {}), ...patch } }));
  const setAd = (adId: string, patch: Partial<Advert>) => setMk({ ads: mk.ads.map(a => (a.id === adId ? { ...a, ...patch } : a)) });

  const yrs = yearsRemaining(d);
  const comm = commissionRm(d);
  const rentMode = forRent(d);
  const saleMode = forSale(d);
  const depositRm = d.monthlyRent !== undefined ? d.monthlyRent * ((d.securityDepositMonths ?? 0) + (d.utilityDepositMonths ?? 0)) : undefined;
  const vendors = state.contacts.filter(x => x.roles.some(r => r === 'vendor' || r === 'landlord') || x.id === d.vendorId);
  const linked = state.contacts.find(v => v.id === d.vendorId);
  const refNo = num(refNoText);
  const refProblem = checkRef(state.properties, d.id, d.refPrefix ?? '', refNo);
  const suggestion = nextNumber(state.properties, d.id);
  const refText = (p: ReturnType<typeof checkRef>) => (p === 'numberTaken' || p === 'refTaken' ? s.refProblem[p](suggestion) : p ? s.refProblem[p] : null);

  function save() {
    if (refProblem) { setRefErr(refText(refProblem)); document.getElementById('sec-basics')?.scrollIntoView({ block: 'start' }); return; }
    const clean: Listing = { ...d, refNo, ref: makeRef(d.refPrefix!, refNo!), refPrefix: d.refPrefix!.toUpperCase() };
    for (const k of ALL_FORM_FIELDS) if (!vf.has(k)) delete clean[k];
    if (!forSale(clean)) { delete clean.askingPrice; delete clean.negotiable; delete clean.commissionPct; }
    if (!forRent(clean)) { delete clean.monthlyRent; delete clean.securityDepositMonths; delete clean.utilityDepositMonths; }
    let next: Listing = {
      ...clean, ownerPhone: linked ? undefined : normalisePhone(d.ownerPhone), ownerName: linked ? undefined : d.ownerName,
      handledBy: d.status === 'in_progress' ? d.handledBy : undefined,
      leaseExpiryYear: d.tenure === 'leasehold' ? d.leaseExpiryYear : undefined,
      availableFrom: d.availability === 'from_date' ? d.availableFrom : undefined,
      arrangementNote: d.arrangement && d.arrangement !== 'direct' ? d.arrangementNote : undefined,
    };
    // A typed owner becomes a vendor record in the Vendor List, so there is one record per person.
    if (!next.vendorId && next.ownerName) {
      const now = Date.now();
      const v = store.upsert('contacts', { id: newId(), created: now, updated: now, name: next.ownerName, phone: next.ownerPhone, roles: ['vendor'] });
      next = { ...next, vendorId: v.id, ownerName: undefined, ownerPhone: undefined };
    }
    const isNew = !initial;
    next = { ...next, history: [{ at: Date.now(), source: (prefill ? 'voice' : 'form') as 'voice' | 'form', summary: '' }, ...(next.history ?? [])].slice(0, 50) };
    store.upsert('properties', next);
    for (const f of removedFiles.current) store.removeFile(f);
    if (isNew) store.setSingleton('settings', { lastPrefix: next.refPrefix });
    if (next.refPrefix && !(BUILTIN_PREFIXES as readonly string[]).includes(next.refPrefix)) store.touchOption('refPrefix', next.refPrefix);
    if (isNew) go({ name: 'listingDetail', id: next.id }); else back();
  }
  function cancel() {
    for (const f of addedFiles.current) store.removeFile(f);
    back();
  }

  return (
    <section className="stack listing" data-testid="listing-form">
      <p className="notice">{s.allOptional}</p>

      <details className="card stack-sm words" data-testid="voice-fill">
        <summary className="card-title">🎙 {s.voiceFill}</summary>
        <small className="muted">{s.voiceFillHint}</small>
        <SpeechBox lang={lang} value={words} onChange={setWords} label={s.voice.textLabel} />
        <button className="btn secondary" disabled={!words.trim()} onClick={fillFromWords}>{s.voiceFillBtn}</button>
        {wordsMsg && <small role="status" className="ok-text">{wordsMsg}</small>}
      </details>

      {/* 1. Type & Headline (with the reference) */}
      <div className="card stack-sm" id="sec-basics" data-testid="sec-basics-form">
        <div className="card-title">1 · {s.sec.basics}</div>
        <div className="ref-row">
          <OptionSelect lang={lang} label={s.l.refPrefix} listKey="refPrefix" testId="ref-prefix" allowEmpty={false}
            builtIns={BUILTIN_PREFIXES.map(v => ({ value: v }))} value={d.refPrefix}
            normalise={v => v.trim().toUpperCase()} validate={v => (checkPrefix(v) ? s.refProblem.invalidPrefix : null)}
            onChange={v => { if (v) { setD(p => ({ ...p, refPrefix: v.toUpperCase() })); setRefErr(null); } }} />
          <div className="ff">
            <label htmlFor="ref-no-input">{s.l.refNo}</label>
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
        {Text({ k: 'headline' })}
        {Select({ k: 'purpose', options: PURPOSES, labels: s.purpose })}
      </div>

      {/* 2. Tenure & Title */}
      <div className="card stack-sm" id="sec-tenure">
        <div className="card-title">2 · {s.sec.tenure}</div>
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
      </div>

      {/* 3. Photos */}
      <div className="card stack-sm" id="sec-photos">
        <div className="card-title">3 · {s.sec.photos}</div>
        <small className="muted">{s.photosNote}</small>
        {d.photos.length > 0 && (
          <div className="photo-grid">
            {d.photos.map(p => (
              <div key={p.id} className={`pg-item ${p.id === (d.mainPhotoId ?? d.photos[0]?.id) ? 'main' : ''}`} data-testid="form-photo">
                <StoredImage fileId={p.fileId} url={p.url} />
                {p.id === (d.mainPhotoId ?? d.photos[0]?.id)
                  ? <span className="pg-main">{s.mainPhoto}</span>
                  : <button className="btn small secondary" onClick={() => setD(prev => ({ ...prev, mainPhotoId: p.id }))}>{s.makeMain}</button>}
                <button className="btn small secondary danger-text" onClick={() => {
                  if (p.fileId) removedFiles.current.push(p.fileId);
                  setD(prev => {
                    const photos = prev.photos.filter(x => x.id !== p.id);
                    return { ...prev, photos, mainPhotoId: prev.mainPhotoId === p.id ? photos[0]?.id : prev.mainPhotoId };
                  });
                }}>{s.remove}</button>
              </div>
            ))}
          </div>
        )}
        <label className="btn secondary" aria-busy={busy}>
          {s.addPhotos}
          <input data-testid="photo-input" className="file-input" type="file" accept="image/*" multiple onChange={e => { void addPhotos(e.target.files); e.currentTarget.value = ''; }} />
        </label>
      </div>

      {/* 4. Remaining property information */}
      <div className="card stack-sm" id="sec-location" data-testid="sec-location">
        <div className="card-title">4 · {s.sec.location}</div>
        {Opt({ k: 'country', listKey: 'country', builtIns: COUNTRIES, labels: s.countries })}
        {Opt({ k: 'state', listKey: 'state', builtIns: (d.country ?? DEFAULT_COUNTRY) === 'Malaysia' ? MY_STATES : [] })}
        {Opt({ k: 'city', listKey: 'city', builtIns: (d.country ?? DEFAULT_COUNTRY) === 'Malaysia' ? citiesFor(d.state) : [] })}
        {Opt({ k: 'township', listKey: 'township', builtIns: (d.country ?? DEFAULT_COUNTRY) === 'Malaysia' ? townshipsFor(d.city) : [] })}
        {Text({ k: 'lotNo' })}
        {Text({ k: 'street' })}
        {Text({ k: 'unitNo' })}
        <button className="btn primary gmap-btn" onClick={() => setPicker(true)} data-testid="gmap-add">📍 {mapStrings[lang].addFromMap}</button>
        <p className="small muted" data-testid="pos-text">{hasPosition(d) ? `${s.l.lat}: ${s.position(d.lat!.toFixed(5), d.lng!.toFixed(5))}${d.geoSource ? ` (${s.geoSource[d.geoSource]})` : ''}` : s.noPosition}</p>
        <div className="two">
          <button className="btn secondary" onClick={locate} disabled={locating}>{locating ? s.locating : s.useMyLocation}</button>
          <button className="btn secondary" onClick={() => setD(prev => ({ ...prev, lat: undefined, lng: undefined, geoSource: undefined, placeId: undefined, geoAccuracy: undefined }))} disabled={!hasPosition(d)}>{s.clearPosition}</button>
        </div>
        <div className="two">
          <label className="ff">{s.lat}<input inputMode="decimal" data-field="lat" value={shownNum('pos_lat', d.lat) as string} onChange={e => manualPos('lat', e.target.value)} /></label>
          <label className="ff">{s.lng}<input inputMode="decimal" data-field="lng" value={shownNum('pos_lng', d.lng) as string} onChange={e => manualPos('lng', e.target.value)} /></label>
        </div>
        {posErr && <p className="error" role="alert">{s.posError}</p>}
      </div>
      {picker && <LocationPicker lang={lang} current={d} onCancel={() => setPicker(false)} onApply={applyLocation} />}

      <div className="card stack-sm" id="sec-details" data-testid="sec-details">
        <div className="card-title">{s.sec.details}</div>
        {pair(show('landSqft') && Text({ k: 'landSqft', numeric: true }), show('builtUpSqft') && Text({ k: 'builtUpSqft', numeric: true }))}
        {pair(show('frontageFt') && Text({ k: 'frontageFt', numeric: true }), show('depthFt') && Text({ k: 'depthFt', numeric: true }))}
        {pair(show('bedrooms') && Text({ k: 'bedrooms', numeric: true }), show('bathrooms') && Text({ k: 'bathrooms', numeric: true }))}
        {pair(show('floors') && Text({ k: 'floors', numeric: true }), show('parking') && Text({ k: 'parking', numeric: true }))}
        {pair(show('lotType') && Select({ k: 'lotType', options: LOT_TYPES, labels: s.lotType }), show('furnishing') && Select({ k: 'furnishing', options: FURNISHING, labels: s.furnishing }))}
      </div>

      {(show('ceilingFt') || show('specs') || show('zoning') || show('currentUse') || show('roadAccess')) && (
        <div className="card stack-sm" id="sec-specs" data-testid="sec-specs">
          <div className="card-title">{show('ceilingFt') || (show('specs') && !show('roadAccess')) ? s.sec.building : s.sec.land}</div>
          {pair(show('ceilingFt') && Text({ k: 'ceilingFt', numeric: true }), show('powerKva') && Text({ k: 'powerKva', numeric: true }))}
          {show('loadingBays') && Text({ k: 'loadingBays', numeric: true })}
          {show('zoning') && Text({ k: 'zoning' })}
          {show('approvals') && Text({ k: 'approvals' })}
          {show('currentUse') && Text({ k: 'currentUse' })}
          {show('roadAccess') && Text({ k: 'roadAccess' })}
          {show('specs') && Text({ k: 'specs', area: true })}
        </div>
      )}

      <div className="card stack-sm" id="sec-money" data-testid="sec-money">
        <div className="card-title">{s.sec.money}</div>
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
          {pair(Text({ k: 'securityDepositMonths', numeric: true }), Text({ k: 'utilityDepositMonths', numeric: true }))}
          {depositRm ? <small className="muted" data-testid="form-deposit">{s.depositRm(rm(depositRm))}</small> : null}
        </>}
        {show('maintenanceFee') && Text({ k: 'maintenanceFee', money: true })}
      </div>

      {(rentMode || d.availability === 'tenanted' || d.tenancy) && (
        <div className="card stack-sm" id="sec-tenancy" data-testid="sec-tenancy">
          <div className="card-title">{s.sec.tenancy}</div>
          <label className="ff">{s.l.tenant}<input data-field="tenancy.tenant" value={d.tenancy?.tenant ?? ''} onChange={e => setTen('tenant', e.target.value || undefined)} /></label>
          <div className="two">
            <label className="ff">{s.l.tStart}<input data-field="tenancy.start" type="month" value={d.tenancy?.start ?? ''} onChange={e => setTen('start', e.target.value || undefined)} /></label>
            <label className="ff">{s.l.tEnd}<input data-field="tenancy.end" type="month" value={d.tenancy?.end ?? ''} onChange={e => setTen('end', e.target.value || undefined)} /></label>
          </div>
          <label className="ff">{s.l.tRent}<MoneyInput data-field="tenancy.rent" value={d.tenancy?.rent} onChange={n => setTen('rent', n)} /></label>
          <label className="ff">{s.l.tNotes}<textarea data-field="tenancy.notes" rows={2} value={d.tenancy?.notes ?? ''} onChange={e => setTen('notes', e.target.value || undefined)} /></label>
        </div>
      )}

      <div className="card stack-sm" id="sec-availability">
        <div className="card-title">{s.sec.availability}</div>
        {Select({ k: 'availability', options: AVAILABILITY, labels: s.availability })}
        {d.availability === 'from_date' && (
          <label className="ff">{s.l.availableFrom}<input data-field="availableFrom" type="month" value={d.availableFrom ?? ''} onChange={e => set('availableFrom', e.target.value || undefined)} /></label>
        )}
        {show('condition') && Select({ k: 'condition', options: CONDITIONS, labels: s.condition })}
        {Text({ k: 'features', area: true })}
      </div>

      <div className="card stack-sm" id="sec-owner" data-testid="sec-owner">
        <div className="card-title">{s.sec.owner}</div>
        <label className="ff">{s.l.vendorId}
          <select data-field="vendorId" value={d.vendorId ?? ''} onChange={e => set('vendorId', e.target.value || undefined)}>
            <option value="">{s.vendorNone}</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        {linked ? <small className="muted">{s.vendorLinked}{linked.phone ? ` ${linked.phone}` : ''}</small> : <>
          {Text({ k: 'ownerName' })}
          <label className="ff"><span className="between"><span>{s.l.ownerPhone}</span>{fromWords('ownerPhone')}</span>
            <input data-field="ownerPhone" type="tel" inputMode="tel" value={d.ownerPhone ?? ''} onChange={e => set('ownerPhone', e.target.value || undefined)}
              onBlur={() => set('ownerPhone', normalisePhone(d.ownerPhone))} />
          </label>
          {d.ownerName && <small className="muted">{s.vendorNew}</small>}
        </>}
      </div>

      <div className="card stack-sm" id="sec-arrangement">
        <div className="card-title">{s.sec.arrangement}</div>
        {Select({ k: 'arrangement', options: ARRANGEMENTS, labels: s.arrangement })}
        {d.arrangement && d.arrangement !== 'direct' && Text({ k: 'arrangementNote' })}
        {Select({ k: 'status', options: STATUSES, labels: s.status })}
        {d.status === 'in_progress' && (
          <label className="ff"><span>{s.l.handledBy}</span>
            <input data-field="handledBy" placeholder={s.handledByHint} value={d.handledBy ?? ''} onChange={e => set('handledBy', e.target.value || undefined)} />
          </label>
        )}
      </div>

      <div className="card stack-sm" id="sec-banner" data-testid="sec-banner-form">
        <div className="card-title">{s.sec.banner}</div>
        {Select({ k: 'bannerStatus', options: BANNER_STATUSES, labels: s.banner })}
      </div>

      <div className="card stack-sm" id="sec-marketing" data-testid="sec-marketing">
        <div className="card-title">{s.sec.marketing}</div>
        <label className="ff">{s.l.advertised}
          <select data-field="advertised" value={mk.advertised ?? ''} onChange={e => setMk({ advertised: (e.target.value || undefined) as 'yes' | 'no' | undefined })}>
            <option value="">{s.notSet}</option><option value="yes">{s.yesNo.yes}</option><option value="no">{s.yesNo.no}</option>
          </select>
        </label>
        {mk.ads.map((a, i) => (
          <div key={a.id} className="sub-card stack-sm" data-testid="ad-editor">
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
      </div>

      <div className="card stack-sm" id="sec-notes">
        <div className="card-title">{s.sec.notes}</div>
        {Text({ k: 'notes', area: true })}
      </div>

      {/* 5. Documents at the end */}
      <div className="card stack-sm" id="sec-docs" data-testid="sec-docs">
        <div className="card-title">5 · {s.sec.docs}</div>
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
      </div>

      {initial && <button className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}>{s.deleteProperty}</button>}

      <div className="save-bar">
        <div className="two">
          <button className="btn secondary" onClick={cancel}>{s.cancel}</button>
          <button className="btn primary" disabled={busy} onClick={save} data-testid="save-property">{s.save}</button>
        </div>
      </div>

      {confirmDelete && initial && (
        <Confirm lang={lang} title={`${s.deleteProperty}?`} body={s.deleteBody} okLabel={c.delete} onCancel={() => setConfirmDelete(false)}
          onOk={() => {
            for (const p of initial.photos) if (p.fileId) store.removeFile(p.fileId);
            for (const x of initial.documents ?? []) if (x.fileId) store.removeFile(x.fileId);
            for (const b of state.banners.filter(x => x.propertyId === initial.id)) { if (b.photoFileId) store.removeFile(b.photoFileId); store.remove('banners', b.id); }
            store.remove('properties', initial.id);
            go({ name: 'listing' });
          }} />
      )}
    </section>
  );
}

