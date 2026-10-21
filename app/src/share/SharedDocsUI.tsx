// JoyChange010-04: the Shared Documents tray. Files shared into the app from WhatsApp (or any app) wait here; the agent
// opens one to look, moves it to a property and one of its document folders, or deletes it.
import { useState } from 'react';
import type { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { useToast } from '../ui/toast';
import { Confirm } from '../ui/common';
import { Select as PickList } from '../ui/Select';
import { PropertyPicker } from '../ui/PropertyPicker';
import { listingStrings } from '../listing/strings';
import { cardTitle, CONFIDENTIAL_DOCS, DOC_CATEGORIES, type DocCategory } from '../listing/model';
import { fmtBytes } from '../exports/report';
import { fmtDate } from '../lib/dates';
import { sharedTray, movableTargets, moveSharedToProperty, removeShared, type SharedFile } from './inbox';
import { shareStrings } from './strings';

/** A first guess of the folder from the file's name (the agent can change it). */
export function guessFolder(name: string): DocCategory {
  const n = name.toLowerCase();
  if (/floor ?plan|layout|pelan lantai|平面/.test(n)) return 'floorplan';
  if (/geran|hakmilik|title|grant|strata|地契/.test(n)) return 'title';
  if (/brochure|brosur|宣传/.test(n)) return 'brochure';
  if (/\b(spa|tenancy|ta|booking|loan|sale|sewa|jual)\b|agreement|perjanjian|tempahan|合约|租约/.test(n)) return 'transaction';
  return 'other';
}

export function SharedDocsScreen({ lang }: { lang: Lang }) {
  const { state, store } = useApp();
  const t = shareStrings[lang];
  const tray = sharedTray(state);
  const [del, setDel] = useState<SharedFile | null>(null);
  const toast = useToast();
  return (
    <section className="stack" data-testid="shared-docs">
      <small className="muted">{t.trayNote}</small>
      {!tray.length && (
        <div className="card stack-sm" data-testid="shared-empty"><strong>{t.empty}</strong><small className="muted">{t.how}</small></div>
      )}
      {tray.map(f => <SharedRow key={f.id} f={f} lang={lang} onDelete={() => setDel(f)} />)}
      {del && <Confirm lang={lang} title={t.delQ} body={t.delBody(del.name)} okLabel={t.del}
        onCancel={() => setDel(null)}
        onOk={() => { const ok = removeShared(store, del.id); setDel(null); toast(ok ? t.deleted : t.gone, ok ? 'ok' : 'error'); }} />}
    </section>
  );
}

function SharedRow({ f, lang, onDelete }: { f: SharedFile; lang: Lang; onDelete: () => void }) {
  const { state, store } = useApp();
  const t = shareStrings[lang];
  const ls = listingStrings[lang];
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pid, setPid] = useState<string | undefined>();
  const [cat, setCat] = useState<DocCategory>(() => guessFolder(f.name));
  const targets = movableTargets(state);
  async function move() {
    if (!pid) { toast(t.noProperty, 'error'); return; }
    const r = await moveSharedToProperty(store, f.id, pid, cat);
    if (r === 'moved') {
      await store.flush();   // the message means it is saved on the phone
      const p = store.getState().properties.find(x => x.id === pid);
      toast(t.moved(ls.docCat[cat], (p && (p.ref || cardTitle(p))) || ls.untitled));
    } else toast(r === 'not-allowed' ? t.notAllowed : r === 'no-file' ? t.gone : t.noProperty, 'error');
  }
  return (
    <div className="card stack-sm" data-testid="shared-file" data-id={f.id}>
      <div className="doc-row">
        <span className="stack-xs"><strong data-testid="shared-name">{f.name}</strong>
          <small className="muted">{[fmtBytes(f.bytes), t.added(fmtDate(f.added, lang))].join(' · ')}</small></span>
      </div>
      <div className="two-wrap">
        <button type="button" className="btn small secondary" data-testid="shared-open"
          onClick={() => void store.fileUrl(f.fileId).then(u => { if (u) window.open(u, '_blank'); })}>{t.open}</button>
        <button type="button" className="btn small primary" data-testid="shared-move" aria-expanded={open} onClick={() => setOpen(o => !o)}>{t.moveToProperty}</button>
        <button type="button" className="btn small secondary danger-text" data-testid="shared-delete" onClick={onDelete}>{t.del}</button>
      </div>
      {open && (
        <div className="sub-card stack-sm" data-testid="shared-move-panel">
          <PropertyPicker lang={lang} list={targets} value={pid} onChange={setPid} label={t.property} allowNone={false} testId="shared-property" />
          <label className="ff"><span>{t.folder}</span>
            <PickList aria-label={t.folder} data-testid="shared-folder" value={cat} onChange={e => setCat(e.target.value as DocCategory)}>
              {DOC_CATEGORIES.map(c => <option key={c} value={c}>{ls.docCat[c]}{CONFIDENTIAL_DOCS.includes(c) ? ' 🔒' : ''}</option>)}
            </PickList>
          </label>
          <div className="two">
            <button type="button" className="btn secondary" onClick={() => setOpen(false)}>{t.cancel}</button>
            <button type="button" className="btn primary" data-testid="shared-move-go" onClick={() => void move()}>{t.move}</button>
          </div>
        </div>
      )}
    </div>
  );
}
