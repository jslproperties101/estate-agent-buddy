// Advertising & Listing Tracker: one screen per property (add / edit / delete adverts, fake test listings, status, cost, expiry)
// and an all-properties summary (what needs attention, costs by property / platform / month). Adverts are stored inside
// the property record (marketing.ads), so the property form and this tracker show the same data.
import { useMemo, useRef, useState } from 'react';
import type { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { newId } from '../data/store';
import type { Go } from '../nav';
import { Advert, AD_STATUSES, AD_TYPES, AdType, Listing, PLATFORMS, cardTitle } from '../listing/model';
import { listingStrings } from '../listing/strings';
import { adStrings } from './strings';
import { attention, costSummary, deleteAd, isRealAd, newAd, newFakeAd, saveAd, shownStatus, UNDATED, validateAd, AdIssue, DEFAULT_REMIND_DAYS } from '../domain/adverts';
import { MoneyInput } from '../ui/MoneyInput';
import { Confirm, Empty, StoredImage } from '../ui/common';
import { compressImage } from '../lib/images';
import { fmtDate, ymd } from '../lib/dates';
import { rm2 } from '../lib/money';

const OTHER = '__other__';
const title = (l: Listing) => [l.ref, cardTitle(l)].filter(Boolean).join(' · ') || '—';

export function FakeBadge({ lang }: { lang: Lang }) {
  return <span className="chip-tag fake-tag" data-testid="fake-tag">{adStrings[lang].fakeLabel}</span>;
}

function AdCard({ lang, a, today, onEdit }: { lang: Lang; a: Advert; today: string; onEdit: () => void }) {
  const t = adStrings[lang];
  const ls = listingStrings[lang];
  const st = shownStatus(a, today);
  const stale = a.status === 'live' && st === 'expired';
  return (
    <div className={`ad-card ${a.fake ? 'ad-fake' : ''}`} data-testid="ad-card" data-fake={a.fake ? 'yes' : 'no'} data-status={st ?? ''}>
      <div className="between">
        <strong>{a.platform}</strong>
        {st && <span className={`ad-st ad-${st}`} data-testid="ad-status">{ls.adStatus[st]}</span>}
      </div>
      {a.fake && <FakeBadge lang={lang} />}
      {(a.title || a.type) && <div>{a.title}{a.title && a.type ? ' · ' : ''}{a.type && <small className="muted">{t.types[a.type]}</small>}</div>}
      <small className="muted">{[a.start && fmtDate(a.start, lang), a.end && `→ ${fmtDate(a.end, lang)}`, a.ref].filter(Boolean).join(' ')}</small>
      {a.cost !== undefined && <small data-testid="ad-cost">{t.f.cost}: {rm2(a.cost)}{a.fake ? ' *' : ''}</small>}
      {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" className="small">{t.openLink}</a>}
      {a.screenshotFileId && <span className="ad-shot"><StoredImage fileId={a.screenshotFileId} alt={t.f.screenshot} /></span>}
      {stale && <small className="warn-text" data-testid="ad-stale">{t.stale}</small>}
      {a.notes && <small>{a.notes}</small>}
      <button className="btn small secondary" onClick={onEdit} data-testid="ad-edit">{t.edit}</button>
    </div>
  );
}

function Editor({ lang, l, initial, isNew, onClose }: { lang: Lang; l: Listing; initial: Advert; isNew: boolean; onClose: () => void }) {
  const { store } = useApp();
  const t = adStrings[lang];
  const ls = listingStrings[lang];
  const [a, setA] = useState<Advert>(initial);
  const [issues, setIssues] = useState<AdIssue[]>([]);
  const [confirmDel, setConfirmDel] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const set = (p: Partial<Advert>) => setA(x => ({ ...x, ...p }));
  const known = (PLATFORMS as readonly string[]).includes(a.platform);
  const [other, setOther] = useState(!known && initial.platform !== '');

  async function pick(f: File | undefined) {
    if (!f) return;
    let blob: Blob = f;
    try { blob = (await compressImage(f)).blob; } catch { /* keep the original */ }
    const id = await store.putFile(blob);
    if (a.screenshotFileId && a.screenshotFileId !== initial.screenshotFileId) store.removeFile(a.screenshotFileId);
    set({ screenshotFileId: id });
  }
  function save() {
    const clean: Advert = { ...a, platform: a.platform.trim(), url: a.url?.trim() || undefined, title: a.title?.trim() || undefined, ref: a.ref?.trim() || undefined, notes: a.notes?.trim() || undefined };
    const bad = validateAd(clean);
    setIssues(bad);
    if (bad.length) return;
    const cur = store.getState().properties.find(p => p.id === l.id);
    if (!cur) return;
    store.upsert('properties', saveAd(cur, clean, Date.now()));
    // A replaced screenshot is no longer needed once the advert is saved.
    if (initial.screenshotFileId && initial.screenshotFileId !== clean.screenshotFileId) store.removeFile(initial.screenshotFileId);
    onClose();
  }
  function cancel() {
    if (a.screenshotFileId && a.screenshotFileId !== initial.screenshotFileId) store.removeFile(a.screenshotFileId);
    onClose();
  }
  const remove = () => {
    const cur = store.getState().properties.find(p => p.id === l.id);
    if (cur) store.upsert('properties', deleteAd(cur, a.id, Date.now()));
    if (initial.screenshotFileId) store.removeFile(initial.screenshotFileId);
    onClose();
  };

  return (
    <div className="card stack-sm" data-testid="ad-editor-form">
      {a.fake && <><FakeBadge lang={lang} /><small className="muted">{t.fakeNote}</small></>}
      <label className="ff">{t.f.platform}
        <select value={other ? OTHER : a.platform} onChange={e => { if (e.target.value === OTHER) { setOther(true); set({ platform: known ? '' : a.platform }); } else { setOther(false); set({ platform: e.target.value }); } }} data-testid="ad-platform">
          {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
          <option value={OTHER}>{t.otherOption}</option>
        </select>
      </label>
      {other && <label className="ff">{t.f.platformOther}<input value={a.platform} onChange={e => set({ platform: e.target.value })} aria-invalid={issues.includes('platform')} data-testid="ad-platform-other" /></label>}
      {issues.includes('platform') && <small className="warn-text" role="alert">{t.err.platform}</small>}
      <label className="ff">{t.f.type}
        <select value={a.type ?? 'listing'} onChange={e => set({ type: e.target.value as AdType })} data-testid="ad-type">
          {AD_TYPES.map(x => <option key={x} value={x}>{t.types[x]}</option>)}
        </select>
      </label>
      <label className="ff">{t.f.title}<input value={a.title ?? ''} onChange={e => set({ title: e.target.value })} data-testid="ad-title" /></label>
      <label className="ff">{t.f.url}<input inputMode="url" value={a.url ?? ''} onChange={e => set({ url: e.target.value })} aria-invalid={issues.includes('url')} data-testid="ad-url" /></label>
      {issues.includes('url') && <small className="warn-text" role="alert">{t.err.url}</small>}
      <label className="ff">{t.f.ref}<input value={a.ref ?? ''} onChange={e => set({ ref: e.target.value })} data-testid="ad-ref" /></label>
      <label className="ff">{t.f.status}
        <select value={a.status ?? ''} onChange={e => set({ status: (e.target.value || undefined) as Advert['status'] })} data-testid="ad-status-select">
          <option value="">{ls.notSet}</option>{AD_STATUSES.map(x => <option key={x} value={x}>{ls.adStatus[x]}</option>)}
        </select>
      </label>
      <div className="two">
        <label className="ff">{t.f.start}<input type="date" value={a.start ?? ''} onChange={e => set({ start: e.target.value || undefined })} data-testid="ad-start" /></label>
        <label className="ff">{t.f.end}<input type="date" value={a.end ?? ''} onChange={e => set({ end: e.target.value || undefined })} data-testid="ad-end" /></label>
      </div>
      {issues.includes('dates') && <small className="warn-text" role="alert">{t.err.dates}</small>}
      <label className="ff">{t.f.remind}
        <select value={a.remindDays ?? DEFAULT_REMIND_DAYS} onChange={e => set({ remindDays: Number(e.target.value) })} data-testid="ad-remind">
          {[0, 1, 3, 7, 14].map(d => <option key={d} value={d}>{t.remindOpt(d)}</option>)}
        </select>
      </label>
      <label className="ff">{t.f.cost} (RM)<MoneyInput value={a.cost} onChange={n => set({ cost: n })} aria-label={t.f.cost} data-field="ad-cost" /></label>
      {issues.includes('cost') && <small className="warn-text" role="alert">{t.err.cost}</small>}
      <label className="ff">{t.f.notes}<input value={a.notes ?? ''} onChange={e => set({ notes: e.target.value })} data-testid="ad-notes" /></label>
      <div className="stack-sm">
        <strong>{t.f.screenshot}</strong><small className="muted">{t.screenshotHelp}</small>
        {a.screenshotFileId && <span className="ad-shot"><StoredImage fileId={a.screenshotFileId} alt={t.f.screenshot} /></span>}
        <input ref={file} type="file" accept="image/*" hidden onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }} data-testid="ad-shot-input" />
        <div className="two">
          <button type="button" className="btn small secondary" onClick={() => file.current?.click()} data-testid="ad-shot-add">{a.screenshotFileId ? t.changeShot : t.addShot}</button>
          {a.screenshotFileId && <button type="button" className="btn small ghost" onClick={() => set({ screenshotFileId: undefined })} data-testid="ad-shot-remove">{t.removeShot}</button>}
        </div>
      </div>
      <div className="two">
        <button className="btn primary" onClick={save} data-testid="ad-save">{t.save}</button>
        <button className="btn secondary" onClick={cancel} data-testid="ad-cancel">{t.cancel}</button>
      </div>
      {!isNew && <button className="btn small secondary danger-text" onClick={() => setConfirmDel(true)} data-testid="ad-delete">{t.del}</button>}
      {confirmDel && <Confirm lang={lang} title={t.delTitle} body={t.delBody} okLabel={t.del} onOk={remove} onCancel={() => setConfirmDel(false)} />}
    </div>
  );
}

export function AdTrackerScreen({ lang, go, propertyId }: { lang: Lang; go: Go; propertyId: string }) {
  const { state, store } = useApp();
  const t = adStrings[lang];
  const l = state.properties.find(p => p.id === propertyId);
  const [editing, setEditing] = useState<{ ad: Advert; isNew: boolean } | null>(null);
  const today = ymd(new Date());
  if (!l) return <section className="stack"><p className="warn-text" data-testid="ad-gone">{t.noProperty}</p></section>;
  const ads = l.marketing?.ads ?? [];
  const real = ads.filter(a => isRealAd(l, a));
  const tests = ads.filter(a => a.fake);
  const total = real.reduce((n, a) => n + (a.cost ?? 0), 0);
  const markExpired = (a: Advert) => store.upsert('properties', saveAd(l, { ...a, status: 'expired' }, Date.now()));
  return (
    <section className="stack" data-testid="ad-tracker">
      <p className="notice">{t.intro}</p>
      <p className="small muted">{title(l)}</p>
      {l.sample && <p className="notice" data-testid="ad-sample-note">{t.sampleNote}</p>}
      {!editing && (
        <div className="two">
          <button className="btn primary" onClick={() => setEditing({ ad: newAd(newId()), isNew: true })} data-testid="ad-add">+ {t.add}</button>
          <button className="btn secondary" onClick={() => setEditing({ ad: newFakeAd(newId()), isNew: true })} data-testid="ad-add-fake">+ {t.addFake}</button>
        </div>
      )}
      {editing && <Editor key={editing.ad.id} lang={lang} l={l} initial={editing.ad} isNew={editing.isNew} onClose={() => setEditing(null)} />}
      {!ads.length && !editing && <Empty><span data-testid="ad-none">{t.none}</span></Empty>}
      {ads.length > 0 && (
        <small className="muted" data-testid="ad-total">{t.sum.total}: {rm2(total)} · {t.sum.adverts(real.length)}{tests.length > 0 ? ` · ${t.testsOut(tests.length)}` : ''}</small>
      )}
      {ads.map(a => (
        <div key={a.id}>
          <AdCard lang={lang} a={a} today={today} onEdit={() => setEditing({ ad: a, isNew: false })} />
          {a.status === 'live' && shownStatus(a, today) === 'expired' && !a.fake && <button className="btn small secondary" onClick={() => markExpired(a)} data-testid="ad-mark-expired">{t.markExpired}</button>}
        </div>
      ))}
      <button className="btn secondary" onClick={() => go({ name: 'adSummary' })} data-testid="ad-open-summary">{t.sum.all}</button>
    </section>
  );
}

export function AdSummaryScreen({ lang, go }: { lang: Lang; go: Go }) {
  const { state } = useApp();
  const t = adStrings[lang];
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const today = ymd(new Date());
  const att = useMemo(() => attention(state.properties, today), [state.properties, today]);
  const sum = useMemo(() => costSummary(state.properties, title, { from: from || undefined, to: to || undefined }), [state.properties, from, to]);
  const byId = new Map(state.properties.map(p => [p.id, p]));
  const Lines = ({ lines, testId, link }: { lines: typeof sum.byProperty; testId: string; link?: boolean }) => (
    <ul className="sum-list" data-testid={testId}>
      {lines.map(x => (
        <li key={x.key} className="between" data-key={x.key}>
          {link ? <button className="link-row" onClick={() => go({ name: 'adTracker', propertyId: x.key })}><span>{x.label}</span></button> : <span>{x.key === UNDATED ? t.sum.undated : x.label}</span>}
          <span><strong>{rm2(x.total)}</strong> <small className="muted">· {t.sum.adverts(x.count)}</small></span>
        </li>
      ))}
    </ul>
  );
  return (
    <section className="stack" data-testid="ad-summary">
      <div className="card stack-sm" data-testid="ad-attention">
        <strong>{t.attention}</strong>
        {!att.length && <small className="muted">{t.attentionNone}</small>}
        {att.map(x => {
          const p = byId.get(x.propertyId); const a = p?.marketing?.ads.find(z => z.id === x.adId);
          if (!p || !a) return null;
          const msg = x.kind === 'needs_update' ? t.attn.needs_update : x.kind === 'expired' ? t.attn.expired(x.days ?? 0) : t.attn.expiring(x.days ?? 0);
          return (
            <button key={x.adId} className="link-row" data-kind={x.kind} data-testid="ad-attention-item" onClick={() => go({ name: 'adTracker', propertyId: p.id })}>
              <strong>{a.platform} · {title(p)}</strong><small className={x.kind === 'expiring' ? 'muted' : 'warn-text'}>{msg}</small>
            </button>
          );
        })}
      </div>
      <div className="card stack-sm" data-testid="ad-costs">
        <div className="two">
          <label className="ff">{t.sum.from}<input type="date" value={from} onChange={e => setFrom(e.target.value)} data-testid="sum-from" /></label>
          <label className="ff">{t.sum.to}<input type="date" value={to} onChange={e => setTo(e.target.value)} data-testid="sum-to" /></label>
        </div>
        <div className="between"><strong>{t.sum.total}</strong><strong data-testid="sum-total">{rm2(sum.total)}</strong></div>
        <small className="muted" data-testid="sum-count">{t.sum.adverts(sum.count)}{sum.withoutCost > 0 ? ` · ${t.sum.noCost(sum.withoutCost)}` : ''}</small>
        {sum.count === 0 && <small className="muted" data-testid="sum-empty">{t.sum.empty}</small>}
        {sum.count > 0 && <>
          <small className="muted">{t.sum.byProperty}</small><Lines lines={sum.byProperty} testId="sum-property" link />
          <small className="muted">{t.sum.byPlatform}</small><Lines lines={sum.byPlatform} testId="sum-platform" />
          <small className="muted">{t.sum.byMonth}</small><Lines lines={sum.byMonth} testId="sum-month" />
        </>}
        {(sum.testCount > 0 || sum.sampleCount > 0) && <small className="muted" data-testid="sum-excluded">{t.sum.excluded(sum.testCount, sum.sampleCount)}</small>}
      </div>
    </section>
  );
}
