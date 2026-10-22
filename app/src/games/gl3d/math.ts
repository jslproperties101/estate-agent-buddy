// v1buddychange015 (Batch I): the small amount of 3D maths the 3D games need (4x4 matrices, column-major like WebGL),
// plus seeded random numbers and the ray tests used to tap things in the 3D view. No library: the app stays offline.

export type M4 = Float32Array;
export type V3 = [number, number, number];

export function ident(): M4 { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; }

export function mul(a: M4, b: M4, out: M4 = new Float32Array(16)): M4 {
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return out;
}

export function perspective(fovyRad: number, aspect: number, near: number, far: number): M4 {
  const f = 1 / Math.tan(fovyRad / 2), m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f; m[10] = (far + near) / (near - far); m[11] = -1; m[14] = (2 * far * near) / (near - far);
  return m;
}

export function lookAt(eye: V3, target: V3, up: V3 = [0, 1, 0]): M4 {
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  const m = new Float32Array(16);
  m[0] = xx; m[1] = yx; m[2] = zx; m[4] = xy; m[5] = yy; m[6] = zy; m[8] = xz; m[9] = yz; m[10] = zz;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  m[15] = 1;
  return m;
}

/** Translate, then turn about the vertical axis (ry) and the side axis (rx), then scale: the only placements the games use. */
export function trs(x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0): M4 {
  const cy = Math.cos(ry), sny = Math.sin(ry), cx = Math.cos(rx), snx = Math.sin(rx), m = new Float32Array(16);
  // R = Ry * Rx
  m[0] = cy * sx; m[1] = 0; m[2] = -sny * sx;
  m[4] = sny * snx * sy; m[5] = cx * sy; m[6] = cy * snx * sy;
  m[8] = sny * cx * sz; m[9] = -snx * sz; m[10] = cy * cx * sz;
  m[12] = x; m[13] = y; m[14] = z; m[15] = 1;
  return m;
}

export function invert(a: M4): M4 | null {
  const o = new Float32Array(16);
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = a;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  det = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return o;
}

/** Normal matrix (inverse transpose of the upper 3x3), so stretched boxes still light correctly. */
export function normalMat(m: M4): Float32Array {
  const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C || 1;
  const n = new Float32Array(9);
  n[0] = A / det; n[1] = B / det; n[2] = C / det;
  n[3] = -(b * i - c * h) / det; n[4] = (a * i - c * g) / det; n[5] = -(a * h - b * g) / det;
  n[6] = (b * f - c * e) / det; n[7] = -(a * f - c * d) / det; n[8] = (a * e - b * d) / det;
  return n;
}

/** Forward direction of a first-person camera: yaw 0 looks along -z, positive yaw turns left. */
export function forward(yaw: number, pitch = 0): V3 {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

/** Angle of a target relative to where the player faces (0 = straight ahead, positive = to the right). */
export function relAngle(yaw: number, dx: number, dz: number): number {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  return Math.atan2(dx * c - dz * s, -dx * s - dz * c);
}

/** Seeded random numbers (same seed, same street) and an integer hash for grid cells. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Distance along a ray to a sphere, or -1 when it misses. dir must be unit length. */
export function raySphere(o: V3, dir: V3, c: V3, r: number): number {
  const ox = o[0] - c[0], oy = o[1] - c[1], oz = o[2] - c[2];
  const b = ox * dir[0] + oy * dir[1] + oz * dir[2];
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc), t0 = -b - s, t1 = -b + s;
  return t0 >= 0 ? t0 : t1 >= 0 ? 0 : -1;
}

/** Axis-aligned box as [minX, minY, minZ, maxX, maxY, maxZ]. */
export type Box3 = [number, number, number, number, number, number];
/** Distance along a ray to a box, or -1 when it misses. */
export function rayBox(o: V3, dir: V3, b: Box3): number {
  let tmin = -Infinity, tmax = Infinity;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(dir[k]) < 1e-9) { if (o[k] < b[k] || o[k] > b[k + 3]) return -1; continue; }
    let t1 = (b[k] - o[k]) / dir[k], t2 = (b[k + 3] - o[k]) / dir[k];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  return Math.max(0, tmin);
}

/** Flat 2D boxes the walker cannot enter, as [minX, maxX, minZ, maxZ]. Pushes the circle (x, z, radius) out of them. */
export type Rect = [number, number, number, number];
export function pushOut(p: { x: number; z: number }, rad: number, boxes: Iterable<Rect>): boolean {
  let hit = false;
  for (const b of boxes) {
    const qx = Math.max(b[0], Math.min(p.x, b[1])), qz = Math.max(b[2], Math.min(p.z, b[3]));
    const dx = p.x - qx, dz = p.z - qz, d2 = dx * dx + dz * dz;
    if (d2 >= rad * rad) continue;
    hit = true;
    if (d2 < 1e-9) {
      const o = [p.x - b[0], b[1] - p.x, p.z - b[2], b[3] - p.z], m = Math.min(...o);
      if (m === o[0]) p.x = b[0] - rad; else if (m === o[1]) p.x = b[1] + rad; else if (m === o[2]) p.z = b[2] - rad; else p.z = b[3] + rad;
    } else {
      const d = Math.sqrt(d2), k = (rad - d) / d;
      p.x += dx * k; p.z += dz * k;
    }
  }
  return hit;
}
