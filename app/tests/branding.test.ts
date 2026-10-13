// The approved logo is the one source for every place the app shows it; these checks catch a missing or wrong-sized asset.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

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

test('BR3 the app name and package are fixed in the Capacitor config', () => {
  const c = JSON.parse(readFileSync('capacitor.config.json', 'utf8')) as { appId: string; appName: string };
  assert.equal(c.appId, 'com.jslproperties.estateagentbuddy');
  assert.equal(c.appName, 'Estate Agent AI Buddy');
});
