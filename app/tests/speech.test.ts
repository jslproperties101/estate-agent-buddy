// Android speech recognition flow with a stand-in for the plugin. Android's real order of events is: recording
// starts → (live words, on some phones) → recording ends ("listeningState: stopped" / End recording) → a moment
// later the final words. These tests prove the app now waits for those final words and reports a clear error when
// none come. They do not prove the phone's own speech service works: that needs the S23 Ultra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listenNative, nativeErrorCode, VoiceError } from '../src/voice/recognizer';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function fakePlugin(opts: { partial?: string[]; finalWords?: string; finalDelay?: number; startRejects?: string; perm?: string } = {}) {
  const ls: Record<string, ((d: unknown) => void)[]> = {};
  const emit = (ev: string, d: unknown) => (ls[ev] ?? []).forEach(f => f(d));
  const calls: string[] = [];
  return {
    calls, emit,
    available: async () => ({ available: true }),
    checkPermissions: async () => ({ speechRecognition: opts.perm ?? 'granted' }),
    requestPermissions: async () => ({ speechRecognition: opts.perm ?? 'granted' }),
    addListener: async (ev: string, fn: (d: unknown) => void) => { (ls[ev] ??= []).push(fn); return { remove: () => { ls[ev] = (ls[ev] ?? []).filter(x => x !== fn); } }; },
    start: async () => {
      calls.push('start');
      if (opts.startRejects) throw new Error(opts.startRejects);
      emit('listeningState', { status: 'started' });
      for (const p of opts.partial ?? []) emit('partialResults', { matches: [p] });
    },
    stop: async () => {
      calls.push('stop');
      emit('listeningState', { status: 'stopped' });
      if (opts.finalWords !== undefined) setTimeout(() => emit('partialResults', { matches: [opts.finalWords] }), opts.finalDelay ?? 900);
    },
  };
}

function run(n: ReturnType<typeof fakePlugin>, waitMs = 3000) {
  const out = { finals: [] as string[], errors: [] as VoiceError[], interims: [] as string[], ended: false };
  const l = listenNative(n, 'en-MY', {
    interim: x => out.interims.push(x), final: x => out.finals.push(x), error: e => out.errors.push(e), end: () => { out.ended = true; },
  }, 60000, waitMs);
  return { out, l };
}

test('SR1 End recording: the final words arriving ~1 s later are shown (phone gives no live words)', async () => {
  const n = fakePlugin({ finalWords: 'Test 1 2 3', finalDelay: 1000 });
  const { out, l } = run(n);
  await sleep(50);
  l.stop();
  await sleep(400);
  assert.equal(out.ended, false, 'still waiting for the result 400 ms after End recording (the old code gave up here)');
  await sleep(1300);
  assert.deepEqual(out.finals, ['Test 1 2 3']);
  assert.deepEqual(out.errors, []);
  assert.equal(out.ended, true);
});

test('SR2 live words, then a better final result after the recording stops: the final one is used', async () => {
  const n = fakePlugin({ partial: ['test one', 'test one two'], finalWords: 'Test 1 2 3', finalDelay: 300 });
  const { out, l } = run(n);
  await sleep(50);
  assert.equal(out.interims.at(-1), 'test one two', 'live words shown while speaking');
  l.stop();
  await sleep(1200);
  assert.deepEqual(out.finals, ['Test 1 2 3']);
});

test('SR3 nothing recognised: a clear error instead of silently doing nothing', async () => {
  const n = fakePlugin({});
  const { out, l } = run(n, 600);
  await sleep(50);
  l.stop();
  await sleep(900);
  assert.deepEqual(out.finals, []);
  assert.deepEqual(out.errors, ['no-result']);
  assert.equal(out.ended, true);
});

test('SR4 Android stops by itself on silence (no button press): still waits for the final words', async () => {
  const n = fakePlugin({});
  const { out } = run(n);
  await sleep(50);
  n.emit('listeningState', { status: 'stopped' });
  await sleep(700);
  assert.equal(out.ended, false);
  n.emit('partialResults', { matches: ['Test 1 2 3'] });
  await sleep(700);
  assert.deepEqual(out.finals, ['Test 1 2 3']);
});

test('SR5 errors from Android are explained; permission refused is reported', async () => {
  assert.equal(nativeErrorCode('No match'), 'no-speech');
  assert.equal(nativeErrorCode('Network error'), 'network');
  assert.equal(nativeErrorCode('RecognitionService busy'), 'busy');
  assert.equal(nativeErrorCode('"SpeechRecognition" plugin is not implemented on android'), 'plugin-missing');
  const n = fakePlugin({ perm: 'denied' });
  const { out } = run(n);
  await sleep(50);
  assert.deepEqual(out.errors, ['not-allowed']);
  assert.equal(out.ended, true);
  const m = fakePlugin({ startRejects: 'No match' });
  const r = run(m);
  await sleep(50);
  assert.deepEqual(r.out.errors, ['no-speech']);
});
