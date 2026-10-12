// Property List screens (Version 1L): list with two layouts and filters, and the full property record.
// The add / edit form is in ListingForm.tsx; voice commands are in PropertyVoice.tsx.
import { useMemo, useState } from 'react';
import { Lang } from '../i18n';
import { listingStrings, ListingStrings } from './strings';
import {
  Listing, Filters, applyFilters, activeCount, TYPES, TENURES, LOT_TYPES, STATUSES, CATEGORIES,
  rm, rmShort, sqft, landText, yearsRemaining, cardTitle, mainPhoto, commissionRm, categoryOf, forRent, forSale, fieldsFor,
  missingDetails, MarketingFieldDef, CONFIDENTIAL_DOCS, DOC_CATEGORIES,
} from './model';
import { Vendor, ownerLabel } from '../contacts/model';
import { PropertyVoice, monthText } from './PropertyVoice';
import { Change, Command, applyChanges } from './commands';
import { IconMic } from '../icons';

export { ListingForm } from './ListingForm';

const isSample = (l: Listing) => /^s\d+$/.test(l.id);
export type Layout = 'large' | 'grid';

// ---------- small shared pieces ----------
export function PriceLine({ l, s, short }: { l: Listing; s: ListingStrings; short?: boolean }) {
  const money = short ? rmShort : rm;
  const sale = forSale(l) && l.askingPrice !== undefined ? money(l.askingPrice) : '';
  const rent = forRent(l) && l.monthlyRent !== undefined ? `${money(l.monthlyRent)} ${s.perMonth}` : '';
  if (!sale && !rent) return <span className="muted no-price">{s.noPrice}</span>;
  // Small cards show one figure (the sale price first); the full card and record show both.
  return <>{short ? sale || rent : [sale, rent].filter(Boolean).join(' · ')}</>;
}

function availabilityText(l: Listing, s: ListingStrings): string | undefined {
  if (!l.availability) return undefined;
  if (l.availability === 'from_date' && l.availableFrom) return s.availableFrom(monthText(l.availableFrom));
  if (l.availability === 'tenanted' && l.tenancy?.end) return s.tenantedUntil(monthText(l.tenancy.end));
  return s.availability[l.availability];
}

function Facts({ l, s }: { l: Listing; s: ListingStrings }) {
  const items = [
    l.landSqft !== undefined && `${l.landSqft >= 43560 ? `${(l.landSqft / 43560).toFixed(1)} acres` : sqft(l.landSqft)} ${s.land}`,
    l.builtUpSqft !== undefined && `${sqft(l.builtUpSqft)} ${s.builtUp}`,
    l.bedrooms !== undefined && `${l.bedrooms} ${s.beds}`,
    l.bathrooms !== undefined && `${l.bathrooms} ${s.baths}`,
    l.parking !== undefined && `${l.parking} ${s.parking}`,
  ].filter(Boolean) as string[];
  if (!items.length) return null;
  return <div className="lc-facts">{items.map(x => <span key={x}>{x}</span>)}</div>;
}

function Badges({ l, s }: { l: Listing; s: ListingStrings }) {
  return (
    <>
      {l.status && <span className={`lc-status st-${l.status}`}>{s.status[l.status]}</span>}
      {l.purpose && <span className="lc-purpose">{s.purpose[l.purpose]}</span>}
    </>
  );
}

function Hero({ l, s, tall }: { l: Listing; s: ListingStrings; tall?: boolean }) {
  const p = mainPhoto(l);
  return (
    <div className={`lc-photo ${tall ? 'tall' : ''}`}>
      {p ? <img src={p.url} alt="" /> : <div className="lc-noimg" />}
      <div className="lc-shade" />
      <div className="lc-badges"><Badges l={l} s={s} /></div>
      {p?.sample && <span className="lc-sample">{s.samplePic}</span>}
      {!p?.sample && isSample(l) && <span className="lc-sample">{s.sample}</span>}
    </div>
  );
}

const typeArea = (l: Listing) => [l.type, l.area].filter(Boolean).join(' · ');

// ---------- list ----------
export function PropertyListing({ lang, listings, vendors, layout, setLayout, initial, onOpen, onAdd, onCapture, onVoiceCreate }: {
  lang: Lang; listings: Listing[]; vendors: Vendor[]; layout: Layout; setLayout: (l: Layout) => void; initial?: Filters;
  onOpen: (id: string) => void; onAdd: () => void; onCapture: () => void; onVoiceCreate: (changes: Change[]) => void;
}) {
  const s = listingStrings[lang];
  const [f, setF] = useState<Filters>(initial ?? {});
  const [open, setOpen] = useState(false);
  const [voice, setVoice] = useState(false);
  const shown = useMemo(() => applyFilters(listings, f), [listings, f]);
  const n = activeCount(f);
  const set = (patch: Partial<Filters>) => setF(prev => ({ ...prev, ...patch }));
  const numOrUndef = (v: string) => { const x = parseFloat(v.replace(/[^\d.]/g, '')); return Number.isFinite(x) ? x : undefined; };

  function onFind(c: Extract<Command, { kind: 'find' }>): number {
    const next: Filters = { type: c.type, typeWord: c.typeWord, location: c.area, purpose: c.purpose };
    setF(next);
    return applyFilters(listings, next).length;
  }

  return (
    <section className="stack listing" data-testid="listing">
      <div className="lc-toolbar">
        <input aria-label={s.f.location} placeholder={s.search} value={f.location ?? ''} onChange={e => set({ location: e.target.value || undefined })} />
        <button className="btn secondary" aria-expanded={open} onClick={() => setOpen(o => !o)}>{s.filters}{n ? ` · ${n}` : ''}</button>
      </div>
      <div className="lc-tools">
        <div className="seg" role="group" aria-label={s.layout}>
          <button aria-pressed={layout === 'large'} onClick={() => setLayout('large')} aria-label={s.large}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20"><rect x="2" y="2" width="16" height="7" rx="1.5" fill="currentColor" /><rect x="2" y="11" width="16" height="7" rx="1.5" fill="currentColor" /></svg>
            <span>{s.large}</span>
          </button>
          <button aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')} aria-label={s.grid}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">{[2, 8, 14].flatMap(x => [2, 8, 14].map(y => <rect key={`${x}${y}`} x={x} y={y} width="4.5" height="4.5" rx="1" fill="currentColor" />))}</svg>
            <span>{s.grid}</span>
          </button>
        </div>
        <button className="btn secondary voice-btn" aria-expanded={voice} onClick={() => setVoice(v => !v)}><IconMic size={20} /> {s.voice.open}</button>
        <button className="btn secondary capture-link" onClick={onCapture} title={s.smartCaptureHint}>{s.smartCapture}</button>
      </div>

      {voice && <PropertyVoice lang={lang} mode="list" onCreate={onVoiceCreate} onFind={onFind} />}

      {open && (
        <div className="card stack-sm" data-testid="filter-panel">
          <div className="filter-grid">
            <label>{s.f.purpose}
              <select aria-label={s.f.purpose} value={f.purpose ?? ''} onChange={e => set({ purpose: (e.target.value || undefined) as Filters['purpose'] })}>
                <option value="">{s.any}</option>{(['sale', 'rent'] as const).map(x => <option key={x} value={x}>{s.purposeFilter[x]}</option>)}
              </select>
            </label>
            <label>{s.f.category}
              <select aria-label={s.f.category} value={f.category ?? ''} onChange={e => set({ category: (e.target.value || undefined) as Filters['category'] })}>
                <option value="">{s.any}</option>{CATEGORIES.map(x => <option key={x} value={x}>{s.category[x]}</option>)}
              </select>
            </label>
            <label>{s.f.type}
              <select aria-label={s.f.type} value={f.type ?? ''} onChange={e => set({ type: e.target.value || undefined, typeWord: undefined })}>
                <option value="">{s.any}</option>{TYPES.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <label>{s.f.status}
              <select aria-label={s.f.status} value={f.status ?? ''} onChange={e => set({ status: (e.target.value || undefined) as Filters['status'] })}>
                <option value="">{s.any}</option>{STATUSES.map(x => <option key={x} value={x}>{s.status[x]}</option>)}
              </select>
            </label>
            <label>{s.f.tenure}
              <select aria-label={s.f.tenure} value={f.tenure ?? ''} onChange={e => set({ tenure: (e.target.value || undefined) as Filters['tenure'] })}>
                <option value="">{s.any}</option>{TENURES.map(x => <option key={x} value={x}>{s.tenure[x]}</option>)}
              </select>
            </label>
            <label>{s.f.lotType}
              <select aria-label={s.f.lotType} value={f.lotType ?? ''} onChange={e => set({ lotType: (e.target.value || undefined) as Filters['lotType'] })}>
                <option value="">{s.any}</option>{LOT_TYPES.map(x => <option key={x} value={x}>{s.lotType[x]}</option>)}
              </select>
            </label>
            <label>{s.f.beds}
              <select aria-label={s.f.beds} value={f.bedsMin ?? ''} onChange={e => set({ bedsMin: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">{s.any}</option>{[1, 2, 3, 4, 5].map(x => <option key={x} value={x}>{x}+</option>)}
              </select>
            </label>
            <label>{s.f.baths}
              <select aria-label={s.f.baths} value={f.bathsMin ?? ''} onChange={e => set({ bathsMin: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">{s.any}</option>{[1, 2, 3, 4].map(x => <option key={x} value={x}>{x}+</option>)}
              </select>
            </label>
          </div>
          <div className="small muted">{f.purpose === 'rent' ? s.priceRent : s.f.price}</div>
          <div className="two">
            <input aria-label={`${s.f.price} ${s.min}`} inputMode="numeric" placeholder={s.min} value={f.priceMin ?? ''} onChange={e => set({ priceMin: numOrUndef(e.target.value) })} />
            <input aria-label={`${s.f.price} ${s.max}`} inputMode="numeric" placeholder={s.max} value={f.priceMax ?? ''} onChange={e => set({ priceMax: numOrUndef(e.target.value) })} />
          </div>
          <div className="two">
            <button className="btn secondary" onClick={() => setF({})} disabled={!n}>{s.clear}</button>
            <button className="btn primary" onClick={() => setOpen(false)}>{s.show(shown.length)}</button>
          </div>
        </div>
      )}

      <div className="small muted" data-testid="listing-count">{s.results(shown.length, listings.length)}</div>
      {shown.length === 0 && <p className="muted">{s.none}</p>}

      {layout === 'large' ? (
        <ul className="lc-list">
          {shown.map(l => (
            <li key={l.id} className="lc-card" data-testid="listing-card">
              <Hero l={l} s={s} />
              <div className="lc-body">
                <div className="lc-ref">{[l.ref, categoryOf(l) && s.category[categoryOf(l)!]].filter(Boolean).join(' · ')}</div>
                <div className="lc-title">{cardTitle(l) || s.untitled}</div>
                {typeArea(l) && <div className="lc-type">{typeArea(l)}</div>}
                <strong className="lc-price"><PriceLine l={l} s={s} /></strong>
                <Facts l={l} s={s} />
                <div className="lc-meta">
                  {[availabilityText(l, s), l.tenure && s.tenure[l.tenure] + (yearsRemaining(l) !== undefined ? ` · ${s.yearsLeft(yearsRemaining(l)!)}` : '')].filter(Boolean).join(' · ')}
                </div>
                <div className="between lc-foot">
                  <span className="lc-owner">{ownerLabel(l, vendors) ? `${s.owner}: ${ownerLabel(l, vendors)}` : ''}</span>
                  <button className="btn small primary" onClick={() => onOpen(l.id)} aria-label={`${s.open}: ${cardTitle(l) || s.untitled}`}>{s.open}</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="lc-grid">
          {shown.map(l => {
            const p = mainPhoto(l);
            return (
              <li key={l.id} data-testid="listing-card">
                <button className="gc" onClick={() => onOpen(l.id)} aria-label={`${s.open}: ${cardTitle(l) || s.untitled}`}>
                  <span className="gc-photo">{p ? <img src={p.url} alt="" /> : null}{l.status && <span className={`gc-dot st-${l.status}`} aria-hidden="true" />}</span>
                  <span className="gc-price"><PriceLine l={l} s={s} short /></span>
                  <span className="gc-title">{cardTitle(l) || s.untitled}</span>
                  <span className="gc-meta">{l.ref}</span>
                  <span className="gc-meta">{l.status ? s.status[l.status] : ''}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button className="fab" onClick={onAdd} aria-label={s.add}><span aria-hidden="true">+</span> {s.add}</button>
    </section>
  );
}

// ---------- full property record ----------
export function ListingDetails({ lang, l, vendors, fieldDefs, onEdit, onUpdate }: {
  lang: Lang; l: Listing; vendors: Vendor[]; fieldDefs: MarketingFieldDef[]; onEdit: () => void; onUpdate: (l: Listing, source: 'voice', summary: string) => void;
}) {
  const s = listingStrings[lang];
  const [photoId, setPhotoId] = useState<string | undefined>(undefined);
  const [voice, setVoice] = useState(false);
  const shownPhoto = l.photos.find(p => p.id === photoId);
  const yrs = yearsRemaining(l);
  const comm = commissionRm(l);
  const vf = fieldsFor(l.type);
  const vendor = vendors.find(v => v.id === l.vendorId);
  const owner = ownerLabel(l, vendors);
  const phone = vendor?.phone ?? l.ownerPhone;
  const missing = missingDetails(l);
  const row = (k: string, v?: string | number) => (v === undefined || v === '' ? null : <div key={k} className="dl-row"><dt>{s.l[k] ?? k}</dt><dd>{v}</dd></div>);
  const numRow = (k: keyof Listing, fmt: (n: number) => string = String) => (l[k] === undefined ? null : row(k, fmt(l[k] as number)));
  const depositRm = l.monthlyRent !== undefined ? l.monthlyRent * ((l.securityDepositMonths ?? 0) + (l.utilityDepositMonths ?? 0)) : undefined;
  const docs = l.documents ?? [];
  const custom = fieldDefs.filter(d => l.marketing?.custom?.[d.id]);

  return (
    <section className="stack listing" data-testid="listing-details">
      <div className="lc-card">
        {shownPhoto ? <div className="lc-photo tall"><img src={shownPhoto.url} alt="" /><div className="lc-shade" /><div className="lc-badges"><Badges l={l} s={s} /></div></div> : <Hero l={l} s={s} tall />}
        {l.photos.length > 1 && (
          <div className="thumbs">{l.photos.map(p => <button key={p.id} className={p.id === (shownPhoto ?? mainPhoto(l))?.id ? 'on' : ''} onClick={() => setPhotoId(p.id)} aria-label={p.name}><img src={p.url} alt="" /></button>)}</div>
        )}
        <div className="lc-body">
          <div className="lc-ref">{[l.ref, categoryOf(l) && s.category[categoryOf(l)!]].filter(Boolean).join(' · ')}</div>
          <div className="lc-title big">{cardTitle(l) || s.untitled}</div>
          {typeArea(l) && <div className="lc-type">{typeArea(l)}</div>}
          <strong className="lc-price big"><PriceLine l={l} s={s} /></strong>
          {l.negotiable && forSale(l) && <span className="badge fit">{s.negotiable[l.negotiable]}</span>}
          <div className="key-facts">
            {[
              ['landSqft', l.landSqft !== undefined ? landText(l.landSqft) : undefined],
              ['builtUpSqft', l.builtUpSqft !== undefined ? sqft(l.builtUpSqft) : undefined],
              ['bedrooms', l.bedrooms], ['bathrooms', l.bathrooms], ['parking', l.parking],
              ['tenure', l.tenure && s.tenure[l.tenure] + (yrs !== undefined ? ` · ${s.yearsLeft(yrs)}` : '')],
            ].filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => (
              <div key={k as string} className="kf"><span>{s.kf[k as string]}</span><strong data-testid={k === 'tenure' && yrs !== undefined ? 'years-left' : undefined}>{v}</strong></div>
            ))}
          </div>
        </div>
      </div>

      <div className="rec-actions">
        <button className="btn primary" onClick={onEdit}>{s.edit}</button>
        <button className="btn secondary" aria-expanded={voice} onClick={() => setVoice(v => !v)}><IconMic size={20} /> {s.voice.open}</button>
        {phone && <a className="btn secondary" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{s.call}</a>}
        {phone && <a className="btn secondary" href={`https://wa.me/${phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">{s.whatsapp}</a>}
      </div>

      {voice && <PropertyVoice lang={lang} mode="record" listing={l}
        onApply={changes => onUpdate(applyChanges(l, changes), 'voice', changes.map(c => c.key).join(', '))} />}

      <div className={`card stack-sm ${missing.length ? 'missing' : ''}`} data-testid="missing">
        <div className="card-title">{s.sec.missing}</div>
        {missing.length ? <div className="lc-facts">{missing.map(k => <span key={k}>{s.l[k] ?? k}</span>)}</div> : <small className="ok-text">{s.missingNone}</small>}
      </div>

      <div className="card stack-sm"><div className="card-title">{s.sec.status}</div>
        <dl className="dl">
          {row('status', l.status && s.status[l.status])}{l.status === 'in_progress' ? row('handledBy', l.handledBy) : null}
          {row('purpose', l.purpose && s.purpose[l.purpose])}
          {row('availability', availabilityText(l, s))}
          {row('condition', l.condition && s.condition[l.condition])}
          {row('features', l.features)}
        </dl>
      </div>

      <div className="card stack-sm"><div className="card-title">{s.sec.details}</div>
        <dl className="dl">
          {row('type', l.type)}{row('unitNo', l.unitNo)}{row('lotNo', l.lotNo)}
          {numRow('landSqft', landText)}{numRow('builtUpSqft', sqft)}
          {l.frontageFt !== undefined || l.depthFt !== undefined ? row('frontageFt', `${l.frontageFt ?? '?'} ft × ${l.depthFt ?? '?'} ft`) : null}
          {numRow('bedrooms')}{numRow('bathrooms')}{numRow('floors')}{numRow('parking')}
          {row('lotType', l.lotType && s.lotType[l.lotType])}{row('furnishing', l.furnishing && s.furnishing[l.furnishing])}
        </dl>
      </div>

      {(vf.has('ceilingFt') || vf.has('zoning') || vf.has('currentUse')) && (l.ceilingFt ?? l.powerKva ?? l.loadingBays ?? l.specs ?? l.zoning ?? l.approvals ?? l.currentUse ?? l.roadAccess) !== undefined && (
        <div className="card stack-sm"><div className="card-title">{vf.has('ceilingFt') ? s.sec.building : s.sec.land}</div>
          <dl className="dl">
            {numRow('ceilingFt', x => `${x} ft`)}{numRow('powerKva', x => `${x} kVA`)}{numRow('loadingBays')}{row('specs', l.specs)}
            {row('zoning', l.zoning)}{row('approvals', l.approvals)}{row('currentUse', l.currentUse)}{row('roadAccess', l.roadAccess)}
          </dl>
        </div>
      )}

      <div className="card stack-sm"><div className="card-title">{s.sec.tenure}</div>
        <dl className="dl">{row('tenure', l.tenure && s.tenure[l.tenure])}{row('leaseExpiryYear', l.leaseExpiryYear)}
          {yrs !== undefined && <div className="dl-row"><dt /><dd className="ok-text">{s.yearsLeft(yrs)}</dd></div>}
          {row('titleType', l.titleType)}{row('landUse', l.landUse && s.landUse[l.landUse])}{row('restriction', l.restriction && s.restriction[l.restriction])}</dl>
      </div>

      <div className="card stack-sm"><div className="card-title">{s.sec.money}</div>
        <dl className="dl">
          {forSale(l) && <>{numRow('askingPrice', rm)}{row('negotiable', l.negotiable && s.negotiable[l.negotiable])}{row('commissionPct', l.commissionPct !== undefined ? `${l.commissionPct}%` : undefined)}</>}
          {forRent(l) && <>{numRow('monthlyRent', rm)}{numRow('securityDepositMonths', s.months)}{numRow('utilityDepositMonths', s.months)}</>}
          {numRow('maintenanceFee', rm)}
        </dl>
        {comm !== undefined && forSale(l) && <small className="muted">{s.commission(rm(comm))}</small>}
        {forRent(l) && depositRm ? <small className="muted">{s.depositRm(rm(depositRm))}</small> : null}
      </div>

      {l.tenancy && Object.keys(l.tenancy).length > 0 && (
        <div className="card stack-sm" data-testid="tenancy"><div className="card-title">{s.sec.tenancy}</div>
          <dl className="dl">{row('tenant', l.tenancy.tenant)}{row('tStart', monthText(l.tenancy.start))}{row('tEnd', monthText(l.tenancy.end))}
            {row('tRent', l.tenancy.rent !== undefined ? rm(l.tenancy.rent) : undefined)}{row('tNotes', l.tenancy.notes)}</dl>
        </div>
      )}

      <div className="card stack-sm"><div className="card-title">{s.sec.owner}</div>
        {owner ? <dl className="dl">{row('ownerName', owner)}{row('ownerPhone', phone)}</dl> : <small className="muted">{s.notSet}</small>}
        {vendor && <small className="muted">{s.vendorLinked}</small>}
      </div>

      <div className="card stack-sm"><div className="card-title">{s.sec.location}</div>
        <p className="small">{[l.unitNo && `Unit ${l.unitNo}`, l.lotNo && `Lot ${l.lotNo}`, l.address, l.area].filter(Boolean).join(', ') || s.notSet}</p>
        <p className="small muted">{l.pin ? s.pinSet(l.pin.lat.toFixed(5), l.pin.lon.toFixed(5), l.pin.accuracy) : s.pinNone}</p>
      </div>

      <div className="card stack-sm" data-testid="marketing"><div className="card-title">{s.sec.marketing}</div>
        <dl className="dl">
          {row('arrangement', l.arrangement && s.arrangement[l.arrangement])}{row('arrangementNote', l.arrangementNote)}
          {row('advertised', l.marketing?.advertised && s.yesNo[l.marketing.advertised])}
          {custom.map(d => <div key={d.id} className="dl-row"><dt>{d.label}</dt><dd>{l.marketing!.custom[d.id]}</dd></div>)}
        </dl>
        {(l.marketing?.ads ?? []).map(a => (
          <div key={a.id} className="ad-row">
            <div className="between"><strong>{a.platform}</strong>{a.status && <span className={`ad-st ad-${a.status}`}>{s.adStatus[a.status]}</span>}</div>
            <small className="muted">{[a.start && a.end ? `${a.start} → ${a.end}` : a.start, a.ref].filter(Boolean).join(' · ')}</small>
            {a.notes && <small>{a.notes}</small>}
          </div>
        ))}
      </div>

      <div className="card stack-sm" data-testid="docs"><div className="card-title">{s.sec.docs}</div>
        <div className="doc-sum">
          <div><span>{s.sec.photos}</span><strong>{l.photos.length}</strong></div>
          {DOC_CATEGORIES.map(c => <div key={c}><span>{s.docCat[c]}{CONFIDENTIAL_DOCS.includes(c) ? ' 🔒' : ''}</span><strong>{docs.filter(d => d.category === c).length}</strong></div>)}
        </div>
        {docs.map(d => <div key={d.id} className="doc-row"><span>{d.name}</span>{d.url ? <a className="btn small secondary" href={d.url} target="_blank" rel="noreferrer">{s.open1}</a> : <small className="muted">{s.sample}</small>}</div>)}
      </div>

      <div className="card stack-sm"><div className="card-title">{s.sec.viewings}</div>
        {(l.viewings ?? []).length === 0 ? <small className="muted">{s.noViewings}</small> : (l.viewings ?? []).map(w => (
          <div key={w.id} className="ad-row">
            <div className="between"><strong>{w.date}</strong>{w.attended && <span className={`ad-st ${w.attended === 'yes' ? 'ad-live' : 'ad-expired'}`}>{s.attended[w.attended]}</span>}</div>
            {w.viewer && <small>{w.viewer}</small>}
            {w.note && <small className="muted">{w.note}</small>}
          </div>
        ))}
      </div>

      {l.notes && <div className="card stack-sm"><div className="card-title">{s.sec.notes}</div><p className="pre">{l.notes}</p></div>}

      {(l.history ?? []).length > 0 && (
        <div className="card stack-sm" data-testid="history"><div className="card-title">{s.sec.history}</div>
          {l.history!.map((h, i) => <small key={i} className="muted">{new Date(h.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} · {s.historyItem[h.source]}{h.summary ? ` (${h.summary})` : ''}</small>)}
        </div>
      )}
      <small className="muted">{s.editedNote}</small>
    </section>
  );
}
