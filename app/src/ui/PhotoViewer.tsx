// Full-screen photo viewer (ClaudeChanges001 change 7, owner 17 Oct 2026), used by the property form and the property page.
//  - Pinch with two fingers to zoom (1× to 5×); drag to move a zoomed photo; double-tap to zoom in or back out.
//  - Swipe left or right (at normal size) for the next or previous photo; the arrows and the keyboard do the same.
//  - X, Escape or Back on the phone keyboard close it. Nothing is changed on the property.
//  - Change 32 (owner, 18 Oct 2026): the arrows sit just under the photo with "Slide to next" between them, not at the
//    bottom of the screen. They are inside the swipe area, so a gesture that starts on a button is left to the button.
// It covers the whole screen, the advert bar included, like the PDF preview.
import { useEffect, useRef, useState } from 'react';
import type { Lang } from '../i18n';
import type { Photo } from '../listing/model';
import { StoredImage } from './common';
import { cc001Strings } from './cc001Strings';
import { useImmersive } from '../adverts/AdBar';

const MAX = 5;
const SWIPE = 60;
type Pt = { x: number; y: number };
type PEv = { pointerId: number; clientX: number; clientY: number; currentTarget: Element; target: EventTarget | null };

export function PhotoViewer({ lang, photos, start, onClose }: { lang: Lang; photos: Photo[]; start: number; onClose: () => void }) {
  const t = cc001Strings[lang].photo;
  const [i, setI] = useState(() => Math.min(Math.max(0, start), photos.length - 1));
  const [view, setViewState] = useState({ scale: 1, x: 0, y: 0 });
  const [swipe, setSwipeState] = useState(0);
  // The gesture reads these refs, not the screen state: the finger can lift before the screen has redrawn, and a swipe
  // or pinch must never be missed because of that.
  const viewRef = useRef(view);
  const swipeRef = useRef(0);
  const setView = (v: { scale: number; x: number; y: number } | ((p: { scale: number; x: number; y: number }) => { scale: number; x: number; y: number })) => {
    const next = typeof v === 'function' ? v(viewRef.current) : v;
    viewRef.current = next; setViewState(next);
  };
  const setSwipe = (n: number) => { swipeRef.current = n; setSwipeState(n); };
  const pts = useRef(new Map<number, Pt>());
  const g = useRef<{ dist?: number; scale: number; x: number; y: number; start?: Pt; lastTap?: number; moved?: boolean }>({ scale: 1, x: 0, y: 0 });
  const n = photos.length;
  // Like the PDF preview, the viewer fills the screen, so the bottom advert is hidden while it is open.
  useImmersive(true);
  const go = (d: number) => { setI(k => Math.min(n - 1, Math.max(0, k + d))); setView({ scale: 1, x: 0, y: 0 }); };

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dist = () => { const [a, b] = [...pts.current.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  function down(e: PEv) {
    if ((e.target as Element | null)?.closest?.('button')) return;   // an arrow under the photo: its own click, not a swipe
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* not every pointer can be captured; the stage still follows it */ }
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const v = viewRef.current;
    g.current = { ...g.current, scale: v.scale, x: v.x, y: v.y, start: { x: e.clientX, y: e.clientY }, moved: false };
    if (pts.current.size === 2) g.current.dist = dist();
  }
  function move(e: PEv) {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const s0 = g.current;
    if (pts.current.size === 2 && s0.dist) {
      const scale = Math.min(MAX, Math.max(1, s0.scale * (dist() / s0.dist)));
      setView(v => ({ ...v, scale, ...(scale === 1 ? { x: 0, y: 0 } : {}) }));
      s0.moved = true;
      return;
    }
    if (pts.current.size !== 1 || !s0.start) return;
    const dx = e.clientX - s0.start.x; const dy = e.clientY - s0.start.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) s0.moved = true;
    if (viewRef.current.scale > 1) setView(v => ({ ...v, x: s0.x + dx, y: s0.y + dy }));
    else setSwipe(dx);
  }
  function up(e: PEv) {
    if (!pts.current.has(e.pointerId)) return;
    const s0 = g.current;
    pts.current.delete(e.pointerId);
    if (pts.current.size === 1) {   // one finger left after a pinch: carry on from here
      const [p] = [...pts.current.values()];
      const v = viewRef.current;
      g.current = { ...s0, scale: v.scale, x: v.x, y: v.y, start: p, dist: undefined };
      return;
    }
    if (pts.current.size) return;
    const sw = swipeRef.current;
    if (viewRef.current.scale === 1 && Math.abs(sw) > SWIPE) go(sw < 0 ? 1 : -1);
    setSwipe(0);
    if (!s0.moved) {   // a tap: a second one soon after zooms in or out
      const now = Date.now();
      if (s0.lastTap && now - s0.lastTap < 300) { setView(v => (v.scale > 1 ? { scale: 1, x: 0, y: 0 } : { scale: 2.5, x: 0, y: 0 })); g.current.lastTap = undefined; }
      else g.current.lastTap = now;
    }
  }

  const p = photos[i];
  return (
    <div className="pv" role="dialog" aria-modal="true" aria-label={t.viewer} data-testid="photo-viewer" data-index={i} data-scale={view.scale}>
      <div className="pv-top">
        <span className="pv-count" data-testid="photo-viewer-count">{t.counter(i + 1, n)}</span>
        <button type="button" className="pv-btn" aria-label={t.close} title={t.close} data-testid="photo-viewer-close" onClick={onClose}>✕</button>
      </div>
      <div className="pv-stage" data-testid="photo-viewer-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="pv-img" data-testid="photo-viewer-photo" style={{ transform: `translate(${view.scale === 1 ? swipe : view.x}px, ${view.y}px) scale(${view.scale})` }}>
          {p && <StoredImage key={p.id} fileId={p.fileId} url={p.url} alt={p.name} />}
        </div>
        {n > 1 && (
          <div className="pv-nav" data-testid="photo-viewer-nav">
            <button type="button" className="pv-btn" aria-label={t.prev} title={t.prev} data-testid="photo-viewer-prev" disabled={i === 0} onClick={() => go(-1)}>‹</button>
            <span className="pv-hint" data-testid="viewer-hint">{t.slide}</span>
            <button type="button" className="pv-btn" aria-label={t.next} title={t.next} data-testid="photo-viewer-next" disabled={i === n - 1} onClick={() => go(1)}>›</button>
          </div>
        )}
      </div>
    </div>
  );
}
