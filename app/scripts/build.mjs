// Builds the app into dist/ with esbuild (no network needed).
// External service settings come from environment variables (or app/.env, which Git ignores), never from the code:
//   EAB_GOOGLE_MAPS_API_KEY   Google Maps Platform browser key (Maps JavaScript, Places (New), Geocoding, Directions/Routes)
//   EAB_SUPABASE_URL          Supabase project URL (optional cloud sync)
//   EAB_SUPABASE_ANON_KEY     Supabase anon (public) key
//   EAB_EXPERT_API_URL        URL of the Ask Expert AI server function (optional)
// All of them can instead be typed on the phone in Profile & Name Card → Settings.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';

const env = { ...process.env };
if (existsSync('.env')) {
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

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

await build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  format: 'esm',
  target: ['chrome110', 'safari16'],
  jsx: 'automatic',
  minify: true,
  sourcemap: true,
  outdir: 'dist',
  define: { 'process.env.NODE_ENV': '"production"', __EAB_CONFIG__: JSON.stringify(config) },
  logLevel: 'info',
});

copyFileSync('index.html', 'dist/index.html');
const set = Object.entries(config).filter(([, v]) => v).map(([k]) => k);
console.log(`Build finished: dist/ (configured: ${set.length ? set.join(', ') : 'none — set keys in Settings on the phone'})`);
