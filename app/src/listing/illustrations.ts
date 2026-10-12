// Sample property pictures (Version 1L). Drawn in code, so the prototype needs no downloads, works offline
// and uses no one else's photographs. Each is clearly a sample; real photos replace them when added.

export type Scene =
  | 'terrace' | 'semid_house' | 'bungalow' | 'condo' | 'shoplot' | 'office'
  | 'semid_factory' | 'detached_factory' | 'warehouse' | 'agri' | 'devland';

type Sky = 'golden' | 'day' | 'dusk';
const SKIES: Record<Sky, [string, string, string, string]> = {
  //            top        middle     horizon    sun glow
  golden: ['#1B2333', '#6B4E3A', '#E9B66A', '#FFE2A0'],
  day: ['#3F78B5', '#7FAFDB', '#D9E8F2', '#FFFFFF'],
  dusk: ['#0B1020', '#2C2540', '#B7774A', '#FFC98A'],
};

const W = 640, H = 400, GROUND = 318;

function frame(sky: Sky, body: string, sunX = 470): string {
  const [a, b, c, g] = SKIES[sky];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<defs>
<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>
<radialGradient id="g" cx="${sunX / W}" cy=".78" r=".55"><stop offset="0" stop-color="${g}" stop-opacity=".85"/><stop offset=".35" stop-color="${g}" stop-opacity=".25"/><stop offset="1" stop-color="${g}" stop-opacity="0"/></radialGradient>
<linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3B4A2C"/><stop offset="1" stop-color="#1A2014"/></linearGradient>
<linearGradient id="rd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4A4A4E"/><stop offset="1" stop-color="#26262A"/></linearGradient>
<linearGradient id="wl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3EDE2"/><stop offset="1" stop-color="#CFC6B6"/></linearGradient>
<linearGradient id="gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9CC3DF"/><stop offset=".5" stop-color="#3E6687"/><stop offset="1" stop-color="#1D3247"/></linearGradient>
<linearGradient id="mt" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#B9BEC4"/><stop offset=".5" stop-color="#E4E7EA"/><stop offset="1" stop-color="#A3A9B0"/></linearGradient>
<linearGradient id="lt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE7A6"/><stop offset="1" stop-color="#F2B85B"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#s)"/><rect width="${W}" height="${H}" fill="url(#g)"/>
${hills(sky)}
${body}
</svg>`;
}

function hills(sky: Sky): string {
  const c = sky === 'day' ? '#6E8F6A' : sky === 'golden' ? '#4B4A3A' : '#262433';
  return `<path d="M0 ${GROUND - 40} Q120 ${GROUND - 90} 250 ${GROUND - 55} T520 ${GROUND - 70} T${W} ${GROUND - 50} V${GROUND} H0Z" fill="${c}" opacity=".75"/>`;
}

const ground = (road = true) =>
  `<rect y="${GROUND}" width="${W}" height="${H - GROUND}" fill="url(#gr)"/>` +
  (road ? `<path d="M0 ${H - 38} H${W} V${H} H0Z" fill="url(#rd)"/><path d="M20 ${H - 19} H${W}" stroke="#D9C27A" stroke-width="3" stroke-dasharray="26 22" opacity=".8"/>` : '');

function palm(x: number, y: number, s = 1): string {
  const t = `M${x} ${y} q${-6 * s} ${-60 * s} ${4 * s} ${-118 * s}`;
  const top = { x: x + 4 * s, y: y - 118 * s };
  const fronds = [[-60, 10], [-48, -22], [-14, -40], [24, -36], [56, -12], [62, 16], [-30, 26], [30, 28]]
    .map(([dx, dy]) => `M${top.x} ${top.y} q${dx * s * 0.45} ${(dy - 18) * s * 0.5} ${dx * s} ${dy * s}`).join(' ');
  return `<path d="${t}" stroke="#2A2318" stroke-width="${5 * s}" fill="none" stroke-linecap="round"/><path d="${fronds}" stroke="#1F3A22" stroke-width="${6 * s}" fill="none" stroke-linecap="round"/>`;
}
function shrubs(x0: number, x1: number, y: number): string {
  let out = '';
  for (let x = x0; x < x1; x += 22) out += `<ellipse cx="${x}" cy="${y}" rx="16" ry="10" fill="#2E4A2A"/>`;
  return out;
}
const win = (x: number, y: number, w: number, h: number, lit: boolean) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="${lit ? 'url(#lt)' : 'url(#gl)'}" stroke="#2B2B2B" stroke-width="1.2"/>`;

// ---------- residential ----------
function house2(x: number, w: number, roof: string, lit: boolean, mirror = false): string {
  const y = GROUND - 120;
  const d = mirror ? -1 : 1;
  const porchX = mirror ? x + w - 70 : x + 10;
  return `<g>
<rect x="${x}" y="${y}" width="${w}" height="120" fill="url(#wl)" stroke="#8D8577"/>
<path d="M${x - 8} ${y + 2} L${x + w / 2} ${y - 42} L${x + w + 8} ${y + 2}Z" fill="${roof}"/>
<rect x="${x}" y="${y + 58}" width="${w}" height="6" fill="#B9AF9E"/>
${win(x + w * 0.16, y + 16, w * 0.26, 30, lit)}${win(x + w * 0.58, y + 16, w * 0.26, 30, false)}
${win(x + w * (mirror ? 0.16 : 0.58), y + 76, w * 0.26, 32, lit)}
<rect x="${porchX}" y="${y + 70}" width="60" height="50" fill="#5A3E2B"/>
<path d="M${porchX - 6 * d} ${y + 70} h${72}" stroke="#7B6A55" stroke-width="5"/>
</g>`;
}
function terrace(): string {
  let b = '';
  const roofs = ['#7A3B2E', '#6C3428', '#7A3B2E', '#6C3428'];
  for (let i = 0; i < 4; i++) b += house2(14 + i * 154, 150, roofs[i], i % 2 === 0);
  return frame('golden', `${b}${ground()}<rect x="0" y="${GROUND}" width="${W}" height="6" fill="#8D8577"/>${shrubs(10, 630, GROUND + 18)}${palm(600, GROUND + 4, .8)}`, 520);
}
function semidHouse(): string {
  const b = house2(110, 200, '#5B3326', true) + house2(310, 200, '#5B3326', false, true);
  return frame('day', `${palm(60, GROUND, 1)}${b}${ground()}${shrubs(100, 520, GROUND + 18)}${palm(580, GROUND, .9)}`, 520);
}
function bungalow(): string {
  const x = 120, y = GROUND - 110;
  const body = `<rect x="${x}" y="${y}" width="400" height="110" fill="url(#wl)" stroke="#8D8577"/>
<path d="M${x - 20} ${y + 4} L${x + 120} ${y - 46} H${x + 290} L${x + 420} ${y + 4}Z" fill="#3E3A38"/>
${win(x + 30, y + 30, 70, 50, true)}${win(x + 300, y + 30, 70, 50, true)}${win(x + 170, y + 26, 40, 54, false)}
<rect x="${x + 220}" y="${y + 40}" width="56" height="70" fill="#5A3E2B"/>`;
  return frame('dusk', `${palm(70, GROUND, 1.1)}${body}${ground()}${shrubs(110, 540, GROUND + 18)}${palm(580, GROUND, 1)}`, 420);
}
function condo(): string {
  let t = '';
  const tower = (x: number, w: number, floors: number, litSeed: number) => {
    const top = GROUND - floors * 14 - 10;
    let s = `<rect x="${x}" y="${top}" width="${w}" height="${GROUND - top}" fill="#D9D2C5" stroke="#8D8577"/>`;
    for (let f = 0; f < floors; f++) for (let c = 0; c < Math.floor(w / 18); c++) {
      const lit = (f * 7 + c * 3 + litSeed) % 5 === 0;
      s += `<rect x="${x + 5 + c * 18}" y="${top + 8 + f * 14}" width="12" height="9" fill="${lit ? '#F2C46B' : '#4E6A82'}"/>`;
    }
    for (let f = 1; f < floors; f += 1) s += `<rect x="${x - 3}" y="${top + 6 + f * 14}" width="${w + 6}" height="2" fill="#F5F1E8" opacity=".8"/>`;
    return s;
  };
  t += tower(110, 150, 17, 1) + tower(300, 180, 20, 3) + tower(500, 110, 13, 2);
  return frame('dusk', `${t}${ground()}${shrubs(0, 640, GROUND + 14)}${palm(70, GROUND + 6, 1)}${palm(270, GROUND + 6, .9)}${palm(470, GROUND + 6, .9)}`, 300);
}

// ---------- commercial ----------
function shoplot(): string {
  let b = '';
  const colours = ['#EADFCB', '#E2D2B6', '#EADFCB', '#DCCDB0', '#EADFCB'];
  for (let i = 0; i < 5; i++) {
    const x = 6 + i * 126, y = GROUND - 170;
    b += `<rect x="${x}" y="${y}" width="124" height="170" fill="${colours[i]}" stroke="#8D8577"/>
<rect x="${x}" y="${y}" width="124" height="12" fill="#B9AF9E"/>
${win(x + 14, y + 22, 42, 30, i % 2 === 1)}${win(x + 68, y + 22, 42, 30, false)}
${win(x + 14, y + 68, 42, 30, false)}${win(x + 68, y + 68, 42, 30, i % 3 === 0)}
<rect x="${x + 6}" y="${y + 108}" width="112" height="14" fill="#1E1E20"/><rect x="${x + 30}" y="${y + 112}" width="64" height="6" rx="2" fill="#C9A24A"/>
<rect x="${x + 6}" y="${y + 126}" width="112" height="44" fill="url(#gl)"/>
<rect x="${x}" y="${y + 104}" width="6" height="66" fill="#B9AF9E"/>`;
  }
  return frame('golden', `${b}${ground()}`, 380);
}
function office(): string {
  const x = 210, top = 40;
  let s = `<rect x="${x}" y="${top}" width="220" height="${GROUND - top}" fill="url(#gl)" stroke="#1D3247"/>`;
  for (let c = 1; c < 8; c++) s += `<path d="M${x + c * 27.5} ${top} V${GROUND}" stroke="#C9D7E3" stroke-width="1" opacity=".5"/>`;
  for (let f = 1; f < 20; f++) s += `<path d="M${x} ${top + f * 14} H${x + 220}" stroke="#C9D7E3" stroke-width="1" opacity=".35"/>`;
  s += `<path d="M${x} ${top} L${x + 220} ${top + 160}" stroke="#FFFFFF" stroke-width="30" opacity=".08"/>`;
  s += `<rect x="60" y="150" width="130" height="${GROUND - 150}" fill="#CFC6B6"/><rect x="460" y="120" width="140" height="${GROUND - 120}" fill="#BFB6A6"/>`;
  for (let f = 0; f < 10; f++) s += `<rect x="70" y="${160 + f * 15}" width="110" height="7" fill="#4E6A82"/><rect x="470" y="${130 + f * 18}" width="120" height="8" fill="${f % 3 ? '#4E6A82' : '#F2C46B'}"/>`;
  return frame('day', `${s}${ground()}${shrubs(40, 620, GROUND + 14)}`, 560);
}

// ---------- industrial ----------
function factory(x: number, w: number, mirror = false, lit = true): string {
  const y = GROUND - 120, officeW = w * 0.34;
  const ox = mirror ? x + w - officeW : x;
  const wx = mirror ? x : x + officeW;
  let s = `<rect x="${wx}" y="${y + 10}" width="${w - officeW}" height="110" fill="url(#mt)" stroke="#7D8389"/>`;
  for (let i = 0; i < (w - officeW) / 10; i++) s += `<path d="M${wx + i * 10} ${y + 10} V${GROUND}" stroke="#8E949A" stroke-width="1" opacity=".55"/>`;
  s += `<path d="M${wx - 4} ${y + 12} L${wx + (w - officeW) / 2} ${y - 16} L${wx + w - officeW + 4} ${y + 12}Z" fill="#7C8389"/>`;
  s += `<rect x="${wx + (w - officeW) / 2 - 34}" y="${y + 48}" width="68" height="72" fill="#5B6168" stroke="#40454B"/>`;
  for (let i = 1; i < 9; i++) s += `<path d="M${wx + (w - officeW) / 2 - 34} ${y + 48 + i * 8} h68" stroke="#474C52" stroke-width="1.5"/>`;
  s += `<rect x="${ox}" y="${y - 30}" width="${officeW}" height="150" fill="url(#wl)" stroke="#8D8577"/>`;
  s += win(ox + 10, y - 18, officeW - 20, 36, lit) + win(ox + 10, y + 30, officeW - 20, 36, false);
  s += `<rect x="${ox + officeW / 2 - 16}" y="${y + 84}" width="32" height="36" fill="#2E2E30"/>`;
  return s;
}
function semidFactory(): string {
  return frame('golden', `${factory(40, 280, false)}${factory(320, 280, true, false)}${ground()}<path d="M0 ${GROUND + 6} H${W}" stroke="#8D8577" stroke-width="4"/>${palm(25, GROUND + 4, .7)}`, 560);
}
function detachedFactory(): string {
  return frame('day', `${palm(40, GROUND, .9)}${factory(110, 440, false)}${ground()}<path d="M0 ${GROUND + 8} H${W}" stroke="#A9A9A9" stroke-width="3" stroke-dasharray="4 6"/>${palm(600, GROUND, .9)}`, 520);
}
function warehouse(): string {
  const x = 60, y = GROUND - 130, w = 520;
  let s = `<rect x="${x}" y="${y}" width="${w}" height="130" fill="url(#mt)" stroke="#7D8389"/>`;
  for (let i = 0; i < w / 9; i++) s += `<path d="M${x + i * 9} ${y} V${GROUND}" stroke="#8E949A" opacity=".5"/>`;
  s += `<path d="M${x - 6} ${y + 2} L${x + w / 2} ${y - 34} L${x + w + 6} ${y + 2}Z" fill="#6F767D"/>`;
  for (let i = 0; i < 4; i++) {
    const dx = x + 40 + i * 125;
    s += `<rect x="${dx}" y="${y + 50}" width="80" height="80" fill="#5B6168"/>`;
    for (let k = 1; k < 10; k++) s += `<path d="M${dx} ${y + 50 + k * 8} h80" stroke="#474C52" stroke-width="1.5"/>`;
  }
  return frame('dusk', `${s}${ground()}`, 300);
}

// ---------- land ----------
function agri(): string {
  let rows = `<rect y="${GROUND - 60}" width="${W}" height="${H - GROUND + 60}" fill="url(#gr)"/>`;
  for (let r = 0; r < 4; r++) for (let i = 0; i < 9; i++) {
    const s = 0.5 + r * 0.22, x = i * 80 + (r % 2) * 40 - 10, y = GROUND - 50 + r * 34;
    rows += palm(x, y, s);
  }
  return frame('golden', rows, 440);
}
function devland(): string {
  let city = '';
  const xs = [380, 410, 450, 480, 520, 560, 590];
  xs.forEach((x, i) => { const h = 50 + ((i * 37) % 70); city += `<rect x="${x}" y="${GROUND - 40 - h}" width="26" height="${h}" fill="#3A3F4A" opacity=".75"/>`; });
  const land = `<rect y="${GROUND - 40}" width="${W}" height="${H - GROUND + 40}" fill="#8A6B47"/>
<path d="M0 ${GROUND - 40} H${W}" stroke="#6E5537" stroke-width="3"/>
<path d="M40 ${H - 30} L220 ${GROUND - 20} L600 ${GROUND - 12}" stroke="#A5845B" stroke-width="14" fill="none" opacity=".7"/>
<rect x="70" y="${GROUND - 120}" width="8" height="90" fill="#2A2A2A"/><rect x="150" y="${GROUND - 120}" width="8" height="90" fill="#2A2A2A"/>
<rect x="56" y="${GROUND - 150}" width="116" height="56" rx="3" fill="#0E0E10" stroke="#C9A24A" stroke-width="3"/>
<rect x="72" y="${GROUND - 136}" width="84" height="8" fill="#C9A24A"/><rect x="72" y="${GROUND - 120}" width="60" height="6" fill="#8F8A80"/>
${shrubs(240, 640, GROUND - 36)}`;
  return frame('day', `${city}${land}`, 520);
}

const BUILDERS: Record<Scene, () => string> = {
  terrace, semid_house: semidHouse, bungalow, condo, shoplot, office,
  semid_factory: semidFactory, detached_factory: detachedFactory, warehouse, agri, devland,
};

const cache = new Map<Scene, string>();
/** A data URL for an <img>. */
export function sceneUrl(scene: Scene): string {
  let u = cache.get(scene);
  if (!u) { u = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(BUILDERS[scene]().replace(/\s*\n\s*/g, '')); cache.set(scene, u); }
  return u;
}

/** Picture used when a property has no photo yet, chosen from its type. */
export function sceneForType(type?: string): Scene | undefined {
  if (!type) return undefined;
  const map: Record<string, Scene> = {
    'Terrace house': 'terrace', 'Semi-D house': 'semid_house', 'Bungalow': 'bungalow', 'Townhouse': 'terrace',
    'Condo / apartment': 'condo', 'Shoplot': 'shoplot', 'Office': 'office',
    'Terrace factory': 'semid_factory', 'Semi-D factory': 'semid_factory', 'Detached factory': 'detached_factory', 'Warehouse': 'warehouse',
    'Industrial land': 'devland', 'Agricultural land': 'agri', 'Development land': 'devland',
  };
  return map[type];
}
