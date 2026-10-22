// v1buddychange014: Buddy Walk's own styles, kept in its folder (every class starts with bw-) so the shared stylesheet is
// untouched. Black and gold. Text sizes use --bw-fs so a bigger phone text size can be tried in the screen tests.
export const BW_CSS = `
.bw-root { --bw-bg: #0E0E10; --bw-gold: #D8B95C; --bw-pale: #F6E3A1; --bw-deep: #6E5A26; --bw-fs: 1;
  display: flex; flex-direction: column; gap: 10px; min-width: 0; color: var(--ink, #F7F4EC); }
.bw-root * { box-sizing: border-box; }
.bw-panel { background: var(--bw-bg); border: 2px solid var(--bw-gold); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.bw-panel h2, .bw-panel h3 { margin: 0; color: var(--bw-pale); font-size: calc(19px * var(--bw-fs)); line-height: 1.3; }
.bw-panel h3 { font-size: calc(17px * var(--bw-fs)); }
.bw-panel p { margin: 0; font-size: calc(15px * var(--bw-fs)); line-height: 1.45; }
.bw-muted { color: var(--muted, #BEB7A6); }
.bw-btns { display: flex; flex-direction: column; gap: 8px; }
.bw-btns .btn { width: 100%; font-size: calc(16px * var(--bw-fs)); min-height: 48px; white-space: normal; }
.bw-hud { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
.bw-stat { display: inline-flex; align-items: center; min-height: 40px; padding: 4px 12px; border-radius: 10px; border: 1px solid var(--bw-deep);
  background: var(--bw-bg); color: var(--bw-pale); font-weight: 700; font-size: calc(15px * var(--bw-fs)); line-height: 1.25; font-variant-numeric: tabular-nums; max-width: 100%; }
.bw-stat.bw-low { border-color: var(--bw-gold); color: #FFD27A; }
.bw-hud-btns { display: flex; gap: 8px; margin-left: auto; flex-wrap: wrap; }
.bw-hud-btns .btn { min-height: 44px; font-size: calc(15px * var(--bw-fs)); padding: 6px 14px; white-space: normal; }
.bw-view { position: relative; width: 100%; max-width: calc(40vh * 8 / 5); margin: 0 auto; }
.bw-canvas { display: block; width: 100%; height: auto; aspect-ratio: 8 / 5; image-rendering: pixelated; image-rendering: crisp-edges;
  background: var(--bw-bg); border: 2px solid var(--bw-gold); border-radius: 12px; touch-action: none; user-select: none; -webkit-user-select: none; outline: none; }
.bw-canvas:focus-visible { box-shadow: 0 0 0 3px var(--bw-pale); }
.bw-progress { position: absolute; left: 12%; right: 12%; bottom: 10px; height: 8px; border: 1px solid var(--bw-pale); background: rgba(14,14,16,.7); border-radius: 2px; overflow: hidden; pointer-events: none; }
.bw-progress > i { display: block; height: 100%; background: var(--bw-gold); }
.bw-pad { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; width: 100%; max-width: 360px; margin: 0 auto;
  touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.bw-key { min-height: 56px; border-radius: 12px; border: 2px solid var(--bw-gold); background: #17161A; color: var(--bw-pale);
  display: flex; align-items: center; justify-content: center; padding: 0; touch-action: none; -webkit-tap-highlight-color: transparent; }
.bw-key[data-held="1"] { background: var(--bw-gold); color: var(--bw-bg); }
.bw-key:focus-visible { outline: 3px solid var(--bw-pale); outline-offset: 2px; }
.bw-key svg { width: 30px; height: 30px; shape-rendering: crispEdges; }
.bw-card { background: linear-gradient(180deg, #1D1A12, var(--bw-bg)); border: 2px solid var(--bw-gold); border-radius: 14px; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 6px; min-width: 0; min-height: 64px; }
.bw-card.bw-none { border-style: dashed; border-color: var(--bw-deep); justify-content: center; }
.bw-card p, .bw-card dl, .bw-card dt, .bw-card dd { margin: 0; }
.bw-card-top { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.bw-chip { display: inline-block; padding: 2px 8px; border-radius: 8px; border: 1px solid var(--bw-deep); color: var(--bw-pale);
  font-size: calc(14px * var(--bw-fs)); line-height: 1.35; font-weight: 600; }
.bw-chip.bw-on { background: var(--bw-gold); color: var(--bw-bg); border-color: var(--bw-gold); }
.bw-title { color: var(--bw-pale); font-weight: 700; font-size: calc(16px * var(--bw-fs)); line-height: 1.35; overflow-wrap: anywhere; }
.bw-price { color: var(--bw-gold); font-weight: 800; font-size: calc(18px * var(--bw-fs)); line-height: 1.3; display: flex; flex-wrap: wrap; gap: 4px 14px; }
.bw-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 4px 12px; }
.bw-facts div { min-width: 0; }
.bw-facts dt { color: var(--muted, #BEB7A6); font-size: calc(14px * var(--bw-fs)); line-height: 1.3; }
.bw-facts dd { font-weight: 700; font-size: calc(15px * var(--bw-fs)); line-height: 1.3; overflow-wrap: anywhere; }
.bw-help { margin: 0; color: var(--muted, #BEB7A6); font-size: calc(14px * var(--bw-fs)); line-height: 1.4; }
.bw-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`;
