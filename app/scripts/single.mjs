// Builds one self-contained HTML file (styles and code inlined) for opening on a phone without a server.
// Usage: node scripts/single.mjs <output.html>   (run `npm run build` first)
import { readFileSync, writeFileSync } from 'node:fs';
const out = process.argv[2] ?? 'dist/estate-agent-buddy-prototype.html';
const css = readFileSync('dist/main.css', 'utf8');
const js = readFileSync('dist/main.js', 'utf8').replace(/<\/script/gi, '<\\/script');
writeFileSync(out, `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"><meta name="theme-color" content="#08080A"><title>EA AI Buddy · Prototype</title><style>${css}</style></head><body style="background:#08080A"><div id="root"></div><script type="module">${js}</script></body></html>`);
console.log(`${out} (${Math.round((css.length + js.length) / 1024)} KB)`);
