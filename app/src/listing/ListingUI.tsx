// Property List: Grid view (default, first) and Large cards, filters, and the property detail page.
// Cards hide the reference number; the detail page shows it. Every detail section has its own Edit button that
// opens the form straight at that section.
import { useMemo, useState } from 'react';
import { RecordStatus, FileBadge } from '../sync/SyncUI';
import { BannerDot } from '../gps/BannersUI';
import { activeBanners } from '../domain/banners';
import { MoneyInput } from '../ui/MoneyInput';
import { Lang } from '../i18n';
import { listingStrings, ListingStrings, typeLabel } from './strings';
import {
  Listing, Filters, applyFilters, activeCount, TYPES, TENURES, LOT_TYPES, STATUSES, CATEGORIES,
  rm, rmShort, sqft, landText, yearsRemaining, cardTitle, mainPhoto, commissionRm, forRent, forSale, fieldsFor,
  missingDetails, CONFIDENTIAL_DOCS, DOC_CATEGORIES, placeName, hasPosition, phoneDigits, Doc,
} from './model';
import { PropertyVoice } from './PropertyVoice';
import { Change, Command, applyChanges } from './commands';
import { IconMic } from '../icons';
import { useApp, useStore } from '../data/useStore';
import { Go, FormSection } from '../nav';
import { SectionCard, StoredImage } from '../ui/common';
import { InquiryHistory, ViewingHistory } from '../agenda/History';
import { monthText, fmtDate } from '../lib/dates';
import { navigationUrl } from '../lib/geo';

export type Layout = 'grid' | 'large';

export function PriceLine({ l, s, short }: { l: Listing; s: ListingStrings; short?: boolean }) {
  const money = short ? rmShort : rm;
  const sale = forSale(l) && l.askingPrice !== undefined ? money(l.askingPrice) : '';
  const rent = forRent(l) && l.monthlyRent !== undefined ? `${money(l.monthlyRent)} ${s.perMonth}` : '';
  if (!sale && !rent) return <span className="muted no-price">{s.noPrice}</span>;
  return <>{short ? sale || rent : [sale, rent].filter(Boolean).join(' · ')}</>;
}

function availabilityText(l: Listing, s: ListingStrings, lang: Lang): string | undefined {
  if (!l.availability) return undefined;
  if (l.availability === 'from_date' && l.availableFrom) return s.availableFrom(monthText(l.availableFrom, lang));
  if (l.availability === 'tenanted' && l.tenancy?.end) return s.tenantedUntil(monthText(l.tenancy.end, lang));
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

/** The same picture area on every card: the main photo, or the drawn picture for the type, labelled as a sample. */
function CardPhoto({ l, s, className, tall }: { l: Listing; s: ListingStrings; className: string; tall?: boolean }) {
  const p = mainPhoto(l)!;
  return (
    <span className={`${className} ${tall ? 'tall' : ''}`}>
      <StoredImage fileId={p.fileId} url={p.url} />
      {className === 'lc-photo' && <><span className="lc-shade" /><span className="lc-badges"><Badges l={l} s={s} /></span></>}
      {(p.sample || l.sample) && <span className="lc-sample">{p.sample && className === 'lc-photo' ? s.samplePic : s.sample}</span>}
    </span>
  );
}

const typePlace = (l: Listing, s: ListingStrings) => [typeLabel(s, l.type), placeName(l)].filter(Boolean).join(' · ');

// ---------- list ----------
export function PropertyListing({ lang, go, initial }: { lang: Lang; go: Go; initial?: Filters }) {
  const { state, store } = useApp();
  const s = listingStrings[lang];
  const listings = state.properties;
  const layout: Layout = state.settings.layout === 'large' ? 'large' : 'grid';
  const setLayout = (x: Layout) => store.setSingleton('settings', { layout: x });
  const [f, setF] = useState<Filters>(initial ?? {});
  const [open, setOpen] = useState(false);
  const [voice, setVoice] = useState(false);
  const shown = useMemo(() => applyFilters(listings, f), [listings, f]);
  const n = activeCount(f);
  const set = (patch: Partial<Filters>) => setF(prev => ({ ...prev, ...patch }));
  const ownerName = (l: Listing) => state.contacts.find(c => c.id === l.vendorId)?.name ?? l.ownerName;

  function onFind(c: Extract<Command, { kind: 'find' }>): number {
    const next: Filters = { type: c.type, typeWord: c.typeWord, location: c.area, purpose: c.purpose };
    setF(next);
    return applyFilters(listings, next).length;
  }

  return (
    <section className="stack listing" data-testid="listing">
      <button className="btn primary add-property" onClick={() => go({ name: 'listingForm' })}><span aria-hidden="true">＋</span> {s.add}</button>
      <div className="lc-toolbar">
        <input aria-label={s.f.location} placeholder={s.search} value={f.location ?? ''} onChange={e => set({ location: e.target.value || undefined })} />
        <button className="btn secondary" aria-expanded={open} onClick={() => setOpen(o => !o)}>{s.filters}{n ? ` · ${n}` : ''}</button>
      </div>
      <div className="lc-tools">
        <div className="seg" role="group" aria-label={s.layout}>
          <button aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')} aria-label={s.grid}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">{[2, 8, 14].flatMap(x => [2, 8, 14].map(y => <rect key={`${x}${y}`} x={x} y={y} width="4.5" height="4.5" rx="1" fill="currentColor" />))}</svg>
            <span>{s.grid}</span>
          </button>
          <button aria-pressed={layout === 'large'} onClick={() => setLayout('large')} aria-label={s.large}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20"><rect x="2" y="2" width="16" height="7" rx="1.5" fill="currentColor" /><rect x="2" y="11" width="16" height="7" rx="1.5" fill="currentColor" /></svg>
            <span>{s.large}</span>
          </button>
        </div>
        <button className="btn secondary voice-btn" aria-expanded={voice} onClick={() => setVoice(v => !v)}><IconMic size={20} /> {s.voice.open}</button>
      </div>

      {voice && <PropertyVoice lang={lang} mode="list" onFind={onFind}
        onCreate={changes => go({ name: 'listingForm', prefill: prefillFrom(changes) })} />}

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
                <option value="">{s.any}</option>{TYPES.map(x => <option key={x} value={x}>{typeLabel(s, x)}</option>)}
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
            <label className="ff">{s.min}<MoneyInput aria-label={`${s.f.price} ${s.min}`} value={f.priceMin} onChange={n => set({ priceMin: n })} /></label>
            <label className="ff">{s.max}<MoneyInput aria-label={`${s.f.price} ${s.max}`} value={f.priceMax} onChange={n => set({ priceMax: n })} /></label>
          </div>
          <div className="two">
            <button className="btn secondary" onClick={() => setF({})} disabled={!n}>{s.clear}</button>
            <button className="btn primary" onClick={() => setOpen(false)}>{s.show(shown.length)}</button>
          </div>
        </div>
      )}

      <div className="small muted" data-testid="listing-count">{s.results(shown.length, listings.length)}</div>
      {listings.length === 0 ? <p className="muted empty" data-testid="listing-empty">{s.empty}</p> : shown.length === 0 && <p className="muted">{s.none}</p>}

      {layout === 'grid' ? (
        <ul className="lc-grid" data-layout="grid">
          {shown.map(l => (
            <li key={l.id} data-testid="listing-card">
              <button className="gc" onClick={() => go({ name: 'listingDetail', id: l.id })} aria-label={`${s.open}: ${cardTitle(l) || s.untitled}`}>
                <CardPhoto l={l} s={s} className="gc-photo" />
                <span className="gc-price"><PriceLine l={l} s={s} short /></span>
                <span className="gc-title">{cardTitle(l) || s.untitled}</span>
                <span className="gc-meta">{placeName(l) || typeLabel(s, l.type) || '—'}</span>
                <span className="gc-meta gc-st">{l.status ? <><span className={`gc-dot st-${l.status}`} aria-hidden="true" />{s.status[l.status]}</> : '—'}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="lc-list" data-layout="large">
          {shown.map(l => (
            <li key={l.id} className="lc-card" data-testid="listing-card">
              <CardPhoto l={l} s={s} className="lc-photo" />
              <div className="lc-body">
                <div className="lc-title">{cardTitle(l) || s.untitled}</div>
                <div className="lc-type">{typePlace(l, s) || '—'}</div>
                <strong className="lc-price"><PriceLine l={l} s={s} /></strong>
                <Facts l={l} s={s} />
                <div className="lc-meta">
                  {[availabilityText(l, s, lang), l.tenure && s.tenure[l.tenure] + (yearsRemaining(l) !== undefined ? ` · ${s.yearsLeft(yearsRemaining(l)!)}` : '')].filter(Boolean).join(' · ') || '—'}
                </div>
                <div className="between lc-foot">
                  <span className="lc-owner">{ownerName(l) ? `${s.owner}: ${ownerName(l)}` : ''}</span>
                  <button className="btn small primary" onClick={() => go({ name: 'listingDetail', id: l.id })} aria-label={`${s.open}: ${cardTitle(l) || s.untitled}`}>{s.open}</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button className="fab" onClick={() => go({ name: 'listingForm' })} aria-label={s.add}><span aria-hidden="true">+</span> {s.add}</button>
    </section>
  );
}

/** Turns reviewed voice details into starting values for the property form, marked "from your words". */
export function prefillFrom(changes: Change[]): Partial<Listing> {
  const p: Record<string, unknown> = { filledFrom: {} };
  for (const c of changes) {
    if (c.key.startsWith('tenancy.')) { p.tenancy = { ...(p.tenancy as object ?? {}), [c.key.slice(8)]: c.value }; continue; }
    p[c.key] = c.value;
    (p.filledFrom as Record<string, string>)[c.key] = 'words';
  }
  return p as Partial<Listing>;
}

// ---------- property detail page ----------
export function ListingDetails({ lang, id, go }: { lang: Lang; id: string; go: Go }) {
  const { state, store } = useApp();
  const s = listingStrings[lang];
  const l = state.properties.find(x => x.id === id);
  const [photoId, setPhotoId] = useState<string | undefined>(undefined);
  const [voice, setVoice] = useState(false);
  if (!l) return <p className="muted">{s.none}</p>;
  const shownPhoto = l.photos.find(p => p.id === photoId) ?? mainPhoto(l)!;
  const yrs = yearsRemaining(l);
  const comm = commissionRm(l);
  const vf = fieldsFor(l.type);
  const vendor = state.contacts.find(v => v.id === l.vendorId);
  const owner = vendor?.name ?? l.ownerName;
  const phone = vendor?.phone ?? l.ownerPhone;
  const missing = missingDetails(l);
  const edit = (section: FormSection) => () => go({ name: 'listingForm', id: l.id, section });
  const row = (k: string, v?: string | number) => (v === undefined || v === '' ? null : <div key={k} className="dl-row"><dt>{s.l[k] ?? k}</dt><dd>{v}</dd></div>);
  const numRow = (k: keyof Listing, fmt: (n: number) => string = String) => (l[k] === undefined ? null : row(k, fmt(l[k] as number)));
  const depositRm = l.monthlyRent !== undefined ? l.monthlyRent * ((l.securityDepositMonths ?? 0) + (l.utilityDepositMonths ?? 0)) : undefined;
  const docs = l.documents ?? [];
  const fieldDefs = (state.options['marketingFields'] ?? []).map(o => ({ id: o.value, label: o.value }));
  const custom = fieldDefs.filter(d => l.marketing?.custom?.[d.id]);
  const EL = s.edit;
  const empty = <small className="muted">{s.notSet}</small>;
  const hasAny = (...xs: unknown[]) => xs.some(x => x !== undefined && x !== '');

  return (
    <section className="stack listing" data-testid="listing-details">
      {!l.sample && <RecordStatus lang={lang} collection="properties" id={l.id} go={go} />}
      <div className="lc-card">
        <span className="lc-photo tall">
          <StoredImage fileId={shownPhoto.fileId} url={shownPhoto.url} />
          <span className="lc-shade" /><span className="lc-badges"><Badges l={l} s={s} /></span>
          {shownPhoto.sample && <span className="lc-sample">{s.samplePic}</span>}
        </span>
        {l.photos.length > 1 && (
          <div className="thumbs">{l.photos.map(p => <button key={p.id} className={p.id === shownPhoto.id ? 'on' : ''} onClick={() => setPhotoId(p.id)} aria-label={p.name}><StoredImage fileId={p.fileId} url={p.url} /></button>)}</div>
        )}
        <div className="lc-body">
          <div className="lc-title big">{cardTitle(l) || s.untitled}</div>
          <div className="lc-type">{typePlace(l, s)}</div>
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
        <button className="btn primary" onClick={() => go({ name: 'listingForm', id: l.id })}>{s.edit}</button>
        <button className="btn secondary" aria-expanded={voice} onClick={() => setVoice(v => !v)}><IconMic size={20} /> {s.voice.open}</button>
        {phone && <a className="btn secondary" href={`tel:+${phoneDigits(phone)}`}>{s.call}</a>}
        {phone && <a className="btn secondary" href={`https://wa.me/${phoneDigits(phone)}`} target="_blank" rel="noreferrer">{s.whatsapp}</a>}
      </div>

      {voice && <PropertyVoice lang={lang} mode="record" listing={l}
        onApply={changes => {
          const next = applyChanges(l, changes);
          store.upsert('properties', { ...next, history: [{ at: Date.now(), source: 'voice', summary: changes.map(x => x.key).join(', ') }, ...(l.history ?? [])] });
        }} />}

      <SectionCard title={s.sec.missing} className={missing.length ? 'missing' : ''} testId="missing" onEdit={edit(missing.includes('lat') && missing.length === 1 ? 'location' : 'basics')} editLabel={EL}>
        {missing.length ? <div className="lc-facts">{missing.map(k => <span key={k}>{s.l[k] ?? k}</span>)}</div> : <small className="ok-text">{s.missingNone}</small>}
      </SectionCard>

      <SectionCard title={s.sec.basics} onEdit={edit('basics')} editLabel={EL} testId="sec-basics">
        <dl className="dl">
          <div className="dl-row" data-testid="ref-row"><dt>{s.l.ref}</dt><dd className="ref-text">{l.ref || <span className="muted">{s.notSet}</span>}</dd></div>
          {row('type', typeLabel(s, l.type))}{row('headline', l.headline)}{row('purpose', l.purpose && s.purpose[l.purpose])}
        </dl>
      </SectionCard>

      <SectionCard title={s.sec.tenure} onEdit={edit('tenure')} editLabel={EL} testId="sec-tenure-view">
        {hasAny(l.tenure, l.titleType, l.landUse, l.restriction) ? (
          <dl className="dl">{row('tenure', l.tenure && s.tenure[l.tenure])}{row('leaseExpiryYear', l.leaseExpiryYear)}
            {yrs !== undefined && <div className="dl-row"><dt /><dd className="ok-text">{s.yearsLeft(yrs)}</dd></div>}
            {row('titleType', l.titleType && (s.titleTypes[l.titleType] ?? l.titleType))}{row('landUse', l.landUse && s.landUse[l.landUse])}{row('restriction', l.restriction && (s.restrictions[l.restriction] ?? l.restriction))}</dl>
        ) : empty}
      </SectionCard>

      <SectionCard title={s.sec.photos} onEdit={edit('photos')} editLabel={EL} testId="sec-photos-view">
        {l.photos.length ? <div className="photo-strip">{l.photos.map(p => <button key={p.id} onClick={() => setPhotoId(p.id)} aria-label={p.name}><StoredImage fileId={p.fileId} url={p.url} /></button>)}</div> : empty}
      </SectionCard>

      <SectionCard title={s.sec.location} onEdit={edit('location')} editLabel={EL} testId="sec-location-view">
        <dl className="dl">
          {row('country', l.country && (s.countries[l.country] ?? l.country))}{row('state', l.state)}{row('city', l.city)}{row('township', l.township)}
          {row('lotNo', l.lotNo)}{row('street', l.street)}{row('unitNo', l.unitNo)}
          {hasPosition(l) && row('lat', `${s.position(l.lat!.toFixed(5), l.lng!.toFixed(5))}${l.geoSource ? ` (${s.geoSource[l.geoSource]})` : ''}`)}
        </dl>
        {hasPosition(l) ? (
          <div className="two">
            <a className="btn secondary" href={navigationUrl({ lat: l.lat!, lng: l.lng! })} target="_blank" rel="noreferrer">{s.navigate}</a>
            <button className="btn secondary" onClick={() => go({ name: 'propertyMap', id: l.id })}>{s.onMap}</button>
          </div>
        ) : <small className="muted">{s.noPosition}</small>}
      </SectionCard>

      <SectionCard title={s.sec.details} onEdit={edit('details')} editLabel={EL}>
        {hasAny(l.unitNo, l.landSqft, l.builtUpSqft, l.frontageFt, l.depthFt, l.bedrooms, l.bathrooms, l.floors, l.parking, l.lotType, l.furnishing) ? (
          <dl className="dl">
            {numRow('landSqft', landText)}{numRow('builtUpSqft', sqft)}
            {l.frontageFt !== undefined || l.depthFt !== undefined ? row('frontageFt', `${l.frontageFt ?? '?'} ft × ${l.depthFt ?? '?'} ft`) : null}
            {numRow('bedrooms')}{numRow('bathrooms')}{numRow('floors')}{numRow('parking')}
            {row('lotType', l.lotType && s.lotType[l.lotType])}{row('furnishing', l.furnishing && s.furnishing[l.furnishing])}
          </dl>
        ) : empty}
      </SectionCard>

      {(vf.has('ceilingFt') || vf.has('zoning') || vf.has('currentUse') || vf.has('specs')) && (
        <SectionCard title={vf.has('ceilingFt') ? s.sec.building : vf.has('specs') ? s.sec.building : s.sec.land} onEdit={edit('specs')} editLabel={EL}>
          {hasAny(l.ceilingFt, l.powerKva, l.loadingBays, l.specs, l.zoning, l.approvals, l.currentUse, l.roadAccess) ? (
            <dl className="dl">
              {numRow('ceilingFt', x => `${x} ft`)}{numRow('powerKva', x => `${x} kVA`)}{numRow('loadingBays')}{row('specs', l.specs)}
              {row('zoning', l.zoning)}{row('approvals', l.approvals)}{row('currentUse', l.currentUse)}{row('roadAccess', l.roadAccess)}
            </dl>
          ) : empty}
        </SectionCard>
      )}

      <SectionCard title={s.sec.money} onEdit={edit('money')} editLabel={EL}>
        <dl className="dl">
          {forSale(l) && <>{numRow('askingPrice', rm)}{row('negotiable', l.negotiable && s.negotiable[l.negotiable])}{row('commissionPct', l.commissionPct !== undefined ? `${l.commissionPct}%` : undefined)}</>}
          {forRent(l) && <>{numRow('monthlyRent', rm)}{numRow('securityDepositMonths', s.months)}{numRow('utilityDepositMonths', s.months)}</>}
          {numRow('maintenanceFee', rm)}
        </dl>
        {comm !== undefined && forSale(l) && <small className="muted">{s.commission(rm(comm))}</small>}
        {forRent(l) && depositRm ? <small className="muted">{s.depositRm(rm(depositRm))}</small> : null}
        {(l.askingPrice !== undefined || l.monthlyRent !== undefined) && <button className="btn small secondary" onClick={() => go({ name: 'calculator', propertyId: l.id })}>{s.calculate}</button>}
      </SectionCard>

      {(forRent(l) || l.availability === 'tenanted' || l.tenancy) && (
        <SectionCard title={s.sec.tenancy} onEdit={edit('tenancy')} editLabel={EL} testId="tenancy">
          {l.tenancy && Object.keys(l.tenancy).length ? (
            <dl className="dl">{row('tenant', l.tenancy.tenant)}{row('tStart', monthText(l.tenancy.start, lang))}{row('tEnd', monthText(l.tenancy.end, lang))}
              {row('tRent', l.tenancy.rent !== undefined ? rm(l.tenancy.rent) : undefined)}{row('tNotes', l.tenancy.notes)}</dl>
          ) : empty}
        </SectionCard>
      )}

      <SectionCard title={s.sec.availability} onEdit={edit('availability')} editLabel={EL}>
        {hasAny(l.availability, l.condition, l.features) ? (
          <dl className="dl">{row('availability', availabilityText(l, s, lang))}{row('condition', l.condition && s.condition[l.condition])}{row('features', l.features)}</dl>
        ) : empty}
      </SectionCard>

      <SectionCard title={s.sec.owner} onEdit={edit('owner')} editLabel={EL}>
        {owner ? <dl className="dl">{row('ownerName', owner)}{row('ownerPhone', phone)}</dl> : empty}
        {vendor && <button className="btn small ghost" onClick={() => go({ name: 'contactDetail', id: vendor.id })}>{s.vendorLinked} →</button>}
      </SectionCard>

      <SectionCard title={s.sec.arrangement} onEdit={edit('arrangement')} editLabel={EL}>
        <dl className="dl">
          {row('status', l.status && s.status[l.status])}{l.status === 'in_progress' ? row('handledBy', l.handledBy) : null}
          {row('arrangement', l.arrangement && s.arrangement[l.arrangement])}{row('arrangementNote', l.arrangementNote)}
        </dl>
        {!hasAny(l.status, l.arrangement) && empty}
      </SectionCard>

      <SectionCard title={s.sec.banner} onEdit={edit('banner')} editLabel={EL} testId="sec-banner-view">
        {(() => {
          const up = activeBanners(state.banners, l.id);
          return (
            <>
              <div className="between"><span>{s.bannerQ}</span><BannerDot status={l.bannerStatus} lang={lang} /></div>
              {up.length > 0 && <small className="muted" data-testid="banner-summary">{s.bannerUp(up.length)} · {s.bannerLast(fmtDate(up[0].placedOn, lang))}</small>}
              <button className="btn small secondary" onClick={() => go({ name: 'banners', propertyId: l.id })} data-testid="open-banners">🪧 {s.bannerOpen}</button>
            </>
          );
        })()}
      </SectionCard>

      <SectionCard title={s.sec.marketing} onEdit={edit('marketing')} editLabel={EL} testId="marketing">
        <dl className="dl">
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
        {!l.marketing?.advertised && !(l.marketing?.ads ?? []).length && empty}
      </SectionCard>

      <SectionCard title={s.sec.notes} onEdit={edit('notes')} editLabel={EL}>
        {l.notes ? <p className="pre">{l.notes}</p> : empty}
      </SectionCard>

      <SectionCard title={s.sec.docs} onEdit={edit('docs')} editLabel={EL} testId="docs">
        <div className="doc-sum">
          {DOC_CATEGORIES.map(cat => <div key={cat}><span>{s.docCat[cat]}{CONFIDENTIAL_DOCS.includes(cat) ? ' 🔒' : ''}</span><strong>{docs.filter(d => d.category === cat).length}</strong></div>)}
        </div>
        {docs.map(d => <DocRow key={d.id} d={d} s={s} lang={lang} />)}
      </SectionCard>

      <InquiryHistory lang={lang} go={go} propertyId={l.id} />
      <ViewingHistory lang={lang} go={go} propertyId={l.id} />

      {(l.history ?? []).length > 0 && (
        <div className="card stack-sm" data-testid="history"><div className="card-title">{s.sec.history}</div>
          {l.history!.slice(0, 20).map((h, i) => <small key={i} className="muted">{new Date(h.at).toLocaleString(lang === 'zh' ? 'zh-CN' : lang === 'bm' ? 'ms-MY' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })} · {s.historyItem[h.source] ?? h.source}{h.summary ? ` (${h.summary})` : ''}</small>)}
        </div>
      )}
    </section>
  );
}

function DocRow({ d, s, lang }: { d: Doc; s: ListingStrings; lang: Lang }) {
  const store = useStore();
  return (
    <div className="doc-row"><span>{d.name}</span>
      {d.fileId
        ? <button className="btn small secondary" onClick={() => void store.fileUrl(d.fileId!).then(u => { if (u) window.open(u, '_blank'); })}>{s.open1}</button>
        : <small className="muted">{s.sample}</small>}
      <FileBadge lang={lang} fileId={d.fileId} />
    </div>
  );
}
