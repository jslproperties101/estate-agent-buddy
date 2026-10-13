// Buyer PDF: the agent ticks the details and photos that go into a buyer-facing PDF, previews the real pages, then shares
// or saves it. Built on the phone from the property record; nothing is uploaded.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { StoredImage } from '../ui/common';
import { PdfPreview } from '../ui/PdfPreview';
import { cardTitle } from './model';
import {
  AgentChoice, BUYER_GROUPS, MAX_PDF_PHOTOS, buildBuyerDoc, buyerFields, buyerStrings, defaultAgentChoice, defaultSelection,
} from './buyerPdf';
import { VOICE_LANGS } from '../voice/recognizer';
import type { Doc } from '../lib/pdf';

type Ready = { photos: { src: string; w: number; h: number }[]; skipped: number };

function imageSize(src: string): Promise<{ w: number; h: number } | undefined> {
  return new Promise(res => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res(undefined); im.src = src; });
}

export function BuyerPdfScreen({ lang, propertyId }: { lang: Lang; propertyId: string }) {
  const { state, store } = useApp();
  const l = state.properties.find(p => p.id === propertyId);
  const [pdfLang, setPdfLang] = useState<Lang>(lang);
  const b = buyerStrings[lang];
  const fields = useMemo(() => (l ? buyerFields(l, pdfLang) : []), [l, pdfLang]);
  const [sel, setSel] = useState<Record<string, boolean> | null>(null);
  const selected = sel ?? defaultSelection(fields);
  const photoList = l?.photos ?? [];
  const mainId = l?.mainPhotoId ?? photoList[0]?.id;
  const [photoSel, setPhotoSel] = useState<Record<string, boolean> | null>(null);
  const photosOn = photoSel ?? Object.fromEntries(photoList.slice(0, 6).map(p => [p.id, true]));
  const profile = state.profile;
  const [agentChoice, setAgentChoice] = useState<AgentChoice>(() => defaultAgentChoice(profile));
  const [ready, setReady] = useState<Ready | null>(null);
  const [busy, setBusy] = useState(false);
  const urls = useRef<string[]>([]);
  useEffect(() => () => { urls.current.forEach(u => URL.revokeObjectURL(u)); urls.current = []; }, []);

  if (!l) return <section className="stack"><p className="warn-text" data-testid="buyer-pdf-gone">{b.noProperty}</p></section>;

  const ticked = fields.filter(f => selected[String(f.key)]).length;
  const withValue = fields.filter(f => f.value !== undefined);
  const missing = fields.filter(f => f.value === undefined);
  const chosenPhotos = [...photoList].sort((x, y) => (x.id === mainId ? -1 : y.id === mainId ? 1 : 0)).filter(p => photosOn[p.id]).slice(0, MAX_PDF_PHOTOS);

  async function preview() {
    setBusy(true);
    urls.current.forEach(u => URL.revokeObjectURL(u)); urls.current = [];
    const got: Ready['photos'] = [];
    let skipped = 0;
    for (const p of chosenPhotos) {
      try {
        let src = p.url;
        if (p.fileId) {
          const blob = await store.getFile(p.fileId);
          if (!blob) { skipped++; continue; }
          src = URL.createObjectURL(blob); urls.current.push(src);
        }
        const size = src ? await imageSize(src) : undefined;
        if (!src || !size) { skipped++; continue; }
        got.push({ src, ...size });
      } catch { skipped++; }
    }
    setReady({ photos: got, skipped }); setBusy(false);
  }

  const build = async (): Promise<Doc> => buildBuyerDoc({
    lang: pdfLang, listing: l, fields, selected, photos: ready?.photos ?? [], agent: profile, agentChoice, now: Date.now(),
  });
  const bp = buyerStrings[pdfLang];
  const title = `${bp.title} – ${[l.ref, cardTitle(l)].filter(Boolean).join(' ') || bp.untitled}`;
  const hasAgent = !!(profile.fullName || profile.phone || profile.agency || profile.email);

  return (
    <section className="stack" data-testid="buyer-pdf">
      <p className="notice">{b.intro}</p>
      <p className="small muted">{[l.ref, cardTitle(l)].filter(Boolean).join(' · ')}</p>

      <label className="ff">{b.language}
        <select value={pdfLang} onChange={e => { setPdfLang(e.target.value as Lang); setSel(null); }} data-testid="buyer-pdf-lang">
          {VOICE_LANGS.map(v => { const code = v.code.startsWith('ms') ? 'bm' : v.code.startsWith('zh') ? 'zh' : 'en'; return <option key={code} value={code}>{v.label}</option>; })}
        </select>
      </label>

      <div className="card stack-sm" data-testid="buyer-pdf-fields">
        <div className="between"><strong>{b.details}</strong><small className="muted" data-testid="buyer-pdf-count">{b.count(ticked, fields.length)}</small></div>
        <div className="two">
          <button type="button" className="btn small secondary" onClick={() => setSel(Object.fromEntries(withValue.map(f => [String(f.key), true])))} data-testid="buyer-pdf-all">{b.all}</button>
          <button type="button" className="btn small ghost" onClick={() => setSel({})} data-testid="buyer-pdf-none">{b.none}</button>
        </div>
        {BUYER_GROUPS.map(g => {
          const gf = withValue.filter(f => f.group === g);
          if (!gf.length) return null;
          return (
            <div key={g} className="stack-sm">
              <small className="muted">{buyerStrings[pdfLang].groups[g]}</small>
              {gf.map(f => (
                <label key={String(f.key)} className="check" data-testid={`bf-${String(f.key)}`}>
                  <input type="checkbox" checked={!!selected[String(f.key)]} onChange={e => setSel({ ...selected, [String(f.key)]: e.target.checked })} aria-label={f.label} />
                  <span><strong>{f.label}</strong>: {f.value}{f.status !== undefined && <small className={f.confirmed ? 'ok-text' : 'warn-text'}> · {f.status}</small>}</span>
                </label>
              ))}
            </div>
          );
        })}
        {missing.length > 0 && (
          <details data-testid="buyer-pdf-missing">
            <summary>{b.notProvided} ({missing.length})</summary>
            <small className="muted">{b.missingHelp}</small>
            <div className="stack-sm">
              {missing.map(f => (
                <label key={String(f.key)} className="check" data-testid={`bf-${String(f.key)}`}>
                  <input type="checkbox" checked={!!selected[String(f.key)]} onChange={e => setSel({ ...selected, [String(f.key)]: e.target.checked })} aria-label={f.label} />
                  <span>{f.label}</span>
                </label>
              ))}
            </div>
          </details>
        )}
      </div>

      <div className="card stack-sm" data-testid="buyer-pdf-agent">
        <strong>{b.contact}</strong>
        {!hasAgent && <small className="muted" data-testid="buyer-pdf-agent-none">{b.contactNone}</small>}
        {hasAgent && (['name', 'agency', 'regNo', 'phone', 'email'] as const).map(k => {
          const value = { name: profile.fullName, agency: profile.agency, regNo: profile.regNo, phone: profile.phone, email: profile.email }[k];
          return value ? (
            <label key={k} className="check"><input type="checkbox" checked={agentChoice[k]} onChange={e => setAgentChoice({ ...agentChoice, [k]: e.target.checked })} aria-label={k} data-testid={`ba-${k}`} /> <span>{value}</span></label>
          ) : null;
        })}
      </div>

      <div className="card stack-sm" data-testid="buyer-pdf-photos">
        <div className="between"><strong>{b.photos}</strong><small className="muted" data-testid="buyer-pdf-photo-count">{b.selectedPhotos(chosenPhotos.length)}</small></div>
        {!photoList.length && <small className="muted" data-testid="buyer-pdf-no-photos">{b.photosNone}</small>}
        {photoList.length > 0 && <small className="muted">{b.photosHelp(MAX_PDF_PHOTOS)}</small>}
        <div className="buyer-pdf-photos">
          {photoList.map(p => (
            <label key={p.id} data-testid="buyer-pdf-photo">
              <StoredImage fileId={p.fileId} url={p.url} alt={p.name} />
              <input type="checkbox" checked={!!photosOn[p.id]} onChange={e => setPhotoSel({ ...photosOn, [p.id]: e.target.checked })} aria-label={p.name} />
            </label>
          ))}
        </div>
      </div>

      <button className="btn primary" disabled={busy} onClick={() => void preview()} data-testid="buyer-pdf-preview">{b.preview}</button>
      {ready && (
        <>
          {ready.skipped > 0 && <p className="warn-text" role="status" data-testid="buyer-pdf-skipped">{b.skipped(ready.skipped)}</p>}
          <PdfPreview lang={lang} title={title} build={build} onClose={() => setReady(null)} />
        </>
      )}
    </section>
  );
}
