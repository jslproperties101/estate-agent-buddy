// Voice diagnostics: finds out, as far as the phone allows, why speech recognition is not available or not working,
// and turns each finding into a message the agent can act on. The checks only READ the situation (plugin present,
// permission state, secure page, network). They cannot prove that the microphone works: only the "Test recognition"
// button (which really listens) or using Voice Command on the phone can show that.
import { isNative, platform, plugin, pluginMissing } from '../native/native';
import { lastVoice, VoiceError } from './recognizer';

export type Browser = 'chrome' | 'samsung' | 'firefox' | 'safari' | 'edge' | 'webview' | 'other';
export type Permission = 'granted' | 'denied' | 'prompt' | 'unknown';

/** What was found out about this phone / browser. Plain data, so the rules below can be tested without a phone. */
export interface VoiceProbe {
  native: boolean;
  platform: 'android' | 'ios' | 'web';
  /** Inside the installed app: the speech plugin is part of this APK. */
  pluginPresent: boolean;
  /** Inside the installed app: this APK was built without the speech plugin. */
  pluginMissing: boolean;
  /** The plugin says speech recognition is available on this phone (undefined = not asked / not applicable). */
  nativeAvailable?: boolean;
  webSpeech: boolean;
  secure: boolean;
  online?: boolean;
  micPermission: Permission;
  mediaDevices: boolean;
  browser: Browser;
  lastError?: { code: VoiceError; at: number };
  lastOkAt?: number;
}

export type Status = 'ok' | 'warn' | 'bad' | 'info';
export type CheckId = 'engine' | 'secure' | 'permission' | 'service' | 'network' | 'last';
/** `code` picks the message in voice/diagStrings.ts; `arg` is filled into it. */
export interface Check { id: CheckId; status: Status; code: string; arg?: string }
export interface Diagnosis { checks: Check[]; /** blocked: voice cannot work as things are · ready: nothing found wrong (NOT proof it works) · unsure */ verdict: 'blocked' | 'ready' | 'unsure' }

export function browserOf(ua: string): Browser {
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Firefox|FxiOS/i.test(ua)) return 'firefox';
  if (/EdgA?\//i.test(ua)) return 'edge';
  if (/; wv\)|\bwv\b/i.test(ua) || (/Android/i.test(ua) && /Version\/\d/i.test(ua) && /Chrome\//i.test(ua))) return 'webview';
  if (/CriOS|Chrome\//i.test(ua)) return 'chrome';
  if (/Safari\//i.test(ua)) return 'safari';
  return 'other';
}

export function diagnose(p: VoiceProbe): Diagnosis {
  const checks: Check[] = [];
  const usable = p.native ? p.pluginPresent && !p.pluginMissing : p.webSpeech;

  // 1. Which recogniser is there?
  if (p.native && p.pluginMissing) checks.push({ id: 'engine', status: 'bad', code: 'pluginMissing' });
  else if (p.native && p.pluginPresent) checks.push({ id: 'engine', status: 'ok', code: 'nativeOk' });
  else if (p.webSpeech) {
    checks.push(p.browser === 'samsung' ? { id: 'engine', status: 'warn', code: 'samsungBrowser' } : { id: 'engine', status: 'ok', code: 'webOk', arg: p.browser });
  } else if (p.browser === 'firefox') checks.push({ id: 'engine', status: 'bad', code: 'firefox' });
  else if (p.browser === 'webview') checks.push({ id: 'engine', status: 'bad', code: 'webview' });
  else if (p.browser === 'samsung') checks.push({ id: 'engine', status: 'bad', code: 'samsungBrowser' });
  else checks.push({ id: 'engine', status: 'bad', code: 'unsupported' });

  // 2. Browser only: the page must be https or localhost
  if (!p.native) checks.push(p.secure ? { id: 'secure', status: 'ok', code: 'secureOk' } : { id: 'secure', status: 'bad', code: 'insecure' });

  // 3. Microphone permission
  checks.push({
    id: 'permission',
    status: p.micPermission === 'granted' ? 'ok' : p.micPermission === 'denied' ? 'bad' : p.micPermission === 'prompt' ? 'warn' : 'info',
    code: `perm_${p.micPermission}${p.native ? '_app' : '_web'}`,
  });

  // 4. Native only: does Android offer a speech service?
  if (p.native && p.pluginPresent && !p.pluginMissing) {
    if (p.nativeAvailable === false) checks.push({ id: 'service', status: 'bad', code: 'serviceOff' });
    else if (p.nativeAvailable === true) checks.push({ id: 'service', status: 'ok', code: 'serviceOk' });
    else checks.push({ id: 'service', status: 'info', code: 'serviceUnknown' });
  }

  // 5. Network
  if (p.online === false) checks.push({ id: 'network', status: 'warn', code: 'offline' });
  else if (p.online === true) checks.push({ id: 'network', status: 'ok', code: 'online' });

  // 6. The last problem seen in this session
  if (p.lastError) checks.push({ id: 'last', status: 'bad', code: `err_${p.lastError.code}`, arg: p.lastError.code });
  else if (p.lastOkAt) checks.push({ id: 'last', status: 'ok', code: 'lastOk' });
  else checks.push({ id: 'last', status: 'info', code: 'lastNone' });

  const blocked = checks.some(c => c.status === 'bad' && c.id !== 'last') || !usable;
  const verdict: Diagnosis['verdict'] = blocked ? 'blocked' : checks.some(c => c.status === 'warn' || c.status === 'info') || p.lastError ? 'unsure' : 'ready';
  return { checks, verdict };
}

/** Looks at this phone / browser. Every question is asked defensively: a missing answer becomes "unknown", never an error. */
export async function probeVoice(): Promise<VoiceProbe> {
  const g = globalThis as unknown as Record<string, unknown> & { navigator?: Navigator; isSecureContext?: boolean };
  const nav = g.navigator;
  const native = isNative();
  const n = plugin('SpeechRecognition');
  const missing = pluginMissing('SpeechRecognition');
  const probe: VoiceProbe = {
    native, platform: platform(),
    pluginPresent: native && !!n && !missing, pluginMissing: native && missing,
    webSpeech: !!(g.SpeechRecognition || g.webkitSpeechRecognition),
    secure: g.isSecureContext !== false,
    online: typeof nav?.onLine === 'boolean' ? nav.onLine : undefined,
    micPermission: 'unknown',
    mediaDevices: !!nav?.mediaDevices?.getUserMedia,
    browser: browserOf(nav?.userAgent ?? ''),
    lastOkAt: lastVoice.okAt,
    ...(lastVoice.error && lastVoice.errorAt ? { lastError: { code: lastVoice.error, at: lastVoice.errorAt } } : {}),
  };
  try {
    if (probe.pluginPresent && n) {
      try { probe.nativeAvailable = !!(await n.available())?.available; } catch { /* unknown */ }
      try {
        const perm = await n.checkPermissions();
        const st = perm?.speechRecognition;
        probe.micPermission = st === 'granted' ? 'granted' : st === 'denied' ? 'denied' : st === 'prompt' || st === 'prompt-with-rationale' ? 'prompt' : 'unknown';
      } catch { /* unknown */ }
    } else if (nav && 'permissions' in nav) {
      try {
        const st = (await nav.permissions.query({ name: 'microphone' as PermissionName })).state;
        probe.micPermission = st === 'granted' ? 'granted' : st === 'denied' ? 'denied' : 'prompt';
      } catch { /* Safari / some WebViews do not allow asking */ }
    }
  } catch { /* leave as unknown */ }
  return probe;
}

/** A short text of the findings (no personal data) that the agent can copy into a message or the Easy Bug Report. */
export function reportText(p: VoiceProbe, d: Diagnosis, when = new Date()): string {
  const lines = [
    `Voice diagnostics · ${when.toISOString().slice(0, 16).replace('T', ' ')} UTC · NOT proof that the microphone works`,
    `platform: ${p.platform} · native app: ${p.native ? 'yes' : 'no'} · browser: ${p.browser}`,
    `speech plugin in this app: ${p.native ? (p.pluginMissing ? 'MISSING' : p.pluginPresent ? 'present' : 'unknown') : 'n/a (browser)'} · browser speech API: ${p.webSpeech ? 'yes' : 'no'}`,
    `service available: ${p.nativeAvailable === undefined ? 'unknown' : p.nativeAvailable ? 'yes' : 'no'} · permission: ${p.micPermission} · secure page: ${p.secure ? 'yes' : 'no'} · online: ${p.online === undefined ? 'unknown' : p.online ? 'yes' : 'no'}`,
    `last error: ${p.lastError ? p.lastError.code : 'none'} · last success this session: ${p.lastOkAt ? 'yes' : 'no'}`,
    `checks: ${d.checks.map(c => `${c.id}=${c.status}(${c.code})`).join(', ')}`,
    `verdict: ${d.verdict}`,
  ];
  return lines.join('\n');
}
