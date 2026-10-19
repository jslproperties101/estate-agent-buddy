// "Add from Google Map" in the property form: pick the spot, read the address from Google, then check each part
// against the saved dropdown values. Differences are shown with Use existing / Add new / Enter another, and a new
// dropdown value is saved only when the agent chooses it and taps "Use this location".
// pointOnly (Change 009: Add Location, and a banner's location): only the map point is chosen and saved. The address is
// not read from Google, not compared and never changed.
import { useEffect, useMemo, useState } from 'react';
import { IconClose } from '../icons';
import { Lang, strings } from '../i18n';
import { useApp } from '../data/useStore';
import { mapStrings } from './strings';
import { MapView, MapsNotice, useGoogleMaps } from './MapView';
import { reverseGeocode, geocodeAddress, searchPlaces, GeocodeResult, Suggestion } from './google';
import { c1017Strings } from '../ui/c1017Strings';
import { usage } from '../usage/logger';
import { checkField, COUNTRIES, MY_STATES, allBuiltInCities, allBuiltInTownships, FieldCheck } from '../domain/places';
import { listingStrings } from '../listing/strings';
import type { Listing } from '../listing/model';
import { Select } from '../ui/Select';

type FieldKey = 'country' | 'state' | 'city' | 'township' | 'street';
const FIELDS: { key: FieldKey; list?: string; builtIns: () => readonly string[] }[] = [
  { key: 'country', list: 'country', builtIns: () => COUNTRIES },
  { key: 'state', list: 'state', builtIns: () => MY_STATES },
  { key: 'city', list: 'city', builtIns: allBuiltInCities },
  { key: 'township', list: 'township', builtIns: allBuiltInTownships },
  { key: 'street', builtIns: () => [] },
];

export interface LocationResult { lat: number; lng: number; placeId?: string; fields: Partial<Record<FieldKey, string>> }

type Choice = { kind: 'existing' | 'google' | 'typed' | 'empty'; value?: string };

export function LocationPicker({ lang, current, onApply, onCancel, pointOnly, title, start }: {
  lang: Lang; current: Listing; onApply: (r: LocationResult) => void; onCancel: () => void;
  pointOnly?: boolean; title?: string; start?: { lat: number; lng: number };
}) {
  const { state, store } = useApp();
  const m = mapStrings[lang];
  const c = strings[lang].c;
  const ls = listingStrings[lang];
  const { maps, status } = useGoogleMaps(lang);
  // Change 19: Google calls made while this pop-up is open are noted as coming from "location-picker".
  useEffect(() => { usage.setOverlay('location-picker'); return () => usage.setOverlay(''); }, []);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(start ??
    (typeof current.lat === 'number' && typeof current.lng === 'number' ? { lat: current.lat, lng: current.lng } : null));
  const [geo, setGeo] = useState<GeocodeResult | null>(null);
  const [reading, setReading] = useState(false);
  const [noAddress, setNoAddress] = useState(false);
  const [choices, setChoices] = useState<Partial<Record<FieldKey, Choice>>>({});
  const [typing, setTyping] = useState<Partial<Record<FieldKey, string>>>({});
  const [picking, setPicking] = useState<FieldKey | null>(null);
  // Owner, 17 Oct 2026: a search bar above the map (supersedes Change 015's "no search here"). Choosing a result only
  // moves the pin there; nothing is saved until "Use this location".
  const t17 = c1017Strings[lang];
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Suggestion[] | null>(null);
  async function runSearch() {
    const q = query.trim();
    if (!maps || !q || searching) return;
    setSearching(true); setResults(null);
    try {
      let found = await searchPlaces(maps, q, pos ?? undefined).catch(() => [] as Suggestion[]);
      if (!found.length) {
        // No Places library for this key, or nothing suggested: one plain address look-up instead.
        const g = await geocodeAddress(maps, q).catch(() => null);
        if (g) found = [{ text: g.formatted || q, select: async () => g }];
      }
      setResults(found);
    } finally { setSearching(false); }
  }
  async function chooseResult(x: Suggestion) {
    const g = await x.select().catch(() => null);
    setResults(null);
    if (g) await readAt(g.lat, g.lng); else setResults([]);
  }

  const savedFor = (f: typeof FIELDS[number]) => f.list ? [...f.builtIns(), ...(state.options[f.list] ?? []).map(o => o.value)] : [];

  async function readAt(lat: number, lng: number) {
    setPos({ lat, lng }); setChoices({}); setTyping({}); setNoAddress(false);
    if (!maps || pointOnly) return;
    setReading(true);
    try {
      const r = await reverseGeocode(maps, lat, lng);
      setGeo(r);
      if (!r) setNoAddress(true);
    } catch { setGeo(null); setNoAddress(true); }
    setReading(false);
  }

  const checks = useMemo(() => {
    const out: Partial<Record<FieldKey, FieldCheck>> = {};
    if (!geo) return out;
    for (const f of FIELDS) {
      const cur = (current[f.key] as string | undefined) || undefined;
      const g = geo.parts[f.key];
      const chk = checkField(g, savedFor(f), cur);
      // A street has no saved list: Google's street is simply used when the property has none yet.
      out[f.key] = !f.list && chk.status === 'diff' && !cur ? { status: 'ok', value: chk.google, google: chk.google, rewritten: false } : chk;
    }
    return out;
  }, [geo, state.options]); // eslint-disable-line react-hooks/exhaustive-deps

  const diffs = FIELDS.filter(f => checks[f.key]?.status === 'diff');
  const unresolved = diffs.filter(f => {
    const ch = choices[f.key];
    return !ch || (ch.kind === 'typed' && !ch.value?.trim()) || (ch.kind === 'existing' && !ch.value);
  });

  function apply() {
    if (!pos) return;
    if (pointOnly) { onApply({ lat: pos.lat, lng: pos.lng, fields: {} }); return; }
    const fields: Partial<Record<FieldKey, string>> = {};
    for (const f of FIELDS) {
      const chk = checks[f.key];
      if (!chk || chk.status === 'none') continue;
      if (chk.status === 'ok') { fields[f.key] = chk.value; continue; }
      const ch = choices[f.key]!;
      const v = ch.kind === 'google' ? chk.google : ch.kind === 'empty' ? '' : ch.value?.trim() ?? '';
      fields[f.key] = v || undefined;
      // Saved to the dropdown only now, after the agent chose to add it.
      if (f.list && v && (ch.kind === 'google' || ch.kind === 'typed')) store.addOption(f.list, v);
    }
    onApply({ lat: pos.lat, lng: pos.lng, placeId: geo?.placeId, fields });
  }

  const label = (k: FieldKey) => m.field[k];
  const choose = (k: FieldKey, ch: Choice) => setChoices(x => ({ ...x, [k]: ch }));

  // Change 015 (supersedes Change 011's "hidden while the picker is open"): a larger popup, but not full screen. It sits
  // near the top with a small margin and ends above the fixed bottom advert, which stays visible, and never reaches the
  // phone's navigation area. Owner, 17 Oct 2026: Hybrid view only (no Map / Satellite / Hybrid buttons) and a search bar;
  // opening it still asks for nothing (a search runs only when the agent presses Search): the map follows you only when
  // location was already allowed, and the ◎ button on the map stays.
  const mapH = usePopupMapHeight();
  return (
    <div className="sheet-scrim lp-scrim" role="presentation">
      <div className="sheet lp-sheet" role="dialog" aria-modal="true" aria-labelledby="lp-t" data-testid="location-picker">
        <div className="lp-head"><h2 id="lp-t">{title ?? m.pickTitle}</h2>
          <button type="button" className="icon-btn lp-close" onClick={onCancel} aria-label={c.close} title={c.close} data-testid="picker-close"><IconClose /></button></div>
        <MapsNotice lang={lang} status={status} />
        {maps && (
          <>
            <form className="lp-search" role="search" data-testid="picker-search" onSubmit={(e: { preventDefault: () => void }) => { e.preventDefault(); void runSearch(); }}>
              <input type="search" aria-label={t17.mapSearch} placeholder={t17.mapSearch} value={query} onChange={e => setQuery(e.target.value)} data-testid="picker-search-input" />
              <button type="submit" className="btn primary small" disabled={!query.trim() || searching} data-testid="picker-search-btn">{searching ? t17.mapSearching : t17.mapSearchBtn}</button>
            </form>
            {results && (results.length === 0
              ? <small className="warn-text" role="status" data-testid="picker-search-none">{t17.mapNoResults}</small>
              : <div className="lp-results" data-testid="picker-search-results">{results.map((x, i) => (
                  <button key={i} type="button" onClick={() => void chooseResult(x)} data-testid="picker-search-result"><strong>{x.text}</strong>{x.secondary && <small className="muted">{x.secondary}</small>}</button>
                ))}</div>)}
            <small className="muted">{m.tapHint}</small>
            <MapView maps={maps} center={pos ?? undefined} zoom={pos ? 17 : 13} height={mapH - (results?.length ? 120 : 52)} testId="picker-map" fixedType="hybrid"
              markers={pos ? [{ id: 'pick', lat: pos.lat, lng: pos.lng, kind: 'pick' }] : []}
              onMapClick={(lat, lng) => void readAt(lat, lng)} onMarkerDrag={(_, lat, lng) => void readAt(lat, lng)} />
            {pos && <small className="ok-text" data-testid="picker-pos">{pointOnly ? `✓ ${ls.n9.pointChosen}` : ls.position(pos.lat.toFixed(5), pos.lng.toFixed(5))}</small>}
            {pointOnly && <small className="muted" data-testid="point-only-note">{ls.n9.pointOnlyNote}</small>}
          </>
        )}
        {reading && <p className="muted" role="status">{m.reading}</p>}
        {noAddress && <p className="warn-text">{m.noAddress}</p>}
        {geo && !reading && (
          <div className="card stack-sm" data-testid="geo-result">
            <div className="card-title">{m.found}</div>
            <p className="small">{geo.formatted}</p>
            <small className="muted">{ls.position(geo.lat.toFixed(5), geo.lng.toFixed(5))}</small>
            {FIELDS.map(f => {
              const chk = checks[f.key];
              if (!chk || chk.status !== 'ok') return null;
              return <div key={f.key} className="small" data-testid={`ok-${f.key}`}>✓ <strong>{label(f.key)}:</strong> {chk.value}{chk.rewritten && <span className="muted"> · {m.sameAs(chk.value, chk.google)}</span>}</div>;
            })}
          </div>
        )}
        {geo && !reading && diffs.length > 0 && (
          <div className="card stack-sm diff-card" data-testid="discrepancies">
            <div className="card-title">{m.diffTitle}</div>
            <small className="muted">{m.diffHelp}</small>
            {diffs.map(f => {
              const chk = checks[f.key] as Extract<FieldCheck, { status: 'diff' }>;
              const ch = choices[f.key];
              const existing = chk.current ?? chk.closest;
              const saved = savedFor(f);
              return (
                <div key={f.key} className="sub-card stack-sm" data-testid={`diff-${f.key}`}>
                  <strong>{label(f.key)}</strong>
                  <div className="diff-row"><span className="muted">{m.google}:</span> <span>{chk.google}</span></div>
                  {chk.current && <div className="diff-row"><span className="muted">{m.now}:</span> <span>{chk.current}</span></div>}
                  {!chk.current && chk.closest && <div className="diff-row"><span className="muted">{m.saved}:</span> <span>{chk.closest}</span></div>}
                  <div className="chip-row">
                    <button type="button" className={`chip-btn ${ch?.kind === 'existing' ? 'on' : ''}`} aria-pressed={ch?.kind === 'existing'}
                      disabled={!existing && !(f.list && saved.length)}
                      onClick={() => { if (existing) choose(f.key, { kind: 'existing', value: existing }); else { setPicking(f.key); choose(f.key, { kind: 'existing' }); } }}>{m.useExisting}</button>
                    <button type="button" className={`chip-btn ${ch?.kind === 'google' ? 'on' : ''}`} aria-pressed={ch?.kind === 'google'} onClick={() => choose(f.key, { kind: 'google' })}>{m.addNew}</button>
                    <button type="button" className={`chip-btn ${ch?.kind === 'typed' ? 'on' : ''}`} aria-pressed={ch?.kind === 'typed'} onClick={() => choose(f.key, { kind: 'typed', value: typing[f.key] ?? '' })}>{m.enterAnother}</button>
                  </div>
                  {ch?.kind === 'existing' && (picking === f.key || (!existing && f.list)) && (
                    <label className="ff">{m.chooseSaved}
                      <Select value={ch.value ?? ''} onChange={e => choose(f.key, { kind: 'existing', value: e.target.value || undefined })}>
                        <option value="">{c.choose}</option>
                        {saved.map(v => <option key={v} value={v}>{v}</option>)}
                      </Select>
                    </label>
                  )}
                  {ch?.kind === 'typed' && (
                    <input aria-label={`${m.enterAnother}: ${label(f.key)}`} autoFocus value={typing[f.key] ?? ''}
                      onChange={e => { setTyping(x => ({ ...x, [f.key]: e.target.value })); choose(f.key, { kind: 'typed', value: e.target.value }); }} />
                  )}
                  {ch && (ch.kind !== 'existing' || ch.value) && (ch.kind !== 'typed' || ch.value?.trim()) && (
                    <small className="ok-text">{m.chosen(ch.kind === 'google' ? chk.google : ch.value ?? '')}</small>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {geo && unresolved.length > 0 && <p className="warn-text" role="status">{m.needChoice}</p>}
        <div className="two sheet-actions">
          <button className="btn secondary" onClick={onCancel}>{c.cancel}</button>
          <button className="btn primary" disabled={!pos || reading || unresolved.length > 0} onClick={apply} data-testid="apply-location">{pointOnly ? ls.n9.usePoint : m.apply}</button>
        </div>
      </div>
    </div>
  );
}

/** The popup's map height: most of the screen between the top margin and the bottom advert, leaving room for the title,
 *  the hint, the chosen-point line and the two buttons. Follows screen rotation and advert height changes. */
function usePopupMapHeight(): number {
  const calc = () => {
    if (typeof window === 'undefined') return 420;
    const ad = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ad-h')) || 0;
    return Math.max(260, Math.round(window.innerHeight - ad - 250));
  };
  const [h, setH] = useState(calc);
  useEffect(() => {
    const on = () => setH(calc());
    window.addEventListener('resize', on);
    const t = setInterval(on, 1000); // the advert height arrives after the banner loads
    return () => { window.removeEventListener('resize', on); clearInterval(t); };
  }, []);
  return h;
}
