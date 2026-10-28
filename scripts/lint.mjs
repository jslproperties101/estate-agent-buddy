// Light checks without extra packages: every JS file parses, no leftover debugging, every menu has a screen.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
let problems = 0;
const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
for (const f of walk('web').filter(f => f.endsWith('.js'))) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { console.error(`${f}: ${e.stderr}`); problems++; }
  const s = readFileSync(f, 'utf8');
  if (/\bdebugger\b|console\.log\(/.test(s)) { console.error(`${f}: remove debugger / console.log`); problems++; }
}
const app = readFileSync('web/js/app.js', 'utf8');
const { MENUS } = await import('../web/js/i18n.js');
for (const m of MENUS) if (!new RegExp(`\\n  ${m.id}\\(\\)`).test(app)) { console.error(`menu "${m.id}" has no screen in app.js`); problems++; }
if (MENUS.length !== 19) { console.error(`expected 19 menus, found ${MENUS.length}`); problems++; }
if (MENUS.find(m => m.n === 16)?.id !== 'integrations') { console.error('menu 16 must be Future Integrations'); problems++; }
console.log(problems ? `Lint: ${problems} problem(s)` : 'Lint: ok');
process.exit(problems ? 1 : 0);
