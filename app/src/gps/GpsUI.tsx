// GPS Assistance: four large cards — House Shopping (route tracker that saves properties found on the way),
// My Banner Location (gps/BannersUI.tsx), My Property Map (saved properties on Google Maps, move between them,
// navigate; shows each property's banner status) and Co-broke Opportunity Map (Coming Soon).
// Only real saved positions are shown.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { isForeign } from '../team/access';
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
import { elapsedMs, bounds, displayPath } from '../domain/journey';
import { c007Strings } from './c007Strings';
import { Select } from '../ui/Select';
import { rm } from '../lib/money';
import { normalisePhone } from '../listing/model';
import { durationText, kmText, navigationUrl } from '../lib/geo';
import { fmtDate, fmtDateTime } from '../lib/dates';
import { Listing, cardTitle, hasPosition, placeName, mainPhoto } from '../listing/model';
import { listingStrings } from '../listing/strings';
import { PriceLine } from '../listing/ListingUI';
import { Confirm, Empty, StoredImage } from '../ui/common';
import { useToast } from '../ui/toast';
import { defaultPrefix, makeRef, nextNumber } from '../domain/refs';
import { checkField, COUNTRIES, MY_STATES, allMalaysiaTowns, allBuiltInTownships, DEFAULT_COUNTRY } from '../domain/places';
import { IconGps, IconCobroke } from '../icons';
import { BannerDot } from './BannersUI';
import { activeBanners } from '../domain/banners';
import type { Journey, BannerKind } from '../data/types';
import { isWebsite } from '../native/native';

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
  useSyncExternalStore(tracker.subscribe, () => `${tracker.journey?.updated}:${tracker.journey?.points.length}:${tracker.fix?.t}:${tracker.error}:${tracker.running}:${tracker.journey?.status}:${tracker.journey?.snapDone}:${tracker.journey?.marks.length}`);
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

/** JoyChange007: the map and the button under it fill the screen (the page still scrolls to the cards below). */
function useFillHeight(reserve: number): number {
  const calc = () => {
    if (typeof window === 'undefined') return 420;
    const head = document.querySelector('header')?.getBoundingClientRect().bottom ?? 66;
    // The bottom advert's height arrives a moment after the screen opens, so it is measured again below.
    const ad = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ad-h')) || 0;
    return Math.max(260, Math.round(window.innerHeight - head - ad - reserve - 30));
  };
  const [h, setH] = useState(calc);
  useEffect(() => {
    const on = () => { if (!document.documentElement.classList.contains('kb-open')) setH(calc()); };
    on();
    const timers = [setTimeout(on, 300), setTimeout(on, 1500)];
    window.addEventListener('resize', on);
    return () => { timers.forEach(clearTimeout); window.removeEventListener('resize', on); };
  }, [reserve]); // eslint-disable-line react-hooks/exhaustive-deps
  return h;
}

/** JoyChange007: the map starts about 50-100 m across around the agent (zoom 20 on a phone). */
const HS_ZOOM = 20;

export function HouseShopping({ lang, go }: { lang: Lang; go: Go }) {
  const { state, store } = useApp();
  const g = gpsStrings[lang];
  const x7 = c007Strings[lang];
  const toast = useToast();
  const tracker = useTracker();
  const { maps, status } = useGoogleMaps(lang);
  const j = tracker.journey;
  const [marking, setMarking] = useState(false);
  const web = isWebsite();
  const recording = !web && j && (j.status === 'recording' || j.status === 'paused');
  const here = tracker.fix ?? (j?.points.length ? { ...j.points[j.points.length - 1] } : null);
  const previous = state.journeys.filter(x => x.status === 'saved').sort((a, b) => b.startedAt - a.startedAt);
  const mapH = useFillHeight(recording ? 136 : 72);
  const path = useMemo(() => (j && recording ? displayPath(j) : []), [j?.points.length, j?.snapDone, recording]); // eslint-disable-line react-hooks/exhaustive-deps

  function stopAndSave() {
    const id = tracker.stop(g.journeyTitle(fmtDateTime(j!.startedAt, lang)));
    toast(x7.journeySaved);
    // The area name: the nearest saved property's neighbourhood (tracker); otherwise ONE Google lookup per journey.
    const saved = id ? store.getState().journeys.find(x => x.id === id) : undefined;
    if (saved && !saved.area && maps && saved.points.length) {
      const mid = saved.points[Math.floor(saved.points.length / 2)];
      void reverseGeocode(maps, mid.lat, mid.lng).then(r => {
        const area = r?.parts.township || r?.parts.city;
        const cur = store.getState().journeys.find(x => x.id === id);
        if (area && cur) store.upsert('journeys', { ...cur, area });
      }).catch(() => {});
    }
  }

  return (
    <section className="stack" data-testid="house-shopping">
      {/* JoyChange002 Change 47: a laptop cannot record a drive; it shows the journeys recorded on the phone. */}
      {web ? <p className="notice" data-testid="gps-phone-only">{g.phoneOnly}</p> : <>
        {/* JoyChange007 2.1: no information box; 2.2-2.4: a large Hybrid-only map starting very close; 2.6: Mark below it. */}
        <div className="hs-fill stack-sm" data-testid="hs-fill">
          <MapsNotice lang={lang} status={status} />
          {maps ? (
            <MapView maps={maps} fixedType="hybrid" zoom={HS_ZOOM} height={mapH} testId="hs-map"
              center={here ? { lat: here.lat, lng: here.lng } : undefined} follow
              me={tracker.fix ? { lat: tracker.fix.lat, lng: tracker.fix.lng, acc: tracker.fix.acc } : recording ? null : undefined}
              meState={recording ? (tracker.error === 'denied' ? 'denied' : tracker.error && !tracker.fix ? 'off' : tracker.fix ? 'live' : 'locating') : undefined}
              path={path}
              markers={recording ? j!.marks.map(m => ({ id: m.id, lat: m.lat, lng: m.lng, kind: 'mark' as const })) : []} />
          ) : recording ? <RouteSketch points={j!.points} marks={j!.marks} label={g.routeSketch} /> : null}
          {recording ? (
            <>
              <button className="btn primary big" disabled={!here} onClick={() => setMarking(true)} data-testid="mark-here">📍 {x7.markTitle}</button>
              <div className="two">
                {tracker.running
                  ? <button className="btn secondary" onClick={() => tracker.pause()} data-testid="trk-pause">❚❚ {g.pause}</button>
                  : <button className="btn primary" onClick={() => tracker.resume()} data-testid="trk-resume">▶ {g.resume}</button>}
                <button className="btn danger" data-testid="trk-stop" onClick={stopAndSave}>■ {g.stop}</button>
              </div>
            </>
          ) : <button className="btn primary big" onClick={() => tracker.start()} data-testid="trk-start">▶ {g.start}</button>}
        </div>
        <div className="card stack-sm tracker-card">
          <div className="between">
            <strong data-testid="tracker-state">{!recording ? g.notRecording : j!.status === 'paused' ? g.paused : tracker.running ? g.recording : g.paused}</strong>
            {tracker.running && <span className="rec-dot" aria-hidden="true" />}
          </div>
          <div className="stats">
            <div><span>{g.distance}</span><strong data-testid="trk-distance">{kmText(j && recording ? j.distanceM : 0)}</strong></div>
            <div><span>{g.elapsed}</span><strong data-testid="trk-time">{durationText(j && recording ? elapsedMs(j, j.status === 'paused' ? j.updated : Date.now()) : 0)}</strong></div>
            {/* JoyChange007 2.7: marked positions instead of GPS points */}
            <div><span>{x7.marked}</span><strong data-testid="trk-marked">{j && recording ? j.marks.length : 0}</strong></div>
          </div>
          {tracker.fix && <small className={tracker.fix.acc > 50 ? 'warn-text' : 'muted'}>{g.accuracy(tracker.fix.acc)}{tracker.fix.acc > 50 ? ` · ${g.poor}` : ''}</small>}
          {tracker.running && !tracker.fix && !tracker.error && <small className="muted">{g.waiting}</small>}
          {tracker.error && <p className="error" role="alert">{g.errors[tracker.error]}</p>}
        </div>
        {recording && <MarksList lang={lang} go={go} j={j!} maps={maps} onMarks={marks => tracker.update(x => ({ ...x, marks }))} />}
      </>}

      {/* JoyChange007 4.3: each card shows only the date and time, the area and how many positions were marked. */}
      <div className="card stack-sm">
        <div className="card-title">{g.previous}</div>
        {previous.length === 0 ? <Empty>{g.noJourneys}</Empty> : previous.map(x => (
          <button key={x.id} className="link-row journey-row" onClick={() => go({ name: 'journey', id: x.id })} data-testid="journey-row">
            <strong data-testid="journey-area">{x.area || x7.areaUnknown}</strong>
            <small className="muted">{fmtDateTime(x.startedAt, lang)} · <span data-testid="journey-marked">{x7.markedCount(x.marks.length)}</span></small>
          </button>
        ))}
      </div>

      {marking && here && <MarkSheet lang={lang} at={here} onClose={() => setMarking(false)}
        onMark={mark => { tracker.update(x => ({ ...x, marks: [...x.marks, mark] })); setMarking(false); toast(x7.markSaved); }} />}
    </section>
  );
}

/** JoyChange007: the marked positions of one journey: what was seen, Save as property (one tap, pre-filled), move, delete. */
function MarksList({ lang, go, j, maps, onMarks }: { lang: Lang; go: Go; j: Journey; maps?: Maps | null; onMarks: (marks: Journey['marks']) => void }) {
  const { state } = useApp();
  const g = gpsStrings[lang];
  const x7 = c007Strings[lang];
  const c = strings[lang].c;
  const save = useSaveMarkAsProperty(lang, maps ?? null);
  const [moving, setMoving] = useState<Journey['marks'][number] | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <>
      <div className="card stack-sm" data-testid="journey-marks">
        <div className="card-title">{g.marks}</div>
        {j.marks.length === 0 ? <small className="muted">{x7.noMarks}</small> : j.marks.map(m => {
          const p = state.properties.find(x => x.id === m.propertyId);
          const prices = [m.salePrice ? `${x7.purposes.sale} ${rm(m.salePrice)}` : '', m.rentPrice ? `${x7.purposes.rent} ${rm(m.rentPrice)}/m` : ''].filter(Boolean).join(' · ');
          return (
            <div key={m.id} className="mark-row" data-testid="mark-row">
              <strong>📍 {m.bannerType ? [x7.bannerTypes[m.bannerType], m.bannerPhone].filter(Boolean).join(' · ') : p ? [p.ref, cardTitle(p)].filter(Boolean).join(' · ') : m.note || `${m.lat.toFixed(5)}, ${m.lng.toFixed(5)}`}</strong>
              {m.purpose && <small>{x7.purposes[m.purpose]}{prices ? ` · ${prices}` : ''}</small>}
              {m.bannerType && m.note && <small className="muted">{m.note}</small>}
              <small className="muted">{fmtDateTime(m.at, lang)}</small>
              <div className="row-wrap">
                {p ? <button className="btn small secondary" onClick={() => go({ name: 'listingDetail', id: p.id })}>{g.openProperty}</button>
                  : <button className="btn small primary" disabled={busy === m.id} data-testid="mark-save-property"
                    onClick={async () => { setBusy(m.id); const id = await save(m); setBusy(null); onMarks(j.marks.map(x => (x.id === m.id ? { ...x, propertyId: id } : x))); }}>{x7.saveAsProperty}</button>}
                <button className="btn small secondary" onClick={() => setMoving(m)} data-testid="move-mark">✥ {g.moveMark}</button>
                <button className="btn small ghost danger-text" onClick={() => setDel(m.id)} data-testid="mark-delete">{x7.deleteMark}</button>
              </div>
            </div>
          );
        })}
      </div>
      {moving && <MoveMarkSheet lang={lang} maps={maps ?? null} mark={moving} onClose={() => setMoving(null)}
        onSave={sp => { onMarks(j.marks.map(m => (m.id === moving.id ? { ...m, lat: sp.lat, lng: sp.lng } : m))); setMoving(null); }} />}
      {del && <Confirm lang={lang} title={x7.deleteMarkQ} body={x7.deleteMarkBody} okLabel={c.delete}
        onCancel={() => setDel(null)} onOk={() => { onMarks(j.marks.filter(m => m.id !== del)); setDel(null); }} />}
    </>
  );
}

/** JoyChange007 section 3: the Mark form. Banner type, banner phone, For Sale / For Rent / Both and the matching price(s)
 *  are required; comments are optional. The position and time are taken automatically from where the agent stands. */
function MarkSheet({ lang, at, onClose, onMark }: {
  lang: Lang; at: { lat: number; lng: number }; onClose: () => void; onMark: (m: Journey['marks'][number]) => void;
}) {
  const x7 = c007Strings[lang];
  const c = strings[lang].c;
  const [bannerType, setBannerType] = useState<BannerKind | ''>('');
  const [phone, setPhone] = useState('');
  const [purpose, setPurpose] = useState<'sale' | 'rent' | 'sale_or_rent' | ''>('');
  const [salePrice, setSalePrice] = useState<number | undefined>();
  const [rentPrice, setRentPrice] = useState<number | undefined>();
  const [comments, setComments] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const sale = purpose === 'sale' || purpose === 'sale_or_rent';
  const rent = purpose === 'rent' || purpose === 'sale_or_rent';
  function save() {
    const missing = [
      !bannerType && x7.bannerType, !phone.trim() && x7.bannerPhone, !purpose && x7.purpose,
      sale && !salePrice && x7.salePrice, rent && !rentPrice && x7.rentPrice,
    ].filter(Boolean) as string[];
    if (missing.length) { setErr(x7.missing(missing.join(', '))); return; }
    onMark({
      id: newId(), lat: at.lat, lng: at.lng, at: Date.now(), bannerType: bannerType as BannerKind, bannerPhone: normalisePhone(phone) ?? phone.trim(),
      purpose: purpose as 'sale' | 'rent' | 'sale_or_rent', salePrice: sale ? salePrice : undefined, rentPrice: rent ? rentPrice : undefined, note: comments.trim() || undefined,
    });
  }
  return (
    <div className="sheet-scrim" role="presentation">
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="mk-t" data-testid="mark-sheet">
        <div className="between"><h2 id="mk-t">{x7.markTitle}</h2><button className="btn small secondary" onClick={onClose}>{c.close}</button></div>
        <label className="ff">{x7.bannerType}
          <Select value={bannerType} onChange={e => { setBannerType(e.target.value as BannerKind | ''); setErr(null); }} data-testid="mk-banner-type">
            <option value="">{x7.choose}</option>
            {(['agent', 'owner', 'maybe_owner'] as const).map(k => <option key={k} value={k}>{x7.bannerTypes[k]}</option>)}
          </Select>
        </label>
        <label className="ff">{x7.bannerPhone}
          <input type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={e => { setPhone(e.target.value); setErr(null); }} data-testid="mk-phone" />
        </label>
        <label className="ff">{x7.purpose}
          <Select value={purpose} onChange={e => { setPurpose(e.target.value as typeof purpose); setErr(null); }} data-testid="mk-purpose">
            <option value="">{x7.choose}</option>
            {(['sale', 'rent', 'sale_or_rent'] as const).map(k => <option key={k} value={k}>{x7.purposes[k]}</option>)}
          </Select>
        </label>
        {sale && <label className="ff">{x7.salePrice}<MoneyInput value={salePrice} onChange={v => { setSalePrice(v); setErr(null); }} data-field="mk-sale" /></label>}
        {rent && <label className="ff">{x7.rentPrice}<MoneyInput value={rentPrice} onChange={v => { setRentPrice(v); setErr(null); }} data-field="mk-rent" /></label>}
        <label className="ff">{x7.comments}<textarea rows={3} value={comments} onChange={e => setComments(e.target.value)} data-testid="mk-comments" /></label>
        {err && <p className="error" role="alert" data-testid="mk-error">{err}</p>}
        <div className="sheet-actions two">
          <button className="btn secondary" onClick={onClose}>{c.cancel}</button>
          <button className="btn primary" onClick={save} data-testid="mk-save">{x7.saveMark}</button>
        </div>
      </div>
    </div>
  );
}

/** "Save as property" on a mark (Joe, 21 Oct 2026: marks stay in the journey; one tap makes a pre-filled property).
 *  The new property is "Needs check", at the marked position, with what was seen. Address parts from Google Maps are
 *  used only when they match the saved lists (one lookup, logged). */
function useSaveMarkAsProperty(lang: Lang, maps: Maps | null) {
  const { store } = useApp();
  const g = gpsStrings[lang];
  const x7 = c007Strings[lang];
  const toast = useToast();
  return async (m: Journey['marks'][number]): Promise<string> => {
    const state = store.getState();
    const prefix = defaultPrefix(state.options.refPrefix, state.settings.lastPrefix);
    const no = nextNumber(state.properties.filter(p => !isForeign(state, 'properties', p.id)));
    const seen = m.bannerType ? `${x7.bannerTypes[m.bannerType]}${m.bannerPhone ? `: ${m.bannerPhone}` : ''}` : '';
    const owner = m.bannerType === 'owner' || m.bannerType === 'maybe_owner';
    const p: Listing = {
      id: newId(), created: Date.now(), updated: Date.now(), photos: [], ref: makeRef(prefix, no), refPrefix: prefix, refNo: no,
      headline: g.foundHeadline(fmtDate(m.at, lang)), extraComments: [seen, m.note].filter(Boolean).join('\n') || undefined, status: 'needs_check',
      country: state.settings.country || DEFAULT_COUNTRY, lat: m.lat, lng: m.lng, geoSource: 'gps',
      purpose: m.purpose, askingPrice: m.salePrice, monthlyRent: m.rentPrice, ownerPhone: owner ? m.bannerPhone : undefined,
      history: [{ at: Date.now(), source: 'map', summary: 'House Shopping' }],
    };
    if (maps) {
      try {
        const r = await reverseGeocode(maps, m.lat, m.lng);
        if (r) {
          const saved = (list: string, b: readonly string[]) => [...b, ...(state.options[list] ?? []).map(o => o.value)];
          const pick = (v: string | undefined, list: string, b: readonly string[]) => { const x = checkField(v, saved(list, b)); return x.status === 'ok' ? x.value : undefined; };
          p.country = pick(r.parts.country, 'country', COUNTRIES) ?? DEFAULT_COUNTRY;
          p.state = pick(r.parts.state, 'state', MY_STATES);
          p.city = pick(r.parts.city, 'city', allMalaysiaTowns());
          p.township = pick(r.parts.township, 'township', allBuiltInTownships());
          p.street = r.parts.street;
          p.placeId = r.placeId;
        }
      } catch { /* the position is saved anyway */ }
    }
    store.upsert('properties', p);
    store.setSingleton('settings', { lastPrefix: prefix });
    toast(g.savedProperty);
    return p.id;
  };
}

/** One saved journey: only its own route and marks (JoyChange007 4.5), Continue this journey / Start new journey (4.6). */
export function JourneyDetail({ lang, go, id }: { lang: Lang; go: Go; id: string }) {
  const { state, store } = useApp();
  const g = gpsStrings[lang];
  const x7 = c007Strings[lang];
  const c = strings[lang].c;
  const toast = useToast();
  const tracker = useTracker();
  const j = state.journeys.find(x => x.id === id);
  const { maps, status } = useGoogleMaps(lang);
  const [del, setDel] = useState(false);
  if (!j) return <Empty>{g.noJourneys}</Empty>;
  const busy = !!tracker.journey && tracker.journey.id !== j.id;
  return (
    <section className="stack" data-testid="journey-detail">
      <div className="card stack-sm">
        <strong data-testid="jd-area">{j.area || x7.areaUnknown}</strong>
        <small className="muted">{fmtDateTime(j.startedAt, lang)} · {x7.markedCount(j.marks.length)}</small>
      </div>
      {!isWebsite() && j.status === 'saved' && (
        <div className="two">
          <button className="btn primary" data-testid="jd-continue" onClick={() => { if (tracker.continueJourney(j.id)) go({ name: 'houseShopping' }); else toast(x7.stillRecording); }}>▶ {x7.continueJ}</button>
          <button className="btn secondary" data-testid="jd-new" onClick={() => { if (busy || tracker.journey) { toast(x7.stillRecording); return; } tracker.start(); go({ name: 'houseShopping' }); }}>＋ {x7.startNew}</button>
        </div>
      )}
      <MapsNotice lang={lang} status={status} />
      {maps
        ? <MapView maps={maps} fixedType="hybrid" fit height={320} path={displayPath(j)} markers={j.marks.map(m => ({ id: m.propertyId ?? m.id, lat: m.lat, lng: m.lng, kind: 'mark' as const }))}
          onMarkerClick={x => { if (state.properties.some(p => p.id === x)) go({ name: 'listingDetail', id: x }); }} />
        : <RouteSketch points={j.points} marks={j.marks} label={g.routeSketch} />}
      <div className="stats card">
        <div><span>{g.distance}</span><strong data-testid="jd-distance">{kmText(j.distanceM)}</strong></div>
        <div><span>{g.elapsed}</span><strong>{durationText(elapsedMs(j, j.endedAt ?? j.updated))}</strong></div>
        <div><span>{x7.marked}</span><strong>{j.marks.length}</strong></div>
      </div>
      <MarksList lang={lang} go={go} j={j} maps={maps} onMarks={marks => store.upsert('journeys', { ...j, marks })} />
      <button className="btn ghost danger-text" onClick={() => setDel(true)} data-testid="jd-delete">{g.delete}</button>
      {del && <Confirm lang={lang} title={g.deleteQ} body={c.deleteBody} onCancel={() => setDel(false)} onOk={() => { store.remove('journeys', j.id); go({ name: 'houseShopping' }); }} />}
    </section>
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

// ---------- property map ----------
export function PropertyMap({ lang, go, id }: { lang: Lang; go: Go; id?: string }) {
  const { state } = useApp();
  const g = gpsStrings[lang];
  const ls = listingStrings[lang];
  const { maps, status } = useGoogleMaps(lang);
  const list = useMemo(() => state.properties.filter(p => !p.archived).filter(hasPosition).sort((a, b) => (cardTitle(a) || '').localeCompare(cardTitle(b) || '')), [state.properties]);
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
