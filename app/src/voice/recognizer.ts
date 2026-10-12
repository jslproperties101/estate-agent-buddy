// Speech to text.
//  - Android app: Android's own speech recogniser (plugin @capacitor-community/speech-recognition). The Android
//    WebView has no Web Speech API, so this is the only way voice works inside the installed app.
//  - Browser: the Web Speech API where the browser offers it (Chrome on Android/desktop, Safari).
// Both normally send the audio to the phone maker's / Google's speech service to turn it into text.
// Estate Agent Buddy itself does not record, keep or upload audio, and listens only while the microphone is on.
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
}

function ctor(): any {
  const w = globalThis as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}
const nativeSpeech = (): any => plugin('SpeechRecognition');
export const speechSupported = () => !!nativeSpeech() || !!ctor();

export interface Listening { stop(): void; abort(): void }

const KNOWN: VoiceError[] = ['not-allowed', 'service-not-allowed', 'network', 'no-speech', 'audio-capture', 'language-not-supported', 'aborted'];

export function listen(lang: string, h: Handlers, maxMs = 60000): Listening | null {
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
