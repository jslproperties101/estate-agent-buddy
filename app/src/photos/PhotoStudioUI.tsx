// Photo Studio: improve a property photo (brightness, contrast, colour, clarity, turn, straighten, crop) and cover private
// details by hand before sharing. Runs on the phone; nothing is uploaded and nothing is detected automatically.
// "Save as new photo" keeps the original; "Replace the original" is a separate action that asks first.
// JoyChange003 Change 79: the photos are first shown as a grid, 2 to a row, with the "Enhanced copy" label below each picture
// (not on it). A tap opens that one photo to edit; swiping the picture moves to the next or previous photo.
// Change 78: the adjustments are a row of icons; the selected icon drives ONE control under the picture, and the picture
// stays pinned at the top of the screen so the effect is seen while the slider moves.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { newId } from '../data/store';
import { Confirm, StoredImage } from '../ui/common';
import { photoStrings } from './strings';
import { NO_EDIT, PhotoEdit, hasChange, hasEnhance, loadImage, renderEdit, toJpeg } from '../lib/photoStudio';
import { MaskMode, Rect, editKind, isTiny, rectFrom } from '../lib/photoOps';
import { addEditedCopy, copyName, replaceOriginal } from '../domain/photoStudio';
import { cardTitle } from '../listing/model';

/** The parts of a pointer event this screen reads. */
interface PointerLike { clientX: number; clientY: number; pointerId: number; currentTarget: unknown }
const PREVIEW = 900;
const SAVE_SIDE = 1800;
/** Change 78: the seven adjustments, in the order of the icon row. */
export const TOOLS = ['brightness', 'contrast', 'colour', 'clarity', 'straighten', 'rotate', 'crop'] as const;
export type Tool = typeof TOOLS[number];
const TOOL_ICON: Record<Tool, string> = { brightness: '☀', contrast: '◐', colour: '🎨', clarity: '✦', straighten: '⦨', rotate: '↻', crop: '⛶' };
/** A swipe: at least this far sideways, and more sideways than up or down. */
export const SWIPE_PX = 60;
export const isSwipe = (dx: number, dy: number) => Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5;

export function PhotoStudioScreen({ lang, propertyId, photoId }: { lang: Lang; propertyId: string; photoId?: string }) {
  const { state, store } = useApp();
  const t = photoStrings[lang];
  const l = state.properties.find(p => p.id === propertyId);
  const [sel, setSel] = useState<string | undefined>(photoId);
  const photo = l?.photos.find(p => p.id === sel) ?? l?.photos[0];
  // Change 79: always the grid of photos first (a photo named by photoId is marked in it); a tap opens one photo to edit.
  const [editing, setEditing] = useState(false);
  const [tool, setTool] = useState<Tool>('brightness');
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [dragX, setDragX] = useState(0);
  const [slide, setSlide] = useState<1 | -1 | 0>(0);
  /** Change 79: moving to another photo with unsaved edits: which way, until the person answers. */
  const [leave, setLeave] = useState<1 | -1 | 0>(0);
  const list = l?.photos ?? [];
  const at = photo ? list.findIndex(p => p.id === photo.id) : -1;
  const [edit, setEdit] = useState<PhotoEdit>(NO_EDIT);
  const [tab, setTab] = useState<'adjust' | 'mask'>('adjust');
  const [mode, setMode] = useState<MaskMode>('solid');
  const [view, setView] = useState<'edited' | 'original'>('edited');
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState<string>();
  const [note, setNote] = useState<string>();
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [drag, setDrag] = useState<Rect | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const urls = useRef<string[]>([]);
  const keep = (u: string) => { urls.current.push(u); return u; };
  useEffect(() => () => { urls.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  // Load the chosen photo.
  const photoKey = photo ? `${photo.id}:${photo.fileId ?? photo.url}` : '';
  useEffect(() => {
    let live = true;
    setImg(null); setFailed(false); setEdit(NO_EDIT); setNote(undefined); setPreview(undefined);
    if (!photo) return;
    (async () => {
      try {
        let src = photo.url;
        if (photo.fileId) {
          const blob = await store.getFile(photo.fileId);
          if (!blob) throw new Error('missing');
          src = keep(URL.createObjectURL(blob));
        }
        if (!src) throw new Error('no picture');
        const im = await loadImage(src);
        if (live) setImg(im);
      } catch { if (live) setFailed(true); }
    })();
    return () => { live = false; };
  }, [photoKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw the preview whenever the edit changes.
  useEffect(() => {
    if (!img) return;
    let live = true;
    const h = setTimeout(async () => {
      try {
        const c = renderEdit(img, view === 'original' ? NO_EDIT : edit, PREVIEW);
        const blob = await toJpeg(c, 0.8);
        if (live) setPreview(keep(URL.createObjectURL(blob)));
      } catch { if (live) setFailed(true); }
    }, 60);
    return () => { live = false; clearTimeout(h); };
  }, [img, edit, view]); // eslint-disable-line react-hooks/exhaustive-deps

  const geo = (patch: Partial<PhotoEdit>) => {
    setEdit(e => {
      const hadMasks = e.masks.length > 0;
      if (hadMasks) setNote(t.maskCleared);
      return { ...e, ...patch, masks: [] };
    });
  };
  const enh = (patch: Partial<PhotoEdit['enhance']>) => setEdit(e => ({ ...e, enhance: { ...e.enhance, ...patch } }));
  const setCrop = (ratio?: number) => {
    if (!img || !ratio) { geo({ crop: undefined }); return; }
    const sw = edit.turns % 2 ? img.naturalHeight : img.naturalWidth, sh = edit.turns % 2 ? img.naturalWidth : img.naturalHeight;
    const cur = sw / sh;
    geo({ crop: cur > ratio ? { x: (1 - ratio / cur) / 2, y: 0, w: ratio / cur, h: 1 } : { x: 0, y: (1 - cur / ratio) / 2, w: 1, h: cur / ratio } });
  };

  const area = useRef<HTMLDivElement>(null);
  const norm = (ev: PointerLike) => {
    const r = area.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) };
  };
  // Change 79 (with the Change 53 feel): on the Improve tab the picture follows the finger sideways; a swipe slides in the
  // next or previous photo, a short drag springs back.
  const down = (ev: PointerLike) => {
    if (tab !== 'mask') { swipe.current = { x: ev.clientX, y: ev.clientY }; return; }
    if (view !== 'edited') return;
    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId); start.current = norm(ev); setDrag(null);
  };
  const move = (ev: PointerLike) => {
    if (swipe.current) { const dx = ev.clientX - swipe.current.x; if (Math.abs(dx) > 8 && list.length > 1) setDragX(dx); return; }
    if (!start.current) return; const p = norm(ev); setDrag(rectFrom(start.current.x, start.current.y, p.x, p.y));
  };
  const up = (ev: PointerLike) => {
    if (swipe.current) {
      const d = { x: ev.clientX - swipe.current.x, y: ev.clientY - swipe.current.y }; swipe.current = null; setDragX(0);
      if (isSwipe(d.x, d.y)) step(d.x < 0 ? 1 : -1);
      return;
    }
    if (!start.current) return;
    const p = norm(ev); const r = rectFrom(start.current.x, start.current.y, p.x, p.y);
    start.current = null; setDrag(null);
    if (!isTiny(r)) setEdit(e => ({ ...e, masks: [...e.masks, { ...r, mode }] }));
  };

  const changed = hasChange(edit);
  /** Change 79: the next (+1) or previous (-1) photo. With unsaved changes the app asks first: Save, Discard or stay. */
  function step(d: 1 | -1) {
    if (at < 0 || list.length < 2) return;
    if (hasChange(edit)) { setLeave(d); return; }
    go(d);
  }
  function go(d: 1 | -1) {
    const next = list[(at + d + list.length) % list.length];
    setSlide(d); setSel(next.id); setMsg(undefined); setNote(undefined);
  }
  const openPhoto = (id: string) => { setSel(id); setMsg(undefined); setEditing(true); window.scrollTo?.(0, 0); };
  const kind = editKind(hasEnhance(edit), edit.masks.length > 0);
  const masksCount = edit.masks.length;

  async function make(): Promise<{ blob: Blob; kind: NonNullable<typeof kind> } | undefined> {
    if (!img || !kind) return undefined;
    const c = renderEdit(img, edit, SAVE_SIDE);
    return { blob: await toJpeg(c), kind };
  }
  async function saveNew(): Promise<boolean> {
    if (!l || !photo || busy) return false;
    setBusy(true); setMsg(undefined);
    try {
      const made = await make();
      if (!made) { setMsg(t.noChange); return false; }
      const fileId = await store.putFile(made.blob);
      const cur = store.getState().properties.find(p => p.id === l.id) ?? l;
      store.upsert('properties', addEditedCopy(cur, photo.id, { id: newId(), fileId, name: copyName(photo.name, made.kind, t.copyWords), bytes: made.blob.size, kind: made.kind }, Date.now()));
      setEdit(NO_EDIT); setNote(undefined); setMsg(t.saved);
      return true;
    } catch { setMsg(t.loadFail); return false; } finally { setBusy(false); }
  }
  async function doReplace() {
    setAsk(false);
    if (!l || !photo || busy) return;
    setBusy(true); setMsg(undefined);
    try {
      const made = await make();
      if (!made) { setMsg(t.noChange); return; }
      const fileId = await store.putFile(made.blob);
      const cur = store.getState().properties.find(p => p.id === l.id) ?? l;
      const r = replaceOriginal(cur, photo.id, fileId, made.kind, made.blob.size, Date.now());
      if (!r) { store.removeFile(fileId); setMsg(t.replaceSample); return; }
      store.upsert('properties', r.listing);
      store.removeFile(r.oldFileId);
      setEdit(NO_EDIT); setNote(undefined); setMsg(t.replaced);
    } catch { setMsg(t.loadFail); } finally { setBusy(false); }
  }

  const e = edit.enhance;
  const slider = (key: 'brightness' | 'contrast' | 'colour', label: string) => (
    <label className="ff">{label} <small className="muted">{e[key]}</small>
      <input type="range" min={-100} max={100} step={5} value={e[key]} onChange={ev => enh({ [key]: Number(ev.target.value) })} data-testid={`ps-${key}`} aria-label={label} />
    </label>
  );
  const maskItems = useMemo(() => edit.masks, [edit.masks]);

  if (!l) return <section className="stack"><p className="warn-text" data-testid="ps-gone">{t.gone}</p></section>;
  return (
    <section className="stack" data-testid="photo-studio">
      <p className="notice">{t.intro}</p>
      <p className="small muted">{[l.ref, cardTitle(l)].filter(Boolean).join(' · ')}</p>
      {!l.photos.length && <p className="muted" data-testid="ps-none">{t.none}</p>}
      {l.photos.length > 0 && !editing && (
        <div className="card stack-sm" data-testid="ps-grid-card">
          <strong>{t.choose}</strong>
          <small className="muted">{t.gridHint}</small>
          <div className="ps-grid" data-testid="ps-photos">
            {l.photos.map(p => (
              <div key={p.id} className="ps-cell">
                <button type="button" className={p.id === photo?.id ? 'on' : ''} onClick={() => openPhoto(p.id)} aria-label={p.name} data-testid="ps-photo" data-edit={p.edit ?? ''}>
                  <StoredImage fileId={p.fileId} url={p.url} alt={p.name} />
                </button>
                {p.edit && <small className="chip-tag" data-testid="ps-chip">{t.chip[p.edit]}</small>}
              </div>
            ))}
          </div>
        </div>
      )}
      {editing && photo && failed && <p className="warn-text" role="alert" data-testid="ps-failed">{t.loadFail}</p>}
      {editing && photo && !failed && (
        <>
          <div className="ps-nav">
            <button type="button" className="btn small secondary" onClick={() => setEditing(false)} data-testid="ps-all">← {t.all}</button>
            {list.length > 1 && <>
              <button type="button" className="icon-btn" aria-label={t.prev} onClick={() => step(-1)} data-testid="ps-prev">‹</button>
              <small className="muted" data-testid="ps-pos">{t.of(at + 1, list.length)}</small>
              <button type="button" className="icon-btn" aria-label={t.next} onClick={() => step(1)} data-testid="ps-next">›</button>
            </>}
          </div>
          <div className="two" role="tablist">
            <button role="tab" aria-selected={tab === 'adjust'} className={`btn small ${tab === 'adjust' ? 'primary' : 'secondary'}`} onClick={() => setTab('adjust')} data-testid="ps-tab-adjust">{t.tabs.adjust}</button>
            <button role="tab" aria-selected={tab === 'mask'} className={`btn small ${tab === 'mask' ? 'primary' : 'secondary'}`} onClick={() => setTab('mask')} data-testid="ps-tab-mask">{t.tabs.mask}{masksCount ? ` (${masksCount})` : ''}</button>
          </div>
          {/* Change 78: the photo is pinned at the top; the icon row and its one control sit right under it. */}
          <div className="ps-pin" data-testid="ps-pin">
            <div className="ps-stage" ref={area} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { swipe.current = null; setDragX(0); }} data-testid="ps-stage" data-mode={tab}>
              {preview
                ? <img key={photo.id} src={preview} alt={photo.name} draggable={false} data-testid="ps-preview"
                    className={dragX ? 'dragging' : slide ? (slide > 0 ? 'ps-in-next' : 'ps-in-prev') : ''} onAnimationEnd={() => setSlide(0)}
                    style={dragX ? { transform: `translateX(${dragX}px)` } : undefined} />
                : <div className="img-wait" />}
              {drag && <div className="ps-drag" style={{ left: `${drag.x * 100}%`, top: `${drag.y * 100}%`, width: `${drag.w * 100}%`, height: `${drag.h * 100}%` }} />}
            </div>
            {photo.edit && <small className="chip-tag ps-under" data-testid="ps-chip-current">{t.chip[photo.edit]}</small>}
            {tab === 'adjust' && <>
              <div className="ps-tools" role="toolbar" aria-label={t.tools} data-testid="ps-tools">
                {TOOLS.map(k => (
                  <button key={k} type="button" className={`ps-tool ${tool === k ? 'on' : ''}`} aria-pressed={tool === k} onClick={() => setTool(k)} data-testid={`ps-tool-${k}`}>
                    <span className="ps-tool-ico" aria-hidden="true">{TOOL_ICON[k]}</span><small>{t.tool[k]}</small>
                  </button>
                ))}
              </div>
              <div className="ps-control" data-testid="ps-control" data-tool={tool}>
                {(tool === 'brightness' || tool === 'contrast' || tool === 'colour') && slider(tool, t[tool])}
                {tool === 'clarity' && (
                  <label className="ff">{t.clarity} <small className="muted">{e.clarity}</small>
                    <input type="range" min={0} max={100} step={5} value={e.clarity} onChange={ev => enh({ clarity: Number(ev.target.value) })} data-testid="ps-clarity" aria-label={t.clarity} />
                  </label>
                )}
                {tool === 'straighten' && (
                  <label className="ff">{t.straighten} <small className="muted">{edit.straighten}°</small>
                    <input type="range" min={-10} max={10} step={0.5} value={edit.straighten} onChange={ev => geo({ straighten: Number(ev.target.value), crop: undefined })} data-testid="ps-straighten" aria-label={t.straighten} />
                  </label>
                )}
                {tool === 'rotate' && (
                  <div className="two">
                    <button className="btn small secondary" onClick={() => geo({ turns: ((edit.turns + 3) % 4) as PhotoEdit['turns'], crop: undefined })} data-testid="ps-rotate-left">↺ {t.rotateLeft}</button>
                    <button className="btn small secondary" onClick={() => geo({ turns: ((edit.turns + 1) % 4) as PhotoEdit['turns'], crop: undefined })} data-testid="ps-rotate-right">↻ {t.rotateRight}</button>
                  </div>
                )}
                {tool === 'crop' && (
                  <div className="two">
                    <button className={`btn small ${!edit.crop ? 'primary' : 'secondary'}`} onClick={() => setCrop()} data-testid="ps-crop-none">{t.cropNone}</button>
                    <button className="btn small secondary" onClick={() => setCrop(4 / 3)} data-testid="ps-crop-43">{t.crop43}</button>
                    <button className="btn small secondary" onClick={() => setCrop(16 / 9)} data-testid="ps-crop-169">{t.crop169}</button>
                    <button className="btn small secondary" onClick={() => setCrop(1)} data-testid="ps-crop-11">{t.crop11}</button>
                  </div>
                )}
              </div>
            </>}
          </div>
          {note && <p className="notice" role="status" data-testid="ps-note">{note}</p>}
          {list.length > 1 && tab === 'adjust' && <small className="muted" data-testid="ps-swipe-hint">{t.swipeHint}</small>}
          <div className="two" role="group" aria-label={t.compare}>
            <button className={`btn small ${view === 'edited' ? 'primary' : 'secondary'}`} onClick={() => setView('edited')} data-testid="ps-show-edited">{t.showEdited}</button>
            <button className={`btn small ${view === 'original' ? 'primary' : 'secondary'}`} onClick={() => setView('original')} data-testid="ps-show-original">{t.showOriginal}</button>
          </div>

          {tab === 'adjust' && (
            <div className="card stack-sm" data-testid="ps-adjust">
              <label className="check"><input type="checkbox" checked={e.auto} onChange={ev => enh({ auto: ev.target.checked })} data-testid="ps-auto" /> <span>{t.autoEnhance}</span></label>
              <button className="btn small ghost" onClick={() => { setEdit(NO_EDIT); setNote(undefined); }} data-testid="ps-reset">{t.reset}</button>
            </div>
          )}

          {tab === 'mask' && (
            <div className="card stack-sm" data-testid="ps-mask">
              <p className="warn-text" data-testid="ps-mask-warning">{t.maskWarning}</p>
              <small className="muted">{t.maskIntro}</small>
              <label className="ff">
                <select value={mode} onChange={ev => setMode(ev.target.value as MaskMode)} data-testid="ps-mask-mode" aria-label={t.tabs.mask}>
                  <option value="solid">{t.maskSolid}</option><option value="pixelate">{t.maskPixel}</option>
                </select>
              </label>
              {!maskItems.length && <small className="muted" data-testid="ps-mask-empty">{t.maskEmpty}</small>}
              {maskItems.length > 0 && <small data-testid="ps-mask-count">{t.maskList(maskItems.length)}</small>}
              {maskItems.map((m, i) => (
                <div key={i} className="between" data-testid="ps-mask-item">
                  <small>{i + 1}. {m.mode === 'solid' ? t.maskSolid : t.maskPixel}</small>
                  <button className="btn small ghost" onClick={() => setEdit(x => ({ ...x, masks: x.masks.filter((_, j) => j !== i) }))} data-testid="ps-mask-remove">{t.maskRemove}</button>
                </div>
              ))}
              {maskItems.length > 1 && <button className="btn small ghost" onClick={() => setEdit(x => ({ ...x, masks: [] }))} data-testid="ps-mask-clear">{t.maskClear}</button>}
            </div>
          )}

          <div className="card stack-sm" data-testid="ps-save">
            <button className="btn primary" disabled={!changed || busy || !img} onClick={() => void saveNew()} data-testid="ps-save-new">{busy ? t.saving : t.saveNew}</button>
            <small className="muted">{t.saveNewHelp}</small>
            <button className="btn secondary danger-text" disabled={!changed || busy || !img || !photo.fileId} onClick={() => setAsk(true)} data-testid="ps-replace">{t.replace}</button>
            {!photo.fileId && <small className="muted">{t.replaceSample}</small>}
            {msg && <p className="notice" role="status" data-testid="ps-msg">{msg}</p>}
            <small className="muted">{t.privacyNote}</small>
            <small className="muted" data-testid="ps-declutter">{t.declutter}</small>
          </div>
        </>
      )}
      {leave !== 0 && (
        <div className="scrim" role="presentation" onClick={() => setLeave(0)}>
          <div className="dialog stack-sm" role="alertdialog" aria-modal="true" aria-labelledby="ps-leave-t" data-testid="ps-leave" onClick={ev => ev.stopPropagation()}>
            <h2 id="ps-leave-t">{t.leaveTitle}</h2>
            <p>{t.leaveBody}</p>
            <button type="button" className="btn primary" disabled={busy} data-testid="ps-leave-save" onClick={() => { const d = leave; setLeave(0); void saveNew().then(ok => { if (ok) go(d as 1 | -1); }); }}>{t.leaveSave}</button>
            <button type="button" className="btn secondary danger-text" data-testid="ps-leave-discard" onClick={() => { const d = leave; setLeave(0); setEdit(NO_EDIT); go(d as 1 | -1); }}>{t.leaveDiscard}</button>
            <button type="button" className="btn ghost" data-testid="ps-leave-stay" onClick={() => setLeave(0)}>{t.cancel}</button>
          </div>
        </div>
      )}
      {ask && <Confirm lang={lang} title={t.replaceTitle} body={t.replaceBody} okLabel={t.replaceOk} onOk={() => void doReplace()} onCancel={() => setAsk(false)} />}
    </section>
  );
}
