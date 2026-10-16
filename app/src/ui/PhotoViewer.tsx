// Full-screen photo viewer (ClaudeChanges001 change 7, owner 17 Oct 2026), used by the property form and the property page.
//  - Pinch with two fingers to zoom (1× to 5×); drag to move a zoomed photo; double-tap to zoom in or back out.
//  - Swipe left or right (at normal size) for the next or previous photo; the arrows and the keyboard do the same.
//  - X, Escape or Back on the phone keyboard close it. Nothing is changed on the property.
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
type PEv = { pointerId: number; clientX: number; clientY: number; currentTarget: Element };

export function PhotoViewer({ lang, photos, start, onClose }: { lang: Lang; photos: Photo[]; start: number; onClose: () => void }) {
  const t = cc001Strings[lang].photo;
  const [i, setI] = useState(() => Math.min(Math.max(0, start), photos.length - 1));
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [swipe, setSwipe] = useState(0);
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
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* not every pointer can be captured; the stage still follows it */ }
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    g.current = { ...g.current, scale: view.scale, x: view.x, y: view.y, start: { x: e.clientX, y: e.clientY }, moved: false };
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
    if (view.scale > 1) setView(v => ({ ...v, x: s0.x + dx, y: s0.y + dy }));
    else setSwipe(dx);
  }
  function up(e: PEv) {
    const s0 = g.current;
    pts.current.delete(e.pointerId);
    if (pts.current.size === 1) {   // one finger left after a pinch: carry on from here
      const [p] = [...pts.current.values()];
      g.current = { ...s0, scale: view.scale, x: view.x, y: view.y, start: p, dist: undefined };
      return;
    }
    if (pts.current.size) return;
    if (view.scale === 1 && Math.abs(swipe) > SWIPE) go(swipe < 0 ? 1 : -1);
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
        <div className="pv-img" style={{ transform: `translate(${view.scale === 1 ? swipe : view.x}px, ${view.y}px) scale(${view.scale})` }}>
          {p && <StoredImage key={p.id} fileId={p.fileId} url={p.url} alt={p.name} />}
        </div>
      </div>
      {n > 1 && (
        <div className="pv-nav">
          <button type="button" className="pv-btn" aria-label={t.prev} data-testid="photo-viewer-prev" disabled={i === 0} onClick={() => go(-1)}>‹</button>
          <button type="button" className="pv-btn" aria-label={t.next} data-testid="photo-viewer-next" disabled={i === n - 1} onClick={() => go(1)}>›</button>
        </div>
      )}
    </div>
  );
}
