// JoyChange003 Change 67: the Reorder Photos screen, opened from a picture's 3-dot menu on the Add Pictures list.
//  - Four small pictures per row, nothing drawn on them (no icons, no labels, no delete here).
//  - A tap enlarges a picture (the photo viewer, with its X). Press and drag a picture to move it; the page scrolls by itself
//    when the finger nears the top or bottom edge. Dropping a picture on another puts it in that place; the first picture is
//    the main picture.
//  - With a finger, a short press-and-hold starts the drag (so the page can still be scrolled by swiping); with a mouse or a
//    pen, moving a few pixels is enough.
// The order is applied to the form as soon as a picture is dropped; Done closes the screen.
import { useEffect, useRef, useState } from 'react';
import type { Lang } from '../i18n';
import type { Photo } from './model';
import { StoredImage } from '../ui/common';
import { PhotoViewer } from '../ui/PhotoViewer';
import { cc001Strings } from '../ui/cc001Strings';
import { IconClose } from '../icons';

const HOLD_MS = 220;      // a finger must rest this long before a drag starts
const MOVE_PX = 6;        // a mouse or pen starts a drag after moving this far
const EDGE = 72;          // the page scrolls by itself within this distance of the top or bottom edge
const MAX_SPEED = 18;     // pixels per frame at the very edge

/** Speed (pixels per frame, negative = up) for a finger at `y` in a box spanning top..bottom. 0 away from the edges. */
export function autoScrollSpeed(y: number, top: number, bottom: number): number {
  if (y < top + EDGE) return -Math.round(MAX_SPEED * Math.min(1, (top + EDGE - y) / EDGE));
  if (y > bottom - EDGE) return Math.round(MAX_SPEED * Math.min(1, (y - (bottom - EDGE)) / EDGE));
  return 0;
}

type PressEv = { button?: number; pointerType?: string; clientX: number; clientY: number };
type KeyEv = { key: string; preventDefault(): void };

export function PhotoReorder({ lang, photos, onMove, onClose }: { lang: Lang; photos: Photo[]; onMove: (from: number, to: number) => void; onClose: () => void }) {
  const t = cc001Strings[lang].photo;
  const [from, setFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const live = useRef<{ stop: () => void } | null>(null);
  useEffect(() => () => live.current?.stop(), []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && viewer === null) onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [viewer]); // eslint-disable-line react-hooks/exhaustive-deps

  function press(i: number, e: PressEv) {
    if (e.button !== undefined && e.button > 0) return;
    live.current?.stop();
    const touch = e.pointerType === 'touch';
    const start = { x: e.clientX, y: e.clientY };
    let x = e.clientX, y = e.clientY;
    let dragging = false, overIdx = i, raf = 0;
    let hold: ReturnType<typeof setTimeout> | undefined;
    const blockScroll = (ev: TouchEvent) => { if (dragging && ev.cancelable) ev.preventDefault(); };
    const begin = () => { dragging = true; setFrom(i); setOver(i); raf = requestAnimationFrame(tick); };
    // Scrolls the screen by itself while the finger is near the top or bottom edge, and keeps the drop place up to date.
    const tick = () => {
      if (!dragging) return;
      const box = scroller.current;
      if (box) {
        const r = box.getBoundingClientRect();
        const sp = autoScrollSpeed(y, r.top, r.bottom);
        if (sp) box.scrollTop += sp;
      }
      const el = document.elementFromPoint(x, y)?.closest('[data-ri]');
      const to = el ? Number(el.getAttribute('data-ri')) : NaN;
      if (Number.isFinite(to) && to !== overIdx) { overIdx = to; setOver(to); }
      raf = requestAnimationFrame(tick);
    };
    const move = (ev: PointerEvent) => {
      x = ev.clientX; y = ev.clientY;
      if (!dragging) {
        if (!touch && Math.hypot(x - start.x, y - start.y) > MOVE_PX) begin();
        else if (touch && Math.hypot(x - start.x, y - start.y) > 14) { clearTimeout(hold); finish(false); }   // the finger is scrolling the page
      }
    };
    const finish = (drop: boolean) => {
      clearTimeout(hold); cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('touchmove', blockScroll);
      const was = dragging; dragging = false;
      setFrom(null); setOver(null);
      live.current = null;
      if (was && drop && overIdx !== i) onMove(i, overIdx);
      return was;
    };
    const up = () => { const was = dragging; finish(true); if (!was) setViewer(i); };   // a tap, not a drag: enlarge
    const cancel = () => { finish(false); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
    window.addEventListener('touchmove', blockScroll, { passive: false });
    if (touch) hold = setTimeout(begin, HOLD_MS);
    live.current = { stop: () => finish(false) };
  }

  return (
    <div className="pr" role="dialog" aria-modal="true" aria-label={t.reorderTitle} data-testid="photo-reorder">
      <div className="pr-top">
        <strong>{t.reorderTitle}</strong>
        <button type="button" className="pr-done btn small primary" data-testid="photo-reorder-done" onClick={onClose}>{t.done}</button>
        <button type="button" className="pv-btn pr-x" aria-label={t.close} title={t.close} data-testid="photo-reorder-close" onClick={onClose}><IconClose size={18} /></button>
      </div>
      <p className="pr-hint muted" data-testid="photo-reorder-hint">{t.reorderHint}</p>
      <div className="pr-scroll" ref={scroller} data-testid="photo-reorder-scroll">
        <div className="pr-grid">
          {photos.map((p, i) => (
            <div key={p.id} className={`pr-tile ${from === i ? 'dragging' : ''} ${from !== null && over === i && from !== i ? 'drop-target' : ''}`}
              data-ri={i} data-testid="reorder-tile" data-photo-id={p.id} role="button" tabIndex={0} aria-label={t.reorderTile(i + 1)}
              onPointerDown={(e: PressEv) => press(i, e)} onContextMenu={(e: KeyEv) => e.preventDefault()}
              onKeyDown={(e: KeyEv) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewer(i); } }}>
              <StoredImage fileId={p.fileId} url={p.url} />
            </div>
          ))}
        </div>
      </div>
      {viewer !== null && <PhotoViewer lang={lang} photos={photos} start={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}
