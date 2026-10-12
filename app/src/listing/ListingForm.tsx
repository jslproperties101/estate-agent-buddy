// Add / edit property form (Version 1L). Every field is optional; fields shown depend on the property type.
// Every input has data-field so voice, Smart Capture or a later AI step can fill it, always for review first.
import { useRef, useState } from 'react';
import { Lang } from '../i18n';
import { listingStrings } from './strings';
import {
  Listing, TYPES, TYPE_CATEGORY, CATEGORIES, TENURES, LOT_TYPES, STATUSES, TITLE_TYPES, PURPOSES, ARRANGEMENTS, AVAILABILITY, CONDITIONS,
  FURNISHING, LAND_USES, RESTRICTIONS, DOC_CATEGORIES, CONFIDENTIAL_DOCS, PLATFORMS, AD_STATUSES, MAX_CUSTOM_FIELDS,
  rm, yearsRemaining, commissionRm, normalisePhone, fillEmptyFrom, WordValues, Photo, Doc, DocCategory, Advert, Viewing,
  MarketingFieldDef, fieldsFor, FormField, forRent, forSale,
} from './model';
import { Vendor } from '../contacts/model';
import { compressImage } from '../local/images';
import { readNote } from '../local/pipeline';
import { extract } from '../local/rules';
import { merge } from '../local/merge';

const newId = () => (globalThis.crypto && 'randomUUID' in globalThis.crypto ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2));
const num = (v: string) => { const x = parseFloat(v.replace(/[^\d.]/g, '')); return Number.isFinite(x) ? x : undefined; };

export function ListingForm({ lang, initial, prefill, vendors, fieldDefs, nextRef, onAddFieldDef, onSave, onCancel, onCapture }: {
  lang: Lang; initial?: Listing; prefill?: Partial<Listing>; vendors: Vendor[]; fieldDefs: MarketingFieldDef[]; nextRef: string;
  onAddFieldDef: (label: string) => void; onSave: (l: Listing) => void; onCancel: () => void; onCapture: () => void;
}) {
  const s = listingStrings[lang];
  const [d, setD] = useState<Listing>(() => initial
    ? { ...initial, photos: [...initial.photos] }
    : { id: newId(), created: Date.now(), updated: Date.now(), photos: [], ref: nextRef, ...prefill });
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [pinErr, setPinErr] = useState(false);
  const [words, setWords] = useState('');
  const [wordsMsg, setWordsMsg] = useState('');
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [newField, setNewField] = useState<string | null>(null);
  const shownNum = (k: string, v: unknown) => (raw[k] !== undefined && num(raw[k]) === v ? raw[k] : v ?? '');
  const fileRef = useRef<HTMLInputElement>(null);
  const vf = fieldsFor(d.type);
  const show = (k: FormField) => vf.has(k);

  const set = <K extends keyof Listing>(k: K, v: Listing[K] | undefined) =>
    setD(prev => ({ ...prev, [k]: v, filledFrom: { ...(prev.filledFrom ?? {}), [k]: 'typed' } }));
  const fromWords = (k: keyof Listing) => d.filledFrom?.[k] === 'words' ? <span className="chip stated small-chip">{s.fromWords}</span> : null;

  // Called as functions (not components) so inputs keep focus while typing.
  const Text = ({ k, numeric, area, hint }: { k: keyof Listing; numeric?: boolean; area?: boolean; hint?: string }) => (
    <label className="ff" key={k}>
      <span className="between"><span>{s.l[k as string]}</span>{fromWords(k)}</span>
      {area
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
  /** Two fields side by side, skipping any that do not apply to this property type. */
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
      try { blob = (await compressImage(f)).blob; } catch { /* keep original */ }
      added.push({ id: newId(), name: f.name, url: URL.createObjectURL(blob), bytes: blob.size });
    }
    setD(prev => ({ ...prev, photos: [...prev.photos, ...added], mainPhotoId: prev.mainPhotoId ?? added[0]?.id }));
    setBusy(false);
  }
  function addDocs(category: DocCategory, files: FileList | null) {
    if (!files?.length) return;
    const added: Doc[] = [...files].map(f => ({ id: newId(), category, name: f.name, url: URL.createObjectURL(f), bytes: f.size, mime: f.type, added: Date.now() }));
    setD(prev => ({ ...prev, documents: [...(prev.documents ?? []), ...added] }));
  }

  function locate() {
    setPinErr(false);
    if (!('geolocation' in navigator)) { setPinErr(true); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      p => { setLocating(false); set('pin', { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: Math.round(p.coords.accuracy), source: 'gps' }); },
      () => { setLocating(false); setPinErr(true); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  }
  /** A pin typed by hand: kept only when both numbers are valid map positions. */
  function manualPin(which: 'pinLat' | 'pinLon', text: string) {
    const next = { ...raw, [which]: text };
    setRaw(next);
    const lat = parseFloat(next.pinLat ?? String(d.pin?.lat ?? ''));
    const lon = parseFloat(next.pinLon ?? String(d.pin?.lon ?? ''));
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) set('pin', { lat, lon, source: 'manual' });
  }

  async function fillFromWords() {
    if (!words.trim()) return;
    const r = await readNote(newId(), words.trim(), 'Your words');
    const m = merge(extract(r.segments, seg => r.blocked.get(seg) ?? []));
    const w: WordValues = {};
    for (const f of m.fields) if (f.suggested && !f.candidates) (w as Record<string, string>)[f.id] = f.suggested;
    const { listing, filled } = fillEmptyFrom(d, w);
    setD(listing);
    setWordsMsg(s.wordsDone(filled.length));
  }

  // nested parts
  const setTen = (k: keyof NonNullable<Listing['tenancy']>, v: string | number | undefined) => setD(prev => {
    const t = { ...(prev.tenancy ?? {}), [k]: v };
    if (v === undefined || v === '') delete (t as Record<string, unknown>)[k];
    return { ...prev, tenancy: Object.keys(t).length ? t : undefined };
  });
  const mk = d.marketing ?? { ads: [], custom: {} };
  const setMk = (patch: Partial<NonNullable<Listing['marketing']>>) => setD(prev => ({ ...prev, marketing: { ads: [], custom: {}, ...(prev.marketing ?? {}), ...patch } }));
  const setAd = (id: string, patch: Partial<Advert>) => setMk({ ads: mk.ads.map(a => (a.id === id ? { ...a, ...patch } : a)) });
  const setView = (id: string, patch: Partial<Viewing>) => setD(prev => ({ ...prev, viewings: (prev.viewings ?? []).map(w => (w.id === id ? { ...w, ...patch } : w)) }));

  const yrs = yearsRemaining(d);
  const comm = commissionRm(d);
  const rentMode = forRent(d);
  const saleMode = forSale(d);
  const depositRm = d.monthlyRent !== undefined ? d.monthlyRent * ((d.securityDepositMonths ?? 0) + (d.utilityDepositMonths ?? 0)) : undefined;
  const linked = vendors.find(v => v.id === d.vendorId);

  return (
    <section className="stack listing" data-testid="listing-form">
      <p className="notice">{s.allOptional}</p>

      <details className="card stack-sm words" data-testid="words">
        <summary className="card-title">{s.words}</summary>
        <small className="muted">{s.wordsHint}</small>
        <textarea aria-label={s.words} rows={3} value={words} onChange={e => setWords(e.target.value)} />
        <button className="btn secondary" disabled={!words.trim()} onClick={() => void fillFromWords()}>{s.wordsBtn}</button>
        {wordsMsg && <small role="status" className="ok-text">{wordsMsg}</small>}
      </details>

      <div className="card stack-sm">
        <div className="card-title">{s.sec.basics}</div>
        <label className="ff">
          <span className="between"><span>{s.l.type}</span>{fromWords('type')}</span>
          <select data-field="type" value={d.type ?? ''} onChange={e => set('type', e.target.value || undefined)}>
            <option value="">{s.notSet}</option>
            {CATEGORIES.map(c => (
              <optgroup key={c} label={s.category[c]}>
                {TYPES.filter(t => TYPE_CATEGORY[t] === c).map(t => <option key={t} value={t}>{t}</option>)}
              </optgroup>
            ))}
            <option value="Other">Other</option>
          </select>
        </label>
        {!d.type && <small className="muted">{s.chooseTypeFirst}</small>}
        {pair(Select({ k: 'purpose', options: PURPOSES, labels: s.purpose }), Text({ k: 'ref' }))}
        {Text({ k: 'headline' })}
      </div>

      <div className="card stack-sm">
        <div className="card-title">{s.sec.photos}</div>
        <small className="muted">{s.photosNote}</small>
        {d.photos.length > 0 && (
          <div className="photo-grid">
            {d.photos.map(p => (
              <div key={p.id} className={`pg-item ${p.id === (d.mainPhotoId ?? d.photos[0]?.id) ? 'main' : ''}`} data-testid="form-photo">
                <img src={p.url} alt="" />
                {p.id === (d.mainPhotoId ?? d.photos[0]?.id)
                  ? <span className="pg-main">{s.mainPhoto}</span>
                  : <button className="btn small secondary" onClick={() => setD(prev => ({ ...prev, mainPhotoId: p.id }))}>{s.makeMain}</button>}
                <button className="btn small secondary danger-text" onClick={() => setD(prev => {
                  const photos = prev.photos.filter(x => x.id !== p.id);
                  return { ...prev, photos, mainPhotoId: prev.mainPhotoId === p.id ? photos[0]?.id : prev.mainPhotoId };
                })}>{s.remove}</button>
              </div>
            ))}
          </div>
        )}
        <label className="btn secondary" aria-busy={busy}>
          {s.addPhotos}
          <input ref={fileRef} data-testid="photo-input" className="file-input" type="file" accept="image/*" multiple onChange={e => { void addPhotos(e.target.files); e.currentTarget.value = ''; }} />
        </label>
      </div>

      <div className="card stack-sm">
        <div className="card-title">{s.sec.location}</div>
        {Text({ k: 'address' })}
        {pair(Text({ k: 'unitNo' }), Text({ k: 'lotNo' }))}
        {Text({ k: 'area' })}
        <p className="small muted" data-testid="pin-text">{d.pin ? s.pinSet(d.pin.lat.toFixed(5), d.pin.lon.toFixed(5), d.pin.accuracy) : s.pinNone}</p>
        <div className="two">
          <button className="btn secondary" onClick={locate} disabled={locating}>{locating ? s.pinLocating : s.pinHere}</button>
          <button className="btn secondary" onClick={() => set('pin', undefined)} disabled={!d.pin}>{s.pinClear}</button>
        </div>
        <div className="two">
          <label className="ff">{s.pinLat}<input inputMode="decimal" value={shownNum('pinLat', d.pin?.lat) as string} onChange={e => manualPin('pinLat', e.target.value)} /></label>
          <label className="ff">{s.pinLon}<input inputMode="decimal" value={shownNum('pinLon', d.pin?.lon) as string} onChange={e => manualPin('pinLon', e.target.value)} /></label>
        </div>
        {pinErr && <p className="error" role="alert">{s.pinError}</p>}
      </div>

      <div className="card stack-sm" data-testid="sec-details">
        <div className="card-title">{s.sec.details}</div>
        {pair(show('landSqft') && Text({ k: 'landSqft', numeric: true }), show('builtUpSqft') && Text({ k: 'builtUpSqft', numeric: true }))}
        {pair(show('frontageFt') && Text({ k: 'frontageFt', numeric: true }), show('depthFt') && Text({ k: 'depthFt', numeric: true }))}
        {pair(show('bedrooms') && Text({ k: 'bedrooms', numeric: true }), show('bathrooms') && Text({ k: 'bathrooms', numeric: true }))}
        {pair(show('floors') && Text({ k: 'floors', numeric: true }), show('parking') && Text({ k: 'parking', numeric: true }))}
        {pair(show('lotType') && Select({ k: 'lotType', options: LOT_TYPES, labels: s.lotType }), show('furnishing') && Select({ k: 'furnishing', options: FURNISHING, labels: s.furnishing }))}
      </div>

      {(show('ceilingFt') || show('specs') || show('zoning') || show('currentUse') || show('roadAccess')) && (
        <div className="card stack-sm" data-testid="sec-specs">
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

      <div className="card stack-sm">
        <div className="card-title">{s.sec.tenure}</div>
        {Select({ k: 'tenure', options: TENURES, labels: s.tenure })}
        {d.tenure === 'leasehold' && (
          <>
            {Text({ k: 'leaseExpiryYear', numeric: true })}
            {yrs !== undefined && <p className="ok-text" data-testid="form-years-left">{s.yearsLeft(yrs)}</p>}
          </>
        )}
        {Select({ k: 'titleType', options: TITLE_TYPES })}
        {pair(show('landUse') && Select({ k: 'landUse', options: LAND_USES, labels: s.landUse }), Select({ k: 'restriction', options: RESTRICTIONS, labels: s.restriction }))}
      </div>

      <div className="card stack-sm" data-testid="sec-money">
        <div className="card-title">{s.sec.money}</div>
        {saleMode && <>
          {Text({ k: 'askingPrice', numeric: true })}
          <div className="two">
            {Select({ k: 'negotiable', options: ['yes', 'no'], labels: s.negotiable })}
            {Text({ k: 'commissionPct', numeric: true })}
          </div>
          {comm !== undefined && <small className="muted" data-testid="form-commission">{s.commission(rm(comm))}</small>}
        </>}
        {rentMode && <>
          {Text({ k: 'monthlyRent', numeric: true })}
          {pair(Text({ k: 'securityDepositMonths', numeric: true }), Text({ k: 'utilityDepositMonths', numeric: true }))}
          {depositRm ? <small className="muted" data-testid="form-deposit">{s.depositRm(rm(depositRm))}</small> : null}
        </>}
        {show('maintenanceFee') && Text({ k: 'maintenanceFee', numeric: true })}
      </div>

      {(rentMode || d.availability === 'tenanted' || d.tenancy) && (
        <div className="card stack-sm" data-testid="sec-tenancy">
          <div className="card-title">{s.sec.tenancy}</div>
          <label className="ff">{s.l.tenant}<input data-field="tenancy.tenant" value={d.tenancy?.tenant ?? ''} onChange={e => setTen('tenant', e.target.value || undefined)} /></label>
          <div className="two">
            <label className="ff">{s.l.tStart}<input data-field="tenancy.start" type="month" value={d.tenancy?.start ?? ''} onChange={e => setTen('start', e.target.value || undefined)} /></label>
            <label className="ff">{s.l.tEnd}<input data-field="tenancy.end" type="month" value={d.tenancy?.end ?? ''} onChange={e => setTen('end', e.target.value || undefined)} /></label>
          </div>
          <label className="ff">{s.l.tRent}<input data-field="tenancy.rent" inputMode="decimal" value={shownNum('tRent', d.tenancy?.rent) as string}
            onChange={e => { setRaw(r => ({ ...r, tRent: e.target.value })); setTen('rent', num(e.target.value)); }} /></label>
          <label className="ff">{s.l.tNotes}<textarea data-field="tenancy.notes" rows={2} value={d.tenancy?.notes ?? ''} onChange={e => setTen('notes', e.target.value || undefined)} /></label>
        </div>
      )}

      <div className="card stack-sm">
        <div className="card-title">{s.sec.availability}</div>
        {Select({ k: 'availability', options: AVAILABILITY, labels: s.availability })}
        {d.availability === 'from_date' && (
          <label className="ff">{s.l.availableFrom}<input data-field="availableFrom" type="month" value={d.availableFrom ?? ''} onChange={e => set('availableFrom', e.target.value || undefined)} /></label>
        )}
        {show('condition') && Select({ k: 'condition', options: CONDITIONS, labels: s.condition })}
        {Text({ k: 'features', area: true })}
      </div>

      <div className="card stack-sm" data-testid="sec-owner">
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

      <div className="card stack-sm">
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

      <div className="card stack-sm" data-testid="sec-marketing">
        <div className="card-title">{s.sec.marketing}</div>
        <label className="ff">{s.l.advertised}
          <select data-field="advertised" value={mk.advertised ?? ''} onChange={e => setMk({ advertised: (e.target.value || undefined) as 'yes' | 'no' | undefined })}>
            <option value="">{s.notSet}</option><option value="yes">{s.yesNo.yes}</option><option value="no">{s.yesNo.no}</option>
          </select>
        </label>
        {mk.ads.map((a, i) => (
          <div key={a.id} className="sub-card stack-sm" data-testid="ad-editor">
            <div className="two">
              <label className="ff">{s.l.platform}
                <select aria-label={`${s.l.platform} ${i + 1}`} value={a.platform} onChange={e => setAd(a.id, { platform: e.target.value })}>
                  {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="ff">{s.l.adStatus}
                <select aria-label={`${s.l.adStatus} ${i + 1}`} value={a.status ?? ''} onChange={e => setAd(a.id, { status: (e.target.value || undefined) as Advert['status'] })}>
                  <option value="">{s.notSet}</option>{AD_STATUSES.map(x => <option key={x} value={x}>{s.adStatus[x]}</option>)}
                </select>
              </label>
            </div>
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
            <label key={fd.id} className="ff">{fd.label}
              <input data-field={`custom.${fd.id}`} value={mk.custom[fd.id] ?? ''} onChange={e => setMk({ custom: { ...mk.custom, [fd.id]: e.target.value } })} />
            </label>
          ))}
          {newField !== null && (
            <div className="stack-sm">
              <label className="ff">{s.fieldName}<input autoFocus value={newField} onChange={e => setNewField(e.target.value)} /></label>
              <div className="two">
                <button className="btn secondary" onClick={() => setNewField(null)}>{s.cancel}</button>
                <button className="btn primary" disabled={!newField.trim()} onClick={() => { onAddFieldDef(newField.trim()); setNewField(null); }}>{s.createField}</button>
              </div>
            </div>
          )}
          {fieldDefs.length >= MAX_CUSTOM_FIELDS
            ? <small className="warn-text" data-testid="custom-full">{s.customFull}</small>
            : newField === null && <button className="btn ghost" onClick={() => setNewField('')}>+ {s.addField}</button>}
          {fieldDefs.length > 0 && <small className="muted">{s.customMax(fieldDefs.length)}</small>}
        </div>
      </div>

      <div className="card stack-sm" data-testid="sec-docs">
        <div className="card-title">{s.sec.docs}</div>
        <small className="muted">{s.docsNote}</small>
        <button className="btn secondary capture-link" onClick={onCapture}>{s.smartCapture}: {s.smartCaptureHint}</button>
        {DOC_CATEGORIES.map(c => {
          const list = (d.documents ?? []).filter(x => x.category === c);
          return (
            <div key={c} className="sub-card stack-sm" data-testid={`doc-${c}`}>
              <div className="between"><strong>{s.docCat[c]}</strong><span className="count">{list.length}</span></div>
              {CONFIDENTIAL_DOCS.includes(c) && <small className="sens">{s.confidential}</small>}
              {list.map(x => (
                <div key={x.id} className="doc-row"><span>{x.name}</span>
                  <button className="btn small secondary danger-text" onClick={() => setD(prev => ({ ...prev, documents: (prev.documents ?? []).filter(y => y.id !== x.id) }))}>{s.remove}</button>
                </div>
              ))}
              <label className="btn small secondary">
                + {s.addFiles}
                <input data-testid={`doc-input-${c}`} className="file-input" type="file" multiple
                  accept={c === 'floorplan' || c === 'correspondence' ? 'image/*,application/pdf' : 'image/*,application/pdf,.doc,.docx'}
                  onChange={e => { addDocs(c, e.target.files); e.currentTarget.value = ''; }} />
              </label>
            </div>
          );
        })}
      </div>

      <div className="card stack-sm" data-testid="sec-viewings">
        <div className="card-title">{s.sec.viewings}</div>
        {(d.viewings ?? []).length === 0 && <small className="muted">{s.noViewings}</small>}
        {(d.viewings ?? []).map((w, i) => (
          <div key={w.id} className="sub-card stack-sm">
            <div className="two">
              <label className="ff">{s.l.vDate}<input aria-label={`${s.l.vDate} ${i + 1}`} type="date" value={w.date} onChange={e => setView(w.id, { date: e.target.value })} /></label>
              <label className="ff">{s.l.attended}
                <select value={w.attended ?? ''} onChange={e => setView(w.id, { attended: (e.target.value || undefined) as Viewing['attended'] })}>
                  <option value="">{s.notSet}</option><option value="yes">{s.attended.yes}</option><option value="no">{s.attended.no}</option>
                </select>
              </label>
            </div>
            <label className="ff">{s.l.viewer}<input aria-label={`${s.l.viewer} ${i + 1}`} value={w.viewer ?? ''} onChange={e => setView(w.id, { viewer: e.target.value || undefined })} /></label>
            <label className="ff">{s.l.vNote}<input value={w.note ?? ''} onChange={e => setView(w.id, { note: e.target.value || undefined })} /></label>
            <button className="btn small secondary danger-text" onClick={() => setD(prev => ({ ...prev, viewings: (prev.viewings ?? []).filter(x => x.id !== w.id) }))}>{s.remove}</button>
          </div>
        ))}
        <button className="btn secondary" onClick={() => setD(prev => ({ ...prev, viewings: [...(prev.viewings ?? []), { id: newId(), date: new Date().toISOString().slice(0, 10) }] }))}>+ {s.addViewing}</button>
      </div>

      <div className="card stack-sm">
        <div className="card-title">{s.sec.notes}</div>
        {Text({ k: 'notes', area: true })}
      </div>

      <div className="save-bar">
        <div className="two">
          <button className="btn secondary" onClick={onCancel}>{s.cancel}</button>
          <button className="btn primary" disabled={busy} onClick={() => {
            // Drop values for fields that do not apply to this type, so a land record never carries house fields.
            const clean: Listing = { ...d };
            for (const k of ['bedrooms', 'bathrooms', 'floors', 'parking', 'landSqft', 'builtUpSqft', 'frontageFt', 'depthFt', 'lotType', 'furnishing',
              'ceilingFt', 'powerKva', 'loadingBays', 'specs', 'zoning', 'approvals', 'currentUse', 'roadAccess', 'maintenanceFee', 'condition', 'landUse'] as FormField[]) {
              if (!vf.has(k)) delete clean[k];
            }
            if (!forSale(clean)) { delete clean.askingPrice; delete clean.negotiable; delete clean.commissionPct; }
            if (!forRent(clean)) { delete clean.monthlyRent; delete clean.securityDepositMonths; delete clean.utilityDepositMonths; }
            onSave({
              ...clean, updated: Date.now(), ownerPhone: linked ? undefined : normalisePhone(d.ownerPhone), ownerName: linked ? undefined : d.ownerName,
              handledBy: d.status === 'in_progress' ? d.handledBy : undefined,
              leaseExpiryYear: d.tenure === 'leasehold' ? d.leaseExpiryYear : undefined,
              availableFrom: d.availability === 'from_date' ? d.availableFrom : undefined,
              arrangementNote: d.arrangement && d.arrangement !== 'direct' ? d.arrangementNote : undefined,
            });
          }}>{s.save}</button>
        </div>
      </div>
    </section>
  );
}
