// Speech to text.
//  - Android app: Android's own speech recogniser (plugin @capacitor-community/speech-recognition). The Android
//    WebView has no Web Speech API, so this is the only way voice works inside the installed app.
//  - Browser: the Web Speech API where the browser offers it (Chrome on Android/desktop, Safari).
// Both normally send the audio to the phone maker's / Google's speech service to turn it into text.
// EA AI Buddy itself does not record, keep or upload audio, and listens only while the microphone is on.
import { plugin, pluginMissing } from '../native/native';
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface VoiceLang { code: string; label: string; short: string }
/** Languages offered for speaking. More can be added here (for example ta-IN) without changing the screens. */
export const VOICE_LANGS: VoiceLang[] = [
  { code: 'en-MY', label: 'English', short: 'EN' },
  { code: 'ms-MY', label: 'Bahasa Malaysia', short: 'BM' },
  { code: 'zh-CN', label: '中文', short: '中文' },
];

export type VoiceError =
  | 'unsupported' | 'not-allowed' | 'service-not-allowed' | 'network' | 'no-speech' | 'audio-capture'
  | 'language-not-supported' | 'aborted' | 'busy' | 'no-result' | 'plugin-missing' | 'other';

export interface Handlers {
  interim: (text: string) => void;
  final: (text: string) => void;
  error: (code: VoiceError) => void;
  end: () => void;
  /** JoyChange003 Change 55: the recogniser is really listening now (the start sound has played): the moment to speak. */
  ready?: () => void;
}

function ctor(): any {
  const w = globalThis as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}
const nativeSpeech = (): any => plugin('SpeechRecognition');
/** JoyChange003 Change 55: the app's own speech plugin (scripts/android-setup.mjs), in APKs built from this version on. */
const eabSpeech = (): EabSpeech | undefined => plugin<EabSpeech>('EabSpeech');
const eabUsable = () => !!eabSpeech() && !pluginMissing('EabSpeech');
export const speechSupported = () => !!nativeSpeech() || !!ctor();

export interface Listening { stop(): void; abort(): void }

const KNOWN: VoiceError[] = ['not-allowed', 'service-not-allowed', 'network', 'no-speech', 'audio-capture', 'language-not-supported', 'aborted'];

/** The last thing that went wrong (or right) with speech recognition in this session, for the Voice diagnostics screen. */
export const lastVoice: { error?: VoiceError; errorAt?: number; okAt?: number; engine?: 'native' | 'web' } = {};
export const resetLastVoice = () => { delete lastVoice.error; delete lastVoice.errorAt; delete lastVoice.okAt; delete lastVoice.engine; };

/** Starts listening. Wraps the real recogniser only to remember the last error / success for the diagnostics screen. */
export function listen(lang: string, h: Handlers, maxMs = 60000): Listening | null {
  const engine: 'native' | 'web' = nativeSpeech() ? 'native' : 'web';
  return listenInner(lang, {
    ...h,
    final: x => { lastVoice.okAt = Date.now(); lastVoice.engine = engine; delete lastVoice.error; h.final(x); },
    error: code => { if (code !== 'aborted') { lastVoice.error = code; lastVoice.errorAt = Date.now(); lastVoice.engine = engine; } h.error(code); },
  }, maxMs);
}

function listenInner(lang: string, h: Handlers, maxMs: number): Listening | null {
  if (eabUsable()) return listenEab(eabSpeech()!, nativeSpeech(), lang, h, maxMs);
  if (pluginMissing('SpeechRecognition')) { h.error('plugin-missing'); return null; }
  const n = nativeSpeech();
  if (n) return listenNative(n, lang, h, maxMs);
  const C = ctor();
  if (!C) { h.error('unsupported'); return null; }
  const r = new C();
  r.lang = lang;
  r.continuous = true;
  r.interimResults = true;
  r.maxAlternatives = 1;
  let ended = false, gotFinal = false, lastInterim = '', failed = false, stoppedByUser = false;
  const timer = setTimeout(() => { try { r.stop(); } catch { /* already stopped */ } }, maxMs);
  r.onresult = (e: any) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      const text = res[0]?.transcript ?? '';
      if (res.isFinal) { if (text.trim()) { gotFinal = true; h.final(text.trim()); } }
      else interim += text;
    }
    lastInterim = interim.trim();
    h.interim(lastInterim);
  };
  r.onerror = (e: any) => { failed = true; h.error(KNOWN.includes(e?.error) ? e.error : 'other'); };
  // Change 55: "Listening…" only once the microphone is really open.
  r.onaudiostart = () => { if (!ended) h.ready?.(); };
  r.onend = () => {
    if (ended) return;
    ended = true; clearTimeout(timer);
    // Some browsers end without marking the last words as final: keep what was shown instead of losing it.
    if (!gotFinal && lastInterim) { gotFinal = true; h.final(lastInterim); }
    else if (!gotFinal && !failed && stoppedByUser) h.error('no-result');
    h.interim('');
    h.end();
  };
  try { r.start(); } catch { h.error('other'); clearTimeout(timer); return null; }
  return {
    stop: () => { stoppedByUser = true; try { r.stop(); } catch { /* ignore */ } },
    abort: () => { try { r.abort(); } catch { /* ignore */ } },
  };
}

/** How long to wait, after the recording ends, for Android to deliver the recognised words. On-device recognition is
 *  usually ready in under a second; Google's online service can take a few seconds on a slow connection. */
export const RESULT_WAIT_MS = 8000;

/** Turns an Android SpeechRecognizer error text (from the plugin) into one of the app's error codes. */
export function nativeErrorCode(msg: string): VoiceError {
  if (/not implemented|unimplemented|not available on android/i.test(msg)) return 'plugin-missing';
  if (/permission/i.test(msg)) return 'not-allowed';
  if (/no match|no speech|didn'?t understand|speech timeout/i.test(msg)) return 'no-speech';
  if (/network|server/i.test(msg)) return 'network';
  if (/busy/i.test(msg)) return 'busy';
  if (/audio/i.test(msg)) return 'audio-capture';
  if (/language/i.test(msg)) return 'language-not-supported';
  return 'other';
}

/** Android app: Android's speech recogniser (plugin @capacitor-community/speech-recognition).
 *  Live words arrive as "partialResults" while speaking. When the recording ends (End recording, or Android hears
 *  silence), Android still has to turn the last sound into text: the final words arrive a moment later, as one more
 *  "partialResults" event (or as the result of start()). The previous version stopped listening 250–400 ms after the
 *  recording ended, before that result arrived, so nothing appeared on phones whose recogniser gives no live words.
 *  Now the listeners stay until the final words arrive (or RESULT_WAIT_MS passes, which shows a clear message). */
export function listenNative(n: any, lang: string, h: Handlers, maxMs: number, waitMs = RESULT_WAIT_MS): Listening {
  let ended = false;
  let stopping = false;
  let last = '';
  let settle: ReturnType<typeof setTimeout> | undefined;
  let wait: ReturnType<typeof setTimeout> | undefined;
  const subs: { remove?: () => unknown }[] = [];
  const finish = (ifEmpty?: VoiceError) => {
    if (ended) return;
    ended = true;
    clearTimeout(timer); clearTimeout(settle); clearTimeout(wait);
    for (const x of subs) { try { void x.remove?.(); } catch { /* ignore */ } }
    if (last) h.final(last);
    else if (ifEmpty) h.error(ifEmpty);
    h.interim('');
    h.end();
  };
  /** The recording has ended: wait for Android's final words. */
  const awaitResult = () => {
    if (stopping || ended) return;
    stopping = true;
    wait = setTimeout(() => finish('no-result'), waitMs);
  };
  const words = (matches?: string[]) => {
    const w = (matches?.[0] ?? '').trim();
    if (!w || ended) return;
    last = w;
    h.interim(w);
    // After the recording ended, words are the final result (a short pause catches a last, better match).
    if (stopping) { clearTimeout(settle); settle = setTimeout(() => finish(), 500); }
  };
  const timer = setTimeout(() => { void Promise.resolve(n.stop()).catch(() => {}); awaitResult(); }, maxMs);
  void (async () => {
    try {
      const avail = await n.available();
      if (!avail?.available) { h.error('unsupported'); finish(); return; }
      let perm = await n.checkPermissions();
      if (perm?.speechRecognition !== 'granted') perm = await n.requestPermissions();
      if (perm?.speechRecognition !== 'granted') { h.error('not-allowed'); finish(); return; }
      if (ended) return;
      subs.push(await n.addListener('partialResults', (d: { matches?: string[] }) => words(d?.matches)));
      subs.push(await n.addListener('listeningState', (d: { status?: string }) => { if (d?.status === 'stopped') awaitResult(); }));
      const r = await n.start({ language: lang, maxResults: 1, partialResults: true, popup: false });
      h.ready?.();
      // Some plugin versions resolve start() with the final words instead of sending an event.
      if (r?.matches?.length) { stopping = true; words(r.matches); }
    } catch (e) {
      const code = nativeErrorCode(String((e as Error)?.message ?? e));
      // "No match" after live words were shown: keep the words rather than report an error.
      if (last && (code === 'no-speech' || code === 'other')) { finish(); return; }
      h.error(code);
      finish();
    }
  })();
  return {
    stop: () => { if (ended) return; void Promise.resolve(n.stop()).catch(() => {}); awaitResult(); },
    abort: () => { last = ''; void Promise.resolve(n.stop()).catch(() => {}); finish(); },
  };
}

// ---------- JoyChange003 Change 55: the app's own speech plugin ----------
/** One event from the app's speech plugin. `session` is the number given to start(), so events of an earlier session are ignored. */
export interface EabSpeechEvent { session: number; type: 'ready' | 'speaking' | 'endOfSpeech' | 'partial' | 'final' | 'error'; text?: string; code?: number }
export interface EabSpeech {
  prepare(): Promise<void>;
  start(o: { language: string; session: number }): Promise<void>;
  stop(): Promise<void>;
  cancel(): Promise<void>;
  reset(): Promise<void>;
  addListener(event: 'speech', fn: (e: EabSpeechEvent) => void): Promise<{ remove: () => Promise<void> }>;
}
/** The community plugin's permission calls (the microphone permission is shared). */
export interface SpeechPermissions {
  checkPermissions(): Promise<{ speechRecognition?: string }>;
  requestPermissions(): Promise<{ speechRecognition?: string }>;
}

/** Android SpeechRecognizer error numbers → the app's error codes. 5 (client) and 8 (busy) mean "try again". */
export function androidErrorCode(code: number | undefined): VoiceError {
  switch (code) {
    case 1: case 2: case 4: case 11: return 'network';
    case 3: return 'audio-capture';
    case 5: case 8: case 10: return 'busy';
    case 6: case 7: return 'no-speech';
    case 9: return 'not-allowed';
    case 12: case 13: return 'language-not-supported';
    default: return 'other';
  }
}

/** How long to wait for "ready" after start before trying once more (a recogniser that never opens the microphone). */
export const READY_WAIT_MS = 3500;

/** One listener for all sessions, added once (adding it on every tap cost a round trip before listening could begin). */
const sessions = new Map<number, (e: EabSpeechEvent) => void>();
let hub: Promise<unknown> | null = null;
let sessionNo = 0;
let micGranted = false;
function ensureHub(n: EabSpeech) {
  if (!hub) hub = n.addListener('speech', e => sessions.get(e?.session)?.(e)).catch(err => { hub = null; throw err; });
  return hub;
}
/** For tests: forget the listener and the permission so a new fake plugin can be used. */
export function resetEabForTests() { hub = null; sessions.clear(); sessionNo = 0; micGranted = false; }

/** Change 55: called when the AI Assisted Command screen opens. Makes Android's recogniser and the event listener ready,
 *  so the first tap on the microphone starts listening at once. Never asks for a permission. Safe to call often. */
export async function prepareVoice(): Promise<boolean> {
  const n = eabSpeech();
  if (!n || pluginMissing('EabSpeech')) return false;
  try { await ensureHub(n); await n.prepare(); return true; } catch { return false; }
}

/** Android app with the app's own plugin: start → "ready" (speak now) → live words → final words, or a clear error.
 *  The previous session is always closed first (by the plugin); a "busy" or "client" error before listening began is
 *  retried once with a fresh recogniser; after End recording the final words are awaited (RESULT_WAIT_MS at most). */
export function listenEab(n: EabSpeech, perms: SpeechPermissions | undefined, lang: string, h: Handlers, maxMs = 60000, waitMs = RESULT_WAIT_MS, readyMs = READY_WAIT_MS): Listening {
  const id = ++sessionNo;
  let ended = false, ready = false, stopping = false, retried = false;
  let last = '';
  let wait: ReturnType<typeof setTimeout> | undefined;
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  const timer = setTimeout(() => { void n.stop().catch(() => {}); awaitResult(); }, maxMs);
  const finish = (ifEmpty?: VoiceError) => {
    if (ended) return;
    ended = true;
    clearTimeout(timer); clearTimeout(wait); clearTimeout(readyTimer);
    sessions.delete(id);
    if (last) h.final(last);
    else if (ifEmpty) h.error(ifEmpty);
    h.interim('');
    h.end();
  };
  const awaitResult = () => {
    if (stopping || ended) return;
    stopping = true;
    wait = setTimeout(() => finish('no-result'), waitMs);
  };
  const begin = async () => {
    clearTimeout(readyTimer);
    readyTimer = setTimeout(() => { if (!ready && !ended) void retry('busy'); }, readyMs);
    await n.start({ language: lang, session: id });
  };
  const retry = async (why: VoiceError) => {
    if (ended) return;
    if (retried || last) { h.error(why); finish(); return; }
    retried = true;
    clearTimeout(readyTimer);
    try { await n.reset(); } catch { /* a fresh one is made anyway */ }
    setTimeout(() => { if (!ended) begin().catch(e => { h.error(nativeErrorCode(String((e as Error)?.message ?? e))); finish(); }); }, 250);
  };
  sessions.set(id, e => {
    if (ended) return;
    switch (e.type) {
      case 'ready': ready = true; clearTimeout(readyTimer); h.ready?.(); break;
      case 'speaking': if (!ready) { ready = true; clearTimeout(readyTimer); h.ready?.(); } break;
      case 'partial': if (e.text?.trim()) { last = e.text.trim(); h.interim(last); } break;
      case 'endOfSpeech': awaitResult(); break;
      case 'final': if (e.text?.trim()) last = e.text.trim(); finish(last ? undefined : 'no-result'); break;
      case 'error': {
        const code = androidErrorCode(e.code);
        if (code === 'busy' && !ready && !last) { void retry('busy'); break; }
        if (code === 'no-speech' || (code === 'busy' && stopping)) { finish(last ? undefined : stopping ? 'no-result' : 'no-speech'); break; }
        if (last) { finish(); break; }
        h.error(code); finish();
        break;
      }
    }
  });
  void (async () => {
    try {
      await ensureHub(n);
      if (perms && !micGranted) {
        let p = await perms.checkPermissions();
        if (p?.speechRecognition !== 'granted') p = await perms.requestPermissions();
        if (p?.speechRecognition !== 'granted') { h.error('not-allowed'); finish(); return; }
        micGranted = true;
      }
      if (ended) return;
      await begin();
    } catch (e) {
      const code = nativeErrorCode(String((e as Error)?.message ?? e));
      if (code === 'busy') void retry('busy'); else { h.error(code); finish(); }
    }
  })();
  return {
    // Before the microphone opened there is nothing to wait for: close quietly.
    stop: () => { if (ended) return; if (!ready && !last) { void n.cancel().catch(() => {}); finish(); return; } void n.stop().catch(() => {}); awaitResult(); },
    abort: () => { last = ''; void n.cancel().catch(() => {}); finish(); },
  };
}
