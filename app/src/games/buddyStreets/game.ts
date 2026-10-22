// v1buddychange015 (Batch I): Buddy Walk: Streets. A 2-minute walk through an endless 3D neighbourhood: walk up to a
// gold For Sale sign, open the practice listing and pick its asking price from three choices.
// Score: 100 per right answer + 25 for every answer in the current streak. A round ends after 2 minutes or on Finish.
import { Renderer, newScene } from '../gl3d/gl';
import { City } from '../gl3d/city';
import { lookAt, perspective, forward, relAngle, pushOut, trs } from '../gl3d/math';
import { makeHost, Loop, WalkControls, noGlCard, pauseCard, introHtml, esc, ARROW_SVG } from '../gl3d/shell';
import type { StartFn } from '../gl3d/Mount';
import { streetListing, rm, type StreetListing } from '../sample';
import { bsStrings } from './strings';

export const ROUND_SECONDS = 120;
export const MAX_SCORE = 2500;
/** Points for a right answer when the streak before it was `streak`. */
export const pointsFor = (streak: number) => 100 + 25 * streak;

const SHEET_CSS = `
.bs-sheet { position: absolute; inset: auto 0 0 0; z-index: 8; display: flex; justify-content: center;
  padding: 0 max(12px, env(safe-area-inset-right, 0px)) calc(env(safe-area-inset-bottom, 0px) + 12px) max(12px, env(safe-area-inset-left, 0px)); }
.bs-sheet .g3-card { max-width: 460px; gap: 12px; max-height: calc(100vh - 120px); overflow-y: auto; }
.bs-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.bs-head h3 { margin: 0; font-size: 24px; color: #f3cf74; font-weight: 800; }
.bs-head span { font-size: 14px; color: #c4b48f; white-space: nowrap; font-variant-numeric: tabular-nums; }
.bs-facts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; margin: 0; }
.bs-facts div { min-width: 0; }
.bs-facts dt { font-size: 14px; color: #c4b48f; }
.bs-facts dd { margin: 2px 0 0; font-weight: 700; font-size: 15px; font-variant-numeric: tabular-nums; }
.bs-q { font-weight: 700; font-size: 16px; }
.bs-opts { display: flex; flex-direction: column; gap: 8px; }
.bs-opt { background: rgba(217,169,63,.08); border: 1px solid rgba(217,169,63,.55); border-radius: 12px; padding: 12px 14px; text-align: left;
  font: inherit; font-weight: 800; font-size: 22px; color: #f4ead6; font-variant-numeric: tabular-nums; cursor: pointer; }
.bs-opt:disabled { cursor: default; opacity: .55; }
.bs-opt.bs-good { background: rgba(127,212,155,.16); border-color: #7fd49b; color: #7fd49b; opacity: 1; }
.bs-opt.bs-bad { background: rgba(236,138,111,.14); border-color: #ec8a6f; color: #ec8a6f; opacity: 1; }
.bs-result strong { color: #f3cf74; }
`;

export const startStreets: StartFn = (mount, o) => {
  const t = bsStrings[o.lang];
  const host = makeHost(mount, o.lang, 'bs-root');
  let renderer: Renderer;
  try { renderer = new Renderer(host.canvas); } catch { noGlCard(host, t.title, t.noGl, t.back, o.onExit); return () => host.destroy(); }
  const style = document.createElement('style'); style.textContent = SHEET_CSS; host.root.appendChild(style);

  host.hud.innerHTML = `
    <div class="g3-row">
      <div class="g3-chip" data-k="time"><small>${esc(t.time)}</small><b data-testid="bs-time">${ROUND_SECONDS}</b></div>
      <div class="g3-chip"><small>${esc(t.score)}</small><b data-testid="bs-score">0</b></div>
      <div class="g3-chip"><small>${esc(t.streak)}</small><b data-testid="bs-streak">0</b></div>
      <button class="g3-pause" data-testid="bs-pause">${esc(t.pause)}</button>
    </div>
    <div class="g3-strip"><span class="g3-dial" data-k="dial">${ARROW_SVG}</span><span data-testid="bs-finder"></span></div>`;
  const act = document.createElement('button'); act.className = 'g3-act'; act.hidden = true; act.textContent = t.priceIt; act.dataset.testid = 'bs-price-it';
  const hint = document.createElement('div'); hint.className = 'g3-hint'; hint.textContent = t.hint; hint.hidden = true;
  const sheet = document.createElement('div'); sheet.className = 'bs-sheet'; sheet.hidden = true; sheet.dataset.testid = 'bs-sheet';
  host.root.append(act, hint, sheet);
  const $ = (s: string) => host.el(s);

  const scene = newScene();
  const solved = new Set<string>();
  const city = new City(renderer, scene, { block: 36, road: 8, view: 2, lampBoxes: false, signChance: 0.55, seed: 3 }, id => solved.has(id));
  const ctl = new WalkControls(host);
  const P = { x: 7, z: 36 / 2 + 4, yaw: 0, pitch: -0.04, vx: 0, vz: 0, bob: 0 };
  const G = { state: 'intro' as 'intro' | 'play' | 'paused' | 'quiz' | 'done', time: ROUND_SECONDS, score: 0, streak: 0, correct: 0, priced: 0 };
  let quiz: { id: string; L: StreetListing; answer: number | null; gain: number } | null = null;
  let near: { id: string } | null = null, clock = 0, lastFinder = '';

  const persp = (a: number) => perspective((70 * Math.PI) / 180, a, 0.1, 300);
  const hud = () => {
    $('[data-testid="bs-time"]').textContent = String(Math.max(0, Math.ceil(G.time)));
    $('[data-k="time"]').classList.toggle('g3-low', G.time < 15);
    $('[data-testid="bs-score"]').textContent = String(G.score);
    $('[data-testid="bs-streak"]').textContent = String(G.streak);
  };
  const finish = () => {
    if (G.state === 'done') return;
    G.state = 'done'; loop.stop(); ctl.enabled = false;
    o.onFinish({ score: Math.min(MAX_SCORE, G.score), maxScore: MAX_SCORE });
  };

  const renderQuiz = () => {
    if (!quiz) return;
    const L = quiz.L;
    let h = `<div class="g3-card"><div class="bs-head"><h3>${esc(L.area)}</h3><span>${esc(t.listing)} #${L.no}</span></div>
      <dl class="bs-facts"><div><dt>${esc(t.type)}</dt><dd>${esc(L.type.n[o.lang])}</dd></div><div><dt>${esc(t.tenure)}</dt><dd>${esc(L.freehold ? t.free : t.lease)}</dd></div>
      <div><dt>${esc(t.beds)}</dt><dd>${L.beds}</dd></div><div><dt>${esc(t.size)}</dt><dd>${L.size.toLocaleString('en-MY')} ${esc(t.sqft)}</dd></div></dl>
      <p class="bs-q">${esc(t.q)}</p><div class="bs-opts">`;
    L.options.forEach((p, i) => {
      let cls = 'bs-opt';
      if (quiz!.answer !== null) { if (p === L.price) cls += ' bs-good'; else if (i === quiz!.answer) cls += ' bs-bad'; }
      h += `<button class="${cls}" data-i="${i}" data-testid="bs-opt-${i}"${quiz!.answer !== null ? ' disabled' : ''}>${rm(p)}</button>`;
    });
    h += '</div>';
    if (quiz.answer !== null) {
      const ok = L.options[quiz.answer] === L.price;
      h += `<p class="bs-result">${ok ? `<strong>${esc(t.correct)} +${quiz.gain} ${esc(t.pts)}</strong> ` : `<strong>${esc(t.wrong)}</strong> `}${esc(t.actual)}: ${rm(L.price)} (${rm(L.psf)} ${esc(t.psf)})</p>
        <button class="g3-btn g3-primary" data-testid="bs-continue" data-cont="1">${esc(t.cont)}</button>`;
    }
    h += `<p class="g3-muted">${esc(t.sample)}</p></div>`;
    sheet.innerHTML = h;
    (sheet.querySelector('[data-cont]') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  };
  sheet.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b || !quiz) return;
    if (b.dataset.cont) { const gain = quiz.gain; quiz = null; sheet.hidden = true; G.state = 'play'; ctl.enabled = true; if (gain) host.toast(`+${gain}`); return; }
    if (b.dataset.i === undefined || quiz.answer !== null) return;
    const i = Number(b.dataset.i); quiz.answer = i;
    const ok = quiz.L.options[i] === quiz.L.price;
    G.priced++;
    if (ok) { quiz.gain = pointsFor(G.streak); G.score += quiz.gain; G.streak++; G.correct++; } else G.streak = 0;
    solved.add(quiz.id);
    for (const blk of city.blocks.values()) if (blk.sign?.id === quiz.id) { blk.sign.board.mat = city.boardSoldMat; blk.sign.marker.visible = false; }
    renderQuiz(); hud();
  });
  const openQuiz = (id: string) => {
    ctl.release(); ctl.enabled = false; G.state = 'quiz';
    quiz = { id, L: streetListing(id), answer: null, gain: 0 };
    act.hidden = true; sheet.hidden = false; renderQuiz();
  };
  act.addEventListener('click', () => { if (near && G.state === 'play') openQuiz(near.id); });
  const keyAct = (e: KeyboardEvent) => { if ((e.key === 'e' || e.key === 'Enter') && G.state === 'play' && near) { e.preventDefault(); openQuiz(near.id); } };
  window.addEventListener('keydown', keyAct);

  const pause = async () => {
    if (G.state !== 'play' && G.state !== 'quiz') return;
    const was = G.state; G.state = 'paused'; ctl.release(); ctl.enabled = false; loop.stop(); loop.once();
    const c = await pauseCard(host, t, `${t.score}: ${G.score}`);
    host.hideCover();
    if (c === 'resume') { G.state = was; ctl.enabled = was === 'play'; loop.run(); }
    else if (c === 'finish') finish();
    else { G.state = 'done'; o.onExit(); }
  };
  $('[data-testid="bs-pause"]').addEventListener('click', () => { void pause(); });

  const frame = (dt: number) => {
    clock += dt;
    if (G.state === 'play' || G.state === 'quiz') {
      G.time -= dt;
      if (G.time <= 0) { G.time = 0; hud(); finish(); return; }
    }
    let mx = 0, mz = 0;
    if (G.state === 'play') {
      const [lyaw, lpitch] = ctl.takeLook();
      P.yaw += lyaw; P.pitch = Math.max(-1.1, Math.min(1.1, P.pitch + lpitch));
      if (ctl.key('arrowleft')) P.yaw += dt * 2; if (ctl.key('arrowright')) P.yaw -= dt * 2;
      const [ix, iy] = ctl.move(), s = Math.sin(P.yaw), c = Math.cos(P.yaw), SPEED = 6;
      mx = (-s * iy + c * ix) * SPEED; mz = (-c * iy - s * ix) * SPEED;
    } else if (G.state === 'intro') P.yaw += dt * 0.04;
    const a = 1 - Math.exp(-dt * 10);
    P.vx += (mx - P.vx) * a; P.vz += (mz - P.vz) * a; P.x += P.vx * dt; P.z += P.vz * dt;
    pushOut(P, 0.5, city.nearBoxes(P.x, P.z));
    city.update(P.x, P.z);
    const sp = Math.hypot(P.vx, P.vz); P.bob += sp * dt * 1.9;
    const bob = host.reduceMotion ? 0 : Math.sin(P.bob) * 0.045 * Math.min(1, sp / 6);
    const f = forward(P.yaw, P.pitch);
    const eye: [number, number, number] = [P.x, 1.7 + bob, P.z];
    const target: [number, number, number] = [eye[0] + f[0], eye[1] + f[1], eye[2] + f[2]];

    let best: { id: string; x: number; z: number } | null = null, bd = 1e9;
    for (const blk of city.blocks.values()) {
      const s = blk.sign; if (!s || solved.has(s.id)) continue;
      const y = s.markerY + (host.reduceMotion ? 0 : Math.sin(clock * 2.4) * 0.15);
      s.marker.model = trs(s.x, y, s.z, host.reduceMotion ? 0 : clock * 2, 0.42, 0.42, 0.42);
      const d = Math.hypot(s.x - P.x, s.z - P.z);
      if (d < bd) { bd = d; best = s; }
    }
    if (G.state === 'play') {
      near = best && bd < 4.2 ? best : null;
      act.hidden = !near;
      let txt: string;
      const dial = $('[data-k="dial"]');
      if (best) { dial.style.transform = `rotate(${relAngle(P.yaw, best.x - P.x, best.z - P.z)}rad)`; txt = `${esc(t.nearest)} · <b>${Math.round(bd)} m</b>`; }
      else { dial.style.transform = ''; txt = esc(t.keep); }
      if (txt !== lastFinder) { $('[data-testid="bs-finder"]').innerHTML = txt; lastFinder = txt; }
      hud();
    }
    renderer.resize();
    renderer.render(scene, { eye, target, fov: 70, near: 0.1, far: 300 }, persp, lookAt(eye, target));
  };
  const loop = new Loop(frame, () => { if (G.state === 'play' || G.state === 'quiz') void pause(); });
  city.update(P.x, P.z, true);
  loop.once();
  // The start screen keeps a slow look-around behind the card.
  loop.run();

  void host.cover(introHtml(t.title, t.intro, [t.how1, t.how2, t.how3], t.sample), [{ id: 'start', label: t.start, primary: true }, { id: 'back', label: t.back }])
    .then(c => {
      host.hideCover();
      if (c === 'back') { G.state = 'done'; o.onExit(); return; }
      G.state = 'play'; ctl.enabled = true; hint.hidden = false;
      window.setTimeout(() => { hint.style.opacity = '0'; }, 5000);
      hud();
    });

  const onResize = () => loop.once();
  window.addEventListener('resize', onResize);
  return () => {
    loop.dispose(); ctl.dispose(); window.removeEventListener('keydown', keyAct); window.removeEventListener('resize', onResize);
    city.dispose(); renderer.dispose(); host.destroy();
  };
};
