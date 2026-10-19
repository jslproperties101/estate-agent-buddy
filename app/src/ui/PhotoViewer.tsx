// Full-screen photo viewer (ClaudeChanges001 change 7, owner 17 Oct 2026), used by the property form and the property page.
//  - Pinch with two fingers to zoom (1× to 5×); drag to move a zoomed photo; double-tap to zoom in or back out.
//  - Swipe left or right (at normal size) for the next or previous photo; the arrows and the keyboard do the same.
//  - X, Escape or Back on the phone keyboard close it. Nothing is changed on the property.
//  - Change 32 (owner, 18 Oct 2026): the arrows sit just under the photo with "Slide to next" between them, not at the
//    bottom of the screen. They are inside the swipe area, so a gesture that starts on a button is left to the button.
// JoyChange003 Change 53: swipes are smooth and flowy. The photo follows the finger; on release a quick flick (or a long enough
//    drag) sends it on and the next photo glides in from the side with the speed of the flick; a short drag springs back.
// It covers the whole screen, the advert bar included, like the PDF preview.
import { useEffect, useRef, useState } from 'react';
import type { Lang } from '../i18n';
import type { Photo } from '../listing/model';
import { StoredImage } from './common';
import { cc001Strings } from './cc001Strings';
import { useImmersive } from '../adverts/AdBar';

const MAX = 5;
const SWIPE = 60;
/** A flick faster than this (pixels per millisecond) moves on even after a short drag. */
const FLICK = 0.45;
const SLIDE_MS = 300;
type Pt = { x: number; y: number };
type PEv = { pointerId: number; clientX: number; clientY: number; currentTarget: Element; target: EventTarget | null };

export function PhotoViewer({ lang, photos, start, onClose }: { lang: Lang; photos: Photo[]; start: number; onClose: () => void }) {
  const t = cc001Strings[lang].photo;
  const [i, setI] = useState(() => Math.min(Math.max(0, start), photos.length - 1));
  const [view, setViewState] = useState({ scale: 1, x: 0, y: 0 });
  const [swipe, setSwipeState] = useState(0);
  /** Change 53: the next photo glides in from this side; the photo springs back after a short drag. */
  const [slide, setSlide] = useState<{ dir: 1 | -1; from: number; k: number } | null>(null);
  const [settling, setSettling] = useState(false);
  const lastMove = useRef({ x: 0, y: 0, t: 0, v: 0 });
  const slideCount = useRef(0);
  const iRef = useRef(i);
  iRef.current = i;   // the keyboard handler is set up once, so it reads the current photo from here
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
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
  const go = (d: number, dragged = 0, width = 0) => {
    const next = Math.min(n - 1, Math.max(0, iRef.current + d));
    if (next === iRef.current) return;
    setI(next); setView({ scale: 1, x: 0, y: 0 });
    // The new photo starts where the finger left off, one photo-width away, and glides to the middle.
    const w = width || window.innerWidth;
    setSlide({ dir: d > 0 ? 1 : -1, from: Math.round(dragged + (d > 0 ? 1 : -1) * w * 0.6), k: (slideCount.current += 1) });
    timers.current.push(setTimeout(() => setSlide(null), SLIDE_MS + 40));
  };

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
    lastMove.current = { x: e.clientX, y: e.clientY, t: Date.now(), v: 0 };
    setSettling(false);
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
    // How fast the finger is moving sideways (pixels per millisecond), smoothed a little: a flick carries the photo on.
    const now = Date.now(); const lm = lastMove.current; const dt = now - lm.t;
    if (dt > 0) lastMove.current = { x: e.clientX, y: e.clientY, t: now, v: 0.6 * ((e.clientX - lm.x) / dt) + 0.4 * lm.v };
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
    const v = lastMove.current.v;
    const far = Math.abs(sw) > SWIPE || (Math.abs(v) > FLICK && Math.abs(sw) > 12 && Math.sign(v) === Math.sign(sw));
    const dir = sw < 0 ? 1 : -1;
    const canGo = viewRef.current.scale === 1 && far && i + dir >= 0 && i + dir <= n - 1;
    if (canGo) go(dir, sw, (e.currentTarget as HTMLElement).clientWidth);
    else if (sw !== 0) { setSettling(true); timers.current.push(setTimeout(() => setSettling(false), 260)); }   // springs back
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
        <div className={`pv-img ${settling ? 'settle' : ''} ${slide ? (slide.k % 2 ? 'sliding-a' : 'sliding-b') : ''}`} data-testid="photo-viewer-photo" data-slide={slide ? slide.dir : undefined}
          style={{ transform: `translate(${view.scale === 1 ? swipe : view.x}px, ${view.y}px) scale(${view.scale})`, ...(slide ? { ['--slide-from' as string]: `${slide.from}px` } : {}) }}>
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
