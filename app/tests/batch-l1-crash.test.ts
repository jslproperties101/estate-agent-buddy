// Batch L1: crash reports (Firebase Crashlytics). In tests the app is not native, so nothing is sent; the message
// cleaning and stack reading are checked directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crashAvailable, frames, reportError, scrub, setCrashUser, startCrashReporting } from '../src/native/crash';

test('L1-1 error messages lose email addresses and phone numbers and are cut to 500 characters', () => {
  assert.equal(scrub('saving buyer ali@example.com failed'), 'saving buyer [email] failed');
  assert.equal(scrub('call +60 12-345 6789 now'), 'call [number] now');
  assert.equal(scrub('x'.repeat(900)).length, 500);
  assert.equal(scrub('TypeError: cannot read property 3 of undefined'), 'TypeError: cannot read property 3 of undefined');
});

test('L1-2 stack frames are read from Chrome-style stacks, at most 10', () => {
  const stack = ['Error: boom', '    at saveBuyer (https://localhost/assets/main.js:120:14)', '    at https://localhost/assets/main.js:88:3']
    .concat(Array.from({ length: 20 }, (_, i) => `    at f${i} (https://localhost/a.js:${i + 1}:1)`)).join('\n');
  const f = frames(stack);
  assert.equal(f.length, 10);
  assert.deepEqual(f[0], { functionName: 'saveBuyer', fileName: 'main.js', lineNumber: 120 });
  assert.equal(f[1].functionName, '(anonymous)');
  assert.deepEqual(frames(undefined), []);
});

test('L1-3 in the browser (not the Android app) crash reporting does nothing and never throws', async () => {
  assert.equal(crashAvailable(), false);
  await setCrashUser('u1');
  await reportError(new Error('boom'), 'home');
  const stop = startCrashReporting(undefined);
  stop();
});
