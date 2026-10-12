// Speech to text.
//  - Android app: Android's own speech recogniser (plugin @capacitor-community/speech-recognition). The Android
//    WebView has no Web Speech API, so this is the only way voice works inside the installed app.
//  - Browser: the Web Speech API where the browser offers it (Chrome on Android/desktop, Safari).
// Both normally send the audio to the phone maker's / Google's speech service to turn it into text.
// Estate Agent Buddy itself does not record, keep or upload audio, and listens only while the microphone is on.
import { plugin } from '../native/native';
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
  | 'language-not-supported' | 'aborted' | 'other';

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
  const n = nativeSpeech();
  if (n) return listenNative(n, lang, h, maxMs);
  const C = ctor();
  if (!C) { h.error('unsupported'); return null; }
  const r = new C();
  r.lang = lang;
  r.continuous = true;
  r.interimResults = true;
  r.maxAlternatives = 1;
  let ended = false;
  const timer = setTimeout(() => { try { r.stop(); } catch { /* already stopped */ } }, maxMs);
  r.onresult = (e: any) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      const text = res[0]?.transcript ?? '';
      if (res.isFinal) h.final(text.trim());
      else interim += text;
    }
    h.interim(interim.trim());
  };
  r.onerror = (e: any) => h.error(KNOWN.includes(e?.error) ? e.error : 'other');
  r.onend = () => { if (!ended) { ended = true; clearTimeout(timer); h.end(); } };
  try { r.start(); } catch { h.error('other'); clearTimeout(timer); return null; }
  return {
    stop: () => { try { r.stop(); } catch { /* ignore */ } },
    abort: () => { try { r.abort(); } catch { /* ignore */ } },
  };
}

/** Android app: Android's speech recogniser, with live words while speaking and the last words as the result. */
function listenNative(n: any, lang: string, h: Handlers, maxMs: number): Listening {
  let ended = false;
  let last = '';
  const subs: { remove?: () => unknown }[] = [];
  const finish = () => {
    if (ended) return;
    ended = true;
    clearTimeout(timer);
    for (const x of subs) { try { void x.remove?.(); } catch { /* ignore */ } }
    if (last) h.final(last);
    h.interim('');
    h.end();
  };
  const timer = setTimeout(() => { void Promise.resolve(n.stop()).catch(() => {}); finish(); }, maxMs);
  void (async () => {
    try {
      const avail = await n.available();
      if (!avail?.available) { h.error('unsupported'); finish(); return; }
      let perm = await n.checkPermissions();
      if (perm?.speechRecognition !== 'granted') perm = await n.requestPermissions();
      if (perm?.speechRecognition !== 'granted') { h.error('not-allowed'); finish(); return; }
      subs.push(await n.addListener('partialResults', (d: { matches?: string[] }) => { last = (d?.matches?.[0] ?? '').trim(); h.interim(last); }));
      subs.push(await n.addListener('listeningState', (d: { status?: string }) => { if (d?.status === 'stopped') setTimeout(finish, 250); }));
      await n.start({ language: lang, maxResults: 1, partialResults: true, popup: false });
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      h.error(/permission/i.test(msg) ? 'not-allowed' : /no match|no speech|didn't understand/i.test(msg) ? 'no-speech' : /network/i.test(msg) ? 'network' : 'other');
      finish();
    }
  })();
  return {
    stop: () => { void Promise.resolve(n.stop()).catch(() => {}); setTimeout(finish, 400); },
    abort: () => { last = ''; void Promise.resolve(n.stop()).catch(() => {}); finish(); },
  };
}
