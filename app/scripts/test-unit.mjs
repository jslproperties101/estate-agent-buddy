// Compiles every tests/*.test.ts with esbuild and runs them with Node's built-in test runner.
import { build } from 'esbuild';
import { capacitorPlugin } from './capacitor-resolve.mjs';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';

rmSync('.test-out', { recursive: true, force: true });
mkdirSync('.test-out', { recursive: true });
const entries = readdirSync('tests').filter(f => f.endsWith('.test.ts')).map(f => `tests/${f}`);
await build({ entryPoints: entries, bundle: true, platform: 'node', format: 'esm', outdir: '.test-out', outExtension: { '.js': '.mjs' }, logLevel: 'warning', define: { __EAB_CONFIG__: 'undefined', __EAB_BUILD__: 'undefined' }, plugins: [capacitorPlugin({ forceStub: true })] });
const outs = readdirSync('.test-out').filter(f => f.endsWith('.mjs')).map(f => `.test-out/${f}`);
const r = spawnSync(process.execPath, ['--test', ...outs], { stdio: 'inherit' });
process.exit(r.status ?? 1);
