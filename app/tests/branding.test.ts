// The approved logo is the one source for every place the app shows it; these checks catch a missing or wrong-sized asset.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const png = (f: string) => { const b = readFileSync(f); assert.equal(b.toString('latin1', 1, 4), 'PNG', f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), type: b[25] }; };

test('BR1 icon and splash sources have the sizes the Android generator needs', () => {
  for (const f of ['icon-only', 'icon-foreground', 'icon-background']) assert.deepEqual([png(`assets/${f}.png`).w, png(`assets/${f}.png`).h], [1024, 1024], f);
  for (const f of ['splash', 'splash-dark']) assert.deepEqual([png(`assets/${f}.png`).w, png(`assets/${f}.png`).h], [2732, 2732], f);
  assert.equal(png('assets/icon-foreground.png').type, 6, 'the adaptive foreground keeps its transparency');
});

test('BR2 the in-app logo files exist and come from the approved artwork', () => {
  assert.ok(existsSync('assets/brand/logo-source.png'), 'approved artwork kept');
  const l = png('assets/brand/logo.png');
  assert.equal(l.w, l.h);
  assert.equal(l.type, 6, 'rounded corners are transparent');
  for (const f of ['src/brand/logo-256.webp', 'src/brand/logo-512.webp']) {
    const b = readFileSync(f);
    assert.equal(b.toString('latin1', 0, 4), 'RIFF');
    assert.equal(b.toString('latin1', 8, 12), 'WEBP');
  }
});

test('BR4 the start-up screens keep the earlier splash artwork', () => {
  assert.ok(existsSync('src/brand/splash-256.webp') && existsSync('src/brand/splash-512.webp'));
  assert.ok(readFileSync('src/App.tsx', 'utf8').includes('<IconLogo size={168} big splash />'));
});

test('BR3 the app name and package are fixed in the Capacitor config (EA AI Buddy rename, 31 Oct 2026)', () => {
  const c = JSON.parse(readFileSync('capacitor.config.json', 'utf8')) as { appId: string; appName: string };
  assert.equal(c.appId, 'com.jslproperties.eaaibuddy');
  assert.equal(c.appName, 'EA AI Buddy');
});

const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');

test('BR5 Change 002a: the in-app logo (header, sign-in, first-start choice) is the owner-supplied artwork; launcher icons and splash images are unchanged', () => {
  assert.ok(existsSync('assets/brand/logo-002a-source.jpg'), 'the supplied artwork is kept as the source');
  const l = png('assets/brand/logo.png');
  assert.deepEqual([l.w, l.h, l.type], [1024, 1024, 6], 'square, transparent rounded corners');
  // Everything that was NOT the marked logo keeps its exact bytes.
  const same: [string, string][] = [
    ['assets/icon-only.png', '7afa9631123b1e7a87846d1daece5c5c9b4105e87a93a481b99aa9d9d727b489'], ['assets/icon-foreground.png', 'ed6ddc2a51a1d3ac6afa6fc0cba0498cce61c470a998fe86f256b5ee549ad7e8'], ['assets/icon-background.png', '7acb6b8432ea712928638656cb569336e0250fc29064c290b5cd156841058073'],
    // EA AI Buddy rename (31 Oct 2026): the splash artwork's first line now reads "EA" (scripts/rename-logo.py); nothing else in it changed.
    ['assets/splash.png', '851277a8b27b5725845a3bb7b7000acd4feefc2492ab0d7ca766cbf553ed3066'], ['src/brand/splash-256.webp', '58d16fb3f4ce45fd7315e9138f67c91bfba85ec72c01881f47ba20362229e812'], ['src/brand/splash-512.webp', '5830f4411eca54ea74707351ef50e71f1ea0bd297d129d39a94549ba225bf165'],
  ];
  for (const [f, want] of same) assert.equal(sha(f), want, `${f} unchanged`);
});
