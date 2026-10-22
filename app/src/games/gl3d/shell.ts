// v1buddychange015 (Batch I): the full-screen frame shared by the 3D games: the start card, the score chips, the pause
// card, short pop-up messages, and the walking controls (left thumb walks, right thumb looks).
// It is plain DOM (not React) so a game can update its numbers 60 times a second without re-rendering the app.
// Battery: the picture is only drawn while a round is running, and drawing stops whenever the app goes to the background.
import type { Lang } from '../../i18n';

export const G3_CSS = `
.g3 { position: fixed; inset: 0; z-index: 2000; background: #0d0b08; color: #f4ead6; overflow: hidden;
  -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; touch-action: none; font-size: 15px; }
.g3 * { box-sizing: border-box; }
.g3 [hidden], .g3[hidden] { display: none !important; }
.g3 canvas.g3-view { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
.g3-hud { position: absolute; top: 0; left: 0; right: 0; z-index: 3; display: flex; flex-direction: column; gap: 8px; pointer-events: none;
  padding: calc(env(safe-area-inset-top, 0px) + 10px) max(12px, env(safe-area-inset-right, 0px)) 0 max(12px, env(safe-area-inset-left, 0px)); }
.g3-row { display: flex; gap: 6px; align-items: flex-start; }
.g3-chip { background: rgba(17,14,9,.9); border: 1px solid rgba(217,169,63,.55); border-radius: 10px; padding: 4px 10px; display: flex; flex-direction: column; min-width: 58px; }
.g3-chip small { font-size: 14px; color: #c4b48f; line-height: 1.2; }
.g3-chip b { font-size: 24px; line-height: 1.1; color: #f3cf74; font-variant-numeric: tabular-nums; }
.g3-chip.g3-low b { color: #ec8a6f; }
.g3-pause { pointer-events: auto; margin-left: auto; min-height: 44px; padding: 0 14px; border-radius: 10px; border: 1px solid rgba(217,169,63,.55);
  background: rgba(17,14,9,.9); color: #f3cf74; font: inherit; font-weight: 700; font-size: 15px; cursor: pointer; }
.g3-strip { align-self: flex-start; max-width: 100%; display: flex; align-items: center; gap: 10px; background: rgba(17,14,9,.9);
  border: 1px solid rgba(217,169,63,.55); border-radius: 14px; padding: 5px 12px 5px 5px; font-size: 15px; line-height: 1.3; }
.g3-strip b { color: #f3cf74; font-variant-numeric: tabular-nums; }
.g3-strip > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.g3-dial { flex: none; width: 34px; height: 34px; border-radius: 50%; background: #d9a93f; display: grid; place-items: center; }
.g3-dial svg { width: 15px; height: 15px; }
.g3-list { align-self: flex-start; max-width: 100%; background: rgba(17,14,9,.9); border: 1px solid rgba(217,169,63,.55); border-radius: 14px; padding: 8px 12px; display: flex; flex-direction: column; gap: 5px; }
.g3-list > small { font-size: 14px; color: #c4b48f; }
.g3-list > small b { color: #f3cf74; }
.g3-list ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.g3-list li { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; }
.g3-list li i { flex: none; width: 18px; height: 18px; border-radius: 50%; border: 2px solid #d9a93f; }
.g3-list li.g3-done { color: #7fd49b; }
.g3-list li.g3-done i { background: #7fd49b; border-color: #7fd49b; box-shadow: inset 0 0 0 3px #0d0b08; }
.g3-act { position: absolute; z-index: 4; left: 50%; transform: translateX(-50%); bottom: calc(env(safe-area-inset-bottom, 0px) + 30px);
  background: #d9a93f; color: #0d0b08; border: 0; border-radius: 12px; padding: 14px 24px; font: inherit; font-weight: 800; font-size: 18px; white-space: nowrap;
  box-shadow: 0 0 0 5px rgba(217,169,63,.22), 0 10px 30px rgba(0,0,0,.45); cursor: pointer; }
.g3-hint { position: absolute; z-index: 2; left: 0; right: 0; bottom: calc(env(safe-area-inset-bottom, 0px) + 18px); text-align: center; font-size: 14px;
  text-shadow: 0 1px 3px #000; pointer-events: none; padding: 0 24px; transition: opacity .8s; }
.g3-joy { position: absolute; z-index: 2; width: 116px; height: 116px; margin: -58px 0 0 -58px; border-radius: 50%; border: 2px solid rgba(217,169,63,.55); background: rgba(13,11,8,.3); pointer-events: none; }
.g3-joy i { position: absolute; left: 50%; top: 50%; width: 50px; height: 50px; margin: -25px 0 0 -25px; border-radius: 50%; background: #d9a93f; opacity: .9; }
.g3-toast { position: absolute; z-index: 5; left: 50%; top: 38%; transform: translate(-50%, -50%); width: min(90vw, 420px); text-align: center; pointer-events: none; text-shadow: 0 2px 12px #000; }
.g3-toast b { display: block; font-size: 36px; font-weight: 800; color: #f3cf74; line-height: 1.1; }
.g3-toast b.g3-bad { color: #ec8a6f; }
.g3-toast span { font-size: 16px; font-weight: 700; }
.g3-cross { position: absolute; z-index: 2; left: 50%; top: 50%; width: 18px; height: 18px; margin: -9px 0 0 -9px; border: 2px solid rgba(243,207,116,.7); border-radius: 50%; pointer-events: none; }
.g3-pads { position: absolute; z-index: 3; left: 0; right: 0; bottom: 0; display: grid; grid-template-columns: 1fr .8fr 1fr; gap: 10px;
  padding: 0 max(12px, env(safe-area-inset-right, 0px)) calc(env(safe-area-inset-bottom, 0px) + 14px) max(12px, env(safe-area-inset-left, 0px)); }
.g3-pad { touch-action: none; height: 84px; border-radius: 16px; border: 1px solid rgba(217,169,63,.55); background: rgba(13,11,8,.55); color: #f3cf74;
  display: grid; place-items: center; font: inherit; font-weight: 800; font-size: 17px; cursor: pointer; }
.g3-pad svg { width: 34px; height: 34px; fill: currentColor; }
.g3-pad.g3-on { background: #d9a93f; color: #0d0b08; }
.g3-cover { position: absolute; inset: 0; z-index: 10; display: grid; place-items: center; overflow-y: auto; background: linear-gradient(180deg, rgba(13,11,8,.35), rgba(13,11,8,.9) 70%);
  padding: calc(env(safe-area-inset-top, 0px) + 16px) max(16px, env(safe-area-inset-right, 0px)) calc(env(safe-area-inset-bottom, 0px) + 16px) max(16px, env(safe-area-inset-left, 0px)); }
.g3-card { width: 100%; max-width: 400px; background: rgba(17,14,9,.94); border: 1px solid rgba(217,169,63,.55); border-radius: 16px; padding: 20px 18px; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
.g3-card h2 { margin: 0; font-size: 30px; line-height: 1.05; color: #f3cf74; font-weight: 800; }
.g3-card p { margin: 0; line-height: 1.45; font-size: 15px; }
.g3-card .g3-muted { color: #c4b48f; font-size: 14px; }
.g3-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
.g3-steps li { display: grid; grid-template-columns: 28px 1fr; gap: 10px; align-items: center; font-size: 15px; line-height: 1.35; }
.g3-steps li span { width: 28px; height: 28px; border-radius: 7px; border: 1px solid rgba(217,169,63,.55); display: grid; place-items: center; font-weight: 800; color: #f3cf74; }
.g3-btn { min-height: 50px; border-radius: 12px; font: inherit; font-weight: 800; font-size: 17px; cursor: pointer; border: 1px solid rgba(217,169,63,.55); background: transparent; color: #f3cf74; }
.g3-btn.g3-primary { background: #d9a93f; color: #0d0b08; border-color: #d9a93f; }
.g3 button:focus-visible { outline: 3px solid #f6e3a1; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .g3-hint { transition: none; } }
`;

export interface Host {
  root: HTMLDivElement;
  canvas: HTMLCanvasElement;
  hud: HTMLDivElement;
  lang: Lang;
  reduceMotion: boolean;
  toast(big: string, small?: string, bad?: boolean): void;
  /** The start card; resolves when Start is tapped. */
  cover(html: string, buttons: { id: string; label: string; primary?: boolean }[]): Promise<string>;
  hideCover(): void;
  el<T extends HTMLElement = HTMLElement>(sel: string): T;
  destroy(): void;
}

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

export function makeHost(mount: HTMLElement, lang: Lang, testId: string): Host {
  const root = document.createElement('div');
  root.className = 'g3';
  root.dataset.testid = testId;
  root.innerHTML = `<style>${G3_CSS}</style><canvas class="g3-view" data-testid="g3-canvas"></canvas><div class="g3-hud"></div><div class="g3-toast" hidden><b></b><span></span></div>`;
  (mount.ownerDocument.body ?? mount).appendChild(root);
  const toastEl = root.querySelector('.g3-toast') as HTMLDivElement;
  let toastT = 0;
  let coverEl: HTMLDivElement | null = null;
  const host: Host = {
    root, lang,
    canvas: root.querySelector('canvas')!,
    hud: root.querySelector('.g3-hud')!,
    reduceMotion: !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    toast(big, small = '', bad = false) {
      const b = toastEl.querySelector('b')!;
      b.textContent = big; b.className = bad ? 'g3-bad' : '';
      toastEl.querySelector('span')!.textContent = small;
      toastEl.hidden = false;
      window.clearTimeout(toastT);
      toastT = window.setTimeout(() => { toastEl.hidden = true; }, 1400);
    },
    cover(html, buttons) {
      host.hideCover();
      coverEl = document.createElement('div');
      coverEl.className = 'g3-cover';
      coverEl.innerHTML = `<div class="g3-card" role="dialog" aria-modal="true">${html}${buttons
        .map(b => `<button class="g3-btn${b.primary ? ' g3-primary' : ''}" data-testid="g3-${b.id}" data-id="${b.id}">${esc(b.label)}</button>`).join('')}</div>`;
      root.appendChild(coverEl);
      const first = coverEl.querySelector('button.g3-primary') as HTMLButtonElement | null;
      first?.focus({ preventScroll: true });
      return new Promise(res => {
        coverEl!.addEventListener('click', e => {
          const b = (e.target as HTMLElement).closest('button[data-id]') as HTMLButtonElement | null;
          if (b) res(b.dataset.id!);
        });
      });
    },
    hideCover() { coverEl?.remove(); coverEl = null; },
    el(sel) { return root.querySelector(sel) as never; },
    destroy() { window.clearTimeout(toastT); root.remove(); },
  };
  return host;
}

/** A pause-aware animation loop: stops while paused or while the app is in the background. */
export class Loop {
  private raf = 0; private last = 0; private on = false;
  private onVis = () => { if (document.hidden) { this.stopFrames(); this.onHidden(); } else if (this.on) this.startFrames(); };
  constructor(private frame: (dt: number) => void, private onHidden: () => void) { document.addEventListener('visibilitychange', this.onVis); }
  run(): void { this.on = true; if (!document.hidden) this.startFrames(); }
  stop(): void { this.on = false; this.stopFrames(); }
  /** Draws one picture without running (for the paused or start screen). */
  once(): void { this.frame(0); }
  private startFrames() {
    if (this.raf) return;
    this.last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      this.frame(dt);
      this.raf = this.on ? requestAnimationFrame(step) : 0;
    };
    this.raf = requestAnimationFrame(step);
  }
  private stopFrames() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
  dispose(): void { this.stop(); document.removeEventListener('visibilitychange', this.onVis); }
}

/** Left half of the screen: a thumb joystick that appears where the thumb lands. Right half: drag to look around.
 *  A quick touch that does not move counts as a tap (onTap), used to point at things in the 3D view. */
export class WalkControls {
  joyX = 0; joyY = 0; yawDelta = 0; pitchDelta = 0;
  private joyId: number | null = null; private lookId: number | null = null;
  private ox = 0; private oy = 0; private lx = 0; private ly = 0;
  private downs = new Map<number, { x: number; y: number; t: number; moved: boolean }>();
  private joy: HTMLDivElement; private knob: HTMLElement;
  private keys = new Set<string>();
  enabled = false;
  onTap: ((x: number, y: number) => void) | null = null;
  private off: (() => void)[] = [];

  constructor(host: Host) {
    this.joy = document.createElement('div'); this.joy.className = 'g3-joy'; this.joy.hidden = true; this.joy.innerHTML = '<i></i>';
    host.root.appendChild(this.joy); this.knob = this.joy.querySelector('i')!;
    const c = host.canvas;
    const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, k: K, f: (e: HTMLElementEventMap[K]) => void) => { t.addEventListener(k, f as EventListener); this.off.push(() => t.removeEventListener(k, f as EventListener)); };
    on(c, 'pointerdown', e => {
      if (!this.enabled) return;
      try { c.setPointerCapture(e.pointerId); } catch { /* old WebView */ }
      this.downs.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: false });
      if (e.clientX < c.clientWidth / 2 && this.joyId === null) {
        this.joyId = e.pointerId; this.ox = e.clientX; this.oy = e.clientY; this.joyX = this.joyY = 0;
        this.joy.style.left = `${e.clientX}px`; this.joy.style.top = `${e.clientY}px`; this.knob.style.transform = '';
      } else if (this.lookId === null) { this.lookId = e.pointerId; this.lx = e.clientX; this.ly = e.clientY; }
    });
    on(c, 'pointermove', e => {
      const d = this.downs.get(e.pointerId);
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) d.moved = true;
      if (e.pointerId === this.joyId) {
        if (d?.moved) this.joy.hidden = false;
        let dx = e.clientX - this.ox, dy = e.clientY - this.oy; const l = Math.hypot(dx, dy), R = 58;
        if (l > R) { dx *= R / l; dy *= R / l; }
        this.joyX = dx / R; this.joyY = dy / R; this.knob.style.transform = `translate(${dx}px,${dy}px)`;
      } else if (e.pointerId === this.lookId) {
        this.yawDelta -= (e.clientX - this.lx) * 0.005; this.pitchDelta -= (e.clientY - this.ly) * 0.004;
        this.lx = e.clientX; this.ly = e.clientY;
      }
    });
    const end = (e: PointerEvent) => {
      const d = this.downs.get(e.pointerId); this.downs.delete(e.pointerId);
      if (e.pointerId === this.joyId) { this.joyId = null; this.joyX = this.joyY = 0; this.joy.hidden = true; }
      if (e.pointerId === this.lookId) this.lookId = null;
      if (e.type === 'pointerup' && d && !d.moved && performance.now() - d.t < 400 && this.enabled) this.onTap?.(e.clientX, e.clientY);
    };
    on(c, 'pointerup', end); on(c, 'pointercancel', end);
    on(window, 'keydown', e => { this.keys.add(e.key.toLowerCase()); });
    on(window, 'keyup', e => { this.keys.delete(e.key.toLowerCase()); });
    on(window, 'blur', () => this.release());
  }
  key(k: string): boolean { return this.keys.has(k); }
  /** Movement wanted this frame as [sideways, forwards], each -1..1. */
  move(): [number, number] {
    let ix = this.joyX, iy = -this.joyY;
    if (this.key('w') || this.key('arrowup')) iy += 1;
    if (this.key('s') || this.key('arrowdown')) iy -= 1;
    if (this.key('a')) ix -= 1;
    if (this.key('d')) ix += 1;
    const l = Math.hypot(ix, iy);
    return l > 1 ? [ix / l, iy / l] : [ix, iy];
  }
  takeLook(): [number, number] { const r: [number, number] = [this.yawDelta, this.pitchDelta]; this.yawDelta = this.pitchDelta = 0; return r; }
  release(): void { this.joyId = this.lookId = null; this.joyX = this.joyY = 0; this.joy.hidden = true; this.keys.clear(); this.downs.clear(); this.yawDelta = this.pitchDelta = 0; }
  dispose(): void { for (const f of this.off) f(); this.off = []; }
}

/** Shown instead of the game when the phone cannot start WebGL. */
export function noGlCard(host: Host, title: string, msg: string, back: string, onExit: () => void): void {
  void host.cover(`<h2>${esc(title)}</h2><p data-testid="g3-nogl">${esc(msg)}</p>`, [{ id: 'back', label: back, primary: true }]).then(onExit);
}

/** Pause card: Resume, Finish round (keeps the score), Back to Games. */
export async function pauseCard(host: Host, t: { paused: string; resume: string; finish: string; back: string }, scoreLine: string): Promise<'resume' | 'finish' | 'back'> {
  return (await host.cover(`<h2>${esc(t.paused)}</h2><p>${esc(scoreLine)}</p>`, [
    { id: 'resume', label: t.resume, primary: true }, { id: 'finish', label: t.finish }, { id: 'back', label: t.back },
  ])) as 'resume' | 'finish' | 'back';
}

/** Intro card with three numbered steps. */
export function introHtml(title: string, intro: string, steps: string[], note: string): string {
  return `<h2>${esc(title)}</h2><p>${esc(intro)}</p><ul class="g3-steps">${steps.map((s, i) => `<li><span>${i + 1}</span><div>${esc(s)}</div></li>`).join('')}</ul><p class="g3-muted">${esc(note)}</p>`;
}

/** Gold arrow used in the direction strip. */
export const ARROW_SVG = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 0 13 13 7 10 1 13z" fill="#0d0b08"/></svg>';
