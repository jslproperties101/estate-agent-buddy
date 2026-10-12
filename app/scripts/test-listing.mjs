// Compiles and runs the Property Listing tests in Node.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
mkdirSync('.test-out', { recursive: true });
await build({ entryPoints: ['tests/listing.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.test-out/listing.test.mjs', external: ['pdfjs-dist'], logLevel: 'warning' });
const r = spawnSync(process.execPath, ['--test', '.test-out/listing.test.mjs'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
