// v1buddychange015 (Batch I): Viewing Rush. A chase-camera drive through the same endless 3D town as Buddy Walk: Streets.
// The car drives itself; the agent steers with two big pads and can brake. Reaching the gold beacon finishes a viewing
// (+10 seconds, 100 points + a bonus for beating par time). The round ends when the clock reaches 0 or on Finish.
import { Renderer, newScene, Builder, boxGeo, cylGeo, ringGeo, gemGeo, hex, type Mat, type Mesh } from '../gl3d/gl';
import { City } from '../gl3d/city';
import { lookAt, perspective, relAngle, pushOut, trs, type V3 } from '../gl3d/math';
import { makeHost, Loop, noGlCard, pauseCard, introHtml, esc, ARROW_SVG } from '../gl3d/shell';
import type { StartFn } from '../gl3d/Mount';
import { vrStrings } from './strings';
import { nextViewing, viewingPoints, START_SECONDS, ADD_SECONDS, MAX_SCORE, BLOCK, ROAD, type Viewing } from './logic';

const PAD = (d: 'l' | 'r') => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d === 'l' ? 'M15.5 4 6 12l9.5 8z' : 'M8.5 4 18 12l-9.5 8z'}"/></svg>`;

export const startViewingRush: StartFn = (mount, o) => {
  const t = vrStrings[o.lang];
  const host = makeHost(mount, o.lang, 'vr-root');
  let renderer: Renderer;
  try { renderer = new Renderer(host.canvas); } catch { noGlCard(host, t.title, t.noGl, t.back, o.onExit); return () => host.destroy(); }

  host.hud.innerHTML = `
    <div class="g3-row">
      <div class="g3-chip" data-k="time"><small>${esc(t.time)}</small><b data-testid="vr-time">${START_SECONDS}</b></div>
      <div class="g3-chip"><small>${esc(t.score)}</small><b data-testid="vr-score">0</b></div>
      <div class="g3-chip"><small>${esc(t.viewings)}</small><b data-testid="vr-views">0</b></div>
      <button class="g3-pause" data-testid="vr-pause">${esc(t.pause)}</button>
    </div>
    <div class="g3-strip"><span class="g3-dial" data-k="dial">${ARROW_SVG}</span><span data-testid="vr-job"></span></div>`;
  const pads = document.createElement('div'); pads.className = 'g3-pads'; pads.hidden = true;
  pads.innerHTML = `<button class="g3-pad" data-k="left" aria-label="${esc(t.left)}" data-testid="vr-left">${PAD('l')}</button>
    <button class="g3-pad" data-k="brake" data-testid="vr-brake">${esc(t.brake)}</button>
    <button class="g3-pad" data-k="right" aria-label="${esc(t.right)}" data-testid="vr-right">${PAD('r')}</button>`;
  host.root.appendChild(pads);
  const $ = (s: string) => host.el(s);

  const scene = newScene();
  scene.fog = { color: hex('#7a4f30'), near: 26, far: 100 };
  scene.sky = { ...scene.sky, mid: hex('#3d2618'), bottom: hex('#c27c3e') };
  const city = new City(renderer, scene, { block: BLOCK, road: ROAD, view: 2, lampBoxes: true, signChance: 0, seed: 11 }, () => false);

  // Car: one shape per colour, all moved together.
  const carParts: Mesh[] = [];
  const addCar = (mat: Mat, add: (b: Builder) => void) => { const b = new Builder(); add(b); const m = renderer.mesh(b.geo(), mat); carParts.push(m); scene.meshes.add(m); };
  const box = boxGeo(), wheel = cylGeo(0.38, 0.38, 12);
  addCar({ color: hex('#d9a93f') }, b => b.add(box, trs(0, 0.65, 0, 0, 1.9, 0.6, 3.9)));
  addCar({ color: hex('#2b3440') }, b => b.add(box, trs(0, 1.22, 0.25, 0, 1.6, 0.55, 2.0)));
  addCar({ color: hex('#14110d') }, b => {
    b.add(box, trs(0, 1.53, 0.25, 0, 1.62, 0.06, 2.02));
    // wheel axles point sideways: stand the cylinder on its side (rx), then turn it across the car (ry)
    for (const [x, z] of [[-0.95, -1.2], [0.95, -1.2], [-0.95, 1.25], [0.95, 1.25]]) b.add(wheel, trs(x - 0.15, 0.38, z, Math.PI / 2, 1, 0.3, 1, Math.PI / 2));
  });
  addCar({ color: hex('#fff1c4'), unlit: true }, b => { b.add(box, trs(-0.6, 0.8, -1.96, 0, 0.35, 0.16, 0.04)); b.add(box, trs(0.6, 0.8, -1.96, 0, 0.35, 0.16, 0.04)); });
  addCar({ color: hex('#ff5a3c'), unlit: true }, b => { b.add(box, trs(-0.65, 0.85, 1.96, 0, 0.3, 0.14, 0.04)); b.add(box, trs(0.65, 0.85, 1.96, 0, 0.3, 0.14, 0.04)); });

  // Beacon: a soft column of light, a ring on the road and a turning gem.
  const beam = renderer.mesh(cylGeo(1.4, 1.4, 20, false), { color: hex('#f3cf74'), unlit: true, opacity: 0.28, additive: true, fog: false });
  const ring = renderer.mesh(ringGeo(2.6, 3.3), { color: hex('#f3cf74'), unlit: true, offset: 3 });
  const pin = renderer.mesh(gemGeo(), { color: hex('#f3cf74'), unlit: true });
  for (const m of [beam, ring, pin]) scene.meshes.add(m);

  const C = { x: ROAD / 2, z: BLOCK / 2 + 6, h: 0, v: 0, steer: 0 };
  const G = { state: 'intro' as 'intro' | 'play' | 'paused' | 'done', time: START_SECONDS, score: 0, views: 0, clock: 0, jobStart: 0 };
  let job: Viewing | null = null, bumpCool = 0, clock = 0, lastJob = '';
  const held = { left: false, right: false, brake: false };
  const keys = new Set<string>();
  const cam: { pos: V3 } = { pos: [C.x, 4.3, C.z + 8.5] };

  const placeJob = () => {
    job = nextViewing(Math.random, C.x, C.z);
    G.jobStart = G.clock; lastJob = '';
  };
  const hud = () => {
    $('[data-testid="vr-time"]').textContent = String(Math.max(0, Math.ceil(G.time)));
    $('[data-k="time"]').classList.toggle('g3-low', G.time < 10);
    $('[data-testid="vr-score"]').textContent = String(G.score);
    $('[data-testid="vr-views"]').textContent = String(G.views);
  };
  const release = () => { held.left = held.right = held.brake = false; keys.clear(); pads.querySelectorAll('.g3-pad').forEach(p => p.classList.remove('g3-on')); };
  const finish = () => {
    if (G.state === 'done') return;
    G.state = 'done'; loop.stop(); release();
    o.onFinish({ score: Math.min(MAX_SCORE, G.score), maxScore: MAX_SCORE });
  };

  pads.querySelectorAll<HTMLButtonElement>('.g3-pad').forEach(b => {
    const k = b.dataset.k as keyof typeof held;
    const on = (e: PointerEvent) => { e.preventDefault(); held[k] = true; b.classList.add('g3-on'); try { b.setPointerCapture(e.pointerId); } catch { /* old WebView */ } };
    const off = () => { held[k] = false; b.classList.remove('g3-on'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
    b.addEventListener('contextmenu', e => e.preventDefault());
  });
  const kd = (e: KeyboardEvent) => { keys.add(e.key.toLowerCase()); if (e.key.startsWith('Arrow') && G.state === 'play') e.preventDefault(); };
  const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('blur', release);

  const pause = async () => {
    if (G.state !== 'play') return;
    G.state = 'paused'; release(); loop.stop(); loop.once(); pads.hidden = true;
    const c = await pauseCard(host, t, `${t.score}: ${G.score} · ${t.viewings}: ${G.views}`);
    host.hideCover();
    if (c === 'resume') { G.state = 'play'; pads.hidden = false; loop.run(); }
    else if (c === 'finish') finish();
    else { G.state = 'done'; o.onExit(); }
  };
  $('[data-testid="vr-pause"]').addEventListener('click', () => { void pause(); });

  const MAXV = 17, OFFV = 8;
  const persp = (a: number) => perspective((66 * Math.PI) / 180, a, 0.1, 300);
  const frame = (dt: number) => {
    clock += dt;
    if (G.state === 'play') {
      G.clock += dt; G.time -= dt;
      let s = 0;
      if (held.left || keys.has('arrowleft') || keys.has('a')) s += 1;
      if (held.right || keys.has('arrowright') || keys.has('d')) s -= 1;
      const brake = held.brake || keys.has('arrowdown') || keys.has('s') || keys.has(' ');
      C.steer += (s - C.steer) * (1 - Math.exp(-dt * 8));
      const target = brake ? 0 : city.onRoad(C.x, C.z) ? MAXV : OFFV;
      const rate = brake ? 14 : C.v < target ? 6 : 4;
      C.v += Math.sign(target - C.v) * Math.min(Math.abs(target - C.v), rate * dt);
      C.h += C.steer * 1.9 * dt * Math.min(1, C.v / 6);
      C.x += -Math.sin(C.h) * C.v * dt; C.z += -Math.cos(C.h) * C.v * dt;
      bumpCool -= dt;
      const hit = pushOut(C, 1.25, city.nearBoxes(C.x, C.z));
      if (hit && C.v > 6 && bumpCool <= 0) { C.v *= 0.35; bumpCool = 1; host.toast(t.bump, t.slow, true); }
      else if (hit) C.v = Math.min(C.v, 6);
      if (job && Math.hypot(job.x - C.x, job.z - C.z) < 3.6) {
        const p = viewingPoints(job.par, G.clock - G.jobStart);
        G.score += p.base + p.bonus; G.views++; G.time += ADD_SECONDS;
        host.toast(`+${p.base + p.bonus}`, t.done + (p.bonus > 0 ? ` · ${t.fast} +${p.bonus}` : ''));
        placeJob();
      }
      if (G.time <= 0) { G.time = 0; hud(); finish(); return; }
      hud();
    } else if (G.state === 'intro') C.h += dt * 0.08;
    city.update(C.x, C.z);
    const carM = trs(C.x, 0, C.z, C.h);
    for (const m of carParts) m.model = carM;

    const fx = -Math.sin(C.h), fz = -Math.cos(C.h), k = 1 - Math.exp(-dt * 5);
    const want: V3 = [C.x - fx * 8.5, 4.3, C.z - fz * 8.5];
    cam.pos = dt === 0 ? cam.pos : [cam.pos[0] + (want[0] - cam.pos[0]) * k, cam.pos[1] + (want[1] - cam.pos[1]) * k, cam.pos[2] + (want[2] - cam.pos[2]) * k];
    const look: V3 = [C.x + fx * 5, 1.2, C.z + fz * 5];

    const bx = job ? job.x : ROAD / 2, bz = job ? job.z : -BLOCK * 1.5;
    beam.model = trs(bx, 0, bz, 0, 1, 60, 1);
    const pulse = host.reduceMotion ? 1 : 1 + Math.sin(clock * 3) * 0.06;
    ring.model = trs(bx, 0.06, bz, 0, pulse, 1, pulse);
    pin.model = trs(bx, host.reduceMotion ? 3.2 : 3.2 + Math.sin(clock * 2.5) * 0.3, bz, host.reduceMotion ? 0 : clock * 2, 0.8, 0.8, 0.8);

    if (job && G.state === 'play') {
      $('[data-k="dial"]').style.transform = `rotate(${relAngle(C.h, job.x - C.x, job.z - C.z)}rad)`;
      const txt = `${esc(job.name)} · ${esc(job.type.n[o.lang])}, ${esc(job.area)} · <b>${Math.round(Math.hypot(job.x - C.x, job.z - C.z))} m</b>`;
      if (txt !== lastJob) { $('[data-testid="vr-job"]').innerHTML = txt; lastJob = txt; }
    }
    renderer.resize();
    renderer.render(scene, { eye: cam.pos, target: look, fov: 66, near: 0.1, far: 300 }, persp, lookAt(cam.pos, look));
  };
  const loop = new Loop(frame, () => { void pause(); });
  city.update(C.x, C.z, true);
  loop.run();

  void host.cover(introHtml(t.title, t.intro, [t.how1, t.how2, t.how3], t.sample), [{ id: 'start', label: t.start, primary: true }, { id: 'back', label: t.back }])
    .then(c => {
      host.hideCover();
      if (c === 'back') { G.state = 'done'; o.onExit(); return; }
      C.h = 0; G.state = 'play'; pads.hidden = false; placeJob(); hud();
    });

  return () => {
    loop.dispose(); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', release);
    city.dispose(); renderer.dispose(); host.destroy();
  };
};
