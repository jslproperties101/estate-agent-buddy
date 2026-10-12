// GPS Assistance → My Banner Location: where each "For Sale / For Rent" banner stands, and every property's banner
// status (Yes / Not yet / No / Owner doesn't allow / Removed).
//  - One card per property ("banner card") with its status, the banners still up (date, position, photo, note,
//    Navigate), and the ones taken down earlier.
//  - A banner position comes from the phone's GPS at the banner, a tap on Google Maps, or typed coordinates. Positions
//    are never invented: without Google Maps the banners are listed with their coordinates and a Navigate button.
//  - Adding a banner sets the property's status to Yes; taking down the last one sets it to Removed (domain/banners).
import { useEffect, useMemo, useState } from 'react';
import { Lang, strings } from '../i18n';
import { useApp } from '../data/useStore';
import { newId } from '../data/store';
import { Go } from '../nav';
import { gpsStrings } from './strings';
import { listingStrings } from '../listing/strings';
import { MapView, MapsNotice, useGoogleMaps } from '../maps/MapView';
import { BANNER_STATUSES, BannerStatus, Listing, cardTitle, hasPosition } from '../listing/model';
import { BANNER_COLOURS, activeBanners, bannerCounts, bannersOf, statusAfterAdd, statusAfterRemove } from '../domain/banners';
import { navigationUrl, validLatLng } from '../lib/geo';
import { fmtDate, ymd } from '../lib/dates';
import { compressImage } from '../lib/images';
import { Confirm, Empty, StoredImage } from '../ui/common';
import { useToast } from '../ui/toast';
import type { Banner } from '../data/types';

type Filter = BannerStatus | 'unset' | 'all';

export function BannerDot({ status, lang }: { status?: BannerStatus; lang: Lang }) {
  const s = listingStrings[lang];
  const key = status ?? 'unset';
  return (
    <span className="banner-chip" data-banner={key}>
      <span className="lead-dot" style={{ background: BANNER_COLOURS[key] }} aria-hidden="true" />{s.banner[key]}
    </span>
  );
}

export function BannerScreen({ lang, go, propertyId }: { lang: Lang; go: Go; propertyId?: string }) {
  const { state, store } = useApp();
  const g = gpsStrings[lang];
  const b = g.bn;
  const s = listingStrings[lang];
  const toast = useToast();
  const { maps, status } = useGoogleMaps(lang);
  const [filter, setFilter] = useState<Filter>('all');
  const [sel, setSel] = useState<string | undefined>(propertyId);
  const [adding, setAdding] = useState<string | null>(null);
  const [takeDown, setTakeDown] = useState<Banner | null>(null);

  const counts = bannerCounts(state.properties);
  const list = useMemo(() => {
    const xs = state.properties.filter(p => filter === 'all' || (p.bannerStatus ?? 'unset') === filter);
    const label = (p: Listing) => [p.ref, cardTitle(p)].filter(Boolean).join(' ');
    return xs.sort((a, c) => (a.id === propertyId ? -1 : c.id === propertyId ? 1 : label(a).localeCompare(label(c))));
  }, [state.properties, filter, propertyId]);
  const shownIds = new Set(list.map(p => p.id));
  const up = state.banners.filter(x => !x.removedOn && shownIds.has(x.propertyId));

  // Opening from a property: bring its card into view.
  useEffect(() => {
    if (!propertyId) return;
    document.querySelector(`[data-banner-card="${propertyId}"]`)?.scrollIntoView({ block: 'start' });
  }, [propertyId]);

  function setStatus(p: Listing, v: BannerStatus | undefined) {
    store.upsert('properties', { ...p, bannerStatus: v });
  }
  function confirmTakeDown(x: Banner) {
    store.upsert('banners', { ...x, removedOn: ymd(new Date()) });
    const p = state.properties.find(y => y.id === x.propertyId);
    const stillUp = activeBanners(state.banners, x.propertyId).filter(y => y.id !== x.id).length;
    const next = statusAfterRemove(p?.bannerStatus, stillUp);
    if (p && next !== p.bannerStatus) { setStatus(p, next); toast(b.noneLeft); } else toast(b.takenDownMsg);
    setTakeDown(null);
  }

  const chips: Filter[] = ['all', ...BANNER_STATUSES, 'unset'];
  return (
    <section className="stack" data-testid="banner-screen">
      <div className="chip-row" role="radiogroup" aria-label={b.filter}>
        {chips.map(f => (
          <button key={f} type="button" role="radio" aria-checked={filter === f} className={`chip-btn ${filter === f ? 'on' : ''}`} data-filter={f} onClick={() => setFilter(f)}>
            {f !== 'all' && <span className="lead-dot" style={{ background: BANNER_COLOURS[f] }} aria-hidden="true" />}
            {f === 'all' ? b.all : s.banner[f]} <span className="count">{f === 'all' ? state.properties.length : counts[f]}</span>
          </button>
        ))}
      </div>

      <MapsNotice lang={lang} status={status} />
      {maps ? (
        <>
          <MapView maps={maps} fit height={300} testId="banner-map"
            markers={[
              ...up.map(x => ({ id: x.id, lat: x.lat, lng: x.lng, kind: 'banner' as const, colour: BANNER_COLOURS[state.properties.find(p => p.id === x.propertyId)?.bannerStatus ?? 'yes'], selected: x.propertyId === sel,
                title: cardTitle(state.properties.find(p => p.id === x.propertyId)!) })),
            ]}
            onMarkerClick={id => {
              const x = state.banners.find(y => y.id === id);
              if (!x) return;
              setSel(x.propertyId);
              document.querySelector(`[data-banner-card="${x.propertyId}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
            }} />
          <small className="muted" data-testid="banner-map-count">{b.mapBanners(up.length)}</small>
        </>
      ) : status !== 'loading' && <small className="muted">{b.noMap}</small>}

      {state.properties.length === 0 ? <Empty>{b.noProps}</Empty> : list.length === 0 ? <Empty>{b.noneMatch}</Empty> : (
        <ul className="banner-list">
          {list.map(p => {
            const active = activeBanners(state.banners, p.id);
            const old = bannersOf(state.banners, p.id).filter(x => x.removedOn);
            return (
              <li key={p.id} className={`card stack-sm banner-card ${p.id === sel ? 'sel' : ''}`} data-testid="banner-card" data-banner-card={p.id}
                style={{ borderLeftColor: BANNER_COLOURS[p.bannerStatus ?? 'unset'] }}>
                <div className="between">
                  <strong className="banner-title">{[p.ref, cardTitle(p) || s.untitled].filter(Boolean).join(' · ')}</strong>
                  <BannerDot status={p.bannerStatus} lang={lang} />
                </div>
                <label className="ff">{s.bannerQ}
                  <select data-field="bannerStatus" value={p.bannerStatus ?? ''} onChange={e => setStatus(p, (e.target.value || undefined) as BannerStatus | undefined)}>
                    <option value="">{s.banner.unset}</option>
                    {BANNER_STATUSES.map(v => <option key={v} value={v}>{s.banner[v]}</option>)}
                  </select>
                </label>
                {active.length === 0 ? <small className="muted">{b.none}</small> : active.map(x => <BannerRow key={x.id} x={x} lang={lang} onTakeDown={() => setTakeDown(x)} />)}
                <div className="two">
                  <button className="btn primary" onClick={() => { setSel(p.id); setAdding(p.id); }} data-testid="banner-add">📍 {b.add}</button>
                  <button className="btn secondary" onClick={() => go({ name: 'listingDetail', id: p.id })}>{b.openProperty}</button>
                </div>
                {old.length > 0 && (
                  <details className="banner-history">
                    <summary>{b.history} ({old.length})</summary>
                    {old.map(x => <BannerRow key={x.id} x={x} lang={lang} />)}
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding && <AddBannerSheet lang={lang} property={state.properties.find(p => p.id === adding)!} maps={maps} onClose={() => setAdding(null)} />}
      {takeDown && <Confirm lang={lang} title={b.takeDownQ} body={b.takeDownBody} okLabel={b.takeDown} danger={false} onCancel={() => setTakeDown(null)} onOk={() => confirmTakeDown(takeDown)} />}
    </section>
  );
}

function BannerRow({ x, lang, onTakeDown }: { x: Banner; lang: Lang; onTakeDown?: () => void }) {
  const b = gpsStrings[lang].bn;
  const g = gpsStrings[lang];
  return (
    <div className={`banner-row ${x.removedOn ? 'down' : ''}`} data-testid={x.removedOn ? 'banner-old' : 'banner-up'}>
      {x.photoFileId && <span className="banner-photo"><StoredImage fileId={x.photoFileId} alt="" /></span>}
      <div className="stack-sm banner-row-main">
        <strong>{b.placed(fmtDate(x.placedOn, lang))}{x.removedOn ? ` · ${b.takenDown(fmtDate(x.removedOn, lang))}` : ''}</strong>
        <small className="muted" data-testid="banner-pos">{x.lat.toFixed(5)}, {x.lng.toFixed(5)} · {b.source[x.source]}{x.acc ? ` ±${x.acc} m` : ''}</small>
        {x.note && <small>{x.note}</small>}
        {!x.removedOn && (
          <div className="row-wrap">
            <a className="btn small primary" href={navigationUrl({ lat: x.lat, lng: x.lng })} target="_blank" rel="noreferrer" data-testid="banner-navigate">{g.navigate}</a>
            {onTakeDown && <button className="btn small secondary" onClick={onTakeDown} data-testid="banner-takedown">{b.takeDown}</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function AddBannerSheet({ lang, property, maps, onClose }: { lang: Lang; property: Listing; maps: unknown; onClose: () => void }) {
  const { store } = useApp();
  const g = gpsStrings[lang];
  const b = g.bn;
  const s = listingStrings[lang];
  const c = strings[lang].c;
  const toast = useToast();
  const [pos, setPos] = useState<{ lat: number; lng: number; acc?: number; source: Banner['source'] } | null>(null);
  const [latText, setLatText] = useState('');
  const [lngText, setLngText] = useState('');
  const [placedOn, setPlacedOn] = useState(ymd(new Date()));
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function useGps() {
    setErr(null);
    if (!('geolocation' in navigator)) { setErr(b.posErr); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      p => { setLocating(false); const acc = Math.round(p.coords.accuracy); setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc, source: 'gps' }); setLatText(p.coords.latitude.toFixed(6)); setLngText(p.coords.longitude.toFixed(6)); },
      () => { setLocating(false); setErr(b.posErr); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  }
  function typed(lat: string, lng: string) {
    setLatText(lat); setLngText(lng); setErr(null);
    const a = parseFloat(lat), o = parseFloat(lng);
    setPos(validLatLng(a, o) ? { lat: a, lng: o, source: 'manual' } : null);
  }
  async function addPhoto(files: FileList | null) {
    const f = files?.[0];
    if (!f || !f.type.startsWith('image/')) return;
    setBusy(true);
    let blob: Blob = f;
    try { blob = (await compressImage(f)).blob; } catch { /* keep the original */ }
    if (photo) store.removeFile(photo);
    setPhoto(await store.putFile(blob));
    setBusy(false);
  }
  function save() {
    if (!pos) { setErr(b.needPos); return; }
    const now = Date.now();
    store.upsert('banners', { id: newId(), created: now, updated: now, propertyId: property.id, lat: pos.lat, lng: pos.lng, acc: pos.acc, source: pos.source, placedOn: placedOn || ymd(new Date()), note: note.trim() || undefined, photoFileId: photo });
    store.upsert('properties', { ...property, bannerStatus: statusAfterAdd() });
    toast(b.saved);
    onClose();
  }
  function cancel() { if (photo) store.removeFile(photo); onClose(); }

  const start = pos ?? (hasPosition(property) ? { lat: property.lat!, lng: property.lng! } : undefined);
  return (
    <div className="sheet-scrim" role="presentation">
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="bn-t" data-testid="banner-sheet">
        <div className="between"><h2 id="bn-t">{b.addTitle}</h2><button className="btn small secondary" onClick={cancel}>{c.close}</button></div>
        <small className="muted">{b.property}: <strong>{[property.ref, cardTitle(property) || s.untitled].filter(Boolean).join(' · ')}</strong></small>
        <button className="btn primary" onClick={useGps} disabled={locating} data-testid="banner-gps">{locating ? b.locating : `📍 ${b.useGps}`}</button>
        {maps ? (
          <>
            <small className="muted">{b.tapMap}</small>
            <MapView maps={maps} height={240} center={start} zoom={17} testId="banner-pick-map"
              markers={pos ? [{ id: 'pick', lat: pos.lat, lng: pos.lng, kind: 'pick' }] : []}
              onMapClick={(lat, lng) => { setPos({ lat, lng, source: 'map' }); setLatText(lat.toFixed(6)); setLngText(lng.toFixed(6)); setErr(null); }}
              onMarkerDrag={(_, lat, lng) => { setPos({ lat, lng, source: 'map' }); setLatText(lat.toFixed(6)); setLngText(lng.toFixed(6)); }} />
          </>
        ) : null}
        <fieldset className="ff"><legend>{b.typed}</legend>
          <div className="two">
            <label className="ff">{s.lat}<input inputMode="decimal" data-field="bannerLat" aria-invalid={!!err && !pos} value={latText} onChange={e => typed(e.target.value, lngText)} /></label>
            <label className="ff">{s.lng}<input inputMode="decimal" data-field="bannerLng" aria-invalid={!!err && !pos} value={lngText} onChange={e => typed(latText, e.target.value)} /></label>
          </div>
        </fieldset>
        {pos && <small className="ok-text" data-testid="banner-pos-set">{pos.lat.toFixed(5)}, {pos.lng.toFixed(5)} · {b.source[pos.source]}{pos.acc ? ` ±${pos.acc} m` : ''}</small>}
        {err && <p className="error" role="alert">{err}</p>}
        <label className="ff">{b.placedOn}<input type="date" data-field="placedOn" value={placedOn} onChange={e => setPlacedOn(e.target.value)} /></label>
        <label className="ff">{b.note}<input data-field="bannerNote" value={note} onChange={e => setNote(e.target.value)} /></label>
        <div className="ff">
          <span>{b.photo}</span>
          {photo && <span className="banner-photo big"><StoredImage fileId={photo} alt="" /></span>}
          <label className="btn secondary" aria-busy={busy}>
            {photo ? b.changePhoto : b.addPhoto}
            <input className="file-input" type="file" accept="image/*" capture="environment" data-testid="banner-photo-input" onChange={e => { void addPhoto(e.target.files); e.currentTarget.value = ''; }} />
          </label>
        </div>
        <div className="sheet-actions two">
          <button className="btn secondary" onClick={cancel}>{c.cancel}</button>
          <button className="btn primary" disabled={busy} onClick={save} data-testid="banner-save">{b.save}</button>
        </div>
      </div>
    </div>
  );
}
