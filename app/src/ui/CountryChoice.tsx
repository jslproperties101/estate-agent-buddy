// JoyChange002 Change 46: after the splash screen on the very first login only, the agent picks a country. A searchable
// list, Malaysia already selected. The choice is kept on the account (so another phone, a laptop or a reinstall does not
// ask again), becomes the Country of every NEW property, and never changes a property already saved.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Select } from './Select';
import { c00bStrings } from '../security/strings';
import { termsText, TERMS_VERSION, companyOr } from '../legal/terms';
import { rpc } from '../team/api';
import { deviceId } from '../security/loginLog';
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

/** MainForAdmin-B (JoyChange005-Main Part2 Change C): has this account accepted the current Terms? Asked only once the
 *  company's database answered for this account (an older database without the Terms record is never asked). */
export function useTermsChoice() {
  const { state, store } = useApp();
  const s = state.meta.syncSession;
  const st = state.settings;
  const acc = state.meta.account;
  const done = !!s && ((st.termsAccepted?.user === s.userId && st.termsAccepted.version === TERMS_VERSION)
    || (st.termsPending?.user === s.userId && st.termsPending.version === TERMS_VERSION)
    || (acc?.userId === s.userId && acc.terms?.version === TERMS_VERSION));
  const ask = !!s && !done && acc?.userId === s.userId;
  async function accept(marketing: boolean) {
    if (!s) return;
    const now = Date.now();
    store.setSingleton('settings', { termsAccepted: { version: TERMS_VERSION, user: s.userId, at: now }, termsPending: { version: TERMS_VERSION, marketing, user: s.userId, at: now } });
    const cfg = config(store.getState().settings);
    try {
      await rpc(store, cfg, 'eab_accept_terms', { p_version: TERMS_VERSION, p_marketing: marketing, p_device_id: deviceId() });
      store.setSingleton('settings', { termsPending: undefined });
      store.setSingleton('meta', { account: { ...(store.getState().meta.account ?? { userId: s.userId, checkedAt: now }), terms: { version: TERMS_VERSION, at: new Date(now).toISOString() }, marketing } });
    } catch { /* kept as pending; sent after the next sync (security/account.ts) */ }
  }
  return { ask, accept };
}

/** The first-login screen: the country (one box, Malaysia already chosen; tapping it opens the searchable list) and, when
 *  needed, the two consent boxes. Continue always looks the same; without the Terms tick it says why it cannot go on. */
export function CountryChoice({ lang, onChoose, askCountry = true, askTerms = false, onAccept, initial }: {
  lang: Lang; onChoose: (country: string) => void; askCountry?: boolean; askTerms?: boolean;
  onAccept?: (marketing: boolean) => void; initial?: string;
}) {
  const { state } = useApp();
  const t = T[lang];
  const x = c00bStrings[lang];
  const acc = state.meta.account;
  const [sel, setSel] = useState<string>(initial || DEFAULT_COUNTRY);
  const [agree, setAgree] = useState(false);
  const [news, setNews] = useState(false);
  const [err, setErr] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const company = acc?.companyName || '';
  const options = useMemo(() => [...COUNTRIES].map(c => ({ c, label: countryLabel(c, lang) })).sort((a, b) => a.label.localeCompare(b.label)), [lang]);
  function go() {
    if (askTerms && !agree) { setErr(true); return; }
    if (askCountry) onChoose(sel);
    if (askTerms) onAccept?.(news);
  }
  const terms = termsText(lang, { company: acc?.companyName, email: acc?.supportEmail, address: acc?.address });
  return (
    <div className="sheet-scrim start-scrim" role="presentation">
      <div className="sheet country-choice" role="dialog" aria-modal="true" aria-labelledby="cc-t" data-testid="country-choice">
        <span className="start-logo"><IconLogo size={56} big /></span>
        <h2 id="cc-t">{t.title}</h2>
        {askCountry && <>
          <label className="ff">{x.country}
            <Select value={sel} onChange={e => setSel(e.target.value)} data-testid="country-select" aria-label={x.country}>
              {options.map(o => <option key={o.c} value={o.c}>{o.label}</option>)}
            </Select>
          </label>
          <small className="muted">{x.countryHint}</small>
        </>}
        {askTerms && <>
          <label className="check" data-testid="terms-agree-row">
            <input type="checkbox" checked={agree} onChange={e => { setAgree(e.target.checked); setErr(false); }} data-testid="terms-agree" />
            <span>{x.agreeA}<button type="button" className="link-btn" onClick={e => { e.preventDefault(); setShowTerms(true); }} data-testid="terms-link">{x.agreeTerms}</button>{x.agreeB}</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={news} onChange={e => setNews(e.target.checked)} data-testid="marketing-agree" />
            <span>{x.marketing(companyOr(lang, company))}</span>
          </label>
          {err && <p className="error" role="alert" data-testid="terms-error">{x.needTerms}</p>}
        </>}
        <button type="button" className="btn primary big" onClick={go} data-testid="country-continue">{t.go}</button>
      </div>
      {showTerms && (
        <div className="sheet-scrim" role="presentation" data-testid="terms-sheet">
          <div className="sheet terms-sheet" role="dialog" aria-modal="true" aria-labelledby="tt-t">
            <div className="between"><h2 id="tt-t">{x.termsTitle}</h2><button type="button" className="btn small secondary" onClick={() => setShowTerms(false)} data-testid="terms-close">{x.close}</button></div>
            <p className="notice warn small">{x.termsDraft}</p>
            <strong>{terms.title}</strong><small className="muted">{terms.meta}</small>
            {terms.sections.map(([h, b]) => <div key={h} className="stack-sm"><strong>{h}</strong><p className="small">{b}</p></div>)}
          </div>
        </div>
      )}
    </div>
  );
}
