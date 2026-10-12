// Speech to text through the browser's speech service (Web Speech API), where the browser offers it.
// In Chrome on Android this normally sends the audio to Google's speech service to turn it into text.
// Property Explorer itself does not record, keep or upload audio.
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface VoiceLang { code: string; label: string; short: string }
/** Languages offered. More can be added here (for example zh-MY, ta-IN) without changing the screens. */
export const VOICE_LANGS: VoiceLang[] = [
  { code: 'en-MY', label: 'English (Malaysia)', short: 'EN' },
  { code: 'ms-MY', label: 'Bahasa Malaysia', short: 'BM' },
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
export const speechSupported = () => !!ctor();

export interface Listening { stop(): void; abort(): void }

const KNOWN: VoiceError[] = ['not-allowed', 'service-not-allowed', 'network', 'no-speech', 'audio-capture', 'language-not-supported', 'aborted'];

export function listen(lang: string, h: Handlers, maxMs = 60000): Listening | null {
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
