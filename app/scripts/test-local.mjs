// Compiles and runs the local-pipeline tests in Node (pdf.js loaded from node_modules).
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
mkdirSync('.test-out', { recursive: true });
await build({ entryPoints: ['tests/local.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.test-out/local.test.mjs', external: ['pdfjs-dist'], logLevel: 'warning' });
const r = spawnSync(process.execPath, ['--test', '.test-out/local.test.mjs'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
