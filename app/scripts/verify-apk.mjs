// Checks a built APK (run by the GitHub build, and usable by hand): package name, app name, the approved logo at every launcher
// density, the splash screens, and that the QA flag in the web bundle matches the variant.
// Usage: node scripts/verify-apk.mjs <apk> <expected package> <expected app name> <prod|qa>
import { execFileSync } from 'node:child_process';

const [apk, wantPkg, wantName, variant] = process.argv.slice(2);
if (!apk || !wantPkg || !wantName || !['prod', 'qa', 'pos'].includes(variant)) { console.error('Usage: verify-apk.mjs <apk> <package> <app name> <prod|qa|pos>'); process.exit(2); }
const list = execFileSync('unzip', ['-Z1', apk], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n');
const read = name => execFileSync('unzip', ['-p', apk, name], { maxBuffer: 256 * 1024 * 1024 });
const problems = [];
const need = (ok, msg) => { if (!ok) problems.push(msg); };

// Package name: the manifest is binary XML (UTF-16 or UTF-8 string pool), so look for the name in both encodings.
const manifest = read('AndroidManifest.xml');
const has = (buf, text) => buf.includes(Buffer.from(text, 'utf16le')) || buf.includes(Buffer.from(text, 'utf8'));
need(has(manifest, wantPkg), `manifest does not contain package ${wantPkg}`);
if (variant === 'prod') need(!has(manifest, `${wantPkg}.qa`), 'the production APK must not contain the QA package name');
else need(has(manifest, `${wantPkg}`) && has(manifest, 'fileprovider'), `${variant} manifest looks incomplete`);
if (variant === 'pos') need(!has(manifest, 'com.jslproperties.eaaibuddy.qa'), 'the POS APK must not use the QA package name');

// App name (resources.arsc string pool).
const arsc = read('resources.arsc');
need(has(arsc, wantName), `app name "${wantName}" not found in resources`);

// Launcher icon at every density, adaptive icon, round icon, splash.
for (const d of ['ldpi', 'mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  for (const f of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground', 'ic_launcher_background']) need(list.includes(`res/mipmap-${d}-v4/${f}.png`), `missing res/mipmap-${d}-v4/${f}.png`);
}
need(list.includes('res/mipmap-anydpi-v26/ic_launcher.xml'), 'missing adaptive icon xml');
need(list.some(n => /^res\/drawable-port-.*\/splash\.png$/.test(n)), 'missing portrait splash images');
need(list.some(n => /^res\/drawable-port-night-.*\/splash\.png$/.test(n)), 'missing dark splash images');
// PNG size of the largest launcher icon.
const png = read('res/mipmap-xxxhdpi-v4/ic_launcher.png');
need(png.readUInt32BE(16) === 192 && png.readUInt32BE(20) === 192, 'xxxhdpi launcher icon is not 192 x 192');

// Web bundle: build info (commit) and the QA flag.
const main = list.find(n => /^assets\/public\/main\.js$/.test(n));
need(!!main, 'web bundle assets/public/main.js missing');
if (main) {
  const js = read(main).toString('utf8');
  const info = /\{sha:"([0-9a-f]+)",version:"([^"]+)",nativeVersion:(\d+),builtAt:"[^"]+"(?:,release:"[^"]*")?(,qa:!0|,qa:true)?(,pos:!0|,pos:true)?\}/.exec(js);
  need(!!info, 'build info not found in the web bundle');
  if (info) {
    need(variant === 'qa' ? !!info[4] : !info[4], `web bundle QA flag does not match the ${variant} variant`);
    need(variant === 'pos' ? !!info[5] : !info[5], `web bundle POS flag does not match the ${variant} variant`);
    console.log(`bundle: commit ${info[1]} version ${info[2]} native ${info[3]}${info[4] ? ' QA' : ''}${info[5] ? ' POS' : ''}`);
  }
}
// Update setup stays off in the plugin config for every build; the QA flag switches the check off in the app itself.
const cfg = JSON.parse(read('assets/capacitor.config.json').toString('utf8'));
need(cfg.plugins?.CapacitorUpdater?.autoUpdate === false, 'CapacitorUpdater.autoUpdate must be false');

if (problems.length) { console.error(`APK check FAILED (${variant}):\n- ${problems.join('\n- ')}`); process.exit(1); }
console.log(`APK check passed (${variant}): package ${wantPkg}, app name "${wantName}", launcher icons at 6 densities, adaptive + round, splash portrait + dark.`);
