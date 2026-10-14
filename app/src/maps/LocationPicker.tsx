// "Add from Google Map" in the property form: pick the spot, read the address from Google, then check each part
// against the saved dropdown values. Differences are shown with Use existing / Add new / Enter another, and a new
// dropdown value is saved only when the agent chooses it and taps "Use this location".
// pointOnly (Change 009: Add Location, and a banner's location): only the map point is chosen and saved. The address is
// not read from Google, not compared and never changed.
import { useEffect, useMemo, useState } from 'react';
import { Lang, strings } from '../i18n';
import { useApp } from '../data/useStore';
import { mapStrings } from './strings';
import { MapView, MapsNotice, useGoogleMaps } from './MapView';
import { reverseGeocode, searchPlaces, GeocodeResult, Suggestion } from './google';
import { checkField, COUNTRIES, MY_STATES, allBuiltInCities, allBuiltInTownships, FieldCheck } from '../domain/places';
import { listingStrings } from '../listing/strings';
import type { Listing } from '../listing/model';

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
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(start ??
    (typeof current.lat === 'number' && typeof current.lng === 'number' ? { lat: current.lat, lng: current.lng } : null));
  const [geo, setGeo] = useState<GeocodeResult | null>(null);
  const [reading, setReading] = useState(false);
  const [noAddress, setNoAddress] = useState(false);
  const [q, setQ] = useState('');
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [searchOff, setSearchOff] = useState(false);
  const [choices, setChoices] = useState<Partial<Record<FieldKey, Choice>>>({});
  const [typing, setTyping] = useState<Partial<Record<FieldKey, string>>>({});
  const [picking, setPicking] = useState<FieldKey | null>(null);

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

  // Search suggestions as the agent types.
  useEffect(() => {
    if (!maps || q.trim().length < 3) { setSugs([]); return; }
    let live = true;
    const t = setTimeout(() => {
      searchPlaces(maps, q, pos ?? undefined).then(x => { if (live) { setSugs(x); setSearchOff(x.length === 0 && !(maps as { importLibrary?: unknown }).importLibrary); } })
        .catch(() => { if (live) { setSugs([]); setSearchOff(true); } });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [q, maps]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const [gpsErr, setGpsErr] = useState<'denied' | 'off' | null>(null);
  const [locating, setLocating] = useState(false);
  function locate() {
    setGpsErr(null);
    if (!('geolocation' in navigator)) { setGpsErr('off'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      p => { setLocating(false); void readAt(p.coords.latitude, p.coords.longitude); },
      e => { setLocating(false); setGpsErr(e.code === 1 ? 'denied' : 'off'); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 },
    );
  }

  const label = (k: FieldKey) => m.field[k];
  const choose = (k: FieldKey, ch: Choice) => setChoices(x => ({ ...x, [k]: ch }));

  return (
    <div className="sheet-scrim" role="presentation">
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="lp-t" data-testid="location-picker">
        <div className="between"><h2 id="lp-t">{title ?? m.pickTitle}</h2><button className="btn small secondary" onClick={onCancel}>{c.close}</button></div>
        <MapsNotice lang={lang} status={status} />
        {maps && (
          <>
            <div className="search-box">
              <input aria-label={m.searchPh} placeholder={m.searchPh} value={q} onChange={e => setQ(e.target.value)} />
              {sugs.length > 0 && (
                <ul className="sugs">
                  {sugs.map((s, i) => (
                    <li key={i}><button type="button" onClick={async () => {
                      setSugs([]); setQ(s.text);
                      const r = await s.select().catch(() => null);
                      if (r) { setPos({ lat: r.lat, lng: r.lng }); if (!pointOnly) setGeo(r); setChoices({}); setNoAddress(false); }
                    }}><strong>{s.text}</strong>{s.secondary && <small className="muted"> {s.secondary}</small>}</button></li>
                  ))}
                </ul>
              )}
              {searchOff && q.trim().length >= 3 && <small className="muted">{m.searchUnavailable}</small>}
            </div>
            <small className="muted">{m.tapHint}</small>
            <MapView maps={maps} center={pos ?? undefined} zoom={pos ? 17 : 13} height={260} testId="picker-map"
              markers={pos ? [{ id: 'pick', lat: pos.lat, lng: pos.lng, kind: 'pick' }] : []}
              onMapClick={(lat, lng) => void readAt(lat, lng)} onMarkerDrag={(_, lat, lng) => void readAt(lat, lng)} />
            <button className="btn secondary" onClick={locate} disabled={locating} data-testid="picker-gps">📍 {locating ? m.locatingMe : m.myLocation}</button>
            {gpsErr && <p className="error" role="alert">{gpsErr === 'denied' ? m.meDenied : m.check.gpsOff}</p>}
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
                      <select value={ch.value ?? ''} onChange={e => choose(f.key, { kind: 'existing', value: e.target.value || undefined })}>
                        <option value="">{c.choose}</option>
                        {saved.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
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
