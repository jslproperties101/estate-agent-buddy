// JoyChange002 Change 46: after the splash screen on the very first login only, the agent picks a country. A searchable
// list, Malaysia already selected. The choice is kept on the account (so another phone, a laptop or a reinstall does not
// ask again), becomes the Country of every NEW property, and never changes a property already saved.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { config } from '../config';
import { configured, fetchAccountCountry, saveAccountCountry } from '../data/sync';
import { COUNTRIES, DEFAULT_COUNTRY, countryLabel } from '../domain/places';
import { IconLogo } from '../icons';
import { titled3 } from '../lib/titleCase';

const T = titled3({
  en: { title: 'Where do you work?', body: 'Choose your country. New properties start with it as their Country. Properties you already saved keep their address.',
    search: 'Search country', none: 'No country found.', go: 'Continue', saving: 'Saving…' },
  bm: { title: 'Di negara mana anda bekerja?', body: 'Pilih negara anda. Hartanah baharu bermula dengan negara ini. Hartanah yang telah disimpan kekal dengan alamatnya.',
    search: 'Cari negara', none: 'Tiada negara dijumpai.', go: 'Teruskan', saving: 'Menyimpan…' },
  zh: { title: '您在哪个国家工作？', body: '请选择您的国家。新房产会以此作为国家。已保存的房产保持原地址。',
    search: '搜索国家', none: '未找到国家。', go: '继续', saving: '正在保存…' },
});

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Decides whether the pick is needed, and keeps the phone and the account in step.
 *  - Signed in: the account's own country is read first; a person who chose before (on any phone) is never asked again, and
 *    a different account on the same phone gets its own answer.
 *  - Chosen while offline, or a save that failed: saved on the account as soon as it can be. */
export function useCountryChoice() {
  const { state, store } = useApp();
  const s = state.meta.syncSession;
  const st = state.settings;
  const mine = !!st.country && (!s || !st.countryUser || st.countryUser === s.userId);
  const [checked, setChecked] = useState(false);
  const busy = useRef(false);
  const uid = s?.userId;

  // Another phone (or an earlier sign-in) may already know the country.
  useEffect(() => {
    if (!s || mine) { setChecked(false); return; }
    let alive = true;
    const cfg = config(store.getState().settings);
    const known = s.country;
    if (known) { store.setSingleton('settings', { country: known, countryUser: s.userId, countryPending: false }); return; }
    if (!configured(cfg)) { setChecked(true); return; }
    void fetchAccountCountry(cfg, s).then(c => {
      if (!alive) return;
      if (c) store.setSingleton('settings', { country: c, countryUser: s.userId, countryPending: false });
      else setChecked(true);
    }).catch(() => { /* offline: asked once the account could be read, so a country chosen before is never overwritten */ });
    return () => { alive = false; };
  }, [uid, mine]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save a pending choice on the account.
  useEffect(() => {
    if (!s || !st.country || !st.countryPending || busy.current) return;
    const cfg = config(store.getState().settings);
    if (!configured(cfg)) return;
    busy.current = true;
    void saveAccountCountry(cfg, s, st.country)
      .then(() => store.setSingleton('settings', { countryPending: false, countryUser: s.userId }))
      .catch(() => undefined)
      .finally(() => { busy.current = false; });
  }, [uid, st.country, st.countryPending]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only a signed-in person is asked (the app cannot be entered without signing in), and only after the account was read.
  const ask = !mine && !!s && checked;
  const choose = (country: string) => store.setSingleton('settings', { country, countryUser: s?.userId, countryPending: !!s });
  return { ask, choose };
}

export function CountryChoice({ lang, onChoose }: { lang: Lang; onChoose: (country: string) => void }) {
  const t = T[lang];
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string>(DEFAULT_COUNTRY);
  const list = useMemo(() => {
    const n = norm(q);
    return COUNTRIES.filter(c => !n || norm(c).includes(n) || norm(countryLabel(c, lang)).includes(n));
  }, [q, lang]);
  const chosen = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { chosen.current?.scrollIntoView?.({ block: 'nearest' }); }, []);
  return (
    <div className="sheet-scrim start-scrim" role="presentation">
      <div className="sheet country-choice" role="dialog" aria-modal="true" aria-labelledby="cc-t" data-testid="country-choice">
        <span className="start-logo"><IconLogo size={56} big /></span>
        <h2 id="cc-t">{t.title}</h2>
        <p className="muted">{t.body}</p>
        <input type="search" aria-label={t.search} placeholder={t.search} value={q} onChange={e => setQ(e.target.value)} data-testid="country-search" autoComplete="off" />
        <div className="country-list" role="radiogroup" aria-label={t.title} data-testid="country-list">
          {list.length === 0 && <p className="muted">{t.none}</p>}
          {list.map(c => (
            <button key={c} type="button" role="radio" aria-checked={c === sel} className={c === sel ? 'country-row on' : 'country-row'} data-country={c}
              ref={c === sel ? chosen : undefined} onClick={() => setSel(c)}>
              <span>{countryLabel(c, lang)}</span>{c === sel && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
        <button type="button" className="btn primary big" onClick={() => onChoose(sel)} data-testid="country-continue">{t.go}</button>
      </div>
    </div>
  );
}
