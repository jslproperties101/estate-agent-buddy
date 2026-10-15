// Integrated release (Changes 001-010): the requested milestone "2.0.010" is a display label only. The internal version
// stays valid Semantic Versioning and higher than the last released 2.1.0, so installs and update comparisons are never
// confused (the updater compares commits and nativeVersion, android versionName uses `version`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const cmp = (a: string, b: string) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

test('V1 version is valid SemVer, never lower than 2.1.0; the release label 2.0.010 is kept separately', () => {
  assert.match(pkg.version, SEMVER);
  assert.ok(cmp(pkg.version, '2.1.0') > 0, `${pkg.version} must be above 2.1.0`);
  assert.equal(pkg.releaseLabel, '2.0.010');
  assert.doesNotMatch(pkg.releaseLabel, SEMVER, '2.0.010 is not valid SemVer (leading zero), so it must never be the version');
  const android = readFileSync(new URL('../scripts/android-setup.mjs', import.meta.url), 'utf8');
  assert.match(android, /versionName "\$\{pkg\.version\}/, 'Android versionName is built from the SemVer version, not the label');
  assert.doesNotMatch(android, /releaseLabel/);
  const updates = readFileSync(new URL('../src/native/updates.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(updates.replace(/\/\*\*[\s\S]*?\*\//g, ''), /\.release\b/, 'the updater never compares the release label');
});
