// v1buddychange014 (JoyChange004 Change 90): Buddy Walk, the rules of the walk. Pure code with no screen or browser parts,
// so every rule here (the corridor, walking into walls, which listing is in front, visits and the 60-second clock) is
// tested on its own in tests/games-buddyWalk.test.ts.
//
// The gallery is a straight corridor seen from above as a grid of square cells. x runs across the corridor, y along it.
// Columns 0 and 3 are walls, columns 1 and 2 are the floor. Listings hang on the walls in facing pairs, every second row:
// listing 0 on the left wall, listing 1 opposite it on the right wall, listing 2 on the left two rows further, and so on.

export const COLS = 4;
/** Cells: 0 floor, 1 plain wall, 2 end wall, 3 + n listing n's frame. */
export const FLOOR = 0, WALL = 1, END = 2, PANEL0 = 3;
/** Walking speed (cells a second), turning speed (radians a second), body radius (cells). */
export const SPEED = 2.2, TURN_SPEED = 2.4, RADIUS = 0.25;
/** A listing is "in front" within this distance of its frame and this angle of straight ahead. */
export const NEAR = 1.6, CONE = (35 * Math.PI) / 180;
/** Seconds the agent must stay in front of a listing for it to count as visited. */
export const DWELL = 0.8;
/** One tap from the keyboard (Enter / Space on a button): half a cell, or 15 degrees. */
export const NUDGE_STEP = 0.5, NUDGE_TURN = Math.PI / 12;
/** The Visit challenge lasts 60 seconds. */
export const ROUND_MS = 60_000;
/** The corridor never holds more than this many listings (the newest ones), so a huge list stays quick. */
export const MAX_PANELS = 200;

export interface Panel {
  index: number;
  /** The wall cell holding the frame. */
  cx: number; cy: number;
  side: 'left' | 'right';
  /** Middle of the frame's face, and the direction the face looks (into the corridor). */
  fx: number; fy: number; nx: number; ny: number;
}
export interface World { w: number; h: number; cells: Uint8Array; panels: Panel[] }
export interface Player { x: number; y: number; a: number }
/** fwd: +1 forward, -1 back. turn: +1 left, -1 right. Values in between come from a swipe. */
export interface Input { fwd: number; turn: number }

export const panelRow = (i: number) => 2 + 2 * Math.floor(i / 2);

export function buildWorld(count: number): World {
  const n = Math.max(0, Math.min(MAX_PANELS, Math.floor(count)));
  const w = COLS;
  const h = 2 + 2 * Math.ceil(n / 2) + 1;
  const cells = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const edge = x === 0 || x === w - 1;
    const end = y === 0 || y === h - 1;
    cells[y * w + x] = end ? END : edge ? WALL : FLOOR;
  }
  const panels: Panel[] = [];
  for (let i = 0; i < n; i++) {
    const left = i % 2 === 0;
    const cy = panelRow(i);
    const cx = left ? 0 : w - 1;
    cells[cy * w + cx] = PANEL0 + i;
    panels.push({ index: i, cx, cy, side: left ? 'left' : 'right', fx: left ? 1 : w - 1, fy: cy + 0.5, nx: left ? 1 : -1, ny: 0 });
  }
  return { w, h, cells, panels };
}

/** Where a walk starts: in the middle of the corridor, near the start wall, looking down the corridor. */
export const startPlayer = (): Player => ({ x: 2, y: 1.3, a: Math.PI / 2 });

export function cellAt(world: World, x: number, y: number): number {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.h) return WALL;
  return world.cells[cy * world.w + cx];
}
const solid = (world: World, x: number, y: number) => cellAt(world, x, y) !== FLOOR;
/** True when a body of RADIUS can stand at (x, y) without touching a wall. */
export function free(world: World, x: number, y: number): boolean {
  return !solid(world, x - RADIUS, y - RADIUS) && !solid(world, x + RADIUS, y - RADIUS)
    && !solid(world, x - RADIUS, y + RADIUS) && !solid(world, x + RADIUS, y + RADIUS);
}

const wrap = (a: number) => { const t = Math.PI * 2; return ((a % t) + t) % t; };

/** Moves by a distance along the facing direction. Walls stop the body; it slides along a wall instead of sticking. */
export function walk(p: Player, dist: number, world: World): Player {
  const dx = Math.cos(p.a) * dist, dy = Math.sin(p.a) * dist;
  let { x, y } = p;
  if (free(world, x + dx, y)) x += dx;
  if (free(world, x, y + dy)) y += dy;
  return { x, y, a: p.a };
}

/** One frame of walking and turning. dt (seconds) is capped so a slow frame never jumps through a wall. */
export function move(p: Player, input: Input, dt: number, world: World): Player {
  const t = Math.min(0.1, Math.max(0, dt));
  const fwd = Math.max(-1, Math.min(1, input.fwd)), turn = Math.max(-1, Math.min(1, input.turn));
  const turned = { ...p, a: wrap(p.a + turn * TURN_SPEED * t) };
  return fwd ? walk(turned, fwd * SPEED * t, world) : turned;
}

export type NudgeKind = 'fwd' | 'back' | 'left' | 'right';
/** One keyboard step (a button pressed with Enter or Space). */
export function nudge(p: Player, kind: NudgeKind, world: World): Player {
  if (kind === 'left') return { ...p, a: wrap(p.a + NUDGE_TURN) };
  if (kind === 'right') return { ...p, a: wrap(p.a - NUDGE_TURN) };
  return walk(p, kind === 'fwd' ? NUDGE_STEP : -NUDGE_STEP, world);
}

/** The listing the agent is standing in front of and looking at, or -1. The closest to straight ahead wins. */
export function facingPanel(p: Player, world: World): number {
  const dx = Math.cos(p.a), dy = Math.sin(p.a);
  let best = -1, bestCos = Math.cos(CONE);
  // Frames are two rows apart, so only the few near the agent's row need checking.
  const first = Math.max(0, 2 * Math.floor((p.y - NEAR - 3) / 2));
  for (let i = first; i < world.panels.length; i++) {
    const q = world.panels[i];
    if (q.fy - p.y > NEAR + 1) break;
    const vx = q.fx - p.x, vy = q.fy - p.y;
    const d = Math.hypot(vx, vy);
    if (d > NEAR || d < 1e-6) continue;
    if ((p.x - q.fx) * q.nx + (p.y - q.fy) * q.ny < 0.3) continue; // must stand on the corridor side of the frame
    const c = (vx * dx + vy * dy) / d;
    if (c >= bestCos) { bestCos = c; best = q.index; }
  }
  return best;
}

// ---------- visits ----------
export interface Visits { current: number; dwell: number; visited: number[] }
export const NO_VISITS: Visits = { current: -1, dwell: 0, visited: [] };

/** Time in front of the same listing adds up; turning away resets it. After DWELL seconds the listing counts once. */
export function updateVisits(v: Visits, facing: number, dt: number): { visits: Visits; newly: number } {
  if (facing < 0) return { visits: v.current === -1 && v.dwell === 0 ? v : { ...v, current: -1, dwell: 0 }, newly: -1 };
  const dwell = (facing === v.current ? v.dwell : 0) + Math.max(0, dt);
  if (dwell >= DWELL && !v.visited.includes(facing)) {
    return { visits: { current: facing, dwell, visited: [...v.visited, facing] }, newly: facing };
  }
  return { visits: { ...v, current: facing, dwell }, newly: -1 };
}
/** 0..1 while staying in front of a listing not yet visited (for the progress bar); 1 once it is visited. */
export function dwellProgress(v: Visits): number {
  if (v.current < 0) return 0;
  if (v.visited.includes(v.current)) return 1;
  return Math.min(1, v.dwell / DWELL);
}

// ---------- the round ----------
export interface Clock { limitMs: number; elapsedMs: number }
export const newClock = (limitMs = ROUND_MS): Clock => ({ limitMs, elapsedMs: 0 });
/** Adds time while the game is on screen. A long gap (phone asleep, tab hidden) adds at most one second. */
export function tick(c: Clock, dtMs: number): Clock {
  return { ...c, elapsedMs: Math.min(c.limitMs, c.elapsedMs + Math.min(1000, Math.max(0, dtMs))) };
}
export const timeUp = (c: Clock) => c.elapsedMs >= c.limitMs;
export const secondsLeft = (c: Clock) => Math.max(0, Math.ceil((c.limitMs - c.elapsedMs) / 1000));

/** The score sent to the Games hub: listings visited out of listings in the corridor (at least 1). */
export const roundResult = (visited: number, panels: number) => ({ score: Math.max(0, Math.min(visited, panels)), maxScore: Math.max(1, panels) });

/** Wraps onFinish so it runs exactly once, whichever comes first: time running out or the Finish button. */
export function once<T>(fn: (r: T) => void): (r: T) => boolean {
  let done = false;
  return r => { if (done) return false; done = true; fn(r); return true; };
}

// ---------- seeing ----------
export interface Hit { dist: number; cell: number; side: 0 | 1; wallX: number; mapX: number; mapY: number }
/** Casts one ray from (x, y) along (rdx, rdy) through the grid (DDA). dist is the distance along the view direction,
 *  so walls do not bend (no fish-eye). wallX (0..1) is where along the wall face the ray landed. */
export function castRay(world: World, x: number, y: number, rdx: number, rdy: number): Hit {
  let mapX = Math.floor(x), mapY = Math.floor(y);
  const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx), ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
  const stepX = rdx < 0 ? -1 : 1, stepY = rdy < 0 ? -1 : 1;
  let sdx = rdx < 0 ? (x - mapX) * ddx : (mapX + 1 - x) * ddx;
  let sdy = rdy < 0 ? (y - mapY) * ddy : (mapY + 1 - y) * ddy;
  let side: 0 | 1 = 0, cell = WALL;
  const limit = world.w + world.h + 4;
  for (let n = 0; n < limit; n++) {
    if (sdx < sdy) { sdx += ddx; mapX += stepX; side = 0; } else { sdy += ddy; mapY += stepY; side = 1; }
    cell = cellAt(world, mapX + 0.5, mapY + 0.5);
    if (cell !== FLOOR) break;
  }
  const dist = Math.max(1e-4, side === 0 ? sdx - ddx : sdy - ddy);
  let wallX = side === 0 ? y + dist * rdy : x + dist * rdx;
  wallX -= Math.floor(wallX);
  // Keep pictures the right way round whichever side they are seen from.
  if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) wallX = 1 - wallX;
  return { dist, cell, side, wallX, mapX, mapY };
}
