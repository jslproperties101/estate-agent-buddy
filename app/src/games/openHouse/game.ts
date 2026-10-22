// v1buddychange015 (Batch I): Open House Tour. First-person walk through one 3-bedroom show unit. Each buyer wants three
// features; the agent finds them and taps their gold sparkle. Wrong feature: -5 s. All three found: +15 s, next buyer.
import { Renderer, newScene, Builder, boxGeo, planeGeo, gemGeo, ballGeo, cylGeo, paint, hex, type Mat, type Mesh, type Geo } from '../gl3d/gl';
import { lookAt, perspective, forward, mul, invert, pushOut, raySphere, rayBox, trs, rng, type Box3, type Rect, type V3, type M4 } from '../gl3d/math';
import { makeHost, Loop, WalkControls, noGlCard, pauseCard, introHtml, esc } from '../gl3d/shell';
import type { StartFn } from '../gl3d/Mount';
import { ohStrings } from './strings';
import { FEATURES, newTourBuyer, showFeature, ROUND_SECONDS, MAX_SCORE, type FeatureId, type TourBuyer } from './logic';

const H = 3, TH = 0.2;

export const startOpenHouse: StartFn = (mount, o) => {
  const t = ohStrings[o.lang];
  const host = makeHost(mount, o.lang, 'oh-root');
  let renderer: Renderer;
  try { renderer = new Renderer(host.canvas); } catch { noGlCard(host, t.title, t.noGl, t.back, o.onExit); return () => host.destroy(); }

  host.hud.innerHTML = `
    <div class="g3-row">
      <div class="g3-chip" data-k="time"><small>${esc(t.time)}</small><b data-testid="oh-time">${ROUND_SECONDS}</b></div>
      <div class="g3-chip"><small>${esc(t.score)}</small><b data-testid="oh-score">0</b></div>
      <div class="g3-chip"><small>${esc(t.buyers)}</small><b data-testid="oh-buyers">0</b></div>
      <button class="g3-pause" data-testid="oh-pause">${esc(t.pause)}</button>
    </div>
    <div class="g3-list" data-testid="oh-wish"><small>${esc(t.wants)} · <b data-k="name"></b></small><ul data-k="list"></ul></div>`;
  const cross = document.createElement('div'); cross.className = 'g3-cross'; cross.hidden = true;
  const hint = document.createElement('div'); hint.className = 'g3-hint'; hint.textContent = t.hint; hint.hidden = true;
  host.root.append(cross, hint);
  const $ = (s: string) => host.el(s);

  /* ---------- Build the unit ---------- */
  const scene = newScene();
  scene.clear = false;
  scene.sky = { top: hex('#141024'), mid: hex('#5a3820'), bottom: hex('#d18a46'), sunDir: [0, 0.05, -1] };
  scene.hemiSky = hex('#d8c8ae'); scene.hemiGround = hex('#3a2a1c'); scene.sunColor = hex('#4a3a28'); scene.sunDir = [0.3, 0.8, 0.5];
  scene.fog = { color: hex('#000000'), near: 500, far: 600 };
  scene.lamps = { pos: [[5, 2.7, 3.5], [13, 2.7, 3.5], [4, 2.7, 9.6], [12, 2.7, 9.6]], color: hex('#5e4628'), range: 8 };

  const solid: Box3[] = [], walls: Rect[] = [];
  const parts = new Map<Mat, Builder>();
  const B = boxGeo();
  const add = (m: Mat, g: Geo, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0) => {
    let b = parts.get(m); if (!b) { b = new Builder(); parts.set(m, b); }
    b.add(g, trs(x, y, z, ry, sx, sy, sz, rx));
  };
  /** A box by centre and size. walk = the walker cannot pass; block = it hides sparkles behind it. */
  const box = (m: Mat, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, walk = false, block = true) => {
    add(m, B, cx, cy, cz, sx, sy, sz);
    if (walk) walls.push([cx - sx / 2, cx + sx / 2, cz - sz / 2, cz + sz / 2]);
    if (block) solid.push([cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2]);
  };
  const tex = (c: HTMLCanvasElement, rep = false) => renderer.texture(c, rep);
  const plank = tex(paint(256, 256, (g, w) => {
    const r = rng(5);
    for (let y = 0; y < 8; y++) {
      const off = r() * w;
      for (let k = -1; k < 2; k++) { const tone = (110 + r() * 40) | 0; g.fillStyle = `rgb(${tone},${(tone * 0.72) | 0},${(tone * 0.48) | 0})`; g.fillRect(off + k * w, y * 32, w, 32); }
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y * 32, w, 2); g.fillRect(off, y * 32, 2, 32);
    }
  }), true);
  const ward = tex(paint(256, 256, (g, w, h) => {
    g.fillStyle = '#4a3524'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a1d12';
    for (let i = 1; i < 4; i++) g.fillRect(i * w / 4 - 2, 0, 4, h);
    g.fillStyle = '#d9a93f'; for (let i = 0; i < 4; i++) g.fillRect(i * w / 4 + (i % 2 ? 10 : w / 4 - 16), h * 0.45, 6, h * 0.12);
  }));
  const winTex = tex(paint(128, 256, (g, w, h) => {
    g.fillStyle = '#1b1612'; g.fillRect(0, 0, w, h); const r = rng(9);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 5; x++) if (r() < 0.55) { g.fillStyle = r() < 0.5 ? '#ffcf72' : '#e9b65a'; g.fillRect(x * 25 + 6, y * 16 + 5, 13, 8); }
  }));
  const M = {
    floor: { color: [1, 1, 1], map: plank } as Mat, wall: { color: hex('#e7ddcc') } as Mat, accent: { color: hex('#1d1813') } as Mat, ceil: { color: hex('#f2ebdf') } as Mat,
    glass: { color: hex('#9fbfd4'), opacity: 0.22 } as Mat, frame: { color: hex('#14110d') } as Mat, gold: { color: hex('#d9a93f') } as Mat,
    wood: { color: hex('#3a2a1d') } as Mat, sofa: { color: hex('#2e2a26') } as Mat, fabric: { color: hex('#cfc3ad') } as Mat, marble: { color: hex('#efeae1') } as Mat,
    white: { color: hex('#f4f0e8') } as Mat, lamp: { color: hex('#ffd98c'), unlit: true } as Mat, plant: { color: hex('#3f6b35') } as Mat,
    ward: { color: [1, 1, 1], map: ward } as Mat, rug: { color: hex('#5c4a36') } as Mat, bed: { color: hex('#2b241d') } as Mat, balc: { color: hex('#6f6253') } as Mat,
    city: { color: [1, 1, 1], map: winTex, unlit: true } as Mat, land: { color: hex('#1a130d'), unlit: true } as Mat, keypad: { color: hex('#d9a93f'), unlit: true } as Mat,
  };

  add(M.floor, planeGeo(16, 12, 4, 3), 8, 0, 6); solid.push([0, -0.1, 0, 16, 0, 12]);
  add(M.ceil, planeGeo(16, 12), 8, H, 6, 1, 1, 1, 0, Math.PI);
  const wallX = (z: number, x1: number, x2: number, m = M.wall) => box(m, (x1 + x2) / 2, H / 2, z, x2 - x1, H, TH, true);
  const wallZ = (x: number, z1: number, z2: number, m = M.wall) => box(m, x, H / 2, (z1 + z2) / 2, TH, H, z2 - z1, true);
  const glassX = (z: number, x1: number, x2: number) => {
    box(M.glass, (x1 + x2) / 2, H / 2, z, x2 - x1, H, 0.06, true, false);
    box(M.frame, (x1 + x2) / 2, 0.04, z, x2 - x1, 0.08, 0.14, false, false); box(M.frame, (x1 + x2) / 2, H - 0.05, z, x2 - x1, 0.1, 0.14, false, false);
    for (let x = x1; x <= x2 + 0.01; x += (x2 - x1) / 2) box(M.frame, x, H / 2, z, 0.07, H, 0.12, false, false);
  };
  wallX(0, 0, 3); glassX(0, 3, 7); wallX(0, 7, 16);
  wallX(12, 0, 10); glassX(12, 10, 15); wallX(12, 15, 16);
  wallZ(0, 0, 4, M.accent); wallZ(0, 5.5, 12); wallZ(16, 0, 12);
  // entrance door with the smart lock
  box(M.wood, 0.06, 1.1, 4.75, 0.1, 2.2, 1.5, true); box(M.wall, 0, 2.62, 4.75, TH, 0.76, 1.5);
  box(M.frame, 0.14, 1.15, 5.22, 0.05, 0.34, 0.16); box(M.keypad, 0.17, 1.2, 5.22, 0.02, 0.12, 0.1, false, false);
  // inner walls with doorways
  wallX(7, 0, 3.5); wallX(7, 4.7, 11.3); wallX(7, 12.5, 16);
  box(M.wall, 4.1, 2.6, 7, 1.2, 0.8, TH); box(M.wall, 11.9, 2.6, 7, 1.2, 0.8, TH);
  wallZ(8, 7, 12); wallZ(10, 0, 2, M.accent);
  // living room
  box(M.rug, 4.2, 0.005, 4.3, 4.6, 0.01, 3, false, false);
  box(M.sofa, 4, 0.22, 5.6, 3.8, 0.44, 0.95, true); box(M.sofa, 4, 0.6, 6.0, 3.8, 0.8, 0.25);
  box(M.gold, 2.6, 0.6, 5.75, 0.5, 0.36, 0.14, false, false); box(M.gold, 5.4, 0.6, 5.75, 0.5, 0.36, 0.14, false, false);
  box(M.wood, 4, 0.2, 4, 1.6, 0.4, 0.8, true);
  box(M.wood, 1.0, 0.18, 1.0, 0.5, 0.36, 0.5, true); add(M.plant, ballGeo(0), 1, 0.95, 1, 0.55, 0.55, 0.55);
  box(M.white, 6.8, 2.45, 6.77, 1.15, 0.33, 0.26); box(M.frame, 6.8, 2.33, 6.63, 1.0, 0.03, 0.02, false, false);
  // balcony outside the glass
  box(M.balc, 5, -0.05, -1.2, 4.2, 0.1, 2.4); box(M.frame, 5, 1.05, -2.35, 4.2, 0.06, 0.06, false, false);
  for (let x = 3; x <= 7.01; x += 0.5) box(M.frame, x, 0.52, -2.35, 0.04, 1.05, 0.04, false, false);
  box(M.wood, 6.4, 0.25, -0.8, 0.45, 0.5, 0.45, false, false); add(M.plant, ballGeo(0), 6.4, 0.75, -0.8, 0.5, 0.5, 0.5);
  // kitchen
  box(M.wood, 15.55, 0.45, 3.4, 0.7, 0.9, 6, true); box(M.marble, 15.5, 0.92, 3.4, 0.8, 0.05, 6.1);
  box(M.wood, 15.65, 2.05, 3.4, 0.5, 0.8, 6);
  box(M.wood, 12.4, 0.46, 3.8, 2.6, 0.92, 1.05, true); box(M.marble, 12.4, 0.95, 3.8, 2.85, 0.06, 1.3);
  for (let i = 0; i < 3; i++) {
    const x = 11.6 + i * 0.8;
    box(M.gold, x, 0.36, 4.75, 0.36, 0.04, 0.36, false, false); box(M.frame, x, 0.18, 4.75, 0.05, 0.36, 0.05, false, false);
    add(M.lamp, ballGeo(1), x, 2.25, 3.8, 0.13, 0.13, 0.13); box(M.frame, x, 2.62, 3.8, 0.015, 0.74, 0.015, false, false);
  }
  // bedroom 1: king bed and built-in wardrobe
  box(M.bed, 4.5, 0.25, 10.8, 2.3, 0.5, 2.2, true); box(M.fabric, 4.5, 0.56, 10.75, 2.2, 0.14, 2.05);
  box(M.gold, 4.5, 0.8, 11.85, 2.4, 1.1, 0.12);
  box(M.white, 3.9, 0.7, 11.45, 0.8, 0.14, 0.4, false, false); box(M.white, 5.1, 0.7, 11.45, 0.8, 0.14, 0.4, false, false);
  box(M.ward, 0.42, 1.25, 9.6, 0.65, 2.5, 3.8, true);
  box(M.wood, 7.4, 0.3, 8, 0.6, 0.6, 0.6, true); add(M.lamp, cylGeo(0.16, 0.22, 12), 7.4, 0.6, 8, 1, 0.3, 1);
  // bedroom 2: study nook and big windows
  box(M.wood, 15.25, 0.74, 8.4, 1.3, 0.05, 1.6, true); box(M.frame, 15.25, 0.37, 7.7, 1.2, 0.74, 0.05, false, false); box(M.frame, 15.25, 0.37, 9.1, 1.2, 0.74, 0.05, false, false);
  box(M.wood, 15.75, 1.7, 8.4, 0.4, 0.04, 1.6);
  box(M.sofa, 14.4, 0.25, 8.4, 0.5, 0.5, 0.5, true);
  add(M.gold, cylGeo(0.06, 0.18, 14, false), 15.5, 0.96, 7.9, 1, 0.25, 1); add(M.lamp, ballGeo(0), 15.5, 1, 7.9, 0.07, 0.07, 0.07);
  box(M.bed, 9.9, 0.22, 10.7, 1.3, 0.44, 2.1, true); box(M.fabric, 9.9, 0.5, 10.7, 1.2, 0.12, 2);
  // the city outside
  const rr = rng(77);
  for (let i = 0; i < 26; i++) { const a = rr() * Math.PI * 2, d = 35 + rr() * 50, h = 12 + rr() * 40, w = 6 + rr() * 8; add(M.city, B, 8 + Math.cos(a) * d, h / 2 - 6, 6 + Math.sin(a) * d, w, h, w); }
  add(M.land, planeGeo(400, 400), 8, -6, 6);
  for (const [m, b] of parts) scene.meshes.add(renderer.mesh(b.geo(), m));

  /* ---------- Sparkles ---------- */
  const sOn: Mat = { color: hex('#f3cf74'), unlit: true }, sDone: Mat = { color: hex('#7fd49b'), unlit: true }, sBad: Mat = { color: hex('#ec8a6f'), unlit: true };
  const halo: Mat = { color: hex('#f3cf74'), unlit: true, additive: true, opacity: 0.35 };
  const gem = gemGeo();
  const sparks = FEATURES.map(f => {
    const y = f.id === 'aircon' ? 2.05 : Math.min(f.p[1] + 0.55, 2.85);
    const s = renderer.mesh(gem, sOn), hl = renderer.mesh(gem, halo);
    scene.meshes.add(s); scene.meshes.add(hl);
    return { f, s, hl, y };
  });
  const resetSparks = () => { for (const k of sparks) { k.s.mat = sOn; k.hl.visible = true; } };

  /* ---------- Game ---------- */
  const ctl = new WalkControls(host);
  const P = { x: 1.4, z: 4.75, yaw: -Math.PI / 2, pitch: -0.05, vx: 0, vz: 0, bob: 0 };
  const G = { state: 'intro' as 'intro' | 'play' | 'paused' | 'done', time: ROUND_SECONDS, score: 0, buyers: 0, clock: 0 };
  let buyer: TourBuyer | null = null, clock = 0, vp: M4 = new Float32Array(16), eye: V3 = [P.x, 1.6, P.z];

  const renderWish = () => {
    if (!buyer) return;
    $('[data-k="name"]').textContent = buyer.name;
    $('[data-k="list"]').innerHTML = buyer.want.map(id => `<li class="${buyer!.found.has(id) ? 'g3-done' : ''}" data-f="${id}"><i></i>${esc(t.f[id])}</li>`).join('');
  };
  const nextBuyer = () => { buyer = newTourBuyer(Math.random, G.clock, buyer?.name); resetSparks(); renderWish(); };
  const hud = () => {
    $('[data-testid="oh-time"]').textContent = String(Math.max(0, Math.ceil(G.time)));
    $('[data-k="time"]').classList.toggle('g3-low', G.time < 15);
    $('[data-testid="oh-score"]').textContent = String(G.score);
    $('[data-testid="oh-buyers"]').textContent = String(G.buyers);
  };
  const finish = () => {
    if (G.state === 'done') return;
    G.state = 'done'; loop.stop(); ctl.enabled = false;
    o.onFinish({ score: Math.min(MAX_SCORE, G.score), maxScore: MAX_SCORE });
  };
  const show = (id: FeatureId) => {
    if (!buyer || G.state !== 'play') return;
    const k = sparks.find(x => x.f.id === id)!;
    const out = showFeature(buyer, id, G.clock);
    if (out.k === 'already') { host.toast(t.already, t.f[id]); return; }
    if (out.k === 'wrong') { G.time -= out.seconds; k.s.mat = sBad; k.hl.visible = false; host.toast(`−${out.seconds}s`, `${t.notList}: ${t.f[id]}`, true); }
    else {
      k.s.mat = sDone; k.hl.visible = false; G.score += out.points;
      if (out.k === 'happy') {
        G.score += out.bonus; G.buyers++; G.time += out.seconds;
        host.toast(t.happy, `+${out.points + out.bonus} · ${t.next}`);
        window.setTimeout(() => { if (G.state === 'play' || G.state === 'paused') nextBuyer(); }, 900);
      } else host.toast(`+${out.points}`, t.f[id]);
    }
    renderWish(); hud();
  };
  /** Which sparkle (if any) is under the screen point (sx, sy), not hidden behind a wall and within 9 m. */
  const tapAt = (sx: number, sy: number) => {
    const inv = invert(vp); if (!inv) return;
    const rect = host.canvas.getBoundingClientRect();
    const nx = ((sx - rect.left) / rect.width) * 2 - 1, ny = -(((sy - rect.top) / rect.height) * 2 - 1);
    const un = (z: number): V3 => { const x = inv[0] * nx + inv[4] * ny + inv[8] * z + inv[12], y = inv[1] * nx + inv[5] * ny + inv[9] * z + inv[13], zz = inv[2] * nx + inv[6] * ny + inv[10] * z + inv[14], w = inv[3] * nx + inv[7] * ny + inv[11] * z + inv[15]; return [x / w, y / w, zz / w]; };
    const a = un(-1), b = un(1), d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d);
    const dir: V3 = [d[0] / l, d[1] / l, d[2] / l];
    let best: FeatureId | null = null, bt = 9;
    for (const f of FEATURES) { const tt = raySphere(eye, dir, f.p, f.r); if (tt >= 0 && tt < bt) { bt = tt; best = f.id; } }
    if (!best) return;
    for (const bx of solid) { const tt = rayBox(eye, dir, bx); if (tt >= 0 && tt < bt - 0.01) return; }
    show(best);
  };
  ctl.onTap = tapAt;
  const keyTap = (e: KeyboardEvent) => { if ((e.key === 'e' || e.key === ' ') && G.state === 'play') { e.preventDefault(); const r = host.canvas.getBoundingClientRect(); tapAt(r.left + r.width / 2, r.top + r.height / 2); } };
  window.addEventListener('keydown', keyTap);

  const pause = async () => {
    if (G.state !== 'play') return;
    G.state = 'paused'; ctl.release(); ctl.enabled = false; loop.stop(); loop.once();
    const c = await pauseCard(host, t, `${t.score}: ${G.score} · ${t.buyers}: ${G.buyers}`);
    host.hideCover();
    if (c === 'resume') { G.state = 'play'; ctl.enabled = true; loop.run(); }
    else if (c === 'finish') finish();
    else { G.state = 'done'; o.onExit(); }
  };
  $('[data-testid="oh-pause"]').addEventListener('click', () => { void pause(); });

  const persp = (a: number) => perspective((72 * Math.PI) / 180, a, 0.05, 300);
  const frame = (dt: number) => {
    clock += dt;
    let mx = 0, mz = 0;
    if (G.state === 'play') {
      G.clock += dt; G.time -= dt;
      if (G.time <= 0) { G.time = 0; hud(); finish(); return; }
      const [ly, lp] = ctl.takeLook();
      P.yaw += ly; P.pitch = Math.max(-1.2, Math.min(1.2, P.pitch + lp));
      if (ctl.key('arrowleft')) P.yaw += dt * 2;
      if (ctl.key('arrowright')) P.yaw -= dt * 2;
      const [ix, iy] = ctl.move(), s = Math.sin(P.yaw), c = Math.cos(P.yaw), SPEED = 3.2;
      mx = (-s * iy + c * ix) * SPEED; mz = (-c * iy - s * ix) * SPEED;
      hud();
    } else if (G.state === 'intro') P.yaw += dt * 0.12;
    const a = 1 - Math.exp(-dt * 10);
    P.vx += (mx - P.vx) * a; P.vz += (mz - P.vz) * a; P.x += P.vx * dt; P.z += P.vz * dt;
    pushOut(P, 0.3, walls);
    P.x = Math.max(0.3, Math.min(15.7, P.x)); P.z = Math.max(0.3, Math.min(11.7, P.z));
    const sp = Math.hypot(P.vx, P.vz); P.bob += sp * dt * 2.6;
    eye = [P.x, 1.6 + (host.reduceMotion ? 0 : Math.sin(P.bob) * 0.03 * Math.min(1, sp / 3.2)), P.z];
    const f = forward(P.yaw, P.pitch), target: V3 = [eye[0] + f[0], eye[1] + f[1], eye[2] + f[2]];
    sparks.forEach((k, i) => {
      const sc = host.reduceMotion ? 1 : 1 + Math.sin(clock * 4 + i) * 0.18, rot = host.reduceMotion ? 0 : clock * 2 + i;
      k.s.model = trs(k.f.p[0], k.y, k.f.p[2], rot, 0.13 * sc, 0.13 * sc, 0.13 * sc);
      k.hl.model = trs(k.f.p[0], k.y, k.f.p[2], -rot, 0.24 * sc, 0.24 * sc, 0.24 * sc);
    });
    renderer.resize();
    const view = lookAt(eye, target);
    vp = mul(persp(renderer.width / renderer.height), view);
    renderer.render(scene, { eye, target, fov: 72, near: 0.05, far: 300 }, persp, view);
  };
  const loop = new Loop(frame, () => { void pause(); });
  loop.run();

  void host.cover(introHtml(t.title, t.intro, [t.how1, t.how2, t.how3], t.sample), [{ id: 'start', label: t.start, primary: true }, { id: 'back', label: t.back }])
    .then(c => {
      host.hideCover();
      if (c === 'back') { G.state = 'done'; o.onExit(); return; }
      P.yaw = -Math.PI / 2; G.state = 'play'; ctl.enabled = true; cross.hidden = false; hint.hidden = false;
      window.setTimeout(() => { hint.style.opacity = '0'; }, 5000);
      nextBuyer(); hud();
    });

  return () => {
    loop.dispose(); ctl.dispose(); window.removeEventListener('keydown', keyTap);
    for (const m of scene.meshes as Set<Mesh>) renderer.free(m);
    renderer.dispose(); host.destroy();
  };
};
