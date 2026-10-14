// External service configuration. Nothing secret is written in the code:
//  - at build time, scripts/build.mjs copies EAB_* environment variables (or app/.env, which Git ignores) into
//    __EAB_CONFIG__;
//  - on the phone, the same values can be typed in Profile → Settings (kept only on that phone).
// A value typed on the phone wins over the build-time value.
import type { Settings } from './data/types';

export interface BuildConfig {
  googleMapsApiKey: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  expertApiUrl: string;
}

declare const __EAB_CONFIG__: BuildConfig | undefined;

const built: BuildConfig = (typeof __EAB_CONFIG__ !== 'undefined' && __EAB_CONFIG__) || {
  googleMapsApiKey: '', supabaseUrl: '', supabaseAnonKey: '', expertApiUrl: '',
};

/** True when this app was built with its own Supabase project (so "use the built-in settings" can sign in again). */
export const builtInSupabase = (): boolean => !!(built.supabaseUrl && built.supabaseAnonKey);

export type SupabaseInputProblem = 'url' | 'pair' | null;
/**
 * Checks the Supabase URL and key typed on the phone before they are saved. Both empty is fine (the built-in values are
 * used). A typed URL must be a plain web address such as https://abcd.supabase.co — not a dashboard page, and not
 * without https. URL and key are typed together: a typed URL with the built-in key (or the other way round) never works.
 */
export function supabaseInputProblem(url: string | undefined, key: string | undefined): SupabaseInputProblem {
  const u = (url ?? '').trim();
  const k = (key ?? '').trim();
  if (!u && !k) return null;
  if (!u || !k || /\s/.test(k)) return 'pair';
  let p: URL;
  try { p = new URL(u); } catch { return 'url'; }
  const local = p.hostname === 'localhost' || p.hostname === '127.0.0.1';
  if (p.protocol !== 'https:' && !(local && p.protocol === 'http:')) return 'url';
  if (p.pathname.replace(/\/+$/, '') !== '' || p.search || p.hash || p.username || p.password) return 'url';
  return null;
}

/** Only the project's address, for showing which project the phone uses (never the key). */
export function projectHost(url: string): string {
  try { return new URL(url).host || url.slice(0, 60); } catch { return url.slice(0, 60); }
}

export interface Config extends BuildConfig { source: Record<keyof BuildConfig, 'phone' | 'build' | 'none'> }

export function config(s: Pick<Settings, 'mapsApiKey' | 'supabaseUrl' | 'supabaseAnonKey' | 'expertApiUrl'>): Config {
  const pick = (phone: string | undefined, b: string) => (phone?.trim() ? phone.trim() : b);
  const src = (phone: string | undefined, b: string) => (phone?.trim() ? 'phone' : b ? 'build' : 'none') as 'phone' | 'build' | 'none';
  return {
    googleMapsApiKey: pick(s.mapsApiKey, built.googleMapsApiKey),
    supabaseUrl: pick(s.supabaseUrl, built.supabaseUrl).replace(/\/+$/, ''),
    supabaseAnonKey: pick(s.supabaseAnonKey, built.supabaseAnonKey),
    expertApiUrl: pick(s.expertApiUrl, built.expertApiUrl),
    source: {
      googleMapsApiKey: src(s.mapsApiKey, built.googleMapsApiKey),
      supabaseUrl: src(s.supabaseUrl, built.supabaseUrl),
      supabaseAnonKey: src(s.supabaseAnonKey, built.supabaseAnonKey),
      expertApiUrl: src(s.expertApiUrl, built.expertApiUrl),
    },
  };
}
