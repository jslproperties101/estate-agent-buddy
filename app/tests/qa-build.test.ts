// Isolated QA build: its own package, its own sign-in return link, and no way to download the production bundle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

(globalThis as unknown as Record<string, unknown>).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

// The QA flag is baked in at build time (esbuild define), so compile the two modules the way the QA build does.
async function loadQa<T>(entry: string): Promise<T> {
  const out = join(resolve('.test-out'), `qa-${Math.random().toString(36).slice(2)}.mjs`);
  const mod = 'esbuild'; // named in a variable so the test bundle does not swallow it
  const { build } = (await import(mod)) as typeof import('esbuild');
  const { capacitorPlugin } = (await import(pathToFileURL(resolve('scripts/capacitor-resolve.mjs')).href)) as { capacitorPlugin: (o: { forceStub: boolean }) => import('esbuild').Plugin };
  await build({
    entryPoints: [resolve(entry)], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent',
    loader: { '.webp': 'dataurl' }, plugins: [capacitorPlugin({ forceStub: true })],
    define: { __EAB_CONFIG__: 'undefined', __EAB_BUILD__: JSON.stringify({ sha: 'abc1234', version: '2.1.0', nativeVersion: 3, builtAt: 'x', qa: true }) },
  });
  return import(out) as Promise<T>;
}

test('QA1 the QA build never asks for, downloads or offers another bundle', async () => {
  const { checkForUpdate, decide, BUILD } = await loadQa<typeof import('../src/native/updates')>('src/native/updates.ts');
  assert.equal(BUILD.qa, true);
  let calls = 0;
  const spy = (async () => { calls++; return new Response(JSON.stringify({ sha: 'ffff999', version: '9', nativeVersion: 3, bundle: 'x', apk: 'y', builtAt: 'z' })); }) as unknown as typeof fetch;
  const r = await checkForUpdate(spy);
  assert.deepEqual(r, { kind: 'none' });
  assert.equal(calls, 0, 'no request is made at all');
  // For contrast: a normal build would act on that manifest.
  assert.equal(decide({ sha: 'ffff999', version: '9', nativeVersion: 3, bundle: 'x', apk: 'y', builtAt: 'z' }, BUILD, 3, true), 'download');
});

test('QA2 the QA build uses its own package name and sign-in return link', async () => {
  const { APP_ID, AUTH_CALLBACK, IS_QA } = await loadQa<typeof import('../src/native/native')>('src/native/native.ts');
  assert.equal(IS_QA, true);
  assert.equal(APP_ID, 'com.jslproperties.estateagentbuddy.qa');
  assert.equal(AUTH_CALLBACK, 'com.jslproperties.estateagentbuddy.qa://auth-callback');
});

const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:label="@string/app_name">
        <activity android:name=".MainActivity" android:exported="true">
            <intent-filter><action android:name="android.intent.action.MAIN" /></intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <data android:scheme="@string/custom_url_scheme" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`;
function project(): string {
  const d = mkdtempSync(join(tmpdir(), 'eab-android-'));
  for (const f of ['capacitor.config.json', 'package.json']) copyFileSync(resolve(f), join(d, f));
  const main = join(d, 'android/app/src/main');
  mkdirSync(join(main, 'res/values'), { recursive: true });
  writeFileSync(join(main, 'AndroidManifest.xml'), MANIFEST);
  writeFileSync(join(main, 'res/values/strings.xml'), '<resources>\n    <string name="app_name">x</string>\n    <string name="title_activity_main">x</string>\n    <string name="package_name">com.x</string>\n    <string name="custom_url_scheme">com.x</string>\n</resources>\n');
  writeFileSync(join(main, 'res/values/styles.xml'), '<resources><style name="AppTheme.NoActionBar" parent="x"></style></resources>');
  writeFileSync(join(d, 'android/app/build.gradle'), 'android {\n    namespace "com.jslproperties.estateagentbuddy"\n    defaultConfig {\n        applicationId "com.jslproperties.estateagentbuddy"\n        versionCode 1\n        versionName "1.0"\n    }\n}\n');
  mkdirSync(join(d, 'android-config'), { recursive: true });
  // The activity exactly as `npx cap add android` generates it (Change 015 adds the system-bar handling to it).
  const pkg = join(main, 'java/com/jslproperties/estateagentbuddy');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, 'MainActivity.java'), 'package com.jslproperties.estateagentbuddy;\n\nimport com.getcapacitor.BridgeActivity;\n\npublic class MainActivity extends BridgeActivity {}\n');
  return d;
}
const setup = (dir: string, qa: boolean) => spawnSync(process.execPath, [resolve('scripts/android-setup.mjs')], { cwd: dir, env: { ...process.env, GITHUB_RUN_NUMBER: '7', EAB_QA: qa ? '1' : '' }, encoding: 'utf8' });

test('QA3 android-setup: the QA project gets another application id, name, return link and version; production is unchanged', () => {
  const prod = project();
  const rp = setup(prod, false);
  assert.equal(rp.status, 0, rp.stderr);
  const gp = readFileSync(join(prod, 'android/app/build.gradle'), 'utf8');
  assert.match(gp, /applicationId "com\.jslproperties\.estateagentbuddy"/);
  assert.match(gp, /versionName "2\.2\.0-n4"/, 'Change 011/013 added native plugins (AdMob, files, share), so the native version went up');
  const sp = readFileSync(join(prod, 'android/app/src/main/res/values/strings.xml'), 'utf8');
  assert.match(sp, /name="app_name">Estate Agent AI Buddy</);
  assert.match(sp, /name="custom_url_scheme">com\.jslproperties\.estateagentbuddy</);

  const qa = project();
  const rq = setup(qa, true);
  assert.equal(rq.status, 0, rq.stderr);
  const gq = readFileSync(join(qa, 'android/app/build.gradle'), 'utf8');
  assert.match(gq, /applicationId "com\.jslproperties\.estateagentbuddy\.qa"/);
  assert.match(gq, /namespace "com\.jslproperties\.estateagentbuddy"/, 'the code package is unchanged');
  assert.match(gq, /versionName "2\.2\.0-qa-n4"/, 'the native version stays readable by the update logic');
  const sq = readFileSync(join(qa, 'android/app/src/main/res/values/strings.xml'), 'utf8');
  assert.match(sq, /name="app_name">EAB QA</);
  assert.match(sq, /name="package_name">com\.jslproperties\.estateagentbuddy\.qa</);
  assert.match(sq, /name="custom_url_scheme">com\.jslproperties\.estateagentbuddy\.qa</);
  // the real app's permissions are the same in both
  const mq = readFileSync(join(qa, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  const mp = readFileSync(join(prod, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  const perms = (m: string) => [...m.matchAll(/uses-permission android:name="([^"]+)"/g)].map(x => x[1]).sort();
  assert.deepEqual(perms(mq), perms(mp));
  // Change 011: the AdMob app ID is in both (without it the ads SDK stops the app at start); Change 013: storage only up to Android 9.
  for (const m of [mq, mp]) {
    assert.match(m, /<meta-data android:name="com\.google\.android\.gms\.ads\.APPLICATION_ID" android:value="ca-app-pub-5995234129917229~3821658996" \/>/);
    assert.match(m, /WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29"/);
  }
  // Change 015: black system navigation area and content above the system bars, in both; the package line is kept.
  for (const dir of [qa, prod]) {
    const act = readFileSync(join(dir, 'android/app/src/main/java/com/jslproperties/estateagentbuddy/MainActivity.java'), 'utf8');
    assert.match(act, /^package com\.jslproperties\.estateagentbuddy;/);
    assert.match(act, /setNavigationBarColor\(Color\.BLACK\)/);
    assert.match(act, /setOnApplyWindowInsetsListener/);
    assert.match(act, /keepBannerOnTheEdge/, 'the AdMob banner is not lifted a second time on Android 15+');
    assert.match(act, /m\.bottomMargin = 0/);
    const st = readFileSync(join(dir, 'android/app/src/main/res/values/styles.xml'), 'utf8');
    assert.match(st, /android:navigationBarColor">@android:color\/black/);
  }
  // Running it again changes nothing (CI may run it twice).
  const before = readFileSync(join(qa, 'android/app/src/main/java/com/jslproperties/estateagentbuddy/MainActivity.java'), 'utf8');
  assert.equal(setup(qa, true).status, 0);
  assert.equal(readFileSync(join(qa, 'android/app/src/main/java/com/jslproperties/estateagentbuddy/MainActivity.java'), 'utf8'), before);
});

test('QA4 nativeVersionOf still reads the native version from the QA version name', async () => {
  const { nativeVersionOf } = await import('../src/native/updates');
  assert.equal(nativeVersionOf('2.1.0-qa-n3'), 3);
  assert.equal(nativeVersionOf('2.1.0-n3'), 3);
});
