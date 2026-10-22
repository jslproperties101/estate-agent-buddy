// Price It Right: small pixel-art pictures of each property type, drawn as SVG rectangles on a 64 x 32 grid (black and gold).
import type { Art } from './logic';

type R = [x: number, y: number, w: number, h: number, c: string];
const GOLD = '#D8B95C', HI = '#F6E3A1', LO = '#9C7A22', INK = '#0E0E10', GROUND = '#2E2A22', WALL = '#BEB7A6', WALL2 = '#8E8777';

const ground = (): R[] => [[0, 28, 64, 4, GROUND], [0, 28, 64, 1, LO]];
const sky = (): R[] => [[54, 4, 4, 4, GOLD], [53, 5, 6, 2, GOLD], [55, 3, 2, 6, GOLD], [6, 5, 1, 1, LO], [14, 3, 1, 1, LO], [30, 6, 1, 1, LO], [44, 4, 1, 1, LO], [60, 14, 1, 1, LO]];
/** A stepped (pixel) roof over a wall that spans x .. x+w, with its eaves at y. */
const roof = (x: number, w: number, y: number, c: string, rise = 4): R[] => {
  const out: R[] = [];
  for (let i = 0; i < rise; i++) out.push([x - 1 + i * 2, y - 2 - i * 2, w + 2 - i * 4, 2, c]);
  return out;
};
const win = (x: number, y: number, w = 3, h = 3, lit = false): R[] => [[x, y, w, h, lit ? GOLD : INK], [x, y + h, w, 1, LO]];

function scene(a: Art): R[] {
  const r: R[] = [...sky(), ...ground()];
  switch (a) {
    case 'terrace':
      for (let i = 0; i < 3; i++) {
        const x = 7 + i * 17, wall = i === 1 ? HI : WALL;
        r.push([x, 13, 16, 15, wall], ...roof(x, 16, 13, LO, 4), [x + 15, 13, 1, 15, WALL2],
          ...win(x + 3, 15, 3, 3, i === 1), ...win(x + 10, 15, 3, 3), ...win(x + 3, 21, 3, 3), [x + 9, 21, 4, 7, GOLD], [x + 12, 24, 1, 1, INK]);
      }
      break;
    case 'semid': {
      r.push([9, 13, 46, 15, HI], ...roof(9, 46, 13, LO, 5), [31, 13, 2, 15, LO], [9, 13, 46, 1, WALL]);
      for (const x of [13, 22, 38, 47]) r.push(...win(x, 16, 4, 4, x === 22 || x === 47));
      r.push([14, 22, 5, 6, GOLD], [45, 22, 5, 6, GOLD], [26, 22, 3, 6, INK], [35, 22, 3, 6, INK]);
      break;
    }
    case 'bungalow':
      r.push([6, 16, 42, 12, HI], ...roof(5, 44, 16, LO, 5), [6, 16, 42, 1, WALL],
        ...win(10, 19, 5, 4), ...win(19, 19, 5, 4, true), ...win(35, 19, 5, 4), [27, 19, 6, 9, GOLD], [32, 24, 1, 1, INK], [43, 18, 4, 10, WALL2],
        [52, 14, 2, 14, LO], [49, 9, 8, 3, GOLD], [48, 12, 10, 3, GOLD], [50, 15, 6, 2, GOLD], [4, 26, 3, 2, LO], [8, 27, 2, 1, GOLD]);
      break;
    case 'condo': {
      r.push([20, 3, 24, 25, WALL], [20, 3, 24, 2, HI], [44, 3, 2, 25, WALL2]);
      for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++) r.push(...win(23 + col * 7, 7 + row * 4, 4, 2, (row * 3 + col) % 4 === 1));
      r.push([28, 24, 8, 4, GOLD], [30, 25, 4, 3, INK]);
      r.push([6, 14, 12, 14, WALL2], [6, 14, 12, 2, WALL]);
      for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) r.push(...win(8 + col * 5, 18 + row * 3, 3, 2, row === 1 && col === 0));
      r.push([47, 12, 12, 16, LO], [47, 12, 12, 2, GOLD]);
      for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) r.push(...win(49 + col * 5, 16 + row * 4, 3, 2, row === 2 && col === 1));
      break;
    }
    case 'shoplot':
      for (let i = 0; i < 3; i++) {
        const x = 5 + i * 18, wall = i === 1 ? HI : WALL;
        r.push([x, 8, 17, 20, wall], [x, 8, 17, 2, LO], ...win(x + 3, 11, 4, 3), ...win(x + 10, 11, 4, 3, i === 0),
          [x, 15, 17, 1, INK]);
        for (let k = 0; k < 6; k++) r.push([x + k * 3, 16, 3, 3, k % 2 ? INK : GOLD]);
        r.push([x + 1, 20, 9, 8, INK], [x + 2, 21, 7, 4, LO], [x + 12, 20, 4, 8, GOLD], [x + 15, 24, 1, 1, INK]);
      }
      break;
    case 'land':
      r.push([0, 28, 64, 4, GROUND], [0, 24, 64, 4, LO], [0, 24, 64, 1, GOLD]);
      for (let x = 2; x < 64; x += 7) r.push([x, 17, 1, 11, WALL2]);
      r.push([0, 19, 64, 1, WALL2], [0, 24, 64, 1, WALL2]);
      r.push([10, 8, 2, 10, LO], [7, 3, 8, 3, GOLD], [5, 6, 12, 3, GOLD], [8, 9, 6, 2, GOLD]);
      r.push([40, 14, 2, 10, LO], [38, 11, 6, 3, GOLD], [37, 13, 8, 2, GOLD]);
      r.push([26, 11, 2, 13, LO], [20, 5, 14, 7, HI], [22, 7, 10, 1, INK], [22, 9, 7, 1, INK]);
      break;
    case 'factory':
      r.push([6, 14, 42, 14, WALL], [6, 14, 42, 1, HI]);
      for (let i = 0; i < 3; i++) { const x = 6 + i * 14; r.push([x, 9, 14, 5, WALL2], [x, 9, 2, 5, HI], [x + 2, 11, 12, 3, WALL2], [x + 4, 10, 2, 1, INK]); }
      r.push([52, 4, 5, 24, LO], [52, 4, 5, 2, GOLD], [50, 1, 3, 2, WALL2], [54, 0, 3, 2, WALL2]);
      r.push([10, 20, 12, 8, INK], [12, 21, 8, 1, LO], [12, 23, 8, 1, LO], [12, 25, 8, 1, LO], [28, 22, 7, 6, GOLD], [38, 17, 6, 3, INK], [8, 17, 3, 2, INK]);
      break;
  }
  return r;
}

/** The picture for one property type. Decorative, so it is hidden from screen readers (the card spells everything out in words). */
export function PixelArt({ art }: { art: Art }) {
  return (
    <svg className="pir-art-svg" viewBox="0 0 64 32" preserveAspectRatio="xMidYMax meet" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      {scene(art).map(([x, y, w, h, c], i) => <rect key={i} x={x} y={y} width={w} height={h} fill={c} />)}
    </svg>
  );
}
