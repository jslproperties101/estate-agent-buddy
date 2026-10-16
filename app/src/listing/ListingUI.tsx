// Property List: Grid view (default, first) and Large cards, filters, and the property detail page.
// Cards hide the reference number; the detail page shows it. Every detail section has its own Edit button that
// opens the form straight at that section.
// Change 008/009 (owner, Oct 2026): a card opens with a single tap. There is no long press, no Preview button or eye icon
// and no preview sheet; Delete is on the detail page (red, with confirmation). Cards are titled by the address, never by
// the marketing headline. The list has one Add New Property button at the top (no floating copy) and no voice button.
// Verification is shown by the colour of a value: Confirmed green, Owner stated blue, Need to check / Unknown red; a value
// with no mark counts as Need to check.
import { ReactNode, useMemo, useState } from 'react';
import { RecordStatus, FileBadge } from '../sync/SyncUI';
import { BannerDot } from '../gps/BannersUI';
import { activeBanners } from '../domain/banners';
import { MoneyInput } from '../ui/MoneyInput';
import { Lang } from '../i18n';
import { listingStrings, ListingStrings, typeLabel } from './strings';
import {
  Listing, Filters, applyFilters, activeCount, TYPES, TENURES, LOT_TYPES, STATUSES, CATEGORIES,
  rm, rmShort, sqft, landText, yearsRemaining, cardTitle, mainPhoto, commissionRm, rentCommissionRm, forRent, forSale, fieldsFor,
  CONFIDENTIAL_DOCS, DOC_CATEGORIES, hasPosition, phoneDigits, usablePhone, Doc, orderedPhotos, unitLot, restrictionValue,
} from './model';
import { shownState, VerifyState } from './verify';
import { Change } from './commands';
import { adStrings } from '../adverts/strings';
import { photoStrings } from '../photos/strings';
import { marketingStrings } from '../marketing/strings';
import { FakeBadge } from '../adverts/AdTrackerUI';
import { PropertyBuyersCard } from '../contacts/MatchUI';
import { buyerStrings } from './buyerPdf';
import { useApp, useStore } from '../data/useStore';
import { Go, FormSection } from '../nav';
import { SectionCard, StoredImage, Confirm } from '../ui/common';
import { deleteListing } from './deleteListing';
import { monthText, fmtDate } from '../lib/dates';
import { navigationUrl } from '../lib/geo';
import { visible, can, myId } from '../team/access';
import { WorkspaceSwitch, CreatorTag, SharingLine } from '../team/TeamUI';
import { ViewHistory } from '../audit/AuditUI';
import { teamStrings } from '../team/strings';
import { requestDelete, teamErrorOf } from '../team/api';
import { config } from '../config';
import { useToast } from '../ui/toast';
import { fmtDateTime } from '../lib/dates';
import { c11Strings } from '../ui/c011Strings';
import { FeedAd, withFeedAds } from '../adverts/AdBar';
import { c15Strings } from '../ui/c015Strings';
import { IconGear } from '../icons';
import { transactionLabels, specLines, checkAndMissing } from './change015';

export type Layout = 'grid' | 'large';

const VGLYPH: Record<VerifyState, string> = { confirmed: '✓', owner: '☎', check: '⚠', unknown: '?' };
/** The verification state of one detail, as a word plus a symbol (never colour alone): used in the full detail view. */
export function VerifyChip({ state, s }: { state?: VerifyState; s: ListingStrings }) {
  if (!state) return null;
  return <span className={`vchip vchip-${state}`} data-verify-state={state}><span aria-hidden="true">{VGLYPH[state]}</span> {s.verify[state]}</span>;
}
/** A value written in its verification colour (Change 009). On cards this colour is the only sign, as the owner asked;
 *  the full detail view adds the word as well. */
export function VVal({ l, k, children }: { l: Listing; k: string; children: ReactNode }) {
  const st = shownState(l, k);
  return <span className={st ? `vval vc-${st}` : 'vval'} data-verify={st} data-vkey={k}>{children}</span>;
}

export function PriceLine({ l, s, short }: { l: Listing; s: ListingStrings; short?: boolean }) {
  const money = short ? rmShort : rm;
  const sale = forSale(l) && l.askingPrice !== undefined ? <VVal l={l} k="askingPrice">{money(l.askingPrice)}</VVal> : null;
  const rent = forRent(l) && l.monthlyRent !== undefined ? <VVal l={l} k="monthlyRent">{`${money(l.monthlyRent)} ${s.perMonth}`}</VVal> : null;
  if (!sale && !rent) return <span className="muted no-price">{s.noPrice}</span>;
  if (short) return <>{sale ?? rent}</>;
  return <>{sale}{sale && rent ? ' · ' : null}{rent}</>;
}

function availabilityText(l: Listing, s: ListingStrings, lang: Lang): string | undefined {
  if (!l.availability) return undefined;
  if (l.availability === 'from_date' && l.availableFrom) return s.availableFrom(monthText(l.availableFrom, lang));
  if (l.availability === 'tenanted' && l.tenancy?.end) return s.tenantedUntil(monthText(l.tenancy.end, lang));
  return s.availability[l.availability];
}

/** Tenure together with the restriction, then storeys and lot type (Change 009). Each value in its check colour. */
function TenureLine({ l, s, noStoreys }: { l: Listing; s: ListingStrings; noStoreys?: boolean }) {
  // Written with spans only, so it can sit inside the card's tap area (a button).
  const yrs = yearsRemaining(l);
  const r = restrictionValue(l.restriction);
  const parts: JSX.Element[] = [];
  if (l.tenure) parts.push(<VVal key="tenure" l={l} k="tenure">{s.tenure[l.tenure] + (yrs !== undefined ? ` · ${s.yearsLeft(yrs)}` : '')}</VVal>);
  if (r) parts.push(<VVal key="restriction" l={l} k="restriction">{s.restrictions[r] ?? r}</VVal>);
  const more: JSX.Element[] = [];
  // Change 015: on Subsale List cards storeys and lot type are in the specification lines instead.
  if (!noStoreys && l.floors !== undefined) more.push(<VVal key="floors" l={l} k="floors">{`${l.floors} ${s.l.floors}`}</VVal>);
  if (!noStoreys && l.lotType) more.push(<span key="lotType">{s.lotType[l.lotType]}</span>);
  if (!parts.length && !more.length) return null;
  return (
    <span className="lc-tenure" data-testid="card-tenure">
      {parts.length > 0 && <span className="lc-line">{parts.map((x, i) => <span key={i}>{i > 0 && ' · '}{x}</span>)}</span>}
      {more.length > 0 && <span className="lc-line muted-2" data-testid="card-storeys">{more.map((x, i) => <span key={i}>{i > 0 && ' · '}{x}</span>)}</span>}
    </span>
  );
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

const typeOnly = (l: Listing, s: ListingStrings) => typeLabel(s, l.type);

// ---------- list ----------
export function PropertyListing({ lang, go, initial }: { lang: Lang; go: Go; initial?: Filters }) {
  const { state, store } = useApp();
  const s = listingStrings[lang];
  const ts = teamStrings[lang];
  // Change 010: only the workspace being looked at (Personal or Team); archived properties go to their own section at the end.
  const inWorkspace = visible(state, 'properties', state.properties);
  const listings = inWorkspace.filter(l => !l.archived);
  const archivedList = inWorkspace.filter(l => l.archived).sort((a, b) => (b.archived?.at ?? 0) - (a.archived?.at ?? 0));
  const layout: Layout = state.settings.layout === 'large' ? 'large' : 'grid';
  const setLayout = (x: Layout) => store.setSingleton('settings', { layout: x });
  const [f, setF] = useState<Filters>(initial ?? {});
  const [open, setOpen] = useState(false);
  const shown = useMemo(() => applyFilters(listings, f), [listings, f]);
  const n = activeCount(f);
  const set = (patch: Partial<Filters>) => setF(prev => ({ ...prev, ...patch }));
  const ownerName = (l: Listing) => state.contacts.find(c => c.id === l.vendorId)?.name ?? l.ownerName;
  const openIt = (l: Listing) => go({ name: 'listingDetail', id: l.id });
  const c11 = c11Strings[lang];
  const toast = useToast();
  // Change 015: the card has no Delete or Open buttons any more. The card itself opens the property; the gold gear opens
  // its form. Delete stays on the property page (the same recoverable archive, Change 010); Restore stays below.
  const editIt = (l: Listing) => {
    const now = store.getState();
    if (can(now, 'edit', 'properties', l.id) && !now.properties.find(x => x.id === l.id)?.archived) go({ name: 'listingForm', id: l.id }); else toast(ts.notAllowed, 'error');
  };
  function restore(l: Listing) {
    const now = store.getState();
    const cur = now.properties.find(x => x.id === l.id);
    if (!cur || !can(now, 'restore', 'properties', cur.id)) { toast(ts.notAllowed, 'error'); return; }
    store.upsert('properties', { ...cur, archived: undefined }, false, 'restore');
    toast(c11.card.restored);
  }

  return (
    <section className="stack listing" data-testid="listing">
      <WorkspaceSwitch lang={lang} />
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
      </div>

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

      <ul className={layout === 'grid' ? 'lc-grid sc-list' : 'lc-list sc-list'} data-layout={layout}>
        {withFeedAds(shown).map(x => x.kind === 'ad' ? <li key={`ad-${x.n}`} className="feed-ad-cell"><FeedAd lang={lang} n={x.n} /></li> : (
          <SubsaleCard key={x.item.id} l={x.item} lang={lang} large={layout === 'large'} owner={ownerName(x.item)}
            onOpen={() => openIt(x.item)} onEdit={() => editIt(x.item)} />
        ))}
      </ul>

      {archivedList.length > 0 && (
        <details className="card stack-sm archived-section" data-testid="archived-section">
          <summary><strong>{ts.archivedN(archivedList.length)}</strong></summary>
          <small className="muted">{ts.archivedHelp}</small>
          <ul className="archived-list">
            {archivedList.map(l => (
              <li key={l.id} data-testid="archived-card" className="archived-item">
                <button className="link-row" onClick={() => openIt(l)}>
                  <strong>{cardTitle(l) || s.untitled}</strong>
                  <small className="muted">{ts.archivedOn(fmtDateTime(l.archived!.at, lang))}</small>
                  <CreatorTag state={state} collection="properties" id={l.id} />
                </button>
                {can(state, 'restore', 'properties', l.id) && <div className="btn-row"><button type="button" className="btn small primary" data-testid="archived-restore" onClick={() => restore(l)}>{c11.card.restore}</button></div>}
              </li>
            ))}
          </ul>
        </details>
      )}
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
  const [askDelete, setAskDelete] = useState(false);
  const [askPermanent, setAskPermanent] = useState(false);
  const [askRequest, setAskRequest] = useState(false);
  const toast = useToast();
  const ts = teamStrings[lang];
  if (!l) return <p className="muted">{s.none}</p>;
  // Change 010: what I may do with this record right now (asked again when a button is pressed).
  const canEdit = can(state, 'edit', 'properties', l.id);
  const photos = orderedPhotos(l);
  const shownPhoto = photos.find(p => p.id === photoId) ?? mainPhoto(l)!;
  const yrs = yearsRemaining(l);
  const comm = commissionRm(l);
  const rentComm = rentCommissionRm(l);
  const vf = fieldsFor(l.type);
  const vendor = state.contacts.find(v => v.id === l.vendorId);
  const owner = vendor?.name ?? l.ownerName;
  const phone = vendor?.phone ?? l.ownerPhone;
  const whatsapp = vendor?.whatsapp ?? l.ownerWhatsapp;
  const { check: unsure, missing } = checkAndMissing(l);
  const edit = (section: FormSection) => (canEdit && !l.archived ? () => go({ name: 'listingForm', id: l.id, section }) : undefined);
  const guarded = (action: Parameters<typeof can>[1], f: () => void) => () => { if (can(store.getState(), action, 'properties', l.id)) f(); else toast(ts.notAllowed, 'error'); };
  const vs = (k: string) => shownState(l, k);
  // A detail: its value in the check colour plus the check word (the full view always says it in words too).
  const row = (k: string, v?: string | number) => (v === undefined || v === '' ? null : (
    <div key={k} className="dl-row" data-row={k}><dt>{s.l[k] ?? k}</dt><dd><VVal l={l} k={k}>{v}</VVal>{vs(k) && <> <VerifyChip state={vs(k)} s={s} /></>}</dd></div>
  ));
  const callable = usablePhone(phone);
  const numRow = (k: keyof Listing, fmt: (n: number) => string = String) => (l[k] === undefined ? null : row(k, fmt(l[k] as number)));
  const depositRm = l.monthlyRent !== undefined ? l.monthlyRent * ((l.securityDepositMonths ?? 0) + (l.utilityDepositMonths ?? 0)) : undefined;
  const docs = l.documents ?? [];
  const fieldDefs = (state.options['marketingFields'] ?? []).map(o => ({ id: o.value, label: o.value }));
  const custom = fieldDefs.filter(d => l.marketing?.custom?.[d.id]);
  const EL = s.edit;
  const empty = <small className="muted">{s.notSet}</small>;
  const hasAny = (...xs: unknown[]) => xs.some(x => x !== undefined && x !== '');
  const restriction = restrictionValue(l.restriction);
  const specsCard = (vf.has('ceilingFt') || vf.has('zoning') || vf.has('currentUse') || vf.has('specs')) && (
    <SectionCard title={vf.has('ceilingFt') ? s.sec.building : vf.has('specs') ? s.sec.building : s.sec.land} onEdit={edit('specs')} editLabel={EL}>
      {hasAny(l.ceilingFt, l.powerKva, l.loadingBays, l.specs, l.zoning, l.approvals, l.currentUse, l.roadAccess) ? (
        <dl className="dl">
          {numRow('ceilingFt', x => `${x} ft`)}{numRow('powerKva', x => `${x} kVA`)}{numRow('loadingBays')}{row('specs', l.specs)}
          {row('zoning', l.zoning)}{row('approvals', l.approvals)}{row('currentUse', l.currentUse)}{row('roadAccess', l.roadAccess)}
        </dl>
      ) : empty}
    </SectionCard>
  );

  return (
    <section className="stack listing" data-testid="listing-details">
      {!l.sample && <RecordStatus lang={lang} collection="properties" id={l.id} go={go} />}
      <SharingLine lang={lang} collection="properties" id={l.id} go={go} />
      {l.archived && (
        <div className="card stack-sm archived-banner" data-testid="archived-banner">
          <strong>{ts.archived}</strong><small className="muted">{ts.archivedOn(fmtDateTime(l.archived.at, lang))} · {ts.archivedHelp}</small>
          <div className="two">
            {can(state, 'restore', 'properties', l.id) && <button className="btn primary" data-testid="restore-archived" onClick={guarded('restore', () => { store.upsert('properties', { ...l, archived: undefined }, false, 'restore'); toast(ts.restored); })}>{ts.restore}</button>}
            {can(state, 'deletePermanent', 'properties', l.id) && <button className="btn danger" data-testid="delete-permanent" onClick={() => setAskPermanent(true)}>{ts.deletePermanent}</button>}
          </div>
        </div>
      )}
      <div className="lc-card">
        <span className="lc-photo tall">
          <StoredImage fileId={shownPhoto.fileId} url={shownPhoto.url} />
          <span className="lc-shade" /><span className="lc-badges"><Badges l={l} s={s} /></span>
          {shownPhoto.sample && <span className="lc-sample">{s.samplePic}</span>}
        </span>
        {photos.length > 1 && (
          <div className="thumbs">{photos.map(p => <button key={p.id} className={p.id === shownPhoto.id ? 'on' : ''} onClick={() => setPhotoId(p.id)} aria-label={p.name}><StoredImage fileId={p.fileId} url={p.url} /></button>)}</div>
        )}
        <div className="lc-body">
          <div className="lc-title big" data-testid="detail-address">{cardTitle(l) || s.untitled}</div>
          {typeOnly(l, s) && <div className="lc-type">{typeOnly(l, s)}</div>}
          <strong className="lc-price big"><PriceLine l={l} s={s} /></strong>
          {l.negotiable && forSale(l) && <span className="badge fit">{s.negotiable[l.negotiable]}</span>}
          <div className="key-facts">
            {[
              ['landSqft', l.landSqft !== undefined ? landText(l.landSqft) : undefined],
              ['builtUpSqft', l.builtUpSqft !== undefined ? sqft(l.builtUpSqft) : undefined],
              ['bedrooms', l.bedrooms], ['bathrooms', l.bathrooms], ['parking', l.parking],
              ['tenure', l.tenure && s.tenure[l.tenure] + (yrs !== undefined ? ` · ${s.yearsLeft(yrs)}` : '')],
            ].filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => (
              <div key={k as string} className="kf"><span>{s.kf[k as string]}</span><strong data-testid={k === 'tenure' && yrs !== undefined ? 'years-left' : undefined}><VVal l={l} k={k as string}>{v as string}</VVal></strong></div>
            ))}
          </div>
          <TenureLine l={l} s={s} />
        </div>
      </div>

      <div className="rec-actions">
        {canEdit && !l.archived && <button className="btn primary" onClick={() => go({ name: 'listingForm', id: l.id })}>{s.edit}</button>}
        {/* Change 009: the voice button here became a red Delete, with confirmation. Change 010: Delete archives the
            property (recoverable); someone it is shared with as View and Edit asks the owner instead. */}
        {!l.archived && can(state, 'archive', 'properties', l.id) && <button className="btn danger" data-testid="detail-delete" onClick={() => setAskDelete(true)}>🗑 {s.n9.del}</button>}
        {!l.archived && can(state, 'requestDelete', 'properties', l.id) && <button className="btn danger" data-testid="request-delete" onClick={() => setAskRequest(true)}>🗑 {ts.requestDelete}</button>}
        <button className="btn secondary" onClick={() => go({ name: 'buyerPdf', propertyId: l.id })} data-testid="open-buyer-pdf">📄 {buyerStrings[lang].open}</button>
        <button className="btn secondary" onClick={() => go({ name: 'marketingStudio', propertyId: l.id })} data-testid="open-marketing-studio">🎨 {marketingStrings[lang].open}</button>
        {callable && <a className="btn secondary" href={`tel:+${phoneDigits(phone)}`}>{s.call}</a>}
        {callable && <a className="btn secondary" href={`https://wa.me/${phoneDigits(phone)}`} target="_blank" rel="noreferrer">{s.whatsapp}</a>}
      </div>
      {/* Change 012: one full-width Buyer's History button under the property's actions. */}
      <button className="btn primary full buyer-history-btn" onClick={() => go({ name: 'buyerHistory', propertyId: l.id })} data-testid="open-buyer-history">👥 {c11Strings[lang].history.button}</button>
      {phone && !callable && <p className="small warn-text" role="status" data-testid="phone-invalid">{s.phoneInvalid}</p>}
      {askDelete && <Confirm lang={lang} title={ts.archiveQ} body={`${cardTitle(l) || s.untitled} — ${ts.archiveBody}`}
        onCancel={() => setAskDelete(false)} onOk={guarded('archive', () => { store.upsert('properties', { ...l, archived: { at: Date.now(), by: myId(store.getState()) } }); setAskDelete(false); toast(ts.archivedToast); go({ name: 'listing' }, { replace: true }); })} />}
      {askPermanent && <Confirm lang={lang} title={ts.deletePermanentQ} body={`${cardTitle(l) || s.untitled} — ${ts.deletePermanentBody}`} okLabel={ts.deletePermanent}
        onCancel={() => setAskPermanent(false)} onOk={guarded('deletePermanent', () => { deleteListing(store, store.getState(), l); setAskPermanent(false); go({ name: 'listing' }, { replace: true }); })} />}
      {askRequest && <Confirm lang={lang} title={ts.requestDeleteQ} body={ts.requestDeleteBody} okLabel={ts.requestDelete}
        onCancel={() => setAskRequest(false)} onOk={() => { setAskRequest(false); void requestDelete(store, config(store.getState().settings), 'properties', l.id).then(() => toast(ts.requested), e => toast(ts.err[teamErrorOf(e).code] ?? ts.err.other, 'error')); }} />}

      <SectionCard title={s.sec.missing} className={missing.length ? 'missing' : ''} testId="missing" onEdit={edit(missing.includes('lat') && missing.length === 1 ? 'location' : 'basics')} editLabel={EL}>
        {/* Change 015: every field to check and every field not filled on its own row, never one long sentence. The same
            lists as the card's two counts (an empty field is "not filled" only); the Change 009 states are unchanged. */}
        {unsure.length > 0 && (
          <div className="stack-sm" data-testid="verify-summary" data-n={unsure.length}>
            <strong className="small">⚠ {c15Strings[lang].details.toCheckTitle(unsure.length)}</strong>
            <ul className="field-rows">{unsure.map(k => <li key={k} data-testid="to-check-row" data-key={k}><span>{s.l[k] ?? k}</span><VerifyChip state={vs(k)} s={s} /></li>)}</ul>
          </div>
        )}
        {missing.length > 0 && (
          <div className="stack-sm" data-testid="not-filled" data-n={missing.length}>
            <strong className="small">{c15Strings[lang].details.notFilledTitle(missing.length)}</strong>
            <ul className="field-rows">{missing.map(k => <li key={k} data-testid="not-filled-row" data-key={k}><span>{s.l[k] ?? k}</span></li>)}</ul>
          </div>
        )}
        {!missing.length && <small className="ok-text">{s.missingNone}</small>}
      </SectionCard>

      <SectionCard title={s.sec.basics} onEdit={edit('basics')} editLabel={EL} testId="sec-basics">
        <dl className="dl">
          <div className="dl-row" data-testid="ref-row"><dt>{s.l.ref}</dt><dd className="ref-text">{l.ref || <span className="muted">{s.notSet}</span>}</dd></div>
          {row('type', typeLabel(s, l.type))}{row('purpose', l.purpose && s.purpose[l.purpose])}
        </dl>
      </SectionCard>

      {/* Change 009: one section for price, commission, rent and deposits with tenure and title. */}
      <SectionCard title={s.sec.tenure} onEdit={edit('tenure')} editLabel={EL} testId="sec-tenure-view">
        {hasAny(l.askingPrice, l.monthlyRent, l.tenure, l.titleType, l.landUse, l.restriction, l.commissionPct, l.commissionFlat, l.rentCommissionMonths, l.rentCommissionFlat) ? (
          <dl className="dl">
            {forSale(l) && <>{numRow('askingPrice', rm)}{row('negotiable', l.negotiable && s.negotiable[l.negotiable])}
              {l.commissionType === 'flat' ? numRow('commissionFlat', rm) : row('commissionPct', l.commissionPct !== undefined ? `${l.commissionPct}%` : undefined)}</>}
            {forRent(l) && <>{numRow('monthlyRent', rm)}{l.rentCommissionType === 'flat' ? numRow('rentCommissionFlat', rm) : numRow('rentCommissionMonths', s.n9.rentMonths)}
              {numRow('securityDepositMonths', s.months)}{numRow('utilityDepositMonths', s.months)}</>}
            {row('tenure', l.tenure && s.tenure[l.tenure])}{row('leaseExpiryYear', l.leaseExpiryYear)}
            {yrs !== undefined && <div className="dl-row"><dt /><dd className="ok-text">{s.yearsLeft(yrs)}</dd></div>}
            {row('titleType', l.titleType && (s.titleTypes[l.titleType] ?? l.titleType))}{row('landUse', l.landUse && s.landUse[l.landUse])}{row('restriction', restriction && (s.restrictions[restriction] ?? restriction))}
          </dl>
        ) : empty}
        {comm !== undefined && <small className="muted" data-testid="detail-commission">{s.commission(rm(comm))}</small>}
        {rentComm !== undefined && <small className="muted" data-testid="detail-rent-commission">{s.n9.rentCommission(rm(rentComm))}</small>}
        {forRent(l) && depositRm ? <small className="muted">{s.depositRm(rm(depositRm))}</small> : null}
        {(l.askingPrice !== undefined || l.monthlyRent !== undefined) && <button className="btn small secondary" onClick={() => go({ name: 'calculator', propertyId: l.id })}>{s.calculate}</button>}
      </SectionCard>

      <SectionCard title={s.sec.photos} onEdit={edit('photos')} editLabel={EL} testId="sec-photos-view">
        {photos.length ? <div className="photo-strip">{photos.map(p => <button key={p.id} onClick={() => setPhotoId(p.id)} aria-label={p.name}><StoredImage fileId={p.fileId} url={p.url} /></button>)}</div> : empty}
        {photos.length > 0 && <button className="btn small secondary" onClick={() => go({ name: 'photoStudio', propertyId: l.id, photoId: shownPhoto.id })} data-testid="open-photo-studio">🖼️ {photoStrings[lang].open}</button>}
      </SectionCard>

      <SectionCard title={s.sec.location} onEdit={edit('location')} editLabel={EL} testId="sec-location-view">
        <dl className="dl">
          {/* Change 015: Country → State → City → Township → Neighborhood → Street → Unit Number or Lot Number. */}
          {row('country', l.country && (s.countries[l.country] ?? l.country))}{row('state', l.state)}{row('city', l.city)}{row('township', l.township)}
          {row('neighborhood', l.neighborhood)}{row('street', l.street)}{row('unitNo', unitLot(l))}
          {hasPosition(l) && <div className="dl-row" data-row="lat"><dt>{s.l.lat}</dt><dd className="ok-text" data-testid="location-saved">✓ {s.n9.locationSaved}{l.geoSource ? ` (${s.geoSource[l.geoSource]})` : ''}</dd></div>}
          {l.mapsLink && <div className="dl-row" data-row="mapsLink"><dt>{s.l.mapsLink}</dt><dd><a href={l.mapsLink} target="_blank" rel="noreferrer" data-testid="maps-link" className="break">{l.mapsLink}</a></dd></div>}
        </dl>
        {hasPosition(l) ? (
          <div className="two">
            <a className="btn secondary" href={navigationUrl({ lat: l.lat!, lng: l.lng! })} target="_blank" rel="noreferrer">{s.navigate}</a>
            <button className="btn secondary" onClick={() => go({ name: 'propertyMap', id: l.id })}>{s.onMap}</button>
          </div>
        ) : !l.mapsLink && <small className="muted">{s.n9.noLocation}</small>}
        {l.mapsLink && <a className="btn small secondary" href={l.mapsLink} target="_blank" rel="noreferrer">🗺 {s.n9.openMapsLink}</a>}
      </SectionCard>

      <SectionCard title={s.sec.details} onEdit={edit('details')} editLabel={EL} testId="sec-details-view">
        {hasAny(l.landSqft, l.builtUpSqft, l.frontageFt, l.depthFt, l.bedrooms, l.bathrooms, l.floors, l.parking, l.lotType, l.furnishing, l.maintenanceFee, l.extraComments) ? (
          <dl className="dl">
            {numRow('landSqft', landText)}{numRow('builtUpSqft', sqft)}
            {l.frontageFt !== undefined || l.depthFt !== undefined ? row('frontageFt', `${l.frontageFt ?? '?'} ft × ${l.depthFt ?? '?'} ft`) : null}
            {numRow('bedrooms')}{numRow('bathrooms')}{numRow('floors')}{numRow('parking')}
            {row('lotType', l.lotType && s.lotType[l.lotType])}{row('furnishing', l.furnishing && s.furnishing[l.furnishing])}
            {numRow('maintenanceFee', rm)}
          </dl>
        ) : empty}
        {l.extraComments && <div className="stack-sm" data-testid="detail-comments"><strong className="small">{s.l.extraComments}</strong><p className="pre">{l.extraComments}</p></div>}
      </SectionCard>

      {(forRent(l) || l.availability === 'tenanted' || l.tenancy) && (
        <SectionCard title={s.sec.tenancy} onEdit={edit('tenancy')} editLabel={EL} testId="tenancy">
          {l.tenancy && Object.keys(l.tenancy).length ? (
            <dl className="dl">{row('tenant', l.tenancy.tenant)}{row('tenantPhone', l.tenancy.tenantPhone)}{row('tenantWhatsapp', l.tenancy.tenantWhatsapp)}
              {row('tStart', monthText(l.tenancy.start, lang))}{row('tEnd', monthText(l.tenancy.end, lang))}
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
        {owner ? <dl className="dl">{row('ownerName', owner)}{row('ownerPhone', phone)}{row('ownerWhatsapp', whatsapp)}</dl> : empty}
        {vendor && <button className="btn small ghost" onClick={() => go({ name: 'contactDetail', id: vendor.id })}>{s.vendorLinked} →</button>}
      </SectionCard>

      {/* Change 009: Building specifications come after Owner / vendor. */}
      {specsCard}

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
          {row('headline', l.headline)}
          {row('advertised', l.marketing?.advertised && s.yesNo[l.marketing.advertised])}
          {custom.map(d => <div key={d.id} className="dl-row"><dt>{d.label}</dt><dd>{l.marketing!.custom[d.id]}</dd></div>)}
        </dl>
        {(l.marketing?.ads ?? []).map(a => (
          <div key={a.id} className="ad-row">
            <div className="between"><strong>{a.platform}{a.fake && <> <FakeBadge lang={lang} /></>}</strong>{a.status && <span className={`ad-st ad-${a.status}`}>{s.adStatus[a.status]}</span>}</div>
            <small className="muted">{[a.start && a.end ? `${a.start} → ${a.end}` : a.start, a.ref].filter(Boolean).join(' · ')}</small>
            {a.notes && <small>{a.notes}</small>}
          </div>
        ))}
        {!l.headline && !l.marketing?.advertised && !(l.marketing?.ads ?? []).length && empty}
        <button className="btn small secondary" onClick={() => go({ name: 'adTracker', propertyId: l.id })} data-testid="open-ad-tracker">📣 {adStrings[lang].open}</button>
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

      <PropertyBuyersCard lang={lang} p={l} go={go} />

      {(l.history ?? []).length > 0 && (
        <div className="card stack-sm" data-testid="history"><div className="card-title">{s.sec.history}</div>
          {l.history!.slice(0, 20).map((h, i) => <small key={i} className="muted">{new Date(h.at).toLocaleString(lang === 'zh' ? 'zh-CN' : lang === 'bm' ? 'ms-MY' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })} · {s.historyItem[h.source] ?? h.source}{h.summary ? ` (${h.summary})` : ''}</small>)}
        </div>
      )}
      {/* Change 010: View History, collapsed, always last. */}
      {!l.sample && <ViewHistory lang={lang} collection="properties" id={l.id} go={go} />}
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

/** The tap area of a grid card (photo, price, address, type, status). Also used by Buyer Matching. */
export function GridCardButton({ l, s, onOpen, extra }: { l: Listing; s: ListingStrings; onOpen: () => void; extra?: ReactNode }) {
  const { state } = useApp();
  return (
    <button className="gc" onClick={onOpen} aria-label={`${s.open}: ${cardTitle(l) || s.untitled}`}>
      <CardPhoto l={l} s={s} className="gc-photo" />
      <span className="gc-price"><PriceLine l={l} s={s} short /></span>
      <span className="gc-title" data-testid="card-address">{cardTitle(l) || s.untitled}</span>
      <span className="gc-meta">{typeOnly(l, s) || '—'}</span>
      <span className="gc-meta gc-st">{l.status ? <><span className={`gc-dot st-${l.status}`} aria-hidden="true" />{s.status[l.status]}</> : '—'}</span>
      {extra}
      <CreatorTag state={state} collection="properties" id={l.id} />
    </button>
  );
}

/** Change 015: one Subsale List card (Grid and Large). The whole card opens the property (one stretched button under the
 *  content); the small gold gear at the far right of the title row is a separate button that opens the form, so a tap on
 *  it never opens the card. Under the gear: FOR SALE and / or FOR RENT from the property's own purpose. On the photo:
 *  the status (green AVAILABLE) at the top right, no purpose badge. Then the price, the specification lines in the agreed
 *  order, tenure and restriction, the two counts, and "Click to open" at the bottom centre (plain text, not a button). */
function SubsaleCard({ l, lang, large, owner, onOpen, onEdit }: { l: Listing; lang: Lang; large: boolean; owner?: string; onOpen: () => void; onEdit: () => void }) {
  const { state } = useApp();
  const s = listingStrings[lang];
  const t = c15Strings[lang].card;
  const label = cardTitle(l) || s.untitled;
  const p = mainPhoto(l)!;
  const tx = transactionLabels(l);
  const lines = specLines(l, { ...t, type: typeOnly(l, s) || undefined, lotType: l.lotType ? s.lotType[l.lotType] : undefined });
  const { check, missing } = checkAndMissing(l);
  const avail = availabilityText(l, s, lang);
  return (
    <li className={`sc ${large ? 'sc-large' : 'sc-grid'}`} data-testid="listing-card" data-id={l.id}>
      {/* A tap anywhere on the card opens it; the full-size button under the content gives keyboards and screen readers
          the same action (its click reaches the card's handler). */}
      <article className="sc-card" onClick={onOpen}>
        <button type="button" className="sc-open" data-testid="card-open-area" aria-label={t.openOf(label)} />
        <span className={`sc-photo ${large ? 'wide' : ''}`}>
          <StoredImage fileId={p.fileId} url={p.url} />
          {l.status && <span className={`sc-status st-${l.status}`} data-testid="card-status" data-status={l.status}>{s.status[l.status]}</span>}
          {(p.sample || l.sample) && <span className="lc-sample">{p.sample ? s.samplePic : s.sample}</span>}
        </span>
        <div className="sc-body">
          <div className="sc-head">
            <div className="sc-side">
              <button type="button" className="sc-gear" data-testid="card-edit" aria-label={t.editOf(label)} title={t.edit}
                onClick={e => { e.stopPropagation(); onEdit(); }}><IconGear size={18} /></button>
              {tx.map(x => <span key={x} className={`sc-tx sc-tx-${x}`} data-testid="card-tx" data-tx={x}>{x === 'sale' ? t.forSale : t.forRent}</span>)}
            </div>
            <div className="sc-title" data-testid="card-address">{label}</div>
          </div>
          <strong className="sc-price"><PriceLine l={l} s={s} short={!large} /></strong>
          {lines.map(ln => (
            <span key={ln.key} className="sc-spec" data-testid="card-spec" data-spec={ln.key}>
              {ln.parts.map((x, i) => <span key={x.k}>{i > 0 && ', '}<VVal l={l} k={x.k}>{x.text}</VVal></span>)}
            </span>
          ))}
          {l.parking !== undefined && <span className="sc-spec" data-testid="card-spec" data-spec="parking"><VVal l={l} k="parking">{t.parking(l.parking)}</VVal></span>}
          {avail && <span className="lc-meta">{avail}</span>}
          <TenureLine l={l} s={s} noStoreys />
          {(check.length > 0 || missing.length > 0) && (
            <span className="sc-counts" data-testid="card-counts">
              {check.length > 0 && <span className="sc-count sc-check" data-testid="card-to-check" data-n={check.length}>{t.toCheck(check.length)}</span>}
              {missing.length > 0 && <span className="sc-count sc-missing" data-testid="card-not-filled" data-n={missing.length}>{t.notFilled(missing.length)}</span>}
            </span>
          )}
          {large && l.extraComments && <p className="lc-comments pre" data-testid="card-comments">{l.extraComments}</p>}
          {large && owner && <span className="lc-owner">{`${s.owner}: ${owner}`}</span>}
          <CreatorTag state={state} collection="properties" id={l.id} />
          <span className="sc-hint" data-testid="card-click-to-open" aria-hidden="true">{t.clickToOpen}</span>
        </div>
      </article>
    </li>
  );
}
