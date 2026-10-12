// Builds the app into dist/ with esbuild (no network needed).
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';

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
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
});

copyFileSync('index.html', 'dist/index.html');
console.log('Build finished: dist/');
