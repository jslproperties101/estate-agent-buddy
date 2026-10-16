// Marketing Studio: choose ONE format (A4 flyer, square post or portrait post), the details and photos to show, then make
// the preview and download or share it. Only the chosen format is made, and only when the agent asks.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { StoredImage } from '../ui/common';
import { cardTitle } from '../listing/model';
import { VOICE_LANGS } from '../voice/recognizer';
import { AgentChoice, defaultAgentChoice } from '../listing/buyerPdf';
import { marketingStrings } from './strings';
import { FORMATS, FORMAT_IDS, FormatId, OutputId, buildPosterContent, defaultMarketingSelection, marketingFields, marketingFileName } from './content';
import { Theme, canWebp, drawPoster, exportPoster } from './render';
import { FileActions } from '../ui/FileActions';
import { BusyLine } from '../ui/BusyLine';
import { c11Strings } from '../ui/c011Strings';
import { loadImage } from '../lib/photoStudio';

type Made = { blob: Blob; url: string; format: FormatId; output: OutputId; w: number; h: number; fileName: string };

export function MarketingStudioScreen({ lang, propertyId }: { lang: Lang; propertyId: string }) {
  const { state, store } = useApp();
  const t = marketingStrings[lang];
  const l = state.properties.find(p => p.id === propertyId);
  const [format, setFormat] = useState<FormatId>('square');
  const [output, setOutput] = useState<OutputId>('png');
  const [theme, setTheme] = useState<Theme>('dark');
  const [dLang, setDLang] = useState<Lang>(lang);
  const [headline, setHeadline] = useState('');
  const [showRef, setShowRef] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean> | null>(null);
  const [photoSel, setPhotoSel] = useState<Record<string, boolean> | null>(null);
  const profile = state.profile;
  const [agentChoice, setAgentChoice] = useState<AgentChoice>(() => defaultAgentChoice(profile));
  const [made, setMade] = useState<Made | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const making = useRef(false);
  const urls = useRef<string[]>([]);
  useEffect(() => () => { urls.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  const fields = useMemo(() => (l ? marketingFields(l, dLang) : []), [l, dLang]);
  const selected = sel ?? defaultMarketingSelection(fields);
  const photoList = l?.photos ?? [];
  const spec = FORMATS[format];
  const mainId = l?.mainPhotoId ?? photoList[0]?.id;
  const ordered = useMemo(() => [...photoList].sort((x, y) => (x.id === mainId ? -1 : y.id === mainId ? 1 : 0)), [photoList, mainId]);
  const photosOn = photoSel ?? Object.fromEntries(ordered.slice(0, spec.maxPhotos).map(p => [p.id, true]));
  const chosen = ordered.filter(p => photosOn[p.id]).slice(0, spec.maxPhotos);
  const webp = useMemo(() => canWebp(), []);
  const outputs = spec.outputs.filter(o => o !== 'webp' || webp);
  const out: OutputId = outputs.includes(output) ? output : outputs[0];

  const touch = () => { if (made) setStale(true); };
  const content = l ? buildPosterContent({ lang: dLang, listing: l, fields, selected, headline, agent: profile, agentChoice, showRef, maxFacts: format === 'a4' ? 8 : 6 }) : undefined;

  async function make() {
    // One job at a time: a second tap while the design is being made does nothing (Change 013).
    if (!l || !content || making.current) return;
    making.current = true;
    setBusy(true); setFailed(false);
    try {
      const imgs: (HTMLImageElement | undefined)[] = [];
      for (const p of chosen) {
        try {
          let src = p.url;
          if (p.fileId) { const b = await store.getFile(p.fileId); if (b) { src = URL.createObjectURL(b); urls.current.push(src); } else src = undefined; }
          imgs.push(src ? await loadImage(src) : undefined);
        } catch { imgs.push(undefined); }
      }
      const canvas = document.createElement('canvas');
      drawPoster(canvas, content, format, imgs, theme);
      const title = `${t.title} – ${[l.ref, cardTitle(l)].filter(Boolean).join(' ')}`;
      const blob = await exportPoster(canvas, out, title);
      // The preview is a picture of the design (a PDF is shown as the page picture it contains).
      const previewBlob = out === 'pdf' ? await new Promise<Blob>((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('preview'))), 'image/jpeg', 0.8)) : blob;
      const url = URL.createObjectURL(previewBlob); urls.current.push(url);
      setMade({ blob, url, format, output: out, w: canvas.width, h: canvas.height, fileName: marketingFileName(l.ref, t.fileBase, format, out) });
      setStale(false);
    } catch { setFailed(true); setMade(null); } finally { making.current = false; setBusy(false); }
  }

  if (!l) return <section className="stack"><p className="warn-text" data-testid="ms-gone">{t.noProperty}</p></section>;
  const ticked = fields.filter(f => selected[String(f.key)]).length;
  const withValue = fields.filter(f => f.value !== undefined);
  const missing = fields.filter(f => f.value === undefined);
  const hasAgent = !!(profile.fullName || profile.phone || profile.agency || profile.email);
  const copyAvailable = photoList.some(p => p.edit === 'masked' || p.edit === 'both');

  return (
    <section className="stack" data-testid="marketing-studio">
      <p className="notice">{t.intro}</p>
      <p className="small muted" data-testid="ms-notpublished">{t.notPublished}</p>
      <p className="small muted">{[l.ref, cardTitle(l)].filter(Boolean).join(' · ')}</p>

      <div className="card stack-sm" data-testid="ms-format">
        <strong>{t.format}</strong>
        {FORMAT_IDS.map(f => (
          <label key={f} className="check">
            <input type="radio" name="ms-format" checked={format === f} onChange={() => { setFormat(f); setPhotoSel(null); touch(); }} data-testid={`ms-format-${f}`} aria-label={t.formats[f]} />
            <span><strong>{t.formats[f]}</strong><br /><small className="muted">{t.formatHelp[f]}</small></span>
          </label>
        ))}
        <label className="ff">{t.output}
          <select value={out} onChange={e => { setOutput(e.target.value as OutputId); touch(); }} data-testid="ms-output">
            {outputs.map(o => <option key={o} value={o}>{t.outputs[o]}</option>)}
          </select>
        </label>
        {!webp && format !== 'a4' && <small className="muted" data-testid="ms-webp-no">{t.webpNo}</small>}
        <label className="ff">{t.theme}
          <select value={theme} onChange={e => { setTheme(e.target.value as Theme); touch(); }} data-testid="ms-theme">
            <option value="dark">{t.themes.dark}</option><option value="light">{t.themes.light}</option>
          </select>
        </label>
        <label className="ff">{t.language}
          <select value={dLang} onChange={e => { setDLang(e.target.value as Lang); setSel(null); touch(); }} data-testid="ms-lang">
            {VOICE_LANGS.map(v => { const code = v.code.startsWith('ms') ? 'bm' : v.code.startsWith('zh') ? 'zh' : 'en'; return <option key={code} value={code}>{v.label}</option>; })}
          </select>
        </label>
      </div>

      <div className="card stack-sm">
        <label className="ff">{t.headline}
          <input value={headline} placeholder={l.headline ?? ''} onChange={e => { setHeadline(e.target.value); touch(); }} data-testid="ms-headline" />
        </label>
        <small className="muted">{l.headline ? t.headlineHelp : t.headlineNone}</small>
        <label className="check"><input type="checkbox" checked={showRef} onChange={e => { setShowRef(e.target.checked); touch(); }} data-testid="ms-showref" /> <span>{t.showRef}{l.ref ? ` (${l.ref})` : ''}</span></label>
      </div>

      <div className="card stack-sm" data-testid="ms-fields">
        <div className="between"><strong>{t.details}</strong><small className="muted" data-testid="ms-count">{t.count(ticked, fields.length)}</small></div>
        {withValue.map(f => (
          <label key={String(f.key)} className="check" data-testid={`mf-${String(f.key)}`}>
            <input type="checkbox" checked={!!selected[String(f.key)]} onChange={e => { setSel({ ...selected, [String(f.key)]: e.target.checked }); touch(); }} aria-label={f.label} />
            <span><strong>{f.label}</strong>: {f.value}{f.status !== undefined && <small className={f.confirmed ? 'ok-text' : 'warn-text'}> · {f.status}</small>}</span>
          </label>
        ))}
        {missing.length > 0 && (
          <details data-testid="ms-missing">
            <summary>{t.notProvided} ({missing.length})</summary>
            <small className="muted">{t.missingHelp}</small>
            {missing.map(f => (
              <label key={String(f.key)} className="check" data-testid={`mf-${String(f.key)}`}>
                <input type="checkbox" checked={!!selected[String(f.key)]} onChange={e => { setSel({ ...selected, [String(f.key)]: e.target.checked }); touch(); }} aria-label={f.label} />
                <span>{f.label}</span>
              </label>
            ))}
          </details>
        )}
      </div>

      <div className="card stack-sm" data-testid="ms-photos">
        <div className="between"><strong>{t.photos}</strong><small className="muted" data-testid="ms-photo-count">{t.photosCount(chosen.length, spec.maxPhotos)}</small></div>
        {!photoList.length && <small className="muted" data-testid="ms-no-photos">{t.photosNone}</small>}
        {photoList.length > 0 && <small className="muted">{t.photosHelp(spec.maxPhotos)}</small>}
        {copyAvailable && <small className="muted" data-testid="ms-copy-tip">{t.copyTip}</small>}
        <div className="buyer-pdf-photos">
          {ordered.map(p => (
            <label key={p.id} data-testid="ms-photo" data-edit={p.edit ?? ''}>
              <StoredImage fileId={p.fileId} url={p.url} alt={p.name} />
              <input type="checkbox" checked={!!photosOn[p.id]} onChange={e => { setPhotoSel({ ...photosOn, [p.id]: e.target.checked }); touch(); }} aria-label={p.name} />
            </label>
          ))}
        </div>
      </div>

      <div className="card stack-sm" data-testid="ms-agent">
        <strong>{t.agent}</strong>
        {!hasAgent && <small className="muted" data-testid="ms-agent-none">{t.agentNone}</small>}
        {hasAgent && (['name', 'agency', 'regNo', 'phone', 'email'] as const).map(k => {
          const value = { name: profile.fullName, agency: profile.agency, regNo: profile.regNo, phone: profile.phone, email: profile.email }[k];
          return value ? <label key={k} className="check"><input type="checkbox" checked={agentChoice[k]} onChange={e => { setAgentChoice({ ...agentChoice, [k]: e.target.checked }); touch(); }} aria-label={k} data-testid={`ma-${k}`} /> <span>{value}</span></label> : null;
        })}
      </div>

      {content && (
        <div className="stack-sm" data-testid="ms-warnings">
          {content.sample && <p className="notice" data-testid="ms-warn-sample">{t.warn.sample}</p>}
          {content.headlineLong && <p className="warn-text" data-testid="ms-warn-long">{t.warn.long}</p>}
          {content.noPrice && <p className="warn-text" data-testid="ms-warn-price">{t.warn.noPrice}</p>}
          {content.unverified.length > 0 && <p className="warn-text" data-testid="ms-warn-unverified">{t.warn.unverified(content.unverified.join(', '))}</p>}
          {content.empty.length > 0 && <p className="warn-text" data-testid="ms-warn-empty">{t.warn.empty(content.empty.join(', '))}</p>}
        </div>
      )}

      <button className="btn primary" disabled={busy} onClick={() => void make()} data-testid="ms-make">{busy ? t.making : made ? t.remake : t.make}</button>
      {busy && <BusyLine text={c11Strings[lang].busy.ad} testId="ms-busy" />}
      {failed && <p className="warn-text" role="alert" data-testid="ms-failed">{t.failed}</p>}
      {made && (
        <div className="card stack-sm" data-testid="ms-result" data-format={made.format} data-output={made.output}>
          <small data-testid="ms-made">{t.made(t.formats[made.format], t.outputs[made.output], made.w, made.h, Math.max(1, Math.round(made.blob.size / 1024)))}</small>
          {stale && <p className="warn-text" role="status" data-testid="ms-stale">{t.stale}</p>}
          <img src={made.url} alt={made.fileName} className="ms-preview" data-testid="ms-preview" />
          <FileActions lang={lang} blob={made.blob} fileName={made.fileName} title={t.title} mime={made.blob.type || undefined} downloadLabel={t.download} shareLabel={t.share} testPrefix="ms" />
        </div>
      )}
    </section>
  );
}
