// GPS Assistance: four large cards — House Shopping (route tracker that saves properties found on the way),
// My Banner Location (gps/BannersUI.tsx), My Property Map (saved properties on Google Maps, move between them,
// navigate; shows each property's banner status) and Co-broke Opportunity Map (Coming Soon).
// Only real saved positions are shown.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useMyPosition } from '../maps/position';
import { MyPositionButton } from '../maps/MyPositionButton';
import { MoneyInput } from '../ui/MoneyInput';
import { Lang, strings } from '../i18n';
import { useApp, useStore } from '../data/useStore';
import { newId } from '../data/store';
import { Go } from '../nav';
import { gpsStrings } from './strings';
import { trackerFor } from './tracker';
import { MapView, MapsNotice, useGoogleMaps } from '../maps/MapView';
import { SpotPicker, Spot } from '../maps/SpotPicker';
import type { Maps } from '../maps/google';
import { reverseGeocode, routePreview } from '../maps/google';
import { elapsedMs, bounds } from '../domain/journey';
import { durationText, kmText, metres, navigationUrl, nearby } from '../lib/geo';
import { fmtDate, fmtDateTime } from '../lib/dates';
import { Listing, TYPES, cardTitle, hasPosition, placeName, mainPhoto } from '../listing/model';
import { listingStrings } from '../listing/strings';
import { PriceLine } from '../listing/ListingUI';
import { OptionSelect } from '../ui/OptionSelect';
import { Confirm, Empty, StoredImage } from '../ui/common';
import { useToast } from '../ui/toast';
import { defaultPrefix, makeRef, nextNumber } from '../domain/refs';
import { checkField, COUNTRIES, MY_STATES, allBuiltInCities, allBuiltInTownships, DEFAULT_COUNTRY } from '../domain/places';
import { IconGps, IconCobroke } from '../icons';
import { BannerDot } from './BannersUI';
import { activeBanners } from '../domain/banners';
import type { Journey } from '../data/types';

export function GpsHome({ lang, go }: { lang: Lang; go: Go }) {
  const g = gpsStrings[lang];
  return (
    <section className="stack gps-home">
      <button className="big-card" onClick={() => go({ name: 'houseShopping' })} data-testid="card-house-shopping">
        <span className="big-card-icon" aria-hidden="true">🏘️</span>
        <strong>{g.houseShopping}</strong>
        <small>{g.houseShoppingSub}</small>
      </button>
      <button className="big-card" onClick={() => go({ name: 'banners' })} data-testid="card-banners">
        <span className="big-card-icon" aria-hidden="true">🪧</span>
        <strong>{g.banners}</strong>
        <small>{g.bannersSub}</small>
      </button>
      <button className="big-card" onClick={() => go({ name: 'propertyMap' })} data-testid="card-map">
        <span className="big-card-icon" aria-hidden="true"><IconGps size={40} /></span>
        <strong>{g.map}</strong>
        <small>{g.mapSub}</small>
      </button>
      <button className="big-card soon" onClick={() => go({ name: 'comingSoon', key: 'cobrokeMap' })} data-testid="card-cobroke-map"
        aria-label={`${g.cobrokeMap} (${strings[lang].comingSoon})`}>
        <span className="big-card-icon" aria-hidden="true"><IconCobroke size={40} /></span>
        <strong>{g.cobrokeMap}</strong>
        <small>{g.cobrokeMapSub}</small>
        <span className="badge soon-badge fit">{strings[lang].comingSoon}</span>
      </button>
    </section>
  );
}

function useTracker() {
  const store = useStore();
  const tracker = trackerFor(store);
  useSyncExternalStore(tracker.subscribe, () => `${tracker.journey?.updated}:${tracker.journey?.points.length}:${tracker.fix?.t}:${tracker.error}:${tracker.running}:${tracker.journey?.status}`);
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(t); }, []);
  return tracker;
}

/** Route drawn from the GPS points when Google Maps is not available. Not a map: no streets are shown. */
export function RouteSketch({ points, marks, label }: { points: { lat: number; lng: number }[]; marks: { lat: number; lng: number }[]; label: string }) {
  const b = bounds([...points, ...marks]);
  if (!b || points.length < 2) return null;
  const W = 320, H = 200, pad = 14;
  const k = Math.cos(((b.minLat + b.maxLat) / 2) * Math.PI / 180);
  const spanX = Math.max((b.maxLng - b.minLng) * k, 1e-6), spanY = Math.max(b.maxLat - b.minLat, 1e-6);
  const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
  const xy = (p: { lat: number; lng: number }) => [pad + (p.lng - b.minLng) * k * scale, H - pad - (p.lat - b.minLat) * scale];
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${xy(p).map(n => n.toFixed(1)).join(' ')}`).join(' ');
  const [sx, sy] = xy(points[0]), [ex, ey] = xy(points[points.length - 1]);
  return (
    <figure className="route-sketch">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} data-testid="route-sketch">
        <rect width={W} height={H} rx="10" fill="#111114" />
        <path d={d} fill="none" stroke="#D4AF37" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={sx} cy={sy} r="5" fill="#22C55E" /><circle cx={ex} cy={ey} r="5" fill="#EF4444" />
        {marks.map((m, i) => { const [x, y] = xy(m); return <circle key={i} cx={x} cy={y} r="5" fill="#F7E7A6" stroke="#08080A" />; })}
      </svg>
      <figcaption className="small muted">{label}</figcaption>
    </figure>
  );
}

export function HouseShopping({ lang, go }: { lang: Lang; go: Go }) {
  const { state } = useApp();
  const g = gpsStrings[lang];
  const tracker = useTracker();
  const { maps, status } = useGoogleMaps(lang);
  const j = tracker.journey;
  const [marking, setMarking] = useState(false);
  const geoAt = useRef(-Infinity);

  // Name the places the route passes through (township, city or street), about every 300 m.
  useEffect(() => {
    tracker.onPoint = maps ? (jr: Journey) => {
      if (jr.distanceM - geoAt.current < 300 && jr.places.length) return;
      geoAt.current = jr.distanceM;
      const p = jr.points[jr.points.length - 1];
      void reverseGeocode(maps, p.lat, p.lng).then(r => {
        const name = r?.parts.township || r?.parts.city || r?.parts.street;
        if (name) tracker.addPlaceName(name, p.lat, p.lng);
      }).catch(() => {});
    } : null;
    return () => { tracker.onPoint = null; };
  }, [maps, tracker]);

  const recording = j && (j.status === 'recording' || j.status === 'paused');
  const here = tracker.fix ?? (j?.points.length ? { ...j.points[j.points.length - 1] } : null);
  const previous = state.journeys.filter(x => x.status === 'saved').sort((a, b) => b.startedAt - a.startedAt);
  const withPos = state.properties.filter(hasPosition);

  return (
    <section className="stack" data-testid="house-shopping">
      <p className="notice">{g.screenOn} {g.safety}</p>
      <div className="card stack-sm tracker-card">
        <div className="between">
          <strong data-testid="tracker-state">{!recording ? g.notRecording : j!.status === 'paused' ? g.paused : tracker.running ? g.recording : g.paused}</strong>
          {tracker.running && <span className="rec-dot" aria-hidden="true" />}
        </div>
        <div className="stats">
          <div><span>{g.distance}</span><strong data-testid="trk-distance">{kmText(j && recording ? j.distanceM : 0)}</strong></div>
          <div><span>{g.elapsed}</span><strong data-testid="trk-time">{durationText(j && recording ? elapsedMs(j, j.status === 'paused' ? j.updated : Date.now()) : 0)}</strong></div>
          <div><span>{g.points}</span><strong>{j && recording ? j.points.length : 0}</strong></div>
        </div>
        {tracker.fix && <small className={tracker.fix.acc > 50 ? 'warn-text' : 'muted'}>{g.accuracy(tracker.fix.acc)}{tracker.fix.acc > 50 ? ` · ${g.poor}` : ''}</small>}
        {tracker.running && !tracker.fix && !tracker.error && <small className="muted">{g.waiting}</small>}
        {tracker.error && <p className="error" role="alert">{g.errors[tracker.error]}</p>}
        {!recording && <button className="btn primary big" onClick={() => tracker.start()} data-testid="trk-start">▶ {g.start}</button>}
        {recording && (
          <div className="two">
            {tracker.running
              ? <button className="btn secondary" onClick={() => tracker.pause()}>❚❚ {g.pause}</button>
              : <button className="btn primary" onClick={() => tracker.resume()} data-testid="trk-resume">▶ {g.resume}</button>}
            <button className="btn danger" data-testid="trk-stop" onClick={() => {
              const id = tracker.stop(g.journeyTitle(fmtDateTime(j!.startedAt, lang)));
              if (id) go({ name: 'journey', id });
            }}>■ {g.stop}</button>
          </div>
        )}
        {recording && <button className="btn primary" disabled={!here && !maps} onClick={() => setMarking(true)} data-testid="mark-here">📍 {g.markHere}</button>}
      </div>

      {!recording && <IdleMap lang={lang} go={go} maps={maps} status={status} />}

      {recording && (
        <>
          <MapsNotice lang={lang} status={status} />
          {maps ? (
            <MapView maps={maps} fit={!tracker.fix} center={tracker.fix ? { lat: tracker.fix.lat, lng: tracker.fix.lng } : undefined} height={300}
              follow me={tracker.fix ? { lat: tracker.fix.lat, lng: tracker.fix.lng, acc: tracker.fix.acc } : null}
              meState={tracker.error === 'denied' ? 'denied' : tracker.error && !tracker.fix ? 'off' : tracker.fix ? 'live' : 'locating'}
              path={j!.points}
              markers={[
                ...j!.marks.map(m => ({ id: m.id, lat: m.lat, lng: m.lng, kind: 'mark' as const })),
                ...withPos.filter(p => here && metres(here, { lat: p.lat!, lng: p.lng! }) < 3000).map(p => ({ id: p.id, lat: p.lat!, lng: p.lng!, title: cardTitle(p), kind: 'property' as const })),
              ]}
              onMarkerClick={id => { if (state.properties.some(p => p.id === id)) go({ name: 'listingDetail', id }); }} />
          ) : <RouteSketch points={j!.points} marks={j!.marks} label={g.routeSketch} />}
          <JourneyLists lang={lang} go={go} j={j!} maps={maps} onMoveMark={(id, sp) => tracker.update(x => ({ ...x, marks: x.marks.map(m => (m.id === id ? { ...m, lat: sp.lat, lng: sp.lng } : m)) }))} />
        </>
      )}

      <div className="card stack-sm">
        <div className="card-title">{g.previous}</div>
        {previous.length === 0 ? <Empty>{g.noJourneys}</Empty> : previous.map(x => (
          <button key={x.id} className="link-row journey-row" onClick={() => go({ name: 'journey', id: x.id })} data-testid="journey-row">
            <strong>{x.title || g.journeyTitle(fmtDateTime(x.startedAt, lang))}</strong>
            <small className="muted">{kmText(x.distanceM)} · {durationText(elapsedMs(x, x.endedAt ?? x.updated))} · {x.marks.length} 📍</small>
          </button>
        ))}
      </div>

      {marking && (here || maps) && <MarkSheet lang={lang} at={here ?? null} acc={here ? tracker.fix?.acc : undefined} maps={maps} onClose={() => setMarking(false)}
        onMark={mark => { tracker.update(x => ({ ...x, marks: [...x.marks, mark] })); setMarking(false); }} />}
    </section>
  );
}

function JourneyLists({ lang, go, j, maps, onMoveMark }: { lang: Lang; go: Go; j: Journey; maps?: Maps | null; onMoveMark?: (id: string, s: Spot) => void }) {
  const { state } = useApp();
  const g = gpsStrings[lang];
  const [moving, setMoving] = useState<Journey['marks'][number] | null>(null);
  return (
    <>
      <div className="card stack-sm" data-testid="journey-places">
        <div className="card-title">{g.places}</div>
        {j.places.length === 0 ? <small className="muted">{g.noPlaces}</small> : (
          <ol className="places">{j.places.map(p => <li key={p.name + p.at}>{p.name} <small className="muted">{fmtDateTime(p.at, lang)}</small></li>)}</ol>
        )}
      </div>
      <div className="card stack-sm" data-testid="journey-marks">
        <div className="card-title">{g.marks}</div>
        {j.marks.length === 0 ? <small className="muted">{g.noMarks}</small> : j.marks.map(m => {
          const p = state.properties.find(x => x.id === m.propertyId);
          return (
            <div key={m.id} className="mark-row">
              <span>📍 {p ? [p.ref, cardTitle(p)].filter(Boolean).join(' · ') : m.note || `${m.lat.toFixed(5)}, ${m.lng.toFixed(5)}`}</span>
              <small className="muted">{fmtDateTime(m.at, lang)}</small>
              <div className="row-wrap">
                {p && <button className="btn small secondary" onClick={() => go({ name: 'listingDetail', id: p.id })}>{g.openProperty}</button>}
                {onMoveMark && <button className="btn small secondary" onClick={() => setMoving(m)} data-testid="move-mark">✥ {g.moveMark}</button>}
              </div>
            </div>
          );
        })}
      </div>
      {moving && onMoveMark && <MoveMarkSheet lang={lang} maps={maps ?? null} mark={moving} onClose={() => setMoving(null)} onSave={sp => { onMoveMark(moving.id, sp); setMoving(null); }} />}
    </>
  );
}

/** Correct a mark's position later: tap the right spot on the map, or use the current GPS position. */
function MoveMarkSheet({ lang, maps, mark, onClose, onSave }: { lang: Lang; maps: Maps | null; mark: Journey['marks'][number]; onClose: () => void; onSave: (s: Spot) => void }) {
  const g = gpsStrings[lang];
  const c = strings[lang].c;
  const [spot, setSpot] = useState<Spot>({ lat: mark.lat, lng: mark.lng, source: 'map' });
  const moved = spot.lat !== mark.lat || spot.lng !== mark.lng;
  return (
    <div className="sheet-scrim" role="presentation">
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="mv-t" data-testid="move-mark-sheet">
        <div className="between"><h2 id="mv-t">{g.moveMark}</h2><button className="btn small secondary" onClick={onClose}>{c.close}</button></div>
        <SpotPicker lang={lang} maps={maps} spot={spot} onChange={setSpot} testId="move-map" />
        <div className="sheet-actions two">
          <button className="btn secondary" onClick={onClose}>{c.cancel}</button>
          <button className="btn primary" disabled={!moved} onClick={() => onSave(spot)} data-testid="move-mark-save">{c.save}</button>
        </div>
      </div>
    </div>
  );
}

/** Mark a property at the current spot: link a saved one nearby, save a new one, or just mark the spot. */
function MarkSheet({ lang, at, acc, maps, onClose, onMark }: {
  lang: Lang; at: { lat: number; lng: number } | null; acc?: number; maps: Maps | null; onClose: () => void;
  onMark: (m: Journey['marks'][number]) => void;
}) {
  const { state, store } = useApp();
  // Starts at the current GPS spot; the agent can tap the map (or drag the pin) to the exact property. Without a GPS
  // fix nothing is chosen until the agent taps the map (positions are never invented).
  const [spot, setSpot] = useState<Spot | null>(at ? { lat: at.lat, lng: at.lng, acc, source: 'gps' } : null);
  const g = gpsStrings[lang];
  const c = strings[lang].c;
  const ls = listingStrings[lang];
  const toast = useToast();
  const near = spot ? nearby(spot, state.properties, 100) : [];
  const [type, setType] = useState<string | undefined>();
  const [note, setNote] = useState('');
  const [price, setPrice] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const mark = (propertyId?: string, n?: string) => { if (spot) onMark({ id: newId(), lat: spot.lat, lng: spot.lng, at: Date.now(), propertyId, note: n }); };

  async function saveNew() {
    if (!spot) return;
    setBusy(true);
    const prefix = defaultPrefix(state.options.refPrefix, state.settings.lastPrefix);
    const no = nextNumber(state.properties);
    const p: Listing = {
      id: newId(), created: Date.now(), updated: Date.now(), photos: [], ref: makeRef(prefix, no), refPrefix: prefix, refNo: no,
      type, headline: note.trim() || g.foundHeadline(fmtDate(Date.now(), lang)), status: 'needs_check', country: DEFAULT_COUNTRY,
      lat: spot.lat, lng: spot.lng, geoSource: spot.source === 'gps' ? 'gps' : 'manual', geoAccuracy: spot.source === 'gps' ? spot.acc : undefined, askingPrice: price || undefined,
      history: [{ at: Date.now(), source: 'map', summary: 'House Shopping' }],
    };
    // Address parts from Google Maps are used only when they match the saved dropdown values; anything new is
    // left for the agent to confirm later with "Add from Google Map".
    if (maps) {
      try {
        const r = await reverseGeocode(maps, spot.lat, spot.lng);
        if (r) {
          const saved = (list: string, b: readonly string[]) => [...b, ...(state.options[list] ?? []).map(o => o.value)];
          const pick = (v: string | undefined, list: string, b: readonly string[]) => { const x = checkField(v, saved(list, b)); return x.status === 'ok' ? x.value : undefined; };
          p.country = pick(r.parts.country, 'country', COUNTRIES) ?? DEFAULT_COUNTRY;
          p.state = pick(r.parts.state, 'state', MY_STATES);
          p.city = pick(r.parts.city, 'city', allBuiltInCities());
          p.township = pick(r.parts.township, 'township', allBuiltInTownships());
          p.street = r.parts.street;
          p.placeId = r.placeId;
        }
      } catch { /* position is saved anyway */ }
    }
    store.upsert('properties', p);
    store.setSingleton('settings', { lastPrefix: prefix });
    mark(p.id);
    toast(g.savedProperty);
    setBusy(false);
  }

  return (
    <div className="sheet-scrim" role="presentation">
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="mk-t" data-testid="mark-sheet">
        <div className="between"><h2 id="mk-t">{g.markTitle}</h2><button className="btn small secondary" onClick={onClose}>{c.close}</button></div>
        <SpotPicker lang={lang} maps={maps} spot={spot} onChange={setSpot} testId="mark-map" />
        <div className="card stack-sm">
          <div className="card-title">{g.nearbySaved}</div>
          {near.length === 0 ? <small className="muted">{g.noneNearby}</small> : near.map(({ item, distance }) => (
            <div key={item.id} className="mark-row"><span>{[item.ref, cardTitle(item)].filter(Boolean).join(' · ')} <small className="muted">{distance} m</small></span>
              <button className="btn small primary" onClick={() => mark(item.id)}>{g.linkThis}</button></div>
          ))}
        </div>
        <div className="card stack-sm">
          <div className="card-title">{g.newHere}</div>
          <OptionSelect lang={lang} label={g.quickType} listKey="type" builtIns={TYPES.map(v => ({ value: v, label: ls.types[v] }))} value={type} onChange={setType} />
          <label className="ff">{g.quickNote}<input value={note} onChange={e => setNote(e.target.value)} /></label>
          <label className="ff">{g.quickPrice}<MoneyInput value={price} onChange={setPrice} /></label>
          <button className="btn primary" disabled={busy || !spot} onClick={() => void saveNew()} data-testid="save-found">{g.saveProperty}</button>
        </div>
        <button className="btn secondary" disabled={!spot} onClick={() => mark(undefined, note.trim() || undefined)}>{g.markOnly}</button>
      </div>
    </div>
  );
}

export function JourneyDetail({ lang, go, id }: { lang: Lang; go: Go; id: string }) {
  const { state, store } = useApp();
  const g = gpsStrings[lang];
  const c = strings[lang].c;
  const j = state.journeys.find(x => x.id === id);
  const { maps, status } = useGoogleMaps(lang);
  const [del, setDel] = useState(false);
  if (!j) return <Empty>{g.noJourneys}</Empty>;
  return (
    <section className="stack" data-testid="journey-detail">
      <label className="ff">{g.rename}<input value={j.title ?? ''} onChange={e => store.upsert('journeys', { ...j, title: e.target.value })} /></label>
      <div className="stats card">
        <div><span>{g.distance}</span><strong data-testid="jd-distance">{kmText(j.distanceM)}</strong></div>
        <div><span>{g.elapsed}</span><strong>{durationText(elapsedMs(j, j.endedAt ?? j.updated))}</strong></div>
        <div><span>{g.points}</span><strong>{j.points.length}</strong></div>
      </div>
      <small className="muted">{fmtDateTime(j.startedAt, lang)} → {j.endedAt ? fmtDateTime(j.endedAt, lang) : ''}</small>
      <MapsNotice lang={lang} status={status} />
      {maps
        ? <MapView maps={maps} fit height={300} path={j.points} markers={j.marks.map(m => ({ id: m.propertyId ?? m.id, lat: m.lat, lng: m.lng, kind: 'mark' as const }))}
          onMarkerClick={x => { if (state.properties.some(p => p.id === x)) go({ name: 'listingDetail', id: x }); }} />
        : <RouteSketch points={j.points} marks={j.marks} label={g.routeSketch} />}
      <JourneyLists lang={lang} go={go} j={j} maps={maps} onMoveMark={(mid, sp) => store.upsert('journeys', { ...j, marks: j.marks.map(m => (m.id === mid ? { ...m, lat: sp.lat, lng: sp.lng } : m)) })} />
      <button className="btn ghost danger-text" onClick={() => setDel(true)}>{g.delete}</button>
      {del && <Confirm lang={lang} title={g.deleteQ} body={c.deleteBody} onCancel={() => setDel(false)} onOk={() => { store.remove('journeys', j.id); go({ name: 'houseShopping' }); }} />}
    </section>
  );
}

// ---------- property map ----------
export function PropertyMap({ lang, go, id }: { lang: Lang; go: Go; id?: string }) {
  const { state } = useApp();
  const g = gpsStrings[lang];
  const ls = listingStrings[lang];
  const { maps, status } = useGoogleMaps(lang);
  const list = useMemo(() => state.properties.filter(hasPosition).sort((a, b) => (cardTitle(a) || '').localeCompare(cardTitle(b) || '')), [state.properties]);
  const [sel, setSel] = useState<string | undefined>(id ?? list[0]?.id);
  const mine = useMyPosition(false);
  const [route, setRoute] = useState<{ path: { lat: number; lng: number }[]; info?: string } | null>(null);
  const [routeMsg, setRouteMsg] = useState('');
  const idx = Math.max(0, list.findIndex(p => p.id === sel));
  const p = list[idx];
  useEffect(() => { setRoute(null); setRouteMsg(''); }, [sel]);

  if (!list.length) return (
    <section className="stack" data-testid="property-map">
      <MapsNotice lang={lang} status={status} />
      {maps ? <MapView maps={maps} height={300} zoom={15} markers={[]} /> : <MyPositionButton lang={lang} mine={mine} />}
      <Empty>{g.mapNone}</Empty>
    </section>
  );
  const move = (n: number) => setSel(list[(idx + n + list.length) % list.length].id);

  function showRoute() {
    if (!maps || !p) return;
    setRouteMsg('');
    navigator.geolocation?.getCurrentPosition(async pos => {
      const from = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const r = await routePreview(maps, from, { lat: p.lat!, lng: p.lng! });
      if (!r) { setRouteMsg(g.routeNone); return; }
      setRoute({ path: r.path, info: r.distanceM !== undefined && r.durationS !== undefined ? g.routeInfo(kmText(r.distanceM), Math.round(r.durationS / 60)) : undefined });
    }, () => setRouteMsg(g.needLocation), { enableHighAccuracy: true, timeout: 15000 });
  }

  const photo = p ? mainPhoto(p)! : undefined;
  return (
    <section className="stack" data-testid="property-map">
      <MapsNotice lang={lang} status={status} />
      {maps && (
        <MapView maps={maps} height={340} center={p ? { lat: p.lat!, lng: p.lng! } : undefined} zoom={16} route={route?.path}
          markers={list.map(x => ({ id: x.id, lat: x.lat!, lng: x.lng!, title: cardTitle(x), selected: x.id === p?.id, kind: 'property' as const }))}
          onMarkerClick={x => setSel(x)} />
      )}
      {!maps && <MyPositionButton lang={lang} mine={mine} />}
      {!maps && <div className="card stack-sm"><div className="card-title">{g.listMode}</div>
        {list.map(x => <button key={x.id} className={`link-row ${x.id === p?.id ? 'on' : ''}`} onClick={() => setSel(x.id)}>{cardTitle(x) || ls.untitled} <small className="muted">{x.lat!.toFixed(4)}, {x.lng!.toFixed(4)}</small></button>)}
      </div>}
      {p && (
        <div className="card stack-sm map-card" data-testid="map-selected">
          <div className="between">
            <button className="icon-btn" aria-label={g.prev} onClick={() => move(-1)}>‹</button>
            <small className="muted" data-testid="map-index">{g.selected(idx + 1, list.length)}</small>
            <button className="icon-btn" aria-label={g.next} onClick={() => move(1)}>›</button>
          </div>
          <div className="map-card-body">
            <span className="map-thumb"><StoredImage fileId={photo?.fileId} url={photo?.url} /></span>
            <div>
              <strong data-testid="map-title">{cardTitle(p) || ls.untitled}</strong>
              <div className="small muted">{[ls.types[p.type ?? ''] ?? p.type, placeName(p)].filter(Boolean).join(' · ')}</div>
              <div className="small"><PriceLine l={p} s={ls} /></div>
            </div>
          </div>
          <div className="between map-banner" data-testid="map-banner">
            <span className="small">{ls.bannerQ} <BannerDot status={p.bannerStatus} lang={lang} /></span>
            {activeBanners(state.banners, p.id).length > 0 && <small className="muted">{ls.bannerUp(activeBanners(state.banners, p.id).length)}</small>}
            <button className="btn small secondary" onClick={() => go({ name: 'banners', propertyId: p.id })}>🪧 {ls.bannerOpen}</button>
          </div>
          {route?.info && <small className="ok-text">{route.info}</small>}
          {routeMsg && <small className="warn-text">{routeMsg}</small>}
          <div className="row-wrap">
            <button className="btn secondary" onClick={() => go({ name: 'listingDetail', id: p.id })}>{g.details}</button>
            <a className="btn primary" href={navigationUrl({ lat: p.lat!, lng: p.lng! })} target="_blank" rel="noreferrer" data-testid="navigate">{g.navigate}</a>
            {maps && <button className="btn secondary" onClick={showRoute}>{g.routeShow}</button>}
          </div>
        </div>
      )}
    </section>
  );
}

/** House Shopping before recording: the real map around you with saved properties nearby. */
function IdleMap({ lang, go, maps, status }: { lang: Lang; go: Go; maps: unknown; status: Parameters<typeof MapsNotice>[0]['status'] }) {
  const { state } = useApp();
  const mine = useMyPosition();
  const near = mine.pos ? state.properties.filter(hasPosition).filter(p => metres(mine.pos!, { lat: p.lat!, lng: p.lng! }) < 5000) : [];
  return (
    <div className="card stack-sm" data-testid="house-shopping-map">
      <MapsNotice lang={lang} status={status} />
      {maps ? (
        <MapView maps={maps} height={260} center={mine.pos ?? undefined} zoom={15} follow me={mine.pos} meState={mine.state} onLocate={mine.locate}
          markers={near.map(p => ({ id: p.id, lat: p.lat!, lng: p.lng!, title: cardTitle(p), kind: 'property' as const }))}
          onMarkerClick={id => go({ name: 'listingDetail', id })} />
      ) : <MyPositionButton lang={lang} mine={mine} />}
    </div>
  );
}
