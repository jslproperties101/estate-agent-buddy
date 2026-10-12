// Compiles the logic tests with esbuild, then runs them with Node's built-in test runner.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

mkdirSync('.test-out', { recursive: true });
await build({
  entryPoints: ['tests/logic.test.ts'],
  bundle: true, platform: 'node', format: 'esm',
  outfile: '.test-out/logic.test.mjs', logLevel: 'warning',
});
const r = spawnSync(process.execPath, ['--test', '.test-out/logic.test.mjs'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
