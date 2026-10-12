// Automatic updates: which published version is installed, offered as a reload, or needs a new APK.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, nativeVersionOf, Latest, BuildInfo } from '../src/native/updates';

const cur: BuildInfo = { sha: 'aaa1111', version: '2.0.0', nativeVersion: 2, builtAt: '' };
const pub = (sha: string, nativeVersion: number): Latest => ({ sha, nativeVersion, version: '2.0.0', bundle: 'https://x/b.zip', apk: 'https://x/a.apk', builtAt: '' });

test('D1 updates: same build = nothing; newer build = download (app) or reload (web); newer native = new APK', () => {
  assert.equal(decide(null, cur, 2, true), 'none');
  assert.equal(decide(pub('aaa1111', 2), cur, 2, true), 'none');
  assert.equal(decide(pub('bbb2222', 2), cur, 2, true), 'download', 'interface update installs without a new APK');
  assert.equal(decide(pub('bbb2222', 2), cur, 2, false), 'web-reload');
  assert.equal(decide(pub('bbb2222', 3), cur, 2, true), 'apk-needed', 'never installs a bundle the APK cannot run');
  assert.equal(decide(pub('bbb2222', 2), cur, 1, true), 'apk-needed', 'APKs from before automatic updates need the new APK once');
});

test('D2 the native version comes from the APK version name', () => {
  assert.equal(nativeVersionOf('2.0.0-n2'), 2);
  assert.equal(nativeVersionOf('2.1.0-n10'), 10);
  assert.equal(nativeVersionOf('2.0.0'), 1);
  assert.equal(nativeVersionOf(undefined), 1);
});
