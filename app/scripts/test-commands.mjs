// Compiles and runs the property command tests in Node.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
mkdirSync('.test-out', { recursive: true });
await build({ entryPoints: ['tests/commands.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.test-out/commands.test.mjs', external: ['pdfjs-dist'], logLevel: 'warning', loader: { '.ts': 'ts' } });
const r = spawnSync(process.execPath, ['--test', '.test-out/commands.test.mjs'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
