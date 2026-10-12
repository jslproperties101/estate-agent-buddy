// Compiles and runs the voice tests in Node.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
mkdirSync('.test-out', { recursive: true });
await build({ entryPoints: ['tests/voice.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.test-out/voice.test.mjs', external: ['pdfjs-dist'], logLevel: 'warning' });
const r = spawnSync(process.execPath, ['--test', '.test-out/voice.test.mjs'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
