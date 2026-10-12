// Builds and runs the measurement tool (see scripts/measure-src.ts).
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
mkdirSync('.test-out', { recursive: true });
await build({ entryPoints: ['scripts/measure-src.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.test-out/measure.mjs', external: ['pdfjs-dist'], logLevel: 'warning' });
const r = spawnSync(process.execPath, ['.test-out/measure.mjs', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
