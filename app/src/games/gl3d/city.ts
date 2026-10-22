// v1buddychange015 (Batch I): the endless golden-hour neighbourhood used by Buddy Walk: Streets and Viewing Rush.
// The ground is split into square blocks; each block has a road along two sides and four lots (houses, a tower or trees).
// A block's look comes from its grid position, so walking away and back shows the same street.
// Only the blocks around the player exist at any time (5 x 5), which keeps memory and drawing small.
import { Builder, boxGeo, planeGeo, roofGeo, cylGeo, ballGeo, cardGeo, gemGeo, paint, hex, type Mat, type Mesh, type Renderer, type Scene, type Geo } from './gl';
import { trs, rng, hash2, type Rect } from './math';

export interface Sign { id: string; x: number; z: number; board: Mesh; marker: Mesh; markerY: number }
export interface Block { meshes: Mesh[]; boxes: Rect[]; sign: Sign | null }

export interface CityOpts {
  block: number; road: number; view: number;
  /** Street lamp posts and building walls the walker or car cannot pass. */
  lampBoxes: boolean;
  /** Chance a block has a For Sale sign (0 = none). */
  signChance: number;
  seed: number;
}

function windowPair(r: Renderer, w: number, h: number, cols: number, rows: number, wall: string, seed: number): [WebGLTexture, WebGLTexture] {
  const rr = rng(seed), lit: boolean[] = [];
  for (let i = 0; i < cols * rows; i++) lit.push(rr() < 0.55);
  const draw = (em: boolean) => paint(w, h, (g) => {
    g.fillStyle = em ? '#000' : wall; g.fillRect(0, 0, w, h);
    const cw = w / cols, ch = h / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const on = lit[y * cols + x], px = x * cw + cw * 0.22, py = y * ch + ch * 0.25, pw = cw * 0.56, ph = ch * 0.5;
      if (em) { if (on) { g.fillStyle = '#ffc861'; g.fillRect(px, py, pw, ph); } }
      else { g.fillStyle = on ? '#ffd27a' : '#15130f'; g.fillRect(px, py, pw, ph); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(px + pw / 2 - 1, py, 2, ph); }
    }
  });
  return [r.texture(draw(false), false), r.texture(draw(true), false)];
}

function boardCanvas(sold: boolean) {
  return paint(512, 256, (g, w, h) => {
    g.fillStyle = '#0d0b08'; g.fillRect(0, 0, w, h);
    g.strokeStyle = sold ? '#7a6a48' : '#d9a93f'; g.lineWidth = 14; g.strokeRect(14, 14, w - 28, h - 28);
    g.fillStyle = sold ? '#8f7f5c' : '#f3cf74'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '800 96px Impact, "Arial Narrow", sans-serif'; g.fillText(sold ? 'PRICED' : 'FOR SALE', w / 2, h * 0.42);
    g.font = '700 38px sans-serif'; g.fillText(sold ? 'DITAKSIR · 已估价' : 'DIJUAL · 出售', w / 2, h * 0.75);
  });
}

export class City {
  blocks = new Map<string, Block>();
  private cur = '';
  private M: Record<string, Mat>;
  private walls: Mat[]; private towers: Mat[]; private roofs: Mat[]; private leaves: Mat[];
  readonly geo = { box: boxGeo(), roof: roofGeo(), trunk: cylGeo(0.16, 0.24, 6), crown: ballGeo(0), pole: cylGeo(0.07, 0.1, 6), bulb: ballGeo(0), post: cylGeo(0.06, 0.06, 6), gem: gemGeo() };
  boardMat: Mat; boardSoldMat: Mat; markerMat: Mat;
  private ground: Geo; private roadZ: Geo; private roadX: Geo; private board: Geo;

  constructor(private r: Renderer, private scene: Scene, readonly o: CityOpts, private isSolved: (id: string) => boolean) {
    const S = o.block, R = o.road;
    const wall = (c: string, seed: number, cols: number, rows: number, h = 128): Mat => { const [m, e] = windowPair(r, 128, h, cols, rows, c, seed); return { color: [1, 1, 1], map: m, emissiveMap: e, emissive: 0.85 }; };
    this.walls = [wall('#3a332b', 11, 2, 2), wall('#2b2723', 23, 3, 2), wall('#4a4036', 37, 2, 2), wall('#24211e', 41, 3, 2)];
    this.towers = [wall('#26231f', 53, 4, 10, 256), wall('#332d27', 67, 5, 12, 256)];
    this.roofs = [{ color: hex('#5a2f20') }, { color: hex('#2f2a26') }, { color: hex('#6b4a2c') }];
    this.leaves = [{ color: hex('#34502a') }, { color: hex('#41592b') }, { color: hex('#2a4426') }];
    const roadTex = r.texture(paint(64, 256, (g, w, h) => {
      g.fillStyle = '#1b1916'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a2722'; g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h);
      g.fillStyle = '#d9a93f'; for (let y = 0; y < h; y += 64) g.fillRect(w / 2 - 2, y + 8, 4, 34);
    }), true);
    this.M = {
      cap: { color: hex('#1a1714') }, ground: { color: hex('#2d2b1c') },
      roadA: { color: [1, 1, 1], map: roadTex, offset: 1 }, roadB: { color: [1, 1, 1], map: roadTex, offset: 2 },
      trunk: { color: hex('#3b2a1a') }, pole: { color: hex('#1c1a17') }, bulb: { color: hex('#ffd27a'), unlit: true },
      back: { color: hex('#0d0b08') },
    };
    this.boardMat = { color: [1, 1, 1], map: r.texture(boardCanvas(false), false), unlit: true };
    this.boardSoldMat = { color: [1, 1, 1], map: r.texture(boardCanvas(true), false), unlit: true };
    this.markerMat = { color: hex('#f3cf74'), unlit: true };
    this.ground = planeGeo(S, S);
    this.roadZ = planeGeo(R, S, 1, 3 * S / 36);
    this.roadX = planeGeo(R, S - R, 1, 3 * (S - R) / 36);
    this.board = cardGeo(2.4, 1.4);
  }

  /** Builds or drops blocks so the ones around (x, z) exist. Cheap when the player stays in the same block. */
  update(x: number, z: number, force = false): void {
    const S = this.o.block, V = this.o.view;
    const pcx = Math.floor(x / S), pcz = Math.floor(z / S), key = `${pcx},${pcz}`;
    if (!force && key === this.cur) return;
    this.cur = key;
    const need = new Set<string>();
    for (let dx = -V; dx <= V; dx++) for (let dz = -V; dz <= V; dz++) {
      const k = `${pcx + dx},${pcz + dz}`; need.add(k);
      if (!this.blocks.has(k)) this.blocks.set(k, this.build(pcx + dx, pcz + dz));
    }
    for (const [k, b] of this.blocks) if (!need.has(k)) { for (const m of b.meshes) { this.scene.meshes.delete(m); this.r.free(m); } this.blocks.delete(k); }
  }

  /** Building walls near (x, z), for collisions. */
  *nearBoxes(x: number, z: number): Generator<Rect> {
    const S = this.o.block, pcx = Math.floor(x / S), pcz = Math.floor(z / S);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const b = this.blocks.get(`${pcx + dx},${pcz + dz}`); if (b) yield* b.boxes; }
  }

  onRoad(x: number, z: number): boolean {
    const S = this.o.block, lx = ((x % S) + S) % S, lz = ((z % S) + S) % S;
    return lx < this.o.road || lz < this.o.road;
  }

  private build(cx: number, cz: number): Block {
    const S = this.o.block, R = this.o.road, ox = cx * S, oz = cz * S;
    const r = rng(hash2(cx * 7 + this.o.seed, cz * 13 + 1)), boxes: Rect[] = [];
    const spawn = cx === 0 && cz === 0;
    const parts = new Map<Mat, Builder>();
    const put = (m: Mat, g: Parameters<Builder['add']>[0], x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0) => {
      let b = parts.get(m); if (!b) { b = new Builder(); parts.set(m, b); }
      b.add(g, trs(ox + x, y, oz + z, ry, sx, sy, sz));
    };
    const G = this.geo, M = this.M;
    put(M.ground, this.ground, S / 2, 0, S / 2);
    put(M.roadA, this.roadZ, R / 2, 0, S / 2);
    put(M.roadB, this.roadX, (R + S) / 2, 0, R / 2, 1, 1, 1, Math.PI / 2);
    for (const [x, z] of [[R + 0.6, R + 0.6], [(R + S) / 2, R + 0.6]]) {
      put(M.pole, G.pole, x, 0, z, 1, 5, 1); put(M.bulb, G.bulb, x, 5.05, z, 0.3, 0.3, 0.3);
      if (this.o.lampBoxes) boxes.push([ox + x - 0.2, ox + x + 0.2, oz + z - 0.2, oz + z + 0.2]);
    }
    const tree = (x: number, z: number) => { const s = 1.3 + r() * 0.8; put(M.trunk, G.trunk, x, 0, z, 1, 1.8, 1); put(this.leaves[Math.floor(r() * 3) % 3], G.crown, x, 1.9 + s * 0.7, z, s, s * 1.15, s); };
    const lot = (S - R) / 2;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const lx = R + lot / 2 + i * lot, lz = R + lot / 2 + j * lot, k = r();
      if (k < 0.16) { for (let n = 0; n < 4; n++) tree(lx + (r() - 0.5) * lot * 0.6, lz + (r() - 0.5) * lot * 0.6); continue; }
      if (k < 0.33 && !spawn) {
        const w = lot * 0.66 + r() * 2.5, d = lot * 0.66 + r() * 2.5, h = 14 + r() * 14;
        put(this.towers[Math.floor(r() * 2) % 2], G.box, lx, h / 2, lz, w, h, d);
        put(M.cap, G.box, lx, h + 0.25, lz, w * 1.04, 0.5, d * 1.04);
        boxes.push([ox + lx - w / 2, ox + lx + w / 2, oz + lz - d / 2, oz + lz + d / 2]); continue;
      }
      const w = lot * 0.43 + r() * 3, d = lot * 0.43 + r() * 3, h = r() < 0.5 ? 3.4 : 6.2;
      put(this.walls[Math.floor(r() * 4) % 4], G.box, lx, h / 2, lz, w, h, d);
      put(this.roofs[Math.floor(r() * 3) % 3], G.roof, lx, h, lz, w * 1.08, 1.5 + r() * 1.3, d * 1.08);
      boxes.push([ox + lx - w / 2, ox + lx + w / 2, oz + lz - d / 2, oz + lz + d / 2]);
      if (r() < 0.6) tree(lx + lot * 0.41, lz + lot * 0.41);
    }
    const meshes: Mesh[] = [];
    let sign: Sign | null = null;
    if (this.o.signChance > 0 && (spawn || r() < this.o.signChance)) {
      const id = `${cx}_${cz}`, lz = spawn ? S / 2 - 7 : R + 5 + r() * (S - R - 10);
      const sx = R + 1.5, ry = -Math.PI / 2 + 0.35;
      const local = (dx: number, dz: number): [number, number] => [sx + dx * Math.cos(ry) + dz * Math.sin(ry), lz - dx * Math.sin(ry) + dz * Math.cos(ry)];
      for (const d of [-1.05, 1.05]) { const [px, pz] = local(d, 0); put(M.pole, G.post, px, 0, pz, 1, 2.9, 1); }
      const [bx, bz] = local(0, -0.06);
      put(M.back, G.box, bx, 2.25, bz, 2.56, 1.56, 0.08, ry);
      const solved = this.isSolved(id);
      const board = this.r.mesh(this.board, solved ? this.boardSoldMat : this.boardMat, trs(ox + sx, 2.25, oz + lz, ry));
      const marker = this.r.mesh(G.gem, this.markerMat, trs(ox + sx, 4.1, oz + lz, 0, 0.42, 0.42, 0.42));
      marker.visible = !solved;
      meshes.push(board, marker);
      sign = { id, x: ox + sx, z: oz + lz, board, marker, markerY: 4.1 };
    }
    for (const [m, b] of parts) if (!b.empty) meshes.push(this.r.mesh(b.geo(), m));
    for (const m of meshes) this.scene.meshes.add(m);
    return { meshes, boxes, sign };
  }

  dispose(): void { for (const b of this.blocks.values()) for (const m of b.meshes) { this.scene.meshes.delete(m); this.r.free(m); } this.blocks.clear(); }
}
