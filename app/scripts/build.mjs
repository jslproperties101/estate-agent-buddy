// Builds the app into dist/ with esbuild (no network needed).
// External service settings come from environment variables (or app/.env, which Git ignores), never from the code:
//   EAB_GOOGLE_MAPS_API_KEY   Google Maps Platform browser key (Maps JavaScript, Geocoding, Places (New), Routes)
//   EAB_SUPABASE_URL          Supabase project URL (optional cloud sync)
//   EAB_SUPABASE_ANON_KEY     Supabase anon (public) key
//   EAB_EXPERT_API_URL        URL of the Ask Expert AI server function (optional)
// All of them can instead be typed on the phone in Agent Profile → Settings.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { capacitorPlugin } from './capacitor-resolve.mjs';

const env = { ...process.env };
// `--no-env` (used by the tests) builds without app/.env and without EAB_* settings, so tests never use real keys.
const noEnv = process.argv.includes('--no-env');
if (noEnv) for (const k of Object.keys(env)) if (k.startsWith('EAB_')) delete env[k];
if (!noEnv && existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const config = {
  googleMapsApiKey: env.EAB_GOOGLE_MAPS_API_KEY ?? '',
  supabaseUrl: env.EAB_SUPABASE_URL ?? '',
  supabaseAnonKey: env.EAB_SUPABASE_ANON_KEY ?? '',
  expertApiUrl: env.EAB_EXPERT_API_URL ?? '',
};

// Which build this is: shown in Settings → About and compared with updates/latest.json for automatic updates.
// nativeVersion (package.json) goes up only when the Android app itself must change (new permissions or plugins).
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
let sha = (env.GITHUB_SHA ?? '').slice(0, 7);
if (!sha) { try { sha = (await import('node:child_process')).execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { sha = 'dev'; } }
// EAB_QA=1 makes the isolated QA build: its own Android package name, its own phone storage and NO automatic update check
// (so it can never download the production bundle). See docs/QA.md. Normal builds do not set it.
// Not a secret, so it is read even with --no-env (the screen tests build a QA copy).
const qa = process.env.EAB_QA === '1';
// Change 25: EAB_PUSH=1 only when the Android build has Firebase settings (google-services.json from a GitHub secret).
// Without them the app never touches the push plugin, because Google's library would stop the app at start.
// releaseLabel (package.json) is a display-only milestone name ("2.0.010" = the integrated Changes 001-010). It is never
// compared: installs and updates use the commit (sha), the semantic version and nativeVersion only.
const buildInfo = { sha, version: pkg.version, nativeVersion: pkg.nativeVersion ?? 1, builtAt: new Date().toISOString(), ...(pkg.releaseLabel ? { release: String(pkg.releaseLabel) } : {}), ...(qa ? { qa: true } : {}), ...(process.env.EAB_PUSH === '1' ? { push: true } : {}) };

// EAB_OUTDIR: another output folder (the screen tests build a QA copy beside dist/). Default dist/.
const OUT = process.env.EAB_OUTDIR || 'dist';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

await build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  format: 'esm',
  target: ['chrome110', 'safari16'],
  jsx: 'automatic',
  minify: process.env.EAB_NOMINIFY ? false : true,
  sourcemap: true,
  outdir: OUT,
  define: { 'process.env.NODE_ENV': '"production"', __EAB_CONFIG__: JSON.stringify(config), __EAB_BUILD__: JSON.stringify(buildInfo) },
  loader: { '.webp': 'dataurl' },
  plugins: [capacitorPlugin()],
  logLevel: 'info',
});

copyFileSync('index.html', `${OUT}/index.html`);
const set = Object.entries(config).filter(([, v]) => v).map(([k]) => k);
console.log(`Build finished: dist/ (configured: ${set.length ? set.join(', ') : 'none — set keys in Settings on the phone'}; Capacitor: ${capacitorPlugin.real() ? 'real' : 'browser stand-in'})`);
