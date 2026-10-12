// Project checks that run without downloading anything (ESLint cannot be installed in the build workspace).
// Unused code and imports are caught by the type check (noUnusedLocals / noUnusedParameters).
//  1. Smart Capture is gone: no capture screens, routes or PDF/Word/photo reading code.
//  2. No private keys or tokens written into the code.
//  3. No leftover console.log / debugger.
//  4. Every screen-text module has English, Bahasa Malaysia and Chinese.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = [];
const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx|css|mjs|html)$/.test(f)) files.push(p); } };
walk('src'); walk('scripts'); walk('tests'); files.push('index.html');

const problems = [];
const codeOnly = s => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/ .*$/, ''));
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  const lines = codeOnly(text);
  lines.forEach((l, i) => {
    if (f.startsWith('src') && /\b(smartCapture|SmartCapture|readSource|docxText|pdfjs|pdfPages|practiceFields|blankFields|'capture'|name: 'review')\b/.test(l)) problems.push(`${f}:${i + 1} Smart Capture code: ${l.trim()}`);
    if (/AIza[0-9A-Za-z_-]{30,}|sk-ant-[0-9A-Za-z_-]{10,}|eyJhbGciOi[0-9A-Za-z_-]{20,}/.test(l)) problems.push(`${f}:${i + 1} looks like a hard-coded key or token`);
    if (f.startsWith('src') && /\bconsole\.log\(|\bdebugger\b/.test(l)) problems.push(`${f}:${i + 1} console.log / debugger left in`);
  });
  if (f.startsWith('src') && /strings?\.ts$/.test(f) && /Record<Lang,/.test(text) && !/\{\s*en,\s*bm,\s*zh\s*\}/.test(text)) problems.push(`${f}: must export en, bm and zh`);
}
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (pkg.dependencies?.['pdfjs-dist']) problems.push('package.json still depends on pdfjs-dist (Smart Capture)');

if (problems.length) { console.error(problems.join('\n')); console.error(`\n${problems.length} problem(s).`); process.exit(1); }
console.log(`Lint passed: ${files.length} files checked.`);
