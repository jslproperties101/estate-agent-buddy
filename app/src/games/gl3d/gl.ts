// v1buddychange015 (Batch I): a very small WebGL drawer for the 3D games (streets, a car, a show unit).
// Shapes are simple boxes, roofs, cylinders and balls; everything that never moves is merged into one buffer per
// material, so a whole street block is drawn in a handful of calls. Light = sky/ground fill + one sun + up to 4 lamps,
// with distance fog. No library is downloaded, so the games work offline in the APK.
import { mul, normalMat, invert, ident, type M4, type V3 } from './math';

/* ---------- Geometry ---------- */
export interface Geo { p: number[]; n: number[]; uv: number[]; i: number[] }

function quad(g: Geo, a: V3, b: V3, c: V3, d: V3, n: V3, uw = 1, vh = 1) {
  const o = g.p.length / 3;
  for (const v of [a, b, c, d]) g.p.push(v[0], v[1], v[2]);
  for (let k = 0; k < 4; k++) g.n.push(n[0], n[1], n[2]);
  g.uv.push(0, 0, uw, 0, uw, vh, 0, vh);
  g.i.push(o, o + 1, o + 2, o, o + 2, o + 3);
}

/** A 1 x 1 x 1 box centred on the origin. Side faces map the whole texture once (windows on house walls). */
export function boxGeo(): Geo {
  const g: Geo = { p: [], n: [], uv: [], i: [] }, h = 0.5;
  quad(g, [-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h], [0, 0, 1]);
  quad(g, [h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h], [0, 0, -1]);
  quad(g, [h, -h, h], [h, -h, -h], [h, h, -h], [h, h, h], [1, 0, 0]);
  quad(g, [-h, -h, -h], [-h, -h, h], [-h, h, h], [-h, h, -h], [-1, 0, 0]);
  quad(g, [-h, h, h], [h, h, h], [h, h, -h], [-h, h, -h], [0, 1, 0]);
  quad(g, [-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h], [0, -1, 0]);
  return g;
}

/** A flat rectangle on the ground (y = 0), w along x, d along z. repeatU/V tile its texture. */
export function planeGeo(w: number, d: number, repeatU = 1, repeatV = 1): Geo {
  const g: Geo = { p: [], n: [], uv: [], i: [] };
  quad(g, [-w / 2, 0, d / 2], [w / 2, 0, d / 2], [w / 2, 0, -d / 2], [-w / 2, 0, -d / 2], [0, 1, 0], repeatU, repeatV);
  return g;
}

/** An upright rectangle facing +z (signs, glass, pictures), centred on the origin. */
export function cardGeo(w: number, h: number): Geo {
  const g: Geo = { p: [], n: [], uv: [], i: [] };
  quad(g, [-w / 2, -h / 2, 0], [w / 2, -h / 2, 0], [w / 2, h / 2, 0], [-w / 2, h / 2, 0], [0, 0, 1]);
  // texture right way up
  const n = g.uv.length; g.uv.splice(n - 8, 8, 0, 1, 1, 1, 1, 0, 0, 0);
  return g;
}

/** A four-sided roof from y = 0 to y = 1 over a 1 x 1 base. */
export function roofGeo(): Geo {
  const g: Geo = { p: [], n: [], uv: [], i: [] }, h = 0.5;
  const top: V3 = [0, 1, 0];
  const corners: V3[] = [[-h, 0, h], [h, 0, h], [h, 0, -h], [-h, 0, -h]];
  for (let k = 0; k < 4; k++) {
    const a = corners[k], b = corners[(k + 1) % 4];
    const mx = (a[0] + b[0]) / 2, mz = (a[2] + b[2]) / 2;
    const len = Math.hypot(mx, 1 * 0.5, mz) || 1;
    const n: V3 = [mx / len, 0.5 / len, mz / len];
    const o = g.p.length / 3;
    g.p.push(...a, ...b, ...top); g.n.push(...n, ...n, ...n); g.uv.push(0, 0, 1, 0, 0.5, 1); g.i.push(o, o + 1, o + 2);
  }
  return g;
}

/** Cylinder (or cone when rTop = 0) standing on y = 0, height 1. */
export function cylGeo(rTop: number, rBot: number, seg = 10, capped = true): Geo {
  const g: Geo = { p: [], n: [], uv: [], i: [] };
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const slope = (rBot - rTop);
    const n0: V3 = [c0, slope, s0], n1: V3 = [c1, slope, s1];
    const o = g.p.length / 3;
    g.p.push(rBot * c0, 0, rBot * s0, rBot * c1, 0, rBot * s1, rTop * c1, 1, rTop * s1, rTop * c0, 1, rTop * s0);
    g.n.push(...n0, ...n1, ...n1, ...n0); g.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    g.i.push(o, o + 1, o + 2, o, o + 2, o + 3);
    if (capped && rTop > 0) { const t = g.p.length / 3; g.p.push(0, 1, 0, rTop * c1, 1, rTop * s1, rTop * c0, 1, rTop * s0); g.n.push(0, 1, 0, 0, 1, 0, 0, 1, 0); g.uv.push(0, 0, 0, 0, 0, 0); g.i.push(t, t + 1, t + 2); }
  }
  return g;
}

/** A low-poly ball (tree tops, lamp bulbs) of radius 1 centred on the origin. */
export function ballGeo(detail: 0 | 1 = 1): Geo {
  const t = (1 + Math.sqrt(5)) / 2;
  let v: V3[] = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const norm = (p: V3): V3 => { const l = Math.hypot(...p); return [p[0] / l, p[1] / l, p[2] / l]; };
  v = v.map(norm);
  for (let d = 0; d < detail; d++) {
    const nf: number[][] = [];
    for (const [a, b, c] of f) {
      const m = (x: number, y: number) => { v.push(norm([(v[x][0] + v[y][0]) / 2, (v[x][1] + v[y][1]) / 2, (v[x][2] + v[y][2]) / 2])); return v.length - 1; };
      const ab = m(a, b), bc = m(b, c), ca = m(c, a);
      nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    f = nf;
  }
  // flat shading: each face its own corners and normal
  const g: Geo = { p: [], n: [], uv: [], i: [] };
  for (const [a, b, c] of f) {
    const o = g.p.length / 3, A = v[a], B = v[b], C = v[c];
    const n = norm([(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3]);
    g.p.push(...A, ...B, ...C); g.n.push(...n, ...n, ...n); g.uv.push(0, 0, 1, 0, 0.5, 1); g.i.push(o, o + 1, o + 2);
  }
  return g;
}

/** Diamond marker (octahedron) of radius 1. */
export function gemGeo(): Geo {
  const g: Geo = { p: [], n: [], uv: [], i: [] };
  const pts: V3[] = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]];
  for (const y of [1, -1]) for (let k = 0; k < 4; k++) {
    const a = pts[k], b = pts[(k + 1) % 4], tip: V3 = [0, y, 0];
    const n: V3 = [(a[0] + b[0]) / Math.sqrt(3), y / Math.sqrt(3), (a[2] + b[2]) / Math.sqrt(3)];
    const o = g.p.length / 3;
    g.p.push(...a, ...b, ...tip); g.n.push(...n, ...n, ...n); g.uv.push(0, 0, 1, 0, 0.5, 1); g.i.push(o, o + 1, o + 2);
  }
  return g;
}

/** Flat ring lying on the ground (the arrival circle). */
export function ringGeo(r0: number, r1: number, seg = 40): Geo {
  const g: Geo = { p: [], n: [], uv: [], i: [] };
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
    quad(g, [r1 * Math.cos(a0), 0, r1 * Math.sin(a0)], [r1 * Math.cos(a1), 0, r1 * Math.sin(a1)], [r0 * Math.cos(a1), 0, r0 * Math.sin(a1)], [r0 * Math.cos(a0), 0, r0 * Math.sin(a0)], [0, 1, 0]);
  }
  return g;
}

/** Merges many placed shapes into one shape (used for everything that never moves). */
export class Builder {
  p: number[] = []; n: number[] = []; uv: number[] = []; i: number[] = [];
  add(g: Geo, m: M4): this {
    const o = this.p.length / 3, nm = normalMat(m);
    for (let k = 0; k < g.p.length; k += 3) {
      const x = g.p[k], y = g.p[k + 1], z = g.p[k + 2];
      this.p.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
      const a = g.n[k], b = g.n[k + 1], c = g.n[k + 2];
      // normalMat is column-major 3x3 of the inverse transpose
      const nx = nm[0] * a + nm[3] * b + nm[6] * c, ny = nm[1] * a + nm[4] * b + nm[7] * c, nz = nm[2] * a + nm[5] * b + nm[8] * c;
      const l = Math.hypot(nx, ny, nz) || 1;
      this.n.push(nx / l, ny / l, nz / l);
    }
    this.uv.push(...g.uv);
    for (const ix of g.i) this.i.push(ix + o);
    return this;
  }
  get empty(): boolean { return this.i.length === 0; }
  geo(): Geo { return { p: this.p, n: this.n, uv: this.uv, i: this.i }; }
}

/* ---------- Materials, meshes, scene ---------- */
export type Rgb = [number, number, number];
export function hex(h: string): Rgb {
  const v = parseInt(h.replace('#', ''), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export interface Mat {
  color: Rgb;
  map?: WebGLTexture | null;
  emissiveMap?: WebGLTexture | null;
  emissive?: number;
  /** Ignores light (lamps, glowing signs). */
  unlit?: boolean;
  opacity?: number;
  additive?: boolean;
  fog?: boolean;
  /** Pull this surface towards the camera a little, so roads never flicker on the ground. */
  offset?: number;
}

export interface Mesh {
  vb: WebGLBuffer; nb: WebGLBuffer; ub: WebGLBuffer; ib: WebGLBuffer; count: number; wide: boolean;
  mat: Mat; model: M4; visible: boolean;
}

export interface Scene {
  meshes: Set<Mesh>;
  sky: { top: Rgb; mid: Rgb; bottom: Rgb; sunDir: V3 };
  hemiSky: Rgb; hemiGround: Rgb; sunColor: Rgb; sunDir: V3;
  fog: { color: Rgb; near: number; far: number };
  lamps: { pos: V3[]; color: Rgb; range: number };
  /** false = draw the sky gradient as the background; a colour = plain background. */
  clear: Rgb | false;
}

export function newScene(): Scene {
  return {
    meshes: new Set(),
    sky: { top: hex('#0c0b14'), mid: hex('#4a3020'), bottom: hex('#d4954f'), sunDir: norm3([-40, 6, -60]) },
    hemiSky: hex('#bfa070'), hemiGround: hex('#1a140c'), sunColor: hex('#d9a066'), sunDir: norm3([-40, 30, -60]),
    fog: { color: hex('#b98146'), near: 22, far: 86 },
    lamps: { pos: [], color: [0, 0, 0], range: 10 },
    clear: false,
  };
}
export function norm3(v: V3): V3 { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

const VS = `
attribute vec3 aP; attribute vec3 aN; attribute vec2 aUV;
uniform mat4 uVP; uniform mat4 uM; uniform mat3 uNM;
varying vec3 vN; varying vec2 vUV; varying vec3 vW;
void main(){ vec4 w = uM * vec4(aP, 1.0); vW = w.xyz; vN = uNM * aN; vUV = aUV; gl_Position = uVP * w; }`;
const FS = `
precision mediump float;
varying vec3 vN; varying vec2 vUV; varying vec3 vW;
uniform vec3 uColor; uniform float uOpacity; uniform float uUseMap; uniform float uUseEm; uniform float uEm; uniform float uUnlit; uniform float uFogOn;
uniform sampler2D uMap; uniform sampler2D uEmMap;
uniform vec3 uHS; uniform vec3 uHG; uniform vec3 uSunC; uniform vec3 uSunD;
uniform vec3 uFogC; uniform vec2 uFogR; uniform vec3 uEye;
uniform vec3 uLamp[4]; uniform vec3 uLampC; uniform float uLampR; uniform float uLampN;
void main(){
  vec3 base = uColor;
  if (uUseMap > 0.5) base *= texture2D(uMap, vUV).rgb;
  vec3 c = base;
  if (uUnlit < 0.5) {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    vec3 lit = mix(uHG, uHS, n.y * 0.5 + 0.5) + uSunC * max(dot(n, uSunD), 0.0);
    for (int i = 0; i < 4; i++) {
      if (float(i) < uLampN) {
        vec3 d = uLamp[i] - vW; float l = length(d);
        lit += uLampC * max(dot(n, d / l), 0.0) * max(0.0, 1.0 - l / uLampR);
      }
    }
    c = base * lit;
  }
  if (uUseEm > 0.5) c += texture2D(uEmMap, vUV).rgb * uEm;
  float f = uFogOn > 0.5 ? clamp((distance(vW, uEye) - uFogR.x) / (uFogR.y - uFogR.x), 0.0, 1.0) : 0.0;
  gl_FragColor = vec4(mix(c, uFogC, f), uOpacity);
}`;
const SKY_VS = `attribute vec2 aP; varying vec2 vC; void main(){ vC = aP; gl_Position = vec4(aP, 0.9999, 1.0); }`;
const SKY_FS = `
precision mediump float; varying vec2 vC;
uniform mat4 uInv; uniform vec3 uEye; uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot; uniform vec3 uSunD;
void main(){
  vec4 w = uInv * vec4(vC, 1.0, 1.0); vec3 d = normalize(w.xyz / w.w - uEye);
  float h = d.y;
  vec3 c = mix(mix(uBot, uMid, smoothstep(0.0, 0.16, h)), uTop, smoothstep(0.16, 0.62, h));
  if (h < 0.0) c = uBot * 0.85;
  float s = max(dot(d, uSunD), 0.0);
  c += vec3(1.0, 0.78, 0.42) * (pow(s, 600.0) * 1.6 + pow(s, 12.0) * 0.25);
  gl_FragColor = vec4(c, 1.0);
}`;

function compile(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error('3D shader: ' + gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('3D program: ' + gl.getProgramInfoLog(p));
  return p;
}

export interface Camera { eye: V3; target: V3; fov: number; near: number; far: number }

export class Renderer {
  gl: WebGLRenderingContext;
  private prog: WebGLProgram; private sky: WebGLProgram; private skyBuf: WebGLBuffer;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private su: Record<string, WebGLUniformLocation | null> = {};
  private loc: { p: number; n: number; uv: number };
  private uintOk: boolean;
  private white: WebGLTexture;
  width = 1; height = 1;

  constructor(public canvas: HTMLCanvasElement) {
    const gl = (canvas.getContext('webgl', { antialias: true, powerPreference: 'default' }) ?? canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) throw new Error('no-webgl');
    this.gl = gl;
    this.uintOk = !!gl.getExtension('OES_element_index_uint');
    this.prog = compile(gl, VS, FS);
    this.sky = compile(gl, SKY_VS, SKY_FS);
    for (const n of ['uVP', 'uM', 'uNM', 'uColor', 'uOpacity', 'uUseMap', 'uUseEm', 'uEm', 'uUnlit', 'uFogOn', 'uMap', 'uEmMap', 'uHS', 'uHG', 'uSunC', 'uSunD', 'uFogC', 'uFogR', 'uEye', 'uLamp', 'uLampC', 'uLampR', 'uLampN'])
      this.u[n] = gl.getUniformLocation(this.prog, n);
    for (const n of ['uInv', 'uEye', 'uTop', 'uMid', 'uBot', 'uSunD']) this.su[n] = gl.getUniformLocation(this.sky, n);
    this.loc = { p: gl.getAttribLocation(this.prog, 'aP'), n: gl.getAttribLocation(this.prog, 'aN'), uv: gl.getAttribLocation(this.prog, 'aUV') };
    this.skyBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const c = document.createElement('canvas'); c.width = c.height = 1;
    const g = c.getContext('2d'); if (g) { g.fillStyle = '#fff'; g.fillRect(0, 0, 1, 1); }
    this.white = this.texture(c, false);
  }

  /** Matches the drawing size to the element's size. Pixel density is capped to save battery. */
  resize(maxDpr = 1.5): void {
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr)), h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (w !== this.canvas.width || h !== this.canvas.height) { this.canvas.width = w; this.canvas.height = h; }
    this.width = w; this.height = h;
  }

  texture(src: HTMLCanvasElement, repeat: boolean): WebGLTexture {
    const gl = this.gl, t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    const pot = (n: number) => (n & (n - 1)) === 0;
    if (pot(src.width) && pot(src.height)) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

  /** Uploads a shape. Large merged shapes need 32-bit indices; phones without them get the shape split by the caller. */
  mesh(g: Geo, mat: Mat, model: M4 = ident()): Mesh {
    const gl = this.gl;
    const mk = (data: ArrayBufferView, target: number) => { const b = gl.createBuffer()!; gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b; };
    const wide = g.p.length / 3 > 65535;
    if (wide && !this.uintOk) throw new Error('3D shape too large for this phone');
    return {
      vb: mk(new Float32Array(g.p), gl.ARRAY_BUFFER), nb: mk(new Float32Array(g.n), gl.ARRAY_BUFFER), ub: mk(new Float32Array(g.uv), gl.ARRAY_BUFFER),
      ib: mk(wide ? new Uint32Array(g.i) : new Uint16Array(g.i), gl.ELEMENT_ARRAY_BUFFER), count: g.i.length, wide, mat, model, visible: true,
    };
  }

  free(m: Mesh): void { const gl = this.gl; gl.deleteBuffer(m.vb); gl.deleteBuffer(m.nb); gl.deleteBuffer(m.ub); gl.deleteBuffer(m.ib); }

  render(scene: Scene, cam: Camera, persp: (aspect: number) => M4, view: M4): void {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(...(scene.clear || [0, 0, 0]), 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const proj = persp(this.width / this.height), vp = mul(proj, view);

    if (!scene.clear) {
      const inv = invert(vp);
      if (inv) {
        gl.useProgram(this.sky); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
        gl.uniformMatrix4fv(this.su.uInv, false, inv); gl.uniform3fv(this.su.uEye, cam.eye);
        gl.uniform3fv(this.su.uTop, scene.sky.top); gl.uniform3fv(this.su.uMid, scene.sky.mid); gl.uniform3fv(this.su.uBot, scene.sky.bottom); gl.uniform3fv(this.su.uSunD, scene.sky.sunDir);
        const a = gl.getAttribLocation(this.sky, 'aP');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3); gl.disableVertexAttribArray(a);
      }
    }

    gl.useProgram(this.prog);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.CULL_FACE);
    const u = this.u;
    gl.uniformMatrix4fv(u.uVP, false, vp);
    gl.uniform3fv(u.uHS, scene.hemiSky); gl.uniform3fv(u.uHG, scene.hemiGround); gl.uniform3fv(u.uSunC, scene.sunColor); gl.uniform3fv(u.uSunD, scene.sunDir);
    gl.uniform3fv(u.uFogC, scene.fog.color); gl.uniform2f(u.uFogR, scene.fog.near, scene.fog.far); gl.uniform3fv(u.uEye, cam.eye);
    const lamps = new Float32Array(12); scene.lamps.pos.slice(0, 4).forEach((p, k) => lamps.set(p, k * 3));
    gl.uniform3fv(u.uLamp, lamps); gl.uniform3fv(u.uLampC, scene.lamps.color); gl.uniform1f(u.uLampR, scene.lamps.range); gl.uniform1f(u.uLampN, Math.min(4, scene.lamps.pos.length));
    gl.uniform1i(u.uMap, 0); gl.uniform1i(u.uEmMap, 1);
    for (const k of [this.loc.p, this.loc.n, this.loc.uv]) gl.enableVertexAttribArray(k);

    const solid: Mesh[] = [], clear: Mesh[] = [], glow: Mesh[] = [];
    for (const m of scene.meshes) if (m.visible) (m.mat.additive ? glow : (m.mat.opacity ?? 1) < 1 ? clear : solid).push(m);
    gl.disable(gl.BLEND);
    for (const m of solid) this.draw(m);
    gl.enable(gl.BLEND); gl.depthMask(false);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const m of clear) this.draw(m);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    for (const m of glow) this.draw(m);
    gl.depthMask(true); gl.disable(gl.BLEND);
    for (const k of [this.loc.p, this.loc.n, this.loc.uv]) gl.disableVertexAttribArray(k);
  }

  private draw(m: Mesh): void {
    const gl = this.gl, u = this.u, mt = m.mat;
    gl.uniformMatrix4fv(u.uM, false, m.model);
    gl.uniformMatrix3fv(u.uNM, false, normalMat(m.model));
    gl.uniform3fv(u.uColor, mt.color); gl.uniform1f(u.uOpacity, mt.opacity ?? 1);
    gl.uniform1f(u.uUnlit, mt.unlit ? 1 : 0); gl.uniform1f(u.uFogOn, mt.fog === false ? 0 : 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, mt.map ?? this.white); gl.uniform1f(u.uUseMap, mt.map ? 1 : 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, mt.emissiveMap ?? this.white); gl.uniform1f(u.uUseEm, mt.emissiveMap ? 1 : 0); gl.uniform1f(u.uEm, mt.emissive ?? 0);
    if (mt.offset) { gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-mt.offset, -mt.offset); } else gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vb); gl.vertexAttribPointer(this.loc.p, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.nb); gl.vertexAttribPointer(this.loc.n, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.ub); gl.vertexAttribPointer(this.loc.uv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
    gl.drawElements(gl.TRIANGLES, m.count, m.wide ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
  }

  dispose(): void {
    const ext = this.gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  }
}

/** Draws a picture on a new canvas (used for window, road and sign textures). */
export function paint(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (g) draw(g, w, h);
  return c;
}
