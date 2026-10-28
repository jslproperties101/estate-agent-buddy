// Copies web/ to dist/ and stamps the version and commit into js/build-info.js. No bundler needed.
import { cpSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
let commit = process.env.GITHUB_SHA?.slice(0, 7);
if (!commit) { try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { commit = 'local'; } }
rmSync('dist', { recursive: true, force: true });
cpSync('web', 'dist', { recursive: true });
writeFileSync('dist/js/build-info.js', `export const BUILD = ${JSON.stringify({ version: pkg.version, commit })};\n`);
console.log(`dist built: version ${pkg.version}, commit ${commit}`);
