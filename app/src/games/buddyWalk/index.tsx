// v1buddychange014 (JoyChange004 Change 90): Buddy Walk. The agent walks through their saved listings in a pixel-style
// 3D gold gallery instead of scrolling a list: each listing is a framed picture on the wall, and standing in front of it
// shows its key facts on a gold card. "Visit challenge": visit as many listings as possible in 60 seconds.
// The rules are in engine.ts, the drawing in render.ts / textures.ts, the words in strings.ts.
// Battery: the picture is drawn only while something changes (walking, turning, a visit filling up) and never while the
// app is in the background; the drawing size is a fixed 200 x 125 pixels whatever the phone's screen density.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameDef, GameProps } from '../types';
import { useApp } from '../../data/useStore';
import type { Lang } from '../../i18n';
import { listingStrings } from '../../listing/strings';
import type { Listing } from '../../listing/model';
import {
  buildWorld, startPlayer, move, nudge, facingPanel, updateVisits, dwellProgress, NO_VISITS, newClock, tick, timeUp, secondsLeft,
  roundResult, once, MAX_PANELS, PANEL0, END, panelRow, type Input, type NudgeKind, type Player, type Visits, type Clock,
} from './engine';
import { renderFrame, VIEW_W, VIEW_H, type Texture } from './render';
import { wallTexture, endTexture, panelTexture, houseKind, loadImage, thumbnail } from './textures';
import { walkListings, listingFacts, framePhoto } from './listings';
import { bwStrings } from './strings';
import { BW_CSS } from './styles';

type Mode = 'challenge' | 'walk';
type Held = Record<NudgeKind, boolean>;
const NOT_HELD: Held = { fwd: false, back: false, left: false, right: false };
const KEYS: Record<string, NudgeKind> = {
  ArrowUp: 'fwd', KeyW: 'fwd', ArrowDown: 'back', KeyS: 'back', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
/** Photos are loaded only for frames within this many rows of the agent. */
const LOAD_ROWS = 8;
const TAU = Math.PI * 2;
/** The parts of a pointer event used here (the project's small React types do not describe pointer events). */
interface RPointerEvent<T> { pointerId: number; clientX: number; clientY: number; currentTarget: T; preventDefault(): void }

/** Small pixel arrows for the control buttons (drawn, no emoji, the same on every phone). */
function Arrow({ dir }: { dir: NudgeKind }) {
  const rot = { fwd: 0, right: 90, back: 180, left: 270 }[dir];
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true" fill="currentColor" style={{ transform: `rotate(${rot}deg)` }}>
      <rect x="4" y="1" width="2" height="1" /><rect x="3" y="2" width="4" height="1" /><rect x="2" y="3" width="6" height="1" />
      <rect x="1" y="4" width="8" height="1" /><rect x="4" y="5" width="2" height="4" />
    </svg>
  );
}

function BuddyWalk({ lang, onFinish, onExit }: GameProps) {
  const t = bwStrings[lang];
  const { state } = useApp();
  // The gallery is fixed for the whole walk, so a sync arriving mid-round never moves the frames under the agent.
  const [all] = useState<Listing[]>(() => walkListings(state));
  const listings = useMemo(() => all.slice(0, MAX_PANELS), [all]);
  const [phase, setPhase] = useState<'intro' | 'play'>('intro');
  const [mode, setMode] = useState<Mode>('challenge');

  if (listings.length === 0) {
    return (
      <div className="bw-root" data-testid="bw-root">
        <style>{BW_CSS}</style>
        <div className="bw-panel" data-testid="bw-empty">
          <h2>{t.emptyTitle}</h2>
          <p className="bw-muted">{t.emptyBody}</p>
          <div className="bw-btns"><button className="btn ghost" data-testid="bw-exit" onClick={onExit}>{t.exit}</button></div>
        </div>
      </div>
    );
  }
  if (phase === 'intro') {
    return (
      <div className="bw-root" data-testid="bw-root">
        <style>{BW_CSS}</style>
        <div className="bw-panel" data-testid="bw-intro">
          <h2>{t.introTitle}</h2>
          <p>{t.introBody}</p>
          <h3>{t.challengeTitle}</h3>
          <p className="bw-muted">{t.challengeBody(listings.length)}</p>
          {all.length > listings.length && <p className="bw-muted">{t.more(listings.length)}</p>}
          <div className="bw-btns">
            <button className="btn primary" data-testid="bw-start" onClick={() => { setMode('challenge'); setPhase('play'); }}>{t.startChallenge}</button>
            <button className="btn secondary" data-testid="bw-free" onClick={() => { setMode('walk'); setPhase('play'); }}>{t.justWalk}</button>
            <button className="btn ghost" data-testid="bw-exit" onClick={onExit}>{t.exit}</button>
          </div>
          <p className="bw-help">{t.howTo}</p>
        </div>
      </div>
    );
  }
  return <Walk lang={lang} listings={listings} mode={mode} onFinish={onFinish} onExit={onExit} />;
}

function Walk({ lang, listings, mode, onFinish, onExit }: { lang: Lang; listings: Listing[]; mode: Mode } & Pick<GameProps, 'onFinish' | 'onExit'>) {
  const t = bwStrings[lang];
  const ls = listingStrings[lang];
  const { store } = useApp();
  const n = listings.length;
  const world = useMemo(() => buildWorld(n), [n]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const player = useRef<Player>(startPlayer());
  const held = useRef<Held>({ ...NOT_HELD });
  const keys = useRef<Held>({ ...NOT_HELD });
  const drag = useRef<{ id: number; x0: number; y0: number; lastX: number; fwd: number } | null>(null);
  const pendingTurn = useRef(0);
  const visits = useRef<Visits>(NO_VISITS);
  const clock = useRef<Clock>(newClock());
  const wake = useRef<() => void>(() => {});
  // onFinish runs exactly once per round, whichever comes first: time running out or the Finish button.
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const finish = useRef(once((r: { score: number; maxScore: number }) => onFinishRef.current(r))).current;

  const [facing, setFacing] = useState(-1);
  const [visitedCount, setVisitedCount] = useState(0);
  const [visitedNow, setVisitedNow] = useState<number[]>([]);
  const [progress, setProgress] = useState(0);
  const [secs, setSecs] = useState(secondsLeft(clock.current));
  const [heldView, setHeldView] = useState<Held>({ ...NOT_HELD });

  const end = () => { finish(roundResult(visits.current.visited.length, n)); };

  // Wall pictures: made once; each listing's frame gets its photo when the agent comes near it.
  const tex = useRef<{ wall: Texture; end: Texture; panels: (Texture | undefined)[]; photos: (HTMLCanvasElement | null | undefined)[]; asked: Set<number> } | null>(null);
  if (!tex.current) tex.current = { wall: wallTexture(), end: endTexture(), panels: [], photos: [], asked: new Set() };
  const look = (i: number) => ({ number: i + 1, kind: houseKind(listings[i]?.type), visited: visits.current.visited.includes(i) });
  const panelTex = (i: number): Texture => {
    const k = tex.current!;
    return (k.panels[i] ??= panelTexture(look(i), k.photos[i]));
  };
  const texFor = (cell: number): Texture => (cell >= PANEL0 ? panelTex(cell - PANEL0) : cell === END ? tex.current!.end : tex.current!.wall);

  useEffect(() => {
    let alive = true;
    let raf = 0, last = 0, dirty = true, lastFacing = -2;
    const canvas = canvasRef.current!;
    const g = canvas.getContext('2d');
    const image = g ? g.createImageData(VIEW_W, VIEW_H) : null;
    const buf = image ? new Uint32Array(image.data.buffer) : new Uint32Array(VIEW_W * VIEW_H);

    const askPhotos = () => {
      const k = tex.current!;
      const p = player.current;
      for (let i = 0; i < n; i++) {
        if (k.asked.has(i) || Math.abs(panelRow(i) + 0.5 - p.y) > LOAD_ROWS) continue;
        k.asked.add(i);
        const photo = framePhoto(listings[i]);
        if (!photo) continue;
        void (async () => {
          const url = photo.url ?? (photo.fileId ? await store.fileUrl(photo.fileId) : undefined);
          let img = url ? await loadImage(url) : null;
          if (!img && photo.fileId && !photo.url) {
            // A stored photo's address can go stale: ask once more for a fresh one (the same rule as the photo cards).
            const again = await store.refreshFileUrl(photo.fileId);
            img = again ? await loadImage(again) : null;
          }
          if (!alive || !img) return;
          k.photos[i] = thumbnail(img);
          k.panels[i] = undefined;
          dirty = true; start();
        })().catch(() => { /* no photo: the frame keeps its pixel house */ });
      }
    };

    const input = (): Input => {
      const h = held.current, kk = keys.current;
      const f = (h.fwd || kk.fwd ? 1 : 0) - (h.back || kk.back ? 1 : 0) + (drag.current?.fwd ?? 0);
      const r = (h.left || kk.left ? 1 : 0) - (h.right || kk.right ? 1 : 0);
      return { fwd: Math.max(-1, Math.min(1, f)), turn: r };
    };

    const draw = () => {
      renderFrame(buf, VIEW_W, VIEW_H, player.current, world, texFor, { highlight: facingPanel(player.current, world) });
      if (g && image) g.putImageData(image, 0, 0);
      const p = player.current;
      rootRef.current?.setAttribute('data-pos', `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.a.toFixed(2)}`);
    };

    const frame = (now: number) => {
      raf = 0;
      if (!alive) return;
      const dt = last ? (now - last) / 1000 : 0;
      last = now;
      const inp = input();
      const moving = inp.fwd !== 0 || inp.turn !== 0 || pendingTurn.current !== 0;
      if (moving) {
        let p = move(player.current, inp, dt, world);
        if (pendingTurn.current) { p = { ...p, a: (((p.a + pendingTurn.current) % TAU) + TAU) % TAU }; pendingTurn.current = 0; }
        player.current = p;
        askPhotos();
        dirty = true;
      }
      const f = facingPanel(player.current, world);
      const { visits: v, newly } = updateVisits(visits.current, f, dt);
      visits.current = v;
      if (newly >= 0) {
        tex.current!.panels[newly] = undefined; // redraw the frame with its gold tick
        setVisitedCount(v.visited.length);
        setVisitedNow([...v.visited]);
        dirty = true;
      }
      if (f !== lastFacing) { lastFacing = f; setFacing(f); dirty = true; }
      setProgress(Math.round(dwellProgress(v) * 10) / 10);
      if (dirty) { draw(); dirty = false; }
      const dwelling = f >= 0 && !v.visited.includes(f);
      if (moving || dwelling || drag.current) raf = requestAnimationFrame(frame);
      else last = 0;
    };
    const start = () => { if (alive && !raf && !document.hidden) raf = requestAnimationFrame(frame); };
    wake.current = start;

    const onVis = () => {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0; last = 0;
        held.current = { ...NOT_HELD }; keys.current = { ...NOT_HELD }; drag.current = null;
        setHeldView({ ...NOT_HELD });
      } else { dirty = true; start(); }
    };
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    };
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      const k = KEYS[e.code] ?? KEYS[e.key];
      if (!k || typing(e) || e.altKey || e.ctrlKey || e.metaKey) return;
      // Enter / Space on a focused arrow button are handled by the button itself; arrow keys must not scroll the page.
      e.preventDefault();
      if (keys.current[k] === down) return;
      keys.current = { ...keys.current, [k]: down };
      start();
    };
    const kd = onKey(true), ku = onKey(false);
    const blur = () => { keys.current = { ...NOT_HELD }; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', onVis);
    askPhotos();
    draw();
    start();
    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      wake.current = () => {};
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', onVis);
    };
    // The walk is set up once; listings and the world do not change while it runs.
  }, []);

  // The 60-second clock: counts only while the game is on screen; ends the round once.
  useEffect(() => {
    if (mode !== 'challenge') return;
    let prev = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const gap = now - prev;
      prev = now;
      if (document.hidden) return;
      clock.current = tick(clock.current, gap);
      setSecs(secondsLeft(clock.current));
      if (timeUp(clock.current)) { window.clearInterval(id); end(); }
    }, 250);
    return () => window.clearInterval(id);
  }, [mode]);

  // Hold-to-move buttons. A tap from the keyboard (Enter / Space: a click with no pointer) takes one small step instead.
  const press = (k: NudgeKind, down: boolean) => {
    if (held.current[k] === down) return;
    held.current = { ...held.current, [k]: down };
    setHeldView(held.current);
    if (down) wake.current();
  };
  const keyProps = (k: NudgeKind) => ({
    'aria-label': t[k],
    title: t[k],
    'data-testid': `bw-${k}`,
    'data-held': heldView[k] ? '1' : '0',
    onPointerDown: (e: RPointerEvent<HTMLButtonElement>) => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* old browsers */ } press(k, true); },
    onPointerUp: () => press(k, false),
    onPointerCancel: () => press(k, false),
    onLostPointerCapture: () => press(k, false),
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    onClick: (e: EabEvent<HTMLElement>) => { if ((e as unknown as MouseEvent).detail === 0) { player.current = nudge(player.current, k, world); wake.current(); } },
  });

  // Dragging on the picture: sideways looks around, up and down walks (like a joystick, from where the finger landed).
  const onDown = (e: RPointerEvent<HTMLCanvasElement>) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, lastX: e.clientX, fwd: 0 };
    wake.current();
  };
  const onMove = (e: RPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const w = e.currentTarget.clientWidth || 320;
    pendingTurn.current -= ((e.clientX - d.lastX) / w) * 2.2;
    d.lastX = e.clientX;
    const dy = e.clientY - d.y0;
    d.fwd = Math.abs(dy) < 14 ? 0 : Math.max(-1, Math.min(1, -dy / 70));
    wake.current();
  };
  const onUp = () => { drag.current = null; wake.current(); };

  const facts = facing >= 0 ? listingFacts(listings[facing], lang) : null;
  const isVisited = facing >= 0 && visitedNow.includes(facing);
  const low = mode === 'challenge' && secs <= 10;
  return (
    <div className="bw-root" data-testid="bw-root" data-mode={mode} ref={rootRef}>
      <style>{BW_CSS}</style>
      <div className="bw-hud">
        <span className={`bw-stat ${low ? 'bw-low' : ''}`} data-testid="bw-time" role="timer" aria-live="off">{mode === 'challenge' ? t.timeLeft(secs) : t.freeWalk}</span>
        <span className="bw-stat" data-testid="bw-visited">{t.visited(visitedCount, n)}</span>
        <span className="bw-hud-btns">
          {mode === 'challenge' && <button className="btn primary" data-testid="bw-finish" onClick={end}>{t.finish}</button>}
          <button className="btn secondary" data-testid="bw-exit" onClick={onExit}>{t.exit}</button>
        </span>
      </div>
      <div className="bw-view">
        <canvas ref={canvasRef} className="bw-canvas" data-testid="bw-canvas" width={VIEW_W} height={VIEW_H} tabIndex={0} role="img"
          aria-label={t.canvas(n, facts?.title)}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onLostPointerCapture={onUp}
          onContextMenu={(e: EabEvent<HTMLElement>) => e.preventDefault()} />
        {facing >= 0 && !isVisited && progress > 0 && <span className="bw-progress" data-testid="bw-progress" aria-hidden="true"><i style={{ width: `${progress * 100}%` }} /></span>}
      </div>
      <div className="bw-pad" role="group" aria-label={`${t.left} / ${t.fwd} / ${t.back} / ${t.right}`}>
        <button type="button" className="bw-key" {...keyProps('left')}><Arrow dir="left" /></button>
        <button type="button" className="bw-key" {...keyProps('fwd')}><Arrow dir="fwd" /></button>
        <button type="button" className="bw-key" {...keyProps('back')}><Arrow dir="back" /></button>
        <button type="button" className="bw-key" {...keyProps('right')}><Arrow dir="right" /></button>
      </div>
      <div className={`bw-card ${facts ? '' : 'bw-none'}`} data-testid="bw-info" aria-live="polite">
        {facts ? (
          <>
            <div className="bw-card-top">
              <span className="bw-chip">{t.listingNo(facing + 1, n)}</span>
              {facts.type && <span className="bw-chip" data-testid="bw-info-type">{facts.type}</span>}
              {facts.sample && <span className="bw-chip">{ls.sample}</span>}
              {isVisited ? <span className="bw-chip bw-on" data-testid="bw-info-visited">{t.visitedTag}</span>
                : <span className="bw-chip">{t.visiting}</span>}
            </div>
            <p className="bw-title" data-testid="bw-info-title">{facts.title}</p>
            <p className="bw-price" data-testid="bw-info-price">{facts.prices.map(x => <span key={x}>{x}</span>)}</p>
            {facts.rows.length > 0 && (
              <dl className="bw-facts">
                {facts.rows.map(r => <div key={r.k} data-fact={r.k}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}
              </dl>
            )}
          </>
        ) : <p className="bw-muted" data-testid="bw-hint">{t.hint}</p>}
      </div>
      <p className="bw-help">{t.howTo}</p>
    </div>
  );
}

export const game: GameDef = {
  key: 'buddyWalk',
  title: { en: 'Buddy Walk', bm: 'Buddy Walk', zh: 'Buddy 漫步' },
  blurb: { en: 'Walk through your listings in 3D.', bm: 'Berjalan melalui senarai anda dalam 3D.', zh: '以 3D 方式走过您的房源。' },
  icon: () => <svg aria-hidden="true" width={28} height={28} viewBox="0 0 24 24" fill="currentColor"><rect x="10" y="3" width="4" height="4" /><rect x="9" y="8" width="6" height="7" /><rect x="8" y="16" width="3" height="5" /><rect x="13" y="16" width="3" height="5" /></svg>,
  Component: BuddyWalk,
};
