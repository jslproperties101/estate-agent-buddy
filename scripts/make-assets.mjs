// Renders the launcher icon and splash PNGs from web/img/icon.svg (run locally; the PNGs are committed).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const svg = readFileSync('web/img/icon.svg', 'utf8');
const b = await chromium.launch();
const p = await b.newPage();
const shot = async (file, w, h, html) => { await p.setViewportSize({ width: w, height: h }); await p.setContent(html); await p.screenshot({ path: file, omitBackground: true }); };
const page = (inner, bg = 'transparent') => `<html><body style="margin:0;background:${bg};width:100vw;height:100vh;display:grid;place-items:center;overflow:hidden">${inner}</body></html>`;
await shot('assets/icon-only.png', 1024, 1024, page(svg.replace('<svg ', '<svg width="1024" height="1024" ')));
const fg = svg.replace(/<rect width="1024"[^>]*\/>/, '').replace('<svg ', '<svg width="700" height="700" ');
await shot('assets/icon-foreground.png', 1024, 1024, page(fg));
await shot('assets/icon-background.png', 1024, 1024, page('', '#0B2545'));
const splash = `<div style="display:flex;flex-direction:column;align-items:center;gap:60px;font-family:system-ui,sans-serif">
  <div style="width:700px;height:700px;border-radius:160px;overflow:hidden">${fg.replace('width="700" height="700"', 'width="700" height="700"')}</div>
  <div style="color:#fff;font-size:120px;font-weight:800;text-align:center;line-height:1.1">Malaysia Welcome<br><span style="color:#F2B705">AI Buddy</span></div></div>`;
await shot('assets/splash.png', 2732, 2732, page(splash, '#0B2545'));
await shot('assets/splash-dark.png', 2732, 2732, page(splash, '#0B2545'));
await b.close();
console.log('assets written');
